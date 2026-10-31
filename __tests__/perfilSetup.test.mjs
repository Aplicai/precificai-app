/**
 * Primeiro acesso (31/10/2026): o tour saiu e o perfil virou um passo só,
 * "O que você vende?", com o segmento em chips. Regras puras em
 * `src/utils/perfilSetup.js`; a rota é decidida por `rotaInicialDoPerfil`.
 *
 * Auditoria em 326 cadastros: 68 (21%) paravam na tela de perfil (nome +
 * segmento obrigatórios) e nenhum voltou. Agora nada é obrigatório, e quem
 * viu a tela uma vez nunca mais é mandado de volta.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  SEGMENTOS_SETUP,
  SEGMENTO_OUTRO,
  CHAVE_PERFIL_SETUP,
  chipDoSegmento,
  segmentoDoChip,
  rotaInicialDoPerfil,
} = await import('../src/utils/perfilSetup.js');
const { nichoDoSegmento } = await import('../src/utils/montarReceita.js');
const { produtoDoSegmento } = await import('../src/utils/primeiroPreco.js');

// ── Chips ────────────────────────────────────────────────────────────────

test('chips: nove opções, "Outro" por último', () => {
  assert.deepEqual(SEGMENTOS_SETUP, [
    'Confeitaria', 'Salgados', 'Marmitas', 'Lanches', 'Hamburgueria',
    'Pizzaria', 'Padaria', 'Bebidas', SEGMENTO_OUTRO,
  ]);
  assert.equal(SEGMENTO_OUTRO, 'Outro');
});

test('chips: cada chip (menos "Outro") cai no ramo certo de nichoDoSegmento', () => {
  const esperado = {
    Confeitaria: 'confeitaria',
    Salgados: 'salgados',
    Marmitas: 'marmitas',
    Lanches: 'hamburgueria',
    Hamburgueria: 'hamburgueria',
    Pizzaria: 'pizzaria',
    Padaria: 'padaria',
    Bebidas: 'bebidas',
  };
  for (const [chip, nicho] of Object.entries(esperado)) {
    assert.equal(nichoDoSegmento(chip), nicho, chip);
  }
  assert.equal(nichoDoSegmento(SEGMENTO_OUTRO), null);
});

test('chips: o Preço rápido sugere um produto típico para os chips de comida', () => {
  const esperado = {
    Confeitaria: 'Bolo de chocolate',
    Salgados: 'Coxinha',
    Marmitas: 'Marmita',
    Lanches: 'Hambúrguer',
    Hamburgueria: 'Hambúrguer',
    Pizzaria: 'Pizza',
    Padaria: 'Pão de queijo',
  };
  for (const [chip, produto] of Object.entries(esperado)) {
    assert.equal(produtoDoSegmento(chip), produto, chip);
  }
});

test('segmentoDoChip: chip grava a própria palavra; "Outro" grava o texto digitado', () => {
  assert.equal(segmentoDoChip('Marmitas'), 'Marmitas');
  assert.equal(segmentoDoChip('Marmitas', 'ignorado'), 'Marmitas');
  assert.equal(segmentoDoChip(SEGMENTO_OUTRO, '  Açaí  '), 'Açaí');
  assert.equal(segmentoDoChip(SEGMENTO_OUTRO, ''), '');
  assert.equal(segmentoDoChip(null, ''), '');
});

test('chipDoSegmento: segmento salvo volta para o chip certo, texto livre vira "Outro"', () => {
  assert.equal(chipDoSegmento('Marmitas'), 'Marmitas');
  assert.equal(chipDoSegmento(' pizzaria '), 'Pizzaria');
  assert.equal(chipDoSegmento('Açaí'), SEGMENTO_OUTRO);
  assert.equal(chipDoSegmento(''), null);
  assert.equal(chipDoSegmento(undefined), null);
});

// ── Rota inicial ─────────────────────────────────────────────────────────

test('chave do flag: perfil_setup_visto', () => {
  assert.equal(CHAVE_PERFIL_SETUP, 'perfil_setup_visto');
});

test('rota: conta nova sem nada → ProfileSetup', () => {
  assert.equal(rotaInicialDoPerfil({ perfil: null, temIngredientes: false, setupVisto: false, precoRapidoVisto: false }), 'ProfileSetup');
  assert.equal(rotaInicialDoPerfil({ perfil: { nome_negocio: '', segmento: '' }, temIngredientes: false, setupVisto: false, precoRapidoVisto: false }), 'ProfileSetup');
  assert.equal(rotaInicialDoPerfil({ perfil: { nome_negocio: '  ', segmento: null }, temIngredientes: false, setupVisto: false, precoRapidoVisto: false }), 'ProfileSetup');
});

test('rota: viu o setup (pulou) → PrecoRapido; e MainTabs se já viu o Preço rápido', () => {
  assert.equal(rotaInicialDoPerfil({ perfil: null, temIngredientes: false, setupVisto: true, precoRapidoVisto: false }), 'PrecoRapido');
  assert.equal(rotaInicialDoPerfil({ perfil: null, temIngredientes: false, setupVisto: true, precoRapidoVisto: true }), 'MainTabs');
});

test('rota: só o segmento escolhido → segue para o Preço rápido', () => {
  assert.equal(rotaInicialDoPerfil({ perfil: { segmento: 'Marmitas' }, temIngredientes: false, setupVisto: false, precoRapidoVisto: false }), 'PrecoRapido');
});

test('rota: conta antiga com nome_negocio → nunca ProfileSetup', () => {
  assert.equal(rotaInicialDoPerfil({ perfil: { nome_negocio: 'Doces da Maria', segmento: '' }, temIngredientes: false, setupVisto: false, precoRapidoVisto: false }), 'PrecoRapido');
  assert.equal(rotaInicialDoPerfil({ perfil: { nome_negocio: 'Doces da Maria', segmento: '' }, temIngredientes: false, setupVisto: false, precoRapidoVisto: true }), 'MainTabs');
});

test('rota: já tem ingrediente → MainTabs, mesmo sem perfil e sem flag', () => {
  assert.equal(rotaInicialDoPerfil({ perfil: null, temIngredientes: true, setupVisto: false, precoRapidoVisto: false }), 'MainTabs');
  assert.equal(rotaInicialDoPerfil({ perfil: { segmento: 'Pizzaria' }, temIngredientes: true, setupVisto: false, precoRapidoVisto: false }), 'MainTabs');
});
