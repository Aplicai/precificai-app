import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildPricingConfig, calcPrecoSugerido } from '../src/utils/calculations.js';

// Conta de teste (kit confeitaria, 14/10/2026): margem 20%, segurança 5%,
// faturamento R$ 8.000, custos do mês R$ 2.051, maquininha 3,5%.
const contaConfeitaria = {
  cfgs: [{ lucro_desejado: 0.2, margem_seguranca: 0.05 }],
  fixas: [{ valor: 1500 }, { valor: 551 }],
  vars: [{ percentual: 0.035 }],
  fat: [{ valor: 8000 }],
};

test('buildPricingConfig — Financeiro preenchido gera o markup com custos do mês', () => {
  const cfg = buildPricingConfig(contaConfeitaria);
  assert.ok(Math.abs(cfg.despFixasPerc - 2051 / 8000) < 1e-9);
  assert.equal(cfg.despVarPerc, 0.035);
  assert.equal(cfg.lucroDesejado, 0.2);
  assert.equal(cfg.margemSeguranca, 0.05);
  assert.ok(Math.abs(cfg.markup - 1 / (1 - 2051 / 8000 - 0.035 - 0.2)) < 1e-9);
});

test('buildPricingConfig — sugeridos da conta de teste batem com o app', () => {
  const cfg = buildPricingConfig(contaConfeitaria);
  const bolo = calcPrecoSugerido(36.98, cfg.markup, cfg.margemSeguranca);
  assert.equal(bolo.toFixed(2), '76.34');
  const brigadeiro = calcPrecoSugerido(47.03, cfg.markup, cfg.margemSeguranca);
  assert.ok(Math.abs(brigadeiro - 97.08) < 0.015, `brigadeiro ${brigadeiro}`);
});

test('buildPricingConfig — faturamento médio ignora meses zerados', () => {
  const cfg = buildPricingConfig({ ...contaConfeitaria, fat: [{ valor: 6000 }, { valor: 0 }, { valor: 10000 }] });
  assert.ok(Math.abs(cfg.despFixasPerc - 2051 / 8000) < 1e-9);
});

test('buildPricingConfig — conta sem Financeiro: fixos 0, lucro padrão 15%', () => {
  const cfg = buildPricingConfig({ cfgs: [], fixas: [], vars: [], fat: [] });
  assert.deepEqual(cfg, {
    despFixasPerc: 0, despVarPerc: 0, lucroDesejado: 0.15, markup: 1 / 0.85, margemSeguranca: 0,
  });
  assert.deepEqual(buildPricingConfig({}), cfg);
});
