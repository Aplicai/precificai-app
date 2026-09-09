/**
 * Testes — src/utils/formatInsumo.js (auditoria A8). Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatInsumoLabel, formatIngLabel, buildSearchString } from '../src/utils/formatInsumo.js';

test('formatInsumoLabel — "Nome (Marca)" quando ambos existem', () => {
  assert.equal(formatInsumoLabel({ nome: 'Farinha de Trigo', marca: 'Dona Benta' }), 'Farinha de Trigo (Dona Benta)');
});

test('formatInsumoLabel — marca vazia/whitespace/null devolve só o nome', () => {
  assert.equal(formatInsumoLabel({ nome: 'Farinha', marca: '' }), 'Farinha');
  assert.equal(formatInsumoLabel({ nome: 'Farinha', marca: '   ' }), 'Farinha');
  assert.equal(formatInsumoLabel({ nome: 'Farinha', marca: null }), 'Farinha');
});

test('formatInsumoLabel — não duplica marca já contida no nome (case-insensitive)', () => {
  assert.equal(formatInsumoLabel({ nome: 'Leite Ninho', marca: 'ninho' }), 'Leite Ninho');
});

test('formatInsumoLabel — nome vazio devolve a marca; objeto nulo devolve vazio', () => {
  assert.equal(formatInsumoLabel({ nome: '  ', marca: 'Caputo' }), 'Caputo');
  assert.equal(formatInsumoLabel({}), '');
  assert.equal(formatInsumoLabel(null), '');
});

test('formatIngLabel — usa mp_nome/mp_marca de uma linha de ingrediente', () => {
  assert.equal(formatIngLabel({ mp_nome: 'Farinha', mp_marca: 'Caputo' }), 'Farinha (Caputo)');
  assert.equal(formatIngLabel({ mp_nome: 'Farinha' }), 'Farinha');
  assert.equal(formatIngLabel(null), '');
});

test('buildSearchString — concatena nome e marca normalizados', () => {
  assert.equal(buildSearchString({ nome: ' Farinha ', marca: 'Dona Benta' }), 'Farinha Dona Benta');
  assert.equal(buildSearchString({ nome: ' Farinha ', marca: null }), 'Farinha');
  assert.equal(buildSearchString(null), '');
});
