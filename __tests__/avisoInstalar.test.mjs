/**
 * Testes — src/utils/avisoInstalar.js (aviso "Instale o app" fora do primeiro acesso, 17/10/2026).
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/avisoInstalar.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { avisoInstalarPermitido } from '../src/utils/avisoInstalar.js';

test('sem conta (cadastro/login) o aviso pode aparecer', () => {
  assert.equal(avisoInstalarPermitido({ logado: false, liberado: false }), true);
});

test('logado, só depois do primeiro preço', () => {
  assert.equal(avisoInstalarPermitido({ logado: true, liberado: false }), false);
  assert.equal(avisoInstalarPermitido({ logado: true, liberado: true }), true);
});

test('logado e chegou pelo botão "Abrir no Chrome" (?instalar=1): pode aparecer', () => {
  assert.equal(avisoInstalarPermitido({ logado: true, liberado: false, pediu: true }), true);
  assert.equal(avisoInstalarPermitido({ logado: true, liberado: false, pediu: false }), false);
});
