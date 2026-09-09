/**
 * Testes de regressão — src/utils/deliveryPricing.js (auditoria A8).
 *
 * Roda via `npm test` (node --test). Módulo puro (só importa precificacao.js).
 *
 * Valores esperados derivados à mão da fórmula documentada no cabeçalho do
 * módulo (desconto% → cupom R$ → comissão sobre [preço+frete] → frete).
 * Testes marcados `todo: 'AUDIT BUG…'` afirmam o valor CORRETO e documentam
 * uma divergência real encontrada na auditoria.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  normalizePlatform,
  calcResultadoDelivery,
  sugerirPrecoDelivery,
  calcPrecoBreakEven,
  calcSugestaoDeliveryCompleta,
  calcPrecoMesmoLucroReais,
} from '../src/utils/deliveryPricing.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, obtido ${a}`);

// ───────────────────────────── normalizePlatform ─────────────────────────────

test('normalizePlatform — semântica canônica: taxa_plataforma + comissao_app + outros_perc somam em comissaoPct; cupom R$ = desconto_promocao (+ embalagem_extra legado)', () => {
  const p = normalizePlatform({ plataforma: 'iFood', taxa_plataforma: 27, taxa_entrega: 8, embalagem_extra: 5, desconto_promocao: 10 });
  assert.equal(p.nome, 'iFood');
  close(p.comissaoPct, 0.27);
  assert.equal(p.descontoPct, 0);
  assert.equal(p.cupomR$, 15);
  assert.equal(p.taxaEntregaR$, 8);
  const soma = normalizePlatform({ taxa_plataforma: 27, comissao_app: 3.2, outros_perc: 1 });
  close(soma.comissaoPct, 0.312);
});

test('normalizePlatform — aceita string com vírgula e cai em zero para inválidos', () => {
  const p = normalizePlatform({ nome: 'X', comissao_app: '12,5', taxa_entrega: 'abc' });
  assert.equal(p.nome, 'X');
  close(p.comissaoPct, 0.125);
  assert.equal(p.taxaEntregaR$, 0);
  const vazio = normalizePlatform(null);
  assert.equal(vazio.nome, 'Plataforma');
  assert.equal(vazio.comissaoPct, 0);
});

// ───────────────────────────── calcResultadoDelivery ─────────────────────────

test('calcResultadoDelivery — comissão 20% + frete R$5: preço 30 / custo 10 → lucro 8, margem 26,67%', () => {
  const r = calcResultadoDelivery({ precoVenda: 30, custoUnit: 10, plat: { taxa_plataforma: 20, taxa_entrega: 5 } });
  assert.equal(r.precoComDesconto, 30);
  assert.equal(r.precoAposCupom, 30);
  assert.equal(r.baseComissao, 35);          // comissão incide sobre preço + frete
  close(r.valorComissao, 7);
  close(r.receitaLiq, 18);                   // 30 − 7 − 5
  close(r.lucro, 8);
  close(r.margem, 8 / 30);
  assert.equal(r.inviavel, false);
  assert.equal(r.motivoInviavel, null);
});

test('calcResultadoDelivery — cupom R$12 (10 + 2 legado) antes da comissão 25%', () => {
  const r = calcResultadoDelivery({ precoVenda: 50, custoUnit: 20, plat: { taxa_plataforma: 25, desconto_promocao: 10, embalagem_extra: 2 } });
  close(r.valorDesconto, 0);
  close(r.precoComDesconto, 50);
  close(r.precoAposCupom, 38);
  close(r.valorComissao, 9.5);
  close(r.receitaLiq, 28.5);
  close(r.lucro, 8.5);
  close(r.margem, 0.17);
  assert.equal(r.inviavel, false);
});

test('calcResultadoDelivery — preço zero é inviável com motivo explícito', () => {
  const r = calcResultadoDelivery({ precoVenda: 0, custoUnit: 10, plat: {} });
  assert.equal(r.inviavel, true);
  assert.equal(r.motivoInviavel, 'Preço de venda zero ou negativo');
  assert.equal(r.preco, 0);
});

test('calcResultadoDelivery — lucro negativo vs receita negativa geram motivos distintos', () => {
  const lucroNeg = calcResultadoDelivery({ precoVenda: 10, custoUnit: 9, plat: { taxa_plataforma: 20 } });
  close(lucroNeg.receitaLiq, 8);
  close(lucroNeg.lucro, -1);
  assert.equal(lucroNeg.inviavel, true);
  assert.equal(lucroNeg.motivoInviavel, 'Lucro negativo (receita líquida < CMV)');

  const recNeg = calcResultadoDelivery({ precoVenda: 10, custoUnit: 1, plat: { taxa_plataforma: 20, embalagem_extra: 12 } });
  assert.ok(recNeg.receitaLiq < 0);
  assert.equal(recNeg.motivoInviavel, 'Descontos + comissão > preço');
});

// ───────────────────────────── sugerirPrecoDelivery ──────────────────────────

test('sugerirPrecoDelivery — comissão 20%, custo 10, margem 30% → R$ 20 (bate com o cálculo direto)', () => {
  const s = sugerirPrecoDelivery({ custoUnit: 10, plat: { taxa_plataforma: 20 }, margemAlvo: 0.30 });
  assert.equal(s.inviavel, false);
  assert.equal(s.precoSugerido, 20);
  assert.equal(s.precoMinimo, 12.5);        // 10 / 0.8
  // round-trip: o preço sugerido deve entregar exatamente a margem alvo
  const r = calcResultadoDelivery({ precoVenda: s.precoSugerido, custoUnit: 10, plat: { taxa_plataforma: 20 } });
  close(r.margem, 0.30);
});

test('sugerirPrecoDelivery — cupom R$2 entra multiplicado por (1−comissão); arredonda pra cima em 0,50', () => {
  const bruto = sugerirPrecoDelivery({ custoUnit: 10, plat: { taxa_plataforma: 20, embalagem_extra: 2 }, margemAlvo: 0.30, arredondar: false });
  close(bruto.precoSugerido, 23.2);         // (2×0.8 + 10) / 0.5
  const r = calcResultadoDelivery({ precoVenda: bruto.precoSugerido, custoUnit: 10, plat: { taxa_plataforma: 20, embalagem_extra: 2 } });
  close(r.margem, 0.30);
  const arred = sugerirPrecoDelivery({ custoUnit: 10, plat: { taxa_plataforma: 20, embalagem_extra: 2 }, margemAlvo: 0.30 });
  assert.equal(arred.precoSugerido, 23.5);
});

test('sugerirPrecoDelivery — frete R$5 + comissão 20%: preço sugerido deve entregar a margem alvo (round-trip)',
  () => {
  const plat = { taxa_plataforma: 20, taxa_entrega: 5 };
  const s = sugerirPrecoDelivery({ custoUnit: 10, plat, margemAlvo: 0.30, arredondar: false });
  const r = calcResultadoDelivery({ precoVenda: s.precoSugerido, custoUnit: 10, plat });
  close(r.margem, 0.30, 1e-6);
  close(s.precoSugerido, 32);
});

test('sugerirPrecoDelivery — comissão + margem ≥ 100% é inviável; custo zero é inviável', () => {
  const inv = sugerirPrecoDelivery({ custoUnit: 10, plat: { taxa_plataforma: 80 }, margemAlvo: 0.30 });
  assert.equal(inv.inviavel, true);
  assert.equal(inv.precoSugerido, null);
  assert.match(inv.motivoInviavel, /ultrapassam 100%/);
  const zero = sugerirPrecoDelivery({ custoUnit: 0, plat: { taxa_plataforma: 10 } });
  assert.equal(zero.inviavel, true);
  assert.equal(zero.motivoInviavel, 'Custo zero ou negativo');
});

test('calcPrecoBreakEven — preço que cobre a comissão de 25% sobre R$ 20 → R$ 27 (26,67 arredondado)', () => {
  assert.equal(calcPrecoBreakEven(20, { taxa_plataforma: 25 }), 27);
  assert.equal(calcPrecoBreakEven(20, { taxa_plataforma: 100 }), null);
});

// ───────────────────────────── calcSugestaoDeliveryCompleta ──────────────────

test('calcSugestaoDeliveryCompleta — markup divisor: CMV 10, lucro 15%, fixo 20%, imposto 5%, comissão 20% → R$ 25', () => {
  const r = calcSugestaoDeliveryCompleta({
    cmv: 10,
    plat: { taxa_plataforma: 20 },
    contexto: { lucroPerc: 0.15, fixoPerc: 0.20, impostoPerc: 0.05 },
  });
  close(r.preco, 25);                        // 10 / (1 − 0.60)
  close(r.variavelPerc, 0.25);
  assert.equal(r.validacao.nivel, 'ok');
  close(r.composicao.delivery.comissaoR, 5);
});

test('calcSugestaoDeliveryCompleta — cupom R$2 (embalagem_extra) e frete R$3 entram como custo absoluto', () => {
  const r = calcSugestaoDeliveryCompleta({
    cmv: 10,
    plat: { taxa_plataforma: 20, embalagem_extra: 2, taxa_entrega: 3 },
    contexto: { lucroPerc: 0.15, fixoPerc: 0.20, impostoPerc: 0.05 },
  });
  close(r.preco, 37.5);                      // (10 + 5) / 0.4
  assert.equal(r.composicao.delivery.cupomR, 2);
  assert.equal(r.composicao.delivery.freteSubsidiadoR, 3);
});

test('calcSugestaoDeliveryCompleta — outros_perc soma como variável; soma ≥ 70% gera aviso', () => {
  const r = calcSugestaoDeliveryCompleta({
    cmv: 10,
    plat: { taxa_plataforma: 20, outros_perc: 10 },
    contexto: { lucroPerc: 0.15, fixoPerc: 0.20, impostoPerc: 0.05 },
  });
  close(r.variavelPerc, 0.35);
  close(r.preco, 10 / 0.3);
  assert.equal(r.validacao.nivel, 'aviso');
});

test('calcSugestaoDeliveryCompleta — plataforma iFood cadastrada pela tela Plataformas (comissão 27% + taxa online 3,2%)',
  () => {
  const r = calcSugestaoDeliveryCompleta({
    cmv: 10,
    plat: { plataforma: 'iFood', taxa_plataforma: 27, comissao_app: 3.2, desconto_promocao: 0, taxa_entrega: 0 },
    contexto: { lucroPerc: 0.15, fixoPerc: 0.20, impostoPerc: 0.05 },
  });
  close(r.variavelPerc, 0.352, 1e-9);
  close(r.preco, 10 / (1 - 0.15 - 0.20 - 0.352), 1e-6);
});

// ───────────────────────────── calcPrecoMesmoLucroReais ──────────────────────

test('calcPrecoMesmoLucroReais — fixa o lucro em R$: CMV 10, alvo R$5, fixo 20%, imposto 5%, comissão 20% → 27,27', () => {
  const r = calcPrecoMesmoLucroReais({
    cmv: 10, lucroAlvoReais: 5,
    plat: { taxa_plataforma: 20 },
    contexto: { fixoPerc: 0.20, impostoPerc: 0.05 },
  });
  close(r.divisor, 0.55);
  close(r.preco, 15 / 0.55);
  // Verificação: preço − CMV − preço×(fixo+variável) == lucro alvo
  close(r.preco - 10 - r.preco * 0.45, 5);
  assert.equal(r.inviavel, false);
  assert.equal(r.lucroReais, 5);
});

test('calcPrecoMesmoLucroReais — custos ≥ 100% do preço é inviável com mensagem', () => {
  const r = calcPrecoMesmoLucroReais({
    cmv: 10, lucroAlvoReais: 5,
    plat: { taxa_plataforma: 30 },
    contexto: { fixoPerc: 0.50, impostoPerc: 0.30 },
  });
  assert.equal(r.inviavel, true);
  assert.equal(r.preco, 0);
  assert.equal(r.validacao.nivel, 'inviavel');
  assert.match(r.validacao.mensagem, /110\.0%/);
});
