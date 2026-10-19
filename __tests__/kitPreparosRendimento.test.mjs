/**
 * Regressão — Kit de Início: receita base rendendo mais do que os ingredientes
 * pesam (2026-10-19).
 *
 * "Brigadeiro tradicional" dizia render 600 g com ~455 g de ingredientes. O Kit
 * grava custo_por_kg = custo / rendimento, então rendimento inflado deixa o
 * custo por grama baixo e o preço sugerido abaixo do real.
 *
 * Regra: rendimento (g/mL, densidade ~1) ≤ soma dos ingredientes. Exceção só
 * para receitas que levam água não listada (arroz, feijão, massas, espresso).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

const { PREPAROS_POR_SEGMENTO } = await import('../src/data/templates.js');

// Peso médio de 1 ovo (único ingrediente em "un" nas receitas base).
const GRAMAS_POR_UNIDADE = { 'Ovos (bandeja 30un)': 50 };

// Receitas cujo rendimento inclui água de cozimento/hidratação que não é insumo.
const LEVAM_AGUA = new Set([
  'pizzaria/Massa de pizza 35cm',
  'restaurante/Arroz branco soltinho',
  'restaurante/Feijão carioca',
  'padaria/Massa de pão francês',
  'marmitaria/Arroz branco para marmita',
  'marmitaria/Feijão carioca marmita',
  'cafeteria/Espresso 50ml',
  'japonesa/Arroz para sushi',
]);

function gramas(ing) {
  const u = String(ing.unidade).toLowerCase();
  if (u === 'g' || u === 'ml') return ing.quantidade;
  if (u === 'kg' || u === 'l') return ing.quantidade * 1000;
  if (u === 'un') {
    const g = GRAMAS_POR_UNIDADE[ing.nome_insumo];
    assert.ok(g, `sem peso por unidade para "${ing.nome_insumo}"`);
    return ing.quantidade * g;
  }
  throw new Error(`unidade não tratada: ${ing.unidade}`);
}

test('nenhuma receita base do kit rende mais do que a soma dos ingredientes', () => {
  const impossiveis = [];
  for (const [seg, preparos] of Object.entries(PREPAROS_POR_SEGMENTO)) {
    for (const p of preparos) {
      const chave = `${seg}/${p.nome}`;
      if (LEVAM_AGUA.has(chave)) continue;
      const soma = p.ingredientes.reduce((a, ing) => a + gramas(ing), 0);
      if (p.rendimento_total > soma) impossiveis.push(`${chave}: rende ${p.rendimento_total}, ingredientes ${soma}`);
    }
  }
  assert.deepEqual(impossiveis, []);
});

test('exceções de água continuam existindo (lista não fica obsoleta)', () => {
  const chaves = new Set(Object.entries(PREPAROS_POR_SEGMENTO)
    .flatMap(([seg, ps]) => ps.map(p => `${seg}/${p.nome}`)));
  for (const k of LEVAM_AGUA) assert.ok(chaves.has(k), `exceção órfã: ${k}`);
});
