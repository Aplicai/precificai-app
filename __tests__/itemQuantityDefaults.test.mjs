/**
 * Testes — regra de quantidade default/step por unidade ao adicionar item
 * (auditoria "item adicionado com quantidade 1 g", custo ilegível R$ 0,01).
 *
 * Fix aplicado em:
 *   - src/components/EntityCreateModal.js  (defaultQtyForUnidade / stepForUnidade)
 *   - src/screens/ProdutoFormScreen.js     (defaultQtyForUnidade)
 *
 * Contrato: g/ml usam 100 (default) e 10 (step); kg/L usam 0,1 nos dois
 * (mesma quantidade física de 100 g, já que a quantidade do item no produto é
 * gravada na unidade de compra do insumo); un e desconhecidas usam 1.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { defaultQtyForUnidade, stepForUnidade, somarQtd, formatQtdBR } from '../src/utils/itemQuantityDefaults.js';

// Desde 14/10/2026 as funções vivem em src/utils/itemQuantityDefaults.js e são
// importadas por EntityCreateModal.js e ProdutoFormScreen.js (antes eram
// cópias locais; este teste replicava o código palavra por palavra).

test('defaultQtyForUnidade: 100 pra g/ml, 1 pra un', () => {
  assert.equal(defaultQtyForUnidade('g'), 100);
  assert.equal(defaultQtyForUnidade('ml'), 100);
  // case-insensitive e com espaços (shortUnidade pode devolver 'mL'/'L' capitalizados)
  assert.equal(defaultQtyForUnidade('mL'), 100);
  assert.equal(defaultQtyForUnidade(' ML '), 100);
  assert.equal(defaultQtyForUnidade('un'), 1);
});

test('defaultQtyForUnidade: kg/L entram com 0,1 (= os mesmos 100 g/mL do item em g/mL), não 1 kg inteiro', () => {
  // Bug tutorial 05: ingrediente comprado em kg entrava "1 kg" no produto
  // (R$ 59,90 de coco num bolo). A quantidade do produto é gravada na unidade
  // de compra do insumo, então 100 g == 0,1 kg.
  assert.equal(defaultQtyForUnidade('kg'), 0.1);
  assert.equal(defaultQtyForUnidade('KG'), 0.1);
  assert.equal(defaultQtyForUnidade('L'), 0.1);
  assert.equal(defaultQtyForUnidade('l'), 0.1);
});

test('defaultQtyForUnidade: unidades desconhecidas/vazias caem no default seguro (1)', () => {
  assert.equal(defaultQtyForUnidade(''), 1);
  assert.equal(defaultQtyForUnidade(null), 1);
  assert.equal(defaultQtyForUnidade(undefined), 1);
  assert.equal(defaultQtyForUnidade('rolo'), 1);
  assert.equal(defaultQtyForUnidade('m'), 1);
});

test('stepForUnidade: 10 pra g/ml, 0,1 pra kg/L, 1 pros demais', () => {
  assert.equal(stepForUnidade('g'), 10);
  assert.equal(stepForUnidade('ml'), 10);
  assert.equal(stepForUnidade('un'), 1);
  assert.equal(stepForUnidade('kg'), 0.1);
  assert.equal(stepForUnidade('L'), 0.1);
  assert.equal(stepForUnidade('rolo'), 1);
});

test('somarQtd: sem ruído de ponto flutuante (0,1 + 0,2 = 0,3) e nunca negativo', () => {
  assert.equal(somarQtd(0.1, 0.2), 0.3);
  assert.equal(somarQtd(0.3, -0.1), 0.2);
  assert.equal(somarQtd(0.1, -0.5), 0);
  assert.equal(somarQtd('0,1', 0.1), 0.2);
  assert.equal(somarQtd(100, 10), 110);
});

test('formatQtdBR: vírgula decimal, sem zeros à toa', () => {
  assert.equal(formatQtdBR(0.1), '0,1');
  assert.equal(formatQtdBR(100), '100');
  assert.equal(formatQtdBR(0.30000000000000004), '0,3');
  assert.equal(formatQtdBR(1.25), '1,25');
});

test('regressão do bug relatado: 1g de item a R$ 20/kg custava R$ 0,02 (ilegível); com o default de 100g o custo unitário exibido fica R$ 2,00', () => {
  const precoPorKg = 20;
  const custoPorGrama = precoPorKg / 1000;
  const qtdAntiga = 1; // comportamento antigo (bug)
  const qtdNova = defaultQtyForUnidade('g'); // comportamento corrigido
  assert.equal(qtdAntiga * custoPorGrama, 0.02);
  assert.equal(qtdNova * custoPorGrama, 2);
});

// ─────────────────────────────────────────────────────────────────────────
// Fix walkthrough #4 — "form de edição de produto mostrava preço '25' em vez
// de '25,00'" (String(numero) cru, sem formatar decimais PT-BR).
// Fix aplicado em EntityCreateModal.js (loadForEdit) e ProdutoFormScreen.js
// (loadProduto): `Number(v).toFixed(2).replace('.', ',')`.
// ─────────────────────────────────────────────────────────────────────────
function formatMoneyBR(v) {
  return (v != null && v !== '') ? Number(v).toFixed(2).replace('.', ',') : '';
}

test('formatMoneyBR: sempre 2 decimais com vírgula PT-BR, mesmo pra valores inteiros', () => {
  assert.equal(formatMoneyBR(25), '25,00');
  assert.equal(formatMoneyBR(25.5), '25,50');
  assert.equal(formatMoneyBR(0), '0,00');
  assert.equal(formatMoneyBR(1234.9), '1234,90');
});

test('formatMoneyBR: null/undefined/"" (produto sem preço) continuam vazios, não "0,00"', () => {
  assert.equal(formatMoneyBR(null), '');
  assert.equal(formatMoneyBR(undefined), '');
  assert.equal(formatMoneyBR(''), '');
});
