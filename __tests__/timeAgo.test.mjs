/**
 * Testes — src/utils/timeAgo.js (auditoria A8). Roda via `npm test`.
 * Usa datas relativas a Date.now() no momento do teste (janelas largas → sem flake).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatTimeAgo } from '../src/utils/timeAgo.js';

const ago = (ms) => new Date(Date.now() - ms);
const SEC = 1000, MIN = 60 * SEC, HR = 60 * MIN, DAY = 24 * HR;

test('entrada inválida/vazia devolve string vazia', () => {
  assert.equal(formatTimeAgo(null), '');
  assert.equal(formatTimeAgo(undefined), '');
  assert.equal(formatTimeAgo(''), '');
  assert.equal(formatTimeAgo('não é data'), '');
});

test('menos de 45s (e datas no futuro) → "agora"', () => {
  assert.equal(formatTimeAgo(ago(10 * SEC)), 'agora');
  assert.equal(formatTimeAgo(new Date(Date.now() + 5 * MIN)), 'agora');
});

test('minutos, horas, ontem, dias', () => {
  assert.equal(formatTimeAgo(ago(5 * MIN)), 'há 5 min');
  assert.equal(formatTimeAgo(ago(3 * HR)), 'há 3 h');
  assert.equal(formatTimeAgo(ago(26 * HR)), 'ontem');
  assert.equal(formatTimeAgo(ago(5 * DAY)), 'há 5 dias');
});

test('meses e anos (singular/plural)', () => {
  assert.equal(formatTimeAgo(ago(35 * DAY)), 'há 1 mês');
  assert.equal(formatTimeAgo(ago(75 * DAY)), 'há 2 meses');
  assert.equal(formatTimeAgo(ago(400 * DAY)), 'há 1 ano');
  assert.equal(formatTimeAgo(ago(800 * DAY)), 'há 2 anos');
});

test('aceita ISO string e timestamp numérico', () => {
  assert.equal(formatTimeAgo(ago(5 * MIN).toISOString()), 'há 5 min');
  assert.equal(formatTimeAgo(Date.now() - 3 * HR), 'há 3 h');
});

test('entre 360 e 364 dias não pode virar "há 0 anos"',
  () => {
  const out = formatTimeAgo(ago(362 * DAY));
  assert.notEqual(out, 'há 0 anos');
  assert.equal(out, 'há 1 ano');
});

test('entre 45s e 59s não deve dizer "há 0 min"',
  () => {
  const out = formatTimeAgo(ago(50 * SEC));
  assert.notEqual(out, 'há 0 min');
  assert.equal(out, 'há 1 min');
});
