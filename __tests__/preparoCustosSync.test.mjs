/**
 * Regressão — custo velho de receita base no picker do produto e na Ficha
 * Técnica ("R$ 0,01" no Brigadeiro, "R$ 0,03" na Ganache; tutorial 03 /
 * reels 02, 2026-10-16).
 *
 * O custo gravado (custo_total/custo_por_kg) só era refeito quando o preço
 * mudava por um caminho com cascade. Valores do Kit de Início antigo e
 * reajustes em massa de insumo ficavam congelados. Agora as telas refazem o
 * custo das receitas a partir dos preços atuais (calcCustosPreparos) e
 * regravam o que divergir (sincronizarCustosPreparos).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const calc = await import('../src/utils/calculations.js');
const cascade = await import('../src/services/cascadeRecalc.js');
const { markErrorResult } = await import('../src/database/dbResult.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// Conta do vídeo: Brigadeiro do Kit antigo (custo fantasma 0,0148) e Ganache.
function estadoBase() {
  return {
    materias: [
      { id: 1, nome: 'Leite condensado', preco_por_kg: 19, unidade_medida: 'g' },
      { id: 2, nome: 'Chocolate', preco_por_kg: 40, unidade_medida: 'kg' },
      { id: 3, nome: 'Creme de leite', preco_por_kg: 20, unidade_medida: 'Mililitro(s)' },
      { id: 4, nome: 'Ovo', preco_por_kg: 0.8, unidade_medida: 'un' },
    ],
    preparos: [
      { id: 10, nome: 'Brigadeiro', rendimento_total: 600, unidade_medida: 'Grama(s)', custo_total: 0.0148, custo_por_kg: 0.0247 },
      { id: 11, nome: 'Ganache', rendimento_total: 500, unidade_medida: 'g', custo_total: 0.03, custo_por_kg: 0.06 },
      // Recheio usa a Ganache como sub-receita + caixinha
      { id: 12, nome: 'Recheio', rendimento_total: 1, unidade_medida: 'kg', custo_total: 0, custo_por_kg: 0 },
      // Sem linhas: custo digitado à mão, não pode ser tocado
      { id: 13, nome: 'Massa comprada', rendimento_total: 1000, unidade_medida: 'g', custo_total: 30, custo_por_kg: 30 },
      { id: 14, nome: 'Massa de ovos', rendimento_total: 12, unidade_medida: 'un', custo_total: 0, custo_por_kg: 0 },
    ],
    ingredientes: [
      { preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 395 }, // 7,505
      { preparo_id: 11, materia_prima_id: 2, quantidade_utilizada: 0.2 }, // qtd na unidade do insumo: 0,2 kg × R$ 40 = 8
      { preparo_id: 11, materia_prima_id: 3, quantidade_utilizada: 300 }, // 300 mL de R$ 20/L = 6
      { preparo_id: 14, materia_prima_id: 4, quantidade_utilizada: 6 },   // 6 un × 0,80 = 4,8
    ],
    subpreparos: [
      { preparo_id: 12, sub_preparo_id: 11, quantidade_utilizada: 250 },   // 250 g de ganache
    ],
    embalagensLinhas: [
      { preparo_id: 12, embalagem_id: 7, quantidade_utilizada: 2 },
    ],
    embalagens: [{ id: 7, preco_unitario: 0.5 }],
  };
}

test('calcCustosPreparos: refaz custo dos preços atuais (insumos, sub-receita, embalagem)', () => {
  const custos = calc.calcCustosPreparos(estadoBase());
  const brig = custos.get(10);
  assert.ok(close(brig.custo_total, 7.505), `brigadeiro total ${brig.custo_total}`);
  assert.ok(close(brig.custo_por_kg, 7.505 / 600 * 1000));
  const gan = custos.get(11);
  assert.ok(close(gan.custo_total, 14), `ganache total ${gan.custo_total}`);
  assert.ok(close(gan.custo_por_kg, 28));
  // Recheio: 250 g de ganache a R$ 28/kg = 7 + 2 × 0,50 = 8; rende 1 kg → R$ 8/kg
  const rec = custos.get(12);
  assert.ok(close(rec.custo_total, 8), `recheio total ${rec.custo_total}`);
  assert.ok(close(rec.custo_por_kg, 8));
  // Receita em unidade: custo_por_kg = por 1000 un
  const ovos = custos.get(14);
  assert.ok(close(ovos.custo_total, 4.8));
  assert.ok(close(calc.calcCustoListaPreparo(ovos.custo_por_kg, 'un'), 0.4));
});

test('calcCustosPreparos: receita sem linhas fica de fora (custo manual preservado)', () => {
  const custos = calc.calcCustosPreparos(estadoBase());
  assert.equal(custos.has(13), false);
});

test('calcCustosPreparos: sub-receita listada DEPOIS do pai também converge', () => {
  const st = estadoBase();
  st.preparos = [...st.preparos].reverse();
  const custos = calc.calcCustosPreparos(st);
  assert.ok(close(custos.get(12).custo_total, 8));
});

test('calcCustosPreparos: insumo sem preço → custo 0 (não o fantasma do Kit)', () => {
  const st = estadoBase();
  st.materias[0].preco_por_kg = 0;
  const custos = calc.calcCustosPreparos(st);
  assert.equal(custos.get(10).custo_total, 0);
  assert.equal(custos.get(10).custo_por_kg, 0);
});

test('custoPreparoDifere: tolera arredondamento float4 e pega divergência real', () => {
  assert.equal(calc.custoPreparoDifere(20.063333, 20.0633333333), false);
  assert.equal(calc.custoPreparoDifere(Math.fround(12508.3333), 12508.3333), false);
  assert.equal(calc.custoPreparoDifere(0.0148, 7.505), true);
  assert.equal(calc.custoPreparoDifere(0.0148, 0), true);
  assert.equal(calc.custoPreparoDifere(null, 0), false);
});

test('formatRendimentoPreparo: unidade real, legado "Grama(s)" e kg/L', () => {
  assert.equal(calc.formatRendimentoPreparo(600, 'Grama(s)'), '600 g');
  assert.equal(calc.formatRendimentoPreparo(400, 'Mililitro(s)'), '400 mL');
  assert.equal(calc.formatRendimentoPreparo(400, 'mL'), '400 mL');
  assert.equal(calc.formatRendimentoPreparo(1500, 'g'), '1,5 kg');
  assert.equal(calc.formatRendimentoPreparo(2, 'kg'), '2 kg');
  assert.equal(calc.formatRendimentoPreparo(1.5, 'L'), '1,5 L');
  assert.equal(calc.formatRendimentoPreparo(30, 'un'), '30 unidades');
  assert.equal(calc.formatRendimentoPreparo(1, 'un'), '1 unidade');
});

function fakeDb(st, { erroEm = null, linhasExtras = 0 } = {}) {
  const tabelas = () => ({
    preparos: st.preparos,
    preparo_ingredientes: [...st.ingredientes, ...Array.from({ length: linhasExtras }, () => ({ preparo_id: 999, materia_prima_id: 1, quantidade_utilizada: 1 }))],
    materias_primas: st.materias,
    preparo_subpreparos: st.subpreparos,
    preparo_embalagens: st.embalagensLinhas,
    embalagens: st.embalagens,
  });
  const updates = [];
  return {
    updates,
    async getAllAsync(sql) {
      const m = sql.match(/^SELECT \* FROM (\w+)$/);
      if (!m) throw new Error('fakeDb.getAllAsync: ' + sql);
      if (m[1] === erroEm) return markErrorResult([], 'falhou');
      return tabelas()[m[1]].map(r => ({ ...r }));
    },
    async runAsync(sql, params) {
      assert.equal(sql, 'UPDATE preparos SET custo_por_kg = ?, custo_total = ? WHERE id = ?');
      updates.push(params);
      const p = st.preparos.find(x => x.id === params[2]);
      p.custo_por_kg = params[0];
      p.custo_total = params[1];
      return { changes: 1 };
    },
  };
}

test('sincronizarCustosPreparos: regrava só as receitas divergentes; 2ª passada não grava nada', async () => {
  const st = estadoBase();
  const db = fakeDb(st);
  const custos = await cascade.sincronizarCustosPreparos(db);
  assert.ok(custos);
  const ids = db.updates.map(u => u[2]).sort();
  assert.deepEqual(ids, [10, 11, 12, 14]); // 13 (manual) intocado
  assert.equal(custos.alterados, 4); // a Home recarrega só quando > 0
  assert.equal(st.preparos.find(p => p.id === 13).custo_total, 30);
  assert.ok(close(st.preparos.find(p => p.id === 10).custo_total, 7.505));

  const db2 = fakeDb(st);
  const custos2 = await cascade.sincronizarCustosPreparos(db2);
  assert.equal(db2.updates.length, 0);
  assert.equal(custos2.alterados, 0);
});

test('sincronizarCustosPreparos: leitura com erro ou cortada em 1000 linhas → não grava', async () => {
  const st = estadoBase();
  const dbErr = fakeDb(st, { erroEm: 'materias_primas' });
  assert.equal(await cascade.sincronizarCustosPreparos(dbErr), null);
  assert.equal(dbErr.updates.length, 0);

  const dbCortado = fakeDb(st, { linhasExtras: 1000 });
  assert.equal(await cascade.sincronizarCustosPreparos(dbCortado), null);
  assert.equal(dbCortado.updates.length, 0);
  assert.equal(st.preparos.find(p => p.id === 10).custo_total, 0.0148);
});

test('aplicarCustosPreparos: troca custo nas linhas da tela e marca _custoSincronizado', async () => {
  const st = estadoBase();
  const rows = st.preparos.map(p => ({ ...p }));
  const out = await cascade.aplicarCustosPreparos(fakeDb(st), rows);
  const brig = out.find(p => p.id === 10);
  assert.ok(close(brig.custo_total, 7.505));
  assert.equal(brig._custoSincronizado, true);
  const manual = out.find(p => p.id === 13);
  assert.equal(manual.custo_total, 30);
  assert.equal(manual._custoSincronizado, undefined);
  // Ordem da tela preservada
  assert.deepEqual(out.map(p => p.id), rows.map(p => p.id));
});

test('aplicarCustosPreparos: falha na sincronização devolve as linhas como vieram', async () => {
  const st = estadoBase();
  const rows = st.preparos.map(p => ({ ...p }));
  const out = await cascade.aplicarCustosPreparos(fakeDb(st, { erroEm: 'preparo_subpreparos' }), rows);
  assert.equal(out, rows);
  const vazio = markErrorResult([], 'x');
  assert.equal(await cascade.aplicarCustosPreparos(fakeDb(st), vazio), vazio);
});
