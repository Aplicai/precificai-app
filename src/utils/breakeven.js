/**
 * breakeven.js — Ponto de equilíbrio e "sobra do mês" (funções puras).
 *
 * Auditoria de fórmulas 2026-09-09 (docs/AUDIT-FORMULAS-2026-09-09.md):
 *  - [B11] RelatorioSimplesScreen dividia as fixas pela margem LÍQUIDA média
 *    (que já desconta os fixos %) → PE 1,5–2,5× maior que Home/Simulador/FAQ.
 *  - [B10] Home "Sobra do mês" = faturamento − fixas ignorava CMV e variáveis
 *    e podia dizer "Receita cobre custos" ao lado de "Falta R$ …".
 *
 * Fórmula canônica (mesma de HomeScreen.js `pontoEquilibrio`, SimuladorScreen
 * e FAQ): PE = fixas / (1 − variáveis% − CMV%)  — margem de contribuição.
 */

function safe(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Ponto de equilíbrio MENSAL (faturamento mínimo pra pagar as contas).
 *
 * @param {object} p
 * @param {number} p.fixas         - Σ despesas fixas do mês (R$)
 * @param {number} p.variaveisPerc - Σ despesas variáveis (decimal, ex.: 0.115)
 * @param {number} p.cmvPerc       - CMV médio (decimal, ex.: 0.165)
 * @returns {number} PE mensal em R$; 0 quando fixas ≤ 0 ou margem de
 *   contribuição ≤ 0 (mesmo comportamento da Home: `denominador > 0 ? … : 0`).
 */
export function calcPontoEquilibrio({ fixas, variaveisPerc, cmvPerc }) {
  const f = safe(fixas);
  const denominador = 1 - safe(variaveisPerc) - safe(cmvPerc);
  if (!(f > 0) || !(denominador > 0)) return 0;
  return f / denominador;
}

/**
 * "Sobra do mês" — resultado operacional estimado.
 *
 *   com produtos: faturamento − fixas − faturamento × (variáveis% + CMV%)
 *   sem produtos: faturamento − fixas   (CMV desconhecido — só custos fixos)
 *
 * Por construção, com produtos: sobra ≥ 0  ⇔  faturamento ≥ calcPontoEquilibrio(...)
 * — o card "Sobra do mês" nunca contradiz o "Mínimo pra pagar as contas".
 *
 * @returns {{ sobra:number, soFixas:boolean }}
 */
export function calcSobraMes({ faturamento, fixas, variaveisPerc, cmvPerc, temProdutos }) {
  const fat = safe(faturamento);
  const fix = safe(fixas);
  if (!temProdutos) return { sobra: fat - fix, soFixas: true };
  return { sobra: fat - fix - fat * (safe(variaveisPerc) + safe(cmvPerc)), soFixas: false };
}
