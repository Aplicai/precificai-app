/**
 * Testes da engine de precificação — APP-40 (parcial: cobertura do utils/precificacao).
 *
 * Roda via Node 18+ test runner: `node --test __tests__/`.
 * Não requer Jest nem setup React Native.
 *
 * Cobre cenários do feedback Milene + cenários canônicos do método Precificaí.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  calcularPrecoBalcao,
  calcularPrecoDelivery,
  calcularPrecoCombo,
  calcularMargemContribuicao,
  calcularLucroLiquido,
  validarSomaPercentual,
  pctToDecimal,
  compararDeliveryVsBalcao,
} from '../src/utils/precificacao.js';

const close = (a, b, eps = 0.02) => Math.abs(a - b) < eps;

// ─────────────────────────────────────────────────────────────────────
// Cenário canônico balcão (vindo do feedback original — mousse maracujá)
// ─────────────────────────────────────────────────────────────────────
test('balcão — mousse: CMV 1,88 / lucro 15% / fixo 22,6% / variável 8% → R$ 3,46', () => {
  const r = calcularPrecoBalcao({ cmv: 1.88, lucroPerc: 0.15, fixoPerc: 0.226, variavelPerc: 0.08 });
  assert.equal(r.validacao.ok, true);
  assert.equal(r.validacao.nivel, 'ok');
  assert.ok(close(r.preco, 3.46), `esperado ~3.46, veio ${r.preco}`);
  // CMV deve representar ~54.4% do preço
  assert.ok(close(r.composicao.cmvPercDoPreco, 0.544));
});

test('balcão — soma % >= 100% bloqueia', () => {
  const r = calcularPrecoBalcao({ cmv: 1.88, lucroPerc: 0.5, fixoPerc: 0.4, variavelPerc: 0.2 });
  assert.equal(r.validacao.ok, false);
  assert.equal(r.validacao.nivel, 'inviavel');
  assert.equal(r.preco, 0);
});

test('balcão — soma % entre 70-85% gera aviso amarelo', () => {
  const r = calcularPrecoBalcao({ cmv: 1, lucroPerc: 0.3, fixoPerc: 0.3, variavelPerc: 0.15 });
  assert.equal(r.validacao.ok, true);
  assert.equal(r.validacao.nivel, 'aviso');
});

test('balcão — soma % entre 85-100% gera nível crítico', () => {
  const r = calcularPrecoBalcao({ cmv: 1, lucroPerc: 0.4, fixoPerc: 0.4, variavelPerc: 0.1 });
  assert.equal(r.validacao.ok, true);
  assert.equal(r.validacao.nivel, 'critico');
});

// ─────────────────────────────────────────────────────────────────────
// Cenário delivery (mousse no iFood)
// ─────────────────────────────────────────────────────────────────────
test('delivery — mousse iFood sem cupom/frete: R$ 6,67', () => {
  const r = calcularPrecoDelivery({
    cmv: 1.88,
    lucroPerc: 0.15,
    fixoPerc: 0.226,
    impostoPerc: 0.04,
    comissaoPerc: 0.27,
    taxaPagamentoOnlinePerc: 0.032,
  });
  assert.equal(r.validacao.ok, true);
  assert.ok(close(r.preco, 6.67, 0.05), `esperado ~6.67, veio ${r.preco}`);
});

test('delivery — com cupom R$ 5 e frete R$ 8: R$ 52,77', () => {
  const r = calcularPrecoDelivery({
    cmv: 1.88,
    lucroPerc: 0.15,
    fixoPerc: 0.226,
    impostoPerc: 0.04,
    comissaoPerc: 0.27,
    taxaPagamentoOnlinePerc: 0.032,
    cupomR: 5,
    freteSubsidiadoR: 8,
  });
  assert.equal(r.validacao.ok, true);
  assert.ok(close(r.preco, 52.77, 0.5), `esperado ~52.77, veio ${r.preco}`);
});

test('delivery — soma % >= 100% bloqueia', () => {
  const r = calcularPrecoDelivery({
    cmv: 5,
    lucroPerc: 0.5,
    fixoPerc: 0.3,
    impostoPerc: 0.05,
    comissaoPerc: 0.2,
    taxaPagamentoOnlinePerc: 0.05,
  });
  assert.equal(r.validacao.ok, false);
  assert.equal(r.preco, 0);
});

// ─────────────────────────────────────────────────────────────────────
// Comparação delivery vs balcão (APP-27)
// ─────────────────────────────────────────────────────────────────────
test('compararDeliveryVsBalcao — delivery menor que balcão é critico', () => {
  const r = compararDeliveryVsBalcao(3.0, 5.0);
  assert.equal(r.ok, false);
  assert.equal(r.nivel, 'critico');
});

test('compararDeliveryVsBalcao — preços iguais é aviso', () => {
  const r = compararDeliveryVsBalcao(5.0, 5.0);
  assert.equal(r.ok, false);
  assert.equal(r.nivel, 'aviso');
});

test('compararDeliveryVsBalcao — delivery > balcão é OK', () => {
  const r = compararDeliveryVsBalcao(6.67, 3.46);
  assert.equal(r.ok, true);
  assert.equal(r.nivel, 'ok');
  assert.match(r.mensagem, /93%/);
});

// ─────────────────────────────────────────────────────────────────────
// Combos (APP-22)
// ─────────────────────────────────────────────────────────────────────
test('combo — soma de CMVs aplica markup divisor', () => {
  const r = calcularPrecoCombo({
    cmvCombo: 9.88, // mousse 1.88 + bolo 8.00
    lucroPerc: 0.15,
    fixoPerc: 0.226,
    variavelPerc: 0.08,
  });
  assert.equal(r.validacao.ok, true);
  // 9.88 / 0.544 ≈ 18.16
  assert.ok(close(r.preco, 18.16, 0.1), `esperado ~18.16, veio ${r.preco}`);
});

test('combo com desconto em R$', () => {
  const r = calcularPrecoCombo({
    cmvCombo: 9.88,
    lucroPerc: 0.15, fixoPerc: 0.226, variavelPerc: 0.08,
    descontoR: 2,
  });
  assert.ok(close(r.preco, 16.16, 0.1));
  assert.ok(close(r.precoSemDesconto, 18.16, 0.1));
});

test('combo com desconto em % (10%)', () => {
  const r = calcularPrecoCombo({
    cmvCombo: 9.88,
    lucroPerc: 0.15, fixoPerc: 0.226, variavelPerc: 0.08,
    descontoPerc: 0.10,
  });
  assert.ok(close(r.preco, 16.34, 0.1));
});

// ─────────────────────────────────────────────────────────────────────
// Margem de contribuição e lucro líquido (APP-21 — nomenclatura)
// ─────────────────────────────────────────────────────────────────────
test('margem de contribuição = preço − CMV − variáveis', () => {
  const r = calcularMargemContribuicao({ preco: 10, cmv: 4, variavelPerc: 0.10 });
  assert.equal(r.variavelR, 1);
  assert.equal(r.mcR, 5);
  assert.equal(r.mcP, 0.5);
});

test('lucro líquido = preço − CMV − variáveis − fixos', () => {
  const r = calcularLucroLiquido({ preco: 10, cmv: 4, variavelPerc: 0.10, fixoPerc: 0.20 });
  assert.equal(r.variavelR, 1);
  assert.equal(r.fixoR, 2);
  assert.equal(r.llR, 3);
  assert.equal(r.llP, 0.3);
});

// ─────────────────────────────────────────────────────────────────────
// pctToDecimal helper
// ─────────────────────────────────────────────────────────────────────
test('pctToDecimal aceita 15 (%) e converte', () => {
  assert.equal(pctToDecimal(15), 0.15);
  assert.equal(pctToDecimal('15'), 0.15);
  assert.equal(pctToDecimal('15,5'), 0.155);
});

test('pctToDecimal mantém valores já decimais', () => {
  assert.equal(pctToDecimal(0.15), 0.15);
  assert.equal(pctToDecimal(0.5), 0.5);
});

test('pctToDecimal lida com inválidos', () => {
  assert.equal(pctToDecimal(null), 0);
  assert.equal(pctToDecimal(''), 0);
  assert.equal(pctToDecimal('abc'), 0);
});

// ─────────────────────────────────────────────────────────────────────
// validarSomaPercentual
// ─────────────────────────────────────────────────────────────────────
test('validarSomaPercentual — limites das faixas', () => {
  assert.equal(validarSomaPercentual(0.5).nivel, 'ok');
  assert.equal(validarSomaPercentual(0.69).nivel, 'ok');
  assert.equal(validarSomaPercentual(0.7).nivel, 'aviso');
  assert.equal(validarSomaPercentual(0.84).nivel, 'aviso');
  assert.equal(validarSomaPercentual(0.85).nivel, 'critico');
  assert.equal(validarSomaPercentual(0.99).nivel, 'critico');
  assert.equal(validarSomaPercentual(1.0).nivel, 'inviavel');
  assert.equal(validarSomaPercentual(1.0).ok, false);
});
