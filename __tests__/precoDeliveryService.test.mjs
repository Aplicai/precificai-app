/**
 * Testes — src/services/precoDeliveryService.js (auditoria A8). Roda via `npm test`.
 * Contrato: SELECT-first → UPDATE ou INSERT; preço ≤ 0 → DELETE; usa CURRENT_TIMESTAMP.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { upsertPrecoDelivery, carregarPrecosDeliveryMap } from '../src/services/precoDeliveryService.js';

function mockDb({ existing = [], rows = [], fail = null } = {}) {
  const calls = [];
  return {
    calls,
    async getAllAsync(sql, params) {
      calls.push({ sql, params });
      if (fail) throw fail;
      return sql.startsWith('SELECT id') ? existing : rows;
    },
    async runAsync(sql, params) {
      calls.push({ sql, params });
      if (fail) throw fail;
      return { changes: 1 };
    },
  };
}

test('argumentos inválidos → noop sem tocar no banco', async () => {
  const db = mockDb();
  assert.deepEqual(await upsertPrecoDelivery(null, { produtoId: 1, plataformaId: 1, precoVenda: 10 }), { ok: false, action: 'noop', error: 'Argumentos inválidos' });
  assert.equal((await upsertPrecoDelivery(db, { produtoId: 0, plataformaId: 1, precoVenda: 10 })).action, 'noop');
  assert.equal(db.calls.length, 0);
});

test('linha existente → UPDATE com CURRENT_TIMESTAMP (não NOW()) e params [preco, produto, plataforma]', async () => {
  const db = mockDb({ existing: [{ id: 99 }] });
  const r = await upsertPrecoDelivery(db, { produtoId: 5, plataformaId: 2, precoVenda: 12.5 });
  assert.deepEqual(r, { ok: true, action: 'update' });
  const upd = db.calls[1];
  assert.match(upd.sql, /^UPDATE produto_preco_delivery SET preco_venda = \?, updated_at = CURRENT_TIMESTAMP/);
  assert.ok(!upd.sql.includes('NOW()'));
  assert.deepEqual(upd.params, [12.5, 5, 2]);
});

test('sem linha → INSERT; aceita "12,50" com vírgula', async () => {
  const db = mockDb({ existing: [] });
  const r = await upsertPrecoDelivery(db, { produtoId: 5, plataformaId: 2, precoVenda: '12,50' });
  assert.deepEqual(r, { ok: true, action: 'insert' });
  assert.match(db.calls[1].sql, /^INSERT INTO produto_preco_delivery/);
  assert.deepEqual(db.calls[1].params, [5, 2, 12.5]);
});

test('preço zero, negativo ou inválido → DELETE da linha', async () => {
  for (const precoVenda of [0, -3, '', 'abc', null]) {
    const db = mockDb();
    const r = await upsertPrecoDelivery(db, { produtoId: 5, plataformaId: 2, precoVenda });
    assert.deepEqual(r, { ok: true, action: 'delete' }, `precoVenda=${precoVenda}`);
    assert.match(db.calls[0].sql, /^DELETE FROM produto_preco_delivery/);
    assert.deepEqual(db.calls[0].params, [5, 2]);
  }
});

test('erro do banco → { ok: false, action: noop, error }', async () => {
  const orig = console.warn; console.warn = () => {};
  try {
    const r = await upsertPrecoDelivery(mockDb({ fail: new Error('HTTP 400') }), { produtoId: 1, plataformaId: 1, precoVenda: 9 });
    assert.equal(r.ok, false);
    assert.equal(r.action, 'noop');
    assert.equal(r.error, 'HTTP 400');
  } finally { console.warn = orig; }
});

test('carregarPrecosDeliveryMap — chave "produto-plataforma" → número; tolerante a db nulo e erro', async () => {
  const db = mockDb({ rows: [{ produto_id: 1, plataforma_id: 2, preco_venda: '12,5' }, { produto_id: 3, plataforma_id: 2, preco_venda: 20 }] });
  assert.deepEqual(await carregarPrecosDeliveryMap(db), { '1-2': 12.5, '3-2': 20 });
  assert.deepEqual(await carregarPrecosDeliveryMap(null), {});
  assert.deepEqual(await carregarPrecosDeliveryMap(mockDb({ fail: new Error('x') })), {});
});
