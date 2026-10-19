/**
 * Testes — primeiro preço (19/10/2026): src/utils/primeiroPreco.js e o registro
 * da tela PrimeiroPreco na navegação.
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/primeiroPreco.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  produtoDoSegmento, sugestoesDeProduto, normalizarTexto, linhaCobertura, lucroEmTexto,
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
