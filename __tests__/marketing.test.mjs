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

// ---------- eventos pelo servidor (Conversions API, função meta-evento) ----------

function fakeWindow(consent = 'granted', extra = {}) {
  const store = {};
  const enviados = [];
  globalThis.window = {
    pcf: { consent: () => consent, track: (...a) => enviados.push(a), attribution: () => null },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = v; } },
    location: { origin: 'https://app.precificaiapp.com', pathname: '/produtos' },
    ...extra,
  };
  return { store, enviados };
}

function fakeFunctions(resposta = { data: { ok: true }, error: null }) {
  const chamadas = [];
  return {
    chamadas,
    invoke: async (nome, opts) => {
      chamadas.push([nome, opts.body]);
      return typeof resposta === 'function' ? resposta() : resposta;
    },
  };
}

test('corpo do evento de servidor: só existe com aceite (LGPD)', async () => {
  const { montarCorpoEventoServidor } = await import('../src/utils/marketing.js');
  for (const consent of [null, undefined, 'denied']) {
    assert.equal(montarCorpoEventoServidor({ consent, name: 'Ativacao', eventId: 'act_u1' }), null);
  }
  assert.deepEqual(montarCorpoEventoServidor({
    consent: 'granted', name: 'CompleteRegistration', eventId: 'reg_u1',
    customData: { value: 0, currency: 'BRL' }, fbp: 'fb.1.1.a', fbc: null, url: 'https://app.precificaiapp.com/',
  }), {
    event_name: 'CompleteRegistration', event_id: 'reg_u1', consent: 'granted',
    custom_data: { value: 0, currency: 'BRL' }, fbp: 'fb.1.1.a', event_source_url: 'https://app.precificaiapp.com/',
  });
});

test('lerCookie acha _fbp/_fbc sem confundir prefixos', async () => {
  const { lerCookie } = await import('../src/utils/marketing.js');
  const jar = 'x_fbp=nao; _fbp=fb.1.123.456; _fbc=fb.1.123.IwAR%20x';
  assert.equal(lerCookie('_fbp', jar), 'fb.1.123.456');
  assert.equal(lerCookie('_fbc', jar), 'fb.1.123.IwAR x');
  assert.equal(lerCookie('_ga', jar), null);
});

test('enviarEventoServidor: sem aceite não chama a função', async () => {
  const { enviarEventoServidor } = await import('../src/utils/marketing.js');
  for (const consent of [null, 'denied']) {
    fakeWindow(consent);
    const functions = fakeFunctions();
    assert.equal(await enviarEventoServidor({ functions }, 'Ativacao', 'act_u1'), false);
    assert.equal(functions.chamadas.length, 0);
  }
  fakeWindow('granted');
  const functions = fakeFunctions();
  assert.equal(await enviarEventoServidor({ functions }, 'Ativacao', 'act_u1', { content_name: '3_produtos' }), true);
  assert.deepEqual(functions.chamadas[0], ['meta-evento', {
    event_name: 'Ativacao', event_id: 'act_u1', consent: 'granted',
    custom_data: { content_name: '3_produtos' }, event_source_url: 'https://app.precificaiapp.com/produtos',
  }]);
  // erro do servidor ou de rede vira false, nunca exceção
  assert.equal(await enviarEventoServidor({ functions: fakeFunctions({ data: null, error: new Error('x') }) }, 'Ativacao', 'act_u1'), false);
  assert.equal(await enviarEventoServidor({ functions: fakeFunctions(() => { throw new Error('rede'); }) }, 'Ativacao', 'act_u1'), false);
  delete globalThis.window;
});

test('cadastro: Pixel com valor e moeda + servidor com o MESMO event_id', async () => {
  const { trackRegistrationOnce } = await import('../src/utils/marketing.js');
  const { store, enviados } = fakeWindow('granted');
  const functions = fakeFunctions();
  await trackRegistrationOnce({ id: 'u1' }, { functions });
  assert.deepEqual(enviados[0], ['CompleteRegistration', { value: 0, currency: 'BRL', content_name: 'conta_gratis' }, 'reg_u1']);
  assert.equal(functions.chamadas.length, 1);
  assert.equal(functions.chamadas[0][1].event_id, 'reg_u1');
  assert.equal(store.pcf_reg_srv_u1, '1');
  await trackRegistrationOnce({ id: 'u1' }, { functions });
  assert.equal(enviados.length, 1);
  assert.equal(functions.chamadas.length, 1); // uma vez só
  delete globalThis.window;
});

test('cadastro por e-mail sem sessão: servidor fica pendente e vai na primeira sessão', async () => {
  const { trackRegistrationOnce } = await import('../src/utils/marketing.js');
  const { store, enviados } = fakeWindow('granted');
  await trackRegistrationOnce({ id: 'u2' }, null); // signUp sem sessão
  assert.equal(enviados.length, 1);
  assert.equal(store.pcf_reg_srv_u2, 'pendente');
  const functions = fakeFunctions();
  await trackRegistrationOnce({ id: 'u2' }, { functions }); // primeira sessão
  assert.equal(enviados.length, 1); // Pixel não repete
  assert.equal(functions.chamadas.length, 1);
  assert.equal(store.pcf_reg_srv_u2, '1');
  delete globalThis.window;
});

test('cadastro sem resposta de cookies: Pixel na fila, servidor não', async () => {
  const { trackRegistrationOnce } = await import('../src/utils/marketing.js');
  const { store, enviados } = fakeWindow(null);
  const functions = fakeFunctions();
  await trackRegistrationOnce({ id: 'u3' }, { functions });
  assert.equal(enviados.length, 1);
  assert.equal(functions.chamadas.length, 0);
  assert.deepEqual(store, {});
  delete globalThis.window;
});

test('conta com Ativacao marcada antes do servidor existir não manda evento atrasado', async () => {
  const { checkActivation } = await import('../src/utils/marketing.js');
  const { store } = fakeWindow('granted');
  store.pcf_act_u9 = '1';
  const sb = { ...fakeSupabase([{}, {}, {}]), functions: fakeFunctions() };
  await checkActivation(sb);
  assert.equal(sb.functions.chamadas.length, 0);
  delete globalThis.window;
});

test('Ativacao: servidor com o mesmo event_id; falhou, tenta de novo sem repetir o Pixel', async () => {
  const { checkActivation } = await import('../src/utils/marketing.js');
  const { store, enviados } = fakeWindow('granted');
  let ok = false;
  const functions = fakeFunctions(() => ({ data: { ok }, error: null }));
  const sb = { ...fakeSupabase([{}, {}, {}]), functions };
  await checkActivation(sb);
  assert.equal(enviados.length, 1);
  assert.equal(functions.chamadas[0][1].event_id, 'act_u9');
  assert.equal(store.pcf_act_srv_u9, 'pendente');
  ok = true;
  await checkActivation(sb);
  assert.equal(enviados.length, 1);
  assert.equal(functions.chamadas.length, 2);
  assert.equal(store.pcf_act_srv_u9, '1');
  await checkActivation(sb);
  assert.equal(functions.chamadas.length, 2);
  delete globalThis.window;
});

test('primeiro preço: só produto próprio com preço > 0', async () => {
  const { temPrimeiroPreco } = await import('../src/utils/marketing.js');
  assert.equal(temPrimeiroPreco([{ preco_venda: 12, observacoes: 'Exemplo do Kit de Início — ajuste' }]), false);
  assert.equal(temPrimeiroPreco([{ preco_venda: 0 }, { preco_venda: null }]), false);
  assert.equal(temPrimeiroPreco([{ preco_venda: '8.5', observacoes: null }]), true);
  assert.equal(temPrimeiroPreco(null), false);
});

function fakeSupabasePP(rows, createdAt, uid = 'u5') {
  const consultas = [];
  const q = {
    select: () => q, eq: () => q, gt: () => q,
    limit: async () => { consultas.push(1); return { data: rows, error: null }; },
  };
  return {
    consultas,
    auth: { getSession: async () => ({ data: { session: { user: { id: uid, created_at: createdAt } } } }) },
    from: () => q,
    functions: fakeFunctions(),
  };
}

test('PrimeiroPreco: uma vez por conta nova, Pixel + servidor com pp_<uid>', async () => {
  const { checkPrimeiroPreco } = await import('../src/utils/marketing.js');
  const { enviados } = fakeWindow('granted');
  const recente = new Date(Date.now() - 60_000).toISOString();
  await checkPrimeiroPreco(fakeSupabasePP([{ preco_venda: 0 }], recente));
  assert.equal(enviados.length, 0);
  const sb = fakeSupabasePP([{ preco_venda: 15 }], recente);
  await checkPrimeiroPreco(sb);
  assert.deepEqual(enviados[0], ['PrimeiroPreco', { value: 0, currency: 'BRL', content_name: 'primeiro_preco' }, 'pp_u5']);
  assert.equal(sb.functions.chamadas[0][1].event_id, 'pp_u5');
  await checkPrimeiroPreco(sb);
  assert.equal(enviados.length, 1);
  assert.equal(sb.consultas.length, 1);
  delete globalThis.window;
});

test('PrimeiroPreco: conta antiga ou sem aceite não dispara nem marca', async () => {
  const { checkPrimeiroPreco } = await import('../src/utils/marketing.js');
  let w = fakeWindow('granted');
  await checkPrimeiroPreco(fakeSupabasePP([{ preco_venda: 15 }], '2025-01-01T00:00:00Z', 'u6'));
  assert.equal(w.enviados.length, 0);
  assert.deepEqual(w.store, {});
  w = fakeWindow(null);
  const sb = fakeSupabasePP([{ preco_venda: 15 }], new Date().toISOString(), 'u6');
  await checkPrimeiroPreco(sb);
  assert.equal(w.enviados.length, 0);
  assert.equal(sb.functions.chamadas.length, 0);
  assert.deepEqual(w.store, {});
  delete globalThis.window;
});
