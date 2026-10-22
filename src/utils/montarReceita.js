/**
 * Montar a receita tocando (primeiro preço, 21/10/2026).
 * Desenho: .specs/plans/ia-monta-receita.design.md
 *
 * A pessoa diz o produto; o app sugere os ingredientes da receita inteira e
 * ela toca nos que usa. O custo aparece a cada toque. De onde vêm as
 * sugestões, nesta ordem:
 *   1. biblioteca própria (src/data/receitasSugeridas.js), pelo nome;
 *   2. IA (edge function `montar-receita`), validada por `validarRespostaIA`;
 *   3. ingredientes comuns do nicho, quando nada acima responde.
 *
 * Preço de cada ingrediente: o da conta da pessoa > preço médio da base
 * (src/data/marketPrices.js) > sem preço (a pessoa põe). A IA nunca dá preço.
 *
 * Quantidades da receita inteira em g, ml ou un; a embalagem vai 1 por porção.
 * Puro, sem React/RN (testado em __tests__/montarReceita.test.mjs).
 */
import { getMarketPriceInfo } from '../data/marketPrices';

export const UNIDADES = ['g', 'ml', 'un'];
export const MAX_QTD = { g: 20000, ml: 20000, un: 200 };
export const MAX_ITENS = 25;
export const MAX_RENDE = 1000;

/** minúscula, sem acento, espaços simples */
export function normTexto(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "frango grelhado" → "Frango grelhado" */
export function capitalizar(s) {
  const t = String(s ?? '').trim().replace(/\s+/g, ' ');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

/**
 * Receita da biblioteca cujo termo aparece no nome digitado. Vários termos
 * batendo: ganha o mais longo ("ninho com nutella" vence "ninho").
 * @returns {object|null}
 */
export function acharReceita(nomeProduto, biblioteca) {
  const t = normTexto(nomeProduto);
  if (!t || !Array.isArray(biblioteca)) return null;
  let melhor = null;
  let tam = 0;
  for (const r of biblioteca) {
    for (const termo of r?.termos || []) {
      const n = normTexto(termo);
      if (n && n.length > tam && (` ${t} `).includes(` ${n} `)) { melhor = r; tam = n.length; }
    }
  }
  if (melhor) return melhor;
  // Sem palavra inteira: aceita pedaço ("brigadeiros" contém "brigadeiro").
  for (const r of biblioteca) {
    for (const termo of r?.termos || []) {
      const n = normTexto(termo);
      if (n && n.length > tam && t.includes(n)) { melhor = r; tam = n.length; }
    }
  }
  return melhor;
}

/** Palavras do nome que não mudam a receita (ligação, tamanho, enfeite). */
const PALAVRAS_NEUTRAS = new Set(('de da do das dos com e no na em para p sabor recheio recheado recheada cobertura massa ' +
  'caseiro caseira tradicional gourmet especial simples fofinho fofinha molhadinho molhadinha artesanal fit delicioso deliciosa ' +
  'kg g gr grama gramas ml l litro litros un unidade unidades fatia fatias pedaco pedacos pote potes cento mini pequeno pequena ' +
  'medio media grande familia individual porcao porcoes marmita marmitas inteiro inteira').split(' '));
const raiz = (w) => (w.length > 3 ? w.replace(/(es|s)$/, '') : w);

/**
 * A receita da biblioteca cobre o nome digitado? Falso quando o nome traz
 * palavra que a receita não tem no nome, nos termos nem nos ingredientes
 * ("Escondidinho de carne seca" x receita de carne moída: "seca" sobra).
 * Aí vale perguntar à IA; se ela falhar, a receita da biblioteca serve.
 */
export function receitaCobreNome(nomeProduto, receita) {
  if (!receita) return false;
  const vocab = new Set();
  const juntar = (t) => normTexto(t).split(' ').forEach((w) => { if (w) vocab.add(raiz(w)); });
  juntar(receita.nome);
  (receita.termos || []).forEach(juntar);
  (receita.ingredientes || []).forEach((i) => juntar(i?.[0]));
  return normTexto(nomeProduto).split(' ').every((w) => !w || /^\d/.test(w) || PALAVRAS_NEUTRAS.has(w) || vocab.has(raiz(w)));
}

/** Segmento livre do perfil → nicho da biblioteca. null = não dá para dizer. */
const NICHO_POR_PALAVRA = [
  ['acai', 'acai_sorvete'], ['sorvet', 'acai_sorvete'], ['gelad', 'acai_sorvete'], ['picol', 'acai_sorvete'],
  ['pizz', 'pizzaria'],
  ['hamburg', 'hamburgueria'], ['burger', 'hamburgueria'], ['lanch', 'hamburgueria'], ['hot dog', 'hamburgueria'], ['cachorro', 'hamburgueria'],
  ['marmit', 'marmitas'], ['quentinha', 'marmitas'], ['restaur', 'marmitas'], ['comida', 'marmitas'], ['refei', 'marmitas'],
  ['salgad', 'salgados'], ['coxinha', 'salgados'], ['pastel', 'salgados'], ['empad', 'salgados'],
  ['padar', 'padaria'], ['panifica', 'padaria'], ['pao', 'padaria'],
  ['suco', 'bebidas'], ['cafe', 'bebidas'], ['bebida', 'bebidas'],
  ['confeit', 'confeitaria'], ['bolo', 'confeitaria'], ['doce', 'confeitaria'], ['brigadeir', 'confeitaria'], ['encomenda', 'confeitaria'], ['chocolat', 'confeitaria'],
];
export function nichoDoSegmento(segmento) {
  const t = normTexto(segmento);
  if (!t) return null;
  for (const [p, nicho] of NICHO_POR_PALAVRA) if (t.includes(p)) return nicho;
  return null;
}

/**
 * Preço médio da base por kg (g), por litro (ml) ou por unidade (un).
 * g e ml valem igual (densidade 1, boa o bastante para comida). Pedido em
 * unidade que a base não vende assim (farinha "por unidade") = null: nunca
 * o preço do pacote inteiro como se fosse por kg.
 * null = a base não conhece.
 */
export function precoMedio(nome, un) {
  try {
    const b = getMarketPriceInfo(nome);
    if (!b || !(b.valor > 0) || !(b.qty > 0)) return null;
    const porUn = un === 'un';
    if (porUn !== (b.unit === 'un')) return null;
    const v = porUn ? b.valor / b.qty : (b.valor / b.qty) * 1000;
    return Math.round(v * 100) / 100;
  } catch (_) {
    return null;
  }
}

/** Peso médio (g) de 1 unidade do que a base vende por kg ("2 cebolas"). */
const PESO_UN = {
  cebola: 150, 'cebola roxa': 150, tomate: 120, alho: 5, limao: 100, banana: 120, laranja: 200,
  cenoura: 150, batata: 200, 'batata-doce': 250, 'batata doce': 250, maca: 150, maracuja: 150,
  abobrinha: 250, pimentao: 150, morango: 15, 'morango fresco': 15, 'cheiro-verde': 100, salsinha: 100,
};

/** Custo da linha: preço por kg/L/un × quantidade (g/ml/un). Sem preço = 0. */
export function custoLinha(preco, q, un) {
  const p = Number(preco);
  const n = Number(q);
  if (!(p > 0) || !(n > 0)) return 0;
  return un === 'un' ? p * n : (p * n) / 1000;
}

/**
 * Custo da receita e da porção.
 * itens: [{ nome, q, un, preco (por kg/L/un, null = sem preço), emb (1 por porção) }]
 * @returns {{ custoReceita, custoPorcao, semPreco, itens }}
 *   custoReceita inclui a embalagem de todas as porções (emb × rende).
 */
export function custoReceita(itens, rende) {
  const r = Math.max(1, Math.round(Number(rende) || 1));
  let total = 0;
  let semPreco = 0;
  for (const it of Array.isArray(itens) ? itens : []) {
    if (!(Number(it?.preco) > 0)) { semPreco += 1; continue; }
    total += it.emb ? custoLinha(it.preco, it.q, it.un) * r : custoLinha(it.preco, it.q, it.un);
  }
  return { custoReceita: total, custoPorcao: total / r, semPreco };
}

function unidadeValida(u) {
  const t = normTexto(u);
  if (t === 'g' || t === 'gramas' || t === 'grama') return 'g';
  if (t === 'ml' || t === 'mililitros') return 'ml';
  if (t === 'un' || t === 'unidade' || t === 'unidades') return 'un';
  if (t === 'kg') return 'kg';
  if (t === 'l' || t === 'litro' || t === 'litros') return 'l';
  return null;
}

/** Linha [nome, q, un] limpa ou null. kg/l viram g/ml. */
export function limparLinha(nome, q, u) {
  const n = capitalizar(String(nome ?? '').replace(/\s*\([^)]*\)\s*/g, ' '));
  let qtd = Number(q);
  let un = unidadeValida(u);
  if (!n || n.length > 60 || !Number.isFinite(qtd) || !un) return null;
  if (un === 'kg') { qtd *= 1000; un = 'g'; }
  if (un === 'l') { qtd *= 1000; un = 'ml'; }
  if (!(qtd > 0) || qtd > MAX_QTD[un]) return null;
  return [n, Math.round(qtd * 100) / 100, un];
}

/**
 * Resposta da IA (JSON do schema da edge function) → sugestão no formato da
 * biblioteca, ou null quando não serve. Linhas ruins são descartadas; nomes
 * repetidos ficam uma vez. Precisa de ao menos 2 ingredientes válidos.
 */
export function validarRespostaIA(json, nomeProduto) {
  if (!json || typeof json !== 'object') return null;
  const vistos = new Set();
  const ingredientes = [];
  for (const i of Array.isArray(json.ingredientes) ? json.ingredientes : []) {
    const l = limparLinha(i?.nome, i?.quantidade, i?.unidade);
    if (!l) continue;
    const k = normTexto(l[0]);
    if (vistos.has(k)) continue;
    vistos.add(k);
    ingredientes.push(l);
    if (ingredientes.length >= MAX_ITENS) break;
  }
  if (ingredientes.length < 2) return null;
  const rende = Math.round(Number(json.rende));
  const singular = normTexto(json.porcao).split(' ')[0] || 'unidade';
  const porcao = /^\d/.test(singular) ? 'unidade' : singular;
  const emb = String(json.embalagem ?? '').trim();
  return {
    id: 'ia',
    nome: capitalizar(nomeProduto),
    porcao: [porcao, pluralSimples(porcao)],
    rende: rende >= 1 && rende <= MAX_RENDE ? rende : 1,
    ingredientes,
    embalagem: emb && emb.length <= 60 && !/^(nenhum|nenhuma|sem|nao)/.test(normTexto(emb)) ? [capitalizar(emb), null] : null,
  };
}

/** Nomes comuns que a IA escreve diferente da biblioteca (chave normTexto). */
const APELIDOS = {
  ovo: 'Ovos', 'ovo inteiro': 'Ovos', manteiga: 'Manteiga sem sal', leite: 'Leite integral',
  acucar: 'Açúcar refinado', 'acucar branco': 'Açúcar refinado', farinha: 'Farinha de trigo',
  oleo: 'Óleo de soja', 'oleo vegetal': 'Óleo de soja', 'fermento em po': 'Fermento químico',
  'fermento quimico em po': 'Fermento químico', 'fermento para bolo': 'Fermento químico',
  'chocolate em po': 'Chocolate em pó 50%', maizena: 'Amido de milho', 'sal refinado': 'Sal',
  mucarela: 'Mussarela', 'queijo mucarela': 'Mussarela', 'queijo mussarela': 'Mussarela',
  'creme de leite de caixinha': 'Creme de leite', 'essencia de baunilha': 'Essência de baunilha',
  requeijao: 'Requeijão cremoso', 'queijo mussarela ralado': 'Mussarela', 'mussarela ralada': 'Mussarela',
  'queijo ralado': 'Queijo parmesão', 'cheiro verde': 'Cheiro-verde', aipim: 'Mandioca', macaxeira: 'Mandioca',
};
const AGUA = /^(agua|gelo)( (filtrada|morna|quente|fria|gelada|potavel|natural|em temperatura ambiente))?$/;

/**
 * Receita da IA com os nomes da biblioteca ("Ovo" → "Ovos", "Acucar mascavo" →
 * "Açúcar mascavo"), para casar com o preço médio e com os da conta. Água e
 * gelo saem (não custam). Dois itens que viram o mesmo nome (e a mesma
 * unidade) somam.
 * conhecidos: nomes de ingredientes da biblioteca.
 */
export function canonizarReceita(receita, conhecidos) {
  if (!receita || !Array.isArray(receita.ingredientes)) return receita || null;
  const porChave = new Map();
  for (const n of conhecidos || []) { const k = normTexto(n); if (k && !porChave.has(k)) porChave.set(k, n); }
  const achar = (nome) => {
    const k = normTexto(nome);
    return porChave.get(k) || APELIDOS[k] || porChave.get(`${k}s`) || (k.endsWith('s') ? porChave.get(k.slice(0, -1)) : null) || nome;
  };
  const saida = [];
  for (const [nome, q, un] of receita.ingredientes) {
    if (AGUA.test(normTexto(nome))) continue;
    const n = achar(nome);
    const igual = saida.find((i) => i[0] === n && i[2] === un);
    if (igual) igual[1] = Math.round((igual[1] + q) * 100) / 100;
    else if (!saida.some((i) => i[0] === n)) saida.push([n, q, un]);
  }
  return { ...receita, ingredientes: saida };
}

export function pluralSimples(p) {
  const t = String(p || '');
  if (!t) return 'unidades';
  if (t.endsWith('ão')) return t.slice(0, -2) + 'ões';
  if (/[rsz]$/.test(t)) return t + 'es';
  if (t.endsWith('l')) return t.slice(0, -1) + 'is';
  if (t.endsWith('m')) return t.slice(0, -1) + 'ns';
  return t + 's';
}

/**
 * "+ Outro ingrediente": "100 g de coco ralado", "2 ovos", "1 kg farinha".
 * @returns {[nome, q, un]|null}
 */
export function lerOutro(texto) {
  const t = String(texto ?? '').trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(kg|g|gramas?|ml|l|litros?|un|unidades?)?\s+(?:de\s+|do\s+|da\s+)?(.+)$/i);
  if (!m) return null;
  const q = Number(m[1].replace(',', '.'));
  return limparLinha(m[3], q, m[2] || (/(ovo|unidade)/i.test(m[3]) ? 'un' : 'g'));
}

/**
 * Sugestão completa para a tela: receita (biblioteca ou IA) ou a lista do
 * nicho. Cada ingrediente já com o preço (conta > base > null).
 * precosConta: Map normTexto(nome) → { id, preco, un } dos ingredientes da conta.
 */
export function montarSugestao({ receita, nicho, ingredientesPorNicho, embalagemPorNicho, precosConta }) {
  const conta = precosConta instanceof Map ? precosConta : new Map();
  const base = receita || {
    id: 'nicho',
    nome: '',
    porcao: ['unidade', 'unidades'],
    rende: 10,
    ingredientes: (ingredientesPorNicho && ingredientesPorNicho[nicho]) || [],
    embalagem: (embalagemPorNicho && embalagemPorNicho[nicho]) || null,
  };
  const item = (nome, q, un, emb, precoSugerido) => {
    const c = conta.get(normTexto(nome));
    const daConta = c && c.un === un && Number(c.preco) > 0;
    const medio = emb ? (Number(precoSugerido) > 0 ? Number(precoSugerido) : precoMedio(nome, 'un')) : precoMedio(nome, un);
    return { nome, q, un, emb, preco: daConta ? Number(c.preco) : medio, contaId: daConta ? c.id : null, contaTabela: daConta ? (c.tabela || null) : null, estimado: !daConta && medio != null };
  };
  const itens = (base.ingredientes || []).map(([n, q, un]) => {
    // "2 cebolas": a base vende por kg; vira gramas pelo peso médio.
    const peso = PESO_UN[normTexto(n)];
    const daConta = conta.get(normTexto(n));
    if (un === 'un' && peso && !(daConta && daConta.un === 'un') && precoMedio(n, 'un') == null) {
      return item(n, Math.round(q * peso), 'g', false);
    }
    return item(n, q, un, false);
  });
  if (base.embalagem) itens.push(item(base.embalagem[0], 1, 'un', true, base.embalagem[1]));
  return { fonte: receita ? (receita.id === 'ia' ? 'ia' : 'biblioteca') : 'nicho', porcao: base.porcao, rende: base.rende, itens };
}
