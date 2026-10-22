/**
 * Montar a receita tocando (21/10/2026): busca a sugestão e grava a receita.
 * Lógica pura em src/utils/montarReceita.js; desenho em
 * .specs/plans/ia-monta-receita.design.md.
 *
 * Gravação (salvarPrecoMontado): igual ao Preço rápido (Financeiro onde está
 * vazio, produto por unidade com o preço calculado), mas no lugar do
 * ingrediente "Receita do X (custo estimado)" grava os ingredientes de
 * verdade, reaproveitando os da conta pelo nome (mesma unidade):
 *   - materias_primas em g / mL / un, quantidade 1000 (ou 1 un), valor pago =
 *     preço por kg/L/un (preco_por_kg igual);
 *   - produto_ingredientes com as quantidades da receita inteira;
 *   - a embalagem em embalagens + produto_embalagens (1 por porção = rende);
 *   - produtos.rendimento_unidades = rende (custo por unidade = total / rende).
 * Ingrediente sem preço entra com valor 0 (a pessoa completa depois).
 * Sem transação no wrapper: se algo falha, apaga o que esta gravação criou.
 */
import { calcularPrecoRapido, parseValorBR } from '../utils/precoRapido';
import { normTexto, acharReceita, validarRespostaIA, montarSugestao, nichoDoSegmento, nichoDoProduto, canonizarReceita, receitaCobreNome, precoMedio, garantirOleoFritura } from '../utils/montarReceita';
import { RECEITAS_SUGERIDAS, INGREDIENTES_POR_NICHO, EMBALAGEM_POR_NICHO, EMBALAGENS as E, PORCAO_POR_NICHO } from '../data/receitasSugeridas';
import { garantirFinanceiro } from './precoRapidoService';
import { rowsOrThrow } from '../database/dbResult';
import { converterParaBase, converterDeBase } from '../utils/calculations';

const PRAZO_IA_MS = 13000; // a edge function desiste em 11 s

// Receita da IA por nome: voltar à tela ("Ver ou mudar") não gasta outra
// consulta do dia nem troca os ingredientes sugeridos.
const cacheIA = new Map();
/** Para testes. */
export function limparCacheIA() { cacheIA.clear(); }

let nomesBiblioteca = null;
/** Nomes de ingredientes da biblioteca (para casar os nomes da IA). */
export function nomesConhecidos() {
  if (!nomesBiblioteca) {
    const s = new Set();
    for (const r of RECEITAS_SUGERIDAS) for (const [n] of r.ingredientes || []) s.add(n);
    for (const l of Object.values(INGREDIENTES_POR_NICHO)) for (const [n] of l) s.add(n);
    nomesBiblioteca = [...s];
  }
  return nomesBiblioteca;
}

async function linhas(db, sql, args) {
  const r = args ? await db.getAllAsync(sql, args) : await db.getAllAsync(sql);
  return Array.isArray(r) ? r : [];
}

function unCurta(u) {
  const t = String(u || '').toLowerCase();
  if (t === 'g' || t === 'kg' || t.startsWith('grama') || t.startsWith('quilo')) return 'g';
  if (t === 'ml' || t === 'l' || t.startsWith('mililit') || t.startsWith('litro')) return 'ml';
  if (t === 'un' || t.startsWith('unid')) return 'un';
  return null;
}

/**
 * Ingredientes e embalagens da conta → Map normTexto(nome) → { id, preco, un, tabela, unRaw, qtd }.
 * un: g/ml/un (para comparar com a receita); unRaw: a unidade gravada (kg, L,
 * g...), que decide em que unidade vai a quantidade da ligação.
 * Nome repetido: fica o que tem preço. estrito: erro de leitura lança (ao
 * salvar, "conta vazia" por engano duplicaria ingredientes).
 */
export async function carregarPrecosConta(db, { estrito = false } = {}) {
  const mapa = new Map();
  const ler = async (sql) => {
    const r = await db.getAllAsync(sql);
    return estrito ? rowsOrThrow(r) : (Array.isArray(r) ? r : []);
  };
  const por = (k, v) => { const atual = mapa.get(k); if (k && (!atual || (!(atual.preco > 0) && v.preco > 0))) mapa.set(k, v); };
  try {
    for (const m of await ler('SELECT id, nome, preco_por_kg, unidade_medida, quantidade_bruta FROM materias_primas')) {
      const un = unCurta(m.unidade_medida);
      if (un) por(normTexto(m.nome), { id: m.id, preco: Number(m.preco_por_kg) || 0, un, tabela: 'materias_primas', unRaw: m.unidade_medida || un, qtd: Number(m.quantidade_bruta) || 0 });
    }
    for (const e of await ler('SELECT id, nome, preco_unitario, quantidade FROM embalagens')) {
      por(normTexto(e.nome), { id: e.id, preco: Number(e.preco_unitario) || 0, un: 'un', tabela: 'embalagens', unRaw: 'un', qtd: Number(e.quantidade) || 0 });
    }
  } catch (e) {
    if (estrito) throw e;
    /* sem a conta: só preços médios */
  }
  return mapa;
}

/** Chama a edge function com prazo. null = qualquer falha (o app segue com o nicho). */
export async function pedirReceitaIA(invocar, produto, nicho) {
  if (typeof invocar !== 'function') return null;
  let prazo;
  try {
    const r = await Promise.race([
      invocar('montar-receita', { body: { produto, nicho: nicho || undefined } }),
      new Promise((ok) => { prazo = setTimeout(() => ok(null), PRAZO_IA_MS); }),
    ]);
    if (!r || r.error || !r.data?.ok) return null;
    return canonizarReceita(validarRespostaIA(r.data.receita, produto), nomesConhecidos());
  } catch (_) {
    return null;
  } finally {
    clearTimeout(prazo);
  }
}

/**
 * Embalagem que a IA disse sem preço na base ("Marmita de aluminio com
 * tampa"): usa a do ramo, que já tem preço médio. Sem embalagem do ramo,
 * fica a da IA (a pessoa põe o preço).
 */
let embalagensBiblioteca = null;
function embalagemConhecida(nome) {
  if (!embalagensBiblioteca) {
    embalagensBiblioteca = new Map();
    const por = (e) => { if (Array.isArray(e) && e[0] && Number(e[1]) > 0 && !embalagensBiblioteca.has(normTexto(e[0]))) embalagensBiblioteca.set(normTexto(e[0]), e); };
    Object.values(EMBALAGEM_POR_NICHO).forEach(por);
    RECEITAS_SUGERIDAS.forEach((r) => por(r.embalagem));
  }
  return embalagensBiblioteca.get(normTexto(nome)) || null;
}

const DOCINHO = /\b(brigadeiros?|beijinhos?|trufas?|bombons?|bombom|docinhos?|casadinhos?|cajuzinhos?|camafeus?|olho de sogra|bicho de pe|macarons?)\b/;

/**
 * Embalagem da receita da IA, nesta ordem: a que a IA disse, se a base ou a
 * biblioteca conhece; pela palavra que ela usou ("forminha", "celofane",
 * "acetato"...); pela porção (fatia, pote, copo, cento...); docinho vai em
 * forminha. Nada disso: fica o nome da IA sem preço (a pessoa põe), nunca o
 * pote do ramo para tudo.
 */
function embalagemDoNicho(receita, ramo, nomeProduto = '', daBiblioteca = null) {
  if (!receita) return receita;
  const e = receita.embalagem?.[0] || '';
  if (e && precoMedio(e, 'un') != null) return receita;
  const conhecida = e ? embalagemConhecida(e) : null;
  if (conhecida) return { ...receita, embalagem: conhecida };
  const k = normTexto(e);
  const porc = normTexto(receita.porcao?.[0]);
  const prod = normTexto(nomeProduto);
  const fino = /\b(gourmet|fino|finos|fina|finas|casamento)\b/.test(prod);
  const forminha = fino ? E.FORMINHA_GOURMET : E.FORMINHA_5;
  const pizza = () => (/\b(broto|brotinho|pequena|individual)\b/.test(prod) ? E.CAIXA_PIZZA_25 : E.CAIXA_PIZZA);
  const porPalavra = [
    [/empad|forma de aluminio|forminha de aluminio/, () => E.FORMINHA_EMPADA],
    [/forminha|papel chumbo/, () => forminha],
    [/congelad/, () => E.SACO_CONGELADOS],
    [/hot ?dog|cachorro/, () => E.HOT_DOG],
    [/hamburg|\blanche/, () => E.CAIXA_HAMBURGUER],
    [/frit|batata|\bporcao\b/, () => E.BATATA],
    [/picol/, () => E.PICOLE],
    [/geladinho|sacole|chup/, () => E.GELADINHO],
    [/temaki|\bcone\b/, () => ['Cone para temaki', 0.25]],
    [/sushi|\bbarca\b/, () => ['Barca para sushi', 3.00]],
    [/sopa|caldo|termic/, () => ['Pote térmico 500 ml', 0.80]],
    [/pizza/, () => (ramo === 'pizzaria' || /^pizza/.test(porc) ? pizza() : null)],
    [/\b(1|2) ?l\b|litro/, () => E.POTE_SORVETE],
    [/espresso|expresso|80 ?ml|copo pequeno|cafezinho/, () => E.COPO_PEQUENO],
    [/copo|\btaca\b/, () => (ramo === 'acai_sorvete' ? E.COPO_ACAI : E.COPO)],
    [/celofane|saquinho|\bsaco\b|sacola/, () => (ramo === 'salgados' ? E.SAQUINHO_SALGADO : ramo === 'padaria' ? E.SACO_PAO : E.SAQUINHO_DOCE)],
    [/marmit|quentinha/, () => E.MARMITEX],
    [/\bpote\b/, () => E.POTE_250],
    [/fatia|acetato/, () => E.EMB_FATIA],
    [/caixa.*bolo|disco/, () => E.CAIXA_BOLO],
    [/sanduiche/, () => E.SANDUICHE],
  ];
  const porPorcao = [
    [/^(cento|centos)$/, () => (ramo === 'salgados' ? E.CAIXA_CENTO : fino ? E.FORMINHAS_GOURMET_CENTO : E.FORMINHAS_CENTO)],
    [/^pacote/, () => E.SACO_CONGELADOS],
    [/^fatia/, () => E.EMB_FATIA],
    [/^pote/, () => E.POTE_250],
    [/^(copo|taca|dose)/, () => (ramo === 'acai_sorvete' ? E.COPO_ACAI : E.COPO)],
    [/^(marmita|quentinha|prato)/, () => E.MARMITEX],
    [/^pizza/, () => pizza()],
    [/^porcao/, () => (ramo === 'petiscos' ? E.BANDEJA : null)],
  ];
  // Sopa e caldo: pote térmico, mesmo que a IA diga só "pote".
  if (/\b(sopa|caldo|canja)\b/.test(prod) && (!k || /pote|copo|marmit/.test(k))) return { ...receita, embalagem: ['Pote térmico 500 ml', 0.80] };
  for (const [re, f] of porPalavra) if (k && re.test(k)) { const x = f(); if (x) return { ...receita, embalagem: x }; }
  for (const [re, f] of porPorcao) if (re.test(porc)) { const x = f(); if (x) return { ...receita, embalagem: x }; }
  // A receita parecida da biblioteca, do mesmo ramo, sabe a embalagem certa
  // (cachorro-quente prensado → embalagem de cachorro-quente).
  if (daBiblioteca?.embalagem && daBiblioteca.nicho === ramo) return { ...receita, embalagem: daBiblioteca.embalagem };
  if (/^(lanche|hamburguer|sanduiche)/.test(porc)) return { ...receita, embalagem: E.CAIXA_HAMBURGUER };
  if (ramo === 'confeitaria' && DOCINHO.test(prod)) return { ...receita, embalagem: forminha };
  return receita; // a da IA, sem preço (ou nenhuma)
}

/**
 * Sugestão para a tela: biblioteca (se cobre o nome) > IA > biblioteca > nicho.
 * @returns {{ fonte, porcao, rende, itens, nicho }}
 */
export async function buscarSugestao({ db, nomeProduto, segmento, invocar }) {
  // O produto diz mais que o perfil: coxinha numa confeitaria é salgado.
  // Ramo de verdade (ou null): só ele vai para a IA e escolhe a embalagem.
  const ramo = nichoDoProduto(nomeProduto) || nichoDoSegmento(segmento) || nichoDoSegmento(nomeProduto);
  const nicho = ramo || 'geral'; // lista de reserva quando nada responde (sem ramo: itens básicos)
  const precosConta = db ? await carregarPrecosConta(db) : new Map();
  let receita = acharReceita(nomeProduto, RECEITAS_SUGERIDAS, nichoDoProduto(nomeProduto));
  let parecida = false;
  // Nome mais específico que a receita da biblioteca ("de carne seca" x
  // carne moída): a IA monta a certa; se falhar, fica a da biblioteca.
  if ((!receita || !receitaCobreNome(nomeProduto, receita)) && normTexto(nomeProduto).replace(/[^a-z]/g, '').length >= 2) {
    const chave = `${normTexto(nomeProduto)}|${ramo || ''}`;
    let ia = cacheIA.get(chave) || null;
    if (!ia) {
      ia = await pedirReceitaIA(invocar, String(nomeProduto || '').trim().slice(0, 80), ramo);
      if (ia) cacheIA.set(chave, ia);
    }
    if (ia) receita = embalagemDoNicho(garantirOleoFritura(ia, nomeProduto), ramo, nomeProduto, receita);
    // A IA falhou: a receita parecida da biblioteca só serve se for do mesmo
    // ramo ("Paleta suína" não pode virar picolé); senão, a lista do ramo.
    else if (receita && (!receita.nicho || receita.nicho === nicho)) parecida = true;
    else receita = null;
  }
  const s = montarSugestao({ receita, nicho, ingredientesPorNicho: INGREDIENTES_POR_NICHO, embalagemPorNicho: EMBALAGEM_POR_NICHO, porcaoPorNicho: PORCAO_POR_NICHO, precosConta });
  return { ...s, nicho, parecida: parecida ? receita.nome : null, conta: precosConta };
}

/**
 * Grava o produto com a receita montada.
 * entrada: { nome, itens: [{nome,q,un,emb,preco,contaId}], rende, gastoMes, vendaMes, cobraHoje, lucro, taxasPerc, margemSeguranca, custoReceita }
 */
export async function salvarPrecoMontado(db, entrada) {
  const nome = String(entrada?.nome || '').trim();
  const itens = (entrada?.itens || []).filter((i) => i && i.nome && Number(i.q) > 0);
  const rende = Math.min(1000, Math.max(1, Math.round(Number(entrada?.rende) || 1)));
  if (!nome) throw new Error('Produto sem nome');
  if (!itens.length) throw new Error('Receita sem ingredientes');
  const calc = calcularPrecoRapido({ ...entrada, rendimento: rende });
  if (!calc.ok) throw new Error('Preço incompleto');
  const preco = Math.round(calc.preco * 100) / 100;

  await garantirFinanceiro(db, { vendaMes: parseValorBR(entrada.vendaMes), gastoMes: parseValorBR(entrada.gastoMes) });

  // Conta lida de verdade (erro de leitura não vira "conta vazia").
  const conta = await carregarPrecosConta(db, { estrito: true });
  const porId = new Map([...conta.values()].map((c) => [`${c.tabela}:${c.id}`, c]));
  // Item da conta: pelo id que veio da tela ou, posto à mão ("+ Outro"), pelo
  // nome (mesma unidade). Nunca duplica.
  const daConta = (it, tabela) => {
    if (it.contaId && (it.contaTabela || tabela) === tabela) return porId.get(`${tabela}:${it.contaId}`) || { id: it.contaId, tabela, un: it.un, unRaw: it.un, preco: Number(it.preco) || 0, qtd: 0 };
    if (it.contaId) return null;
    const c = conta.get(normTexto(it.nome));
    return c && c.tabela === tabela && (tabela === 'embalagens' || c.un === it.un) ? c : null;
  };
  // Preço que a pessoa viu (médio onde a conta não tinha, ou o que ela
  // mudou na tela): grava no item da conta, senão o produto sai com outro
  // custo. Só depois do produto salvo.
  const precosParaGravar = [];
  // Item ligado pela tela (contaId): o preço da tela é o da pessoa e vale.
  // Ligado só pelo nome: preenche apenas se a conta estava sem preço (nunca
  // troca o preço real dela pelo médio do mercado).
  const anotarPreco = (c, preco1, daTela) => {
    if (!c || !(preco1 > 0) || Math.abs((Number(c.preco) || 0) - preco1) < 0.005) return;
    if (!daTela && Number(c.preco) > 0) return;
    precosParaGravar.push({ c, preco1 });
  };
  const gravarPreco = async ({ c, preco1 }) => {
    if (c.tabela === 'embalagens') {
      const qtd = c.qtd > 0 ? c.qtd : 1;
      await db.runAsync('UPDATE embalagens SET preco_embalagem = ?, preco_unitario = ? WHERE id = ?', [Math.round(preco1 * qtd * 100) / 100, preco1, c.id]);
      return;
    }
    // preco_por_kg é por kg / L / un; valor_pago é o que se pagou por quantidade_bruta (na unidade gravada).
    const base = c.un === 'un' ? (c.qtd > 0 ? c.qtd : 1) : converterParaBase(c.qtd > 0 ? c.qtd : converterDeBase(1000, c.unRaw), c.unRaw);
    const valor = c.un === 'un' ? preco1 * base : (preco1 * base) / 1000;
    await db.runAsync('UPDATE materias_primas SET valor_pago = ?, preco_por_kg = ? WHERE id = ?', [Math.round(valor * 100) / 100, preco1, c.id]);
  };

  const criados = { materias: [], embalagens: [], produto: null };
  const criadosPorNome = new Map();
  try {
    const ligacoes = [];
    for (const it of itens) {
      const preco1 = Number(it.preco) > 0 ? Number(it.preco) : 0;
      if (it.emb) {
        const cEmb = daConta(it, 'embalagens');
        let embId = cEmb?.id || criadosPorNome.get(`e:${normTexto(it.nome)}`) || null;
        anotarPreco(cEmb, preco1, !!it.contaId);
        if (!embId) {
          const r = await db.runAsync(
            'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
            [it.nome, '', null, 1, 'Unidades', preco1, preco1]
          );
          embId = r?.lastInsertRowId;
          if (!embId) throw new Error('Embalagem não foi salva');
          criados.embalagens.push(embId);
          criadosPorNome.set(`e:${normTexto(it.nome)}`, embId);
        }
        ligacoes.push({ tipo: 'emb', id: embId, q: Number(it.q) * rende });
        continue;
      }
      const cMp = daConta(it, 'materias_primas');
      const chave = `m:${normTexto(it.nome)}:${it.un}`;
      let mpId = cMp?.id || criadosPorNome.get(chave) || null;
      anotarPreco(cMp, preco1, !!it.contaId);
      if (!mpId) {
        const unidade = it.un === 'ml' ? 'mL' : it.un;
        const qtd = it.un === 'un' ? 1 : 1000;
        const r = await db.runAsync(
          'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
          [it.nome, '', null, qtd, qtd, 1, unidade, preco1, preco1]
        );
        mpId = r?.lastInsertRowId;
        if (!mpId) throw new Error('Ingrediente não foi salvo');
        criados.materias.push(mpId);
        criadosPorNome.set(chave, mpId);
      }
      // A ligação guarda a quantidade na unidade do ingrediente (kg, L, g...):
      // 360 g de uma farinha cadastrada em kg = 0,36.
      const q = cMp && cMp.un !== 'un' ? converterDeBase(Number(it.q), cMp.unRaw) : Number(it.q);
      ligacoes.push({ tipo: 'mp', id: mpId, q: Math.round(q * 100000) / 100000 });
    }

    const pr = await db.runAsync(
      `INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades,
       tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado,
       temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente,
       modo_preparo, observacoes, embalagem_delivery_id, embalagem_delivery_quantidade, embalagens_delivery) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [nome, null, 1, 'por_unidade', rende, 0, preco, 0, 0, 0, 0, 0, 0, 0, 0, '', '', null, null, null]
    );
    criados.produto = pr?.lastInsertRowId;
    if (!criados.produto) throw new Error('Produto não foi salvo');

    for (const l of ligacoes) {
      if (l.tipo === 'mp') {
        await db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)', [criados.produto, l.id, l.q]);
      } else {
        await db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)', [criados.produto, l.id, l.q]);
      }
    }
  } catch (e) {
    if (criados.produto) { try { await db.runAsync('DELETE FROM produtos WHERE id = ?', [criados.produto]); } catch (_) {} }
    for (const id of criados.materias) { try { await db.runAsync('DELETE FROM materias_primas WHERE id = ?', [id]); } catch (_) {} }
    for (const id of criados.embalagens) { try { await db.runAsync('DELETE FROM embalagens WHERE id = ?', [id]); } catch (_) {} }
    throw e;
  }
  // Produto salvo: agora sim os preços dos itens da conta.
  for (const p of precosParaGravar) { try { await gravarPreco(p); } catch (_) { /* produto já salvo; o preço a pessoa ajusta depois */ } }
  return { produtoId: criados.produto, preco, ingredientesNovos: criados.materias.length };
}
