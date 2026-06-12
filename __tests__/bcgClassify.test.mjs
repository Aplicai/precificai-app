/**
 * Testes da classificação da Matriz BCG (ranking de produtos).
 *
 * Roda via Node 18+ test runner: `node --test __tests__/`.
 * Não requer Jest nem React Native.
 *
 * Cobre o bug reportado pela mbcafeteria (sessão atual): vendas cadastradas no
 * mês de referência NÃO eram refletidas no ranking (apareciam 0 un) porque a
 * classificação lia o mês errado. O contrato agora é: classificar por
 * `qtdVendida` (mês de referência = o que o usuário digita e vê).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { classificarMatrizBCG, median } from '../src/utils/bcgClassify.js';

const byName = (arr) => Object.fromEntries(arr.map((p) => [p.nome, p.classificacao]));

// ─────────────────────────────────────────────────────────────────────
// Regressão do bug: vendas no mês de referência DEVEM contar no ranking
// ─────────────────────────────────────────────────────────────────────
test('produto com vendas no mês de referência + margem alta → Estrela', () => {
  // Cenário estilo mbcafeteria: ela cadastrou vendas (qtdVendida) e o produto
  // de margem alta e muita venda tem que ser Estrela — não Abacaxi/Repensar.
  const items = [
    { nome: 'Croissant', precoVenda: 25, margemPerc: 70, qtdVendida: 120 }, // alta margem, alta venda
    { nome: 'Espresso', precoVenda: 6, margemPerc: 80, qtdVendida: 10 },    // alta margem, baixa venda
    { nome: 'Soda', precoVenda: 12, margemPerc: 15, qtdVendida: 90 },       // baixa margem, alta venda
    { nome: 'Quiche', precoVenda: 15, margemPerc: 12, qtdVendida: 5 },      // baixa margem, baixa venda
  ];
  const r = byName(classificarMatrizBCG(items));
  assert.equal(r['Croissant'], 'Estrela');
  assert.equal(r['Soda'], 'Cavalo de Batalha');
  assert.equal(r['Espresso'], 'Quebra-Cabeça');
  assert.equal(r['Quiche'], 'Abacaxi');
});

test('o ranking NÃO pode ignorar qtdVendida (guarda contra o off-by-one de mês)', () => {
  // Se a classificação lesse outro campo (ex.: o antigo qtdVendidaRanking),
  // todos cairiam em baixa venda e nenhum seria Estrela. Aqui garantimos que
  // existir venda em qtdVendida produz ao menos uma "alta venda".
  const items = [
    { nome: 'A', precoVenda: 10, margemPerc: 60, qtdVendida: 100 },
    { nome: 'B', precoVenda: 10, margemPerc: 60, qtdVendida: 1 },
  ];
  const r = classificarMatrizBCG(items);
  const temAltaVenda = r.some((p) => p.classificacao === 'Estrela' || p.classificacao === 'Cavalo de Batalha');
  assert.equal(temAltaVenda, true);
});

// ─────────────────────────────────────────────────────────────────────
// Casos de borda
// ─────────────────────────────────────────────────────────────────────
test('menos de 2 produtos com preço → todos Quebra-Cabeça (sem base p/ mediana)', () => {
  const items = [
    { nome: 'Único', precoVenda: 20, margemPerc: 50, qtdVendida: 10 },
    { nome: 'SemPreco', precoVenda: 0, margemPerc: 0, qtdVendida: 0 },
  ];
  const r = byName(classificarMatrizBCG(items));
  assert.equal(r['Único'], 'Quebra-Cabeça');
});

test('ninguém com venda → ninguém é Estrela/Cavalo (classifica só por margem)', () => {
  const items = [
    { nome: 'X', precoVenda: 10, margemPerc: 70, qtdVendida: 0 },
    { nome: 'Y', precoVenda: 10, margemPerc: 20, qtdVendida: 0 },
  ];
  const r = classificarMatrizBCG(items);
  const algumAltaVenda = r.some((p) => ['Estrela', 'Cavalo de Batalha'].includes(p.classificacao));
  assert.equal(algumAltaVenda, false);
});

test('empate na mediana de vendas conta como BAIXA venda (> estrito)', () => {
  // vendas: 2,2,2,8 → mediana 2. Só o 8 é "alta venda".
  const items = [
    { nome: 'a', precoVenda: 10, margemPerc: 90, qtdVendida: 2 },
    { nome: 'b', precoVenda: 10, margemPerc: 90, qtdVendida: 2 },
    { nome: 'c', precoVenda: 10, margemPerc: 90, qtdVendida: 2 },
    { nome: 'd', precoVenda: 10, margemPerc: 90, qtdVendida: 8 },
  ];
  const r = classificarMatrizBCG(items);
  const estrelas = r.filter((p) => p.classificacao === 'Estrela').length;
  assert.equal(estrelas, 1); // só o 'd'
});

test('median: pares e ímpares', () => {
  assert.equal(median([2, 2, 2, 8]), 2);
  assert.equal(median([1, 3, 5]), 3);
  assert.equal(median([]), 0);
});
