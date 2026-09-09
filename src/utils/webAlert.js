/**
 * Shim de `Alert.alert` para web.
 *
 * Audit 2026-09: react-native-web 0.21 implementa `Alert` como
 * `class Alert { static alert() {} }` — um NO-OP. Resultado: 90+ chamadas em
 * 22 arquivos (validações "Preencha o nome", confirmações "Excluir?", erros
 * de rede) NUNCA apareciam no navegador, e callbacks `onPress` com o efeito
 * colateral (apagar, salvar, navegar) nunca rodavam. Pro usuário: "cliquei e
 * nada aconteceu".
 *
 * Este shim mapeia para os diálogos nativos do navegador (síncronos):
 *   - 0 ou 1 botão            → window.alert  + onPress do botão
 *   - 2 botões                → window.confirm: OK = botão não-cancel, Cancelar = cancel
 *   - 3+ botões               → window.confirm entre o ÚLTIMO botão não-cancel
 *                               (convenção RN: ação principal por último) e o cancel.
 *                               Os demais são inalcançáveis — fluxos com 3 opções devem
 *                               usar Modal próprio (ver CLAUDE.md).
 * `options.cancelable` é ignorado (confirm/alert são sempre modais).
 *
 * `installWebAlertShim(AlertClass, win)` é puro/injetável para teste.
 */

function pickButtons(buttons) {
  const list = Array.isArray(buttons) ? buttons.filter(Boolean) : [];
  const cancel = list.find((b) => b && b.style === 'cancel') || null;
  const others = list.filter((b) => b !== cancel);
  // Se não há `style: 'cancel'` explícito mas há 2+ botões, o PRIMEIRO faz o
  // papel de cancelar (convenção iOS: [Cancelar, Confirmar]).
  if (!cancel && others.length >= 2) {
    return { cancel: others[0], primary: others[others.length - 1], total: list.length };
  }
  return { cancel, primary: others.length ? others[others.length - 1] : null, total: list.length };
}

function safeCall(fn) {
  if (typeof fn !== 'function') return;
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (_) {}
}

export function webAlert(win, title, message, buttons) {
  const text = [title, message].filter((s) => s != null && String(s).trim() !== '').join('\n\n');
  const { cancel, primary, total } = pickButtons(buttons);

  if (total <= 1) {
    try { win.alert(text); } catch (_) {}
    safeCall(primary && primary.onPress);
    return;
  }

  let ok = false;
  try { ok = !!win.confirm(text); } catch (_) { ok = false; }
  if (ok) safeCall(primary && primary.onPress);
  else safeCall(cancel && cancel.onPress);
}

export function installWebAlertShim(AlertClass, win) {
  if (!AlertClass || !win || typeof win.alert !== 'function') return false;
  AlertClass.alert = (title, message, buttons) => webAlert(win, title, message, buttons);
  return true;
}

export default installWebAlertShim;
