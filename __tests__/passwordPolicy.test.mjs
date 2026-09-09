/**
 * Testes — src/utils/passwordPolicy.js (auditoria A8). Roda via `npm test`.
 * Política: ≥8 chars, 1 maiúscula, 1 minúscula, 1 número, 1 símbolo.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MIN_PASSWORD_LENGTH, validatePassword, passwordCriteria } from '../src/utils/passwordPolicy.js';

test('MIN_PASSWORD_LENGTH é 8', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test('senha que cumpre todos os critérios é aceita', () => {
  assert.deepEqual(validatePassword('Abc123!x'), { ok: true, error: '' });
  assert.deepEqual(validatePassword('Senha#Forte2026'), { ok: true, error: '' });
});

test('cada critério falha com a mensagem específica, na ordem documentada', () => {
  assert.equal(validatePassword('Abc1!').error, 'A senha precisa de pelo menos 8 caracteres.');
  assert.equal(validatePassword('abcdefg1!').error, 'A senha precisa ter pelo menos 1 letra MAIÚSCULA.');
  assert.equal(validatePassword('ABCDEFG1!').error, 'A senha precisa ter pelo menos 1 letra minúscula.');
  assert.equal(validatePassword('Abcdefgh!').error, 'A senha precisa ter pelo menos 1 número.');
  assert.equal(validatePassword('Abcdefg1').error, 'A senha precisa ter pelo menos 1 símbolo (ex.: !@#$%&*).');
  for (const pw of ['Abc1!', 'abcdefg1!', 'ABCDEFG1!', 'Abcdefgh!', 'Abcdefg1']) {
    assert.equal(validatePassword(pw).ok, false);
  }
});

test('entrada não-string é tratada como vazia (falha no tamanho)', () => {
  assert.equal(validatePassword(null).ok, false);
  assert.equal(validatePassword(undefined).error, 'A senha precisa de pelo menos 8 caracteres.');
  assert.equal(validatePassword(12345678).ok, false);
});

test('passwordCriteria reflete o estado de cada critério em tempo real', () => {
  const c = passwordCriteria('Abc');
  assert.deepEqual(c.map((x) => x.ok), [false, true, true, false, false]);
  assert.deepEqual(c.map((x) => x.label), [
    'Mínimo 8 caracteres',
    'Pelo menos 1 letra maiúscula',
    'Pelo menos 1 letra minúscula',
    'Pelo menos 1 número',
    'Pelo menos 1 símbolo',
  ]);
  assert.ok(passwordCriteria('Abc123!x').every((x) => x.ok));
  assert.ok(passwordCriteria('').every((x) => !x.ok));
});
