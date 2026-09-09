/**
 * Testes — src/services/dependenciesService.js (auditoria A8). Roda via `npm test`.
 * O módulo recebe `db` por injeção → testável com um mock SQLite-like.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { contarDependencias, formatarMensagemDeps, softDelete } from '../src/services/dependenciesService.js';

/** Mock db: mapa tabela → count (ou Error para simular tabela inexistente). */
function mockDb(counts) {
  const calls = [];
  return {
    calls,
    async getAllAsync(sql, params) {
      calls.push({ sql, params });
      const table = sql.match(/FROM (\w+)/)[1];
      const v = counts[table];
      if (v instanceof Error) throw v;
      return [{ n: v ?? 0 }];
    },
    async runAsync(sql, params) {
      calls.push({ sql, params });
      if (counts.__runError) throw counts.__runError;
      return { changes: 1 };
    },
  };
}

function silenceWarn(fn) {
  const orig = console.warn;
  console.warn = () => {};
  return Promise.resolve().then(fn).finally(() => { console.warn = orig; });
}

test('materia_prima — soma preparos + produtos + histórico; só lista tabelas com n > 0; passa o id como param', async () => {
  const db = mockDb({ preparo_ingredientes: 3, produto_ingredientes: 0, historico_precos: 7 });
  const deps = await contarDependencias(db, 'materia_prima', 42);
  assert.equal(deps.total, 10);
  assert.deepEqual(deps.porTabela, [
    { label: 'preparos', n: 3 },
    { label: 'histórico de preços', n: 7 },
  ]);
  assert.equal(deps.temBloqueio, false);
  assert.equal(db.calls.length, 3);
  assert.ok(db.calls.every((c) => c.params.length === 1 && c.params[0] === 42));
});

test('produto — vendas registradas ativam temBloqueio; delivery_produto_itens consulta por item_id + tipo', async () => {
  const db = mockDb({ produto_ingredientes: 2, produto_preparos: 0, produto_embalagens: 1, delivery_produto_itens: 1, vendas: 5 });
  const deps = await contarDependencias(db, 'produto', 9);
  assert.equal(deps.total, 9);
  assert.equal(deps.temBloqueio, true);
  const dpi = db.calls.find((c) => c.sql.includes('delivery_produto_itens'));
  assert.match(dpi.sql, /item_id = \? AND tipo = 'produto'/);
  assert.ok(!dpi.sql.includes('produto_id'), 'regressão Sentry: delivery_produto_itens não tem produto_id');
});

test('preparo — conta uso como sub-preparo por sub_preparo_id (não pelos próprios ingredientes)', async () => {
  const db = mockDb({ produto_preparos: 1, preparo_subpreparos: 2 });
  const deps = await contarDependencias(db, 'preparo', 3);
  assert.equal(deps.total, 3);
  const sub = db.calls.find((c) => c.sql.includes('preparo_subpreparos'));
  assert.match(sub.sql, /WHERE sub_preparo_id = \?/);
});

test('tipo desconhecido → zero deps sem consultar o banco', async () => {
  const db = mockDb({});
  const deps = await silenceWarn(() => contarDependencias(db, 'nao_existe', 1));
  assert.deepEqual(deps, { total: 0, porTabela: [], temBloqueio: false });
  assert.equal(db.calls.length, 0);
});

test('tabela inexistente (erro) é ignorada e as demais continuam sendo contadas', async () => {
  const db = mockDb({ produto_embalagens: new Error('relation does not exist') });
  const deps = await silenceWarn(() => contarDependencias(db, 'embalagem', 1));
  assert.equal(deps.total, 0);
  const db2 = mockDb({ preparo_ingredientes: new Error('x'), produto_ingredientes: 4, historico_precos: 0 });
  const deps2 = await silenceWarn(() => contarDependencias(db2, 'materia_prima', 1));
  assert.equal(deps2.total, 4);
});

test('formatarMensagemDeps — sem deps: confirmação simples; com deps: lista com bullets; com vendas: bloqueia', () => {
  assert.equal(formatarMensagemDeps({ total: 0, porTabela: [] }), 'Excluir este item? Esta ação não pode ser desfeita.');
  assert.equal(formatarMensagemDeps(null, { acao: 'alterar', entidade: 'produto' }), 'Alterar este produto? Esta ação não pode ser desfeita.');

  const comDeps = formatarMensagemDeps({ total: 5, porTabela: [{ label: 'preparos', n: 3 }, { label: 'produtos (uso direto)', n: 2 }], temBloqueio: false }, { entidade: 'insumo' });
  assert.match(comDeps, /^Este insumo está em uso em:\n• 3 preparos\n• 2 produtos \(uso direto\)\n\nExcluir vai impactar/);

  const bloq = formatarMensagemDeps({ total: 5, porTabela: [{ label: 'vendas registradas', n: 5 }], temBloqueio: true }, { entidade: 'produto' });
  assert.match(bloq, /possui vendas registradas/);
  assert.match(bloq, /soft-delete/);
});

test('softDelete — whitelist de tabelas; UPDATE deleted_at com ISO; false se a coluna não existe', async () => {
  const db = mockDb({});
  assert.equal(await softDelete(db, 'produtos', 7), true);
  assert.equal(db.calls[0].sql, 'UPDATE produtos SET deleted_at = ? WHERE id = ?');
  assert.ok(!Number.isNaN(Date.parse(db.calls[0].params[0])));
  assert.equal(db.calls[0].params[1], 7);

  await assert.rejects(() => softDelete(db, 'vendas', 1), /não habilitada para soft-delete/);
  await assert.rejects(() => softDelete(db, 'produtos; DROP TABLE x', 1));

  const dbFail = mockDb({ __runError: new Error('no such column: deleted_at') });
  assert.equal(await silenceWarn(() => softDelete(dbFail, 'preparos', 1)), false);
});
