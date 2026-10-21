/**
 * Testes — montar a receita tocando (src/utils/montarReceita.js).
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/montarReceita.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  normTexto, acharReceita, nichoDoSegmento, precoMedio, custoLinha, custoReceita,
  limparLinha, validarRespostaIA, lerOutro, montarSugestao, pluralSimples,
} from '../src/utils/montarReceita.js';

const perto = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m ?? ''} esperado ${b}, veio ${a}`);

const BIB = [
  { id: 'ninho', nome: 'Bolo de pote de ninho', termos: ['ninho', 'bolo de pote'], porcao: ['pote', 'potes'], rende: 10, ingredientes: [['Leite condensado', 395, 'g'], ['Ovos', 6, 'un']], embalagem: ['Pote 250 ml com tampa', 0.9] },
  { id: 'nutella', nome: 'Ninho com Nutella', termos: ['ninho com nutella', 'nutella'], porcao: ['pote', 'potes'], rende: 10, ingredientes: [['Nutella', 300, 'g'], ['Ovos', 6, 'un']], embalagem: null },
  { id: 'brig', nome: 'Brigadeiro', termos: ['brigadeiro'], porcao: ['unidade', 'unidades'], rende: 25, ingredientes: [['Leite condensado', 395, 'g'], ['Chocolate em pó', 30, 'g']], embalagem: ['Forminha nº 5', 0.05] },
];

test('normTexto: minúscula, sem acento, sem pontuação', () => {
  assert.equal(normTexto('  Açúcar   Refinado (cristal)! '), 'acucar refinado cristal');
  assert.equal(normTexto(null), '');
});

test('acharReceita: termo mais longo ganha; palavra inteira antes de pedaço', () => {
  assert.equal(acharReceita('Bolo de pote de NINHO com Nutella', BIB).id, 'nutella');
  assert.equal(acharReceita('bolo de pote de ninho com morango', BIB).id, 'ninho');
  assert.equal(acharReceita('Brigadeiros gourmet', BIB).id, 'brig');
  assert.equal(acharReceita('Pastel de queijo', BIB), null);
  assert.equal(acharReceita('', BIB), null);
});

test('nichoDoSegmento: texto livre do perfil', () => {
  assert.equal(nichoDoSegmento('Confeitaria'), 'confeitaria');
  assert.equal(nichoDoSegmento('Hambúrgueria'), 'hamburgueria');
  assert.equal(nichoDoSegmento('Doces e salgados'), 'salgados');
  assert.equal(nichoDoSegmento('marmitex'), 'marmitas');
  assert.equal(nichoDoSegmento('Açaí'), 'acai_sorvete');
  assert.equal(nichoDoSegmento('Panificação'), 'padaria');
  assert.equal(nichoDoSegmento(''), null);
  assert.equal(nichoDoSegmento('xyz'), null);
});

test('precoMedio: por kg da base; desconhecido = null', () => {
  const p = precoMedio('Açúcar refinado', 'g');
  assert.ok(p > 0, 'açúcar tem preço médio');
  assert.equal(precoMedio('Ingrediente que não existe 123', 'g'), null);
});

test('custoLinha: g/ml por mil, un direto; sem preço = 0', () => {
  perto(custoLinha(20, 400, 'g'), 8);
  perto(custoLinha(5.49, 500, 'ml'), 2.745);
  perto(custoLinha(0.8, 6, 'un'), 4.8);
  assert.equal(custoLinha(null, 100, 'g'), 0);
});

test('custoReceita: embalagem vezes o rendimento; conta os sem preço', () => {
  const r = custoReceita([
    { nome: 'A', q: 1000, un: 'g', preco: 10 },
    { nome: 'B', q: 2, un: 'un', preco: 1 },
    { nome: 'C', q: 100, un: 'g', preco: null },
    { nome: 'Pote', q: 1, un: 'un', preco: 0.9, emb: true },
  ], 10);
  perto(r.custoReceita, 10 + 2 + 9);
  perto(r.custoPorcao, 2.1);
  assert.equal(r.semPreco, 1);
  assert.equal(custoReceita([], 0).custoPorcao, 0);
});

test('limparLinha: kg e litro viram g e ml; absurdos saem', () => {
  assert.deepEqual(limparLinha('farinha de trigo', 1, 'kg'), ['Farinha de trigo', 1000, 'g']);
  assert.deepEqual(limparLinha('leite (integral)', 0.5, 'L'), ['Leite', 500, 'ml']);
  assert.equal(limparLinha('ovos', 0, 'un'), null);
  assert.equal(limparLinha('ovos', 500, 'un'), null);
  assert.equal(limparLinha('sal', 50000, 'g'), null);
  assert.equal(limparLinha('', 10, 'g'), null);
  assert.equal(limparLinha('sal', 10, 'colher'), null);
});

test('validarRespostaIA: limpa, tira repetidos, precisa de 2', () => {
  const r = validarRespostaIA({
    porcao: 'pote', rende: 10, embalagem: 'pote de plástico 200 ml',
    ingredientes: [
      { nome: 'farinha de trigo', quantidade: 250, unidade: 'g' },
      { nome: 'Farinha de Trigo', quantidade: 100, unidade: 'g' },
      { nome: 'ovos', quantidade: 3, unidade: 'un' },
      { nome: 'água', quantidade: -1, unidade: 'ml' },
      { nome: 'paçoca', quantidade: 10, unidade: 'colher' },
    ],
  }, 'bolo de pote de paçoca');
  assert.equal(r.ingredientes.length, 2);
  assert.deepEqual(r.porcao, ['pote', 'potes']);
  assert.equal(r.rende, 10);
  assert.equal(r.nome, 'Bolo de pote de paçoca');
  assert.deepEqual(r.embalagem, ['Pote de plástico 200 ml', null]);
  assert.equal(validarRespostaIA({ ingredientes: [{ nome: 'x', quantidade: 1, unidade: 'g' }] }, 'x'), null);
  assert.equal(validarRespostaIA(null, 'x'), null);
  assert.equal(validarRespostaIA({ rende: 99999, ingredientes: [{ nome: 'a', quantidade: 1, unidade: 'g' }, { nome: 'b', quantidade: 1, unidade: 'g' }] }, 'x').rende, 1);
  assert.equal(validarRespostaIA({ embalagem: 'nenhuma', ingredientes: [{ nome: 'a', quantidade: 1, unidade: 'g' }, { nome: 'b', quantidade: 1, unidade: 'g' }] }, 'x').embalagem, null);
});

test('pluralSimples', () => {
  assert.equal(pluralSimples('pote'), 'potes');
  assert.equal(pluralSimples('lanche'), 'lanches');
  assert.equal(pluralSimples('colher'), 'colheres');
});

test('lerOutro: quantidade, unidade e nome', () => {
  assert.deepEqual(lerOutro('100 g de coco ralado'), ['Coco ralado', 100, 'g']);
  assert.deepEqual(lerOutro('2 ovos'), ['Ovos', 2, 'un']);
  assert.deepEqual(lerOutro('1,5 kg farinha'), ['Farinha', 1500, 'g']);
  assert.deepEqual(lerOutro('200 ml de leite'), ['Leite', 200, 'ml']);
  assert.equal(lerOutro('coco ralado'), null);
});

test('montarSugestao: preço da conta vence o médio; embalagem 1 por porção', () => {
  const conta = new Map([['leite condensado', { id: 7, preco: 18, un: 'g' }], ['ovos', { id: 8, preco: 0.5, un: 'g' }]]);
  const s = montarSugestao({ receita: BIB[0], precosConta: conta });
  assert.equal(s.fonte, 'biblioteca');
  assert.equal(s.rende, 10);
  const lc = s.itens.find((i) => i.nome === 'Leite condensado');
  assert.equal(lc.preco, 18); assert.equal(lc.contaId, 7); assert.equal(lc.estimado, false);
  const ovos = s.itens.find((i) => i.nome === 'Ovos');
  assert.equal(ovos.contaId, null, 'unidade diferente na conta: não reaproveita');
  const pote = s.itens.find((i) => i.emb);
  assert.equal(pote.q, 1); assert.equal(pote.preco, 0.9);
});

test('montarSugestao: sem receita usa a lista do nicho', () => {
  const s = montarSugestao({ receita: null, nicho: 'confeitaria', ingredientesPorNicho: { confeitaria: [['Farinha de trigo', 500, 'g']] }, embalagemPorNicho: { confeitaria: ['Pote 250 ml com tampa', 0.9] } });
  assert.equal(s.fonte, 'nicho');
  assert.equal(s.itens.length, 2);
  assert.equal(montarSugestao({ receita: null, nicho: 'nada' }).itens.length, 0);
});

test('montarSugestao: resposta da IA marca a fonte', () => {
  const r = validarRespostaIA({ porcao: 'fatia', rende: 8, ingredientes: [{ nome: 'açúcar refinado', quantidade: 200, unidade: 'g' }, { nome: 'ovos', quantidade: 3, unidade: 'un' }] }, 'bolo de paçoca');
  const s = montarSugestao({ receita: r });
  assert.equal(s.fonte, 'ia');
  assert.ok(s.itens.find((i) => i.nome === 'Açúcar refinado').preco > 0, 'nome da IA casa com a base');
});

test('canonizarReceita: nomes da IA viram os da biblioteca, água sai, repetidos juntam', async () => {
  const { canonizarReceita } = await import('../src/utils/montarReceita.js');
  const conhecidos = ['Ovos', 'Manteiga sem sal', 'Açúcar mascavo', 'Fermento químico', 'Leite de coco', 'Sal', 'Leite integral'];
  const r = canonizarReceita({
    id: 'ia', nome: 'Torta', porcao: ['fatia', 'fatias'], rende: 12, embalagem: null,
    ingredientes: [['Ovo', 3, 'un'], ['Manteiga', 150, 'g'], ['Acucar mascavo', 200, 'g'], ['Fermento em po', 10, 'g'],
      ['Agua', 100, 'ml'], ['Água filtrada', 50, 'ml'], ['Agua de coco', 200, 'ml'], ['Jaca verde', 1000, 'g'], ['Leite', 200, 'ml'], ['Leite integral', 100, 'ml']],
  }, conhecidos);
  assert.deepEqual(r.ingredientes.map((i) => i[0]), ['Ovos', 'Manteiga sem sal', 'Açúcar mascavo', 'Fermento químico', 'Agua de coco', 'Jaca verde', 'Leite integral']);
  assert.equal(r.ingredientes.find((i) => i[0] === 'Leite integral')[1], 300, 'leite + leite integral somam');
  assert.equal(canonizarReceita(null, conhecidos), null);
});
