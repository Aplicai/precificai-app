/**
 * Testes — "duas definições de lucro no mesmo resumo" (auditoria: RESUMO DE
 * CUSTOS mostrava "Lucro R$ 20,87 / Margem 83,5%" — bruto, preço − CMV — e
 * COMPOSIÇÃO POR UNIDADE VENDIDA mostrava "Lucro Líquido R$ 12,30 (49,18%)"
 * — líquido, após despesas fixas/variáveis — sem indicar qual dos dois é o
 * "lucro real").
 *
 * Fix (src/components/EntityCreateModal.js): o resumo agora rotula os dois
 * valores sem ambiguidade — "Lucro bruto"/"Margem bruta" (secundários) e
 * "Sobra líquida" (destaque, colorido por saúde) — reaproveitando as MESMAS
 * funções puras já usadas por "Composição por unidade vendida"
 * (calcLucroLiquido / calcMargemLiquida) em vez de inventar um cálculo novo.
 *
 * Este teste garante a relação matemática entre bruto e líquido que a UI
 * agora comunica: líquido <= bruto, e líquido == bruto quando não há
 * despesas fixas/variáveis configuradas (caso em que "Sobra líquida" e
 * "Lucro bruto" devem coincidir, e não confundir o usuário).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calcMargem, calcLucroLiquido, calcMargemLiquida } from '../src/utils/calculations.js';

test('sem despesas fixas/variáveis: Sobra líquida == Lucro bruto (mesmo número, sem ambiguidade)', () => {
  const precoVenda = 25;
  const cmv = 4.13; // ~R$20,87 de lucro bruto pro exemplo do relatório
  const lucroBruto = precoVenda - cmv;
  const margemBruta = calcMargem(precoVenda, cmv);

  const lucroLiquido = calcLucroLiquido(precoVenda, cmv, 0, 0);
  const margemLiquida = calcMargemLiquida(precoVenda, cmv, 0, 0);

  assert.equal(lucroLiquido, lucroBruto);
  assert.ok(Math.abs(margemLiquida - margemBruta) < 1e-9);
});

test('com despesas fixas/variáveis: Sobra líquida (net) é sempre <= Lucro bruto (gross) — nunca o contrário', () => {
  const precoVenda = 25;
  const cmv = 4.13;
  const despFixasValor = precoVenda * 0.20; // 20% de custos do mês
  const despVarValor = precoVenda * 0.13;   // 13% de custos por venda (ex.: maquininha)

  const lucroBruto = precoVenda - cmv;
  const lucroLiquido = calcLucroLiquido(precoVenda, cmv, despFixasValor, despVarValor);
  const margemLiquida = calcMargemLiquida(precoVenda, cmv, despFixasValor, despVarValor);

  assert.ok(lucroLiquido < lucroBruto, `líquido (${lucroLiquido}) deveria ser menor que bruto (${lucroBruto})`);
  assert.ok(margemLiquida < calcMargem(precoVenda, cmv));
  // Regressão do exemplo do relatório: bruto R$20,87/83,5% vs líquido R$12,30/49,18%
  // — aqui só validamos a DIREÇÃO (líquido menor), não os valores exatos do
  // exemplo (que dependiam do CMV/despesas reais do produto do usuário).
  assert.ok(lucroLiquido > 0);
});

test('Sobra líquida negativa (prejuízo real) mesmo com Lucro bruto positivo — é exatamente o caso que a UI antiga escondia', () => {
  const precoVenda = 25;
  const cmv = 4.13;
  const lucroBruto = precoVenda - cmv; // positivo, ~20.87
  assert.ok(lucroBruto > 0);

  // Despesas fixas+variáveis absurdamente altas — cenário onde o negócio dá
  // prejuízo mesmo com "lucro bruto" bonito na tela.
  const despFixasValor = precoVenda * 0.60;
  const despVarValor = precoVenda * 0.30;
  const lucroLiquido = calcLucroLiquido(precoVenda, cmv, despFixasValor, despVarValor);

  assert.ok(lucroLiquido < 0, 'sobra líquida deveria ficar negativa nesse cenário de despesas altas');
});
