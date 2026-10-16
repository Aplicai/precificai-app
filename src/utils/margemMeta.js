/**
 * Meta de margem — fonte única do que é "margem baixa" no app.
 *
 * Antes cada tela tinha o seu corte: 10% no card de status da Home, 20%
 * (lucro_desejado da conta) em "Margem Baixa", 15% fixo em "Carteira
 * saudável"/"Quanto sobra por venda", e a lista de Produtos mostrava 15% até
 * a configuração chegar. Agora a meta é a margem de lucro do Financeiro
 * (`configuracao.lucro_desejado`), com 15% só quando ela não foi preenchida.
 *
 * Faixas (as mesmas do semáforo da lista de Produtos):
 *   'acima'  → margem ≥ meta                     (verde)
 *   'medio'  → meta − 10 pontos ≤ margem < meta  (amarelo)
 *   'abaixo' → margem < meta − 10 pontos          (vermelho)
 * "Margem baixa" = qualquer coisa abaixo da meta ('medio' ou 'abaixo').
 *
 * Todos os percentuais são decimais (0.15 = 15%). Puro, testado em
 * `__tests__/margemMeta.test.mjs`.
 */

export const MARGEM_META_PADRAO = 0.15;
export const FAIXA_ATENCAO_MARGEM = 0.10;

function num(v) {
  if (v == null || v === '') return NaN;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

/** Meta de margem da conta: lucro_desejado válido (0 < x < 1) ou 15%. */
export function resolverMargemMeta(lucroDesejado) {
  const n = num(lucroDesejado);
  return n > 0 && n < 1 ? n : MARGEM_META_PADRAO;
}

/**
 * Margem usada para o preço sugerido de UM produto.
 *
 * `margem_lucro_produto` 0 ou vazio = "usar a margem da conta": o Kit de
 * Início, o cadastro rápido (modal) e o Preço rápido gravam 0 sem mostrar
 * campo nenhum, então 0 nunca significou "vender sem lucro". Só um valor
 * positivo digitado na ficha completa vira margem própria.
 */
export function margemDoProduto(margemProduto, lucroDesejadoConta) {
  const n = num(margemProduto);
  if (n > 0 && n < 1) return n;
  return resolverMargemMeta(lucroDesejadoConta);
}

/** Faixa da margem em relação à meta, ou null quando a margem não existe. */
export function classificarMargem(margem, meta) {
  const m = num(margem);
  if (!Number.isFinite(m)) return null;
  const alvo = resolverMargemMeta(meta);
  if (m >= alvo) return 'acima';
  if (m >= alvo - FAIXA_ATENCAO_MARGEM) return 'medio';
  return 'abaixo';
}

/** true quando a margem está abaixo da meta (a mesma regra em todas as telas). */
export function isMargemBaixa(margem, meta) {
  const c = classificarMargem(margem, meta);
  return c === 'medio' || c === 'abaixo';
}
