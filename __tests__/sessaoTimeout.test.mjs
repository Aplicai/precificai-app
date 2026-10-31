/**
 * Testes — src/utils/sessaoTimeout.js (quanto tempo a sessão fica viva sem uso).
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/sessaoTimeout.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { timeoutInatividade, ehCelular, TIMEOUT_30_DIAS, TIMEOUT_24_HORAS } from '../src/utils/sessaoTimeout.js';

test('celular é aparelho pessoal: 30 dias mesmo sem marcar "lembrar"', () => {
  assert.equal(timeoutInatividade({ lembrar: false, celular: true }), TIMEOUT_30_DIAS);
});

test('computador: 24 horas por padrão, 30 dias com "lembrar de mim"', () => {
  assert.equal(timeoutInatividade({ lembrar: false, celular: false }), TIMEOUT_24_HORAS);
  assert.equal(timeoutInatividade({ lembrar: true, celular: false }), TIMEOUT_30_DIAS);
});

test('ehCelular reconhece iPhone e Android, e não o computador', () => {
  assert.equal(ehCelular('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), true);
  assert.equal(ehCelular('Mozilla/5.0 (Linux; Android 14; Pixel 8)'), true);
  assert.equal(ehCelular('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'), false);
  assert.equal(ehCelular(''), false);
});
