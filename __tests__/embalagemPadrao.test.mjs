/**
 * Testes — src/services/embalagemPadrao.js (auditoria A8). Roda via `npm test`.
 * Tabela embalagem_categoria_padrao: UNIQUE(user_id, categoria_id, canal).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { getCategoriasPadraoDaEmbalagem, getEmbalagemPadrao, setCategoriasPadraoDaEmbalagem } from '../src/services/embalagemPadrao.js';

function mockDb({ rows = [], first = null, insertConflictOn = new Set(), fail = null } = {}) {
  const calls = [];
  const inserted = new Set();
  return {
    calls,
    async getAllAsync(sql, params) { calls.push({ sql, params }); if (fail) throw fail; return rows; },
    async getFirstAsync(sql, params) { calls.push({ sql, params }); if (fail) throw fail; return first; },
    async runAsync(sql, params) {
      calls.push({ sql, params });
      if (fail) throw fail;
      if (sql.startsWith('INSERT')) {
        const catId = params[1];
        if (insertConflictOn.has(catId) && !inserted.has(catId)) {
          inserted.add(catId); // segunda tentativa passa (a outra padrão foi deletada)
          throw new Error('UNIQUE constraint failed');
        }
      }
      return { changes: 1 };
    },
  };
}

test('getCategoriasPadraoDaEmbalagem — devolve ids (filtra nulos), canal default balcao', async () => {
  const db = mockDb({ rows: [{ categoria_id: 1 }, { categoria_id: null }, { categoria_id: 3 }] });
  assert.deepEqual(await getCategoriasPadraoDaEmbalagem(db, 5), [1, 3]);
  assert.deepEqual(db.calls[0].params, [5, 'balcao']);
  await getCategoriasPadraoDaEmbalagem(db, 5, 'delivery');
  assert.deepEqual(db.calls[1].params, [5, 'delivery']);
});

test('getCategoriasPadraoDaEmbalagem — sem id ou tabela inexistente → []', async () => {
  assert.deepEqual(await getCategoriasPadraoDaEmbalagem(mockDb(), null), []);
  assert.deepEqual(await getCategoriasPadraoDaEmbalagem(mockDb({ fail: new Error('no table') }), 1), []);
});

test('getEmbalagemPadrao — embalagem_id da linha ou null', async () => {
  assert.equal(await getEmbalagemPadrao(mockDb({ first: { embalagem_id: 8 } }), 2, 'delivery'), 8);
  assert.equal(await getEmbalagemPadrao(mockDb({ first: null }), 2), null);
  assert.equal(await getEmbalagemPadrao(mockDb(), null), null);
  assert.equal(await getEmbalagemPadrao(mockDb({ fail: new Error('x') }), 2), null);
});

test('setCategoriasPadraoDaEmbalagem — DELETE anterior + INSERT por categoria (ignora ids falsy)', async () => {
  const db = mockDb();
  await setCategoriasPadraoDaEmbalagem(db, 5, [1, 0, null, 3], 'delivery');
  assert.match(db.calls[0].sql, /^DELETE FROM embalagem_categoria_padrao WHERE embalagem_id = \? AND canal = \?/);
  assert.deepEqual(db.calls[0].params, [5, 'delivery']);
  const inserts = db.calls.filter((c) => c.sql.startsWith('INSERT'));
  assert.deepEqual(inserts.map((c) => c.params), [[5, 1, 'delivery'], [5, 3, 'delivery']]);
});

test('setCategoriasPadraoDaEmbalagem — conflito UNIQUE: deleta a padrão anterior da categoria e reinsere', async () => {
  const db = mockDb({ insertConflictOn: new Set([3]) });
  await setCategoriasPadraoDaEmbalagem(db, 5, [1, 3]);
  const seq = db.calls.map((c) => c.sql.split(' ').slice(0, 2).join(' ') + ' ' + JSON.stringify(c.params));
  assert.deepEqual(seq, [
    'DELETE FROM [5,"balcao"]',
    'INSERT INTO [5,1,"balcao"]',
    'INSERT INTO [5,3,"balcao"]',          // falha UNIQUE
    'DELETE FROM [3,"balcao"]',            // remove a outra embalagem padrão da categoria 3
    'INSERT INTO [5,3,"balcao"]',          // reinsere
  ]);
});

test('setCategoriasPadraoDaEmbalagem — sem embalagemId não toca no banco; tabela inexistente não lança', async () => {
  const db = mockDb();
  await setCategoriasPadraoDaEmbalagem(db, null, [1]);
  assert.equal(db.calls.length, 0);
  const orig = console.warn; console.warn = () => {};
  try {
    await assert.doesNotReject(() => setCategoriasPadraoDaEmbalagem(mockDb({ fail: new Error('no table') }), 5, [1]));
  } finally { console.warn = orig; }
});
