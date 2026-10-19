/**
 * Migração (19/10/2026) — rendimento das receitas base do Kit de Início.
 *
 * O commit 5d2b02d baixou o rendimento de 7 receitas do kit (ex.: Brigadeiro
 * tradicional 600 → 400 g). Quem já tinha carregado o kit ficou com o valor
 * antigo e custo por kg baixo demais. A migração corrige SÓ receitas que o
 * usuário não mexeu: mesmo nome, rendimento ainda igual ao antigo, mesmos
 * ingredientes/quantidades do kit e sem sub-receitas.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  RENDIMENTOS_KIT_CORRIGIDOS,
  FLAG_MIGRACAO_RENDIMENTO_KIT,
  migracaoRendimentoKitFeita,
  selecionarPreparosParaMigrar,
  mensagemMigracaoRendimentoKit,
} from '../src/utils/migracaoRendimentoKit.js';
import { migrarRendimentoKit } from '../src/services/migracaoRendimentoKit.js';
import { markErrorResult } from '../src/database/dbResult.js';
import { PREPAROS_POR_SEGMENTO } from '../src/data/templates.js';

// ---------- fixtures ----------
const MATERIAS = [
  { id: 1, nome: 'Leite condensado' },
  { id: 2, nome: 'Cacau em pó 100%' },
  { id: 3, nome: 'Manteiga sem sal' },
  { id: 4, nome: 'Chocolate granulado' },
  { id: 5, nome: 'Coco ralado' },
];
const kitBrigadeiro = Object.values(PREPAROS_POR_SEGMENTO).flat().find(p => p.nome === 'Brigadeiro tradicional');
const idPorNome = Object.fromEntries(MATERIAS.map(m => [m.nome, m.id]));

function ingsDoKit(preparoId, receita = kitBrigadeiro) {
  return receita.ingredientes.map(i => ({
    preparo_id: preparoId, materia_prima_id: idPorNome[i.nome_insumo], quantidade_utilizada: i.quantidade,
  }));
}

function base(extra = {}) {
  return {
    preparos: [{ id: 10, nome: 'Brigadeiro tradicional', rendimento_total: 600, unidade_medida: 'Grama(s)' }],
    ingredientes: ingsDoKit(10),
    materias: MATERIAS,
    subpreparos: [],
    ...extra,
  };
}

// ---------- dados ----------
test('tabela de correção bate com o template atual (novo) e cobre as 7 receitas', () => {
  const kit = Object.values(PREPAROS_POR_SEGMENTO).flat();
  assert.equal(Object.keys(RENDIMENTOS_KIT_CORRIGIDOS).length, 7);
  for (const [nome, { antigo, novo }] of Object.entries(RENDIMENTOS_KIT_CORRIGIDOS)) {
    const doKit = kit.filter(p => p.nome === nome);
    assert.equal(doKit.length, 1, `nome ambíguo ou ausente no kit: ${nome}`);
    assert.equal(doKit[0].rendimento_total, novo, nome);
    assert.ok(antigo > novo, nome);
  }
  assert.equal(RENDIMENTOS_KIT_CORRIGIDOS['Brigadeiro tradicional'].antigo, 600);
  assert.equal(RENDIMENTOS_KIT_CORRIGIDOS['Recheio carne moída'].antigo, 800);
});

// ---------- seleção ----------
test('seleciona receita do kit intacta (nome + rendimento antigo + ingredientes iguais)', () => {
  const r = selecionarPreparosParaMigrar(base());
  assert.deepEqual(r, [{ id: 10, nome: 'Brigadeiro tradicional', antigo: 600, novo: 400 }]);
});

test('ignora rendimento já editado (ou já migrado → idempotente)', () => {
  for (const rend of [400, 500, 601]) {
    const d = base();
    d.preparos[0].rendimento_total = rend;
    assert.deepEqual(selecionarPreparosParaMigrar(d), [], `rendimento ${rend}`);
  }
});

test('aceita rendimento vindo como string numérica do banco', () => {
  const d = base();
  d.preparos[0].rendimento_total = '600';
  assert.equal(selecionarPreparosParaMigrar(d).length, 1);
});

test('ignora nome diferente (renomeado, caixa, outro produto)', () => {
  for (const nome of ['Brigadeiro gourmet', 'brigadeiro tradicional', 'Brigadeiro tradicional (meu)']) {
    const d = base();
    d.preparos[0].nome = nome;
    assert.deepEqual(selecionarPreparosParaMigrar(d), [], nome);
  }
});

test('ignora quando a quantidade de um ingrediente mudou', () => {
  const d = base();
  d.ingredientes[0] = { ...d.ingredientes[0], quantidade_utilizada: 400 };
  assert.deepEqual(selecionarPreparosParaMigrar(d), []);
});

test('ignora quando o usuário adicionou ou removeu ingrediente', () => {
  const add = base();
  add.ingredientes.push({ preparo_id: 10, materia_prima_id: 5, quantidade_utilizada: 50 });
  assert.deepEqual(selecionarPreparosParaMigrar(add), []);
  const rem = base();
  rem.ingredientes.pop();
  assert.deepEqual(selecionarPreparosParaMigrar(rem), []);
});

test('ignora quando o insumo foi trocado/renomeado', () => {
  const d = base({ materias: MATERIAS.map(m => (m.id === 2 ? { ...m, nome: 'Cacau 50%' } : m)) });
  assert.deepEqual(selecionarPreparosParaMigrar(d), []);
});

test('ignora receita com sub-receita (peso da receita mudou)', () => {
  const d = base({ subpreparos: [{ preparo_id: 10, sub_preparo_id: 99, quantidade_utilizada: 100 }] });
  assert.deepEqual(selecionarPreparosParaMigrar(d), []);
});

test('ignora unidade diferente de gramas', () => {
  const d = base();
  d.preparos[0].unidade_medida = 'Unidade(s)';
  assert.deepEqual(selecionarPreparosParaMigrar(d), []);
});

test('ingredientes de OUTRA receita não contaminam a comparação', () => {
  const d = base();
  d.ingredientes.push({ preparo_id: 77, materia_prima_id: 5, quantidade_utilizada: 50 });
  assert.equal(selecionarPreparosParaMigrar(d).length, 1);
});

test('kit carregado 2x: as duas cópias intactas são corrigidas', () => {
  const d = base();
  d.preparos.push({ id: 11, nome: 'Brigadeiro tradicional', rendimento_total: 600, unidade_medida: 'Grama(s)' });
  d.ingredientes.push(...ingsDoKit(11));
  assert.deepEqual(selecionarPreparosParaMigrar(d).map(p => p.id), [10, 11]);
});

test('entrada inválida → lista vazia (nunca lança)', () => {
  assert.deepEqual(selecionarPreparosParaMigrar({}), []);
  assert.deepEqual(selecionarPreparosParaMigrar(null), []);
});

// ---------- flag / mensagem ----------
test('flag persistente no user_metadata', () => {
  assert.equal(migracaoRendimentoKitFeita(null), false);
  assert.equal(migracaoRendimentoKitFeita({}), false);
  assert.equal(migracaoRendimentoKitFeita({ [FLAG_MIGRACAO_RENDIMENTO_KIT]: true }), true);
});

test('mensagem curta cita uma receita e diz que o preço de venda não mudou', () => {
  const m = mensagemMigracaoRendimentoKit([{ nome: 'Beijinho' }, { nome: 'Brigadeiro tradicional' }]);
  assert.match(m, /Kit de Início/);
  assert.match(m, /ex\.: Brigadeiro tradicional/); // prefere o Brigadeiro como exemplo
  assert.match(m, /preços de venda não mudaram/);
});

// ---------- execução (fake db) ----------
function fakeDb({ falhar = null, dados = base() } = {}) {
  const updates = [];
  const tabelas = {
    preparos: dados.preparos,
    preparo_ingredientes: dados.ingredientes,
    materias_primas: dados.materias,
    preparo_subpreparos: dados.subpreparos,
  };
  return {
    updates,
    async getAllAsync(sql) {
      const t = sql.match(/FROM\s+(\w+)/i)[1];
      if (t === falhar) return markErrorResult([]);
      if (t === 'preparo_subpreparos' && /SELECT DISTINCT/.test(sql)) return [];
      if (t === 'delivery_combos') return [];
      return (tabelas[t] || []).map(r => ({ ...r }));
    },
    async getFirstAsync(sql, params) {
      if (/FROM preparos WHERE id/.test(sql)) return tabelas.preparos.find(p => p.id === params[0]) || null;
      return null;
    },
    async runAsync(sql, params) {
      updates.push({ sql, params });
      const m = sql.match(/UPDATE preparos SET rendimento_total = \? WHERE id = \? AND rendimento_total = \?/);
      if (m) {
        const p = tabelas.preparos.find(x => x.id === params[1]);
        if (p && Number(p.rendimento_total) === params[2]) p.rendimento_total = params[0];
      }
    },
  };
}

function fakeAuth() {
  const chamadas = [];
  return { chamadas, auth: { async updateUser(arg) { chamadas.push(arg); return { error: null }; } } };
}

test('execução: corrige, recalcula custo, marca a flag e avisa', async () => {
  const db = fakeDb();
  const sb = fakeAuth();
  const avisos = [];
  const r = await migrarRendimentoKit({ db, user: { id: 'u', user_metadata: {} }, supabase: sb, avisar: m => avisos.push(m) });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.corrigidos.map(c => c.id), [10]);
  assert.ok(db.updates.some(u => /rendimento_total = \?/.test(u.sql) && u.params[0] === 400 && u.params[2] === 600));
  // cascade: custo_por_kg regravado depois do rendimento novo
  assert.ok(db.updates.some(u => /SET custo_por_kg/.test(u.sql)));
  assert.deepEqual(sb.chamadas, [{ data: { [FLAG_MIGRACAO_RENDIMENTO_KIT]: true } }]);
  assert.equal(avisos.length, 1);
});

test('execução: nenhum preço de venda é tocado', async () => {
  const db = fakeDb();
  await migrarRendimentoKit({ db, user: { id: 'u', user_metadata: {} }, supabase: fakeAuth(), avisar: () => {} });
  assert.ok(db.updates.every(u => !/produtos|preco_venda|delivery/i.test(u.sql)), JSON.stringify(db.updates));
});

test('execução: rodar de novo não muda nada (idempotente mesmo sem a flag)', async () => {
  const dados = base();
  const db1 = fakeDb({ dados });
  await migrarRendimentoKit({ db: db1, user: { id: 'u', user_metadata: {} }, supabase: fakeAuth(), avisar: () => {} });
  const db2 = fakeDb({ dados });
  const avisos = [];
  const r = await migrarRendimentoKit({ db: db2, user: { id: 'u', user_metadata: {} }, supabase: fakeAuth(), avisar: m => avisos.push(m) });
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.corrigidos, []);
  assert.deepEqual(db2.updates, []);
  assert.deepEqual(avisos, []);
});

test('execução: flag já marcada → não lê nada', async () => {
  const db = fakeDb();
  let leu = false;
  db.getAllAsync = async () => { leu = true; return []; };
  const r = await migrarRendimentoKit({ db, user: { id: 'u', user_metadata: { [FLAG_MIGRACAO_RENDIMENTO_KIT]: true } }, supabase: fakeAuth(), avisar: () => {} });
  assert.equal(r.status, 'ja_feita');
  assert.equal(leu, false);
});

test('execução: leitura com ERRO ([] marcado) → não grava nada e NÃO marca a flag', async () => {
  for (const tabela of ['preparos', 'preparo_ingredientes', 'materias_primas', 'preparo_subpreparos']) {
    const db = fakeDb({ falhar: tabela });
    const sb = fakeAuth();
    const avisos = [];
    const r = await migrarRendimentoKit({ db, user: { id: 'u', user_metadata: {} }, supabase: sb, avisar: m => avisos.push(m) });
    assert.equal(r.status, 'erro', tabela);
    assert.deepEqual(db.updates, [], tabela);
    assert.deepEqual(sb.chamadas, [], tabela);
    assert.deepEqual(avisos, [], tabela);
  }
});

test('execução: conta sem receitas do kit → marca a flag sem avisar', async () => {
  const db = fakeDb({ dados: { preparos: [], ingredientes: [], materias: [], subpreparos: [] } });
  const sb = fakeAuth();
  const avisos = [];
  const r = await migrarRendimentoKit({ db, user: { id: 'u', user_metadata: {} }, supabase: sb, avisar: m => avisos.push(m) });
  assert.equal(r.status, 'ok');
  assert.equal(sb.chamadas.length, 1);
  assert.deepEqual(avisos, []);
});

test('execução: UPDATE falhou → não marca a flag (tenta de novo no próximo login)', async () => {
  const db = fakeDb();
  db.runAsync = async () => { throw new Error('rede'); };
  const sb = fakeAuth();
  const r = await migrarRendimentoKit({ db, user: { id: 'u', user_metadata: {} }, supabase: sb, avisar: () => {} });
  assert.equal(r.status, 'erro');
  assert.deepEqual(sb.chamadas, []);
});
