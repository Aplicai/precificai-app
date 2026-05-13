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

  // === PWA INSTALL PROMPT (Android/Chrome) ======================
  // Captura o evento beforeinstallprompt pra o componente InstallPWABanner
  // poder disparar o diálogo na hora certa.
  window.__pwaInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    window.__pwaInstallPrompt = null;
    try {
      // Marca no localStorage pra esconder banner de install no futuro
      localStorage.setItem('pwa_installed', '1');
    } catch (_) {}
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });

  // Limpa flag `pwa_installed` quando carregamos NÃO-standalone — o usuário
  // desinstalou (browsers não disparam evento de uninstall, então o flag
  // ficaria preso "true" pra sempre, fazendo o botão "Instalar app" em
  // Configurações mostrar erradamente "✓ App instalado").
  try {
    const inStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (!inStandalone && localStorage.getItem('pwa_installed') === '1') {
      localStorage.removeItem('pwa_installed');
    }
  } catch (_) {}
}

registerRootComponent(App);
