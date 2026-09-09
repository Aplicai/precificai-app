/**
 * Entry point — Precificaí
 *
 * Sessão 28.61: bootstrap PWA movido do index.web.js (que não estava sendo
 * carregado porque package.json apontava pra index.js) pra cá. Tudo dentro de
 * `if (typeof document !== 'undefined')` roda APENAS no web — em iOS/Android
 * nativo é noop.
 */
import { registerRootComponent } from 'expo';
import App from './App';

if (typeof document !== 'undefined') {
  // === ALERT SHIM ================================================
  // react-native-web: Alert.alert é NO-OP. Sem isto, validações/confirmações
  // nunca aparecem no navegador (audit 2026-09). Instala antes de tudo.
  try {
    const { Alert } = require('react-native');
    require('./src/utils/webAlert').installWebAlertShim(Alert, window);
  } catch (_) {}

  // === FOCO VISÍVEL (a11y, WCAG 2.4.7) =========================
  // Vários controles do shell web são `<div role="button">` com estilo inline —
  // inline não expressa `:focus-visible`, então o anel de foco vai numa folha
  // de estilo própria. Cobre sidebar, header e menu da conta.
  try {
    const focusCss = document.createElement('style');
    focusCss.setAttribute('data-precificai', 'focus-ring');
    focusCss.textContent =
      '[role="button"]:focus-visible,[role="menuitem"]:focus-visible,a:focus-visible,button:focus-visible,input:focus-visible,textarea:focus-visible,select:focus-visible{outline:2px solid #004d47;outline-offset:2px;border-radius:6px}' +
      '[role="menuitem"]:focus-visible,[role="button"]:focus-visible{box-shadow:0 0 0 3px rgba(0,77,71,0.25)}';
    document.head.appendChild(focusCss);
  } catch (_) {}

  // === PWA META TAGS ============================================
  function setMeta(name, content, isProperty = false) {
    const attr = isProperty ? 'property' : 'name';
    let el = document.querySelector(`meta[${attr}="${name}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attr, name);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  // Viewport — sem user-scalable=no (preserva a11y); zoom indevido no Safari iOS
  // é resolvido via font-size mínimo de 16px em inputs (mobileWebFixes.js).
  setMeta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
  setMeta('theme-color', '#004d47');

  // BLINDAGEM ANTI-TRADUÇÃO (reforço runtime): o Chrome auto-translate reescreve os
  // nós de texto do DOM por fora → o React perde a sincronia e o app "buga tudo".
  // O sinal autoritativo já vai no HTML estático (inject-boot-watchdog.js); isto
  // cobre o dev server e qualquer HTML não-patcheado.
  try {
    document.documentElement.setAttribute('translate', 'no');
    document.documentElement.lang = 'pt-BR';
  } catch (_) {}
  setMeta('google', 'notranslate');
  setMeta('description', 'Precificação inteligente: insumos, fichas técnicas, custo médio, margem, delivery e estoque.');
  setMeta('apple-mobile-web-app-capable', 'yes');
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  setMeta('apple-mobile-web-app-title', 'Precificaí');
  setMeta('mobile-web-app-capable', 'yes');
  // Open Graph (compartilhamento WhatsApp/Twitter/etc)
  setMeta('og:title', 'Precificaí — Precificação inteligente', true);
  setMeta('og:description', 'Insumos, fichas técnicas, custo médio, margem, delivery e estoque para confeitarias, padarias e pequenos negócios.', true);
  setMeta('og:type', 'website', true);
  setMeta('og:url', 'https://app.precificaiapp.com', true);
  setMeta('og:image', 'https://app.precificaiapp.com/icon-512.png', true);

  // Document title
  if (!document.title || document.title === 'PrecificaApp') {
    document.title = 'Precificaí';
  }

  // === MANIFEST + ICONS ==========================================
  function setLink(rel, href, attrs = {}) {
    let el = document.querySelector(`link[rel="${rel}"]`);
    if (!el) {
      el = document.createElement('link');
      el.setAttribute('rel', rel);
      document.head.appendChild(el);
    }
    el.setAttribute('href', href);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
  }
  setLink('manifest', '/manifest.json');
  setLink('apple-touch-icon', '/icon-192.png');
  // Apple touch icons em múltiplos tamanhos pra cada device
  ['180', '192'].forEach((size) => {
    const existing = document.querySelector(`link[rel="apple-touch-icon"][sizes="${size}x${size}"]`);
    if (!existing) {
      const link = document.createElement('link');
      link.rel = 'apple-touch-icon';
      link.setAttribute('sizes', `${size}x${size}`);
      link.href = `/icon-${size === '180' ? '192' : size}.png`;
      document.head.appendChild(link);
    }
  });

  // === CSS FIX: input zoom no iOS Safari ========================
  try {
    const injectMobileWebFixes = require('./src/utils/mobileWebFixes').default;
    if (typeof injectMobileWebFixes === 'function') injectMobileWebFixes();
  } catch (_) {}

  // === SERVICE WORKER ===========================================
  // Registro SIMPLES (sem controllerchange→reload). O auto-reload causava LOOP de
  // reload ("tela atualizando constantemente"). O "reabrir = versão nova" já é
  // garantido pelo sw.js (HTML com cache:'reload' → busca fresco a cada abertura),
  // SEM precisar recarregar a página com o app aberto.
  if ('serviceWorker' in navigator) {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isLocal) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .catch((err) => {
            if (typeof console !== 'undefined' && console.warn) console.warn('[SW] register failed', err);
          });
      });
    }
  }

  // === PWA INSTALL PROMPT ======================================
  // UX audit 09/09 (item 15): captura de `beforeinstallprompt`, flag
  // `pwa_installed` e eventos de compat vivem em src/utils/pwaInstall.js —
  // fonte única para o card da Home e o botão em Configurações.
  try {
    require('./src/utils/pwaInstall').setupPwaInstallCapture();
  } catch (_) {}
}

registerRootComponent(App);
