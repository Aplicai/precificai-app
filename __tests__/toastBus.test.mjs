/**
 * Testes — src/utils/toastBus.js (auditoria A8). Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { showToast, subscribeToast } from '../src/utils/toastBus.js';

test('showToast entrega payload com defaults (check-circle, 2500ms) e id único', () => {
  const got = [];
  const off = subscribeToast((p) => got.push(p));
  showToast('Entrada registrada');
  showToast('Outra');
  off();
  assert.equal(got.length, 2);
  assert.equal(got[0].message, 'Entrada registrada');
  assert.equal(got[0].icon, 'check-circle');
  assert.equal(got[0].durationMs, 2500);
  assert.equal(typeof got[0].id, 'number');
  assert.notEqual(got[0].id, got[1].id);
});

test('ícone e duração customizados são repassados', () => {
  const got = [];
  const off = subscribeToast((p) => got.push(p));
  showToast('PDF exportado', 'file-text', 4000);
  off();
  assert.deepEqual([got[0].icon, got[0].durationMs], ['file-text', 4000]);
});

test('unsubscribe para de receber; listener que lança não quebra o bus', () => {
  const got = [];
  const off = subscribeToast((p) => got.push(p));
  off();
  showToast('ignorado');
  assert.equal(got.length, 0);
  const offBad = subscribeToast(() => { throw new Error('x'); });
  assert.doesNotThrow(() => showToast('ok'));
  offBad();
});
