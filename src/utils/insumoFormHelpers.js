/**
 * Helpers puros do formulário de Ingredientes (MateriaPrimaFormScreen) e
 * Embalagens (EmbalagemFormScreen). Sem React/RN pra poder rodar em `npm test`.
 *
 * Walkthrough 2026-09 (usuário real):
 *  - Edição mostrava "5.9" no lugar de "5,90" → formatDecimalBR / formatMoneyBR
 *  - Sugestão automática "Farinha de trigo" → "Farinha de Trigo Integral"
 *    → escolherSugestao (exato > prefixo, nunca item diferente)
 *  - Aviso de exclusão listava "1 histórico de preços" como dependência
 *    → semHistoricoPrecos
 *  - Chip "FC ?" virou "Aproveitamento NN%" → aproveitamentoPercent
 */

import { parseDecimalBR } from './calculations';

/**
 * Formata número pra input PT-BR (vírgula decimal, sem separador de milhar —
 * o input é editável e o parser aceita "1.000,50", mas "1000" é mais simples
 * de editar). `null`/`undefined`/NaN/'' → ''.
 *
 * - decimals = null (default): sem zeros à direita → 1000, 0,5, 12,25
 * - decimals = 2: sempre 2 casas → 5,90
 */
export function formatDecimalBR(value, decimals = null) {
  if (value === null || value === undefined || value === '') return '';
  const n = typeof value === 'number' ? value : parseDecimalBR(value);
  if (!Number.isFinite(n)) return '';
  if (decimals != null) return n.toFixed(decimals).replace('.', ',');
  // Máx. 4 casas (quantidades como 0,125 kg) e remove zeros à direita.
  const s = n.toFixed(4).replace(/\.?0+$/, '');
  return s.replace('.', ',');
}

/** Dinheiro no input: sempre 2 casas ("5,90"). Vazio/0 → ''. */
export function formatMoneyBR(value) {
  if (value === null || value === undefined || value === '' || value === 0) return '';
  return formatDecimalBR(value, 2);
}

/**
 * Qtd. Líquida efetiva: vazia → igual à bruta (regra do walkthrough).
 * Retorna null quando nenhuma das duas está preenchida/válida.
 */
export function liquidaEfetiva(quantidadeBruta, quantidadeLiquida) {
  const qb = parseDecimalBR(quantidadeBruta);
  const vazia = quantidadeLiquida === null || quantidadeLiquida === undefined
    || String(quantidadeLiquida).trim() === '';
  if (vazia) return Number.isFinite(qb) ? qb : null;
  const ql = parseDecimalBR(quantidadeLiquida);
  return Number.isFinite(ql) ? ql : null;
}

/** Aproveitamento (líquida/bruta × 100) inteiro. 0 se bruta inválida. */
export function aproveitamentoPercent(quantidadeBruta, quantidadeLiquida) {
  const qb = Number(quantidadeBruta);
  const ql = Number(quantidadeLiquida);
  if (!Number.isFinite(qb) || qb <= 0 || !Number.isFinite(ql) || ql < 0) return 0;
  return Math.round((ql / qb) * 100);
}

/**
 * Remove "histórico de preços" da lista de dependências exibida no aviso de
 * exclusão — o histórico é apagado junto com o item (não é "uso"). Não mexe
 * em dependenciesService (testado com os labels originais).
 */
export function semHistoricoPrecos(deps) {
  if (!deps || !Array.isArray(deps.porTabela)) return deps;
  const porTabela = deps.porTabela.filter(d => !/hist[oó]rico de pre[cç]o/i.test(String(d.label || '')));
  const total = porTabela.reduce((acc, d) => acc + (Number(d.n) || 0), 0);
  return { ...deps, porTabela, total };
}

/** Normalização igual à do dicionário (sem acento, minúsculo, só [a-z0-9 ]). */
export function normalizeNome(s) {
  if (!s) return '';
  return String(s)
    .replace(/[çÇ]/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Escolhe a sugestão do dicionário pro nome digitado.
 *
 * Ordem:
 *  1. Igualdade normalizada com nome_canonico ou um sinônimo → esse item.
 *  2. Digitado é PREFIXO (por palavra) de um nome_canonico → o mais curto
 *     (ex.: "Farinha de trigo" → "Farinha de Trigo Tipo 1", não "Integral").
 *  3. Um nome_canonico é prefixo (por palavra) do digitado → o mais longo
 *     (ex.: "Farinha de trigo integral orgânica" → "Farinha de Trigo Integral").
 *  4. Nada → null. NUNCA sugere item cujo nome diverge do que o usuário já
 *     escreveu por completo (token-matching parcial foi removido daqui).
 *
 * `entries`: lista do dicionário ({ nome_canonico, sinonimos? }).
 */
export function escolherSugestao(nomeDigitado, entries) {
  const typed = normalizeNome(nomeDigitado);
  if (!typed || !Array.isArray(entries) || entries.length === 0) return null;

  let exato = null;
  let prefixoDoCanonico = null; // typed é prefixo do canônico → mais curto
  let canonicoPrefixoDoTyped = null; // canônico é prefixo do typed → mais longo

  for (const e of entries) {
    const canon = normalizeNome(e && e.nome_canonico);
    if (!canon) continue;
    if (canon === typed) { exato = e; break; }
    const sins = Array.isArray(e.sinonimos) ? e.sinonimos : [];
    if (sins.some(s => normalizeNome(s) === typed)) { exato = e; break; }
    if (canon.startsWith(typed + ' ')) {
      if (!prefixoDoCanonico || canon.length < normalizeNome(prefixoDoCanonico.nome_canonico).length) {
        prefixoDoCanonico = e;
      }
    } else if (typed.startsWith(canon + ' ')) {
      if (!canonicoPrefixoDoTyped || canon.length > normalizeNome(canonicoPrefixoDoTyped.nome_canonico).length) {
        canonicoPrefixoDoTyped = e;
      }
    }
  }
  return exato || prefixoDoCanonico || canonicoPrefixoDoTyped || null;
}
