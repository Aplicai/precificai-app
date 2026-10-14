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

test('produtos próprios: exemplos do Kit de Início não contam', async () => {
  const { countOwnProducts } = await import('../src/utils/marketing.js');
  assert.equal(countOwnProducts([
    { observacoes: 'Exemplo do Kit de Início — ajuste conforme sua receita.' },
    { observacoes: 'Exemplo do Kit de Início — ajuste conforme sua receita.' },
    { observacoes: '' }, { observacoes: null }, {},
  ]), 3);
  assert.equal(countOwnProducts(null), 0);
});

function fakeSupabase(rows, uid = 'u9') {
  const consultas = [];
  return {
    consultas,
    auth: { getSession: async () => ({ data: { session: { user: { id: uid } } } }) },
    from: (t) => ({ select: () => ({ eq: () => ({ limit: async () => { consultas.push(t); return { data: rows, error: null }; } }) }) }),
  };
}

test('Ativacao: dispara uma vez com 3 produtos próprios e aceite', async () => {
  const { checkActivation } = await import('../src/utils/marketing.js');
  const enviados = [];
  const store = {};
  globalThis.window = {
    pcf: { consent: () => 'granted', track: (...a) => enviados.push(a) },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  };
  await checkActivation(fakeSupabase([{}, {}]));
  assert.equal(enviados.length, 0); // 2 próprios: ainda não

  await checkActivation(fakeSupabase([{}, {}, {}]));
  assert.deepEqual(enviados[0], ['Ativacao', { content_name: '3_produtos' }, 'act_u9']);

  const sb = fakeSupabase([{}, {}, {}, {}]);
  await checkActivation(sb);
  assert.equal(enviados.length, 1); // não repete
  assert.equal(sb.consultas.length, 0); // nem consulta o banco de novo
  delete globalThis.window;
});

test('Ativacao: sem aceite de cookies não envia nem marca', async () => {
  const { checkActivation } = await import('../src/utils/marketing.js');
  const store = {};
  const enviados = [];
  globalThis.window = {
    pcf: { consent: () => null, track: (...a) => enviados.push(a) },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  };
  await checkActivation(fakeSupabase([{}, {}, {}]));
  assert.equal(enviados.length, 0);
  assert.deepEqual(store, {});
  delete globalThis.window;
});

test('cadastro sem resposta de cookies não é marcado como enviado (tenta de novo depois)', async () => {
  const { trackRegistrationOnce } = await import('../src/utils/marketing.js');
  const enviados = []; const store = {}; let consent = null;
  globalThis.window = {
    pcf: { consent: () => consent, track: (...a) => enviados.push(a) },
    localStorage: { getItem: (k) => store[k] || null, setItem: (k, v) => { store[k] = v; } },
  };
  trackRegistrationOnce({ id: 'u7' });
  assert.equal(enviados.length, 1);          // vai pra fila do script
  assert.deepEqual(store, {});               // mas não marca
  consent = 'granted';
  trackRegistrationOnce({ id: 'u7' });
  assert.equal(enviados.length, 2);          // nova tentativa, mesmo event_id (Meta deduplica)
  assert.equal(enviados[1][2], 'reg_u7');
  trackRegistrationOnce({ id: 'u7' });
  assert.equal(enviados.length, 2);          // agora sim, uma vez só
  consent = 'denied';
  trackRegistrationOnce({ id: 'u8' });
  assert.equal(enviados.length, 2);          // recusa: nada
  delete globalThis.window;
});
