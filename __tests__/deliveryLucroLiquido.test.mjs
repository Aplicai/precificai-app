/**
 * Bug 2026-11-11 — "Preços do Delivery": a coluna "Lucro" usava
 * calcResultadoDelivery (preço − CMV − comissão), sem custos do mês (fixos %)
 * nem imposto, enquanto "Simulação no iFood" (SimulacaoProdutoScreen) desconta
 * tudo. Mesmo produto, mesmo preço, dois lucros.
 *
 * Cenário (Short 23, hambúrguer): CMV R$ 16,0478, fixos 25%, imposto 6%,
 * maquininha 3% (não entra no delivery), iFood 27%. A R$ 30:
 *   tela antiga: 30 − 16,05 − 8,10 = R$ 5,85
 *   conta completa: 30 − 16,05 − 7,50 − 1,80 − 8,10 = −R$ 3,45
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  calcResultadoDelivery,
  calcLucroDeliveryLiquido,
  calcPrecoMesmoLucroReais,
  calcTaxaMaximaPlataforma,
} from '../src/utils/deliveryPricing.js';
import { normalizePlataforma } from '../src/utils/deliveryAdapter.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, obtido ${a}`);
const CMV_HB = 16.0478;
const CTX_HB = { lucroPerc: 0.15, fixoPerc: 0.25, impostoPerc: 0.06, variavelPerc: 0.09 };
const IFOOD = { plataforma: 'iFood', taxa_plataforma: 27 };

// Mesma conta da composição em SimulacaoProdutoScreen (valFixos..lucroLiquido).
function lucroSimulacao(preco, cmv, ctx, plat) {
  const p = normalizePlataforma(plat);
  const gastos = cmv + preco * (ctx.fixoPerc + ctx.impostoPerc + p.comissaoPct + p.taxaOnlinePct + p.outrosPct)
    + p.cupomR + p.freteSubsidiadoR;
  return preco - gastos;
}

test('hambúrguer a R$ 30 no iFood 27%: lucro líquido desconta fixos e imposto (−R$ 3,45, não R$ 5,85)', () => {
  const legado = calcResultadoDelivery({ precoVenda: 30, custoUnit: CMV_HB, plat: IFOOD });
  assert.equal(Math.round(legado.lucro * 100) / 100, 5.85); // o que a tela mostrava

  const r = calcLucroDeliveryLiquido({ precoVenda: 30, cmv: CMV_HB, plat: IFOOD, contexto: CTX_HB });
  close(r.valorFixos, 7.5);
  close(r.valorImposto, 1.8);
  close(r.valorComissao, 8.1);
  close(r.lucro, 30 - CMV_HB - 7.5 - 1.8 - 8.1);
  assert.equal(Math.round(r.lucro * 100) / 100, -3.45);
  close(r.margem, r.lucro / 30);
  assert.equal(r.inviavel, false); // prejuízo comum: mostra o valor, não "—"
});

test('lucro líquido == composição da Simulação no iFood (comissão + taxa online + outros + cupom + frete)', () => {
  const plat = { taxa_plataforma: 23, comissao_app: 3.2, outros_perc: 1, desconto_promocao: 2, embalagem_extra: 1, taxa_entrega: 4 };
  for (const preco of [18, 30, 47.9]) {
    const r = calcLucroDeliveryLiquido({ precoVenda: preco, cmv: CMV_HB, plat, contexto: CTX_HB });
    close(r.lucro, lucroSimulacao(preco, CMV_HB, CTX_HB, plat));
  }
});

test('no preço sugerido "mesmo lucro do balcão" a coluna Lucro mostra exatamente o lucro do balcão', () => {
  const plat = { taxa_plataforma: 27, comissao_app: 3.2, outros_perc: 0.5, desconto_promocao: 3, taxa_entrega: 2 };
  const lucroAlvo = 3.7522;
  const s = calcPrecoMesmoLucroReais({ cmv: CMV_HB, lucroAlvoReais: lucroAlvo, plat, contexto: CTX_HB });
  const r = calcLucroDeliveryLiquido({ precoVenda: s.preco, cmv: CMV_HB, plat, contexto: CTX_HB });
  close(r.lucro, lucroAlvo);
  assert.equal(r.inviavel, false);
});

test('inviável só quando fixos + imposto + taxas somam 100% ou mais do preço', () => {
  const r = calcLucroDeliveryLiquido({ precoVenda: 30, cmv: 1, plat: { taxa_plataforma: 70 }, contexto: CTX_HB });
  assert.equal(r.inviavel, true);
});

test('preço zero ou inválido é inviável com lucro 0', () => {
  for (const p of [0, -5, NaN, undefined]) {
    const r = calcLucroDeliveryLiquido({ precoVenda: p, cmv: 10, plat: IFOOD, contexto: CTX_HB });
    assert.equal(r.inviavel, true);
    assert.equal(r.lucro, 0);
    assert.equal(r.margem, 0);
  }
});

test('dica do modal: preço mínimo (lucro 0) e taxa máxima também descontam fixos e imposto', () => {
  // Break-even completo: (16,0478) / (1 − 0,25 − 0,06 − 0,27) = 38,21 — acima de R$ 30 (antes o modal dizia 21,98)
  const min = calcPrecoMesmoLucroReais({ cmv: CMV_HB, lucroAlvoReais: 0, plat: IFOOD, contexto: CTX_HB });
  close(min.preco, CMV_HB / 0.42);
  close(calcLucroDeliveryLiquido({ precoVenda: min.preco, cmv: CMV_HB, plat: IFOOD, contexto: CTX_HB }).lucro, 0);
  // A R$ 30, taxa máxima = 1 − 0,31 − 16,0478/30 = 15,51%
  const tx = calcTaxaMaximaPlataforma({ precoVenda: 30, cmv: CMV_HB, plat: IFOOD, contexto: CTX_HB });
  close(tx, (1 - 0.31 - CMV_HB / 30) * 100);
  close(calcLucroDeliveryLiquido({ precoVenda: 30, cmv: CMV_HB, plat: { taxa_plataforma: tx }, contexto: CTX_HB }).lucro, 0);
  assert.equal(calcTaxaMaximaPlataforma({ precoVenda: 0, cmv: 1, plat: IFOOD, contexto: CTX_HB }), null);
  assert.equal(calcTaxaMaximaPlataforma({ precoVenda: 10, cmv: 20, plat: IFOOD, contexto: CTX_HB }), 0);
});

test('DeliveryPrecosScreen usa o lucro líquido (com contexto financeiro), não o calcResultadoDelivery legado', () => {
  const src = readFileSync(new URL('../src/screens/DeliveryPrecosScreen.js', import.meta.url), 'utf8');
  assert.ok(!/calcResultadoDelivery\(/.test(src), 'tela ainda chama calcResultadoDelivery');
  const usos = src.match(/calcLucroDeliveryLiquido\(\{[^}]*contexto: contextoFinanceiro/g) || [];
  assert.ok(usos.length >= 2, `linha + resumo devem usar calcLucroDeliveryLiquido com contextoFinanceiro (achados: ${usos.length})`);
  assert.ok(/precoMinimo:/.test(src) && /taxaMaxima:/.test(src), 'modal de dicas deve receber precoMinimo/taxaMaxima calculados com o contexto');
});
