/**
 * Testes — primeiro preço (19/10/2026): src/utils/primeiroPreco.js e o registro
 * da tela PrimeiroPreco na navegação.
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/primeiroPreco.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  produtoDoSegmento, sugestoesDeProduto, normalizarTexto, linhaCobertura, lucroEmTexto, chipMarcado,
  SUGESTOES_PADRAO, MAX_SUGESTOES,
} from '../src/utils/primeiroPreco.js';

test('normalizarTexto tira acento, caixa e espaços extras', () => {
  assert.equal(normalizarTexto('  Açaíteria   do  JOÃO '), 'acaiteria do joao');
  assert.equal(normalizarTexto(null), '');
  assert.equal(normalizarTexto(undefined), '');
});

test('produto típico dos segmentos do Kit de Início', () => {
  const casos = {
    Confeitaria: 'Bolo de chocolate',
    Hamburgueria: 'Hambúrguer',
    Pizzaria: 'Pizza',
    Restaurante: 'Marmita',
    Padaria: 'Pão de queijo',
    Marmitaria: 'Marmita',
    'Açaíteria': 'Açaí 500 ml',
    Cafeteria: 'Cappuccino',
    Sorveteria: 'Picolé',
    Salgaderia: 'Coxinha',
    'Culinária Japonesa': 'Temaki',
  };
  for (const [segmento, produto] of Object.entries(casos)) {
    assert.equal(produtoDoSegmento(segmento), produto, segmento);
  }
});

test('segmento em texto livre: a primeira palavra-chave ganha', () => {
  assert.equal(produtoDoSegmento('Bolos e doces'), 'Bolo de chocolate');
  assert.equal(produtoDoSegmento('Doces finos'), 'Brigadeiro');
  assert.equal(produtoDoSegmento('Brigadeiros gourmet'), 'Brigadeiro');
  assert.equal(produtoDoSegmento('marmitas fit'), 'Marmita');
  assert.equal(produtoDoSegmento('Lanchonete'), 'Hambúrguer');
  assert.equal(produtoDoSegmento('Comida japonesa'), 'Temaki');
  assert.equal(produtoDoSegmento('Sabores do Japão'), 'Temaki'); // "japao" contém "pao"
  assert.equal(produtoDoSegmento('Salgados para festa'), 'Coxinha');
  assert.equal(produtoDoSegmento('PASTELARIA'), 'Pastel');
  assert.equal(produtoDoSegmento('Espetinhos'), 'Espetinho');
});

test('segmento vazio ou que não diz nada: sem sugestão (campo fica vazio)', () => {
  assert.equal(produtoDoSegmento(''), null);
  assert.equal(produtoDoSegmento(null), null);
  assert.equal(produtoDoSegmento('Barbearia'), null);
  assert.equal(produtoDoSegmento('Começar do zero'), null);
});

test('chips: o do segmento primeiro, sem repetir, no máximo 6', () => {
  assert.deepEqual(sugestoesDeProduto(''), SUGESTOES_PADRAO);
  assert.deepEqual(sugestoesDeProduto('Barbearia'), SUGESTOES_PADRAO);
  const pizza = sugestoesDeProduto('Pizzaria');
  assert.equal(pizza[0], 'Pizza');
  assert.equal(pizza.length, MAX_SUGESTOES);
  assert.equal(new Set(pizza).size, pizza.length);
  const temaki = sugestoesDeProduto('Sushi');
  assert.equal(temaki[0], 'Temaki');
  assert.equal(temaki.length, MAX_SUGESTOES);
  assert.deepEqual(temaki.slice(1), SUGESTOES_PADRAO.slice(0, MAX_SUGESTOES - 1));
  // Não muda a lista padrão exportada.
  assert.equal(SUGESTOES_PADRAO[0], 'Bolo de chocolate');
});

test('linha do cartão "Preço salvo" com o lucro no padrão brasileiro', () => {
  assert.equal(lucroEmTexto(0.15), '15');
  assert.equal(lucroEmTexto(0.125), '12,5');
  assert.equal(lucroEmTexto(undefined), '0');
  assert.equal(linhaCobertura(0.15), 'Cobre o custo de fazer, os gastos do mês e 15% de lucro.');
});

test('PrimeiroPreco: lazy no RootStack e com título no WebHeader', () => {
  const nav = readFileSync(new URL('../src/navigation/AppNavigator.js', import.meta.url), 'utf8');
  assert.match(nav, /const PrimeiroPrecoScreen = lazyScreen\(\(\) => import\('\.\.\/screens\/PrimeiroPrecoScreen'\)\);/);
  assert.match(nav, /<RootStack\.Screen name="PrimeiroPreco" component=\{PrimeiroPrecoScreen\}/);
  const header = readFileSync(new URL('../src/components/web/WebHeader.js', import.meta.url), 'utf8');
  assert.match(header, /'PrimeiroPreco': '[^']+'/);
});

test('textos novos da tela sem travessão', () => {
  const arquivos = [
    '../src/screens/PrimeiroPrecoScreen.js',
    '../src/screens/PrecoRapidoScreen.js',
    '../src/utils/primeiroPreco.js',
    '../src/utils/telefoneBR.js',
  ];
  for (const arq of arquivos) {
    const src = readFileSync(new URL(arq, import.meta.url), 'utf8');
    // Só o que vai para a tela: strings entre aspas simples e texto JSX solto.
    const textos = [...(src.match(/'[^'\n]*'/g) || []), ...(src.match(/>[^<>{}\n]+</g) || [])];
    for (const t of textos) assert.ok(!t.includes('—'), `${arq}: ${t}`);
  }
});

test('chip só fica marcado quando a pessoa escolheu: o nome sugerido pelo segmento não marca nenhum', () => {
  // Pré-preenchido pelo segmento (ninguém tocou): nenhum chip marcado.
  assert.equal(chipMarcado({ nome: 'Bolo de chocolate', chip: 'Bolo de chocolate', escolhido: false }), false);
  // Tocou no chip (ou digitou igual): marcado.
  assert.equal(chipMarcado({ nome: 'Bolo de chocolate', chip: 'Bolo de chocolate', escolhido: true }), true);
  assert.equal(chipMarcado({ nome: 'bolo de chocolate ', chip: 'Bolo de chocolate', escolhido: true }), true);
  assert.equal(chipMarcado({ nome: 'Pizza', chip: 'Bolo de chocolate', escolhido: true }), false);
  assert.equal(chipMarcado({ nome: '', chip: 'Pizza', escolhido: true }), false);
});

test('Preço rápido: nenhum número vem preenchido; chips são sugestão, resultado neutro até preencher', () => {
  const src = readFileSync(new URL('../src/screens/PrecoRapidoScreen.js', import.meta.url), 'utf8');
  // Os cinco campos começam vazios (os exemplos ficam no placeholder, em cinza).
  for (const campo of ['nome', 'custoReceita', 'rendimento', 'gastoMes', 'vendaMes', 'cobraHoje']) {
    const re = new RegExp(`const \\[${campo}, set\\w+\\] = useState\\(''\\)`);
    assert.match(src, re, `${campo} deve começar vazio`);
  }
  assert.ok(!/useState\('(40|20|2\.000|8\.000|3,50|2000|8000)/.test(src), 'nenhum valor de exemplo como estado inicial');
  // "ex.:" no placeholder: 12 contas da Rodada 1 copiaram o 2.000 como se fosse o valor certo.
  for (const ph of ['"ex.: 40,00"', '"ex.: 20"', '"ex.: 2.000"', '"ex.: 8.000"', '"ex.: 3,50"', '"Ex.: Bolo de chocolate"']) {
    assert.ok(src.includes(`placeholder=${ph}`), `placeholder ${ph}`);
  }
  // Chip marcado só pela regra chipMarcado (nunca "nome === s" direto no estilo).
  assert.ok(src.includes('chipMarcado('), 'usa chipMarcado');
  assert.ok(!/nome === s && styles\.chipAtivo/.test(src), 'chip não marca só por bater com o nome');
  // Cartão neutro enquanto faltam números.
  assert.ok(src.includes('TEXTO_RESULTADO_VAZIO'), 'mostra o texto neutro');
  assert.ok(src.includes('camposDoPrecoPreenchidos('), 'usa a regra pura de "preenchido"');
  // A receita montada continua sendo a ação principal do passo 2.
  assert.ok(src.includes('Não sei. Montar a receita'));
});
