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
import { normTexto, acharReceita, validarRespostaIA, montarSugestao, nichoDoSegmento, canonizarReceita, receitaCobreNome, precoMedio } from '../utils/montarReceita';
import { RECEITAS_SUGERIDAS, INGREDIENTES_POR_NICHO, EMBALAGEM_POR_NICHO } from '../data/receitasSugeridas';
import { garantirFinanceiro } from './precoRapidoService';

const PRAZO_IA_MS = 9000;

let nomesBiblioteca = null;
/** Nomes de ingredientes da biblioteca (para casar os nomes da IA). */
function nomesConhecidos() {
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

/** Ingredientes e embalagens da conta → Map normTexto(nome) → { id, preco, un, tabela }. */
export async function carregarPrecosConta(db) {
  const mapa = new Map();
  try {
    for (const m of await linhas(db, 'SELECT id, nome, preco_por_kg, unidade_medida FROM materias_primas')) {
      const un = unCurta(m.unidade_medida);
      const k = normTexto(m.nome);
      if (k && un && !mapa.has(k)) mapa.set(k, { id: m.id, preco: Number(m.preco_por_kg) || 0, un, tabela: 'materias_primas' });
    }
    for (const e of await linhas(db, 'SELECT id, nome, preco_unitario FROM embalagens')) {
      const k = normTexto(e.nome);
      if (k && !mapa.has(k)) mapa.set(k, { id: e.id, preco: Number(e.preco_unitario) || 0, un: 'un', tabela: 'embalagens' });
    }
  } catch (_) { /* sem a conta: só preços médios */ }
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
function embalagemDoNicho(receita, nicho) {
  const doNicho = EMBALAGEM_POR_NICHO[nicho];
  if (!receita?.embalagem || !doNicho || precoMedio(receita.embalagem[0], 'un') != null) return receita;
  return { ...receita, embalagem: doNicho };
}

/**
 * Sugestão para a tela: biblioteca (se cobre o nome) > IA > biblioteca > nicho.
 * @returns {{ fonte, porcao, rende, itens, nicho }}
 */
export async function buscarSugestao({ db, nomeProduto, segmento, invocar }) {
  const nicho = nichoDoSegmento(segmento) || nichoDoSegmento(nomeProduto) || 'confeitaria';
  const precosConta = db ? await carregarPrecosConta(db) : new Map();
  let receita = acharReceita(nomeProduto, RECEITAS_SUGERIDAS);
  // Nome mais específico que a receita da biblioteca ("de carne seca" x
  // carne moída): a IA monta a certa; se falhar, fica a da biblioteca.
  if (!receita || !receitaCobreNome(nomeProduto, receita)) {
    const ia = await pedirReceitaIA(invocar, String(nomeProduto || '').trim(), nicho);
    if (ia) receita = embalagemDoNicho(ia, nicho);
  }
  const s = montarSugestao({ receita, nicho, ingredientesPorNicho: INGREDIENTES_POR_NICHO, embalagemPorNicho: EMBALAGEM_POR_NICHO, precosConta });
  return { ...s, nicho };
}

/**
 * Grava o produto com a receita montada.
 * entrada: { nome, itens: [{nome,q,un,emb,preco,contaId}], rende, gastoMes, vendaMes, cobraHoje, lucro, taxasPerc, margemSeguranca, custoReceita }
 */
export async function salvarPrecoMontado(db, entrada) {
  const nome = String(entrada?.nome || '').trim();
  const itens = (entrada?.itens || []).filter((i) => i && i.nome && Number(i.q) > 0);
  const rende = Math.max(1, Math.round(Number(entrada?.rende) || 1));
  if (!nome) throw new Error('Produto sem nome');
  if (!itens.length) throw new Error('Receita sem ingredientes');
  const calc = calcularPrecoRapido({ ...entrada, rendimento: rende });
  if (!calc.ok) throw new Error('Preço incompleto');
  const preco = Math.round(calc.preco * 100) / 100;

  await garantirFinanceiro(db, { vendaMes: parseValorBR(entrada.vendaMes), gastoMes: parseValorBR(entrada.gastoMes) });

  const criados = { materias: [], embalagens: [], produto: null };
  try {
    const ligacoes = [];
    for (const it of itens) {
      const preco1 = Number(it.preco) > 0 ? Number(it.preco) : 0;
      if (it.emb) {
        let embId = it.contaId && it.contaTabela !== 'materias_primas' ? it.contaId : null;
        if (!embId) {
          const r = await db.runAsync(
            'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
            [it.nome, '', null, 1, 'Unidades', preco1, preco1]
          );
          embId = r?.lastInsertRowId;
          if (!embId) throw new Error('Embalagem não foi salva');
          criados.embalagens.push(embId);
        }
        ligacoes.push({ tipo: 'emb', id: embId, q: Number(it.q) * rende });
        continue;
      }
      let mpId = it.contaId && it.contaTabela !== 'embalagens' ? it.contaId : null;
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
      }
      ligacoes.push({ tipo: 'mp', id: mpId, q: Number(it.q) });
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
  return { produtoId: criados.produto, preco, ingredientesNovos: criados.materias.length };
}
