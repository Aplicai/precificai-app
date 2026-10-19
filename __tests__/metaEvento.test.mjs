/**
 * Testes — supabase/functions/meta-evento/evento.ts (Conversions API do Meta).
 *
 * Trava as regras que importam: sem aceite de cookies não sai nada (LGPD), só
 * eventos da lista, event_id igual ao do Pixel (dedup), dados pessoais em SHA-256.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/metaEvento.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import {
  EVENTOS_PERMITIDOS, eventoPermitido, eventIdEsperado, validarPedido, dadosDoEvento,
  normalizarEmail, sha256Hex, ipDoCliente, cookieFbValido, urlOrigem, montarEvento,
} from '../supabase/functions/meta-evento/evento.ts';

const UID = '3f6c1a8e-0000-4000-8000-000000000001';
const FBP = 'fb.1.1760000000000.1234567890';
const FBC = 'fb.1.1760000000000.IwAR0abc_DEF-123';
const sha = (t) => createHash('sha256').update(t).digest('hex');
const pedido = (o = {}) => ({ event_name: 'CompleteRegistration', event_id: `reg_${UID}`, consent: 'granted', ...o });

test('lista fechada de eventos', () => {
  assert.deepEqual([...EVENTOS_PERMITIDOS], ['CompleteRegistration', 'PrimeiroPreco', 'Ativacao']);
  assert.equal(eventoPermitido('Purchase'), false); // compra sai só do asaas-webhook
  assert.equal(eventoPermitido('PageView'), false);
  assert.equal(eventoPermitido(undefined), false);
  assert.equal(eventoPermitido('Ativacao'), true);
});

test('event_id é o mesmo do Pixel', () => {
  assert.equal(eventIdEsperado('CompleteRegistration', 'u1'), 'reg_u1');
  assert.equal(eventIdEsperado('PrimeiroPreco', 'u1'), 'pp_u1');
  assert.equal(eventIdEsperado('Ativacao', 'u1'), 'act_u1');
});

test('LGPD: sem consent "granted" nada é aceito, seja qual for o resto', () => {
  for (const consent of [undefined, null, 'denied', 'GRANTED', true, 'pending']) {
    assert.deepEqual(validarPedido(pedido({ consent }), UID), { ok: false, error: 'sem_consentimento' });
  }
  assert.deepEqual(validarPedido(null, UID), { ok: false, error: 'sem_consentimento' });
  assert.deepEqual(validarPedido('lixo', UID), { ok: false, error: 'sem_consentimento' });
});

test('evento fora da lista ou event_id de outra conta é recusado', () => {
  assert.equal(validarPedido(pedido({ event_name: 'Purchase' }), UID).error, 'evento_invalido');
  assert.equal(validarPedido(pedido({ event_id: 'reg_outra-conta' }), UID).error, 'event_id_invalido');
  assert.equal(validarPedido(pedido({ event_id: `pp_${UID}` }), UID).error, 'event_id_invalido');
  assert.equal(validarPedido(pedido({ event_id: 'reg_' }), '').error, 'event_id_invalido');
});

test('pedido válido: cookies do Pixel conferidos, URL só do próprio domínio', () => {
  const v = validarPedido(pedido({ fbp: FBP, fbc: FBC, event_source_url: 'https://app.precificaiapp.com/cadastro' }), UID);
  assert.equal(v.ok, true);
  assert.deepEqual(v.pedido, {
    eventName: 'CompleteRegistration', eventId: `reg_${UID}`, fbp: FBP, fbc: FBC,
    eventSourceUrl: 'https://app.precificaiapp.com/cadastro', contentName: null,
  });
  const ruim = validarPedido(pedido({ fbp: 'x<script>', fbc: 123, event_source_url: 'https://evil.com/' }), UID);
  assert.equal(ruim.pedido.fbp, null);
  assert.equal(ruim.pedido.fbc, null);
  assert.equal(ruim.pedido.eventSourceUrl, 'https://app.precificaiapp.com/');
});

test('cookies e URL: formatos aceitos', () => {
  assert.equal(cookieFbValido(FBP), true);
  assert.equal(cookieFbValido('fb.1.123.abc'), false); // timestamp curto
  assert.equal(cookieFbValido(`fb.1.1760000000000.${'a'.repeat(400)}`), false);
  assert.equal(urlOrigem('https://precificaiapp.com'), 'https://precificaiapp.com');
  assert.equal(urlOrigem('https://precificaiapp.com.evil.com/'), 'https://app.precificaiapp.com/');
  assert.equal(urlOrigem('https://app.precificaiapp.com.evil.com/'), 'https://app.precificaiapp.com/');
  assert.equal(urlOrigem(null), 'https://app.precificaiapp.com/');
});

test('custom_data é do servidor: cadastro com valor e moeda; cliente só troca content_name', () => {
  assert.deepEqual(dadosDoEvento('CompleteRegistration'), { value: 0, currency: 'BRL', content_name: 'conta_gratis' });
  assert.deepEqual(dadosDoEvento('PrimeiroPreco'), { value: 0, currency: 'BRL', content_name: 'primeiro_preco' });
  assert.deepEqual(dadosDoEvento('Ativacao', '3_produtos'), { content_name: '3_produtos' });
  const v = validarPedido(pedido({ custom_data: { value: 999, currency: 'USD', content_name: 'Nome Livre!' } }), UID);
  assert.deepEqual(dadosDoEvento(v.pedido.eventName, v.pedido.contentName), dadosDoEvento('CompleteRegistration'));
});

test('e-mail normalizado antes do hash; sha256 igual ao do Node', async () => {
  assert.equal(normalizarEmail('  Ana.Doces@Gmail.COM '), 'ana.doces@gmail.com');
  assert.equal(normalizarEmail(null), '');
  assert.equal(await sha256Hex('ana.doces@gmail.com'), sha('ana.doces@gmail.com'));
});

test('IP: primeiro da cadeia x-forwarded-for; lixo vira null', () => {
  const h = (o) => (n) => o[n] ?? null;
  assert.equal(ipDoCliente(h({ 'x-forwarded-for': '200.1.2.3, 10.0.0.1' })), '200.1.2.3');
  assert.equal(ipDoCliente(h({ 'x-real-ip': '2804:14c::1' })), '2804:14c::1');
  assert.equal(ipDoCliente(h({ 'x-forwarded-for': '<script>' })), null);
  assert.equal(ipDoCliente(h({})), null);
});

test('evento montado: dados pessoais só em hash, action_source website', async () => {
  const v = validarPedido(pedido({ fbp: FBP, fbc: FBC }), UID);
  const ev = await montarEvento({
    pedido: v.pedido, userId: UID, email: ' Ana@Exemplo.com ', ip: '200.1.2.3',
    userAgent: 'Mozilla/5.0', agoraMs: 1760000000123,
  });
  assert.deepEqual(ev, {
    event_name: 'CompleteRegistration',
    event_time: 1760000000,
    event_id: `reg_${UID}`,
    action_source: 'website',
    event_source_url: 'https://app.precificaiapp.com/',
    user_data: {
      external_id: [sha(UID)],
      em: [sha('ana@exemplo.com')],
      client_ip_address: '200.1.2.3',
      client_user_agent: 'Mozilla/5.0',
      fbp: FBP,
      fbc: FBC,
    },
    custom_data: { value: 0, currency: 'BRL', content_name: 'conta_gratis' },
  });
  assert.ok(!JSON.stringify(ev).includes('Ana@Exemplo'), 'e-mail nunca em texto');
});

test('sem e-mail, IP ou cookies: só o que existe vai', async () => {
  const v = validarPedido(pedido({ event_name: 'Ativacao', event_id: `act_${UID}` }), UID);
  const ev = await montarEvento({ pedido: v.pedido, userId: UID, email: null, ip: null, userAgent: null, agoraMs: 0 });
  assert.deepEqual(ev.user_data, { external_id: [sha(UID)] });
  assert.deepEqual(ev.custom_data, { content_name: '3_produtos' });
});
