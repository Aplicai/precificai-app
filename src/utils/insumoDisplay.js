/**
 * insumoDisplay — Sessão 28.42
 *
 * Utilitários de formatação de NOME de insumo/embalagem pra exibição.
 * Centraliza a regra "marca == sentinel do kit → tratar como SEM marca"
 * (caso contrário "(__VALOR_ESTIMADO_KIT__)" vaza pro UI).
 */

export const MARCA_VALOR_ESTIMADO = '__VALOR_ESTIMADO_KIT__';

/** True se a marca é o sentinel interno do kit rápido (não real). */
export function isMarcaEstimada(marca) {
  return marca === MARCA_VALOR_ESTIMADO;
}

/**
 * Retorna o nome formatado pra exibição. Se a marca é real, formata
 * "Nome (Marca)". Se for o sentinel ou vazia, retorna só o nome.
 */
export function formatInsumoNome(nome, marca, separador = ' (') {
  const n = nome || '';
  if (!marca || isMarcaEstimada(marca)) return n;
  return `${n}${separador}${marca})`;
}

/** Versão com separador "—" pra contextos onde parênteses ficam ruins. */
export function formatInsumoNomeDash(nome, marca) {
  const n = nome || '';
  if (!marca || isMarcaEstimada(marca)) return n;
  return `${n} — ${marca}`;
}
