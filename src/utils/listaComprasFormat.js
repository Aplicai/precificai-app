/**
 * Quantidade da lista de compras em PT-BR: inteiro sem casas ("810"), fração
 * com 2 casas e vírgula ("1,27", "3,70"). Antes saía `toFixed(2)` com ponto
 * ("1.27 kg") na tela e no PDF.
 */
import { formatDecimalBR } from './insumoFormHelpers';

export function formatQtdLista(qtd) {
  const n = Number(qtd);
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return formatDecimalBR(n, 2);
}
