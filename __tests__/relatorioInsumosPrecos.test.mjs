/**
 * Regressão — RelatorioInsumosScreen.js (Relatórios > Ingredientes).
 *
 * Auditoria 09/09: a lista "Preços ainda do Kit de Início" formatava o
 * preço/kg manualmente com `Number(x).toFixed(2)` (ponto decimal — "R$
 * 6.67/kg", "R$ 22.86/kg"), quebrando o padrão PT-BR usado no resto do app.
 * O fix troca para `formatCurrency` (src/utils/calculations.js), que já é
 * usado em todo o resto da tela. Este teste fixa o comportamento correto
 * usando os valores exatos reportados no walkthrough.
 *
 * Roda via `npm test` (node --test).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatCurrency } from '../src/utils/calculations.js';

test('formatCurrency: preço/kg em PT-BR (vírgula, nunca ponto) — valores do walkthrough', () => {
  assert.equal(formatCurrency(6.67), 'R$ 6,67');
  assert.equal(formatCurrency(22.86), 'R$ 22,86');
  assert.ok(!formatCurrency(6.67).includes('.'));
  assert.ok(!formatCurrency(22.86).includes('.'));
});

test('formatCurrency: milhar com ponto, decimal com vírgula (formato PT-BR completo)', () => {
  assert.equal(formatCurrency(15000), 'R$ 15.000,00');
  assert.equal(formatCurrency(1234.5), 'R$ 1.234,50');
});
