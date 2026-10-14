/**
 * Regressão — lista "Receitas base" mostrando custo errado (2026-10-14).
 *
 * Conta teste, Kit de Início confeitaria: Brigadeiro tradicional com
 * custo_total 0,0148 e custo_por_kg 20,06 (rende 600 g). Três causas:
 *  1. cascadeRecalc.recalcularPreparo só gravava custo_por_kg — custo_total
 *     ficava congelado no valor que o Kit escreveu.
 *  2. marketPrices.getMarketPrice lia `qty` (em g/mL) como kg/L — preço 1000×
 *     menor (leite condensado 395 g → R$ 0,01). O Kit somava esse preço no
 *     custo_total do preparo.
 *  3. PreparosScreen mostrava custo_total ao lado do selo "kg"; o reajuste em
 *     massa gravava custo_total/rendimento (por grama) em custo_por_kg.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const calc = await import('../src/utils/calculations.js');
const cascade = await import('../src/services/cascadeRecalc.js');
const { getMarketPrice } = await import('../src/data/marketPrices.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

function fakeDb(state) {
  const findId = (arr, id) => (arr || []).find(r => r.id === id) || null;
  return {
    async getFirstAsync(sql, params = []) {
      if (sql.includes('FROM preparos WHERE id')) return findId(state.preparos, params[0]);
      throw new Error('fakeDb.getFirstAsync: ' + sql);
    },
    async getAllAsync(sql, params = []) {
      if (sql.includes('FROM preparo_ingredientes pi JOIN materias_primas')) {
        return (state.preparoIngs || []).filter(r => r.preparo_id === params[0]).map(r => {
          const mp = findId(state.materias, r.materia_prima_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_por_kg: mp.preco_por_kg, unidade_medida: mp.unidade_medida };
        });
      }
      if (sql.includes('FROM preparo_subpreparos') || sql.includes('FROM preparo_embalagens')) return [];
      throw new Error('fakeDb.getAllAsync: ' + sql);
    },
    async runAsync(sql, params = []) {
      const m = sql.match(/^UPDATE preparos SET (.+) WHERE id = \?$/);
      if (!m) throw new Error('fakeDb.runAsync: ' + sql);
      const p = findId(state.preparos, params[params.length - 1]);
      m[1].split(',').map(s => s.trim().split(/\s*=\s*/)[0]).forEach((col, i) => { p[col] = params[i]; });
      return { changes: 1 };
    },
  };
}

test('recalcularPreparo grava custo_total junto com custo_por_kg (não deixa total congelado)', async () => {
  const state = {
    // leite condensado R$ 19/kg, 395 g → 7,505
    materias: [{ id: 1, preco_por_kg: 19, unidade_medida: 'g' }],
    preparos: [{ id: 10, rendimento_total: 600, unidade_medida: 'Grama(s)', custo_total: 0.0148, custo_por_kg: 0.0247 }],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 395 }],
  };
  await cascade.recalcularPreparo(fakeDb(state), 10);
  const p = state.preparos[0];
  assert.ok(close(p.custo_total, 7.505), `custo_total ${p.custo_total}`);
  assert.ok(close(p.custo_por_kg, 7.505 / 600 * 1000), `custo_por_kg ${p.custo_por_kg}`);
});

test('getMarketPrice: qty da base está em g/mL — 395 g de leite condensado custa R$ 7,50, não R$ 0,01', () => {
  assert.equal(getMarketPrice('Leite condensado', 395, 'g'), 7.5);
  assert.equal(getMarketPrice('Farinha de trigo', 1, 'kg'), 5.5);
  assert.equal(getMarketPrice('Farinha de trigo', 500, 'g'), 2.75);
  assert.equal(getMarketPrice('Creme de leite fresco', 1, 'L'), 28);
});

test('calcCustoListaPreparo: custo por kg/L como está; receita em unidade → por 1 un', () => {
  assert.ok(close(calc.calcCustoListaPreparo(20.0633, 'Grama(s)'), 20.0633));
  assert.ok(close(calc.calcCustoListaPreparo(12, 'Mililitro(s)'), 12));
  // 30 un custando R$ 45 → custo_por_kg = 45/30×1000 = 1500 → R$ 1,50/un
  assert.ok(close(calc.calcCustoListaPreparo(1500, 'un'), 1.5));
  assert.equal(calc.calcCustoListaPreparo(0, 'g'), 0);
});

test('calcCustoTotalPreparo deriva o total do custo_por_kg (inverso de calcCustoPorKgPreparo)', () => {
  assert.ok(close(calc.calcCustoTotalPreparo(20.0633, 600, 'Grama(s)'), 12.03798));
  assert.ok(close(calc.calcCustoTotalPreparo(17.8002, 1, 'kg'), 17.8002));
  assert.ok(close(calc.calcCustoTotalPreparo(1500, 30, 'un'), 45));
  const ck = calc.calcCustoPorKgPreparo(12.04, 600, 'g');
  assert.ok(close(calc.calcCustoTotalPreparo(ck, 600, 'g'), 12.04));
});

test('reajusteCustoPreparo: mantém custo_por_kg na escala por kg (não por grama)', () => {
  const prep = { custo_por_kg: 20, custo_total: 0.0148, rendimento_total: 600, unidade_medida: 'g' };
  // +10 %: total real 12,00 → 13,20; por kg 20 → 22
  const pct = calc.reajusteCustoPreparo(prep, 'percent', 1, 10);
  assert.ok(close(pct.custo_total, 13.2), `total ${pct.custo_total}`);
  assert.ok(close(pct.custo_por_kg, 22), `kg ${pct.custo_por_kg}`);
  // +R$ 3,00 no total: 12 → 15; por kg 25
  const abs = calc.reajusteCustoPreparo(prep, 'value', 1, 3);
  assert.ok(close(abs.custo_total, 15));
  assert.ok(close(abs.custo_por_kg, 25));
  // nunca negativo
  const neg = calc.reajusteCustoPreparo(prep, 'value', -1, 100);
  assert.equal(neg.custo_total, 0);
  assert.equal(neg.custo_por_kg, 0);
});
