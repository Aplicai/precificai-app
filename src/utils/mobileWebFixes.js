/**
 * mobileWebFixes — patches CSS-level para o build web (Expo Web).
 *
 * Área 9 — bug iOS Safari: ao tocar num <input> com font-size < 16px o Safari
 * faz zoom automático e não retorna. A solução mais segura (sem mexer no
 * viewport com `user-scalable=no`, que prejudica acessibilidade) é forçar
 * font-size mínimo de 16px nos inputs em telas pequenas. Em desktop volta ao
 * inherit pra não bagunçar o layout.
 *
 * Esse módulo injeta o <style> uma única vez no <head>. Idempotente — chamadas
 * repetidas viram noop. Chamado pelo `index.web.js` durante o bootstrap.
 */

const STYLE_ID = 'precificai-mobile-web-fixes';

export default function injectMobileWebFixes() {
  if (typeof document === 'undefined') return; // SSR / native — noop
  if (document.getElementById(STYLE_ID)) return; // já injetado

  const css = `
    /* Área 9 — iOS Safari zoom-on-focus fix.
       Inputs com font-size < 16px disparam zoom automático ao foco no Safari iOS
       e o browser não desfaz o zoom. Forçamos 16px no mobile e voltamos ao
       inherit a partir de 768px (tablets/desktop) pra preservar o layout. */
    input, textarea, select {
      font-size: 16px !important;
    }
    @media (min-width: 768px) {
      input, textarea, select {
        font-size: inherit !important;
      }
    }
  `;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.setAttribute('data-purpose', 'mobile-web-fixes');
  style.textContent = css;
  document.head.appendChild(style);
}
