/**
 * Helpers puros da tela "Atualizar Preços" (AtualizarPrecosScreen).
 *
 * Bug do tutorial: trocar de aba durante o carregamento deixava a lista da aba
 * ANTERIOR com a aba nova ativa (o guard `isLoadingRef` descartava o load
 * novo). Salvar nesse estado gravava valor/id na tabela errada, porque o save
 * escolhia a tabela pela aba ativa e não pela aba de onde a linha veio.
 */

export const TABELA_POR_ABA = {
  insumos: 'materias_primas',
  embalagens: 'embalagens',
  produtos: 'produtos',
  combos: 'delivery_combos',
};

/** Tabela do banco de uma aba; '' para aba desconhecida (nunca chuta). */
export function tabelaDaAba(aba) {
  return TABELA_POR_ABA[aba] || '';
}

/**
 * "Só a última requisição vale": cada load pega um token com next(); ao
 * terminar, só aplica o resultado se isLatest(token). Um load novo nunca é
 * descartado — quem perde é o antigo.
 */
export function createLatestOnly() {
  let atual = 0;
  return {
    next() { atual += 1; return atual; },
    isLatest(token) { return token === atual; },
  };
}
