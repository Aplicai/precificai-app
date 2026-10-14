/**
 * Testes — src/utils/passwordPolicy.js (auditoria A8). Roda via `npm test`.
 * Política: ≥8 chars, 1 letra, 1 número. Sem símbolo, sem maiúscula/minúscula,
 * sem barreira de força (decisão do dono, 2026-10).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MIN_PASSWORD_LENGTH, validatePassword, passwordCriteria } from '../src/utils/passwordPolicy.js';

test('MIN_PASSWORD_LENGTH é 8', () => {
  assert.equal(MIN_PASSWORD_LENGTH, 8);
});

test('senha com 8+ caracteres, 1 letra e 1 número é aceita', () => {
  assert.deepEqual(validatePassword('abcd1234'), { ok: true, error: '' });
  assert.deepEqual(validatePassword('teste2026'), { ok: true, error: '' });
  // Maiúscula, símbolo e acento não são exigidos, mas também não atrapalham.
  assert.deepEqual(validatePassword('Abc123!x'), { ok: true, error: '' });
  assert.deepEqual(validatePassword('Senha#Forte2026'), { ok: true, error: '' });
  assert.deepEqual(validatePassword('1234567a'), { ok: true, error: '' });
  assert.deepEqual(validatePassword('1234567A'), { ok: true, error: '' });
});

test('letra acentuada conta como letra', () => {
  assert.deepEqual(validatePassword('çãéíóú12'), { ok: true, error: '' });
});

test('cada critério falha com a mensagem específica, na ordem documentada', () => {
  assert.equal(validatePassword('abc1').error, 'A senha precisa de pelo menos 8 caracteres.');
  assert.equal(validatePassword('abcdef1').error, 'A senha precisa de pelo menos 8 caracteres.');
  assert.equal(validatePassword('12345678').error, 'A senha precisa ter pelo menos 1 letra.');
  assert.equal(validatePassword('!@#$%&*(1234').error, 'A senha precisa ter pelo menos 1 letra.');
  assert.equal(validatePassword('abcdefgh').error, 'A senha precisa ter pelo menos 1 número.');
  assert.equal(validatePassword('Abcdefgh!').error, 'A senha precisa ter pelo menos 1 número.');
  for (const pw of ['abc1', '12345678', 'abcdefgh', 'Abcdefgh!']) {
    assert.equal(validatePassword(pw).ok, false);
  }
});

test('símbolo e maiúscula NÃO são exigidos', () => {
  assert.equal(validatePassword('semsimbolo1').ok, true);
  assert.equal(validatePassword('semmaiuscula1').ok, true);
  assert.equal(validatePassword('SEMMINUSCULA1').ok, true);
});

test('entrada não-string é tratada como vazia (falha no tamanho)', () => {
  assert.equal(validatePassword(null).ok, false);
  assert.equal(validatePassword(undefined).error, 'A senha precisa de pelo menos 8 caracteres.');
  assert.equal(validatePassword(12345678).ok, false);
});

test('passwordCriteria expõe exatamente os 3 critérios reais, em tempo real', () => {
  const c = passwordCriteria('Abc');
  assert.deepEqual(c.map((x) => x.ok), [false, true, false]);
  assert.deepEqual(c.map((x) => x.label), [
    'Mínimo 8 caracteres',
    'Pelo menos 1 letra',
    'Pelo menos 1 número',
  ]);
  assert.deepEqual(passwordCriteria('1234').map((x) => x.ok), [false, false, true]);
  assert.ok(passwordCriteria('abcd1234').every((x) => x.ok));
  assert.ok(passwordCriteria('').every((x) => !x.ok));
});

test('validatePassword e passwordCriteria concordam', () => {
  for (const pw of ['', 'abc', 'abcdefgh', '12345678', 'abcd1234', 'Senha#Forte2026', 'çãéíóú12']) {
    assert.equal(validatePassword(pw).ok, passwordCriteria(pw).every((x) => x.ok), pw);
  }
});
