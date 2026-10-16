import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  criarSerializador, excluirPaiPrimeiro, piorErroCarga, podeGravarRegistro, podeGravarComposicao,
} from '../src/utils/gravacaoSegura.js';

test('erro de carga: registro bloqueia tudo, composição bloqueia só a composição', () => {
  assert.equal(piorErroCarga(null, 'composicao'), 'composicao');
  assert.equal(piorErroCarga('composicao', 'registro'), 'registro');
  assert.equal(piorErroCarga('registro', 'composicao'), 'registro');
  assert.equal(piorErroCarga(null, null), null);
  assert.equal(podeGravarRegistro(null), true);
  assert.equal(podeGravarRegistro('composicao'), true);
  assert.equal(podeGravarRegistro('registro'), false);
  assert.equal(podeGravarComposicao(null), true);
  assert.equal(podeGravarComposicao('composicao'), false);
  assert.equal(podeGravarComposicao('registro'), false);
});

const tick = () => new Promise(r => setTimeout(r, 0));

// Tabela em memória com latência por operação — imita o wrapper Supabase
// (cada SELECT/INSERT/DELETE é um round-trip assíncrono, sem transação).
function criarTabelaFake() {
  let seq = 0;
  const linhas = [];
  return {
    linhas,
    async selectIds(pai) { await tick(); return linhas.filter(l => l.pai === pai).map(l => l.id); },
    async insert(pai, item) { await tick(); const id = ++seq; linhas.push({ id, pai, item }); return id; },
    async deleteId(id) { await tick(); const i = linhas.findIndex(l => l.id === id); if (i >= 0) linhas.splice(i, 1); },
  };
}

// Mesmo padrão de reinsertComboItens / salvarImpl: lê ids antigos, insere os
// novos, apaga os antigos pelos ids lidos.
async function regravar(tab, pai, itens) {
  const antigos = await tab.selectIds(pai);
  for (const it of itens) await tab.insert(pai, it);
  for (const id of antigos) await tab.deleteId(id);
}

test('causa raiz: duas regravações em paralelo duplicam os itens', async () => {
  const tab = criarTabelaFake();
  await regravar(tab, 1, ['a', 'b', 'c']);
  await Promise.all([regravar(tab, 1, ['a', 'b', 'c']), regravar(tab, 1, ['a', 'b', 'c'])]);
  assert.equal(tab.linhas.length, 6); // o bug das gravações: 3 itens viram 6
});

test('serializado: autosave + "Salvar e voltar" simultâneos mantêm só um conjunto', async () => {
  const tab = criarTabelaFake();
  const { serializar } = criarSerializador();
  await regravar(tab, 1, ['a', 'b', 'c']);
  await Promise.all([
    serializar('combo:1', () => regravar(tab, 1, ['a', 'b', 'c'])),
    serializar('combo:1', () => regravar(tab, 1, ['a', 'b', 'c'])),
    serializar('combo:1', () => regravar(tab, 1, ['a', 'b', 'c'])),
  ]);
  assert.deepEqual(tab.linhas.map(l => l.item), ['a', 'b', 'c']);
});

test('pedido durante execução roda UMA vez depois, com o estado mais recente', async () => {
  const { serializar } = criarSerializador();
  const execucoes = [];
  let liberar;
  const primeiro = serializar('k', () => new Promise(r => { liberar = r; execucoes.push('v1'); }));
  await tick();
  const p2 = serializar('k', () => { execucoes.push('v2'); return 'v2'; });
  const p3 = serializar('k', () => { execucoes.push('v3'); return 'v3'; });
  assert.equal(p2, p3); // mesmo agendamento
  liberar('v1');
  assert.equal(await primeiro, 'v1');
  assert.equal(await p2, 'v3');
  assert.equal(await p3, 'v3');
  assert.deepEqual(execucoes, ['v1', 'v3']); // v2 foi substituído, nunca rodou em paralelo
});

test('chaves diferentes não se bloqueiam; erro não trava a fila', async () => {
  const { serializar, ocupado } = criarSerializador();
  let liberarA;
  const a = serializar('combo:1', () => new Promise(r => { liberarA = r; }));
  const b = await serializar('combo:2', () => 'b');
  assert.equal(b, 'b');
  await tick();
  liberarA('a');
  assert.equal(await a, 'a');
  await assert.rejects(serializar('combo:1', () => { throw new Error('falhou'); }), /falhou/);
  assert.equal(await serializar('combo:1', () => 'ok'), 'ok');
  await tick();
  assert.equal(ocupado('combo:1'), false);
});

test('aguardar espera execução + reexecução agendada', async () => {
  const { serializar, aguardar, ocupado } = criarSerializador();
  const feitos = [];
  serializar('k', async () => { await tick(); feitos.push(1); });
  serializar('k', async () => { await tick(); feitos.push(2); });
  await aguardar('k');
  assert.deepEqual(feitos, [1, 2]);
  assert.equal(ocupado('k'), false);
  await aguardar('nada'); // chave sem fila resolve na hora
});

function criarDbFake({ falhaPai } = {}) {
  const sqls = [];
  let tentativasPai = 0;
  return {
    sqls,
    async runAsync(sql, params) {
      sqls.push([sql, params]);
      if (falhaPai && /^DELETE FROM delivery_combos /.test(sql) && tentativasPai++ === 0) throw new Error(falhaPai);
      return { changes: 1 };
    },
  };
}

test('excluirPaiPrimeiro: apaga o pai primeiro (CASCADE leva os filhos)', async () => {
  const db = criarDbFake();
  await excluirPaiPrimeiro(db, { tabela: 'delivery_combos', id: 9 }, [{ tabela: 'delivery_combo_itens', coluna: 'combo_id' }]);
  assert.deepEqual(db.sqls, [
    ['DELETE FROM delivery_combos WHERE id = ?', [9]],
    ['DELETE FROM delivery_combo_itens WHERE combo_id = ?', [9]],
  ]);
});

test('excluirPaiPrimeiro: sem CASCADE (erro de FK) cai em filhos → pai', async () => {
  const db = criarDbFake({ falhaPai: 'Erro ao excluir de delivery_combos: update or delete on table "delivery_combos" violates foreign key constraint' });
  await excluirPaiPrimeiro(db, { tabela: 'delivery_combos', id: 9 }, [{ tabela: 'delivery_combo_itens', coluna: 'combo_id' }]);
  assert.deepEqual(db.sqls.map(s => s[0]), [
    'DELETE FROM delivery_combos WHERE id = ?',
    'DELETE FROM delivery_combo_itens WHERE combo_id = ?',
    'DELETE FROM delivery_combos WHERE id = ?',
  ]);
});

test('excluirPaiPrimeiro: outro erro no pai propaga e NÃO toca nos filhos', async () => {
  const db = criarDbFake({ falhaPai: 'Failed to fetch' });
  await assert.rejects(
    excluirPaiPrimeiro(db, { tabela: 'delivery_combos', id: 9 }, [{ tabela: 'delivery_combo_itens', coluna: 'combo_id' }]),
    /Failed to fetch/,
  );
  assert.equal(db.sqls.length, 1);
});
