/**
 * Regressões da tela de Combos (gravação de tutoriais, 2026-10):
 *  - preço de venda pré-preenchido velho (sugestão só do 1º item, nunca recalculada);
 *  - sugestão do combo sem margem de segurança;
 *  - autosave disparando ao só abrir um combo existente;
 *  - total "Produtos R$ 84,00" com linhas somando R$ 84,01.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  arredondarCentavos,
  calcCustoLinhaCombo,
  calcCustoTotalCombo,
  calcCustoComboPorTipo,
  formatarPrecoInputCombo,
  precoAutoCombo,
  camposComboMudaram,
} from '../src/utils/comboPricing.js';
import { buildContextoFinanceiro } from '../src/utils/deliveryAdapter.js';
import { calcularPrecoCombo, calcularPrecoBalcao } from '../src/utils/precificacao.js';
import { formatCurrency } from '../src/utils/calculations.js';

// ───────────────────── arredondamento por linha ─────────────────────

test('arredondarCentavos: meio centavo sobe (1,005 → 1,01) e negativos simétricos', () => {
  assert.equal(arredondarCentavos(1.005), 1.01);
  assert.equal(arredondarCentavos(-1.005), -1.01);
  assert.equal(arredondarCentavos('2,345'), 2.35);
  assert.equal(arredondarCentavos(null), 0);
});

test('calcCustoLinhaCombo: custoUnit × qtd em centavos; qtd vazia/0 conta como 1 (igual ao que é gravado)', () => {
  assert.equal(calcCustoLinhaCombo({ custoUnit: 3.3355, quantidade: 3 }), 10.01); // 10,0065
  assert.equal(calcCustoLinhaCombo({ custoUnit: 4.2, quantidade: '' }), 4.2);
  assert.equal(calcCustoLinhaCombo({ custoUnit: 4.2, quantidade: '0' }), 4.2);
  assert.equal(calcCustoLinhaCombo({ custoUnit: 2, quantidade: '0,5' }), 1);
});

test('total do combo = soma das linhas exibidas (bug: "Produtos R$ 84,00" com linhas somando R$ 84,01)', () => {
  // 3 linhas de R$ 28,003 cada: cruas somam 84,009 → "84,01" no total, mas cada
  // linha aparece como "28,00" (soma visível 84,00). Agora total = soma visível.
  const itens = [
    { tipo: 'produto', custoUnit: 28.003, quantidade: 1 },
    { tipo: 'produto', custoUnit: 28.003, quantidade: 1 },
    { tipo: 'produto', custoUnit: 28.003, quantidade: 1 },
  ];
  const somaVisivel = itens.reduce((a, it) => a + Number(formatCurrency(calcCustoLinhaCombo(it)).replace('R$ ', '').replace(',', '.')), 0);
  assert.equal(calcCustoTotalCombo(itens), 84);
  assert.equal(formatCurrency(calcCustoTotalCombo(itens)), 'R$ 84,00');
  assert.equal(arredondarCentavos(somaVisivel), calcCustoTotalCombo(itens));
});

test('calcCustoComboPorTipo: partes somam exatamente o total', () => {
  const itens = [
    { tipo: 'produto', custoUnit: 10.004, quantidade: 2 },
    { tipo: 'delivery_produto', custoUnit: 5.555, quantidade: 1 },
    { tipo: 'materia_prima', custoUnit: 0.333, quantidade: 3 },
    { tipo: 'preparo', custoUnit: 1.115, quantidade: 1 },
    { tipo: 'embalagem', custoUnit: 0.45, quantidade: 2 },
  ];
  const p = calcCustoComboPorTipo(itens);
  assert.equal(p.produtos, 20.01 + 5.56);
  assert.equal(p.insumos, 1);
  assert.equal(p.preparos, 1.12);
  assert.equal(p.embalagens, 0.9);
  assert.equal(arredondarCentavos(p.produtos + p.insumos + p.preparos + p.embalagens), calcCustoTotalCombo(itens));
});

test('calcCustoComboPorTipo: lista vazia/undefined → zeros', () => {
  assert.deepEqual(calcCustoComboPorTipo(undefined), { produtos: 0, insumos: 0, preparos: 0, embalagens: 0 });
});

// ───────────────────── preço acompanhando a sugestão ─────────────────────

test('precoAutoCombo: sem itens ou sem sugestão → campo vazio', () => {
  assert.equal(precoAutoCombo({ qtdItens: 0, precoSugerido: 30 }), '');
  assert.equal(precoAutoCombo({ qtdItens: 2, precoSugerido: 0 }), '');
  assert.equal(precoAutoCombo({ qtdItens: 2, precoSugerido: NaN }), '');
});

test('precoAutoCombo: recalcula com a sugestão ATUAL (bug: ficava com a do 1º item)', () => {
  // 1º item (embalagem de R$ 0,40) → sugestão R$ 1,20; depois do 3º item o
  // custo é R$ 50,67 → o campo precisa acompanhar, não ficar em "1,20".
  assert.equal(precoAutoCombo({ qtdItens: 1, precoSugerido: 1.2 }), '1,20');
  assert.equal(precoAutoCombo({ qtdItens: 3, precoSugerido: 152.0149 }), '152,01');
});

test('formatarPrecoInputCombo: sempre 2 casas com vírgula', () => {
  assert.equal(formatarPrecoInputCombo(1.2), '1,20');
  assert.equal(formatarPrecoInputCombo(10.005), '10,01');
});

// ───────────────────── autosave só com mudança real ─────────────────────

test('camposComboMudaram: abrir sem mexer → false (bug: "Salvando..." ao abrir)', () => {
  const base = { nome: 'Combo Festa', preco_venda: '49,9' };
  assert.equal(camposComboMudaram(base, { ...base, itens: [{ x: 1 }] }), false);
});

test('camposComboMudaram: nome ou preço diferente → true; base desconhecida → true', () => {
  const base = { nome: 'Combo Festa', preco_venda: '49,9' };
  assert.equal(camposComboMudaram(base, { nome: 'Combo Festa 2', preco_venda: '49,9' }), true);
  assert.equal(camposComboMudaram(base, { nome: 'Combo Festa', preco_venda: '50' }), true);
  assert.equal(camposComboMudaram(null, base), true);
});

test('camposComboMudaram: undefined e "" são o mesmo valor', () => {
  assert.equal(camposComboMudaram({ nome: 'A', preco_venda: undefined }, { nome: 'A', preco_venda: '' }), false);
});

// ───────────────────── margem de segurança na sugestão ─────────────────────

test('sugestão do combo usa a margem de segurança do Financeiro, igual à do produto', () => {
  const ctx = buildContextoFinanceiro({
    cfgRows: [{ lucro_desejado: 0.2, margem_seguranca: 0.1 }],
    fixasRows: [{ valor: 1000 }],
    varsRows: [{ descricao: 'Taxa', percentual: 0.05 }],
    fatRows: [{ valor: 10000 }],
    options: { usarLucroDelivery: false },
  });
  assert.equal(ctx.margemSegurancaPerc, 0.1);
  const contextoFin = {
    lucroPerc: ctx.lucroPerc,
    fixoPerc: ctx.fixoPerc,
    variavelPerc: ctx.variavelPerc,
    margemSegurancaPerc: ctx.margemSegurancaPerc,
  };
  const combo = calcularPrecoCombo({ cmvCombo: 50, ...contextoFin }).preco;
  const produto = calcularPrecoBalcao({ cmv: 50, ...contextoFin }).preco;
  const semMargem = calcularPrecoCombo({ cmvCombo: 50, ...contextoFin, margemSegurancaPerc: 0 }).preco;
  assert.ok(Math.abs(combo - produto) < 1e-9, `combo ${combo} ≠ produto ${produto}`);
  assert.ok(Math.abs(combo - semMargem * 1.1) < 1e-9, 'margem de 10% infla o CMV em 10%');
});
