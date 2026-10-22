/**
 * Testes: src/data/receitasSugeridas.js (biblioteca de receitas usada para
 * sugerir ingredientes pelo nome do produto). Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  RECEITAS_SUGERIDAS,
  INGREDIENTES_POR_NICHO,
  EMBALAGEM_POR_NICHO,
} from '../src/data/receitasSugeridas.js';
import { getMarketPrice } from '../src/data/marketPrices.js';

const NICHOS = ['confeitaria', 'salgados', 'marmitas', 'hamburgueria', 'pizzaria', 'padaria', 'acai_sorvete', 'bebidas', 'petiscos'];
const UNIDADES = ['g', 'ml', 'un'];
const SEM_ACENTO_MINUSCULO = (s) => s === s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

function checarIngrediente(ing, ctx) {
  assert.ok(Array.isArray(ing) && ing.length === 3, `${ctx}: ingrediente deve ser [nome, qtd, unidade]`);
  const [nome, qtd, unidade] = ing;
  assert.ok(typeof nome === 'string' && nome.trim().length > 0, `${ctx}: nome vazio`);
  assert.ok(typeof qtd === 'number' && qtd > 0 && qtd < 20000, `${ctx}: quantidade inválida em ${nome}: ${qtd}`);
  assert.ok(UNIDADES.includes(unidade), `${ctx}: unidade inválida em ${nome}: ${unidade}`);
}

function checarEmbalagem(emb, ctx) {
  if (emb === null) return;
  assert.ok(Array.isArray(emb) && emb.length === 2, `${ctx}: embalagem deve ser [nome, preço] ou null`);
  assert.ok(typeof emb[0] === 'string' && emb[0].trim().length > 0, `${ctx}: nome da embalagem vazio`);
  assert.ok(typeof emb[1] === 'number' && emb[1] > 0 && emb[1] < 20, `${ctx}: preço da embalagem inválido: ${emb[1]}`);
}

test('ids são únicos', () => {
  const ids = RECEITAS_SUGERIDAS.map((r) => r.id);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  assert.deepEqual(dup, [], `ids duplicados: ${dup.join(', ')}`);
});

test('cada receita tem estrutura válida', () => {
  assert.ok(RECEITAS_SUGERIDAS.length >= 100, `esperado ~120 receitas, há ${RECEITAS_SUGERIDAS.length}`);
  for (const r of RECEITAS_SUGERIDAS) {
    const ctx = r.id;
    assert.match(r.id, /^[a-z0-9_]+$/, `${ctx}: id deve ser snake_case`);
    assert.ok(typeof r.nome === 'string' && r.nome.trim().length > 0, `${ctx}: nome vazio`);
    assert.ok(Array.isArray(r.termos) && r.termos.length > 0, `${ctx}: termos vazio`);
    for (const t of r.termos) {
      assert.ok(typeof t === 'string' && t.trim() === t && t.length > 0, `${ctx}: termo inválido "${t}"`);
      assert.ok(SEM_ACENTO_MINUSCULO(t), `${ctx}: termo deve ser minúsculo e sem acento: "${t}"`);
    }
    assert.ok(NICHOS.includes(r.nicho), `${ctx}: nicho inválido ${r.nicho}`);
    assert.ok(
      Array.isArray(r.porcao) && r.porcao.length === 2 && r.porcao.every((p) => typeof p === 'string' && p.length > 0),
      `${ctx}: porcao deve ser [singular, plural]`,
    );
    assert.ok(Number.isInteger(r.rende) && r.rende >= 1, `${ctx}: rende deve ser inteiro >= 1`);
    assert.ok(Array.isArray(r.ingredientes) && r.ingredientes.length >= 2, `${ctx}: precisa de 2+ ingredientes`);
    r.ingredientes.forEach((ing) => checarIngrediente(ing, ctx));
    checarEmbalagem(r.embalagem, ctx);
  }
});

test('nenhum termo se repete entre receitas', () => {
  const dono = new Map();
  const conflitos = [];
  for (const r of RECEITAS_SUGERIDAS) {
    for (const t of new Set(r.termos)) {
      if (dono.has(t)) conflitos.push(`"${t}" em ${dono.get(t)} e ${r.id}`);
      else dono.set(t, r.id);
    }
  }
  assert.deepEqual(conflitos, [], conflitos.join('; '));
});

test('todo nicho tem ingredientes e embalagem padrão', () => {
  for (const n of NICHOS) {
    const lista = INGREDIENTES_POR_NICHO[n];
    assert.ok(Array.isArray(lista) && lista.length >= 10 && lista.length <= 14, `${n}: 10 a 14 ingredientes`);
    lista.forEach((ing) => checarIngrediente(ing, `INGREDIENTES_POR_NICHO.${n}`));
    assert.ok(EMBALAGEM_POR_NICHO[n], `${n}: sem embalagem padrão`);
    checarEmbalagem(EMBALAGEM_POR_NICHO[n], `EMBALAGEM_POR_NICHO.${n}`);
  }
});

test('ao menos 70% dos ingredientes têm preço na base de mercado', () => {
  let total = 0;
  let comPreco = 0;
  const semPreco = new Set();
  for (const r of RECEITAS_SUGERIDAS) {
    for (const [nome, , un] of r.ingredientes) {
      total += 1;
      if (getMarketPrice(nome, 1000, un) !== null) comPreco += 1;
      else semPreco.add(nome);
    }
  }
  const cobertura = comPreco / total;
  assert.ok(
    cobertura >= 0.7,
    `cobertura de preço ${(cobertura * 100).toFixed(1)}% (< 70%). Sem preço: ${[...semPreco].sort().join(', ')}`,
  );
});
