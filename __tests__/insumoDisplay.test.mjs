/**
 * Testes — src/utils/insumoDisplay.js (auditoria A8). Roda via `npm test`.
 * Regra central: a marca sentinel do kit rápido NUNCA vaza pra UI.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MARCA_VALOR_ESTIMADO, isMarcaEstimada, formatInsumoNome, formatInsumoNomeDash } from '../src/utils/insumoDisplay.js';

test('isMarcaEstimada reconhece só o sentinel exato', () => {
  assert.equal(MARCA_VALOR_ESTIMADO, '__VALOR_ESTIMADO_KIT__');
  assert.equal(isMarcaEstimada('__VALOR_ESTIMADO_KIT__'), true);
  assert.equal(isMarcaEstimada('Dona Benta'), false);
  assert.equal(isMarcaEstimada(''), false);
  assert.equal(isMarcaEstimada(null), false);
});

test('formatInsumoNome — "Nome (Marca)" com marca real; só nome com sentinel/vazio', () => {
  assert.equal(formatInsumoNome('Farinha', 'Dona Benta'), 'Farinha (Dona Benta)');
  assert.equal(formatInsumoNome('Farinha', MARCA_VALOR_ESTIMADO), 'Farinha');
  assert.equal(formatInsumoNome('Farinha', ''), 'Farinha');
  assert.equal(formatInsumoNome('Farinha', null), 'Farinha');
  assert.equal(formatInsumoNome(null, 'X'), ' (X)'.replace(' (X)', ' (X)')); // nome nulo vira '' + separador
  assert.equal(formatInsumoNome(null, null), '');
});

test('formatInsumoNomeDash — "Nome — Marca" sem parênteses', () => {
  assert.equal(formatInsumoNomeDash('Farinha', 'Dona Benta'), 'Farinha — Dona Benta');
  assert.equal(formatInsumoNomeDash('Farinha', MARCA_VALOR_ESTIMADO), 'Farinha');
  assert.equal(formatInsumoNomeDash(undefined, undefined), '');
});

test('formatInsumoNome com separador customizado não deve fechar parêntese',
  () => {
  assert.equal(formatInsumoNome('Farinha', 'Dona Benta', ' — '), 'Farinha — Dona Benta');
});
