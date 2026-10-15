/**
 * Testes — src/services/primeiroProdutoService.js.
 * db falso que grava as chamadas: confere o SQL exato (igual aos formulários
 * de ingrediente e produto), a ordem e o desfazer quando algo falha.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/primeiroProdutoService.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { salvarPrimeiroProduto } from '../src/services/primeiroProdutoService.js';

function dbFalso({ falharEm } = {}) {
  const chamadas = [];
  let id = 100;
  return {
    chamadas,
    async runAsync(sql, params) {
      chamadas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (falharEm && falharEm(sql, chamadas.length)) throw new Error('falha simulada');
      id += 1;
      return { lastInsertRowId: id };
    },
  };
}

const payload = {
  produto: { nome: 'Bolo', unidade_rendimento: 'por_unidade', rendimento_total: 1, rendimento_unidades: 20 },
  materias: [
    { nome: 'Farinha', marca: '', categoria_id: null, quantidade_bruta: 5, quantidade_liquida: 5, fator_correcao: 1, unidade_medida: 'kg', valor_pago: 25, preco_por_kg: 5 },
    { nome: 'Ovos', marca: '', categoria_id: null, quantidade_bruta: 12, quantidade_liquida: 12, fator_correcao: 1, unidade_medida: 'un', valor_pago: 18, preco_por_kg: 1.5 },
  ],
  quantidades: [0.3, 4],
  preco: { preco: 2.5, origem: 'digitado' },
};

test('grava ingredientes, histórico, produto e ligações com o SQL dos formulários', async () => {
  const db = dbFalso();
  const r = await salvarPrimeiroProduto(db, payload);
  const sqls = db.chamadas.map((c) => c.sql);
  assert.equal(sqls[0], 'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)');
  assert.deepEqual(db.chamadas[0].params, ['Farinha', '', null, 5, 5, 1, 'kg', 25, 5]);
  assert.equal(sqls[1], 'INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)');
  assert.deepEqual(db.chamadas[1].params, [101, 25, 5]);
  const iProd = sqls.findIndex((s) => s.startsWith('INSERT INTO produtos'));
  assert.ok(iProd > 0);
  assert.ok(sqls[iProd].includes('(nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades, tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado, temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente, modo_preparo, observacoes, embalagem_delivery_id, embalagem_delivery_quantidade, embalagens_delivery)'));
  assert.deepEqual(db.chamadas[iProd].params, ['Bolo', null, 1, 'por_unidade', 20, 0, 2.5, 0, 0, 0, 0, 0, 0, 0, 0, '', '', null, null, null]);
  const ligacoes = db.chamadas.filter((c) => c.sql.startsWith('INSERT INTO produto_ingredientes'));
  assert.equal(ligacoes.length, 2);
  assert.equal(ligacoes[0].sql, 'INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)');
  const prodId = r.produtoId;
  assert.deepEqual(ligacoes.map((l) => l.params), [[prodId, r.materiaIds[0], 0.3], [prodId, r.materiaIds[1], 4]]);
  assert.equal(r.materiaIds.length, 2);
});

test('histórico de preço que falha não impede o resto', async () => {
  const db = dbFalso({ falharEm: (sql) => sql.includes('historico_precos') });
  const r = await salvarPrimeiroProduto(db, payload);
  assert.ok(r.produtoId);
});

test('falha no produto apaga os ingredientes criados e repassa o erro', async () => {
  const db = dbFalso({ falharEm: (sql) => sql.includes('INSERT INTO produtos') });
  await assert.rejects(() => salvarPrimeiroProduto(db, payload), /falha simulada/);
  const deletes = db.chamadas.filter((c) => c.sql.startsWith('DELETE'));
  assert.deepEqual(deletes.map((d) => d.sql), ['DELETE FROM materias_primas WHERE id = ?', 'DELETE FROM materias_primas WHERE id = ?']);
});

test('falha numa ligação apaga ligações, produto e ingredientes', async () => {
  let n = 0;
  const db = dbFalso({ falharEm: (sql) => sql.includes('produto_ingredientes') && ++n === 2 });
  await assert.rejects(() => salvarPrimeiroProduto(db, payload));
  const deletes = db.chamadas.filter((c) => c.sql.startsWith('DELETE')).map((d) => d.sql);
  assert.deepEqual(deletes, [
    'DELETE FROM produto_ingredientes WHERE id = ?',
    'DELETE FROM produtos WHERE id = ?',
    'DELETE FROM materias_primas WHERE id = ?',
    'DELETE FROM materias_primas WHERE id = ?',
  ]);
});

test('sem ingrediente ou sem produto não grava nada', async () => {
  const db = dbFalso();
  await assert.rejects(() => salvarPrimeiroProduto(db, { ...payload, materias: [], quantidades: [] }));
  await assert.rejects(() => salvarPrimeiroProduto(db, { ...payload, produto: { nome: '' } }));
  assert.equal(db.chamadas.length, 0);
});
