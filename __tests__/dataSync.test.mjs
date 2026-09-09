/**
 * Testes — src/utils/dataSync.js (auditoria A8). Roda via `npm test`.
 * Pub-sub cross-screen: notifyDataChanged(table) → subscribers; getLastUpdate.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { notifyDataChanged, subscribeDataChanged, getLastUpdate } from '../src/utils/dataSync.js';

test('subscriber recebe o nome da tabela; unsubscribe interrompe', () => {
  const seen = [];
  const off = subscribeDataChanged((t) => seen.push(t));
  notifyDataChanged('materias_primas');
  assert.deepEqual(seen, ['materias_primas']);
  off();
  notifyDataChanged('produtos');
  assert.deepEqual(seen, ['materias_primas']);
});

test('getLastUpdate é 0 antes e um timestamp recente depois', () => {
  assert.equal(getLastUpdate('tabela_nunca_notificada'), 0);
  const before = Date.now();
  notifyDataChanged('embalagens');
  const ts = getLastUpdate('embalagens');
  assert.ok(ts >= before && ts <= Date.now());
});

test('notify sem tabela é no-op; subscribe sem função devolve unsubscribe inerte', () => {
  let calls = 0;
  const off = subscribeDataChanged(() => { calls++; });
  notifyDataChanged(null);
  notifyDataChanged('');
  assert.equal(calls, 0);
  off();
  const noop = subscribeDataChanged('não é função');
  assert.equal(typeof noop, 'function');
  noop();
});

test('listener que lança não impede os demais (erro é logado, não propagado)', () => {
  const origWarn = console.warn;
  const warned = [];
  console.warn = (...a) => warned.push(a);
  try {
    const seen = [];
    const off1 = subscribeDataChanged(() => { throw new Error('boom'); });
    const off2 = subscribeDataChanged((t) => seen.push(t));
    assert.doesNotThrow(() => notifyDataChanged('preparos'));
    assert.deepEqual(seen, ['preparos']);
    assert.equal(warned.length, 1);
    off1(); off2();
  } finally {
    console.warn = origWarn;
  }
});
