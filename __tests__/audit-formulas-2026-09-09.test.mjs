/**
 * AUDITORIA DE FÓRMULAS — 2026-09-09 (ver docs/AUDIT-FORMULAS-2026-09-09.md)
 *
 * Verifica, ponta a ponta e com valores calculados à mão, cada fórmula que o
 * usuário vê: ingrediente → receita base → produto → preço sugerido → delivery
 * → combo → ranking → Home → Relatórios → Lista de Compras → DRE.
 *
 * Convenções:
 *  - Funções puras são importadas de verdade de `src/` (via audit-loader.mjs).
 *  - Lógica que só existe dentro de screens (React Native) é REPLICADA aqui,
 *    sempre com o `file:linha` de origem no comentário. Ao corrigir a tela,
 *    atualize a réplica.
 *  - Testes marcados `// BUG:` afirmam o valor CORRETO e FALHAM hoje de
 *    propósito — são a prova reproduzível de cada bug do relatório. Quando o
 *    bug for corrigido, o teste passa sem mudar o esperado.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/audit-formulas-2026-09-09.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';

register('./audit-loader.mjs', import.meta.url);

const calc = await import('../src/utils/calculations.js');
const precif = await import('../src/utils/precificacao.js');
const dp = await import('../src/utils/deliveryPricing.js');
const da = await import('../src/utils/deliveryAdapter.js');
const bcg = await import('../src/utils/bcgClassify.js');
const { calcPontoEquilibrio, calcSobraMes } = await import('../src/utils/breakeven.js');
const cascade = await import('../src/services/cascadeRecalc.js');
const comboPricing = await import('../src/utils/comboPricing.js');

const {
  calcPrecoBase, calcFatorCorrecao, converterParaBase, normalizarUnidade, getTipoUnidade,
  calcCustoIngrediente, calcCustoPreparo, calcCustoPorKgPreparo, calcCustoEmbalagem,
  calcDespesasFixasPercentual, calcMarkup, calcPrecoSugerido, getDivisorRendimento, getTipoVenda,
  calcCMVPercentual, calcMargem, calcMargemLiquida, calcLucroLiquido, formatCurrency, formatPercent,
} = calc;

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;
const r2 = (n) => Math.round(n * 100) / 100;

// ═══════════════════════════════════════════════════════════════════════
// CONTEXTO FINANCEIRO OBSERVADO EM PROD (usado em vários blocos abaixo)
//
// O relatório mostra que os números da tela ("mesmo lucro R$ 26,49 / lucro
// R$ 12,30" e "sugerido R$ 9,22") só fecham com custos fixos = 22,78% (não
// 22,22%), imposto reconhecido = 0% e margem de segurança = 5%. Ver item 4.
// ═══════════════════════════════════════════════════════════════════════
const PROD = {
  cmv: 4.13,
  precoBalcao: 25,
  lucroPerc: 0.15,
  fixoPerc22: 0.2222,   // valor que o Financeiro exibia
  fixoPerc: 0.2278,     // valor que fecha com Home/Relatório/Delivery (2,28 de cada R$ 10)
  variavelPerc: 0.115,
  impostoPerc: 0,       // nenhuma despesa variável com nome de imposto
  margemSegurancaPerc: 0.05,
  plat: { id: 1, plataforma: 'iFood', taxa_plataforma: 12, comissao_app: 3.2, outros_perc: 0, desconto_promocao: 0, embalagem_extra: 0, taxa_entrega: 0, ativo: 1 },
};

// ═══════════════════════════════════════════════════════════════════════
// 1. INGREDIENTE — preço por kg/L/un
// ═══════════════════════════════════════════════════════════════════════
test('1.1 calcPrecoBase — R$ 10 por 500 g = R$ 20/kg; 0,5 kg idem; 250 mL = R$ 40/L; 1 L = R$ 10/L', () => {
  assert.ok(close(calcPrecoBase(10, 500, 'g'), 20));
  assert.ok(close(calcPrecoBase(10, 0.5, 'kg'), 20));
  assert.ok(close(calcPrecoBase(10, 250, 'mL'), 40));
  assert.ok(close(calcPrecoBase(10, 1, 'L'), 10));
  // Bandeja de 30 ovos por R$ 12 → R$ 0,40/un
  assert.ok(close(calcPrecoBase(12, 30, 'un'), 0.4));
});

test('1.2 calcPrecoBase — líquida vazia / 0 / texto → 0 (nunca Infinity/NaN)', () => {
  assert.equal(calcPrecoBase(10, '', 'g'), 0);
  assert.equal(calcPrecoBase(10, 0, 'g'), 0);
  assert.equal(calcPrecoBase(10, null, 'kg'), 0);
  assert.equal(calcPrecoBase(10, 'abc', 'kg'), 0);
  assert.equal(calcPrecoBase('', 500, 'g'), 0);
  // Aceita vírgula PT-BR: "10,50" por "0,5" kg
  assert.ok(close(calcPrecoBase('10,50', '0,5', 'kg'), 21));
});

test('1.3 unidades legadas/variantes — "Grama(s)", "Quilograma(s)", "Litro(s)", "ml", "UN." resolvem para a canônica', () => {
  assert.equal(normalizarUnidade('Grama(s)'), 'g');
  assert.equal(normalizarUnidade('Quilograma(s)'), 'kg');
  assert.equal(normalizarUnidade('Litro(s)'), 'L');
  assert.equal(normalizarUnidade('ml'), 'mL');
  assert.equal(normalizarUnidade('UN.'), 'un');
  assert.equal(normalizarUnidade('Unidades'), 'un');
  // Mesmo preço com grafia legada
  assert.ok(close(calcPrecoBase(10, 500, 'Grama(s)'), calcPrecoBase(10, 500, 'g')));
  assert.ok(close(calcPrecoBase(10, 0.5, 'Quilograma(s)'), 20));
  assert.ok(close(converterParaBase(2, 'Quilograma(s)'), 2000));
  assert.ok(close(converterParaBase(1.5, 'Litro(s)'), 1500));
});

test('1.4 "dz" (dúzia) NÃO é reconhecida → cai em "unidade": R$ 12 por 1 dz vira R$ 12/un (documentado, não é bug de cálculo)', () => {
  assert.equal(normalizarUnidade('dz'), null);
  assert.equal(getTipoUnidade('dz'), 'unidade');
  assert.ok(close(calcPrecoBase(12, 1, 'dz'), 12));   // usuário precisa cadastrar como 12 un
  assert.ok(close(converterParaBase(5, 'dz'), 5));     // passthrough
});

test('1.5 calcFatorCorrecao = líquida / bruta; bruta 0 → 1; líquida > bruta não é travada', () => {
  assert.ok(close(calcFatorCorrecao(1000, 800), 0.8));
  assert.equal(calcFatorCorrecao(0, 800), 1);
  assert.equal(calcFatorCorrecao(1000, 0), 0);
  assert.ok(close(calcFatorCorrecao(800, 1000), 1.25)); // sem clamp — form deveria avisar
  // MateriaPrimaFormScreen:356 — perda% = (1 − liq/bruta) × 100
  assert.ok(close((1 - 800 / 1000) * 100, 20));
  // MateriaPrimaFormScreen:1176 — "custo real é 1/fc x o preço pago"
  assert.ok(close(1 / 0.8, 1.25));
});

test('1.6 cadeia completa: compra 1 kg bruto por R$ 8, aproveita 800 g → R$ 10/kg; usa 250 g → R$ 2,50 (perda aplicada UMA vez)', () => {
  const precoPorKg = calcPrecoBase(8, 800, 'g');
  assert.ok(close(precoPorKg, 10));
  assert.ok(close(calcCustoIngrediente(precoPorKg, 250, 'g', 'g'), 2.5));
  // kg vs g e mL vs L fecham
  assert.ok(close(calcCustoIngrediente(10, 0.25, 'kg', 'kg'), 2.5));
  assert.ok(close(calcCustoIngrediente(4, 200, 'mL', 'mL'), 0.8));
  assert.ok(close(calcCustoIngrediente(4, 0.2, 'L', 'L'), 0.8));
  assert.ok(close(calcCustoIngrediente(0.4, 3, 'un', 'un'), 1.2));
});

// ═══════════════════════════════════════════════════════════════════════
// 2. RECEITA BASE — custo total, custo/kg com rendimento, sub-receitas, cascata
// ═══════════════════════════════════════════════════════════════════════
test('2.1 calcCustoPorKgPreparo — rendimento em kg, g, L, un converte para "por 1000 unidades-base"', () => {
  assert.ok(close(calcCustoPorKgPreparo(20, 2, 'kg'), 10));
  assert.ok(close(calcCustoPorKgPreparo(20, 2000, 'g'), 10));
  assert.ok(close(calcCustoPorKgPreparo(20, 2000, 'Grama(s)'), 10));
  assert.ok(close(calcCustoPorKgPreparo(6, 1.5, 'L'), 4));
  assert.ok(close(calcCustoPorKgPreparo(6, 1500, 'mL'), 4));
  // "por un": custo por 1000 unidades → 10 salgados por R$ 5 = R$ 500 "por kg"
  assert.ok(close(calcCustoPorKgPreparo(5, 10, 'un'), 500));
  assert.ok(close(calcCustoPreparo(500, 1, 'un'), 0.5)); // e volta: 1 un = R$ 0,50
  // rendimento 0 / vazio → 0
  assert.equal(calcCustoPorKgPreparo(20, 0, 'g'), 0);
  assert.equal(calcCustoPorKgPreparo(20, '', 'g'), 0);
});

test('2.2 receita "massa 700 g": 500 g farinha (R$ 5/kg) + 200 g açúcar (R$ 4/kg) → R$ 3,30 total, R$ 4,714/kg; 350 g usados = R$ 1,65', () => {
  const total = calcCustoIngrediente(5, 500, 'g', 'g') + calcCustoIngrediente(4, 200, 'g', 'g');
  assert.ok(close(total, 3.3));
  const custoKg = calcCustoPorKgPreparo(total, 700, 'g');
  assert.ok(close(custoKg, 3.3 / 0.7));
  assert.ok(close(calcCustoPreparo(custoKg, 350, 'g'), 1.65));
});

// Fake DB compartilhado com os testes de cascata (mesmo shape do audit-pricing-engine).
function fakeDb(state) {
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
      if (sql.includes('FROM produto_preparos pp JOIN')) {
        return (state.produtoPreps || []).filter(r => r.produto_id === params[0]).map(r => {
          const pr = findId(state.preparos, r.preparo_id);
          return { quantidade_utilizada: r.quantidade_utilizada, custo_por_kg: pr.custo_por_kg, unidade_medida: pr.unidade_medida };
        });
      }
      if (sql.includes('FROM produto_embalagens pe JOIN')) {
        return (state.produtoEmbs || []).filter(r => r.produto_id === params[0]).map(r => {
          const e = findId(state.embalagens, r.embalagem_id);
          return { quantidade_utilizada: r.quantidade_utilizada, preco_unitario: e.preco_unitario };
        });
      }
      if (sql.includes('FROM delivery_combo_itens')) return (state.comboItens || []).filter(r => r.combo_id === params[0]);
      if (sql.startsWith('SELECT id FROM preparos')) return (state.preparos || []).map(p => ({ id: p.id }));
      if (sql.includes('SELECT id, custo_por_kg FROM preparos')) return (state.preparos || []).map(p => ({ id: p.id, custo_por_kg: p.custo_por_kg }));
      if (sql.includes('SELECT DISTINCT preparo_id FROM preparo_ingredientes')) {
        return (state.preparoIngs || []).filter(r => r.materia_prima_id === params[0]).map(r => ({ preparo_id: r.preparo_id }));
      }
      if (sql.includes('SELECT DISTINCT preparo_id FROM preparo_subpreparos')) {
        return (state.subpreparos || []).filter(r => params.includes(r.sub_preparo_id)).map(r => ({ preparo_id: r.preparo_id }));
      }
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

test('2.3 sub-receita: recheio (R$ 10/kg) 500 g + insumo 300 g a R$ 20/kg dentro de "bolo 1 kg" → R$ 11,00 total = R$ 11/kg', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 20, unidade_medida: 'g' }],
    preparos: [
      { id: 10, rendimento_total: 1, unidade_medida: 'kg', custo_por_kg: 0 },
      { id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 10 },
    ],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 300 }],
    subpreparos: [{ preparo_id: 10, sub_preparo_id: 20, quantidade_utilizada: 500 }],
  };
  const r = await cascade.recalcularPreparo(fakeDb(state), 10);
  assert.ok(close(r.custoTotal, 11));
  assert.ok(close(r.custoPorKg, 11)); // rendimento "1 kg" convertido (não 11.000)
});

test('2.4 cascata: insumo sobe de R$ 20 → R$ 30/kg; recalcularPreparosDoInsumo atualiza o preparo E o pai que o usa como sub-receita', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 20, unidade_medida: 'g' }],
    preparos: [
      { id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }, // 500 g do insumo
      { id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }, // 500 g do preparo 20
    ],
    preparoIngs: [{ preparo_id: 20, materia_prima_id: 1, quantidade_utilizada: 500 }],
    subpreparos: [{ preparo_id: 10, sub_preparo_id: 20, quantidade_utilizada: 500 }],
  };
  const db = fakeDb(state);
  await cascade.recalcularPreparosDoInsumo(db, 1);
  assert.ok(close(state.preparos[0].custo_por_kg, 10)); // 500 g × 20/kg = 10 por 1 kg
  assert.ok(close(state.preparos[1].custo_por_kg, 5));  // 500 g × 10/kg = 5
  state.materias[0].preco_por_kg = 30;
  await cascade.recalcularPreparosDoInsumo(db, 1);
  assert.ok(close(state.preparos[0].custo_por_kg, 15));
  assert.ok(close(state.preparos[1].custo_por_kg, 7.5));
});

test('2.5 embalagem dentro da receita base — PreparoFormScreen:883 diz "O custo entra no total do preparo", mas custoTotal (PreparoFormScreen:317) e cascadeRecalc.recalcularPreparo IGNORAM preparo_embalagens', async () => {
  // Corrigido (auditoria 2026-09-09 [B1]): esperado = insumos + embalagem (R$ 5 + R$ 1,50 = R$ 6,50).
  const state = {
    materias: [{ id: 1, preco_por_kg: 10, unidade_medida: 'g' }],
    embalagens: [{ id: 7, preco_unitario: 1.5 }],
    preparos: [{ id: 10, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 0 }],
    preparoIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
    preparoEmbs: [{ preparo_id: 10, embalagem_id: 7, quantidade_utilizada: 1 }],
  };
  const r = await cascade.recalcularPreparo(fakeDb(state), 10);
  assert.ok(close(r.custoTotal, 6.5), `custoTotal ${r.custoTotal} deveria incluir a embalagem (6,50)`);
});

// ═══════════════════════════════════════════════════════════════════════
// 3. PRODUTO — CMV, unidades, preço sugerido, lucro bruto vs líquido
// ═══════════════════════════════════════════════════════════════════════
test('3.1 CMV = ingredientes + receitas + embalagens; divisor por unidade / por kg / por litro', () => {
  const ing = calcCustoIngrediente(20, 100, 'g', 'g');        // 2,00
  const prep = calcCustoPreparo(4.714285714, 350, 'g');       // 1,65
  const emb = calcCustoEmbalagem(0.12, 4);                    // 0,48
  const total = ing + prep + emb;                             // 4,13
  assert.ok(close(r2(total), 4.13));
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_unidade', rendimento_unidades: 4 }), 4);
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_kg', rendimento_total: 2 }), 2);
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_litro', rendimento_total: 1.5 }), 1.5);
  assert.equal(getTipoVenda({ unidade_rendimento: 'por_kg' }), 'kg');
  // 4 unidades por receita → CMV unitário
  assert.ok(close(r2(total / 4), 1.03));
  // cascadeRecalc.recalcularProduto usa a mesma composição
});

test('3.2 recalcularProduto (cascade) — bolo: 2 ing + 1 preparo + 1 embalagem, rende 4 un → custoUnitario = total/4', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 20, unidade_medida: 'g' }, { id: 2, preco_por_kg: 0.4, unidade_medida: 'un' }],
    preparos: [{ id: 20, rendimento_total: 1000, unidade_medida: 'g', custo_por_kg: 10 }],
    embalagens: [{ id: 7, preco_unitario: 0.5 }],
    produtos: [{ id: 100, unidade_rendimento: 'por_unidade', rendimento_unidades: 4 }],
    produtoIngs: [{ produto_id: 100, materia_prima_id: 1, quantidade_utilizada: 200 }, { produto_id: 100, materia_prima_id: 2, quantidade_utilizada: 3 }],
    produtoPreps: [{ produto_id: 100, preparo_id: 20, quantidade_utilizada: 500 }],
    produtoEmbs: [{ produto_id: 100, embalagem_id: 7, quantidade_utilizada: 4 }],
  };
  const r = await cascade.recalcularProduto(fakeDb(state), 100);
  // 200 g×20/kg = 4 ; 3 ovos×0,40 = 1,20 ; 500 g×10/kg = 5 ; 4 emb×0,50 = 2 → 12,20 / 4 = 3,05
  assert.ok(close(r.custoTotal, 12.2));
  assert.ok(close(r.custoUnitario, 3.05));
});

test('3.3 Financeiro — Mark-up = 1/(1 − fixos − variáveis − lucro): 15% + 22,22% + 11,5% → 1,95x; CMV máximo = 51,28%', () => {
  const mk = calcMarkup(PROD.fixoPerc22, PROD.variavelPerc, PROD.lucroPerc);
  assert.ok(close(mk, 1 / (1 - 0.15 - 0.2222 - 0.115)));
  assert.equal(mk.toFixed(2), '1.95');
  // FinanceiroConfigScreen:605 — custoBruto = 1 − fixos − var − lucro
  const cmvMax = 1 - PROD.fixoPerc22 - PROD.variavelPerc - PROD.lucroPerc;
  assert.equal(formatPercent(cmvMax), '51,28%');
  // Com os 22,78% que fecham com o restante do app o mark-up seria 1,97x (inconsistência de UI, ver relatório)
  assert.equal(calcMarkup(PROD.fixoPerc, PROD.variavelPerc, PROD.lucroPerc).toFixed(2), '1.97');
});

test('3.4 FAQ (SuporteScreen:52) "Preço = Custo / (1 − Margem% − Fixas% − Variáveis%)" == calcMarkup == engine calcularPrecoBalcao', () => {
  const faq = PROD.cmv / (1 - PROD.lucroPerc - PROD.fixoPerc22 - PROD.variavelPerc);
  const viaMarkup = calcPrecoSugerido(PROD.cmv, calcMarkup(PROD.fixoPerc22, PROD.variavelPerc, PROD.lucroPerc));
  const viaEngine = precif.calcularPrecoBalcao({ cmv: PROD.cmv, lucroPerc: PROD.lucroPerc, fixoPerc: PROD.fixoPerc22, variavelPerc: PROD.variavelPerc }).preco;
  assert.ok(close(faq, 8.0538, 1e-3));
  assert.ok(close(viaMarkup, faq));
  assert.ok(close(viaEngine, faq));
  // ProdutoFormScreen:538 — precoSugerido = custoUnitario × (1 + margemSegurança) × markup
  const comSeg = PROD.cmv * 1.05 * calcMarkup(PROD.fixoPerc22, PROD.variavelPerc, PROD.lucroPerc);
  const engSeg = precif.calcularPrecoBalcao({ cmv: PROD.cmv, lucroPerc: PROD.lucroPerc, fixoPerc: PROD.fixoPerc22, variavelPerc: PROD.variavelPerc, margemSegurancaPerc: 0.05 }).preco;
  assert.ok(close(comSeg, engSeg));
});

test('3.5 composição do preço sugerido fecha 100%: CMV + lucroR + fixoR + variavelR = preço; margem líquida no sugerido == lucro desejado', () => {
  const r = precif.calcularPrecoBalcao({ cmv: PROD.cmv, lucroPerc: PROD.lucroPerc, fixoPerc: PROD.fixoPerc22, variavelPerc: PROD.variavelPerc });
  const c = r.composicao;
  assert.ok(close(c.cmv + c.lucroR + c.fixoR + c.variavelR, r.preco));
  const ml = calcMargemLiquida(r.preco, PROD.cmv, r.preco * PROD.fixoPerc22, r.preco * PROD.variavelPerc);
  assert.ok(close(ml, PROD.lucroPerc));
});

test('3.6 lucro bruto vs líquido — balcão R$ 25, CMV 4,13, fixos 22,78%, var 11,5% → bruto 20,87 (83,5%) / líquido 12,30 (49,2%)', () => {
  const p = PROD.precoBalcao;
  const bruto = p - PROD.cmv;
  assert.ok(close(bruto, 20.87));
  assert.ok(close(calcMargem(p, PROD.cmv), 20.87 / 25));
  const liq = calcLucroLiquido(p, PROD.cmv, p * PROD.fixoPerc, p * PROD.variavelPerc);
  assert.ok(close(r2(liq), 12.3));
  assert.ok(close(calcMargemLiquida(p, PROD.cmv, p * PROD.fixoPerc, p * PROD.variavelPerc), liq / p));
  assert.ok(close(calcCMVPercentual(PROD.cmv, p), 0.1652));
  // engine concorda
  const e = precif.calcularLucroLiquido({ preco: p, cmv: PROD.cmv, variavelPerc: PROD.variavelPerc, fixoPerc: PROD.fixoPerc });
  assert.ok(close(e.llR, liq));
});

test('3.7 inviabilidade — soma ≥ 100% zera markup/preço; despesas fixas sem faturamento = 0% (custos fixos SOMEM do preço em silêncio)', () => {
  assert.equal(calcMarkup(0.5, 0.4, 0.15), 0);
  assert.equal(precif.calcularPrecoBalcao({ cmv: 10, lucroPerc: 0.15, fixoPerc: 0.5, variavelPerc: 0.4 }).preco, 0);
  assert.equal(precif.validarSomaPercentual(1.05).nivel, 'inviavel');
  assert.equal(calcDespesasFixasPercentual(2733, 0), 0);
});

// ═══════════════════════════════════════════════════════════════════════
// 4. DELIVERY — exemplo real de prod: CMV 4,13 / balcão 25 / comissão 12% + online 3,2%
// ═══════════════════════════════════════════════════════════════════════
test('4.1 buildContextoFinanceiro — fixos 2.733,60 sobre faturamento médio 12.000 → 22,78%; imposto 0% quando nenhuma variável tem nome de imposto', () => {
  const ctx = da.buildContextoFinanceiro({
    cfgRows: [{ lucro_desejado: 0.15, lucro_desejado_delivery: 0.15, margem_seguranca: 0.05 }],
    fixasRows: [{ valor: 2000 }, { valor: 733.6 }],
    varsRows: [{ descricao: 'Cartão de crédito', percentual: 0.05 }, { descricao: 'Taxas', percentual: 0.065 }],
    fatRows: [{ valor: 12000 }, { valor: 0 }],
    options: { usarLucroDelivery: true },
  });
  assert.ok(close(ctx.fixoPerc, 0.2278));
  assert.ok(close(ctx.variavelPerc, 0.115));
  assert.equal(ctx.impostoPerc, 0);
  assert.equal(ctx.margemSegurancaPerc, 0.05);
  // Só descrições com palavra de imposto entram no delivery
  assert.ok(close(da.extrairImpostoPercentual([{ descricao: 'Simples Nacional', percentual: 0.06 }, { descricao: 'Maquininha', percentual: 0.03 }]), 0.06));
  assert.equal(da.extrairImpostoPercentual([{ descricao: 'Nota fiscal', percentual: 0.06 }]), 0); // ⚠ não reconhecido
});

test('4.2 "mesmo lucro" — lucro líquido balcão = 25 − 4,13 − 25×(22,78%+11,5%) = R$ 12,30; preço delivery = (12,30+4,13)/(1−22,78%−15,2%) = R$ 26,49 ✔', () => {
  // DeliveryHubScreen:390-391 (réplica)
  const lucroLiqBalcao = Math.max(0, PROD.precoBalcao - PROD.cmv - PROD.precoBalcao * (PROD.fixoPerc + PROD.variavelPerc));
  assert.equal(r2(lucroLiqBalcao), 12.3);
  const r = dp.calcPrecoMesmoLucroReais({ cmv: PROD.cmv, lucroAlvoReais: lucroLiqBalcao, plat: PROD.plat, contexto: { fixoPerc: PROD.fixoPerc, impostoPerc: PROD.impostoPerc } });
  assert.ok(close(r.divisor, 1 - 0.2278 - 0.152));
  assert.equal(r2(r.preco), 26.49);
  // round-trip: a esse preço, lucro líquido (fixos + comissão + taxa online) é exatamente 12,30
  const chk = precif.calcularLucroLiquido({ preco: r.preco, cmv: PROD.cmv, variavelPerc: 0.152, fixoPerc: PROD.fixoPerc });
  assert.ok(close(chk.llR, lucroLiqBalcao));
  // Com os 22,22% do Financeiro o mesmo cálculo daria 12,44 / 26,52 — os números da tela só fecham com 22,78%
  const alt = Math.max(0, 25 - 4.13 - 25 * (PROD.fixoPerc22 + PROD.variavelPerc));
  assert.equal(r2(alt), 12.44);
});

test('4.3 "sugerido (margem financ.)" — 4,13 × (1+5% seg.) / (1 − 15% − 22,78% − 12% − 3,2%) = R$ 9,22 ✔ (sem seg.: 8,78; com 22,22%: 8,68)', () => {
  const ctx = { lucroPerc: PROD.lucroPerc, fixoPerc: PROD.fixoPerc, impostoPerc: PROD.impostoPerc, margemSegurancaPerc: PROD.margemSegurancaPerc };
  const r = dp.calcSugestaoDeliveryCompleta({ cmv: PROD.cmv, plat: PROD.plat, contexto: ctx });
  assert.ok(r.validacao.ok);
  assert.ok(close(r.somaPerc, 0.15 + 0.2278 + 0.12 + 0.032));
  assert.equal(r2(r.preco), 9.22);
  const semSeg = dp.calcSugestaoDeliveryCompleta({ cmv: PROD.cmv, plat: PROD.plat, contexto: { ...ctx, margemSegurancaPerc: 0 } });
  assert.equal(r2(semSeg.preco), 8.78);
  const fin22 = dp.calcSugestaoDeliveryCompleta({ cmv: PROD.cmv, plat: PROD.plat, contexto: { ...ctx, margemSegurancaPerc: 0, fixoPerc: PROD.fixoPerc22 } });
  assert.equal(r2(fin22.preco), 8.68);
  // adapter (deliveryAdapter.calcularPrecoDeliveryPlataforma) chega ao mesmo preço para a mesma row
  const viaAdapter = da.calcularPrecoDeliveryPlataforma(PROD.cmv, PROD.plat, { ...ctx, margemSegurancaPerc: 0 });
  assert.ok(close(viaAdapter.preco, semSeg.preco));
});

test('4.4 legenda DeliveryPrecosScreen:636 ("pra você ter o MESMO lucro líquido do balcão") NÃO descreve o sugerido: a R$ 9,22 sobra R$ 1,38 (15%), não R$ 12,30', () => {
  const preco = 9.22;
  const ll = precif.calcularLucroLiquido({ preco, cmv: PROD.cmv, variavelPerc: 0.152, fixoPerc: PROD.fixoPerc });
  // lucro sobre CMV real (sem a seg. de 5%) ≈ 15% + 5% de seg. → ~R$ 1,59; sobre CMV protegido = 15% exato
  assert.ok(ll.llR < 2, `lucro líquido no sugerido = ${ll.llR.toFixed(2)}`);
  assert.ok(Math.abs(ll.llR - 12.3) > 10); // muito longe do "mesmo lucro"
  // e o próprio app classifica sugerido < balcão como "Erro de cálculo detectado"
  assert.equal(precif.compararDeliveryVsBalcao(preco, PROD.precoBalcao).nivel, 'critico');
});

test('4.5 lucro estimado por venda — DeliveryPrecosScreen/Hub mostram calcResultadoDelivery (SEM fixos/imposto): a R$ 26,49 "lucro" = 18,33 (69%), enquanto o líquido é 12,30', () => {
  const r = dp.calcResultadoDelivery({ precoVenda: 26.49, custoUnit: PROD.cmv, plat: PROD.plat });
  assert.ok(close(r.comissaoPct, 0.152));
  assert.ok(close(r.valorComissao, 26.49 * 0.152));
  assert.ok(close(r.receitaLiq, 26.49 * (1 - 0.152)));
  assert.equal(r2(r.lucro), 18.33);
  assert.ok(close(r.margem, r.lucro / 26.49));
  // Hub "Composição com este preço" (DeliveryHubScreen:900-906) desconta fixos + imposto + comissão → 12,30
  const valFixos = 26.49 * PROD.fixoPerc;
  const valComissao = 26.49 * r.comissaoPct;
  const lucroLiquidoHub = 26.49 - (PROD.cmv + valFixos + 0 + valComissao);
  assert.equal(r2(lucroLiquidoHub), 12.3);
  assert.ok(Math.abs(r.lucro - lucroLiquidoHub) > 6, 'duas telas, dois "lucros" para o mesmo preço');
});

test('4.6 comissão = 0 — "mesmo lucro" devolve preço MENOR que o balcão (21,28 < 25) porque as variáveis do balcão (11,5%) somem no delivery; app marca "crítico"', () => {
  const platZero = { ...PROD.plat, taxa_plataforma: 0, comissao_app: 0 };
  const lucroLiqBalcao = 12.3;
  const r = dp.calcPrecoMesmoLucroReais({ cmv: PROD.cmv, lucroAlvoReais: lucroLiqBalcao, plat: platZero, contexto: { fixoPerc: PROD.fixoPerc, impostoPerc: 0 } });
  assert.equal(r2(r.preco), r2((12.3 + 4.13) / (1 - 0.2278)));
  assert.ok(r.preco < PROD.precoBalcao);
  assert.equal(precif.compararDeliveryVsBalcao(r.preco, PROD.precoBalcao).nivel, 'critico');
  // modelo legado com comissão 0: lucro = preço − custo (bruto)
  const leg = dp.calcResultadoDelivery({ precoVenda: 25, custoUnit: PROD.cmv, plat: platZero });
  assert.ok(close(leg.lucro, 25 - 4.13));
  // sugerido completo com comissão 0 == balcão só se imposto == variáveis do balcão
  const s = dp.calcSugestaoDeliveryCompleta({ cmv: PROD.cmv, plat: platZero, contexto: { lucroPerc: 0.15, fixoPerc: PROD.fixoPerc, impostoPerc: 0.115 } });
  const b = precif.calcularPrecoBalcao({ cmv: PROD.cmv, lucroPerc: 0.15, fixoPerc: PROD.fixoPerc, variavelPerc: 0.115 });
  assert.ok(close(s.preco, b.preco));
});

test('4.7 cupom R$ 2 e frete subsidiado R$ 3 entram como custo absoluto no numerador (mesmo lucro e sugerido)', () => {
  const plat = { ...PROD.plat, desconto_promocao: 2, taxa_entrega: 3 };
  const r = dp.calcPrecoMesmoLucroReais({ cmv: PROD.cmv, lucroAlvoReais: 12.3, plat, contexto: { fixoPerc: PROD.fixoPerc, impostoPerc: 0 } });
  assert.ok(close(r.preco, (12.3 + 4.13 + 5) / (1 - 0.2278 - 0.152)));
  const s = dp.calcSugestaoDeliveryCompleta({ cmv: PROD.cmv, plat, contexto: { lucroPerc: 0.15, fixoPerc: PROD.fixoPerc, impostoPerc: 0 } });
  assert.ok(close(s.preco, (4.13 + 5) / (1 - 0.15 - 0.2278 - 0.152)));
  assert.ok(close(s.composicao.cmv + s.composicao.custosAbsolutos + s.composicao.lucroR + s.composicao.fixoR + s.composicao.variavelR, s.preco));
});

test('4.8 Hub "Visão Geral" e Comparativo usam um TERCEIRO sugerido (sugerirPrecoDelivery / break-even, margem BRUTA 30%, sem fixos): 4,13 / (0,848 − 0,30) = R$ 7,54', () => {
  const s = dp.sugerirPrecoDelivery({ custoUnit: PROD.cmv, plat: PROD.plat, margemAlvo: 0.30, arredondar: false });
  assert.equal(r2(s.precoSugerido), 7.54);
  // break-even sobre o preço balcão (ComparativoCanaisScreen:208): 25 / 0,848 = 29,48 → arredonda 29,50
  assert.equal(dp.calcPrecoBreakEven(25, PROD.plat), 29.5);
  // três telas, três "sugeridos" para o mesmo produto/plataforma: 7,54 / 9,22 / 29,50
});

// ═══════════════════════════════════════════════════════════════════════
// 5. COMBOS
// ═══════════════════════════════════════════════════════════════════════
test('5.1 custo do combo = Σ custoUnit × qtd (DeliveryCombosScreen:741 calcSomaItens); sugerido = markup divisor sobre o total', () => {
  const itens = [
    { tipo: 'produto', custoUnit: 4.13, quantidade: 2 },
    { tipo: 'embalagem', custoUnit: 0.5, quantidade: 1 },
    { tipo: 'materia_prima', custoUnit: 0.4, quantidade: '3' }, // string com stepper
  ];
  const total = itens.reduce((a, i) => a + calc.safeNum(i.custoUnit) * calc.safeNum(i.quantidade), 0);
  assert.ok(close(total, 9.96));
  const s = precif.calcularPrecoCombo({ cmvCombo: total, lucroPerc: 0.15, fixoPerc: PROD.fixoPerc, variavelPerc: PROD.variavelPerc });
  assert.ok(close(s.preco, 9.96 / (1 - 0.15 - 0.2278 - 0.115)));
  assert.equal(r2(s.preco), 19.64);
  const c = s.composicao;
  assert.ok(close(c.cmv + c.lucroR + c.fixoR + c.variavelR, s.preco));
  // com desconto R$ 2 a composição é refeita e o lucro cai
  const d = precif.calcularPrecoCombo({ cmvCombo: total, lucroPerc: 0.15, fixoPerc: PROD.fixoPerc, variavelPerc: PROD.variavelPerc, descontoR: 2 });
  assert.ok(close(d.preco, s.preco - 2));
  assert.ok(close(d.composicao.lucroR, d.preco - total - d.preco * (PROD.fixoPerc + PROD.variavelPerc)));
});

test('5.2 card do combo (DeliveryCombosScreen:769-772) rotula "Lucro Líquido"/"Margem Líq." mas calcula BRUTO (preço − custo): preço 19,64 / custo 9,96 → 9,68 (49%) vs líquido 2,95 (15%)', () => {
  const precoV = 19.64, custoC = 9.96;
  const lucroCard = precoV - custoC;
  const margemCard = calcMargem(precoV, custoC) * 100;
  const liq = precif.calcularLucroLiquido({ preco: precoV, cmv: custoC, variavelPerc: PROD.variavelPerc, fixoPerc: PROD.fixoPerc });
  assert.equal(r2(lucroCard), 9.68);
  assert.equal(Math.round(margemCard), 49);
  assert.equal(r2(liq.llR), 2.95);
  assert.ok(lucroCard - liq.llR > 6, 'rótulo "líquido" com valor bruto');
});

test('5.3 sem dupla contagem de embalagem: produto já traz sua embalagem; item "embalagem" no combo é a caixa do combo (adicional, não repetida)', async () => {
  const state = {
    materias: [{ id: 1, preco_por_kg: 20, unidade_medida: 'g' }],
    embalagens: [{ id: 7, preco_unitario: 0.5 }, { id: 8, preco_unitario: 1.2 }],
    preparos: [],
    produtos: [{ id: 100, unidade_rendimento: 'por_unidade', rendimento_unidades: 1 }],
    produtoIngs: [{ produto_id: 100, materia_prima_id: 1, quantidade_utilizada: 100 }],
    produtoEmbs: [{ produto_id: 100, embalagem_id: 7, quantidade_utilizada: 1 }],
    combos: [{ id: 5 }],
    comboItens: [
      { combo_id: 5, tipo: 'produto', item_id: 100, quantidade: 2 },   // (2,00 + 0,50) × 2
      { combo_id: 5, tipo: 'embalagem', item_id: 8, quantidade: 1 },   // caixa do combo
    ],
  };
  const r = await cascade.recalcularCombo(fakeDb(state), 5);
  assert.ok(close(r.custo, 2.5 * 2 + 1.2));
});

test('5.4 insumo em kg dentro do combo — modal (DeliveryCombosScreen:661 getItemCustoEUnidade, "1 kg") vs lista/cascade/DeliveryPrecos (quantidade tratada como GRAMAS) divergem 1000×', async () => {
  // Corrigido (auditoria 2026-09-09 [B2]): o modal mostra "1 kg de farinha = R$ 5,00" (unidade
  // nativa, sessão 28.51) e agora DeliveryCombosScreen, DeliveryPrecosScreen, DeliveryProdutosScreen
  // e cascadeRecalc.recalcularCombo usam a mesma unidade nativa (resolveCustoUnitarioItemCombo).
  // Esperado (o que o usuário viu no modal): R$ 5,00.
  const state = {
    materias: [{ id: 1, preco_por_kg: 5, unidade_medida: 'kg' }],
    preparos: [{ id: 20, rendimento_total: 1, unidade_medida: 'kg', custo_por_kg: 8 }],
    combos: [{ id: 5 }],
    comboItens: [
      { combo_id: 5, tipo: 'materia_prima', item_id: 1, quantidade: 1 }, // "1 kg" no modal → 5,00
      { combo_id: 5, tipo: 'preparo', item_id: 20, quantidade: 1 },      // "1 kg" no modal → 8,00
    ],
  };
  // réplica do modal (getItemCustoEUnidade × quantidade)
  const modal = calcCustoIngrediente(5, 1, 'kg', 'kg') * 1 + calcCustoPreparo(8, 1, 'kg') * 1;
  assert.ok(close(modal, 13));
  const r = await cascade.recalcularCombo(fakeDb(state), 5);
  assert.ok(close(r.custo, modal), `cascade/lista ${r.custo} ≠ modal ${modal}`);
});

test('5.5 MatrizBCGScreen:294 — custo do combo faz prodCostMap[item.item_id] para QUALQUER tipo: embalagem id 3 vira o custo do PRODUTO id 3', () => {
  // Corrigido (auditoria 2026-09-09 [B3]): réplica de MatrizBCGScreen.js `custoItemCombo` — só itens
  // tipo "produto" usam o mapa de produtos; embalagem/insumo/preparo usam o próprio custo via
  // resolveCustoUnitarioItemCombo (comboPricing.js).
  const prodCostMap = { 3: 12.0, 7: 4.13 };
  const itens = [
    { tipo: 'produto', item_id: 7, quantidade: 1 },
    { tipo: 'embalagem', item_id: 3, quantidade: 1, preco_unitario: 0.5 },
  ];
  const bcgCusto = itens.reduce((a, item) => {
    const dados = item.tipo === 'produto' ? { custoUnitario: prodCostMap[item.item_id] } : item;
    return a + calc.safeNum(comboPricing.resolveCustoUnitarioItemCombo(item.tipo, dados).custo) * calc.safeNum(item.quantidade || 1);
  }, 0);
  const esperado = 4.13 + 0.5;
  assert.ok(close(bcgCusto, esperado), `BCG custo ${bcgCusto} (embalagem contada como produto R$ 12) ≠ ${esperado}`);
});

// ═══════════════════════════════════════════════════════════════════════
// 6. RANKING (Matriz BCG)
// ═══════════════════════════════════════════════════════════════════════
test('6.1 BCG usa margem BRUTA ((preço − custo)/preço) — MatrizBCGScreen:276 — e rotula como tal; 1 produto → Quebra-Cabeça', () => {
  const margemPerc = ((25 - 4.13) / 25) * 100;
  assert.ok(close(margemPerc, 83.48));
  const one = bcg.classificarMatrizBCG([{ precoVenda: 25, margemPerc, qtdVendida: 40 }]);
  assert.equal(one[0].classificacao, 'Quebra-Cabeça');
});

test('6.2 BCG 4 produtos — medianas: margem ≥ mediana = alta; vendas > mediana (estrito) = alta', () => {
  const items = [
    { nome: 'A', precoVenda: 25, margemPerc: 83, qtdVendida: 100 }, // alta/alta → Estrela
    { nome: 'B', precoVenda: 10, margemPerc: 40, qtdVendida: 90 },  // baixa/alta → Cavalo
    { nome: 'C', precoVenda: 12, margemPerc: 70, qtdVendida: 5 },   // alta/baixa → Quebra-Cabeça
    { nome: 'D', precoVenda: 8, margemPerc: 30, qtdVendida: 0 },    // baixa/baixa → Abacaxi
  ];
  const out = bcg.classificarMatrizBCG(items);
  // medianaMargem = (40+70)/2 = 55 ; medianaVendas (só com venda>0) = mediana(100,90,5) = 90
  assert.equal(bcg.median([83, 40, 70, 30]), 55);
  assert.equal(bcg.median([100, 90, 5]), 90);
  assert.equal(out[0].classificacao, 'Estrela');        // 83 ≥ 55 e 100 > 90
  assert.equal(out[2].classificacao, 'Quebra-Cabeça');  // 70 ≥ 55 e 5 ≤ 90
  assert.equal(out[3].classificacao, 'Abacaxi');        // 30 < 55 e 0
});

test('6.2b BCG — item exatamente na mediana de vendas conta como baixa venda (regra 28.73)', () => {
  const items = [
    { precoVenda: 25, margemPerc: 83, qtdVendida: 100 },
    { precoVenda: 10, margemPerc: 40, qtdVendida: 90 },
    { precoVenda: 12, margemPerc: 70, qtdVendida: 5 },
    { precoVenda: 8, margemPerc: 30, qtdVendida: 0 },
  ];
  const out = bcg.classificarMatrizBCG(items).map(o => o.classificacao);
  assert.deepEqual(out, ['Estrela', 'Abacaxi', 'Quebra-Cabeça', 'Abacaxi']);
});

// ═══════════════════════════════════════════════════════════════════════
// 7. HOME — KPIs (HomeScreen.js:206-236 réplica)
// ═══════════════════════════════════════════════════════════════════════
function homeKpis({ produtos, totalFixas, totalVar, fatMedio }) {
  const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
  let somaMargens = 0, somaCustos = 0, somaPrecos = 0, n = 0;
  for (const p of produtos) {
    if (p.preco_venda > 0) {
      somaCustos += p.custoUnit; somaPrecos += p.preco_venda;
      somaMargens += calcMargemLiquida(p.preco_venda, p.custoUnit, p.preco_venda * dfPerc, p.preco_venda * totalVar);
      n++;
    }
  }
  const margemMedia = n > 0 ? somaMargens / n : 0;
  const cmvPercent = calcCMVPercentual(somaCustos, somaPrecos);
  const denominador = 1 - cmvPercent - totalVar;
  const pontoEquilibrio = denominador > 0 ? totalFixas / denominador : 0;
  // Audit fix [B10] — HomeScreen agora usa calcSobraMes (fixas + CMV + variáveis)
  const { sobra: resultadoFinanceiro, soFixas: sobraSoFixas } = calcSobraMes({
    faturamento: fatMedio, fixas: totalFixas, variaveisPerc: totalVar, cmvPerc: cmvPercent, temProdutos: n > 0,
  });
  return { dfPerc, margemMedia, cmvPercent, pontoEquilibrio, resultadoFinanceiro, sobraSoFixas };
}

test('7.1 Home — CMV médio = Σcusto/Σpreço (não ponderado por vendas); PE = fixas/(1 − CMV% − var%); "por dia" = PE/30', () => {
  const k = homeKpis({
    produtos: [{ preco_venda: 25, custoUnit: 4.13 }, { preco_venda: 10, custoUnit: 1.65 }],
    totalFixas: 2711.43, totalVar: 0.115, fatMedio: 11902.7,
  });
  assert.ok(close(k.cmvPercent, 5.78 / 35));
  assert.ok(close(k.dfPerc, 0.2278, 1e-4));
  // "Mínimo pra pagar as contas R$ 3.765,88 / dia R$ 125,53" — consistente (÷30)
  const pe = 2711.43 / (1 - 0.165 - 0.115);
  assert.equal(formatCurrency(pe), 'R$ 3.765,88');
  assert.equal(formatCurrency(pe / 30), 'R$ 125,53');
  assert.equal(formatCurrency(3765.88 / 30), 'R$ 125,53');
});

test('7.2 Home — "Sobra do mês" desconta fixas + CMV médio + variáveis (calcSobraMes) e não contradiz mais o card "Mínimo pra pagar as contas"', () => {
  // Corrigido (audit B10): antes era faturamento − fixas = +767 ("Receita cobre custos")
  // enquanto o PE 3.796 > 3.500 dizia "Falta R$ 296".
  const k = homeKpis({
    produtos: [{ preco_venda: 25, custoUnit: 4.13 }, { preco_venda: 10, custoUnit: 1.65 }],
    totalFixas: 2733, totalVar: 0.115, fatMedio: 3500,
  });
  assert.ok(k.pontoEquilibrio > 3500);              // card "Mínimo": PE 3.796 > 3.500 → "Falta R$ 296"
  assert.ok(k.resultadoFinanceiro < 0, 'sobra negativa — coerente com "Falta"');
  const resultadoReal = 3500 * (1 - k.cmvPercent - 0.115) - 2733;
  assert.ok(close(k.resultadoFinanceiro, resultadoReal, 1e-9));
  assert.equal(k.sobraSoFixas, false);
  // sem produto com preço: só custos fixos (faturamento − fixas) e o card avisa
  const semProd = homeKpis({ produtos: [], totalFixas: 2733, totalVar: 0.115, fatMedio: 3500 });
  assert.equal(semProd.resultadoFinanceiro, 767);
  assert.equal(semProd.sobraSoFixas, true);
});

test('7.3 Home "Quanto sobra por venda" = média simples das margens LÍQUIDAS (preço − CMV − fixos% − var%)/preço', () => {
  const k = homeKpis({ produtos: [{ preco_venda: 25, custoUnit: 4.13 }], totalFixas: 2733.6, totalVar: 0.115, fatMedio: 12000 });
  assert.ok(close(k.margemMedia, 12.3 / 25, 1e-3));
});

// ═══════════════════════════════════════════════════════════════════════
// 8. RELATÓRIOS — "De cada R$ 10,00" (RelatorioSimplesScreen.js:158-176 réplica)
// ═══════════════════════════════════════════════════════════════════════
function resumoR10({ produtos, dfPerc, totalVar }) {
  const totalReceita = produtos.reduce((a, p) => a + p.precoVenda, 0);
  const totalCustoIng = produtos.reduce((a, p) => a + p.custoUn, 0);
  const percIng = totalReceita > 0 ? totalCustoIng / totalReceita : 0;
  const percLucro = 1 - percIng - dfPerc - totalVar;
  const f = (x) => (x * 10).toFixed(2).replace('.', ',');
  return { ingredientes: f(percIng), fixas: f(dfPerc), variaveis: f(totalVar), lucro: f(Math.abs(percLucro)), lucroPositivo: percLucro > 0, percIng, percLucro };
}

test('8.1 "R$ 1,65 ingredientes, R$ 2,28 custos do mês, R$ 1,15 por venda, sobram R$ 4,92" — soma 10,00 e fecha com fixos 22,78% (não 22,22%)', () => {
  const r = resumoR10({ produtos: [{ precoVenda: 25, custoUn: 4.13 }], dfPerc: PROD.fixoPerc, totalVar: PROD.variavelPerc });
  assert.equal(r.ingredientes, '1,65');
  assert.equal(r.fixas, '2,28');
  assert.equal(r.variaveis, '1,15');
  assert.equal(r.lucro, '4,92');
  assert.ok(r.lucroPositivo);
  const soma = [r.ingredientes, r.fixas, r.variaveis, r.lucro].reduce((a, s) => a + parseFloat(s.replace(',', '.')), 0);
  assert.ok(close(soma, 10, 1e-9));
  // com 22,22% o Relatório mostraria 2,22 — o valor visto (2,28) confirma fixos = 22,78% no restante do app
  assert.equal(resumoR10({ produtos: [{ precoVenda: 25, custoUn: 4.13 }], dfPerc: PROD.fixoPerc22, totalVar: PROD.variavelPerc }).fixas, '2,22');
});

test('8.2 Relatório "Ponto de Equilíbrio Traduzido" (RelatorioSimplesScreen → calcPontoEquilibrio) = fixas / (1 − CMV% − var%) / 30 — mesma conta da Home/Simulador/FAQ', () => {
  // Corrigido (audit B11): antes dividia por uma margem que JÁ descontava os fixos% → número inflado (aqui 1,46×; até 2,5× em outros dados).
  const totalFixas = 2733.6, totalVar = 0.115, dfPerc = 0.2278;
  const produtos = [{ precoVenda: 25, custoUn: 4.13 }];
  const cmvPerc = 4.13 / 25;
  const peHome = totalFixas / (1 - cmvPerc - totalVar);
  // réplica de RelatorioSimplesScreen (bloco "Ponto de equilíbrio")
  const cmvRelatorio = calcCMVPercentual(produtos.reduce((a, p) => a + p.custoUn, 0), produtos.reduce((a, p) => a + p.precoVenda, 0));
  const peRelatorioDiario = calcPontoEquilibrio({ fixas: totalFixas, variaveisPerc: totalVar, cmvPerc: cmvRelatorio }) / 30;
  assert.ok(close(peRelatorioDiario, peHome / 30, 0.01), `Relatório ${peRelatorioDiario.toFixed(2)}/dia ≠ Home ${(peHome / 30).toFixed(2)}/dia`);
  // o número antigo (fixas / margem líquida média / 30) era ~1,46× maior
  const margemLiqMedia = produtos.reduce((a, p) => a + calcMargemLiquida(p.precoVenda, p.custoUn, p.precoVenda * dfPerc, p.precoVenda * totalVar), 0) / produtos.length;
  assert.ok((totalFixas / margemLiqMedia) / 30 > peRelatorioDiario * 1.4);
});

// ═══════════════════════════════════════════════════════════════════════
// 9. LISTA DE COMPRAS (ListaComprasScreen.js:163-197 réplica)
// ═══════════════════════════════════════════════════════════════════════
function listaCompras({ prod, prodIngs, prodPreps, prepIngs, preparoMap, mpMap, unidades }) {
  const consolidado = {};
  const add = (mpId, qtBase) => { consolidado[mpId] = (consolidado[mpId] || 0) + qtBase; };
  const rendUnidades = prod.rendimento_unidades || 1;
  for (const ing of prodIngs) {
    const mp = mpMap[ing.materia_prima_id];
    add(ing.materia_prima_id, converterParaBase((ing.quantidade_utilizada / rendUnidades) * unidades, mp.unidade_medida || 'g'));
  }
  for (const prep of prodPreps) {
    const rendPrep = preparoMap[prep.preparo_id]?.rendimento_total || 1;
    const proporcao = ((prep.quantidade_utilizada / rendUnidades) * unidades) / rendPrep;
    for (const pi of prepIngs.filter(x => x.preparo_id === prep.preparo_id)) {
      const mp = mpMap[pi.materia_prima_id];
      add(pi.materia_prima_id, converterParaBase(pi.quantidade_utilizada * proporcao, mp.unidade_medida || 'g'));
    }
  }
  return consolidado;
}

test('9.1 350 g de uma receita de 700 g (500 g farinha) × 3 produtos → 750 g de farinha; custo estimado = 750/1000 × R$ 5 = R$ 3,75', () => {
  const c = listaCompras({
    prod: { id: 1, rendimento_unidades: 1 },
    prodIngs: [],
    prodPreps: [{ preparo_id: 10, quantidade_utilizada: 350 }],
    prepIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
    preparoMap: { 10: { rendimento_total: 700, unidade_medida: 'g' } },
    mpMap: { 1: { unidade_medida: 'g', quantidade_liquida: 1000, valor_pago: 5 } },
    unidades: 3,
  });
  assert.ok(close(c[1], 750));
  // ListaComprasScreen:269-271 — custo = (totalBase / líquidaBase) × valor_pago
  const custo = (750 / converterParaBase(1000, 'g')) * 5;
  assert.ok(close(custo, 3.75));
  // farinha cadastrada em kg (líquida 1 kg) dá o mesmo custo
  assert.ok(close((750 / converterParaBase(1, 'kg')) * 5, 3.75));
});

test('9.2 ficha "rende 4 un": quantidades são POR RECEITA; pedir 3 un usa 3/4 da receita', () => {
  const c = listaCompras({
    prod: { id: 1, rendimento_unidades: 4 },
    prodIngs: [{ materia_prima_id: 2, quantidade_utilizada: 200 }],
    prodPreps: [{ preparo_id: 10, quantidade_utilizada: 350 }],
    prepIngs: [{ preparo_id: 10, materia_prima_id: 1, quantidade_utilizada: 500 }],
    preparoMap: { 10: { rendimento_total: 700 } },
    mpMap: { 1: { unidade_medida: 'g' }, 2: { unidade_medida: 'g' } },
    unidades: 3,
  });
  assert.ok(close(c[1], 750 / 4));
  assert.ok(close(c[2], 150));
});

test('9.3 Lista — quantidade lida com parseInt (ListaComprasScreen:208): "0,5" e "1,5" viram 0 e 1 (fração descartada); produto por kg usa rendimento_unidades (=1) como se fosse unidade', () => {
  assert.equal(parseInt('0,5') || 0, 0);
  assert.equal(parseInt('1,5') || 0, 1);
  // produto vendido por kg: rendimento_unidades null → 1 → "3" = 3 receitas inteiras, não 3 kg
  const c = listaCompras({
    prod: { id: 1, unidade_rendimento: 'por_kg', rendimento_total: 2, rendimento_unidades: null },
    prodIngs: [{ materia_prima_id: 1, quantidade_utilizada: 1000 }],
    prodPreps: [], prepIngs: [], preparoMap: {},
    mpMap: { 1: { unidade_medida: 'g' } },
    unidades: 3,
  });
  assert.equal(c[1], 3000); // 3 receitas de 2 kg = 6 kg de produto, 3 kg de insumo — ambíguo para o usuário
});

// ═══════════════════════════════════════════════════════════════════════
// 10. DRE / FLUXO DE CAIXA (FluxoCaixaDREScreen.js:303-330 réplica)
// ═══════════════════════════════════════════════════════════════════════
function dre(n) {
  const receitaLiquida = n.receitaBruta - n.deducoes - n.devolucoes;
  const lucroBruto = receitaLiquida - n.cmv;
  const totalOperacionais = n.despesasFixas + n.despesasVariaveis;
  const lucroOperacional = lucroBruto - totalOperacionais;
  const lucroLiquido = lucroOperacional - n.outrasDespesas + n.outrasReceitas;
  return { receitaLiquida, lucroBruto, totalOperacionais, lucroOperacional, lucroLiquido };
}
const pctText = (valor, receita) => (receita <= 0 ? '' : `${((valor / receita) * 100).toFixed(1).replace('.', ',')}%`);

test('10.1 DRE — receita 12.000, CMV 1.980 (16,5%), var 1.380 (11,5%), fixas 2.733,60 → resultado 5.906,40 = 49,2% (bate com "sobram R$ 4,92")', () => {
  const d = dre({ receitaBruta: 12000, deducoes: 0, devolucoes: 0, cmv: 1980, despesasFixas: 2733.6, despesasVariaveis: 1380, outrasDespesas: 0, outrasReceitas: 0 });
  assert.ok(close(d.lucroBruto, 10020));
  assert.ok(close(d.lucroOperacional, 5906.4));
  assert.ok(close(d.lucroLiquido, 5906.4));
  assert.equal(pctText(d.lucroLiquido, 12000), '49,2%');
  assert.equal(formatCurrency(d.lucroLiquido), 'R$ 5.906,40');
});

test('10.2 DRE — deduções/devoluções antes do CMV; outras receitas/despesas só no líquido; prejuízo fica negativo', () => {
  const d = dre({ receitaBruta: 10000, deducoes: 500, devolucoes: 200, cmv: 4000, despesasFixas: 3000, despesasVariaveis: 1000, outrasDespesas: 800, outrasReceitas: 300 });
  assert.equal(d.receitaLiquida, 9300);
  assert.equal(d.lucroBruto, 5300);
  assert.equal(d.lucroOperacional, 1300);
  assert.equal(d.lucroLiquido, 800);
  const p = dre({ receitaBruta: 5000, deducoes: 0, devolucoes: 0, cmv: 2000, despesasFixas: 3000, despesasVariaveis: 500, outrasDespesas: 0, outrasReceitas: 0 });
  assert.equal(p.lucroLiquido, -500);
  assert.equal(pctText(p.lucroLiquido, 5000), '-10,0%');
});

test('10.3 Fluxo — saldo final = saldo inicial + entradas − saídas; movimentos com exclusão pendente saem do total', () => {
  const movs = [
    { id: 1, tipo: 'entrada', valor: 1000 }, { id: 2, tipo: 'saida', valor: '250,50' }, { id: 3, tipo: 'saida', valor: 100 },
  ];
  const hidden = new Set([3]);
  let entradas = 0, saidas = 0;
  for (const m of movs.filter(m => !hidden.has(m.id))) {
    const v = calc.parseDecimalBROrZero(m.valor);
    if (m.tipo === 'entrada') entradas += v; else saidas += v;
  }
  const saldoInicial = 300;
  assert.equal(entradas, 1000);
  assert.equal(saidas, 250.5);
  assert.equal(saldoInicial + entradas - saidas, 1049.5);
});
