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
  assert.equal(nichoDoSegmento('Doces e salgados'), 'confeitaria', 'vale o que vem primeiro');
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
  assert.equal(validarRespostaIA({ rende: 99999, ingredientes: [{ nome: 'a', quantidade: 1, unidade: 'g' }, { nome: 'b', quantidade: 1, unidade: 'g' }] }, 'x').rende, 1000, 'acima do teto vira o teto');
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

test('receitaCobreNome: sabor ou recheio diferente no nome pede a IA', async () => {
  const { receitaCobreNome } = await import('../src/utils/montarReceita.js');
  const esc = { nome: 'Escondidinho de carne moída com mandioca', termos: ['escondidinho', 'escondidinho de carne'], ingredientes: [['Mandioca', 1500, 'g'], ['Carne moída', 1000, 'g'], ['Requeijão cremoso', 200, 'g']] };
  assert.equal(receitaCobreNome('Escondidinho de carne seca', esc), false);
  assert.equal(receitaCobreNome('Escondidinho de frango', esc), false);
  assert.equal(receitaCobreNome('Escondidinho', esc), true);
  assert.equal(receitaCobreNome('Escondidinho de carne moída', esc), true);
  assert.equal(receitaCobreNome('escondidinhos de mandioca caseiro', esc), true, 'plural e palavra de enfeite não contam');
  const bolo = { nome: 'Bolo de cenoura', termos: ['bolo de cenoura'], ingredientes: [['Cenoura', 300, 'g'], ['Chocolate em pó 50%', 40, 'g']] };
  assert.equal(receitaCobreNome('Bolo de cenoura com cobertura de chocolate', bolo), true);
  assert.equal(receitaCobreNome('Bolo de cenoura fit 1kg', bolo), true);
  assert.equal(receitaCobreNome('Bolo de cenoura com nozes', bolo), false);
});

test('precoMedio: unidade diferente da base não usa o preço do pacote', async () => {
  const { precoMedio, montarSugestao } = await import('../src/utils/montarReceita.js');
  assert.ok(Math.abs(precoMedio('Creme de leite', 'g') - 25) < 0.01, 'caixinha 200 g por R$ 5 = R$ 25/kg (g e ml valem igual)');
  assert.ok(Math.abs(precoMedio('Leite integral', 'g') - 5) < 0.01);
  assert.equal(precoMedio('Farinha de trigo', 'un'), null, 'farinha por unidade não existe');
  assert.ok(Math.abs(precoMedio('Ovos', 'un') - 22 / 30) < 0.01);
  const s = montarSugestao({ receita: { id: 'ia', porcao: ['marmita', 'marmitas'], rende: 10, embalagem: null,
    ingredientes: [['Cebola', 2, 'un'], ['Alho', 4, 'un'], ['Tomate', 2, 'un'], ['Ovos', 3, 'un'], ['Farinha de trigo', 2, 'un']] } });
  const por = Object.fromEntries(s.itens.map((i) => [i.nome, i]));
  assert.deepEqual([por.Cebola.q, por.Cebola.un], [300, 'g'], 'cebola média 150 g');
  assert.deepEqual([por.Alho.q, por.Alho.un], [20, 'g'], 'alho em un = dentes de 5 g');
  assert.deepEqual([por.Tomate.q, por.Tomate.un], [240, 'g']);
  assert.equal(por.Ovos.un, 'un');
  assert.equal(por['Farinha de trigo'].preco, null, 'sem peso conhecido: sem preço, nunca o do pacote');
  for (const i of s.itens) if (i.preco != null) assert.ok(i.preco < 200, i.nome);
});

test('lerOutro: medidas de casa, plural e nomes da base', () => {
  const k = ['Cebola', 'Tomate', 'Farinha de trigo', 'Carne moída', 'Leite condensado', 'Creme de leite', 'Açúcar refinado', 'Leite integral', 'Manteiga sem sal', 'Alho', 'Sal', 'Ovos', 'Pão de hambúrguer', 'Fermento químico'];
  const casos = [
    ['2 cebolas', ['Cebola', 300, 'g']],
    ['3 tomates', ['Tomate', 360, 'g']],
    ['1.000 g de farinha', ['Farinha de trigo', 1000, 'g']],
    ['1/2 kg de carne moída', ['Carne moída', 500, 'g']],
    ['1 lata de leite condensado', ['Leite condensado', 395, 'g']],
    ['1 caixinha de creme de leite', ['Creme de leite', 200, 'g']],
    ['2 xícaras de açúcar', ['Açúcar refinado', 360, 'g']],
    ['2 xícaras de farinha de trigo', ['Farinha de trigo', 240, 'g']],
    ['1 xícara de leite', ['Leite integral', 240, 'ml']],
    ['2 colheres de manteiga', ['Manteiga sem sal', 30, 'g']],
    ['1 colher de chá de fermento em pó', ['Fermento químico', 5, 'g']],
    ['2 dentes de alho', ['Alho', 10, 'g']],
    ['1 pitada de sal', ['Sal', 1, 'g']],
    ['500ml leite', ['Leite integral', 500, 'ml']],
    ['2 ovos', ['Ovos', 2, 'un']],
    ['10 un pão de hambúrguer', ['Pão de hambúrguer', 10, 'un']],
    ['100 coco ralado', ['Coco ralado', 100, 'g']],
  ];
  for (const [t, esperado] of casos) assert.deepEqual(lerOutro(t, k), esperado, t);
  assert.equal(lerOutro('0 g de sal', k), null);
  assert.equal(lerOutro('sal', k), null);
});

test('canonizar: tira "morno", "em cubos"; apelidos comuns da IA; preços que faltavam', async () => {
  const { canonizarReceita, precoMedio } = await import('../src/utils/montarReceita.js');
  const k = ['Leite integral', 'Queijo parmesão', 'Nutella', 'Requeijão cremoso', 'Azeite de oliva', 'Fermento biológico seco', 'Cacau em pó 100%', 'Arroz', 'Feijão carioca', 'Milho em conserva', 'Ervilha em conserva'];
  const ia = [['Leite morno', 150, 'ml'], ['Frango em cubos', 500, 'g'], ['Queijo parmesão ralado', 50, 'g'], ['Creme de avelã com cacau', 300, 'g'], ['Catupiry', 150, 'g'],
    ['Azeite', 15, 'ml'], ['Fermento biologico', 5, 'g'], ['Cacau em po', 50, 'g'], ['Arroz branco', 750, 'g'], ['Feijão', 500, 'g'], ['Milho verde', 200, 'g'], ['Ervilha', 100, 'g'], ['Manteiga derretida', 50, 'g']];
  const nomes = canonizarReceita({ ingredientes: ia }, k).ingredientes.map((i) => i[0]);
  assert.deepEqual(nomes, ['Leite integral', 'Frango', 'Queijo parmesão', 'Nutella', 'Requeijão cremoso', 'Azeite de oliva', 'Fermento biológico seco', 'Cacau em pó 100%', 'Arroz', 'Feijão carioca', 'Milho em conserva', 'Ervilha em conserva', 'Manteiga sem sal']);
  for (const n of ['Frango', 'Contrafilé', 'Acém', 'Camarão', 'Pimentão verde', 'Coentro', 'Cebolinha', 'Queijo coalho', 'Costela bovina', 'Peixe em posta', 'Molho shoyu', 'Colorau', 'Palmito']) {
    assert.ok(precoMedio(n, n === 'Molho shoyu' ? 'ml' : 'g') > 0, n);
  }
  assert.ok(precoMedio('Queijo gorgonzola', 'g') < 150, 'gorgonzola não é R$ 450/kg');
  assert.ok(precoMedio('Pimenta do reino', 'g') < 200);
});

test('canonizar: palavra de preparo com "e" não deixa sobra', async () => {
  const { canonizarReceita } = await import('../src/utils/montarReceita.js');
  const r = canonizarReceita({ ingredientes: [['Jaca cozida e desfiada', 500, 'g'], ['Cebola picada e refogada', 100, 'g'], ['Tomate sem pele e picado', 200, 'g']] }, ['Cebola', 'Tomate']);
  assert.deepEqual(r.ingredientes.map((i) => i[0]), ['Jaca desfiada', 'Cebola', 'Tomate']);
});

test('caldo pronto em ml vira tablete em g (1 tablete de 10 g faz 500 ml)', async () => {
  const { montarSugestao } = await import('../src/utils/montarReceita.js');
  const s = montarSugestao({ receita: { id: 'ia', porcao: ['un', 'un'], rende: 50, embalagem: null, ingredientes: [['Caldo de carne', 1000, 'ml'], ['Caldo de galinha', 20, 'g']] } });
  assert.deepEqual([s.itens[0].q, s.itens[0].un], [20, 'g']);
  assert.ok(s.itens[0].preco * 20 / 1000 < 3, 'caldo custa centavos, não R$ 61');
  assert.deepEqual([s.itens[1].q, s.itens[1].un], [20, 'g']);
});

test('canonizar: devolve acento às palavras comuns que a IA escreve sem', async () => {
  const { canonizarReceita } = await import('../src/utils/montarReceita.js');
  const r = canonizarReceita({ ingredientes: [['Camarao', 1, 'g'], ['Azeite de dende', 1, 'ml'], ['Pimentao vermelho', 1, 'g'], ['Pao de alho', 1, 'un'], ['File de peito', 1, 'g']] }, []);
  assert.deepEqual(r.ingredientes.map((i) => i[0]), ['Camarão', 'Azeite de dendê', 'Pimentão vermelho', 'Pão de alho', 'Filé de peito']);
});

test('nichoDoProduto: 1ª palavra conhecida, palavra inteira', async () => {
  const { nichoDoProduto } = await import('../src/utils/montarReceita.js');
  const casos = { 'Lasanha à bolonhesa': 'marmitas', 'Bolo de coco gelado': 'confeitaria', 'Café gelado': 'bebidas', 'Coxinha de costela': 'salgados',
    'Pães de queijo': 'padaria', 'X-bacon': 'hamburgueria', 'Brigadeiro de café': 'confeitaria', 'Mini pizza': 'pizzaria', 'Geladinho de ninho': 'acai_sorvete', 'Torta exótica': null };
  for (const [n, r] of Object.entries(casos)) assert.equal(nichoDoProduto(n), r, n);
});

test('rodada 500: acharReceita só por início de palavra; plural no ramo; porção com acento; embalagem falsa', async () => {
  const m = await import('../src/utils/montarReceita.js');
  const { RECEITAS_SUGERIDAS } = await import('../src/data/receitasSugeridas.js');
  for (const n of ['Espaguete à bolonhesa', 'Scones', 'Capão assado', 'Japão roll']) {
    const r = m.acharReceita(n, RECEITAS_SUGERIDAS);
    assert.ok(!r || !/(bolo de chocolate|picol|cone|p[aã]o caseiro)/i.test(r.nome), `${n} -> ${r?.nome}`);
  }
  assert.ok(/brigadeiro/i.test(m.acharReceita('brigadeiros', RECEITAS_SUGERIDAS)?.nome || ''), 'plural ainda acha');
  for (const [n, r] of [['Doces', 'confeitaria'], ['Brownies', 'confeitaria'], ['Cookies', 'confeitaria'], ['Pastéis', 'salgados'], ['Lanches', 'hamburgueria'], ['Picolés', 'acai_sorvete'], ['Sanduíches', 'hamburgueria'], ['Bombons', 'confeitaria'], ['Esfirra', 'salgados']]) assert.equal(m.nichoDoProduto(n), r, n);
  const v = (j) => m.validarRespostaIA({ ingredientes: [{ nome: 'Leite condensado', quantidade: 395, unidade: 'g' }, { nome: 'leite condensado', quantidade: 395, unidade: 'g' }, { nome: 'Farinha', quantidade: 100, unidade: 'g' }], ...j }, 'X');
  assert.equal(v({}).ingredientes.find((i) => /condensado/i.test(i[0]))[1], 790, 'massa + cobertura somam');
  assert.equal(v({ rende: 1200 }).rende, 1000);
  assert.deepEqual(v({ porcao: 'porção' }).porcao, ['porção', 'porções']);
  assert.deepEqual(v({ porcao: '1 fatia' }).porcao, ['fatia', 'fatias']);
  assert.deepEqual(v({ porcao: 'fatias' }).porcao, ['fatia', 'fatias']);
  assert.deepEqual(v({ porcao: 'pão' }).porcao, ['pão', 'pães']);
  assert.deepEqual(v({ porcao: 'pastel' }).porcao, ['pastel', 'pastéis']);
  for (const e of ['N/A', '-', 'nada', 5, { a: 1 }, 'nenhuma embalagem']) assert.equal(v({ embalagem: e }).embalagem, null, String(e));
  assert.ok(v({ embalagem: 'Sementeira de papel' }).embalagem);
  const s = m.montarSugestao({ receita: { id: 'ia', porcao: ['un', 'un'], rende: 10, embalagem: null, ingredientes: [['Cheiro-verde', 1, 'un']] } });
  assert.deepEqual([s.itens[0].q, s.itens[0].un], [100, 'g']);
  const c = m.canonizarReceita({ ingredientes: [['Farinha de trigo', 15000, 'g'], ['Farinha de trigo', 15000, 'g']] }, ['Farinha de trigo']);
  assert.ok(c.ingredientes[0][1] <= m.MAX_QTD.g);
});

test('rodada 500: lerOutro com medidas reais de casa', () => {
  const k = ['Óleo de soja', 'Farinha de trigo', 'Carne moída', 'Ovos', 'Açúcar refinado', 'Manteiga sem sal', 'Canela em pó', 'Leite condensado', 'Leite em pó', 'Queijo mussarela', 'Cheiro-verde'];
  const casos = [
    ['1/4 de xícara de óleo', ['Óleo de soja', 60, 'ml']],
    ['1 e 1/2 xícara de farinha', ['Farinha de trigo', 180, 'g']],
    ['meia xícara de açúcar', ['Açúcar refinado', 90, 'g']],
    ['2 kg e 500 g de carne moída', ['Carne moída', 2500, 'g']],
    ['1 dz de ovos', ['Ovos', 12, 'un']],
    ['1 dúzia de ovos', ['Ovos', 12, 'un']],
    ['1 bandeja de ovos', ['Ovos', 30, 'un']],
    ['1 kilo de farinha', ['Farinha de trigo', 1000, 'g']],
    ['meio quilo de carne moída', ['Carne moída', 500, 'g']],
    ['2 xícaras (chá) de açúcar', ['Açúcar refinado', 360, 'g']],
    ['2 xícaras de chá de açúcar', ['Açúcar refinado', 360, 'g']],
    ['3 colheres de sopa rasas de manteiga', ['Manteiga sem sal', 45, 'g']],
    ['1 colher de café de canela', ['Canela em pó', 2, 'g']],
    ['1 xícara de leite condensado', ['Leite condensado', 300, 'g']],
    ['1 xícara de leite em pó', ['Leite em pó', 100, 'g']],
    ['200gr de queijo mussarela', ['Queijo mussarela', 200, 'g']],
    ['2 unid ovos', ['Ovos', 2, 'un']],
    ['uma lata de leite condensado', ['Leite condensado', 395, 'g']],
    ['1 maço de cheiro verde', ['Cheiro-verde', 100, 'g']],
  ];
  for (const [t, e] of casos) assert.deepEqual(lerOutro(t, k), e, t);
  assert.equal(lerOutro('30 forminhas', k)[2], 'un');
  assert.equal(lerOutro('50 bombons', k)[2], 'un');
});

test('rodada 500 (2): ramo, cobertura do nome e abreviações', async () => {
  const m = await import('../src/utils/montarReceita.js');
  const { RECEITAS_SUGERIDAS } = await import('../src/data/receitasSugeridas.js');
  assert.equal(m.nichoDoSegmento('Café da manhã'), 'padaria');
  assert.equal(m.nichoDoSegmento('Coffee break'), 'padaria');
  assert.equal(m.nichoDoSegmento('Confeitaria e salgados'), 'confeitaria', 'vale o que vem primeiro no texto');
  assert.equal(m.nichoDoSegmento('Bolos gelados'), 'confeitaria');
  assert.equal(m.nichoDoSegmento('Tapiocaria'), 'salgados');
  assert.equal(m.nichoDoProduto('Pão de mel recheado'), 'confeitaria');
  for (const n of ['Acarajé', 'Tapioca de frango', 'Cuscuz nordestino', 'Quiche de alho-poró', 'Croissant de presunto']) assert.ok(m.nichoDoProduto(n), n);
  const cobre = (n) => m.receitaCobreNome(n, m.acharReceita(n, RECEITAS_SUGERIDAS));
  assert.equal(cobre('Cupcake de baunilha'), false, 'essência não cobre o sabor');
  assert.match(m.acharReceita('Pão de hambúrguer brioche', RECEITAS_SUGERIDAS).nome, /Pão de hambúrguer/);
  assert.match(m.acharReceita('Docinho de leite em pó', RECEITAS_SUGERIDAS).nome, /Ninho/);
  assert.match(m.acharReceita('Pastel de queijo', RECEITAS_SUGERIDAS).nome, /queijo/);
  assert.match(m.acharReceita('Empadão de frango', RECEITAS_SUGERIDAS).nome, /Empadão/);
  assert.match(m.acharReceita('Pão integral', RECEITAS_SUGERIDAS).nome, /integral/);
  assert.equal(m.acharReceita('Bolo prestígio', RECEITAS_SUGERIDAS)?.porcao?.[0] === 'pote', false, 'bolo prestígio não é de pote');
  assert.equal(cobre('Mini cachorro quente'), false, 'mini muda o produto');
  assert.equal(cobre('coxinha d frango'), true, '"d" = de');
  assert.equal(cobre('pastel q queijo'), true);
  assert.equal(cobre('Bolo de cenoura com cobertura de chocolate'), true);
  assert.equal(cobre('Brigadeiro gourmet'), true);
  const c = m.canonizarReceita({ ingredientes: [['Oleo de soja para fritura', 1000, 'ml'], ['Manteiga para untar', 20, 'g'], ['Açúcar para polvilhar', 30, 'g']] }, ['Óleo de soja', 'Manteiga sem sal', 'Açúcar refinado']);
  assert.deepEqual(c.ingredientes.map((i) => i[0]), ['Óleo de soja', 'Manteiga sem sal', 'Açúcar refinado']);
});

test('garantirOleoFritura: frito sem óleo ganha 500 ml; assado ou com óleo não muda', async () => {
  const { garantirOleoFritura } = await import('../src/utils/montarReceita.js');
  const r = (ing) => ({ id: 'ia', ingredientes: ing });
  assert.deepEqual(garantirOleoFritura(r([['Farinha de trigo', 500, 'g']]), 'Pastel de vento').ingredientes.at(-1), ['Óleo de soja', 500, 'ml']);
  assert.equal(garantirOleoFritura(r([['Farinha de trigo', 500, 'g']]), 'Coxinha assada').ingredientes.length, 1);
  assert.equal(garantirOleoFritura(r([['Óleo de soja', 800, 'ml']]), 'Coxinha').ingredientes[0][1], 800);
  assert.deepEqual(garantirOleoFritura(r([['Óleo de soja', 50, 'ml']]), 'Kibe frito').ingredientes[0], ['Óleo de soja', 500, 'ml'], 'pouco óleo vira o da fritura');
  assert.equal(garantirOleoFritura(r([['Farinha', 1, 'g']]), 'Bolo de cenoura').ingredientes.length, 1);
});

test('rodada 500 (3): lanches, pizza e petiscos', async () => {
  const m = await import('../src/utils/montarReceita.js');
  const { RECEITAS_SUGERIDAS, INGREDIENTES_POR_NICHO, PORCAO_POR_NICHO } = await import('../src/data/receitasSugeridas.js');
  for (const [n, r] of [['Espetinho de coração', 'petiscos'], ['Porção de calabresa acebolada', 'petiscos'], ['Isca de peixe', 'petiscos'], ['Brotinho de mussarela', 'pizzaria'], ['Hot dog completo', 'hamburgueria']]) assert.equal(m.nichoDoProduto(n), r, n);
  assert.equal(m.nichoDoSegmento('Espetinho e churrasco'), 'petiscos');
  assert.equal(m.nichoDoSegmento('Bar do Zé'), 'petiscos');
  const s = m.montarSugestao({ receita: null, nicho: 'hamburgueria', ingredientesPorNicho: INGREDIENTES_POR_NICHO, porcaoPorNicho: PORCAO_POR_NICHO });
  assert.equal(s.rende, 1); assert.deepEqual(s.porcao, ['lanche', 'lanches']);
  const k = ['Carne moída', 'Mussarela', 'Cheddar fatiado', 'Pão de hot dog', 'Bacon', 'Salsicha', 'Requeijão cremoso'];
  const c = m.canonizarReceita({ ingredientes: [['Hamburguer bovino', 180, 'g'], ['Queijo mozarela', 100, 'g'], ['Fatia de queijo cheddar', 2, 'un'], ['Pao de cachorro quente', 1, 'un'], ['Fatia de bacon', 4, 'un'], ['Queijo catupiry', 50, 'g']] }, k);
  assert.deepEqual(c.ingredientes.map((i) => i[0]), ['Carne moída', 'Mussarela', 'Cheddar fatiado', 'Pão de hot dog', 'Bacon', 'Requeijão cremoso']);
  const u = m.montarSugestao({ receita: { id: 'ia', porcao: ['lanche', 'lanches'], rende: 1, embalagem: null, ingredientes: [['Salsicha', 10, 'un'], ['Bacon', 4, 'un'], ['Cheddar fatiado', 2, 'un']] } });
  assert.deepEqual(u.itens.map((i) => [i.q, i.un]), [[500, 'g'], [60, 'g'], [40, 'g']]);
  assert.ok(u.itens.every((i) => i.preco > 0));
  const a = (n) => m.acharReceita(n, RECEITAS_SUGERIDAS, m.nichoDoProduto(n))?.nome || '';
  assert.match(a('Pizza de chocolate com morango'), /Pizza/);
  assert.match(a('Pizza grande 8 fatias calabresa'), /calabresa/i);
  assert.match(a('Batata frita com cheddar e bacon'), /[Bb]atata/);
  assert.match(a('Espetinho de carne'), /[Ee]spetinho/);
  assert.match(a('Calabresa acebolada'), /[Cc]alabresa acebolada/);
  const cobre = (n) => m.receitaCobreNome(n, m.acharReceita(n, RECEITAS_SUGERIDAS, m.nichoDoProduto(n)));
  assert.equal(cobre('X-Tudo da Casa'), true);
  assert.equal(cobre('Hot dog completo'), true);
  assert.equal(cobre('Cachorro-quente prensado'), true);
  assert.ok(m.precoMedio('Atum em lata', 'g') > 40, 'atum não é R$ 14/kg');
  assert.ok(m.precoMedio('Picanha', 'g') > 0 && m.precoMedio('Coração de frango', 'g') > 0 && m.precoMedio('Mortadela', 'g') > 0);
});

test('rodada 500 (4): marmitas e restaurante', async () => {
  const m = await import('../src/utils/montarReceita.js');
  const { RECEITAS_SUGERIDAS, INGREDIENTES_POR_NICHO } = await import('../src/data/receitasSugeridas.js');
  for (const n of ['Nhoque à bolonhesa', 'Sopa de legumes', 'Temaki de salmão', 'Fricassê de frango', 'Tutu de feijão', 'Canja de galinha']) assert.equal(m.nichoDoProduto(n), 'marmitas', n);
  assert.equal(m.nichoDoSegmento('Buffet e eventos'), 'marmitas');
  assert.equal(m.nichoDoSegmento('Comida japonesa'), 'marmitas');
  const a = (n) => m.acharReceita(n, RECEITAS_SUGERIDAS, m.nichoDoProduto(n))?.nome || '';
  assert.match(a('Marmita vegana'), /vegetariana/i);
  assert.match(a('strogonof de frango'), /[Ss]trogonoff/);
  assert.match(a('Marmita fitness de frango'), /fit/i);
  const cobre = (n) => m.receitaCobreNome(n, m.acharReceita(n, RECEITAS_SUGERIDAS, m.nichoDoProduto(n)));
  assert.equal(cobre('Marmitex nº 8 de frango grelhado'), true);
  assert.equal(cobre('Kit 10 marmitas fit'), true);
  const prot = INGREDIENTES_POR_NICHO.marmitas.filter(([n]) => /frango|carne/i.test(n));
  assert.equal(prot.length, 1, 'lista do ramo com uma proteína só');
  const k = ['Contrafilé', 'Champignon em conserva', 'Coxa e sobrecoxa', 'Feijão carioca', 'Massa para lasanha', 'Arroz', 'Mussarela', 'Molho de tomate', 'Macarrão'];
  const c = m.canonizarReceita({ ingredientes: [['Contrafile bovino', 1, 'g'], ['Champignon', 1, 'g'], ['Frango em pedaços', 1, 'g'], ['Feijão carioquinha', 1, 'g'], ['Massa de lasanha', 1, 'g'], ['Arroz cru', 1, 'g'], ['Queijo muçarela ralado', 1, 'g'], ['Polpa de tomate', 1, 'g'], ['Espaguete', 1, 'g']] }, k);
  assert.deepEqual(c.ingredientes.map((i) => i[0]), ['Contrafilé', 'Champignon em conserva', 'Coxa e sobrecoxa', 'Feijão carioca', 'Massa para lasanha', 'Arroz', 'Mussarela', 'Molho de tomate', 'Macarrão']);
  for (const n of ['Lentilha', 'Abóbora', 'Chuchu', 'Quiabo', 'Berinjela', 'Pimenta de cheiro', 'Pato', 'Tucupi', 'Jambu', 'Tofu', 'Louro', 'Mocotó', 'Vinagre de arroz']) assert.ok(m.precoMedio(n, n === 'Tucupi' || n === 'Vinagre de arroz' ? 'ml' : 'g') > 0, n);
});
