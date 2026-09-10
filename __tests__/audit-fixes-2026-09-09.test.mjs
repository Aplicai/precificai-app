/**
 * Regressão das correções da auditoria de fórmulas 2026-09-09
 * (docs/AUDIT-FORMULAS-2026-09-09.md — bugs B1, B2, B3, B5).
 *
 * Todos os valores esperados foram calculados à mão (conta no comentário).
 * Lógica que só existe dentro de telas (React Native) é REPLICADA aqui com o
 * `arquivo:função` de origem — ao mudar a tela, espelhar a réplica.
 *
 * Rodar: npm test  (ou node --import ./__tests__/loader.mjs --test __tests__/audit-fixes-2026-09-09.test.mjs)
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';

register('./audit-loader.mjs', import.meta.url);

const calc = await import('../src/utils/calculations.js');
const dp = await import('../src/utils/deliveryPricing.js');
const cascade = await import('../src/services/cascadeRecalc.js');
const { resolveCustoUnitarioItemCombo } = await import('../src/utils/comboPricing.js');

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const r2 = (n) => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────────────
// fakeDb mínimo (mesmo contrato de audit-formulas-2026-09-09.test.mjs)
// `opts.semTabelaEmbalagens` simula DB legado sem `preparo_embalagens`.
// ─────────────────────────────────────────────────────────────────────
function fakeDb(state, opts = {}) {
  const findId = (arr, id) => (arr || []).find(r => r.id === id) || null;
  return {
    updates: [],
    async getFirstAsync(sql, params = []) {
      if (sql.includes('FROM preparos WHERE id')) return findId(state.preparos, params[0]);
      if (sql.includes('FROM produtos WHERE id')) return findId(state.produtos, params[0]);
      if (sql.includes('FROM delivery_combos WHERE id')) return findId(state.combos, params[0]);
      if (sql.includes('FROM materias_primas WHERE id')) return findId(state.materias, params[0]);
      if (sql.includes('FROM embalagens WHERE id')) return findId(state.embalagens, params[0]);
      throw new Error('fakeDb.getFirstAsync: ' + sql);
    },
    async getAllAsync(sql, params = []) {
      if (sql.includes('FROM preparo_ingredientes pi JOIN materias_primas')) {
        return (state.preparoIngs || []).filter(r => r.preparo_id === params[0]).map(r => {
          const mp = findId(state.materias, r.materia_prima_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_por_kg: mp.preco_por_kg, unidade_medida: mp.unidade_medida };
        });
      }
      if (sql.includes('FROM preparo_subpreparos ps JOIN preparos')) {
        return (state.subpreparos || []).filter(r => r.preparo_id === params[0]).map(r => {
          const pr = findId(state.preparos, r.sub_preparo_id);
          return { quantidade_utilizada: r.quantidade_utilizada, custo_por_kg: pr.custo_por_kg, unidade_medida: pr.unidade_medida };
        });
      }
      if (sql.includes('FROM preparo_embalagens')) {
        if (opts.semTabelaEmbalagens) throw new Error('no such table: preparo_embalagens');
        return (state.preparoEmbs || []).filter(r => r.preparo_id === params[0]).map(r => {
          const e = findId(state.embalagens, r.embalagem_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_unitario: e.preco_unitario };
        });
      }
      if (sql.includes('FROM produto_ingredientes pi JOIN')) {
        return (state.produtoIngs || []).filter(r => r.produto_id === params[0]).map(r => {
          const mp = findId(state.materias, r.materia_prima_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_por_kg: mp.preco_por_kg, unidade_medida: mp.unidade_medida };
        });
      }
      if (sql.includes('FROM produto_preparos pp JOIN')) return [];
      if (sql.includes('FROM produto_embalagens pe JOIN')) {
        return (state.produtoEmbs || []).filter(r => r.produto_id === params[0]).map(r => {
          const e = findId(state.embalagens, r.embalagem_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_unitario: e.preco_unitario };
        });
      }
      if (sql.includes('FROM delivery_combo_itens')) return (state.comboItens || []).filter(r => r.combo_id === params[0]);
      throw new Error('fakeDb.getAllAsync: ' + sql);
    },
    async runAsync(sql, params = []) {
      this.updates.push({ sql, params });
      if (sql.startsWith('UPDATE preparos SET custo_por_kg')) {
        const p = findId(state.preparos, params[1]);
        if (p) p.custo_por_kg = params[0];
      }
      return { changes: 1 };
    },
  };
}

// ═════════════════════════════════════════════════════════════════════
// B2 — unidade NATIVA de insumo/receita dentro de combo (cascadeRecalc)
// ═════════════════════════════════════════════════════════════════════
test('B2 cascade.recalcularCombo — kg, L, un, g e embalagem na unidade nativa: 5 + 1,20 + 2 + 8 + 1 = 17,20', async () => {
  const state = {
    materias: [
      { id: 1, preco_por_kg: 5, unidade_medida: 'kg' },   // farinha R$ 5/kg
      { id: 2, preco_por_kg: 0.4, unidade_medida: 'un' }, // ovo R$ 0,40/un
      { id: 3, preco_por_kg: 10, unidade_medida: 'g' },   // açúcar R$ 10/kg, cadastrado em g
    ],
    preparos: [{ id: 20, rendimento_total: 1, unidade_medida: 'L', custo_por_kg: 8 }], // calda R$ 8/L
    embalagens: [{ id: 7, preco_unitario: 0.5 }],
    combos: [{ id: 5 }],
    comboItens: [
      { combo_id: 5, tipo: 'materia_prima', item_id: 1, quantidade: 1 },   // 1 kg   → 5,00
      { combo_id: 5, tipo: 'materia_prima', item_id: 2, quantidade: 3 },   // 3 un   → 1,20
      { combo_id: 5, tipo: 'materia_prima', item_id: 3, quantidade: 200 }, // 200 g  → 10 × 200/1000 = 2,00
      { combo_id: 5, tipo: 'preparo', item_id: 20, quantidade: 1 },        // 1 L    → 8,00
      { combo_id: 5, tipo: 'embalagem', item_id: 7, quantidade: 2 },       // 2 un   → 1,00
    ],
  };
  const r = await cascade.recalcularCombo(fakeDb(state), 5);
  assert.ok(close(r.custo, 17.2), `custo ${r.custo} ≠ 17,20`);

  // Mesmo número que o modal / lista de combos (resolveCustoUnitarioItemCombo × qtd)
  const viaModal =
    resolveCustoUnitarioItemCombo('materia_prima', state.materias[0]).custo * 1 +
    resolveCustoUnitarioItemCombo('materia_prima', state.materias[1]).custo * 3 +
    resolveCustoUnitarioItemCombo('materia_prima', state.materias[2]).custo * 200 +
    resolveCustoUnitarioItemCombo('preparo', state.preparos[0]).custo * 1 +
    resolveCustoUnitarioItemCombo('embalagem', state.embalagens[0]).custo * 2;
  assert.ok(close(r.custo, viaModal), `cascade ${r.custo} ≠ modal ${viaModal}`);
});

test('B2 cascade.recalcularCombo — quantidade fracionária em kg: 0,5 kg × R$ 5/kg = 2,50 (não 0,0025)', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 5, unidade_medida: 'kg' }],
    combos: [{ id: 5 }],
    comboItens: [{ combo_id: 5, tipo: 'materia_prima', item_id: 1, quantidade: 0.5 }],
  };
  const r = await cascade.recalcularCombo(fakeDb(state), 5);
  assert.ok(close(r.custo, 2.5), `custo ${r.custo}`);
});

test('B2 cascade.recalcularCombo — item apontando pra insumo/receita inexistente soma 0 (não NaN)', async () => {
  const state = {
    materias: [],
    preparos: [],
    combos: [{ id: 5 }],
    comboItens: [
      { combo_id: 5, tipo: 'materia_prima', item_id: 99, quantidade: 1 },
      { combo_id: 5, tipo: 'preparo', item_id: 99, quantidade: 1 },
    ],
  };
  const r = await cascade.recalcularCombo(fakeDb(state), 5);
  assert.equal(r.custo, 0);
});

// ═════════════════════════════════════════════════════════════════════
// B1 — embalagem da receita base entra no custo (cascade + form)
// ═════════════════════════════════════════════════════════════════════
test('B1 cascade.recalcularPreparo — 500 g × R$ 10/kg + 1 pote R$ 1,50 = R$ 6,50; rende 1000 g → R$ 6,50/kg', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
    embalagens: [{ id: 7, preco_unitario: 1.5 }],
    preparos: [{ id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
    preparoEmbs: [{ preparo_id: 10, embalagem_id: 7, quantidade_utilizada: 1 }],
  };
  const db = fakeDb(state);
  const r = await cascade.recalcularPreparo(db, 10);
  assert.ok(close(r.custoTotal, 6.5), `custoTotal ${r.custoTotal}`);
  assert.ok(close(r.custoPorKg, 6.5), `custoPorKg ${r.custoPorKg}`);
  // persistiu o custo/kg COM embalagem
  assert.ok(close(state.preparos[0].custo_por_kg, 6.5));
});

test('B1 cascade.recalcularPreparo — 2 potes (R$ 1,50) + sub-receita; rende 500 g → custo/kg = 2× o total', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
    embalagens: [{ id: 7, preco_unitario: 1.5 }],
    preparos: [
      { id: 10, rendimento_total: 500, unidade_medida: 'g', custo_por_kg: 0 },
      { id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 20 }, // recheio R$ 20/kg
    ],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }], // 5,00
    subpreparos: [{ preparo_id: 10, sub_preparo_id: 20, quantidade_utilizada: 100 }],  // 100 g × 20/kg = 2,00
    preparoEmbs: [{ preparo_id: 10, embalagem_id: 7, quantidade_utilizada: 2 }],       // 3,00
  };
  const r = await cascade.recalcularPreparo(fakeDb(state), 10);
  assert.ok(close(r.custoTotal, 10), `custoTotal ${r.custoTotal}`);      // 5 + 2 + 3
  assert.ok(close(r.custoPorKg, 20), `custoPorKg ${r.custoPorKg}`);      // 10 / 500 g × 1000
});

test('B1 cascade.recalcularPreparo — DB legado SEM tabela preparo_embalagens: ignora silenciosamente (custo só dos insumos)', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
    preparos: [{ id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
  };
  const r = await cascade.recalcularPreparo(fakeDb(state, { semTabelaEmbalagens: true }), 10);
  assert.ok(close(r.custoTotal, 5));
});

// Réplica de PreparoFormScreen.js `calcCustoEmbalagensPreparo` (custoTotal do form
// e do autosave): Σ preco_unitario × quantidade_utilizada; qtd vazia/0 conta como 1
// (mesma regra da linha exibida na lista de embalagens do form).
function calcCustoEmbalagensPreparo(lista) {
  return (lista || []).reduce((acc, pe) => {
    const preco = Number(pe?.preco_unitario) || 0;
    const qtd = Number(pe?.quantidade_utilizada) || 1;
    const v = preco * qtd;
    return acc + (Number.isFinite(v) ? v : 0);
  }, 0);
}

test('B1 PreparoFormScreen (réplica) — embalagens: 1,50×1 + 0,20×4 + 2,00×"" (=1) = 4,30; form e cascade batem', async () => {
  const embs = [
    { preco_unitario: 1.5, quantidade_utilizada: 1 },
    { preco_unitario: 0.2, quantidade_utilizada: 4 },
    { preco_unitario: 2, quantidade_utilizada: '' },
  ];
  assert.ok(close(calcCustoEmbalagensPreparo(embs), 4.3));
  assert.equal(calcCustoEmbalagensPreparo([]), 0);

  // Form: custoTotal = insumos + sub-receitas + embalagens (PreparoFormScreen custoTotal)
  const custoInsumos = calc.calcCustoIngrediente(10, 500, 'g', 'g'); // 5,00
  const formTotal = custoInsumos + 0 + calcCustoEmbalagensPreparo([{ preco_unitario: 1.5, quantidade_utilizada: 1 }]);
  const state = {
    materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
    embalagens: [{ id: 7, preco_unitario: 1.5 }],
    preparos: [{ id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
    preparoEmbs: [{ preparo_id: 10, embalagem_id: 7, quantidade_utilizada: 1 }],
  };
  const r = await cascade.recalcularPreparo(fakeDb(state), 10);
  assert.ok(close(formTotal, 6.5));
  assert.ok(close(r.custoTotal, formTotal), `cascade ${r.custoTotal} ≠ form ${formTotal}`);
  assert.ok(close(calc.calcCustoPorKgPreparo(formTotal, 1000, 'g'), r.custoPorKg));
});

// ═════════════════════════════════════════════════════════════════════
// B3 — Matriz BCG: custo do combo por TIPO de item
// ═════════════════════════════════════════════════════════════════════
// Réplica de MatrizBCGScreen.js `custoItemCombo`: resolve o registro pelo tipo
// (produto → mapa de produtos; delivery_produto → custo do produto delivery;
// insumo/embalagem/receita → catálogo próprio) e usa resolveCustoUnitarioItemCombo.
// `quantidade` vazia conta como 1.
function bcgCustoCombo(itens, { prodMap, dpCostMap, mpMap, embMap, prepMap, addMap }) {
  const custoItem = (item) => {
    const qt = calc.safeNum(item.quantidade || 1);
    let dados = null;
    if (item.tipo === 'produto') dados = prodMap[item.item_id];
    else if (item.tipo === 'delivery_produto') dados = dpCostMap[item.item_id];
    else if (item.tipo === 'materia_prima') dados = mpMap[item.item_id];
    else if (item.tipo === 'embalagem') dados = embMap[item.item_id];
    else if (item.tipo === 'preparo') dados = prepMap[item.item_id];
    else if (item.tipo === 'adicional') {
      const add = addMap[item.item_id];
      return add ? calc.safeNum(add.custo) * qt : 0;
    }
    return dados ? calc.safeNum(resolveCustoUnitarioItemCombo(item.tipo, dados).custo) * qt : 0;
  };
  return itens.reduce((a, it) => a + custoItem(it), 0);
}

test('B3 MatrizBCG (réplica) — ids colidindo entre tabelas: 4,13 + 0,50 + 2,50 + 8 + 6 + 1,00 = 22,13 (não herda custo do produto)', () => {
  const maps = {
    prodMap: { 3: { custoUnitario: 12.0 }, 7: { custoUnitario: 4.13 } },
    dpCostMap: { 7: { custoUnitario: 6 } },
    mpMap: { 7: { preco_por_kg: 5, unidade_medida: 'kg' } },
    embMap: { 3: { preco_unitario: 0.5 } },
    prepMap: { 3: { custo_por_kg: 8, unidade_medida: 'L' } },
    addMap: { 3: { custo: 1 } },
  };
  const itens = [
    { tipo: 'produto', item_id: 7, quantidade: 1 },          // 4,13
    { tipo: 'embalagem', item_id: 3, quantidade: 1 },        // 0,50 (NÃO 12,00 do produto 3)
    { tipo: 'materia_prima', item_id: 7, quantidade: 0.5 },  // 0,5 kg × 5 = 2,50 (NÃO 4,13 do produto 7)
    { tipo: 'preparo', item_id: 3 },                         // qtd vazia = 1 L × 8 = 8,00
    { tipo: 'delivery_produto', item_id: 7, quantidade: 1 }, // 6,00
    { tipo: 'adicional', item_id: 3, quantidade: 1 },        // 1,00
  ];
  const custo = bcgCustoCombo(itens, maps);
  assert.ok(close(custo, 22.13), `custo ${custo}`);

  // Regra anterior (prodCostMap[item_id] pra tudo) daria 4,13 + 12 + 4,13×0,5 + 12 + 4,13 + 12 = 46,325
  const antigo = itens.reduce((a, it) => a + calc.safeNum(maps.prodMap[it.item_id]?.custoUnitario) * calc.safeNum(it.quantidade || 1), 0);
  assert.ok(close(antigo, 46.325));
  assert.ok(!close(custo, antigo));
});

test('B3 MatrizBCG (réplica) — item de tipo desconhecido ou id inexistente soma 0; margem do combo usa o custo certo', () => {
  const maps = { prodMap: { 7: { custoUnitario: 4.13 } }, dpCostMap: {}, mpMap: {}, embMap: {}, prepMap: {}, addMap: {} };
  const itens = [
    { tipo: 'produto', item_id: 7, quantidade: 2 },   // 8,26
    { tipo: 'embalagem', item_id: 99, quantidade: 1 }, // inexistente → 0
    { tipo: 'xyz', item_id: 7, quantidade: 1 },        // desconhecido → 0
  ];
  const custo = bcgCustoCombo(itens, maps);
  assert.ok(close(custo, 8.26));
  // margem BRUTA (MatrizBCGScreen): (preço − custo)/preço × 100 → combo a R$ 20: 58,7%
  assert.equal(r2(((20 - custo) / 20) * 100), 58.7);
});

// ═════════════════════════════════════════════════════════════════════
// B5 — DeliveryPrecosScreen: "Sugerido" = mesmo lucro líquido em R$ do balcão
// ═════════════════════════════════════════════════════════════════════
const PROD = {
  cmv: 4.13,
  precoBalcao: 25,
  contexto: { lucroPerc: 0.15, fixoPerc: 0.2278, impostoPerc: 0, variavelPerc: 0.115, margemSegurancaPerc: 0.05 },
  plat: { id: 1, plataforma: 'iFood', taxa_plataforma: 12, comissao_app: 3.2, outros_perc: 0, desconto_promocao: 0, embalagem_extra: 0, taxa_entrega: 0, ativo: 1 },
};

// Réplica de DeliveryPrecosScreen.js `calcLucroLiquidoBalcao` (= DeliveryHubScreen loadSim):
// preço − CMV − preço × (fixo% + variável%), nunca negativo.
function calcLucroLiquidoBalcao(precoBalcao, cmv, contexto) {
  const preco = calc.safeNum(precoBalcao);
  if (preco <= 0) return 0;
  const perc = calc.safeNum(contexto?.fixoPerc) + calc.safeNum(contexto?.variavelPerc);
  return Math.max(0, preco - calc.safeNum(cmv) - preco * perc);
}

// Réplica de DeliveryPrecosScreen.js `calcSugestaoLinha`.
function calcSugestaoLinha(item, plat, contexto) {
  const cmv = calc.safeNum(item?.custoUnitario);
  const precoBalcao = calc.safeNum(item?.precoVenda);
  if (cmv <= 0) return { preco: null, modo: 'nenhum', lucroAlvo: 0 };
  const lucroAlvo = calcLucroLiquidoBalcao(precoBalcao, cmv, contexto);
  if (precoBalcao > 0 && lucroAlvo > 0) {
    const r = dp.calcPrecoMesmoLucroReais({ cmv, lucroAlvoReais: lucroAlvo, plat, contexto });
    const ok = r && !r.inviavel && Number.isFinite(r.preco) && r.preco > 0;
    return { preco: ok ? r.preco : null, modo: 'mesmo_lucro', lucroAlvo };
  }
  const r = dp.calcSugestaoDeliveryCompleta({ cmv, plat, contexto });
  return { preco: r?.preco > 0 ? r.preco : null, modo: 'margem', lucroAlvo: 0 };
}

test('B5 lucro líquido do balcão = 25 − 4,13 − 25 × (0,2278 + 0,115) = 12,30; prejuízo → 0; sem preço → 0', () => {
  assert.equal(r2(calcLucroLiquidoBalcao(25, 4.13, PROD.contexto)), 12.3);
  assert.equal(calcLucroLiquidoBalcao(5, 4.13, PROD.contexto), 0); // 5 − 4,13 − 1,71 < 0
  assert.equal(calcLucroLiquidoBalcao(0, 4.13, PROD.contexto), 0);
});

test('B5 sugerido da tela Preços = (12,30 + 4,13) / (1 − 0,2278 − 0,152) = 26,49 — o MESMO da Visão Geral (calcPrecoMesmoLucroReais)', () => {
  const item = { custoUnitario: PROD.cmv, precoVenda: PROD.precoBalcao };
  const s = calcSugestaoLinha(item, PROD.plat, PROD.contexto);
  assert.equal(s.modo, 'mesmo_lucro');
  assert.equal(r2(s.lucroAlvo), 12.3);
  assert.equal(r2(s.preco), 26.49);
  assert.ok(close(s.preco, 16.43 / 0.6202, 1e-4));

  // Visão Geral / popup do Hub (DeliveryHubScreen:390-394) — mesma função, mesmo número
  const hub = dp.calcPrecoMesmoLucroReais({ cmv: PROD.cmv, lucroAlvoReais: 12.3, plat: PROD.plat, contexto: PROD.contexto });
  assert.ok(close(s.preco, hub.preco));

  // Round-trip: com esse preço sobra exatamente o lucro do balcão
  const sobra = s.preco - PROD.cmv - s.preco * (PROD.contexto.fixoPerc + 0 + 0.152);
  assert.equal(r2(sobra), 12.3);

  // Antes (calcSugestaoDeliveryCompleta, lucro 15% sobre o preço) dava 9,22 — abaixo do balcão
  const antigo = dp.calcSugestaoDeliveryCompleta({ cmv: PROD.cmv, plat: PROD.plat, contexto: PROD.contexto });
  assert.equal(r2(antigo.preco), 9.22);
  assert.ok(s.preco > PROD.precoBalcao && antigo.preco < PROD.precoBalcao);
});

test('B5 fallback — sem preço de balcão (ou balcão no prejuízo) usa a margem % (calcSugestaoDeliveryCompleta) e rotula "margem"', () => {
  const semBalcao = calcSugestaoLinha({ custoUnitario: PROD.cmv, precoVenda: 0 }, PROD.plat, PROD.contexto);
  assert.equal(semBalcao.modo, 'margem');
  assert.equal(r2(semBalcao.preco), 9.22);

  const prejuizo = calcSugestaoLinha({ custoUnitario: PROD.cmv, precoVenda: 5 }, PROD.plat, PROD.contexto);
  assert.equal(prejuizo.modo, 'margem');
  assert.equal(r2(prejuizo.preco), 9.22);

  const semCmv = calcSugestaoLinha({ custoUnitario: 0, precoVenda: 25 }, PROD.plat, PROD.contexto);
  assert.equal(semCmv.modo, 'nenhum');
  assert.equal(semCmv.preco, null);
});

test('B5 plataforma cara (fixos + variáveis ≥ 100%) → inviável: sugerido null, sem NaN/Infinity', () => {
  const platCara = { ...PROD.plat, taxa_plataforma: 80 };
  const s = calcSugestaoLinha({ custoUnitario: PROD.cmv, precoVenda: 25 }, platCara, PROD.contexto);
  assert.equal(s.modo, 'mesmo_lucro');
  assert.equal(s.preco, null);
});
