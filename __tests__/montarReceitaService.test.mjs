/**
 * Testes — gravação e busca da receita montada (src/services/montarReceitaService.js).
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/montarReceitaService.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { salvarPrecoMontado, carregarPrecosConta, pedirReceitaIA, buscarSugestao, limparCacheIA } from '../src/services/montarReceitaService.js';
import { beforeEach } from 'node:test';
beforeEach(() => limparCacheIA());
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
  assert.deepEqual(m.get('acucar refinado'), { id: 1, preco: 5, un: 'g', tabela: 'materias_primas', unRaw: 'kg', qtd: 0 });
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

test('buscarSugestao: nome mais específico que a biblioteca usa a IA; IA falhou fica a biblioteca', async () => {
  const receitaIA = { porcao: 'marmita', rende: 6, embalagem: 'Marmita de aluminio com tampa', ingredientes: [{ nome: 'Carne seca', quantidade: 800, unidade: 'g' }, { nome: 'Aipim', quantidade: 1500, unidade: 'g' }, { nome: 'Requeijao', quantidade: 200, unidade: 'g' }] };
  let chamou = 0;
  const ok = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Escondidinho de carne seca', segmento: 'Marmitas', invocar: async () => { chamou += 1; return { data: { ok: true, receita: receitaIA } }; } });
  assert.equal(chamou, 1);
  assert.equal(ok.fonte, 'ia');
  assert.ok(ok.itens.some((i) => i.nome === 'Carne seca'));
  assert.ok(ok.itens.filter((i) => !i.emb).every((i) => i.preco > 0), 'carne seca, mandioca e requeijão com preço médio');
  const emb = ok.itens.find((i) => i.emb);
  assert.ok(emb && emb.preco > 0 && emb.nome !== 'Marmita de aluminio com tampa', 'embalagem sem preço vira a do ramo');
  limparCacheIA();
  const falhou = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Escondidinho de carne seca', segmento: 'Marmitas', invocar: async () => ({ data: { ok: false } }) });
  assert.equal(falhou.fonte, 'biblioteca');
  assert.ok(/escondidinho/i.test(falhou.parecida), 'avisa que é a receita parecida');
  assert.equal(ok.parecida, null);
});

test('salvarPrecoMontado: ingrediente que a conta já tem (mesmo nome e unidade) não duplica', async () => {
  const db = dbFalso({
    materias: [{ id: 77, nome: 'Farinha de Trigo', preco_por_kg: 6, unidade_medida: 'g' }, { id: 78, nome: 'Leite integral', preco_por_kg: 5, unidade_medida: 'un' }],
    embalagens: [{ id: 55, nome: 'Embalagem para fatia', preco_unitario: 0.5 }],
  });
  await salvarPrecoMontado(db, { ...base, custoReceita: 30 });
  const mps = db.chamadas.filter((x) => x.sql.startsWith('INSERT INTO materias_primas')).map((x) => x.params[0]);
  assert.deepEqual(mps, ['Leite integral', 'Coco ralado'], 'farinha reaproveitada; leite em un na conta não serve para ml');
  assert.ok(!db.chamadas.some((x) => x.sql.startsWith('INSERT INTO embalagens')), 'embalagem reaproveitada');
  const ligs = db.chamadas.filter((x) => x.sql.startsWith('INSERT INTO produto_ingredientes'));
  assert.ok(ligs.some((l) => l.params[1] === 77 && l.params[2] === 360));
  assert.ok(db.chamadas.some((x) => x.sql.startsWith('INSERT INTO produto_embalagens') && x.params[1] === 55));
});

test('salvarPrecoMontado: item da conta sem preço reaproveitado ganha o preço mostrado (só onde está vazio)', async () => {
  const db = dbFalso({
    materias: [{ id: 81, nome: 'Farinha de trigo', preco_por_kg: 0, unidade_medida: 'g', quantidade_bruta: 1000 }, { id: 82, nome: 'Leite integral', preco_por_kg: 4, unidade_medida: 'mL', quantidade_bruta: 1000 }],
    embalagens: [{ id: 56, nome: 'Embalagem para fatia', preco_unitario: 0, quantidade: 50 }],
  });
  await salvarPrecoMontado(db, { ...base, custoReceita: 30 });
  const ups = db.chamadas.filter((x) => x.sql.startsWith('UPDATE'));
  assert.equal(ups.length, 2, 'farinha e embalagem sem preço; leite já tinha preço e não muda');
  const far = ups.find((u) => u.sql.includes('materias_primas'));
  assert.deepEqual(far.params, [6.5, 6.5, 81]);
  const emb = ups.find((u) => u.sql.includes('embalagens'));
  assert.deepEqual(emb.params, [30, 0.6, 56], '50 un a R$ 0,60');
});

test('buscarSugestao: o produto decide o ramo da embalagem; embalagem da IA conhecida na biblioteca fica', async () => {
  const ia = (emb) => async () => ({ data: { ok: true, receita: { porcao: 'unidade', rende: 50, embalagem: emb, ingredientes: [{ nome: 'Costela bovina', quantidade: 1500, unidade: 'g' }, { nome: 'Farinha de trigo', quantidade: 1000, unidade: 'g' }] } } });
  const a = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Coxinha de costela', segmento: 'Confeitaria', invocar: ia('saquinho para salgado') });
  const ea = a.itens.find((i) => i.emb);
  assert.equal(ea.nome, 'Saquinho para salgado');
  assert.ok(ea.preco > 0);
  const b = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Coxinha de costela', segmento: 'Confeitaria', invocar: ia('caixinha qualquer') });
  assert.equal(b.nicho, 'salgados');
  assert.ok(!/pote/i.test(b.itens.find((i) => i.emb).nome), 'coxinha não vai em pote de bolo');
});

test('salvarPrecoMontado: ingrediente da conta em kg/L recebe a quantidade em kg/L (não em g/ml)', async () => {
  const db = dbFalso({
    materias: [{ id: 91, nome: 'Farinha de trigo', preco_por_kg: 6, unidade_medida: 'kg', quantidade_bruta: 1 },
      { id: 92, nome: 'Leite integral', preco_por_kg: 5, unidade_medida: 'L', quantidade_bruta: 1 },
      { id: 93, nome: 'Coco ralado', preco_por_kg: 0, unidade_medida: 'kg', quantidade_bruta: 1 }],
  });
  const its = [
    { nome: 'Farinha de trigo', q: 360, un: 'g', preco: 6, contaId: 91, contaTabela: 'materias_primas' },
    { nome: 'Leite integral', q: 120, un: 'ml', preco: 5, contaId: null },
    { nome: 'Coco ralado', q: 50, un: 'g', preco: 40, contaId: null },
  ];
  await salvarPrecoMontado(db, { ...base, itens: its, custoReceita: 10 });
  const ligs = Object.fromEntries(db.chamadas.filter((x) => x.sql.startsWith('INSERT INTO produto_ingredientes')).map((l) => [l.params[1], l.params[2]]));
  assert.equal(ligs[91], 0.36);
  assert.equal(ligs[92], 0.12);
  assert.equal(ligs[93], 0.05);
  const up = db.chamadas.find((x) => x.sql.startsWith('UPDATE materias_primas'));
  assert.deepEqual(up.params, [40, 40, 93], '1 kg de coco a R$ 40/kg: valor pago 40, não 0,04');
  const iProd = db.chamadas.findIndex((x) => x.sql.startsWith('INSERT INTO produtos'));
  assert.ok(db.chamadas.indexOf(up) > iProd, 'preço só é gravado depois do produto salvo');
});

test('salvarPrecoMontado: preço mudado na tela num item "já é seu" atualiza o ingrediente da conta', async () => {
  const db = dbFalso({ materias: [{ id: 42, nome: 'Ovos', preco_por_kg: 0.8, unidade_medida: 'un', quantidade_bruta: 30 }] });
  const its = [{ nome: 'Ovos', q: 4, un: 'un', preco: 0.9, contaId: 42, contaTabela: 'materias_primas' }];
  await salvarPrecoMontado(db, { ...base, itens: its, custoReceita: 3.6 });
  const up = db.chamadas.find((x) => x.sql.startsWith('UPDATE materias_primas'));
  assert.deepEqual(up.params, [27, 0.9, 42], '30 ovos a R$ 0,90');
  const db2 = dbFalso({ materias: [{ id: 42, nome: 'Ovos', preco_por_kg: 0.8, unidade_medida: 'un', quantidade_bruta: 30 }] });
  await salvarPrecoMontado(db2, { ...base, itens: [{ ...its[0], preco: 0.8 }], custoReceita: 3.2 });
  assert.ok(!db2.chamadas.some((x) => x.sql.startsWith('UPDATE')), 'mesmo preço: não mexe');
});

test('salvarPrecoMontado: leitura da conta com erro não grava (evita duplicar)', async () => {
  const { markErrorResult } = await import('../src/database/dbResult.js');
  const erro = markErrorResult([]);
  const db = dbFalso();
  db.getAllAsync = async () => erro;
  await assert.rejects(() => salvarPrecoMontado(db, { ...base, custoReceita: 30 }));
  assert.ok(!db.chamadas.some((x) => x.sql.startsWith('INSERT INTO materias_primas')));
});

test('buscarSugestao: IA falhou e a receita parecida é de outro ramo: usa a lista do ramo', async () => {
  const falha = async () => ({ data: { ok: false } });
  const a = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Paleta suína assada', segmento: 'Marmitas', invocar: falha });
  assert.equal(a.fonte, 'nicho');
  assert.equal(a.nicho, 'marmitas');
  const b = await buscarSugestao({ db: dbFalso(), nomeProduto: 'Escondidinho de carne seca', segmento: 'Marmitas', invocar: falha });
  assert.equal(b.fonte, 'biblioteca', 'mesmo ramo: a parecida ainda ajuda');
});

test('buscarSugestao: 2ª abertura com o mesmo nome não chama a IA de novo', async () => {
  let n = 0;
  const invocar = async () => { n += 1; return { data: { ok: true, receita: { porcao: 'pote', rende: 10, ingredientes: [{ nome: 'Paçoca', quantidade: 200, unidade: 'g' }, { nome: 'Leite condensado', quantidade: 395, unidade: 'g' }] } } }; };
  await buscarSugestao({ db: dbFalso(), nomeProduto: 'Torta exótica de paçoca', segmento: 'Confeitaria', invocar });
  await buscarSugestao({ db: dbFalso(), nomeProduto: 'Torta exótica de paçoca', segmento: 'Confeitaria', invocar });
  assert.equal(n, 1);
});

test('embalagem: pela palavra da IA e pela porção, não sempre o pote do ramo', async () => {
  const ia = (emb, porcao = 'unidade') => async () => ({ data: { ok: true, receita: { porcao, rende: 20, embalagem: emb, ingredientes: [{ nome: 'Leite condensado', quantidade: 395, unidade: 'g' }, { nome: 'Nutella', quantidade: 100, unidade: 'g' }] } } });
  const emb = async (nome, seg, e, porcao) => { limparCacheIA(); const s = await buscarSugestao({ db: dbFalso(), nomeProduto: nome, segmento: seg, invocar: ia(e, porcao) }); return s.itens.find((i) => i.emb); };
  assert.equal((await emb('Brigadeiro de Nutella com avelã', 'Confeitaria', 'forminha de papel')).nome, 'Forminha nº 5');
  assert.equal((await emb('Brigadeiro fino de pistache e avelã', 'Doces', 'forminha')).nome, 'Forminha 4 pétalas');
  assert.equal((await emb('Cookie de avelã e nutella', 'Confeitaria', 'saco celofane')).nome, 'Saquinho para doce');
  assert.equal((await emb('Bolo de avelã com nutella', 'Confeitaria', 'caixa de acetato', 'fatia')).nome, 'Embalagem para fatia');
  assert.equal((await emb('Torta mousse de avelã', 'Confeitaria', 'embalagem plástica', 'fatia')).nome, 'Embalagem para fatia');
  assert.equal((await emb('Trufa recheada de avelã', 'Confeitaria', null, 'unidade')).nome, 'Forminha nº 5', 'docinho sem embalagem da IA: forminha');
  const e = await emb('Bolinho de avelã exótico', 'Marmitas', 'papel manteiga especial', 'unidade');
  assert.equal(e.nome, 'Papel manteiga especial', 'desconhecida: fica a da IA, sem trocar por pote');
  assert.equal(e.preco, null);
});
