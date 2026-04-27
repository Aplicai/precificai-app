/**
 * Helper para formatar nome de insumo com marca quando disponível.
 *
 * Sessão 28.8 — pra distinguir insumos com mesmo nome mas marcas diferentes
 * (ex: "Farinha de Trigo (Dona Benta)" vs "Farinha de Trigo (Caputo)") em
 * pickers, listas de ingredientes de produtos/preparos e qualquer lugar
 * onde o user precisa identificar qual insumo selecionar.
 *
 * Uso:
 *   import { formatInsumoLabel, formatIngLabel } from '../utils/formatInsumo';
 *
 *   formatInsumoLabel({ nome: 'Farinha', marca: 'Dona Benta' })
 *     → 'Farinha (Dona Benta)'
 *
 *   formatInsumoLabel({ nome: 'Farinha', marca: '' })
 *     → 'Farinha'
 *
 *   formatIngLabel({ mp_nome: 'Farinha', mp_marca: 'Dona Benta' })
 *     → 'Farinha (Dona Benta)'
 */

function _trimOrNull(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t.length > 0 ? t : null;
}

/** Formata a partir de um objeto matéria-prima ({nome, marca}). */
export function formatInsumoLabel(mp) {
  if (!mp) return '';
  const nome = _trimOrNull(mp.nome) || '';
  const marca = _trimOrNull(mp.marca);
  if (!nome) return marca || '';
  if (!marca) return nome;
  // Evita duplicar marca caso o nome já contenha (ex: "Leite Ninho")
  if (nome.toLowerCase().includes(marca.toLowerCase())) return nome;
  return `${nome} (${marca})`;
}

/** Formata a partir de um item de ingrediente ({mp_nome, mp_marca}). */
export function formatIngLabel(ing) {
  if (!ing) return '';
  return formatInsumoLabel({ nome: ing.mp_nome, marca: ing.mp_marca });
}

/** Para busca/filter — retorna nome+marca normalizados em uma string. */
export function buildSearchString(mp) {
  if (!mp) return '';
  const nome = _trimOrNull(mp.nome) || '';
  const marca = _trimOrNull(mp.marca) || '';
  return `${nome} ${marca}`.trim();
}

export default { formatInsumoLabel, formatIngLabel, buildSearchString };
