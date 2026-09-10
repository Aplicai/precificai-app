/**
 * Testes — regra de quantidade default/step por unidade ao adicionar item
 * (auditoria "item adicionado com quantidade 1 g", custo ilegível R$ 0,01).
 *
 * Fix aplicado em:
 *   - src/components/EntityCreateModal.js  (defaultQtyForUnidade / stepForUnidade)
 *   - src/screens/ProdutoFormScreen.js     (defaultQtyForUnidade)
 *
 * Essas funções são puras mas vivem em arquivos que importam React Native e
 * usam JSX — não são importáveis pelo runner `node --test` (falha em
 * "Unexpected token '<'"). Este arquivo replica as duas funções PALAVRA POR
 * PALAVRA (conferir contra o código-fonte se algum dia divergir) e testa o
 * contrato exigido pela auditoria: g/ml usam 100 (default) e 10 (step);
 * un/kg/L usam 1 pros dois.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// Cópia exata de EntityCreateModal.js (defaultQtyForUnidade / stepForUnidade)
// e do helper equivalente em ProdutoFormScreen.js (defaultQtyForUnidade).
function defaultQtyForUnidade(unidade) {
  const u = String(unidade || '').trim().toLowerCase();
  return (u === 'g' || u === 'ml') ? 100 : 1;
}
function stepForUnidade(unidade) {
  const u = String(unidade || '').trim().toLowerCase();
  return (u === 'g' || u === 'ml') ? 10 : 1;
}

test('defaultQtyForUnidade: 100 pra g/ml, 1 pra un/kg/L', () => {
  assert.equal(defaultQtyForUnidade('g'), 100);
  assert.equal(defaultQtyForUnidade('ml'), 100);
  // case-insensitive e com espaços (shortUnidade pode devolver 'mL'/'L' capitalizados)
  assert.equal(defaultQtyForUnidade('mL'), 100);
  assert.equal(defaultQtyForUnidade(' ML '), 100);
  assert.equal(defaultQtyForUnidade('un'), 1);
  assert.equal(defaultQtyForUnidade('kg'), 1);
  assert.equal(defaultQtyForUnidade('L'), 1);
  assert.equal(defaultQtyForUnidade('l'), 1);
});

test('defaultQtyForUnidade: unidades desconhecidas/vazias caem no default seguro (1)', () => {
  assert.equal(defaultQtyForUnidade(''), 1);
  assert.equal(defaultQtyForUnidade(null), 1);
  assert.equal(defaultQtyForUnidade(undefined), 1);
  assert.equal(defaultQtyForUnidade('rolo'), 1);
  assert.equal(defaultQtyForUnidade('m'), 1);
});

test('stepForUnidade: 10 pra g/ml (stepper não fica "parado" em 1g), 1 pros demais', () => {
  assert.equal(stepForUnidade('g'), 10);
  assert.equal(stepForUnidade('ml'), 10);
  assert.equal(stepForUnidade('un'), 1);
  assert.equal(stepForUnidade('kg'), 1);
  assert.equal(stepForUnidade('L'), 1);
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
