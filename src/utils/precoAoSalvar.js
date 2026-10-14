/**
 * Preço de venda usado ao salvar um produto.
 *
 * Antes o produto só salvava com preço digitado — mesmo com o preço sugerido
 * calculado na tela. Quem entrava justamente para DESCOBRIR o preço batia em
 * "Informe o preço de venda" (5 das 20 contas grátis pararam com produto sem
 * preço). Agora:
 *   - preço digitado (> 0) → vale ele;
 *   - campo vazio e sugerido > 0 → salva o sugerido;
 *   - sem nenhum dos dois (ex.: ingredientes do kit ainda em R$ 0) → salva sem
 *     preço; o produto aparece em "Sem preço" e a Home lembra de completar.
 *
 * @returns {{ preco: number, origem: 'digitado'|'sugerido'|'sem_preco' }}
 */
export function resolverPrecoAoSalvar(precoDigitado, precoSugerido) {
  const dig = Number(precoDigitado);
  if (Number.isFinite(dig) && dig > 0) return { preco: dig, origem: 'digitado' };
  const sug = Number(precoSugerido);
  if (Number.isFinite(sug) && sug > 0) return { preco: Math.round(sug * 100) / 100, origem: 'sugerido' };
  return { preco: 0, origem: 'sem_preco' };
}

/** Aviso mostrado depois de salvar quando o preço não foi digitado. */
export function avisoPrecoAoSalvar(resultado, formatar) {
  if (resultado.origem === 'sugerido') {
    return `Salvamos com o preço sugerido de ${formatar(resultado.preco)}. Você pode mudar quando quiser.`;
  }
  if (resultado.origem === 'sem_preco') {
    return 'Produto salvo sem preço. Coloque o preço pago nos ingredientes para ver o preço sugerido.';
  }
  return null;
}
