/**
 * Audit 2026-09 — parser SQL→PostgREST do wrapper (funções puras).
 * Regressão do CRÍTICO C1 (IN ignorado → "reajustar em massa" atingia tudo),
 * A7 (COLLATE quebrava DESC), A14/A15 (aliases ignorados), A1/A5 (WHERE em
 * coluna da tabela joinada).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as __parsers from '../src/database/sqlParse.js';

const { parseWhereSimple, parseOrderBy, parseSelectColumns, matchesConditions } = __parsers;

test('WHERE id IN (?,?,?) vira condição IN com os params na ordem', () => {
  const c = parseWhereSimple('id IN (?,?,?)', [1, 2, 3], 0);
  assert.deepEqual(c, [{ col: 'id', alias: null, op: 'IN', val: [1, 2, 3] }]);
});

test('WHERE misto: = ? AND alias.col IN (...) AND IS NULL — índices de params corretos', () => {
  const c = parseWhereSimple('produto_id = ? AND pi.materia_prima_id IN (?, ?) AND deleted_at IS NULL', [10, 5, 6], 0);
  assert.equal(c.length, 3);
  assert.deepEqual(c[0], { col: 'produto_id', alias: null, op: '=', val: 10 });
  assert.deepEqual(c[1], { col: 'materia_prima_id', alias: 'pi', op: 'IN', val: [5, 6] });
  assert.deepEqual(c[2], { col: 'deleted_at', alias: null, op: 'IS NULL', val: null });
});

test('condição desconhecida (LIKE) é sinalizada como UNSUPPORTED, nunca descartada', () => {
  const c = parseWhereSimple("nome LIKE '%x%'", [], 0);
  assert.equal(c[0].op, 'UNSUPPORTED');
  assert.equal(c[0].raw, "nome LIKE '%x%'");
});

test('ORDER BY nome COLLATE NOCASE DESC → desc=true (Z-A funciona)', () => {
  assert.deepEqual(parseOrderBy('SELECT * FROM t ORDER BY nome COLLATE NOCASE DESC'), { col: 'nome', desc: true });
  assert.deepEqual(parseOrderBy('SELECT * FROM t ORDER BY p.nome ASC'), { col: 'nome', desc: false });
  assert.deepEqual(parseOrderBy('SELECT * FROM t ORDER BY nome'), { col: 'nome', desc: false });
  assert.equal(parseOrderBy('SELECT * FROM t ORDER BY COALESCE(a, b) DESC'), null);
  assert.equal(parseOrderBy('SELECT * FROM t'), null);
});

test('parseSelectColumns resolve `x.col AS alias` e ignora *', () => {
  const cols = parseSelectColumns('SELECT pi.*, mp.nome as mp_nome, mp.preco_por_kg, mp.unidade_medida AS mp_unidade FROM preparo_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.preparo_id = ?');
  assert.deepEqual(cols, [
    { prefix: 'mp', col: 'nome', alias: 'mp_nome' },
    { prefix: 'mp', col: 'preco_por_kg', alias: null },
    { prefix: 'mp', col: 'unidade_medida', alias: 'mp_unidade' },
  ]);
});

test('matchesConditions avalia condições da tabela joinada client-side', () => {
  const conds = parseWhereSimple('p.preco_venda > ? AND p.categoria_id IN (?, ?)', [0, 1, 2], 0);
  assert.equal(matchesConditions({ preco_venda: 10, categoria_id: 2 }, conds), true);
  assert.equal(matchesConditions({ preco_venda: 0, categoria_id: 2 }, conds), false);
  assert.equal(matchesConditions({ preco_venda: 10, categoria_id: 9 }, conds), false);
});
