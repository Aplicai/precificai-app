/**
 * Quantidade inicial e passo do stepper quando um item (ingrediente, receita
 * base, embalagem) entra num produto/receita — pela lista do picker OU criado
 * por dentro do formulário (cascata). Fonte única usada por EntityCreateModal
 * e ProdutoFormScreen.
 *
 * A quantidade do item é gravada na unidade do próprio item (unidade de
 * compra do insumo). Por isso kg/L começam em 0,1 — a mesma quantidade física
 * dos 100 g/mL de um item cadastrado em g/mL — em vez de 1 kg inteiro
 * (bug do tutorial 05: "R$ 59,90 de coco no bolo").
 */
import { parseDecimalBROrZero } from './calculations';

function norm(unidade) {
  return String(unidade || '').trim().toLowerCase();
}

export function defaultQtyForUnidade(unidade) {
  const u = norm(unidade);
  if (u === 'g' || u === 'ml') return 100;
  if (u === 'kg' || u === 'l') return 0.1;
  return 1;
}

export function stepForUnidade(unidade) {
  const u = norm(unidade);
  if (u === 'g' || u === 'ml') return 10;
  if (u === 'kg' || u === 'l') return 0.1;
  return 1;
}

// Soma passo à quantidade sem ruído de ponto flutuante (0,1 + 0,2 = 0,3) e
// sem deixar ficar negativa.
export function somarQtd(qtd, passo) {
  const base = typeof qtd === 'number' ? qtd : parseDecimalBROrZero(qtd);
  const r = Math.round((base + Number(passo || 0)) * 1000) / 1000;
  return r > 0 ? r : 0;
}

// Número → texto PT-BR pro input de quantidade ("0,1", "100", "1,25").
export function formatQtdBR(qtd) {
  const n = Math.round(Number(qtd || 0) * 1000) / 1000;
  return String(n).replace('.', ',');
}
