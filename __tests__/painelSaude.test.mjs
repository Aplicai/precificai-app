/**
 * Testes — src/utils/painelSaude.js (cards, veredito e insights da Home).
 *
 * Bugs: "Operação saudável" com o CMV vermelho e "Ingredientes pesando no
 * preço" logo abaixo; "Faturamento 276,40% acima" e "0,00%" sem produto com
 * preço; "--" no valor com "Receita cobre custos" ao lado.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { avaliarIndicadores, indicadorEmAlerta } = await import('../src/utils/painelSaude.js');

const base = {
  pendente: false, prodsComPreco: 5, custoComPreco: 40,
  cmvPercent: 0.30, cmvMeta: 0.35, margemMedia: 0.25, margemMeta: 0.2,
  sobraMes: 3000, fatMedio: 20000, pontoEquilibrio: 12000,
};

test('tudo dentro das metas: nenhum indicador vermelho, veredito pode ser saudável', () => {
  const ind = avaliarIndicadores(base);
  assert.deepEqual(ind, { cmv: 'green', sobra: 'green', minimo: 'green', margem: 'green' });
  assert.equal(indicadorEmAlerta(ind), null);
});

test('CMV acima da meta + 5 pontos fica vermelho e o veredito NÃO é saudável', () => {
  const ind = avaliarIndicadores({ ...base, cmvPercent: 0.45 });
  assert.equal(ind.cmv, 'red');
  assert.equal(indicadorEmAlerta(ind), 'cmv');
  assert.equal(avaliarIndicadores({ ...base, cmvPercent: 0.38 }).cmv, 'yellow');
});

test('faturamento abaixo do mínimo: sobra e mínimo vermelhos; sobra tem prioridade', () => {
  const ind = avaliarIndicadores({ ...base, sobraMes: -500, fatMedio: 10000, pontoEquilibrio: 12000, cmvPercent: 0.45 });
  assert.equal(ind.sobra, 'red');
  assert.equal(ind.minimo, 'red');
  assert.equal(indicadorEmAlerta(ind), 'sobra');
});

test('margem usa a meta do Financeiro (mesmas faixas da lista de Produtos)', () => {
  assert.equal(avaliarIndicadores({ ...base, margemMedia: 0.15 }).margem, 'yellow');
  assert.equal(avaliarIndicadores({ ...base, margemMedia: 0.05 }).margem, 'red');
});

test('Financeiro pendente: sobra, mínimo e margem sem cor (o card mostra "--")', () => {
  const ind = avaliarIndicadores({ ...base, pendente: true, sobraMes: -100 });
  assert.equal(ind.sobra, null);
  assert.equal(ind.minimo, null);
  assert.equal(ind.margem, null);
  assert.equal(ind.cmv, 'green'); // CMV não depende do Financeiro
});

test('sem produto com preço: nada é julgado (antes "0,00%" e "276% acima")', () => {
  const ind = avaliarIndicadores({ ...base, prodsComPreco: 0, custoComPreco: 0, cmvPercent: 0, margemMedia: 0, pontoEquilibrio: 5000 });
  assert.deepEqual(ind, { cmv: null, sobra: null, minimo: null, margem: null });
  assert.equal(indicadorEmAlerta(ind), null);
});

test('produtos com preço mas ingredientes sem custo: CMV 0% não vira "verde"', () => {
  assert.equal(avaliarIndicadores({ ...base, custoComPreco: 0, cmvPercent: 0 }).cmv, null);
});
