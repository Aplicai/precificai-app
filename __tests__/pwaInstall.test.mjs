/**
 * pwaInstall — fonte única do prompt de instalação da PWA (UX audit 09/09, item 15).
 * Roda em Node com `window`/`localStorage` falsos; o módulo não depende de react-native.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  setupPwaInstallCapture, canInstall, isInstalled, promptInstall, subscribe,
  isDismissed, dismissFor, DISMISS_KEY, INSTALLED_FLAG_KEY, DEFAULT_DISMISS_DAYS,
  __resetForTests,
} from '../src/utils/pwaInstall.js';

function fakeEnv({ standalone = false } = {}) {
  const store = new Map();
  const handlers = {};
  const win = {
    addEventListener: (name, fn) => { (handlers[name] ||= []).push(fn); },
    dispatchEvent: () => true,
    matchMedia: () => ({ matches: standalone, addEventListener: () => {} }),
    navigator: { standalone: false },
  };
  globalThis.window = win;
  globalThis.CustomEvent = class { constructor(type) { this.type = type; } };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  const fire = (name, ev = {}) => (handlers[name] || []).forEach((fn) => fn(ev));
  return { store, fire };
}

function cleanup() {
  __resetForTests();
  delete globalThis.window;
  delete globalThis.localStorage;
  delete globalThis.CustomEvent;
}

test('sem window: nunca instalável, nunca instalado, nunca dispensado', () => {
  cleanup();
  assert.equal(canInstall(), false);
  assert.equal(isInstalled(), false);
  assert.equal(isDismissed(), false);
});

test('beforeinstallprompt → canInstall e notifica inscritos; promptInstall consome o evento', async () => {
  const { fire } = fakeEnv();
  setupPwaInstallCapture();
  const seen = [];
  const unsub = subscribe((s) => seen.push(s));
  assert.equal(canInstall(), false);

  let prevented = false;
  const ev = {
    preventDefault: () => { prevented = true; },
    prompt: () => {},
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  };
  fire('beforeinstallprompt', ev);
  assert.equal(prevented, true);
  assert.equal(canInstall(), true);
  assert.equal(window.__pwaInstallPrompt, ev, 'mantém o global de compat');
  assert.deepEqual(seen.at(-1), { canInstall: true, installed: false });

  assert.equal(await promptInstall(), 'accepted');
  assert.equal(canInstall(), false);
  assert.equal(window.__pwaInstallPrompt, null);
  unsub();
  fire('beforeinstallprompt', ev);
  assert.equal(seen.length, 2, 'depois do unsubscribe não recebe mais');
  cleanup();
});

test('promptInstall sem evento → unavailable; dismissed quando o usuário recusa', async () => {
  const { fire } = fakeEnv();
  setupPwaInstallCapture();
  assert.equal(await promptInstall(), 'unavailable');
  fire('beforeinstallprompt', {
    preventDefault() {}, prompt() {}, userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  assert.equal(await promptInstall(), 'dismissed');
  cleanup();
});

test('appinstalled grava flag e isInstalled passa a true; setup limpa flag presa fora do standalone', () => {
  const { store, fire } = fakeEnv();
  setupPwaInstallCapture();
  assert.equal(isInstalled(), false);
  fire('appinstalled');
  assert.equal(store.get(INSTALLED_FLAG_KEY), '1');
  assert.equal(isInstalled(), true);
  cleanup();

  // Flag "presa" de uma instalação antiga + página aberta no navegador comum.
  const env2 = fakeEnv({ standalone: false });
  env2.store.set(INSTALLED_FLAG_KEY, '1');
  setupPwaInstallCapture();
  assert.equal(env2.store.has(INSTALLED_FLAG_KEY), false, 'flag removida');
  assert.equal(isInstalled(), false);
  cleanup();
});

test('dismissFor guarda timestamp por 30 dias e isDismissed respeita a janela', () => {
  const { store } = fakeEnv();
  const now = 1_000_000;
  assert.equal(DEFAULT_DISMISS_DAYS, 30);
  dismissFor(DEFAULT_DISMISS_DAYS, now);
  const until = Number(store.get(DISMISS_KEY));
  assert.equal(until, now + 30 * 24 * 60 * 60 * 1000);
  assert.equal(isDismissed(now + 1), true);
  assert.equal(isDismissed(until - 1), true);
  assert.equal(isDismissed(until), false, 'expira exatamente no timestamp');
  cleanup();
});

test('localStorage quebrado (modo privado) não lança', () => {
  fakeEnv();
  globalThis.localStorage = {
    getItem() { throw new Error('denied'); },
    setItem() { throw new Error('denied'); },
    removeItem() { throw new Error('denied'); },
  };
  assert.doesNotThrow(() => dismissFor());
  assert.equal(isDismissed(), false);
  assert.equal(isInstalled(), false);
  cleanup();
});
