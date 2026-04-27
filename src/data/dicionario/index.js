/**
 * Dicionário Precificaí — entrada única.
 *
 * Re-exporta todas as listas + funções de matching usadas para auto-preencher
 * formulários sem dependência de IA em runtime.
 *
 * Sessão 28.8 — banco de regras determinístico (custo R$ 0/mês).
 */

import insumos_universais from './insumos_universais.json';
import insumos_carnes from './insumos_carnes.json';
import insumos_vegetais from './insumos_vegetais.json';
import insumos_frutas from './insumos_frutas.json';
import insumos_temperos from './insumos_temperos.json';
import insumos_confeitaria from './insumos_confeitaria.json';
import insumos_lanchonete from './insumos_lanchonete.json';
import insumos_bebidas from './insumos_bebidas.json';
import embalagens from './embalagens.json';
import preparos_templates from './preparos_templates.json';
import produtos_templates from './produtos_templates.json';

// Concat lazy só quando precisar — economiza memória inicial.
let _insumosCache = null;
export function getAllInsumos() {
  if (!_insumosCache) {
    _insumosCache = [
      ...insumos_universais,
      ...insumos_carnes,
      ...insumos_vegetais,
      ...insumos_frutas,
      ...insumos_temperos,
      ...insumos_confeitaria,
      ...insumos_lanchonete,
      ...insumos_bebidas,
    ];
  }
  return _insumosCache;
}

export function getAllEmbalagens() { return embalagens; }
export function getAllPreparosTemplates() { return preparos_templates; }
export function getAllProdutosTemplates() { return produtos_templates; }

/**
 * Normaliza string para matching:
 *  - lowercase
 *  - remove acentos
 *  - remove caracteres não-alfanuméricos
 *  - colapsa whitespace
 */
export function normalize(s) {
  if (!s) return '';
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Token-matching com score:
 *  - quebra input e entry em tokens normalizados
 *  - score = (tokens em comum) / max(tamanho input, tamanho entry tokens) * peso
 *  - bônus se a primeira palavra bater (likely é o nome principal)
 *  - exige threshold mínimo para evitar falso positivo
 */
function matchScore(inputTokens, entry) {
  const entryTokens = entry.tokens || [];
  if (entryTokens.length === 0) return 0;
  const overlap = entryTokens.filter(t => inputTokens.includes(t)).length;
  if (overlap === 0) return 0;
  // Score base: proporção de tokens da entry que bateram
  let score = overlap / entryTokens.length;
  // Bônus se token principal (primeiro da entry) bate
  if (inputTokens.includes(entryTokens[0])) score += 0.2;
  // Bônus extra se TODOS os tokens da entry bateram
  if (overlap === entryTokens.length) score += 0.3;
  return score;
}

/**
 * matchInsumo("Farinha de trigo Dona Benta tipo 1")
 *   → { nome_canonico, categoria, unidade_padrao, qtd_tipica_compra, ... }
 *   ou null se nada bater com confiança razoável.
 */
export function matchInsumo(nome, opts = {}) {
  const threshold = opts.threshold ?? 0.5;
  const inputTokens = normalize(nome).split(' ').filter(t => t.length >= 2);
  if (inputTokens.length === 0) return null;

  const insumos = getAllInsumos();
  let best = null;
  let bestScore = 0;
  for (const entry of insumos) {
    const score = matchScore(inputTokens, entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (bestScore >= threshold) {
    return { ...best, _matchScore: Number(bestScore.toFixed(2)) };
  }
  return null;
}

/** Retorna TOP-N matches (útil pra UI de "talvez você quis dizer..."). */
export function matchInsumoTopN(nome, n = 5, opts = {}) {
  const threshold = opts.threshold ?? 0.3;
  const inputTokens = normalize(nome).split(' ').filter(t => t.length >= 2);
  if (inputTokens.length === 0) return [];
  const insumos = getAllInsumos();
  const scored = insumos
    .map(e => ({ entry: e, score: matchScore(inputTokens, e) }))
    .filter(x => x.score >= threshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
  return scored.map(x => ({ ...x.entry, _matchScore: Number(x.score.toFixed(2)) }));
}

/** matchEmbalagem("caixa de pizza grande") */
export function matchEmbalagem(nome, opts = {}) {
  const threshold = opts.threshold ?? 0.5;
  const inputTokens = normalize(nome).split(' ').filter(t => t.length >= 2);
  if (inputTokens.length === 0) return null;
  let best = null;
  let bestScore = 0;
  for (const entry of embalagens) {
    const score = matchScore(inputTokens, entry);
    if (score > bestScore) {
      best = entry;
      bestScore = score;
    }
  }
  if (bestScore >= threshold) {
    return { ...best, _matchScore: Number(bestScore.toFixed(2)) };
  }
  return null;
}

/** Retorna preparos do template que combinam com query. */
export function searchPreparosTemplates(query) {
  const tokens = normalize(query).split(' ').filter(t => t.length >= 2);
  if (tokens.length === 0) return [];
  return preparos_templates
    .map(e => ({ entry: e, score: matchScore(tokens, e) }))
    .filter(x => x.score >= 0.3)
    .sort((a, b) => b.score - a.score)
    .map(x => x.entry);
}

/** Retorna produtos do template filtrados por nicho (padaria/lanchonete/...). */
export function getProdutosTemplatesByNicho(nicho) {
  if (!nicho) return produtos_templates;
  return produtos_templates.filter(p => Array.isArray(p.nichos) && p.nichos.includes(nicho));
}

export default {
  getAllInsumos,
  getAllEmbalagens,
  getAllPreparosTemplates,
  getAllProdutosTemplates,
  matchInsumo,
  matchInsumoTopN,
  matchEmbalagem,
  searchPreparosTemplates,
  getProdutosTemplatesByNicho,
  normalize,
};
