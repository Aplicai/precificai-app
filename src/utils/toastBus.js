/**
 * Sessão 28.53 — Toast bus global.
 *
 * Pub-sub leve para disparar InfoToast de qualquer tela, mesmo após
 * `navigation.goBack()`. Resolve o problema de feedback após ações que
 * encerram a tela (ex: salvar entrada/ajuste de estoque, exportar PDF).
 *
 * Uso (em qualquer screen):
 *   import { showToast } from '../utils/toastBus';
 *   await save();
 *   showToast('Entrada registrada', 'check-circle');
 *   navigation.goBack();
 *
 * Um único <GlobalToastHost /> deve estar montado na raiz do app.
 */

const listeners = new Set();

export function showToast(message, icon = 'check-circle', durationMs = 2500) {
  const payload = { message, icon, durationMs, id: Date.now() + Math.random() };
  listeners.forEach((fn) => {
    try { fn(payload); } catch (_) {}
  });
}

export function subscribeToast(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
