/**
 * Testes de regressão — src/utils/comboPricing.js (auditoria de Combos/Kits, 2026-09-09).
 *
 * Roda via `npm test` (node --test). Valores calculados à mão a partir das
 * fórmulas documentadas no cabeçalho de cada função.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  resolveCustoUnitarioItemCombo,
  calcCustoItemComboPorQuantidade,
  calcCustoTotalCombo,
  calcLucroLiquidoCombo,
  calcMargemLiquidaCombo,
  calcSomaPrecoAvulsoProdutos,
  calcEconomiaCombo,
} from '../src/utils/comboPricing.js';

const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `esperado ${b}, obtido ${a}`);

// ───────────────────── resolveCustoUnitarioItemCombo ─────────────────────

test('materia_prima em kg: custo de 1 unidade nativa (1kg) usa o preço por kg direto, não 1/1000 dele', () => {
  // Farinha R$10/kg → custo de "1 kg de farinha" no combo é R$10, não R$0,01.
  // Bug real encontrado: loadData()/abrirEditarCombo() chamavam
  // calcCustoIngrediente(precoPorKg, qtd, unidadeNativa, 'g') — fixando 'g' do
  // lado do uso mesmo quando a quantidade informada estava em kg — resultado
  // 1000× menor que o correto.
  const r = resolveCustoUnitarioItemCombo('materia_prima', { preco_por_kg: 10, unidade_medida: 'kg' });
  close(r.custo, 10);
  assert.equal(r.unidade, 'kg');
});

test('materia_prima em g: custo de 1 unidade nativa (1g) é preco_por_kg/1000', () => {
  const r = resolveCustoUnitarioItemCombo('materia_prima', { preco_por_kg: 20, unidade_medida: 'g' });
  close(r.custo, 0.02);
  assert.equal(r.unidade, 'g');
});

test('materia_prima em "un" (tipo unidade): custo = preço direto, sem conversão de base', () => {
  const r = resolveCustoUnitarioItemCombo('materia_prima', { preco_por_kg: 3.5, unidade_medida: 'un' });
  close(r.custo, 3.5);
  assert.equal(r.unidade, 'un');
});

test('preparo (receita base) em kg: custo de 1kg = custo_por_kg direto, não custo_por_kg/1000', () => {
  // Mesma classe de bug do teste de materia_prima acima: hardcoded 'g' no
  // segundo argumento fazia o custo de receitas base medidas em kg/L saírem
  // 1000× menores ao recarregar a lista de combos ou reabrir pra editar.
  const r = resolveCustoUnitarioItemCombo('preparo', { custo_por_kg: 80, unidade_medida: 'kg' });
  close(r.custo, 80);
  assert.equal(r.unidade, 'kg');
});

test('produto/delivery_produto: usa custoUnitario já calculado (inclui embalagem do produto), unidade vem de unidade_rendimento (getTipoVenda)', () => {
  // Bug real: o código original lia `item.tipo_venda`, campo que não existe na
  // tabela produtos (o campo real é `unidade_rendimento`) — a badge de unidade
  // no combo sempre caía em "un" mesmo pra produto vendido por kg/litro.
  const rUn = resolveCustoUnitarioItemCombo('produto', { custoUnitario: 5.5, unidade_rendimento: 'por_unidade' });
  close(rUn.custo, 5.5);
  assert.equal(rUn.unidade, 'un');
  const rKg = resolveCustoUnitarioItemCombo('produto', { custoUnitario: 12, unidade_rendimento: 'por_kg', rendimento_total: 5 });
  close(rKg.custo, 12);
  assert.equal(rKg.unidade, 'kg');
  const rLitro = resolveCustoUnitarioItemCombo('delivery_produto', { custoUnitario: 9, unidade_rendimento: 'por_litro', rendimento_total: 2 });
  close(rLitro.custo, 9);
  assert.equal(rLitro.unidade, 'L');
  // delivery_produto real não tem unidade_rendimento (tabela sem essa coluna) → cai em 'un', correto.
  const rSemCampo = resolveCustoUnitarioItemCombo('delivery_produto', { custoUnitario: 4 });
  assert.equal(rSemCampo.unidade, 'un');
});

test('embalagem: custo = preco_unitario, unidade fixa "un"', () => {
  const r = resolveCustoUnitarioItemCombo('embalagem', { preco_unitario: 0.85 });
  close(r.custo, 0.85);
  assert.equal(r.unidade, 'un');
});

test('tipo desconhecido ou dados ausentes não quebra — retorna custo 0', () => {
  assert.deepEqual(resolveCustoUnitarioItemCombo('desconhecido', {}), { custo: 0, unidade: 'un' });
  assert.deepEqual(resolveCustoUnitarioItemCombo('materia_prima', undefined), { custo: 0, unidade: 'g' });
});

// ───────────────────── calcCustoItemComboPorQuantidade ─────────────────────

test('calcCustoItemComboPorQuantidade: custo unitário × quantidade', () => {
  const custo = calcCustoItemComboPorQuantidade('produto', { custoUnitario: 5.5, tipo_venda: 'por_unidade' }, 3);
  close(custo, 16.5);
});

test('calcCustoItemComboPorQuantidade: quantidade inválida/ausente conta como 0', () => {
  const custo = calcCustoItemComboPorQuantidade('embalagem', { preco_unitario: 1 }, '');
  close(custo, 0);
});

// ───────────────────── calcCustoTotalCombo ─────────────────────

test('calcCustoTotalCombo: soma custoUnit × quantidade de cada item', () => {
  const total = calcCustoTotalCombo([
    { custoUnit: 10, quantidade: 2 },   // 20
    { custoUnit: 3.5, quantidade: '1' }, // 3.5 (aceita string PT-BR via safeNum)
  ]);
  close(total, 23.5);
});

test('calcCustoTotalCombo: lista vazia/undefined = 0', () => {
  close(calcCustoTotalCombo([]), 0);
  close(calcCustoTotalCombo(undefined), 0);
});

// ───────────────────── calcLucroLiquidoCombo / calcMargemLiquidaCombo ─────────────────────

test('calcLucroLiquidoCombo: preço 50, custo 20, fixo 10%, variável 5% → lucro 22,50 (não 30!)', () => {
  // Bug real: o card da lista de combos rotulava "Lucro Líquido"/"Margem Líq."
  // mas calculava só preço−custo (30,00 = margem BRUTA), sem descontar as
  // despesas fixas/variáveis que a própria tela já carrega em contextoFin.
  const lucro = calcLucroLiquidoCombo(50, 20, 0.10, 0.05);
  close(lucro, 22.5);
});

test('calcMargemLiquidaCombo: 22,50 / 50 = 45%', () => {
  close(calcMargemLiquidaCombo(50, 20, 0.10, 0.05), 0.45);
});

test('calcMargemLiquidaCombo: preço <= 0 retorna 0 (guarda contra divisão por zero/Infinity)', () => {
  assert.equal(calcMargemLiquidaCombo(0, 20, 0.1, 0.05), 0);
  assert.equal(calcMargemLiquidaCombo(-5, 20, 0.1, 0.05), 0);
});

test('calcLucroLiquidoCombo: percentuais negativos são tratados como 0 (defesa contra config corrompida)', () => {
  const lucro = calcLucroLiquidoCombo(50, 20, -0.5, 0.05);
  close(lucro, calcLucroLiquidoCombo(50, 20, 0, 0.05));
});

// ───────────────────── calcSomaPrecoAvulsoProdutos / calcEconomiaCombo ─────────────────────

test('calcSomaPrecoAvulsoProdutos: soma preço avulso × qtd só de produto/delivery_produto com preço > 0', () => {
  const soma = calcSomaPrecoAvulsoProdutos([
    { tipo: 'produto', precoVendaAvulso: 12, quantidade: 2 },        // 24
    { tipo: 'materia_prima', precoVendaAvulso: 99, quantidade: 1 },  // ignorado (não é produto)
    { tipo: 'delivery_produto', precoVendaAvulso: 8, quantidade: 1 }, // 8
    { tipo: 'embalagem', precoVendaAvulso: 3, quantidade: 5 },       // ignorado
    { tipo: 'produto', precoVendaAvulso: 0, quantidade: 4 },         // ignorado (sem preço)
  ]);
  close(soma, 32);
});

test('calcSomaPrecoAvulsoProdutos: item sem quantidade conta como 1', () => {
  const soma = calcSomaPrecoAvulsoProdutos([{ tipo: 'produto', precoVendaAvulso: 10 }]);
  close(soma, 10);
});

test('calcEconomiaCombo: combo de R$25 vs soma avulsa R$32 → economia de R$7 (21,875%)', () => {
  const eco = calcEconomiaCombo(32, 25);
  close(eco.valor, 7);
  close(eco.percentual, 7 / 32);
});

test('calcEconomiaCombo: combo mais caro que a soma avulsa → economia negativa (UI decide não mostrar)', () => {
  const eco = calcEconomiaCombo(20, 25);
  close(eco.valor, -5);
});

test('calcEconomiaCombo: sem produtos com preço avulso (ex: combo só de ingredientes) → 0/0, não Infinity/NaN', () => {
  const eco = calcEconomiaCombo(0, 25);
  assert.equal(eco.valor, 0);
  assert.equal(eco.percentual, 0);
});
