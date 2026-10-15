import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ehContaGoogle } from '../src/utils/emailGoogle.js';

test('reconhece endereços do Gmail', () => {
  assert.equal(ehContaGoogle('maria@gmail.com'), true);
  assert.equal(ehContaGoogle('  Maria.Silva@GMAIL.COM '), true);
  assert.equal(ehContaGoogle('joao@googlemail.com'), true);
});

test('não sugere Google para outros provedores', () => {
  assert.equal(ehContaGoogle('ana@hotmail.com'), false);
  assert.equal(ehContaGoogle('ana@icloud.com.br'), false);
  assert.equal(ehContaGoogle('ana@gmail.com.br'), false); // domínio diferente
  assert.equal(ehContaGoogle('ana@meugmail.com'), false);
});

test('só decide com o domínio completo', () => {
  assert.equal(ehContaGoogle('maria@gmail'), false);
  assert.equal(ehContaGoogle('maria@gm'), false);
  assert.equal(ehContaGoogle('gmail.com'), false);
  assert.equal(ehContaGoogle(''), false);
  assert.equal(ehContaGoogle(null), false);
});
