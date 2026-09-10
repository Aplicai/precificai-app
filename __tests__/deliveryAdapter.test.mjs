/**
 * Testes de regressão — src/utils/deliveryAdapter.js (auditoria A8).
 * Módulo puro (só importa precificacao.js). Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  plataformaParaParamsDelivery,
  calcularPrecoDeliveryPlataforma,
  extrairImpostoPercentual,
  normalizePlataforma,
  buildContextoFinanceiro,
  custoDelivery,
  embalagemDeliveryDoProduto,
} from '../src/utils/deliveryAdapter.js';

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, obtido ${a}`);

const IFOOD = { id: 1, plataforma: 'iFood', taxa_plataforma: 27, comissao_app: 3.2, outros_perc: 2, desconto_promocao: 5, taxa_entrega: 8, ativo: 1 };

test('normalizePlataforma — mapa legacy → semântico (taxa_plataforma=comissão, comissao_app=taxa online, desconto_promocao=cupom R$)', () => {
  const p = normalizePlataforma(IFOOD);
  assert.equal(p.id, 1);
  assert.equal(p.nome, 'iFood');
  assert.equal(p.ativo, true);
  close(p.comissaoPct, 0.27);
  close(p.taxaOnlinePct, 0.032);
  close(p.outrosPct, 0.02);
  assert.equal(p.cupomR, 5);
  assert.equal(p.freteSubsidiadoR, 8);
});

test('normalizePlataforma — row nula/vazia devolve zeros e nome padrão', () => {
  const p = normalizePlataforma(null);
  assert.equal(p.nome, 'Plataforma');
  assert.equal(p.ativo, false);
  assert.equal(p.comissaoPct, 0);
  assert.equal(p.cupomR, 0);
});

test('plataformaParaParamsDelivery — mesmo mapa, no shape do engine', () => {
  const params = plataformaParaParamsDelivery(IFOOD, { lucroPerc: 0.15, fixoPerc: 0.2, impostoPerc: 0.05 });
  assert.deepEqual(params, {
    lucroPerc: 0.15, fixoPerc: 0.2, impostoPerc: 0.05,
    comissaoPerc: 0.27, taxaPagamentoOnlinePerc: 0.032,
    cupomR: 5, freteSubsidiadoR: 8,
  });
});

test('calcularPrecoDeliveryPlataforma — CMV 10, lucro 15%, fixo 20%, imposto 5%, comissão 20% → R$ 25', () => {
  const r = calcularPrecoDeliveryPlataforma(10, { taxa_plataforma: 20 }, { lucroPerc: 0.15, fixoPerc: 0.20, impostoPerc: 0.05 });
  close(r.preco, 25, 1e-9);
  assert.equal(r.validacao.ok, true);
});

test('extrairImpostoPercentual — soma só linhas de imposto (Simples/ICMS/ISS/MEI), ignora maquininha', () => {
  const vars = [
    { descricao: 'Imposto Simples Nacional', percentual: 0.06 },
    { descricao: 'Maquininha cartão', percentual: 0.03 },
    { descricao: 'ICMS', percentual: 0.02 },
    { descricao: 'ISS', percentual: 0.01 },
    { descricao: 'Imposto sem número', percentual: null },
  ];
  close(extrairImpostoPercentual(vars), 0.09);
  assert.equal(extrairImpostoPercentual(null), 0);
  assert.equal(extrairImpostoPercentual([]), 0);
});

test('extrairImpostoPercentual — "Comissão iFood" NÃO é imposto',
  () => {
  const vars = [
    { descricao: 'Comissão iFood', percentual: 0.27 },
    { descricao: 'Taxa de emissão de nota', percentual: 0.01 },
  ];
  assert.equal(extrairImpostoPercentual(vars), 0);
});

test('buildContextoFinanceiro — fixo% = soma fixas / média do faturamento (ignora meses zerados)', () => {
  const ctx = buildContextoFinanceiro({
    cfgRows: [{ lucro_desejado: 0.2, lucro_desejado_delivery: 0.25, margem_seguranca: 0.05 }],
    fixasRows: [{ valor: 1000 }, { valor: 500 }],
    fatRows: [{ valor: 10000 }, { valor: 0 }, { valor: 5000 }],
    varsRows: [{ descricao: 'Imposto', percentual: 0.06 }, { descricao: 'Maquininha', percentual: 0.03 }],
  });
  close(ctx.fixoPerc, 1500 / 7500);
  close(ctx.lucroPerc, 0.2);
  close(ctx.impostoPerc, 0.06);
  close(ctx.variavelPerc, 0.09);
  close(ctx.margemSegurancaPerc, 0.05);
});

test('buildContextoFinanceiro — usarLucroDelivery usa lucro_desejado_delivery, com fallback pro balcão e pra 15%', () => {
  const base = { fixasRows: [], fatRows: [], varsRows: [] };
  const a = buildContextoFinanceiro({ ...base, cfgRows: [{ lucro_desejado: 0.2, lucro_desejado_delivery: 0.25 }], options: { usarLucroDelivery: true } });
  close(a.lucroPerc, 0.25);
  const b = buildContextoFinanceiro({ ...base, cfgRows: [{ lucro_desejado: 0.2, lucro_desejado_delivery: null }], options: { usarLucroDelivery: true } });
  close(b.lucroPerc, 0.2);
  const c = buildContextoFinanceiro({ ...base, cfgRows: [] });
  close(c.lucroPerc, 0.15);
  assert.equal(c.fixoPerc, 0);
  assert.equal(c.margemSegurancaPerc, 0);
});

test('buildContextoFinanceiro — sem faturamento, fixo% é 0 (não NaN/Infinity)', () => {
  const ctx = buildContextoFinanceiro({ cfgRows: [{}], fixasRows: [{ valor: 3000 }], fatRows: [], varsRows: [] });
  assert.equal(ctx.fixoPerc, 0);
  assert.ok(Number.isFinite(ctx.fixoPerc));
});

// ── Embalagem de delivery no produto (design 2026-09-09) ──────────────────
test('custoDelivery — cmv + preço × qtd (critério de pronto: bolo 4,13 + caixa 2,50 = 6,63)', () => {
  close(custoDelivery({ cmv: 4.13, embalagemDeliveryPreco: 2.5, embalagemDeliveryQtd: 1 }), 6.63);
  close(custoDelivery({ cmv: 4.13, embalagemDeliveryPreco: 2.5, embalagemDeliveryQtd: 2 }), 9.13);
});

test('custoDelivery — sem embalagem (null/0/undefined) devolve só o cmv', () => {
  assert.equal(custoDelivery({ cmv: 10 }), 10);
  assert.equal(custoDelivery({ cmv: 10, embalagemDeliveryPreco: null, embalagemDeliveryQtd: 3 }), 10);
  assert.equal(custoDelivery({ cmv: 10, embalagemDeliveryPreco: 0, embalagemDeliveryQtd: 3 }), 10);
  assert.equal(custoDelivery({ cmv: 10, embalagemDeliveryPreco: -2 }), 10);
});

test('custoDelivery — qtd ausente/null/"" vale 1; qtd 0 vale 0; entradas inválidas nunca dão NaN', () => {
  close(custoDelivery({ cmv: 10, embalagemDeliveryPreco: 2.5 }), 12.5);
  close(custoDelivery({ cmv: 10, embalagemDeliveryPreco: 2.5, embalagemDeliveryQtd: null }), 12.5);
  close(custoDelivery({ cmv: 10, embalagemDeliveryPreco: 2.5, embalagemDeliveryQtd: '' }), 12.5);
  close(custoDelivery({ cmv: 10, embalagemDeliveryPreco: 2.5, embalagemDeliveryQtd: 0 }), 10);
  assert.equal(custoDelivery({ cmv: 'abc', embalagemDeliveryPreco: 'x', embalagemDeliveryQtd: 'y' }), 0);
  assert.equal(custoDelivery(), 0);
  assert.ok(Number.isFinite(custoDelivery({ cmv: NaN, embalagemDeliveryPreco: NaN })));
});

test('embalagemDeliveryDoProduto — resolve id contra mapa OU array; qtd default 1; embalagem apagada → custo 0', () => {
  const embsArr = [{ id: 7, nome: 'Caixa para bolo', preco_unitario: 2.5 }];
  const embsMap = { 7: embsArr[0] };
  const prod = { id: 1, embalagem_delivery_id: 7, embalagem_delivery_quantidade: 2 };
  assert.deepEqual(embalagemDeliveryDoProduto(prod, embsArr), { id: 7, nome: 'Caixa para bolo', preco: 2.5, qtd: 2, custo: 5 });
  assert.deepEqual(embalagemDeliveryDoProduto({ ...prod, embalagem_delivery_quantidade: null }, embsMap).custo, 2.5);
  assert.deepEqual(embalagemDeliveryDoProduto({ id: 1, embalagem_delivery_id: null }, embsMap), { id: null, nome: null, preco: 0, qtd: 0, custo: 0 });
  assert.deepEqual(embalagemDeliveryDoProduto({ id: 1, embalagem_delivery_id: 99 }, embsMap), { id: 99, nome: null, preco: 0, qtd: 0, custo: 0 });
  assert.equal(embalagemDeliveryDoProduto(null, embsMap).custo, 0);
});
