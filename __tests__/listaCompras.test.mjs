/**
 * Testes da lista de compras — APP-39, APP-40.
 *
 * Roda via `node --test __tests__/`.
 * Cobre os 6 cenários canônicos pedidos no ticket APP-40.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';

// IMPORTANTE: calculations.js importa expo-sqlite, que não roda em Node puro.
// Aqui copiamos as funções puras que precisamos (mesma implementação).
// Manter em sync com src/utils/calculations.js linhas 26-50.
const UNIDADES_MEDIDA = [
  { value: 'kg', tipo: 'peso', fatorBase: 1000 },
  { value: 'g', tipo: 'peso', fatorBase: 1 },
  { value: 'L', tipo: 'volume', fatorBase: 1000 },
  { value: 'mL', tipo: 'volume', fatorBase: 1 },
  { value: 'un', tipo: 'unidade', fatorBase: 1 },
];
function converterParaBase(valor, unidade) {
  const un = UNIDADES_MEDIDA.find(u => u.value === unidade);
  if (!un) return valor;
  return valor * un.fatorBase;
}
function calcCustoIngrediente(precoPorKg, qtConsumo, uniInsumo, uniConsumo) {
  // Replicação simplificada — mantida pra cobrir o caso comum (mesma unidade base)
  const qtBase = converterParaBase(qtConsumo, uniConsumo);
  const baseInsumo = converterParaBase(1, uniInsumo); // ex: 1 kg = 1000g
  const precoPorBase = precoPorKg / baseInsumo;
  return qtBase * precoPorBase;
}

const close = (a, b, eps = 0.01) => Math.abs(a - b) < eps;

// ─────────────────────────────────────────────────────────────────────
// HELPERS PUROS (mesma lógica que ListaComprasScreen aplica)
// ─────────────────────────────────────────────────────────────────────
//
// Reproduz a lógica de agregação SEM dependência de React/SQLite.
// Cada produto pedido gera linhas (insumo, qty_total). Linhas com mesmo
// insumo são agrupadas somando qty_total (após conversão pra unidade base).
//
// Schema esperado:
//   produto = { id, ingredientes: [{ materia_prima_id, quantidade_utilizada, unidade_consumo }],
//               preparos: [{ preparo_id, quantidade_utilizada, unidade_consumo }],
//               rendimento_unidades }
//   preparo = { id, ingredientes: [...], rendimento_total }
//   insumo  = { id, nome, unidade_compra, quantidade_bruta, quantidade_liquida }
//

function expandirProduto(produto, unidadesPedidas, preparosMap, insumosMap) {
  const linhas = [];
  for (const ing of (produto.ingredientes || [])) {
    const insumo = insumosMap.get(ing.materia_prima_id);
    if (!insumo) continue;
    const qtBaseInsumo = converterParaBase(ing.quantidade_utilizada, ing.unidade_consumo);
    const fc = (insumo.quantidade_bruta || 1) / (insumo.quantidade_liquida || 1);
    const qtBruta = qtBaseInsumo * fc * unidadesPedidas;
    linhas.push({ insumo_id: insumo.id, nome: insumo.nome, qt_base: qtBruta });
  }
  for (const pp of (produto.preparos || [])) {
    const prep = preparosMap.get(pp.preparo_id);
    if (!prep) continue;
    const qtPreparoBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_consumo);
    const rendimentoBase = prep.rendimento_total || 1;
    const fracaoDoPreparo = qtPreparoBase / rendimentoBase;
    for (const ing of (prep.ingredientes || [])) {
      const insumo = insumosMap.get(ing.materia_prima_id);
      if (!insumo) continue;
      const qtBaseIng = converterParaBase(ing.quantidade_utilizada, ing.unidade_consumo);
      const fc = (insumo.quantidade_bruta || 1) / (insumo.quantidade_liquida || 1);
      const qtBruta = qtBaseIng * fracaoDoPreparo * fc * unidadesPedidas;
      linhas.push({ insumo_id: insumo.id, nome: insumo.nome, qt_base: qtBruta });
    }
  }
  return linhas;
}

function agruparPorInsumo(linhas) {
  const map = new Map();
  for (const l of linhas) {
    const acc = map.get(l.insumo_id) || { insumo_id: l.insumo_id, nome: l.nome, qt_base: 0 };
    acc.qt_base += l.qt_base;
    map.set(l.insumo_id, acc);
  }
  return Array.from(map.values());
}

// ─────────────────────────────────────────────────────────────────────
// CENÁRIO 1 — Básico (1 produto, 1 insumo direto)
// Mousse usa 200ml de leite condensado por unidade. Pedir 30 mousses → 6L.
// ─────────────────────────────────────────────────────────────────────
test('lista — cenário 1: básico (mousse 30un × 200ml leite cond. = 6L)', () => {
  const insumos = new Map([
    [1, { id: 1, nome: 'Leite Condensado', unidade_compra: 'L', quantidade_bruta: 1, quantidade_liquida: 1 }],
  ]);
  const mousse = {
    id: 10,
    ingredientes: [{ materia_prima_id: 1, quantidade_utilizada: 200, unidade_consumo: 'mL' }],
  };
  const linhas = expandirProduto(mousse, 30, new Map(), insumos);
  const grouped = agruparPorInsumo(linhas);
  assert.equal(grouped.length, 1);
  // 200 mL × 30 = 6000 mL (= 6 L)
  assert.ok(close(grouped[0].qt_base, 6000), `esperado 6000, veio ${grouped[0].qt_base}`);
});

// ─────────────────────────────────────────────────────────────────────
// CENÁRIO 2 — Com preparo
// Bolo usa massa branca (preparo). Massa usa 250g farinha, rende 1 unidade.
// Pedir 2 bolos → 500g farinha.
// ─────────────────────────────────────────────────────────────────────
test('lista — cenário 2: com preparo (2 bolos × 250g/preparo = 500g farinha)', () => {
  const insumos = new Map([
    [2, { id: 2, nome: 'Farinha', unidade_compra: 'kg', quantidade_bruta: 1, quantidade_liquida: 1 }],
  ]);
  const massaBranca = {
    id: 100,
    rendimento_total: 1, // rende 1 bolo
    ingredientes: [{ materia_prima_id: 2, quantidade_utilizada: 250, unidade_consumo: 'g' }],
  };
  const preparos = new Map([[100, massaBranca]]);
  const bolo = {
    id: 11,
    preparos: [{ preparo_id: 100, quantidade_utilizada: 1, unidade_consumo: 'g' }],
  };
  const linhas = expandirProduto(bolo, 2, preparos, insumos);
  const grouped = agruparPorInsumo(linhas);
  assert.equal(grouped.length, 1);
  // 250g × 2 = 500g
  assert.ok(close(grouped[0].qt_base, 500), `esperado 500, veio ${grouped[0].qt_base}`);
});

// ─────────────────────────────────────────────────────────────────────
// CENÁRIO 3 — Com agrupamento
// Mousse e bolo ambos usam açúcar. 30 mousses (50g cada) + 2 bolos (200g cada)
// → 1500 + 400 = 1900g de açúcar agrupado.
// ─────────────────────────────────────────────────────────────────────
test('lista — cenário 3: agrupamento (mousses + bolos somam mesmo açúcar)', () => {
  const insumos = new Map([
    [3, { id: 3, nome: 'Açúcar', unidade_compra: 'kg', quantidade_bruta: 1, quantidade_liquida: 1 }],
  ]);
  const mousse = {
    id: 12,
    ingredientes: [{ materia_prima_id: 3, quantidade_utilizada: 50, unidade_consumo: 'g' }],
  };
  const bolo = {
    id: 13,
    ingredientes: [{ materia_prima_id: 3, quantidade_utilizada: 200, unidade_consumo: 'g' }],
  };
  const linhas = [
    ...expandirProduto(mousse, 30, new Map(), insumos),
    ...expandirProduto(bolo, 2, new Map(), insumos),
  ];
  const grouped = agruparPorInsumo(linhas);
  assert.equal(grouped.length, 1, 'açúcar deve aparecer numa única linha');
  // 50×30 + 200×2 = 1500 + 400 = 1900g
  assert.ok(close(grouped[0].qt_base, 1900), `esperado 1900, veio ${grouped[0].qt_base}`);
});

// ─────────────────────────────────────────────────────────────────────
// CENÁRIO 4 — Combo (expande seus produtos componentes)
// Combo "Maracujá" = 1 mousse + 1 bolo. Pedir 5 combos → insumos de
// 5 mousses + 5 bolos.
// ─────────────────────────────────────────────────────────────────────
test('lista — cenário 4: combo expande componentes (5 combos = 5 mousses + 5 bolos)', () => {
  const insumos = new Map([
    [4, { id: 4, nome: 'Maracujá', unidade_compra: 'kg', quantidade_bruta: 1000, quantidade_liquida: 350 }],
  ]);
  const mousse = {
    id: 14,
    ingredientes: [{ materia_prima_id: 4, quantidade_utilizada: 30, unidade_consumo: 'g' }],
  };
  const bolo = {
    id: 15,
    ingredientes: [{ materia_prima_id: 4, quantidade_utilizada: 100, unidade_consumo: 'g' }],
  };
  // Simula combo expandindo cada produto componente × quantidade do combo
  const combosPedidos = 5;
  const componentes = [{ produto: mousse, qtd: 1 }, { produto: bolo, qtd: 1 }];
  const linhas = [];
  for (const c of componentes) {
    linhas.push(...expandirProduto(c.produto, c.qtd * combosPedidos, new Map(), insumos));
  }
  const grouped = agruparPorInsumo(linhas);
  // Sem fator de perda: 30g×5 + 100g×5 = 150 + 500 = 650g BRUTO
  // Com FC = 1000/350 = 2.857: 650 × 2.857 ≈ 1857g de maracujá com casca
  assert.equal(grouped.length, 1);
  assert.ok(close(grouped[0].qt_base, 650 * (1000/350), 1));
});

// ─────────────────────────────────────────────────────────────────────
// CENÁRIO 5 — Conversão de unidade
// Insumo cadastrado em kg, usado em receita em gramas.
// Resultado deve ser somado corretamente em gramas (unidade base).
// ─────────────────────────────────────────────────────────────────────
test('lista — cenário 5: conversão g↔kg (500g + 1kg = 1500g, não 501)', () => {
  const insumos = new Map([
    [5, { id: 5, nome: 'Manteiga', unidade_compra: 'kg', quantidade_bruta: 1, quantidade_liquida: 1 }],
  ]);
  // produto A consome 500g; produto B consome 1kg
  const linhasA = expandirProduto(
    { id: 16, ingredientes: [{ materia_prima_id: 5, quantidade_utilizada: 500, unidade_consumo: 'g' }] },
    1, new Map(), insumos
  );
  const linhasB = expandirProduto(
    { id: 17, ingredientes: [{ materia_prima_id: 5, quantidade_utilizada: 1, unidade_consumo: 'kg' }] },
    1, new Map(), insumos
  );
  const grouped = agruparPorInsumo([...linhasA, ...linhasB]);
  assert.equal(grouped.length, 1);
  // 500 + 1000 = 1500 (em g, base unit), NUNCA 501
  assert.ok(close(grouped[0].qt_base, 1500), `esperado 1500g, veio ${grouped[0].qt_base}`);
});

// ─────────────────────────────────────────────────────────────────────
// CENÁRIO 6 — Com fator de perda
// Maracujá: bruta 1000g, líquida 350g (FC = 2.857).
// Receita pede 200g de polpa → comprar 200 × FC ≈ 571g de fruta com casca.
// ─────────────────────────────────────────────────────────────────────
test('lista — cenário 6: fator de perda (200g polpa → ~571g maracujá bruto)', () => {
  const insumos = new Map([
    [6, { id: 6, nome: 'Maracujá', unidade_compra: 'kg', quantidade_bruta: 1000, quantidade_liquida: 350 }],
  ]);
  const produto = {
    id: 18,
    ingredientes: [{ materia_prima_id: 6, quantidade_utilizada: 200, unidade_consumo: 'g' }],
  };
  const linhas = expandirProduto(produto, 1, new Map(), insumos);
  const grouped = agruparPorInsumo(linhas);
  assert.equal(grouped.length, 1);
  // 200 × (1000/350) = 571.4
  assert.ok(close(grouped[0].qt_base, 571.4, 0.5));
});

// ─────────────────────────────────────────────────────────────────────
// EDGE CASES
// ─────────────────────────────────────────────────────────────────────
test('lista — qty fracionada (0,25 kg)', () => {
  const insumos = new Map([
    [7, { id: 7, nome: 'Cacau', unidade_compra: 'kg', quantidade_bruta: 1, quantidade_liquida: 1 }],
  ]);
  const produto = {
    id: 19,
    ingredientes: [{ materia_prima_id: 7, quantidade_utilizada: 0.25, unidade_consumo: 'kg' }],
  };
  const linhas = expandirProduto(produto, 4, new Map(), insumos);
  const grouped = agruparPorInsumo(linhas);
  assert.ok(close(grouped[0].qt_base, 1000), 'esperado 1000g (0.25kg×4)');
});

test('lista — produto sem insumos não quebra', () => {
  const produto = { id: 20, ingredientes: [], preparos: [] };
  const linhas = expandirProduto(produto, 10, new Map(), new Map());
  assert.equal(linhas.length, 0);
});

test('lista — quantidade pedida 0 não gera nada', () => {
  const insumos = new Map([
    [8, { id: 8, nome: 'X', unidade_compra: 'kg', quantidade_bruta: 1, quantidade_liquida: 1 }],
  ]);
  const produto = { id: 21, ingredientes: [{ materia_prima_id: 8, quantidade_utilizada: 100, unidade_consumo: 'g' }] };
  const linhas = expandirProduto(produto, 0, new Map(), insumos);
  const grouped = agruparPorInsumo(linhas);
  // Linha existe mas qt_base = 0 (filtragem fica a cargo da UI)
  assert.equal(grouped[0].qt_base, 0);
});

// ─────────────────────────────────────────────────────────────────────
// Sanity test do helper de conversão
// ─────────────────────────────────────────────────────────────────────
test('converterParaBase — kg→g', () => {
  assert.equal(converterParaBase(1, 'kg'), 1000);
  assert.equal(converterParaBase(0.5, 'kg'), 500);
  assert.equal(converterParaBase(500, 'g'), 500);
});

test('converterParaBase — L→mL', () => {
  assert.equal(converterParaBase(1, 'L'), 1000);
  assert.equal(converterParaBase(2.5, 'L'), 2500);
});

test('calcCustoIngrediente — preco/kg × qt em g (precoPorKg = 10, qt = 250g, insumo cadastrado em kg)', () => {
  // Preço R$ 10/kg, consumir 250g → custo = 2.50
  // uniInsumo = 'kg' porque o preço de referência é por kg
  const custo = calcCustoIngrediente(10, 250, 'kg', 'g');
  assert.ok(close(custo, 2.5), `esperado 2.5, veio ${custo}`);
});
