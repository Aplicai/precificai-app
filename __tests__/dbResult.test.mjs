import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  markErrorResult, isErrorResult, getErrorInfo, unwrapErrorResult,
  rowsOrThrow, countOrThrow, DbReadError, MSG_LEITURA,
} from '../src/database/dbResult.js';

test('markErrorResult — marca [] sem aparecer na iteração; null vira caixa com value null', () => {
  const r = markErrorResult([], '401 JWT expired');
  assert.equal(isErrorResult(r), true);
  assert.equal(getErrorInfo(r), '401 JWT expired');
  assert.deepEqual(Object.keys(r), []);
  assert.equal(JSON.stringify(r), '[]');
  const boxed = markErrorResult(null, 'x');
  assert.equal(isErrorResult(boxed), true);
  assert.equal(unwrapErrorResult(boxed), null);
  assert.equal(isErrorResult([]), false);
  assert.equal(isErrorResult(null), false);
});

test('rowsOrThrow — vazio legítimo passa; vazio por erro lança DbReadError com a info', () => {
  assert.deepEqual(rowsOrThrow([]), []);
  assert.deepEqual(rowsOrThrow(null), []);
  const linhas = [{ id: 1 }];
  assert.equal(rowsOrThrow(linhas), linhas);
  assert.throws(() => rowsOrThrow(markErrorResult([], 'PGRST301')), (e) => e instanceof DbReadError && e.info === 'PGRST301' && e.message === MSG_LEITURA);
});

test('countOrThrow — null (leitura falhou) lança; linha com n devolve número', async () => {
  const dbOk = { getFirstAsync: async () => ({ n: '7' }) };
  assert.equal(await countOrThrow(dbOk, 'SELECT COUNT(*) as n FROM produtos'), 7);
  const dbZero = { getFirstAsync: async () => ({ n: 0 }) };
  assert.equal(await countOrThrow(dbZero, 'x'), 0);
  const dbErro = { getFirstAsync: async () => null };
  await assert.rejects(() => countOrThrow(dbErro, 'x'), DbReadError);
});
