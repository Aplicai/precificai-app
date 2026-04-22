/**
 * Web entry point — Precificaí PWA bootstrap.
 *
 * Tasks executed at boot (apenas Web):
 *  1. Injetar <link rel="manifest"> + meta theme-color/viewport apropriados.
 *  2. Registrar Service Worker (/sw.js) — cacheia assets e habilita "Adicionar
 *     à tela inicial".
 *  3. Capturar `beforeinstallprompt` para o componente InstallPrompt poder
 *     disparar o diálogo de instalação na hora certa (após 1ª venda).
 */
import { registerRootComponent } from 'expo';
import App from './App';

if (typeof document !== 'undefined') {
  // PWA meta tags
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

  setMeta('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no');
  setMeta('theme-color', '#004d47');
  setMeta('description', 'Precificação inteligente: insumos, fichas técnicas, custo médio, margem, delivery e estoque.');
  setMeta('apple-mobile-web-app-capable', 'yes');
  setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent');
  setMeta('apple-mobile-web-app-title', 'Precificaí');
  setMeta('mobile-web-app-capable', 'yes');

  // Manifest link
  if (!document.querySelector('link[rel="manifest"]')) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest.json';
    document.head.appendChild(link);
  }

  // Apple touch icon
  if (!document.querySelector('link[rel="apple-touch-icon"]')) {
    const link = document.createElement('link');
    link.rel = 'apple-touch-icon';
    link.href = '/icon-192.png';
    document.head.appendChild(link);
  }

  // Service Worker (only in production-like environments to avoid HMR conflicts)
  if ('serviceWorker' in navigator) {
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
    if (!isLocal) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/sw.js')
          .catch((err) => console.warn('[SW] register failed', err));
      });
    }
  }

  // PWA install prompt — captura para uso pelo componente InstallPrompt.
  window.__pwaInstallPrompt = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__pwaInstallPrompt = e;
    window.dispatchEvent(new CustomEvent('pwa-install-available'));
  });
  window.addEventListener('appinstalled', () => {
    window.__pwaInstallPrompt = null;
    window.dispatchEvent(new CustomEvent('pwa-installed'));
  });
}

registerRootComponent(App);
