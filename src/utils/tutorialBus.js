/**
 * Abre o vídeo tutorial de qualquer tela, sem cada uma montar o próprio modal.
 * Um único <TutorialVideoHost /> (montado na raiz do app) escuta aqui.
 * Mesmo padrão de store de módulo do toastBus.
 */
const listeners = new Set();

/** @param {string|number} [capitulo] chave de CAPITULOS (config/tutorial) ou segundos */
export function abrirTutorial(capitulo = 'abertura') {
  listeners.forEach((fn) => { try { fn(capitulo); } catch (_) {} });
}

export function subscribeTutorial(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
