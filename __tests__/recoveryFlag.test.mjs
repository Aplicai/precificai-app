/**
 * Testes — src/utils/recoveryFlag.js
 *
 * Bug de origem (13/10): o dono clicou no link de redefinir senha e o app
 * simplesmente logou, sem mostrar o formulário. O auth-js salva a sessão da URL
 * dentro de `_initialize()` e só avisa PASSWORD_RECOVERY num `setTimeout`
 * posterior (GoTrueClient:299-302) — se o React ainda não assinou, o evento se
 * perde e o usuário entra como se fosse login normal.
 *
 * Aqui travamos a leitura da intenção direto da URL, que não depende do evento.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/recoveryFlag.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  parseRecoveryFromUrl,
  captureRecoveryIntent,
  isRecoveryIntent,
  clearRecoveryIntent,
  RECOVERY_STORAGE_KEY,
} from '../src/utils/recoveryFlag.js';

const BASE = 'https://app.precificaiapp.com';

test('link de recovery no fragmento é reconhecido', () => {
  assert.equal(parseRecoveryFromUrl(`${BASE}/reset-password#access_token=abc&type=recovery`), true);
  // O GoTrue às vezes devolve na raiz, não no /reset-password.
  assert.equal(parseRecoveryFromUrl(`${BASE}/#access_token=abc&expires_in=3600&type=recovery`), true);
});

test('link de recovery na query também conta', () => {
  assert.equal(parseRecoveryFromUrl(`${BASE}/reset-password?type=recovery`), true);
});

test('link já usado ou expirado conta como intenção de recuperar', () => {
  // Senão o usuário cai no app sem explicação, em vez de ver "link inválido".
  assert.equal(
    parseRecoveryFromUrl(`${BASE}/reset-password#error=access_denied&error_code=otp_expired`),
    true,
  );
});

test('não confunde outros fluxos de auth com recovery', () => {
  assert.equal(parseRecoveryFromUrl(`${BASE}/#access_token=abc&type=signup`), false);
  assert.equal(parseRecoveryFromUrl(`${BASE}/#access_token=abc&type=magiclink`), false);
  assert.equal(parseRecoveryFromUrl(`${BASE}/`), false);
  assert.equal(parseRecoveryFromUrl(`${BASE}/login`), false);
});

test('entrada inválida não quebra nem dá falso positivo', () => {
  assert.equal(parseRecoveryFromUrl(undefined), false);
  assert.equal(parseRecoveryFromUrl(null), false);
  assert.equal(parseRecoveryFromUrl(''), false);
  assert.equal(parseRecoveryFromUrl(123), false);
});

// --- captura e persistência -------------------------------------------------

function fakeWindow(href) {
  const store = new Map();
  return {
    location: { href },
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  };
}

test('captura grava a intenção e ela sobrevive ao fragmento sumir', () => {
  clearRecoveryIntent();
  const win = fakeWindow(`${BASE}/reset-password#access_token=abc&type=recovery`);
  assert.equal(captureRecoveryIntent(win), true);
  assert.equal(win.sessionStorage.getItem(RECOVERY_STORAGE_KEY), '1');

  // O auth-js limpa o hash logo depois — a intenção tem que continuar de pé.
  win.location.href = `${BASE}/reset-password`;
  assert.equal(isRecoveryIntent(win), true);

  clearRecoveryIntent(win);
  assert.equal(isRecoveryIntent(win), false);
  assert.equal(win.sessionStorage.getItem(RECOVERY_STORAGE_KEY), null);
});

test('URL comum não marca intenção', () => {
  clearRecoveryIntent();
  const win = fakeWindow(`${BASE}/`);
  assert.equal(captureRecoveryIntent(win), false);
  assert.equal(isRecoveryIntent(win), false);
});

test('window ausente ou quebrado não derruba o app', () => {
  clearRecoveryIntent();
  assert.equal(captureRecoveryIntent(null), false);
  assert.equal(captureRecoveryIntent({}), false);
  assert.equal(captureRecoveryIntent({ location: { href: `${BASE}/#type=recovery` },
    sessionStorage: { setItem() { throw new Error('bloqueado'); } } }), true);
  clearRecoveryIntent();
});
