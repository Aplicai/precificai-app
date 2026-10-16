/**
 * Testes — contas das telas de Relatórios (src/utils/relatorios.js).
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/relatorios.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  indiceDoMes, calcTendenciaFaturamento, precoSugeridoProduto,
  semPrecoDoDono, classificarIdadePrecos, statsPorCategoria,
} from '../src/utils/relatorios.js';
import { buildPricingConfig, calcMarkup } from '../src/utils/calculations.js';
import { MARCA_VALOR_ESTIMADO } from '../src/utils/insumoDisplay.js';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const fatDe = (valores) => valores.map((valor, i) => ({ id: i + 1, mes: MESES[i], valor }));
const OUTUBRO = new Date(2026, 9, 16);
const perto = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `esperado ${b}, veio ${a}`);

test('indiceDoMes: nomes curtos do Financeiro, acentos/caixa e números', () => {
  assert.equal(indiceDoMes('Jan'), 0);
  assert.equal(indiceDoMes('Set'), 8);
  assert.equal(indiceDoMes('março'), 2);
  assert.equal(indiceDoMes('DEZ'), 11);
  assert.equal(indiceDoMes('10'), 9);
  assert.equal(indiceDoMes(undefined), -1);
  assert.equal(indiceDoMes('xyz'), -1);
});

test('tendência: faturamento estável (média repetida nos 12 meses) não gera card', () => {
  assert.equal(calcTendenciaFaturamento(fatDe(Array(12).fill(8000)), OUTUBRO), null);
});

test('tendência: menos de 2 meses preenchidos → null', () => {
  assert.equal(calcTendenciaFaturamento([], OUTUBRO), null);
  assert.equal(calcTendenciaFaturamento(fatDe([5000]), OUTUBRO), null);
  assert.equal(calcTendenciaFaturamento(fatDe([5000, 0, 0]), OUTUBRO), null);
});

test('tendência: compara os dois meses mais recentes até hoje, não a ordem alfabética', () => {
  // Jan..Dez preenchidos; hoje = outubro → setembro → outubro.
  const fat = fatDe([1, 2, 3, 4, 5, 6, 7, 8, 9000, 9900, 50, 60]);
  const t = calcTendenciaFaturamento(fat, OUTUBRO);
  assert.equal(t.mesDe, 'setembro');
  assert.equal(t.mesPara, 'outubro');
  assert.equal(t.direcao, 'subiu');
  assert.equal(t.variacaoTexto, '10,0');
  perto(t.variacaoPct, 10);
});

test('tendência: pula meses vazios e queda vem como "desceu"', () => {
  const fat = fatDe([10000, 8000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  const t = calcTendenciaFaturamento(fat, OUTUBRO);
  assert.equal(t.mesDe, 'janeiro');
  assert.equal(t.mesPara, 'fevereiro');
  assert.equal(t.direcao, 'desceu');
  assert.equal(t.variacaoTexto, '20,0');
});

test('tendência: variação que arredonda a 0,0% é neutra ("estavel"), nunca "desceu"', () => {
  const fat = fatDe([5000, 6000, 7000, 7000.2, 0, 0, 0, 0, 0, 0, 0, 0]);
  const t = calcTendenciaFaturamento(fat, new Date(2026, 3, 20));
  assert.equal(t.direcao, 'estavel');
  assert.equal(t.variacaoTexto, '0,0');
});

test('tendência: a ordem das linhas não importa (usa o nome do mês)', () => {
  const fat = fatDe([1000, 2000, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]).reverse();
  const t = calcTendenciaFaturamento(fat, OUTUBRO);
  assert.equal(t.mesDe, 'janeiro');
  assert.equal(t.mesPara, 'fevereiro');
  assert.equal(t.direcao, 'subiu');
});

test('preço sugerido do relatório = preço sugerido do produto (markup do Financeiro), não custo/0,30', () => {
  const pc = buildPricingConfig({
    cfgs: [{ lucro_desejado: 0.15, margem_seguranca: 0 }],
    fixas: [{ valor: 2000 }], vars: [{ percentual: 0.1 }], fat: [{ valor: 8000 }],
  });
  const custo = 0.54;
  const sugerido = precoSugeridoProduto(custo, { margem_lucro_produto: null }, pc);
  perto(sugerido, custo * calcMarkup(0.25, 0.1, 0.15));
  assert.notEqual(Math.round(sugerido * 100), Math.round((custo / 0.30) * 100));
});

test('preço sugerido respeita a margem própria do produto e a margem de segurança', () => {
  const pc = buildPricingConfig({
    cfgs: [{ lucro_desejado: 0.15, margem_seguranca: 0.1 }],
    fixas: [{ valor: 1000 }], vars: [], fat: [{ valor: 10000 }],
  });
  perto(precoSugeridoProduto(2, { margem_lucro_produto: 0.3 }, pc), 2 * 1.1 * calcMarkup(0.1, 0, 0.3));
  perto(precoSugeridoProduto(2, {}, pc), 2 * 1.1 * pc.markup);
});

test('preço sugerido: markup inviável (custos + lucro ≥ 100%) → 0', () => {
  const pc = buildPricingConfig({
    cfgs: [{ lucro_desejado: 0.5 }], fixas: [{ valor: 6000 }], vars: [], fat: [{ valor: 10000 }],
  });
  assert.equal(precoSugeridoProduto(3, {}, pc), 0);
});

test('semPrecoDoDono: mesmo critério do aviso da Home (zerado ou estimado do kit)', () => {
  assert.equal(semPrecoDoDono({ valor_pago: 0 }), true);
  assert.equal(semPrecoDoDono({ valor_pago: null }), true);
  assert.equal(semPrecoDoDono({ valor_pago: 12, marca: MARCA_VALOR_ESTIMADO }), true);
  assert.equal(semPrecoDoDono({ valor_pago: 12, marca: 'Dona Benta' }), false);
});

test('idade do preço: "sem histórico" não conta como desatualizado', () => {
  const now = new Date('2026-10-16T12:00:00Z').getTime();
  const insumos = [{ id: 1, nome: 'Farinha' }, { id: 2, nome: 'Açúcar' }, { id: 3, nome: 'Ovo' }];
  const historico = [
    { materia_prima_id: 1, data: '2026-07-01T00:00:00Z' }, // > 60 dias
    { materia_prima_id: 1, data: '2026-05-01T00:00:00Z' },
    { materia_prima_id: 2, data: '2026-10-01T00:00:00Z' }, // recente
  ];
  const { desatualizados, semHistorico } = classificarIdadePrecos(insumos, historico, now, 60);
  assert.deepEqual(desatualizados.map(i => i.id), [1]);
  assert.ok(desatualizados[0].idadeDias > 100 && desatualizados[0].idadeDias < 110);
  assert.deepEqual(semHistorico.map(i => i.id), [3]);
});

test('stats por categoria: categoria sem item com preço não aparece', () => {
  const stats = statsPorCategoria([
    { nome: 'Farinha', categoria_nome: 'Secos', preco_por_kg: 5 },
    { nome: 'Açúcar', categoria_nome: 'Secos', preco_por_kg: 7 },
    { nome: 'Leite', categoria_nome: 'Laticínios', preco_por_kg: 0 },
    { nome: 'Fermento', categoria_nome: 'Kit', preco_por_kg: 30, marca: MARCA_VALOR_ESTIMADO },
  ]);
  assert.deepEqual(stats.map(c => c.nome), ['Secos']);
  assert.equal(stats[0].count, 2);
  assert.equal(stats[0].media, 6);
  assert.equal(stats[0].min, 5);
  assert.equal(stats[0].max, 7);
});
