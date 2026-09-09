/**
 * pwaInstall — estado compartilhado do prompt de instalação da PWA (web).
 *
 * UX audit 2026-09-09 (item 15): "Instalar app" existia em 4 lugares, cada um
 * com a sua própria cópia da lógica de `beforeinstallprompt`, detecção de
 * standalone e dispensa em localStorage. Agora existe UMA fonte:
 *
 *  - `setupPwaInstallCapture()` — chamado em `index.js` (antes do React montar,
 *    porque o Chrome dispara `beforeinstallprompt` bem cedo). Guarda o evento e
 *    avisa os inscritos. Idempotente.
 *  - `canInstall()`     — o navegador ofereceu o prompt nativo?
 *  - `isInstalled()`    — já roda como app (display-mode standalone / iOS
 *                         `navigator.standalone` / flag `pwa_installed`)?
 *  - `promptInstall()`  — dispara o diálogo nativo; resolve 'accepted' |
 *                         'dismissed' | 'unavailable'.
 *  - `subscribe(fn)`    — recebe `{ canInstall, installed }` a cada mudança;
 *                         devolve o unsubscribe.
 *  - `isDismissed()` / `dismissFor(days)` — dispensa do card da Home
 *                         (30 dias, localStorage, sempre em try/catch).
 *  - `detectPlatform()` — 'ios' | 'android' | 'edge' | 'firefox' | 'chrome' |
 *                         'safari' | 'unknown' (para as instruções manuais).
 *
 * Consumidores: `HomeInstallBanner` (card dispensável na Home) e
 * `InstallAppButton` (entrada permanente em Configurações).
 *
 * Mantém `window.__pwaInstallPrompt` e os eventos `pwa-install-available` /
 * `pwa-installed` por compatibilidade com código antigo — nada novo deve
 * depender deles.
 *
 * Sem dependência de react-native: roda em Node (testes) e no entry web.
 */

export const DISMISS_KEY = 'precificai_install_banner_dismissed_until';
export const INSTALLED_FLAG_KEY = 'pwa_installed';
export const DEFAULT_DISMISS_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

let deferredPrompt = null;
let captured = false;
const listeners = new Set();

function hasWindow() {
  return typeof window !== 'undefined';
}

function readStorage(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    if (typeof localStorage === 'undefined') return;
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch (_) {}
}

export function getState() {
  return { canInstall: canInstall(), installed: isInstalled() };
}

function notify() {
  const state = getState();
  listeners.forEach((fn) => {
    try { fn(state); } catch (_) {}
  });
}

export function isInstalled() {
  if (!hasWindow()) return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true;
  } catch (_) {}
  return readStorage(INSTALLED_FLAG_KEY) === '1';
}

export function canInstall() {
  if (deferredPrompt) return true;
  // Compat: alguém pode ter capturado o evento antes deste módulo carregar.
  return !!(hasWindow() && window.__pwaInstallPrompt);
}

function currentPrompt() {
  if (deferredPrompt) return deferredPrompt;
  if (hasWindow() && window.__pwaInstallPrompt) return window.__pwaInstallPrompt;
  return null;
}

function clearPrompt() {
  deferredPrompt = null;
  if (hasWindow()) window.__pwaInstallPrompt = null;
}

/**
 * Dispara o diálogo nativo de instalação.
 * @returns {Promise<'accepted'|'dismissed'|'unavailable'>}
 */
export async function promptInstall() {
  const ev = currentPrompt();
  if (!ev || typeof ev.prompt !== 'function') return 'unavailable';
  try {
    ev.prompt();
    const result = await ev.userChoice;
    clearPrompt();
    notify();
    return result?.outcome === 'accepted' ? 'accepted' : 'dismissed';
  } catch (_) {
    clearPrompt();
    notify();
    return 'unavailable';
  }
}

export function subscribe(fn) {
  if (typeof fn !== 'function') return () => {};
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function isDismissed(now = Date.now()) {
  const raw = readStorage(DISMISS_KEY);
  if (!raw) return false;
  const until = Number(raw);
  return Number.isFinite(until) && now < until;
}

export function dismissFor(days = DEFAULT_DISMISS_DAYS, now = Date.now()) {
  writeStorage(DISMISS_KEY, String(now + days * DAY_MS));
}

export function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('mac') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isIOS) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox') || ua.includes('fxios')) return 'firefox';
  if (ua.includes('chrome') || ua.includes('crios')) return 'chrome';
  if (ua.includes('safari')) return 'safari';
  return 'unknown';
}

/**
 * Registra os listeners globais. Chamar UMA vez, o mais cedo possível (index.js).
 */
export function setupPwaInstallCapture() {
  if (captured || !hasWindow()) return;
  captured = true;

  if (window.__pwaInstallPrompt && !deferredPrompt) {
    deferredPrompt = window.__pwaInstallPrompt;
  } else if (!('__pwaInstallPrompt' in window)) {
    window.__pwaInstallPrompt = null;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    window.__pwaInstallPrompt = e;
    try { window.dispatchEvent(new CustomEvent('pwa-install-available')); } catch (_) {}
    notify();
  });

  window.addEventListener('appinstalled', () => {
    clearPrompt();
    // Marca no localStorage pra esconder os convites de instalação no futuro.
    writeStorage(INSTALLED_FLAG_KEY, '1');
    try { window.dispatchEvent(new CustomEvent('pwa-installed')); } catch (_) {}
    notify();
  });

  // Limpa a flag `pwa_installed` quando carregamos NÃO-standalone — o usuário
  // desinstalou (navegadores não avisam a desinstalação, então a flag ficaria
  // presa e Configurações mostraria "App instalado" errado).
  try {
    const inStandalone =
      (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      window.navigator.standalone === true;
    if (!inStandalone && readStorage(INSTALLED_FLAG_KEY) === '1') {
      writeStorage(INSTALLED_FLAG_KEY, null);
    }
  } catch (_) {}

  // Entrou/saiu do modo standalone sem recarregar.
  try {
    const mql = window.matchMedia('(display-mode: standalone)');
    const handler = () => notify();
    if (mql.addEventListener) mql.addEventListener('change', handler);
    else if (mql.addListener) mql.addListener(handler);
  } catch (_) {}
}

/** Somente para testes: zera o estado do módulo. */
export function __resetForTests() {
  deferredPrompt = null;
  captured = false;
  listeners.clear();
}
