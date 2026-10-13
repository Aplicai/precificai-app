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
  embalagensDeliveryDoProduto,
  normalizarEmbalagensDelivery,
  parseEmbalagensDelivery,
  embalagemDeliveryDoCombo,
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
  const linha = { id: 7, nome: 'Caixa para bolo', preco: 2.5, qtd: 2, custo: 5 };
  assert.deepEqual(embalagemDeliveryDoProduto(prod, embsArr), { ...linha, itens: [linha] });
  assert.deepEqual(embalagemDeliveryDoProduto({ ...prod, embalagem_delivery_quantidade: null }, embsMap).custo, 2.5);
  assert.deepEqual(embalagemDeliveryDoProduto({ id: 1, embalagem_delivery_id: null }, embsMap), { id: null, nome: null, preco: 0, qtd: 0, custo: 0, itens: [] });
  const sumiu = { id: 99, nome: null, preco: 0, qtd: 0, custo: 0 };
  assert.deepEqual(embalagemDeliveryDoProduto({ id: 1, embalagem_delivery_id: 99 }, embsMap), { ...sumiu, itens: [sumiu] });
  assert.equal(embalagemDeliveryDoProduto(null, embsMap).custo, 0);
});

const EMBS = [
  { id: 7, nome: 'Marmita', preco_unitario: 1.2 },
  { id: 8, nome: 'Sacola', preco_unitario: 0.5 },
  { id: 9, nome: 'Talher', preco_unitario: 0.25 },
];

test('várias embalagens de delivery — custo soma todas e preco × qtd continua igual ao custo', () => {
  const prod = {
    id: 1, embalagem_delivery_id: 7, embalagem_delivery_quantidade: 1,
    embalagens_delivery: [{ id: 7, qtd: 1 }, { id: 8, qtd: 1 }, { id: 9, qtd: 2 }],
  };
  const r = embalagemDeliveryDoProduto(prod, EMBS);
  assert.equal(r.custo, 2.2);
  assert.equal(r.preco * r.qtd, r.custo);
  assert.equal(r.nome, 'Marmita + Sacola + Talher');
  assert.equal(r.itens.length, 3);
  assert.equal(custoDelivery({ cmv: 10, embalagemDeliveryPreco: r.preco, embalagemDeliveryQtd: r.qtd }), 12.2);
});

test('lista vinda como string JSON (coluna text/jsonb escalar) é lida igual', () => {
  const prod = { embalagem_delivery_id: 7, embalagens_delivery: '[{"id":7,"qtd":1},{"id":8,"qtd":3}]' };
  assert.equal(embalagemDeliveryDoProduto(prod, EMBS).custo, 2.7);
});

test('produto antigo (lista nunca gravada) usa o par legado', () => {
  const prod = { embalagem_delivery_id: 8, embalagem_delivery_quantidade: 4, embalagens_delivery: null };
  assert.deepEqual(embalagensDeliveryDoProduto(prod), [{ id: 8, qtd: 4 }]);
  assert.equal(embalagemDeliveryDoProduto(prod, EMBS).custo, 2);
});

test('aba com versão antiga regravou só o legado — o legado vence a lista desatualizada', () => {
  const trocou = { embalagem_delivery_id: 9, embalagem_delivery_quantidade: 1, embalagens_delivery: [{ id: 7, qtd: 1 }, { id: 8, qtd: 1 }] };
  assert.deepEqual(embalagensDeliveryDoProduto(trocou), [{ id: 9, qtd: 1 }]);
});

test('primeira embalagem apagada (FK zera o legado) — as outras da lista continuam valendo', () => {
  const prod = { embalagem_delivery_id: null, embalagens_delivery: [{ id: 7, qtd: 1 }, { id: 8, qtd: 2 }] };
  const semMarmita = EMBS.filter((e) => e.id !== 7);
  const r = embalagemDeliveryDoProduto(prod, semMarmita);
  assert.equal(r.custo, 1);
  assert.equal(r.nome, 'Sacola');
});

test('normalizarEmbalagensDelivery — descarta id inválido, não repete, qtd vazia vira 1, lista vazia vira null', () => {
  assert.deepEqual(
    normalizarEmbalagensDelivery([{ id: 7, qtd: '' }, { id: 7, qtd: 5 }, { id: 'x' }, { id: 0 }, { id: '8', qtd: 2 }, null]),
    [{ id: 7, qtd: 1 }, { id: 8, qtd: 2 }],
  );
  assert.equal(normalizarEmbalagensDelivery([]), null);
  assert.equal(normalizarEmbalagensDelivery([{ id: null }]), null);
  assert.equal(normalizarEmbalagensDelivery('nada'), null);
});

test('parseEmbalagensDelivery — coluna vazia ou lixo → null (cai no legado); array vazio → []', () => {
  assert.equal(parseEmbalagensDelivery(null), null);
  assert.equal(parseEmbalagensDelivery(''), null);
  assert.equal(parseEmbalagensDelivery('{quebrado'), null);
  assert.equal(parseEmbalagensDelivery('{"id":7}'), null);
  assert.deepEqual(parseEmbalagensDelivery([]), []);
  assert.deepEqual(embalagensDeliveryDoProduto({ embalagem_delivery_id: null, embalagens_delivery: [] }), []);
});

test('combo sem lista própria — usa as embalagens de delivery de cada produto × quantidade', () => {
  const custoPorProduto = { 1: 1.1, 2: 0.5 };
  const r = embalagemDeliveryDoCombo({
    combo: { id: 9, embalagens_delivery: null },
    itens: [
      { tipo: 'produto', item_id: 1, quantidade: 2 },
      { tipo: 'produto', item_id: 2, quantidade: 1 },
      { tipo: 'embalagem', item_id: 7, quantidade: 3 },
      { tipo: 'produto', item_id: 99, quantidade: 1 },
    ],
    embalagens: EMBS,
    custoEmbDeliveryDoProduto: (id) => custoPorProduto[id],
  });
  close(r.custo, 2.7);
  assert.equal(r.origem, 'produtos');
});

test('combo com lista própria — vale a do combo e NÃO soma a dos produtos (sacola não conta duas vezes)', () => {
  const r = embalagemDeliveryDoCombo({
    combo: { id: 9, embalagens_delivery: [{ id: 8, qtd: 1 }, { id: 9, qtd: 2 }] },
    itens: [{ tipo: 'produto', item_id: 1, quantidade: 2 }],
    embalagens: EMBS,
    custoEmbDeliveryDoProduto: () => 5,
  });
  close(r.custo, 1);
  assert.equal(r.origem, 'combo');
  assert.equal(r.itens.length, 2);
});

test('combo sem nada de delivery — custo 0 e origem null; entradas ruins não quebram', () => {
  assert.deepEqual(embalagemDeliveryDoCombo({ combo: {}, itens: [{ tipo: 'produto', item_id: 1, quantidade: 1 }], embalagens: EMBS, custoEmbDeliveryDoProduto: () => 0 }), { custo: 0, origem: null, itens: [] });
  assert.equal(embalagemDeliveryDoCombo().custo, 0);
  assert.equal(embalagemDeliveryDoCombo({ combo: null, itens: null }).custo, 0);
  // quantidade inválida conta como 1; item sem tipo é produto (legado)
  close(embalagemDeliveryDoCombo({ itens: [{ item_id: 1, quantidade: 'x' }], custoEmbDeliveryDoProduto: () => 1.5 }).custo, 1.5);
});
