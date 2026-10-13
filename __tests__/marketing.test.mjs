/**
 * Testes — src/utils/marketing.js (ponte app ↔ medição de anúncios).
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/marketing.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isFreshSignup, sanitizeAttribution, registrationEventId, getAttribution,
  trackEvent, syncMarketingForUser, JANELA_CADASTRO_NOVO_MS,
} from '../src/utils/marketing.js';

const AGORA = Date.parse('2026-10-13T12:00:00Z');

test('cadastro novo = conta criada dentro da janela', () => {
  assert.equal(isFreshSignup('2026-10-13T11:59:00Z', AGORA), true);
  assert.equal(isFreshSignup(new Date(AGORA - JANELA_CADASTRO_NOVO_MS).toISOString(), AGORA), true);
  assert.equal(isFreshSignup(new Date(AGORA - JANELA_CADASTRO_NOVO_MS - 1000).toISOString(), AGORA), false);
  assert.equal(isFreshSignup('2025-01-01T00:00:00Z', AGORA), false); // cliente antigo logando
});

test('data inválida ou no futuro não conta como cadastro novo', () => {
  assert.equal(isFreshSignup(undefined, AGORA), false);
  assert.equal(isFreshSignup('lixo', AGORA), false);
  assert.equal(isFreshSignup('2026-10-14T12:00:00Z', AGORA), false);
});

test('atribuição: só campos conhecidos, texto aparado e limitado', () => {
  const limpo = sanitizeAttribution({
    utm_source: ' meta ', utm_content: 'anuncio-03', fbclid: 'x'.repeat(500),
    ts: 123, consent: 'granted', invasor: 'DROP TABLE', utm_term: { a: 1 }, utm_medium: '',
  });
  assert.deepEqual(Object.keys(limpo).sort(), ['consent', 'fbclid', 'ts', 'utm_content', 'utm_source']);
  assert.equal(limpo.utm_source, 'meta');
  assert.equal(limpo.fbclid.length, 300);
});

test('atribuição vazia ou inválida vira null', () => {
  assert.equal(sanitizeAttribution(null), null);
  assert.equal(sanitizeAttribution('texto'), null);
  assert.equal(sanitizeAttribution({ outro: 1 }), null);
});

test('id do evento de cadastro é estável por conta', () => {
  assert.equal(registrationEventId('abc'), 'reg_abc');
});

test('sem navegador/script nada quebra (nativo, bloqueador de anúncio)', async () => {
  assert.equal(getAttribution(), null);
  assert.doesNotThrow(() => trackEvent('InitiateCheckout'));
  let chamou = false;
  await syncMarketingForUser({ id: 'u1', created_at: new Date().toISOString() }, {
    auth: { updateUser: async () => { chamou = true; } },
  });
  assert.equal(chamou, false);
});

test('grava a origem no perfil uma vez, e só quando há campanha', async () => {
  const chamadas = [];
  const supabase = { auth: { updateUser: async (p) => { chamadas.push(p); } } };
  const user = { id: 'u1', created_at: '2020-01-01T00:00:00Z', user_metadata: {} };

  globalThis.window = { pcf: { attribution: () => ({ consent: 'granted' }), track() {} } };
  await syncMarketingForUser(user, supabase);
  assert.equal(chamadas.length, 0); // consentimento sozinho não é origem

  globalThis.window.pcf.attribution = () => ({ utm_source: 'meta', utm_content: 'anuncio-03', consent: 'granted' });
  await syncMarketingForUser(user, supabase);
  assert.deepEqual(chamadas[0], { data: { attribution: { utm_source: 'meta', utm_content: 'anuncio-03', consent: 'granted' } } });

  await syncMarketingForUser({ ...user, user_metadata: { attribution: { utm_source: 'google' } } }, supabase);
  assert.equal(chamadas.length, 1); // primeira origem vale
  delete globalThis.window;
});
