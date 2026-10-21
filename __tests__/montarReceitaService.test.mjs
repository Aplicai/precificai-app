/**
 * Testes — gravação e busca da receita montada (src/services/montarReceitaService.js).
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/montarReceitaService.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { salvarPrecoMontado, carregarPrecosConta, pedirReceitaIA, buscarSugestao } from '../src/services/montarReceitaService.js';
import { calcularPrecoRapido } from '../src/utils/precoRapido.js';
import { custoReceita } from '../src/utils/montarReceita.js';

function dbFalso({ materias = [], embalagens = [], falharEm } = {}) {
  const chamadas = [];
  let id = 900;
  return {
    chamadas,
    async getAllAsync(sql) {
      if (sql.includes('FROM materias_primas')) return materias;
      if (sql.includes('FROM embalagens')) return embalagens;
      return [];
    },
    async runAsync(sql, params) {
      chamadas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (falharEm && falharEm(sql)) throw new Error('falha simulada');
      id += 1;
      return { lastInsertRowId: id };
    },
  };
}

const itens = [
  { nome: 'Farinha de trigo', q: 360, un: 'g', preco: 6.5, contaId: null, emb: false },
  { nome: 'Ovos', q: 4, un: 'un', preco: 0.8, contaId: 42, contaTabela: 'materias_primas', emb: false },
  { nome: 'Leite integral', q: 120, un: 'ml', preco: 5.49, contaId: null, emb: false },
  { nome: 'Coco ralado', q: 50, un: 'g', preco: null, contaId: null, emb: false },
  { nome: 'Embalagem para fatia', q: 1, un: 'un', preco: 0.6, contaId: null, emb: true },
];
const base = { nome: 'Bolo de cenoura', itens, rende: 12, gastoMes: '2.000', vendaMes: '8.000', cobraHoje: '' };

test('grava ingredientes reais, reaproveita os da conta e liga ao produto', async () => {
  const c = custoReceita(itens, 12);
  const db = dbFalso();
  const r = await salvarPrecoMontado(db, { ...base, custoReceita: c.custoReceita });
  const mps = db.chamadas.filter((x) => x.sql.startsWith('INSERT INTO materias_primas'));
  assert.equal(mps.length, 3, 'ovos já é da conta: não duplica');
  assert.deepEqual(mps[0].params, ['Farinha de trigo', '', null, 1000, 1000, 1, 'g', 6.5, 6.5]);
  assert.deepEqual(mps[1].params, ['Leite integral', '', null, 1000, 1000, 1, 'mL', 5.49, 5.49]);
  assert.deepEqual(mps[2].params, ['Coco ralado', '', null, 1000, 1000, 1, 'g', 0, 0], 'sem preço entra com 0');
  const emb = db.chamadas.find((x) => x.sql.startsWith('INSERT INTO embalagens'));
  assert.deepEqual(emb.params, ['Embalagem para fatia', '', null, 1, 'Unidades', 0.6, 0.6]);
  const prod = db.chamadas.find((x) => x.sql.startsWith('INSERT INTO produtos'));
  assert.equal(prod.params[0], 'Bolo de cenoura');
  assert.equal(prod.params[3], 'por_unidade');
  assert.equal(prod.params[4], 12);
  const esperado = calcularPrecoRapido({ custoReceita: c.custoReceita, rendimento: 12, gastoMes: '2.000', vendaMes: '8.000' });
  assert.equal(prod.params[6], Math.round(esperado.preco * 100) / 100);
  const ligs = db.chamadas.filter((x) => x.sql.startsWith('INSERT INTO produto_ingredientes'));
  assert.equal(ligs.length, 4);
  assert.ok(ligs.some((l) => l.params[1] === 42 && l.params[2] === 4), 'ovos da conta com a quantidade da receita');
  const lemb = db.chamadas.find((x) => x.sql.startsWith('INSERT INTO produto_embalagens'));
  assert.equal(lemb.params[2], 12, 'embalagem: 1 por porção = rende');
  assert.equal(r.ingredientesNovos, 3);
});

test('custo do app bate: (ingredientes + embalagem × rende) / rende', () => {
  const c = custoReceita(itens, 12);
  const ing = 0.36 * 6.5 + 4 * 0.8 + 0.12 * 5.49;
  assert.ok(Math.abs(c.custoReceita - (ing + 0.6 * 12)) < 1e-9);
  assert.ok(Math.abs(c.custoPorcao - (ing / 12 + 0.6)) < 1e-9);
});

test('falha no produto apaga o que esta gravação criou', async () => {
  const db = dbFalso({ falharEm: (sql) => sql.includes('INSERT INTO produtos') });
  await assert.rejects(() => salvarPrecoMontado(db, { ...base, custoReceita: 30 }));
  const dels = db.chamadas.filter((x) => x.sql.startsWith('DELETE'));
  assert.equal(dels.filter((d) => d.sql.includes('materias_primas')).length, 3);
  assert.equal(dels.filter((d) => d.sql.includes('embalagens')).length, 1);
  assert.ok(!dels.some((d) => d.params[0] === 42), 'nunca apaga o ingrediente que já era da conta');
});

test('sem nome ou sem ingredientes não grava', async () => {
  await assert.rejects(() => salvarPrecoMontado(dbFalso(), { ...base, nome: ' ' }));
  await assert.rejects(() => salvarPrecoMontado(dbFalso(), { ...base, itens: [] }));
});

test('carregarPrecosConta: unidades da conta viram g/ml/un', async () => {
  const m = await carregarPrecosConta(dbFalso({
    materias: [{ id: 1, nome: 'Açúcar Refinado', preco_por_kg: 5, unidade_medida: 'kg' }, { id: 2, nome: 'Leite', preco_por_kg: 5.5, unidade_medida: 'L' }, { id: 3, nome: 'Ovos', preco_por_kg: 0.8, unidade_medida: 'un' }],
    embalagens: [{ id: 7, nome: 'Pote 250 ml com tampa', preco_unitario: 0.9 }],
  }));
  assert.deepEqual(m.get('acucar refinado'), { id: 1, preco: 5, un: 'g', tabela: 'materias_primas' });
  assert.equal(m.get('leite').un, 'ml');
  assert.equal(m.get('pote 250 ml com tampa').tabela, 'embalagens');
});

test('pedirReceitaIA: falha, erro ou resposta ruim viram null', async () => {
  assert.equal(await pedirReceitaIA(null, 'x'), null);
  assert.equal(await pedirReceitaIA(async () => ({ error: new Error('x') }), 'x'), null);
  assert.equal(await pedirReceitaIA(async () => ({ data: { ok: false, error: 'limite' } }), 'x'), null);
  assert.equal(await pedirReceitaIA(async () => { throw new Error('rede'); }, 'x'), null);
  const ok = await pedirReceitaIA(async () => ({ data: { ok: true, receita: { porcao: 'pote', rende: 10, ingredientes: [{ nome: 'paçoca', quantidade: 200, unidade: 'g' }, { nome: 'leite condensado', quantidade: 395, unidade: 'g' }] } } }), 'bolo de pote de paçoca');
  assert.equal(ok.rende, 10);
});

test('buscarSugestao: biblioteca não chama a IA; desconhecido chama; IA falhou usa o nicho', async () => {
  let chamou = 0;
  const invocar = async () => { chamou += 1; return { data: { ok: false } }; };
  const s1 = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Bolo de cenoura', segmento: 'Confeitaria', invocar });
  assert.equal(s1.fonte, 'biblioteca');
  assert.equal(chamou, 0);
  const s2 = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Torta exótica de jaca com pimenta', segmento: 'Confeitaria', invocar });
  assert.equal(chamou, 1);
  assert.equal(s2.fonte, 'nicho');
  assert.ok(s2.itens.length >= 5, 'lista do nicho tem ingredientes');
});
