/**
 * Helpers puros da "frase de compra" do formulário de Ingredientes
 * (MateriaPrimaFormScreen): "Comprei [5] [kg] por R$ [25,00]".
 *
 * Decisão do dono (2026-10): o bloco Unidade / Qtd. Bruta / Valor pago virou
 * uma frase única, a perda (Qtd. Líquida) fica escondida atrás de um toggle e
 * o resultado é lido como "Isso dá R$ 5,00 por kg". As colunas salvas
 * (quantidade_bruta, quantidade_liquida, unidade_medida, valor_pago,
 * fator_correcao, preco_por_kg) NÃO mudam — só a apresentação.
 *
 * Sem React/RN pra rodar em `npm test`.
 */

import { parseDecimalBR, getTipoUnidade, formatCurrency } from './calculations';

/** Unidade inicial de um ingrediente NOVO (antes era 'g'). */
export const UNIDADE_PADRAO_NOVO = 'kg';

/** Mensagens de validação alinhadas com a frase. */
export const MSG_QUANTIDADE_OBRIGATORIA = 'Diga quanto você comprou';
export const MSG_VALOR_OBRIGATORIO = 'Diga quanto pagou';

function toNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = parseDecimalBR(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Ao editar: o toggle "Tem perda?" abre sozinho quando a quantidade líquida
 * salva difere da bruta. Aceita number ou string PT-BR. Líquida vazia/0 ou
 * igual à bruta → false (líquida = bruta é a regra quando o toggle está off).
 */
export function deveAbrirPerda(quantidadeBruta, quantidadeLiquida) {
  const qb = toNum(quantidadeBruta);
  const ql = toNum(quantidadeLiquida);
  if (qb == null || ql == null) return false;
  if (qb <= 0 || ql <= 0) return false;
  return Math.abs(qb - ql) > 1e-9;
}

/** "por kg" / "por litro" / "por unidade" conforme o tipo da unidade. */
export function sufixoPrecoBase(unidade) {
  const tipo = getTipoUnidade(unidade);
  if (tipo === 'peso') return 'por kg';
  if (tipo === 'volume') return 'por litro';
  return 'por unidade';
}

/**
 * Frase de resultado pra leigo: "Isso dá R$ 5,00 por kg".
 * precoBase inválido/<= 0 → '' (quem chama decide o que mostrar).
 */
export function fraseCustoResultado(precoBase, unidade) {
  const n = Number(precoBase);
  if (!Number.isFinite(n) || n <= 0) return '';
  return `Isso dá ${formatCurrency(n)} ${sufixoPrecoBase(unidade)}`;
}

/**
 * Lista de mensagens pros erros de validação da frase (ordem: quantidade,
 * valor). `errs` é o objeto de validateForm ({ quantidade_bruta, valor_pago }).
 */
export function mensagensErroCompra(errs) {
  const out = [];
  if (!errs) return out;
  if (errs.quantidade_bruta) out.push(MSG_QUANTIDADE_OBRIGATORIA);
  if (errs.valor_pago) out.push(MSG_VALOR_OBRIGATORIO);
  return out;
}
