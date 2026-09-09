/**
 * Testes — src/utils/authErrors.js (auditoria A8). Roda via `npm test`.
 * Invariante: NUNCA vazar a mensagem crua (ex.: "Invalid API key") pro usuário.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classifyAuthError, mapAuthError, AUTH_ERROR_KIND } from '../src/utils/authErrors.js';

test('infra (Invalid API key / JWT / 5xx) → SERVER, sem vazar texto técnico', () => {
  const a = classifyAuthError({ message: 'Invalid API key', status: 401 });
  assert.equal(a.kind, AUTH_ERROR_KIND.SERVER);
  assert.ok(!a.message.toLowerCase().includes('api key'));
  assert.equal(a.raw, 'Invalid API key');
  assert.equal(classifyAuthError({ message: 'Boom', status: 503 }).kind, AUTH_ERROR_KIND.SERVER);
  assert.equal(classifyAuthError({ message: 'JWT expired' }).kind, AUTH_ERROR_KIND.SERVER);
  // 5xx vence mesmo se a mensagem parece credencial
  assert.equal(classifyAuthError({ message: 'Invalid login credentials', status: 500 }).kind, AUTH_ERROR_KIND.SERVER);
});

test('rede (Failed to fetch / Network request failed / TypeError fetch) → NETWORK', () => {
  assert.equal(classifyAuthError({ message: 'Failed to fetch', name: 'TypeError' }).kind, AUTH_ERROR_KIND.NETWORK);
  assert.equal(classifyAuthError({ message: 'Network request failed' }).kind, AUTH_ERROR_KIND.NETWORK);
  assert.equal(classifyAuthError(new TypeError('fetch failed')).kind, AUTH_ERROR_KIND.NETWORK);
});

test('rate limit por mensagem ou status 429 → RATE_LIMIT', () => {
  assert.equal(classifyAuthError({ message: 'Email rate limit exceeded' }).kind, AUTH_ERROR_KIND.RATE_LIMIT);
  assert.equal(classifyAuthError({ message: 'x', status: 429 }).kind, AUTH_ERROR_KIND.RATE_LIMIT);
  assert.equal(classifyAuthError({ message: 'over_email_send_rate_limit' }).kind, AUTH_ERROR_KIND.RATE_LIMIT);
});

test('email não confirmado → UNCONFIRMED', () => {
  const r = classifyAuthError({ message: 'Email not confirmed' });
  assert.equal(r.kind, AUTH_ERROR_KIND.UNCONFIRMED);
  assert.match(r.message, /Confirme seu email/);
});

test('validação: já cadastrado / senha fraca / email inválido → VALIDATION com mensagens específicas', () => {
  assert.match(classifyAuthError({ message: 'User already registered' }).message, /já tem cadastro/);
  assert.match(classifyAuthError({ message: 'Password should be at least 6 characters' }).message, /senha precisa/);
  assert.match(classifyAuthError({ message: 'Unable to validate email address: invalid format' }).message, /não parece válido/);
  assert.equal(classifyAuthError({ message: 'User already registered' }).kind, AUTH_ERROR_KIND.VALIDATION);
});

test('credenciais inválidas: mensagem depende do contexto (signIn sugere "Esqueceu a senha?")', () => {
  const login = classifyAuthError({ message: 'Invalid login credentials', status: 400 });
  assert.equal(login.kind, AUTH_ERROR_KIND.CREDENTIAL);
  assert.match(login.message, /Esqueceu a senha/);
  const outro = classifyAuthError({ message: 'invalid_grant' }, { context: 'reset' });
  assert.equal(outro.kind, AUTH_ERROR_KIND.CREDENTIAL);
  assert.equal(outro.message, 'Credenciais inválidas.');
});

test('desconhecido → UNKNOWN com mensagem genérica (nunca ecoa o raw)', () => {
  const r = classifyAuthError({ message: 'Something exotic XYZ-42' });
  assert.equal(r.kind, AUTH_ERROR_KIND.UNKNOWN);
  assert.ok(!r.message.includes('XYZ-42'));
  assert.equal(classifyAuthError(null).kind, AUTH_ERROR_KIND.UNKNOWN);
  assert.equal(typeof mapAuthError({ message: 'zzz' }), 'string');
});

test('mensagem de senha fraca deve refletir a política do app (8 caracteres)',
  () => {
  assert.match(classifyAuthError({ message: 'weak password' }).message, /8 caracteres/);
});
