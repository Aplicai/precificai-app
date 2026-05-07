/**
 * dataSync — Sessão 28.43
 *
 * Pub-sub minimalista para sincronização cross-screen quando dados de
 * uma tabela mudam. Resolve o problema "atualizei preço em AtualizarPrecos
 * mas a lista de Insumos mostra preço velho" — o useFocusEffect do React
 * Navigation às vezes não dispara confiavelmente em tab switches no web.
 *
 * Uso:
 *   // Após save:
 *   notifyDataChanged('materias_primas');
 *
 *   // Em telas que listam essa tabela:
 *   useEffect(() => subscribeDataChanged((table) => {
 *     if (table === 'materias_primas') loadData();
 *   }), []);
 *
 * Também guarda um timestamp da última mudança por tabela; useful pra
 * invalidação tardia (loadData pula se já está fresh).
 */

const listeners = new Set();
const lastUpdate = {};

/**
 * Notifica que uma tabela mudou. Chama todos os subscribers com o nome
 * da tabela.
 */
export function notifyDataChanged(table) {
  if (!table) return;
  lastUpdate[table] = Date.now();
  // Snapshot pra evitar mutation durante iteração
  const snapshot = Array.from(listeners);
  for (const cb of snapshot) {
    try { cb(table); } catch (e) { console.warn('[dataSync] listener error', e); }
  }
}

/**
 * Inscreve um callback. Retorna função de unsubscribe.
 */
export function subscribeDataChanged(cb) {
  if (typeof cb !== 'function') return () => {};
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

/**
 * Timestamp (ms) da última notificação pra essa tabela. Zero se nunca
 * foi notificada.
 */
export function getLastUpdate(table) {
  return lastUpdate[table] || 0;
}
