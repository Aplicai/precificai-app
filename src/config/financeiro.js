/**
 * Constantes financeiras centralizadas — APP-30, APP-33.
 *
 * Mantenha valores aqui pra atualizar num lugar só (ex: salário mínimo
 * anual, sugestões de margem por segmento). Toda tela que precisa desses
 * valores importa daqui.
 */

// APP-33 — Salário mínimo nacional vigente.
// Decreto 12.342/2024 fixou em R$ 1.518,00 desde Jan/2025.
// Atualizar anualmente (geralmente em Janeiro).
export const SALARIO_MINIMO_VIGENTE = 1518;

// String formatada pra exibir em tooltips/placeholders.
export const SALARIO_MINIMO_FMT = 'R$ 1.518,00';

/**
 * APP-30 — Sugestões de margem de segurança por segmento.
 *
 * Faixas vêm de literatura de food cost + boas práticas do setor.
 * São RECOMENDAÇÕES — o usuário pode digitar qualquer valor.
 *
 * Chaves devem casar (ou conter substring) com o `segmento` salvo no
 * perfil do usuário (ver `src/screens/PerfilScreen.js:284` — campo livre).
 * O matching usa `getSugestaoMargemSeguranca()` abaixo.
 */
export const SUGESTOES_MARGEM_SEGURANCA = {
  confeitaria: { min: 5, max: 10, label: '5-10%' },
  lanchonete: { min: 5, max: 8, label: '5-8%' },
  hamburgueria: { min: 5, max: 8, label: '5-8%' },
  pizzaria: { min: 8, max: 12, label: '8-12%' },
  restaurante: { min: 5, max: 10, label: '5-10%' },
  marmitaria: { min: 5, max: 10, label: '5-10%' },
  acai: { min: 5, max: 10, label: '5-10%' },
  acaiteria: { min: 5, max: 10, label: '5-10%' },
  cafeteria: { min: 5, max: 10, label: '5-10%' },
  sorveteria: { min: 5, max: 10, label: '5-10%' },
  salgaderia: { min: 5, max: 10, label: '5-10%' },
  padaria: { min: 5, max: 10, label: '5-10%' },
  japonesa: { min: 5, max: 10, label: '5-10%' },
  food_truck: { min: 8, max: 15, label: '8-15%' },
  foodtruck: { min: 8, max: 15, label: '8-15%' },
};

export const SUGESTAO_MARGEM_SEGURANCA_FALLBACK = { min: 5, max: 10, label: '5-10%' };

/**
 * Acha a sugestão de margem de segurança pro segmento informado.
 * Faz match case-insensitive por substring (ex: "Confeitaria artesanal"
 * casa com "confeitaria").
 *
 * @param {string} segmento - texto livre que o usuário digitou no perfil
 * @returns {{min, max, label}} faixa sugerida ou fallback
 */
export function getSugestaoMargemSeguranca(segmento) {
  if (!segmento) return SUGESTAO_MARGEM_SEGURANCA_FALLBACK;
  const norm = String(segmento).toLowerCase().trim();
  for (const key of Object.keys(SUGESTOES_MARGEM_SEGURANCA)) {
    if (norm.includes(key)) return SUGESTOES_MARGEM_SEGURANCA[key];
  }
  return SUGESTAO_MARGEM_SEGURANCA_FALLBACK;
}

/**
 * APP-34 — Faixas de saúde dos custos fixos vs faturamento.
 * Cores aplicadas dinamicamente no SummaryPanel.
 */
export const FAIXAS_SAUDE_CUSTO_FIXO = {
  saudavel: { ate: 0.25, label: 'Saudável', emoji: '🟢' },
  atencao: { ate: 0.35, label: 'Atenção', emoji: '🟡' },
  critico: { ate: 999, label: 'Crítico', emoji: '🔴' },
};

/**
 * Classifica % de custos fixos em uma das 3 faixas.
 * @param {number} percentual - decimal (0.30 = 30%)
 * @returns {'saudavel'|'atencao'|'critico'}
 */
export function classificarSaudeCustoFixo(percentual) {
  const p = Number(percentual) || 0;
  if (p < FAIXAS_SAUDE_CUSTO_FIXO.saudavel.ate) return 'saudavel';
  if (p < FAIXAS_SAUDE_CUSTO_FIXO.atencao.ate) return 'atencao';
  return 'critico';
}
