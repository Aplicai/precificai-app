/**
 * Primeiro preço (19/10/2026): Preço rápido como caminho padrão do primeiro
 * acesso e o "momento de valor" logo depois de salvar (PrimeiroPrecoScreen).
 *
 * Funil da coorte da escada: 48% dos que viam o Preço rápido tocavam em
 * "Pular". Agora o 1º campo já vem com um produto típico do segmento do
 * perfil (a pessoa pode trocar). Os números continuam vazios: nunca
 * inventamos os números da pessoa.
 *
 * Puro, sem React/RN (testado em __tests__/primeiroPreco.test.mjs).
 */

/** Sugestões padrão (chips) quando o segmento não diz nada. */
export const SUGESTOES_PADRAO = ['Bolo de chocolate', 'Brigadeiro', 'Marmita', 'Hambúrguer', 'Pizza', 'Coxinha'];
export const MAX_SUGESTOES = 6;

/**
 * Palavra-chave do segmento (sem acento, minúscula) → produto típico.
 * A ordem importa: a primeira que aparece no texto ganha. "japon" vem antes
 * de "pao" ("Japão" sem acento contém "pao"); "brigadeir" antes de "doce".
 * O segmento é texto livre no perfil ("Bolos e doces", "Marmitaria fit").
 */
const PRODUTO_POR_PALAVRA = [
  ['japon', 'Temaki'],
  ['japao', 'Temaki'],
  ['sushi', 'Temaki'],
  ['temaki', 'Temaki'],
  ['brigadeir', 'Brigadeiro'],
  ['bolo', 'Bolo de chocolate'],
  ['confeit', 'Bolo de chocolate'],
  ['trufa', 'Trufa'],
  ['chocolat', 'Trufa'],
  ['cookie', 'Cookie'],
  ['doce', 'Brigadeiro'],
  ['hamburg', 'Hambúrguer'],
  ['burger', 'Hambúrguer'],
  ['lanch', 'Hambúrguer'],
  ['pizz', 'Pizza'],
  ['marmit', 'Marmita'],
  ['quentinha', 'Marmita'],
  ['refeic', 'Marmita'],
  ['restaurante', 'Marmita'],
  ['comida', 'Marmita'],
  ['coxinha', 'Coxinha'],
  ['salgad', 'Coxinha'],
  ['pastel', 'Pastel'],
  ['espetinho', 'Espetinho'],
  ['churras', 'Espetinho'],
  ['tapioca', 'Tapioca'],
  ['acai', 'Açaí 500 ml'],
  ['sorvet', 'Picolé'],
  ['gelad', 'Picolé'],
  ['picole', 'Picolé'],
  ['cafe', 'Cappuccino'],
  ['padar', 'Pão de queijo'],
  ['pao', 'Pão de queijo'],
  ['paes', 'Pão de queijo'],
];

/** Minúsculo, sem acento, espaços normalizados. */
export function normalizarTexto(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produto típico do segmento do perfil, ou null quando o segmento não diz
 * nada (aí o campo fica vazio, com o exemplo no placeholder).
 * @param {string} segmento texto livre de `perfil.segmento`
 * @returns {string|null}
 */
export function produtoDoSegmento(segmento) {
  const norm = normalizarTexto(segmento);
  if (!norm) return null;
  for (const [palavra, produto] of PRODUTO_POR_PALAVRA) {
    if (norm.includes(palavra)) return produto;
  }
  return null;
}

/**
 * Chips do campo "Qual produto?": o produto do segmento primeiro, depois os
 * padrão, sem repetir, no máximo MAX_SUGESTOES.
 */
export function sugestoesDeProduto(segmento) {
  const doSegmento = produtoDoSegmento(segmento);
  const lista = doSegmento ? [doSegmento, ...SUGESTOES_PADRAO.filter((s) => s !== doSegmento)] : [...SUGESTOES_PADRAO];
  return lista.slice(0, MAX_SUGESTOES);
}

/** 0.15 → "15"; 0.125 → "12,5". */
export function lucroEmTexto(lucro) {
  const n = Number(lucro);
  const pct = Number.isFinite(n) && n > 0 ? Math.round(n * 1000) / 10 : 0;
  return String(pct).replace('.', ',');
}

/** Linha do cartão "Preço salvo": o que o preço cobre. */
export function linhaCobertura(lucro) {
  return `Cobre o custo de fazer, os gastos do mês e ${lucroEmTexto(lucro)}% de lucro.`;
}
