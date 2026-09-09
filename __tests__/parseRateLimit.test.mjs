/**
 * Testes — src/utils/parseRateLimit.js (auditoria A8). Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseRateLimitSeconds } from '../src/utils/parseRateLimit.js';

test('extrai os segundos exatos da mensagem "after X seconds" do Supabase', () => {
  assert.equal(parseRateLimitSeconds({ message: 'For security purposes, you can only request this after 42 seconds' }), 42);
  assert.equal(parseRateLimitSeconds({ message: 'you can only request this after 1 second' }), 1);
});

test('rate limit sem número explícito cai no fallback de 60s', () => {
  assert.equal(parseRateLimitSeconds({ message: 'Email rate limit exceeded' }), 60);
  assert.equal(parseRateLimitSeconds('Too Many Requests'), 60);
  assert.equal(parseRateLimitSeconds({ message: 'HTTP 429' }), 60);
  assert.equal(parseRateLimitSeconds({ message: 'after 0 seconds' }), 60);
});

test('status 429 fora da mensagem também é rate limit', () => {
  assert.equal(parseRateLimitSeconds({ message: 'unexpected', status: 429 }), 60);
  assert.equal(parseRateLimitSeconds({ message: 'unexpected', statusCode: 429 }), 60);
});

test('erros que NÃO são rate limit devolvem null', () => {
  assert.equal(parseRateLimitSeconds({ message: 'Invalid login credentials', status: 400 }), null);
  assert.equal(parseRateLimitSeconds(null), null);
  assert.equal(parseRateLimitSeconds(undefined), null);
  assert.equal(parseRateLimitSeconds(''), null);
});
