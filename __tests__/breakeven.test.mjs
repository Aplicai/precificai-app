/**
 * Testes — src/utils/breakeven.js (audit 2026-09-09, bugs B10 e B11).
 *
 * Garante que o "Ponto de Equilíbrio Traduzido" do Relatório e o "Mínimo pra
 * pagar as contas" da Home dão o MESMO número, e que a "Sobra do mês" da Home
 * nunca contradiz o card de PE ao lado.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/breakeven.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calcPontoEquilibrio, calcSobraMes } from '../src/utils/breakeven.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, obtido ${a}`);

// Réplica literal de HomeScreen.js (`denominador = 1 - cmvPercent - totalVar;
// pontoEquilibrio = denominador > 0 ? totalFixas / denominador : 0`).
function peHome(totalFixas, cmvPercent, totalVar) {
  const denominador = 1 - cmvPercent - totalVar;
  return denominador > 0 ? totalFixas / denominador : 0;
}

test('PE (exemplo de prod): fixas 3.422,70 · variáveis 11,5 % · CMV 16,5 % → R$ 4.753,75 na Home E no Relatório', () => {
  const home = peHome(3422.70, 0.165, 0.115);
  const relatorio = calcPontoEquilibrio({ fixas: 3422.70, variaveisPerc: 0.115, cmvPerc: 0.165 });
  close(home, 4753.75);
  close(relatorio, 4753.75);
  close(relatorio, home, 1e-9);
  // "por dia" do Relatório = PE mensal / 30
  close(relatorio / 30, 158.458333, 1e-5);
});

test('PE (caso do audit 8.2): fixas 2.733,60 · CMV 4,13/25 · var 11,5 % → Relatório == Home (antes 1,46× maior)', () => {
  const cmv = 4.13 / 25;
  const home = peHome(2733.6, cmv, 0.115);
  const relatorio = calcPontoEquilibrio({ fixas: 2733.6, variaveisPerc: 0.115, cmvPerc: cmv });
  close(relatorio, home, 1e-9);
  close(relatorio / 30, 126.59, 0.01);
});

test('PE = 0 quando não há fixas ou a margem de contribuição é ≤ 0 (mesmo comportamento da Home)', () => {
  assert.equal(calcPontoEquilibrio({ fixas: 0, variaveisPerc: 0.1, cmvPerc: 0.3 }), 0);
  assert.equal(calcPontoEquilibrio({ fixas: 1000, variaveisPerc: 0.6, cmvPerc: 0.4 }), peHome(1000, 0.4, 0.6));
  assert.equal(calcPontoEquilibrio({ fixas: 1000, variaveisPerc: 0.7, cmvPerc: 0.5 }), 0);
  // entradas inválidas não viram NaN
  assert.equal(calcPontoEquilibrio({ fixas: 'abc', variaveisPerc: null, cmvPerc: undefined }), 0);
  close(calcPontoEquilibrio({ fixas: '1000', variaveisPerc: '0,1', cmvPerc: 0 }), 1000 / 0.9);
});

test('Sobra do mês (audit 7.2): faturamento 3.500 · fixas 2.733 · CMV 16,5 % · var 11,5 % → −213 (antes +767)', () => {
  const r = calcSobraMes({ faturamento: 3500, fixas: 2733, variaveisPerc: 0.115, cmvPerc: 0.165, temProdutos: true });
  close(r.sobra, -213);
  assert.equal(r.soFixas, false);
});

test('Sobra do mês nunca contradiz o PE: sobra ≥ 0 ⇔ faturamento ≥ PE', () => {
  const base = { fixas: 2733, variaveisPerc: 0.115, cmvPerc: 0.165 };
  const pe = calcPontoEquilibrio(base); // 2733 / 0,72 = 3.795,83
  close(pe, 3795.8333, 1e-4);
  assert.ok(calcSobraMes({ ...base, faturamento: pe - 1, temProdutos: true }).sobra < 0);
  assert.ok(calcSobraMes({ ...base, faturamento: pe + 1, temProdutos: true }).sobra > 0);
  close(calcSobraMes({ ...base, faturamento: pe, temProdutos: true }).sobra, 0, 1e-9);
});

test('Sobra do mês sem produtos com preço: só custos fixos (faturamento − fixas) e sinaliza soFixas', () => {
  const r = calcSobraMes({ faturamento: 3500, fixas: 2733, variaveisPerc: 0.115, cmvPerc: 0, temProdutos: false });
  assert.equal(r.sobra, 767);
  assert.equal(r.soFixas, true);
});
