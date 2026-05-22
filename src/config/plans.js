/**
 * plans.js — Fonte da verdade dos planos de assinatura (Fase 0).
 *
 * Espelha a matriz oficial em `.memory-bank/productContext.md`.
 * Toda a checagem de limite e de feature paga passa por aqui.
 *
 * NÃO inclui o Fluxo de Caixa + DRE: ele é beta por allowlist de e-mail
 * (mecanismo separado em useFeatureFlags), independente do plano.
 */

export const PLANS = ['free', 'pro', 'ilimitado'];

export const PLAN_LABELS = {
  free: 'Grátis',
  pro: 'Pro',
  ilimitado: 'Ilimitado',
};

// Preço mensal (R$). 0 = grátis.
export const PLAN_PRICES = {
  free: 0,
  pro: 29.9,
  ilimitado: 49.9,
};

// Preço anual via Pix (10% off vs 12x mensal). Usado no popup de upgrade.
export const PLAN_PRICES_ANNUAL = {
  free: 0,
  pro: 322.9,
  ilimitado: 538.9,
};

// Bullets de venda por plano — exibidos no UpgradeModal pra deixar claras as
// VANTAGENS sempre que a pessoa tocar num recurso fora do plano dela.
export const PLAN_BENEFITS = {
  pro: [
    'Até 30 produtos e 30 combos',
    'Módulo Delivery completo (iFood, Rappi, próprio)',
    'Lista de compras automática',
    'Relatório de insumos + Exportação de fichas em PDF',
  ],
  ilimitado: [
    'Produtos e combos ilimitados',
    'Tudo do plano Pro incluído',
    'Ranking de Produtos · Engenharia de Cardápio (Matriz BCG)',
  ],
};

// Ranking pra comparar planos (quanto maior, mais inclui).
const RANK = { free: 0, pro: 1, ilimitado: 2 };

/**
 * Limites numéricos por plano e por entidade.
 * Infinity = ilimitado. Produtos e combos contam SEPARADO.
 */
export const PLAN_LIMITS = {
  free: { produtos: 5, combos: 5 },
  pro: { produtos: 30, combos: 30 },
  ilimitado: { produtos: Infinity, combos: Infinity },
};

/**
 * Features pagas → plano MÍNIMO que as inclui.
 * Qualquer feature NÃO listada aqui é livre (todos os planos).
 *
 * Chaves usadas pelos gates nas telas/menus:
 *   - delivery          → módulo inteiro de Delivery
 *   - relatorio_insumos → aba "Insumos" dos Relatórios (a aba "Geral" é livre)
 *   - lista_compras     → Lista de Compras
 *   - export_pdf        → exportar ficha técnica em PDF (produzir/ver é livre)
 *   - ranking_bcg       → Ranking de Produtos / Matriz BCG
 */
export const FEATURE_MIN_PLAN = {
  delivery: 'pro',
  relatorio_insumos: 'pro',
  lista_compras: 'pro',
  export_pdf: 'pro',
  ranking_bcg: 'ilimitado',
};

/**
 * Features que devem vir ATIVADAS (tickadas) automaticamente quando o usuário
 * passa a ter o plano que as inclui. Mapeia feature → flag de UX existente.
 * Usado na Fase 1 (ao confirmar pagamento) e em qualquer mudança de plano.
 */
export const FEATURE_TO_UX_FLAG = {
  delivery: 'usa_delivery',
  ranking_bcg: 'modo_avancado_analise',
};

/** Plano válido? Senão cai em 'free'. */
export function normalizePlan(plano) {
  return PLANS.includes(plano) ? plano : 'free';
}

/** O plano inclui essa feature? Features fora do mapa são livres → true. */
export function planIncludesFeature(plano, featureKey) {
  const min = FEATURE_MIN_PLAN[featureKey];
  if (!min) return true;
  return RANK[normalizePlan(plano)] >= RANK[min];
}

/** Plano mínimo (label) que desbloqueia a feature — pra mensagem do popup. */
export function requiredPlanLabel(featureKey) {
  const min = FEATURE_MIN_PLAN[featureKey];
  return min ? PLAN_LABELS[min] : null;
}

/** Limite numérico do plano pra uma entidade ('produtos' | 'combos'). */
export function limitFor(plano, entity) {
  return PLAN_LIMITS[normalizePlan(plano)]?.[entity] ?? Infinity;
}

/** Pode adicionar mais um item dessa entidade dado o count atual? */
export function planAllowsCount(plano, entity, currentCount) {
  return currentCount < limitFor(plano, entity);
}

/** Próximo plano acima (pra CTA "fazer upgrade"). null se já é o topo. */
export function nextPlan(plano) {
  const i = RANK[normalizePlan(plano)];
  return i >= 2 ? null : PLANS[i + 1];
}
