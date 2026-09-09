/**
 * AUDIT (Agente 3 — validação de cálculos) — src/utils/calculations.js
 *
 * Importa o módulo REAL via loader (audit-loader.mjs) que stubba
 * `database/database` e resolve imports sem extensão.
 *
 * Convenção: testes marcados `{ todo: 'AUDIT BUG: …' }` afirmam o valor
 * CORRETO e falham hoje — documentam bugs do relatório a3-calc.md.
 *
 * Rodar: node --test '__tests__/audit-*.test.mjs'
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';

register('./audit-loader.mjs', import.meta.url);

const calc = await import('../src/utils/calculations.js');
const precif = await import('../src/utils/precificacao.js');
const fc = await import('../src/data/fatoresCorrecao.js');

const {
  parseDecimalBR, parseDecimalBROrZero, safeNum,
  converterParaBase, converterDeBase, normalizarUnidade, getTipoUnidade,
  calcPrecoBase, calcFatorCorrecao, calcPrecoUnitarioEmbalagem,
  calcCustoIngrediente, calcCustoPreparo, calcCustoEmbalagem,
  calcDespesasFixasPercentual, calcMarkup, calcPrecoSugerido,
  getDivisorRendimento, getTipoVenda,
  calcCMVPercentual, calcMargem, calcMargemLiquida, calcLucroLiquido,
  formatCurrency, formatPercent,
} = calc;

const close = (a, b, eps = 1e-6) => Math.abs(a - b) < eps;

// ─────────────────────────────────────────────────────────────────────
// 1. PARSERS NUMÉRICOS
// ─────────────────────────────────────────────────────────────────────
test('parseDecimalBR — entradas de borda', () => {
  assert.ok(Number.isNaN(parseDecimalBR('')));
  assert.ok(Number.isNaN(parseDecimalBR(null)));
  assert.ok(Number.isNaN(parseDecimalBR(undefined)));
  assert.ok(Number.isNaN(parseDecimalBR('abc')));
  assert.equal(parseDecimalBR('0'), 0);
  assert.equal(parseDecimalBR('-5'), -5);          // negativo passa — validação fica no form
  assert.equal(parseDecimalBR('1,5'), 1.5);
  assert.equal(parseDecimalBR('1.5'), 1.5);
  assert.equal(parseDecimalBR('1.000,50'), 1000.5);
  assert.equal(parseDecimalBR('1,000.50'), 1000.5);
  assert.equal(parseDecimalBR('1e5'), 100000);      // notação científica aceita
  assert.equal(parseDecimalBR('  10,50  '), 10.5);
  assert.equal(parseDecimalBR(12.34), 12.34);
  assert.equal(parseDecimalBR('999999999999'), 999999999999);
  assert.equal(parseDecimalBROrZero('abc'), 0);
  assert.equal(parseDecimalBROrZero(''), 0);
  assert.equal(safeNum('1.000,50'), 1000.5);
});

test('parseDecimalBR — ambiguidade "1.000" (mil em PT-BR) vira 1.0 (limitação documentada)', () => {
  // Só ponto → interpretado como decimal EN-US. Usuária PT-BR digitando "1.000" perde 3 ordens.
  assert.equal(parseDecimalBR('1.000'), 1);
  assert.equal(parseDecimalBR('10.000'), 10);
});

test('_safeNum interno (calcCustoIngrediente etc.) entende milhar PT-BR como parseDecimalBR',
  () => {
    const custo = calcCustoIngrediente('1.000,50', 1000, 'g', 'g'); // 1 kg a "R$ 1.000,50/kg"
    assert.ok(close(custo, 1000.5), `atual ${custo}`);
  });

test('formatCurrency / formatPercent', () => {
  assert.equal(formatCurrency(0), 'R$ 0,00');
  assert.equal(formatCurrency(1234.5), 'R$ 1.234,50');
  assert.equal(formatCurrency(1234567.891), 'R$ 1.234.567,89');
  assert.equal(formatCurrency(-5), 'R$ -5,00');
  assert.equal(formatCurrency(-1234.5), 'R$ -1.234,50');
  assert.equal(formatCurrency(NaN), 'R$ 0,00');
  assert.equal(formatCurrency(null), 'R$ 0,00');
  assert.equal(formatCurrency('abc'), 'R$ 0,00');
  assert.equal(formatCurrency(Infinity), 'R$ Infinity'); // documenta: Infinity não é tratado
  assert.equal(formatPercent(0.1234), '12,34%');
  assert.equal(formatPercent(1), '100,00%');
  assert.equal(formatPercent(NaN), '0,00%');
});

// ─────────────────────────────────────────────────────────────────────
// 2. UNIDADES
// ─────────────────────────────────────────────────────────────────────
test('converterParaBase / converterDeBase / normalizarUnidade — casos canônicos e legados reconhecidos', () => {
  assert.equal(converterParaBase(1, 'kg'), 1000);
  assert.equal(converterParaBase(1, 'L'), 1000);
  assert.equal(converterParaBase(250, 'g'), 250);
  assert.equal(converterParaBase(250, 'mL'), 250);
  assert.equal(converterParaBase(3, 'un'), 3);
  assert.equal(converterParaBase(3, 'Grama(s)'), 3);    // legado: fatorBase não aplicado (passa direto) — ok p/ g
  assert.equal(converterDeBase(1500, 'kg'), 1.5);
  assert.equal(normalizarUnidade('ml'), 'mL');
  assert.equal(normalizarUnidade('Unidade(s)'), 'un');
  assert.equal(normalizarUnidade('Quilograma(s)'), 'kg');
  assert.equal(normalizarUnidade('Mililitro(s)'), 'mL');
  assert.equal(normalizarUnidade('Litro(s)'), 'L');
  assert.equal(normalizarUnidade('Quilo'), 'kg');
  assert.equal(normalizarUnidade('xyz'), null);
  assert.equal(getTipoUnidade('Unidade(s)'), 'unidade');
  assert.equal(getTipoUnidade('Mililitro(s)'), 'volume');
  assert.equal(getTipoUnidade('Quilograma(s)'), 'peso');
  assert.equal(getTipoUnidade('garbage'), 'unidade');
});

test('normalizarUnidade/getTipoUnidade reconhecem "Grama(s)" (DEFAULT do schema materias_primas/preparos)',
  () => {
    assert.equal(normalizarUnidade('Grama(s)'), 'g');
    assert.equal(getTipoUnidade('Grama(s)'), 'peso');
    // Insumo R$10/kg com unidade_medida 'Grama(s)' (seed-supabase.sql, DEFAULT do schema,
    // fallback `|| 'Grama(s)'` em ExportPDFScreen:240/400 e ListaComprasScreen:151):
    // receita usa 250 g → deve custar 2,50. Hoje: 10 × 250 = 2.500,00.
    const custo = calcCustoIngrediente(10, 250, 'Grama(s)', 'Grama(s)');
    assert.ok(close(custo, 2.5), `atual ${custo} (esperado 2.5)`);
  });

test('converterParaBase usa normalizarUnidade para variantes (KG, Kg, l, litro)',
  () => {
    assert.equal(converterParaBase(1, 'KG'), 1000);
    assert.equal(converterParaBase(1, 'Kg'), 1000);
    assert.equal(converterParaBase(1, 'l'), 1000);
    // calcPrecoBase(10, 1, 'KG'): tipo peso (normalizado) mas base = 1 → 10/1×1000 = 10.000 R$/kg
    assert.equal(calcPrecoBase(10, 1, 'KG'), 10);
  });

// ─────────────────────────────────────────────────────────────────────
// 3. INSUMO — preço base + fator de correção
// ─────────────────────────────────────────────────────────────────────
test('calcPrecoBase — R$10 por 1 kg → R$10/kg; R$10 por 500 g → R$20/kg', () => {
  assert.equal(calcPrecoBase(10, 1, 'kg'), 10);
  assert.equal(calcPrecoBase(10, 500, 'g'), 20);
  assert.equal(calcPrecoBase(5, 250, 'mL'), 20);
  assert.equal(calcPrecoBase(8, 2, 'L'), 4);
  assert.equal(calcPrecoBase(5, 250, 'ml'), 20); // dicionário grava 'ml' minúsculo — funciona por coincidência (base = mL)
  assert.ok(close(calcPrecoBase(12, 30, 'un'), 0.4)); // dúzia×2.5 = 30 ovos a R$12 → R$0,40/un
  assert.equal(calcPrecoBase(10, 0, 'kg'), 0);
  assert.equal(calcPrecoBase('10,50', '500', 'g'), 21);
  assert.equal(calcPrecoBase(-10, 1, 'kg'), -10); // negativo passa — validateForm do insumo bloqueia (valor_pago <= 0)
});

test('fator de correção — aplicado EXATAMENTE UMA VEZ (via quantidade_liquida no preco_por_kg)', () => {
  // Maracujá: paga R$10 por 1000 g bruto; rende 350 g de polpa.
  const bruta = 1000, liquida = 350, valor = 10;
  const fcForm = calcFatorCorrecao(bruta, liquida);        // 0.35 (liquida/bruta) — definição do form
  assert.ok(close(fcForm, 0.35));
  const precoPorKg = calcPrecoBase(valor, liquida, 'g');   // 28.5714 R$/kg de POLPA
  assert.ok(close(precoPorKg, 28.571428, 1e-4));
  // Receita usa 200 g de polpa → custo = 200/1000 × 28.57 = 5.714 = 10 × (200/350)
  const custo = calcCustoIngrediente(precoPorKg, 200, 'g', 'g');
  assert.ok(close(custo, 10 * 200 / 350, 1e-6));
  // calcCustoIngrediente NÃO reaplica FC (não recebe fator) → sem dupla aplicação
});

test('fator de correção — DEFINIÇÕES INVERTIDAS entre form (liq/bruta ≤ 1) e tabela de referência (bruta/liq ≥ 1)', () => {
  // fatoresCorrecao.js: FC = bruta/liquida (maracujá 2.86)
  assert.ok(close(fc.getFatorCorrecaoReferencia('Maracujá'), 2.86));
  assert.equal(fc.estimarQuantidadeLiquida(1000, 'maracujá'), 350);
  // calculations.calcFatorCorrecao: liquida/bruta (0.35) — é o valor gravado em materias_primas.fator_correcao
  assert.ok(close(calcFatorCorrecao(1000, 350), 0.35));
  // Efeito prático é consistente (líquida = bruta / FCref → form calcula 1/FCref), mas a coluna
  // fator_correcao guarda 0.35 enquanto docs/TACO falam em 2.86. Risco de mau uso futuro.
  assert.ok(close(calcFatorCorrecao(1000, fc.estimarQuantidadeLiquida(1000, 'maracujá')), 1 / 2.857, 1e-3));
  assert.equal(calcFatorCorrecao(0, 100), 1); // bruta 0 → 1
});

test('calcPrecoUnitarioEmbalagem — pacote R$30 / 100 un → R$0,30', () => {
  assert.equal(calcPrecoUnitarioEmbalagem(30, 100), 0.3);
  assert.equal(calcPrecoUnitarioEmbalagem(30, 0), 0);
  assert.equal(calcCustoEmbalagem(0.3, 2), 0.6);
});

// ─────────────────────────────────────────────────────────────────────
// 4. CUSTO DE INGREDIENTE / PREPARO (conversões)
// ─────────────────────────────────────────────────────────────────────
test('calcCustoIngrediente — conversões kg/g, L/mL, un', () => {
  // Insumo cadastrado em g (preço R$10/kg): receita usa 250 g → 2,50
  assert.ok(close(calcCustoIngrediente(10, 250, 'g', 'g'), 2.5));
  // Insumo cadastrado em kg: receita informa 0,25 (kg) → 2,50
  assert.ok(close(calcCustoIngrediente(10, 0.25, 'kg', 'kg'), 2.5));
  // Insumo em L (R$8/L) usado em mL: 200 mL → 1,60
  assert.ok(close(calcCustoIngrediente(8, 200, 'L', 'mL'), 1.6));
  // Insumo por unidade (R$0,50/un) × 3 → 1,50; unidadeUso é ignorada
  assert.ok(close(calcCustoIngrediente(0.5, 3, 'un', 'g'), 1.5));
  // Legado 'Unidade(s)' → tratado como unidade
  assert.ok(close(calcCustoIngrediente(0.5, 3, 'Unidade(s)', 'Unidade(s)'), 1.5));
  // Legado 'Mililitro(s)': volume; converterParaBase passa direto (=mL) → ok
  assert.ok(close(calcCustoIngrediente(8, 200, 'Mililitro(s)', 'Mililitro(s)'), 1.6));
  // Guardas
  assert.equal(calcCustoIngrediente(0, 250, 'g', 'g'), 0);
  assert.equal(calcCustoIngrediente(10, 0, 'g', 'g'), 0);
  assert.equal(calcCustoIngrediente(NaN, 250, 'g', 'g'), 0);
  assert.equal(calcCustoIngrediente(10, -5, 'g', 'g'), 0);
});

test('insumo LEGADO em "Quilograma(s)" — quantidade em kg convertida ×1000',
  () => {
    // preco_por_kg 10; insumo cadastrado com unidade legada 'Quilograma(s)'; receita usa 0,5 (kg) → 5,00
    const custo = calcCustoIngrediente(10, 0.5, 'Quilograma(s)', 'Quilograma(s)');
    assert.ok(close(custo, 5), `atual ${custo} (esperado 5.00)`);
  });

test('calcCustoPreparo — custo_por_kg 20, usa 250 g → 5; preparo por unidade fecha (×1000 e /1000 cancelam)', () => {
  assert.ok(close(calcCustoPreparo(20, 250, 'g'), 5));
  assert.ok(close(calcCustoPreparo(20, 0.25, 'kg'), 5));
  // Preparo "pão" rende 10 un, custo total 8 → fórmula canônica do form: 8/10×1000 = 800
  const custoPorKgUn = (8 / 10) * 1000;
  assert.ok(close(calcCustoPreparo(custoPorKgUn, 2, 'un'), 1.6));
  assert.equal(calcCustoPreparo(0, 100, 'g'), 0);
  assert.equal(calcCustoPreparo(20, 0, 'g'), 0);
});

test('AUDIT BUG (ALTO): preparo com unidade_medida "kg"/"L" — custo_por_kg sai 1000× maior (form + cascade usam rendimento×1000 sem converter)', () => {
  // Fórmula usada em PreparoFormScreen:324/436, cascadeRecalc:67-69, MateriaPrimaFormScreen:460,
  // EntityCreateModal:1348/1447, KitInicioScreen:588, ExportPDFScreen:258
  //   → custoPorKg = custoTotal / rendimento * 1000 (rendimento CRU, sem converterParaBase)
  // O picker do PreparoForm (linha 703) OFERECE kg/L (UNIDADES_MEDIDA completo).
  const custoTotal = 20, rendimento = 2, unidade = 'kg'; // "Molho" rende 2 kg
  const custoPorKgApp = (custoTotal / rendimento) * 1000; // 10.000 R$/kg  (correto: 10)
  const custoPorKgCorreto = (custoTotal / converterParaBase(rendimento, unidade)) * 1000; // 10
  assert.equal(custoPorKgCorreto, 10);
  assert.equal(custoPorKgApp, 10000);
  // Produto usa 0,5 kg do molho → app: R$ 5.000 ; correto: R$ 5
  assert.ok(close(calcCustoPreparo(custoPorKgApp, 0.5, 'kg'), 5000));
  assert.ok(close(calcCustoPreparo(custoPorKgCorreto, 0.5, 'kg'), 5));
});

test('rendimento do preparo = 0 → TRÊS implementações divergem (form 0 / cascade custoTotal / MateriaPrimaForm custoTotal×1000)', () => {
  const custoTotal = 8;
  const rend = 0;
  const viaPreparoForm = rend > 0 && Number.isFinite(custoTotal) ? (custoTotal / rend) * 1000 : 0;          // PreparoFormScreen:324
  const viaCascade = rend > 0 ? (custoTotal / rend) * 1000 : custoTotal;                                    // cascadeRecalc:67
  const rendMP = rend || 1;                                                                                 // MateriaPrimaFormScreen:459 (`|| 1`)
  const viaMateriaPrimaForm = rendMP > 0 ? (custoTotal / rendMP) * 1000 : 0;                                // :460
  assert.equal(viaPreparoForm, 0);
  assert.equal(viaCascade, 8);
  assert.equal(viaMateriaPrimaForm, 8000);
  assert.notEqual(viaCascade, viaMateriaPrimaForm);
});

// ─────────────────────────────────────────────────────────────────────
// 5. PRODUTO — divisor de rendimento / tipo de venda
// ─────────────────────────────────────────────────────────────────────
test('getDivisorRendimento / getTipoVenda — valores explícitos', () => {
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_unidade', rendimento_unidades: 20, rendimento_total: 1500 }), 20);
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_kg', rendimento_unidades: 20, rendimento_total: 1.5 }), 1.5);
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_litro', rendimento_total: '2,5' }), 2); // parseFloat('2,5') = 2 ! (só se vier string com vírgula)
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_unidade', rendimento_unidades: 0 }), 1);
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'por_kg', rendimento_total: 0 }), 1);
  assert.equal(getTipoVenda({ unidade_rendimento: 'por_kg' }), 'kg');
  assert.equal(getTipoVenda({ unidade_rendimento: 'g' }), 'unidade'); // default do form ProdutoFormScreen
});

test('getDivisorRendimento — heurística legada: produto de 40 g ("Grama(s)", rt=40) é tratado como 40 KG', () => {
  // Brigadeiro legado: unidade_rendimento default do schema 'Grama(s)', rendimento_total 40 (g), 1 unidade
  const p = { unidade_rendimento: 'Grama(s)', rendimento_total: 40, rendimento_unidades: 1 };
  assert.equal(getTipoVenda(p), 'kg');          // errado — é vendido por unidade
  assert.equal(getDivisorRendimento(p), 40);    // custo unitário = custoTotal / 40  (40× a menos)
  // Produto legado 1,5 kg salvo como rt=1500 → 'unidade', divide por rendimento_unidades (1) → custo do bolo inteiro (ok p/ unidade)
  const p2 = { unidade_rendimento: 'Grama(s)', rendimento_total: 1500, rendimento_unidades: 1 };
  assert.equal(getTipoVenda(p2), 'unidade');
  // Produto com 60 unidades e rt vazio → unidade/60 (ok)
  const p3 = { unidade_rendimento: 'Grama(s)', rendimento_total: 0, rendimento_unidades: 60 };
  assert.equal(getDivisorRendimento(p3), 60);
  // Produto vendido por kg legado com 60 kg (rt=60 > 50) → cai em unidade (errado, mas raro)
  const p4 = { unidade_rendimento: 'Quilograma(s)', rendimento_total: 60, rendimento_unidades: 1 };
  assert.equal(getTipoVenda(p4), 'unidade');
  // Produto 'Grama(s)' com 60 unidades E rt=30 (30 g cada) → kg/30 (errado: deveria ser unidade/60)
  const p5 = { unidade_rendimento: 'Grama(s)', rendimento_total: 30, rendimento_unidades: 60 };
  assert.equal(getDivisorRendimento(p5), 30);
  assert.equal(getTipoVenda(p5), 'kg');
});

test('getDivisorRendimento — NaN/strings não geram Infinity', () => {
  assert.equal(getDivisorRendimento({ unidade_rendimento: 'Grama(s)', rendimento_total: 'abc', rendimento_unidades: 'x' }), 1);
  assert.equal(getDivisorRendimento({}), 1);
});

// ─────────────────────────────────────────────────────────────────────
// 6. MARKUP / PREÇO SUGERIDO / MARGENS
// ─────────────────────────────────────────────────────────────────────
test('calcMarkup — 22,6% fixas + 8% variáveis + 15% lucro → 1,8382', () => {
  assert.ok(close(calcMarkup(0.226, 0.08, 0.15), 1 / (1 - 0.456)));
  assert.equal(calcMarkup(0.5, 0.3, 0.2), 0);      // soma = 100% → inviável → 0
  assert.equal(calcMarkup(0.6, 0.3, 0.2), 0);      // > 100%
  assert.equal(calcMarkup(-0.5, 0.1, 0.1), 1.25);  // negativos clampados a 0
  assert.equal(calcMarkup(NaN, 0.1, 0.1), 1.25);
  assert.equal(calcMarkup(0, 0, 0), 1);
});

test('calcPrecoSugerido == engine precificacao.calcularPrecoBalcao (as duas fórmulas concordam)', () => {
  const cmv = 1.88, df = 0.226, dv = 0.08, ld = 0.15;
  const viaMarkup = calcPrecoSugerido(cmv, calcMarkup(df, dv, ld));
  const viaEngine = precif.calcularPrecoBalcao({ cmv, lucroPerc: ld, fixoPerc: df, variavelPerc: dv }).preco;
  assert.ok(close(viaMarkup, viaEngine, 1e-9), `${viaMarkup} vs ${viaEngine}`);
  assert.ok(close(viaMarkup, 3.4559, 1e-3));
  // com margem de segurança 10%
  const viaMarkupMS = calcPrecoSugerido(cmv, calcMarkup(df, dv, ld), 0.1);
  const viaEngineMS = precif.calcularPrecoBalcao({ cmv, lucroPerc: ld, fixoPerc: df, variavelPerc: dv, margemSegurancaPerc: 0.1 }).preco;
  assert.ok(close(viaMarkupMS, viaEngineMS, 1e-9));
  assert.ok(close(viaMarkupMS, 3.4559 * 1.1, 1e-3));
  // ProdutoFormScreen:542 re-implementa inline: custoUnitario × (1 + ms) × markup — idêntico
  assert.ok(close(cmv * (1 + 0.1) * calcMarkup(df, dv, ld), viaMarkupMS, 1e-12));
});

test('preço sugerido → margem líquida real == lucro desejado (fecha o círculo)', () => {
  const cmv = 4, df = 0.2, dv = 0.1, ld = 0.15;
  const preco = calcPrecoSugerido(cmv, calcMarkup(df, dv, ld));
  const margem = calcMargemLiquida(preco, cmv, preco * df, preco * dv);
  assert.ok(close(margem, ld, 1e-9));
  const lucro = calcLucroLiquido(preco, cmv, preco * df, preco * dv);
  assert.ok(close(lucro, preco * ld, 1e-9));
});

test('MargemBaixaScreen.calcPrecoMetaMargem (cmv/(1-meta-df-var)) é idêntico ao markup', () => {
  const cmv = 7.5, meta = 0.2, df = 0.18, dv = 0.07;
  const viaMargemBaixa = cmv / (1 - meta - df - dv);
  assert.ok(close(viaMargemBaixa, calcPrecoSugerido(cmv, calcMarkup(df, dv, meta)), 1e-9));
});

test('RelatorioSimplesScreen:427/980 — "preço sugerido" hardcoded custoUn/0,30 DIVERGE do markup do Financeiro', () => {
  // Relatório sugere preço com CMV alvo fixo de 30% (ou +15% se sem custo), ignorando
  // despesas fixas/variáveis/lucro configurados. Mesmo produto: ProdutoForm sugere outro valor.
  const custoUn = 4, df = 0.2, dv = 0.1, ld = 0.15;
  const viaRelatorio = custoUn / 0.30;                                        // 13,33
  const viaMarkup = calcPrecoSugerido(custoUn, calcMarkup(df, dv, ld));       // 7,27
  assert.ok(close(viaRelatorio, 13.3333, 1e-3));
  assert.ok(close(viaMarkup, 7.2727, 1e-3));
  assert.ok(Math.abs(viaRelatorio - viaMarkup) > 1);
});

test('calcMargem / calcMargemLiquida / calcLucroLiquido / calcCMVPercentual — cenário R$10', () => {
  assert.equal(calcLucroLiquido(10, 4, 2, 1), 3);
  assert.equal(calcMargemLiquida(10, 4, 2, 1), 0.3);
  assert.equal(calcMargem(10, 4), 0.6);
  assert.equal(calcCMVPercentual(4, 10), 0.4);
  // preço 0 → 0 (sem Infinity)
  assert.equal(calcMargemLiquida(0, 4, 0, 0), 0);
  assert.equal(calcMargem(0, 4), 0);
  assert.equal(calcCMVPercentual(4, 0), 0);
  // prejuízo → negativo
  assert.ok(close(calcMargemLiquida(5, 4, 1.5, 0.5), -0.2));
});

test('calcDespesasFixasPercentual — faturamento 0 → 0% (custos fixos SOMEM do markup silenciosamente)', () => {
  assert.equal(calcDespesasFixasPercentual(5000, 0), 0);
  assert.equal(calcDespesasFixasPercentual(5000, 20000), 0.25);
  // Consequência: markup só com variáveis+lucro (preço não cobre fixas).
  // FinanceiroConfigScreen:583 mostra "Custos Fixos · falta faturamento"; ProdutoForm/Home/Relatório NÃO avisam.
  assert.ok(close(calcMarkup(calcDespesasFixasPercentual(5000, 0), 0.08, 0.15), 1 / 0.77));
});

test('inviabilidade — soma ≥ 100% zera markup e preço sugerido (sem NaN/Infinity)', () => {
  const mk = calcMarkup(0.5, 0.35, 0.2);
  assert.equal(mk, 0);
  assert.equal(calcPrecoSugerido(10, mk), 0);
  assert.equal(precif.validarSomaPercentual(1.05).nivel, 'inviavel');
});

test('ponto de equilíbrio — Home (fixas/(1-CMV%-var%)) vs Relatório (fixas/margem líquida média) divergem 2,5×', () => {
  const totalFixas = 6000, cmvPerc = 0.4, varPerc = 0.1;
  const peHome = totalFixas / (1 - cmvPerc - varPerc);   // HomeScreen:229-230 → 12.000/mês
  assert.equal(peHome, 12000);
  // RelatorioSimplesScreen:190-193 usa margem LÍQUIDA média (já desconta fixas%):
  // fixas% = 6000/20000 = 30% → margem líquida = 1-0.4-0.1-0.3 = 0.2 → PE = 6000/0.2 = 30.000/mês
  const fixasPerc = totalFixas / 20000;
  const margemLiq = 1 - cmvPerc - varPerc - fixasPerc;
  const peRelatorio = totalFixas / margemLiq;
  assert.equal(peRelatorio, 30000);
  assert.notEqual(peRelatorio, peHome);
  // SimuladorScreen:220 (meta): (fixas + lucro)/(1-CMV%-var%) — consistente com a Home quando lucro=0
  assert.equal((totalFixas + 0) / (1 - cmvPerc - varPerc), peHome);
});

test('MateriasPrimasScreen.reajustarEmMassa — preco_por_kg = valor/quantidade_liquida SEM conversão de unidade (1000× p/ g/mL)', () => {
  // MateriasPrimasScreen:443-444: novoPrecoKg = novoValor / qtdLiq (sem calcPrecoBase)
  const item = { valor_pago: 6, quantidade_liquida: 1000, unidade_medida: 'g' }; // farinha 1 kg R$6
  const novoValor = item.valor_pago * 1.1;                                       // +10% → 6,60
  const viaBulk = novoValor / (Number(item.quantidade_liquida) || 1);             // 0,0066 R$/kg
  const correto = calcPrecoBase(novoValor, item.quantidade_liquida, item.unidade_medida); // 6,60 R$/kg
  assert.ok(close(viaBulk, 0.0066));
  assert.ok(close(correto, 6.6));
  assert.ok(close(correto / viaBulk, 1000));
  // Mesmo insumo reajustado em AtualizarPrecosScreen:135-136 (usa calcPrecoBase) → 6,60 ✓
  // Ovos (30 un, R$12): bulk → 12×1.1/30 = 0,44 ✓ (coincide só p/ 'un')
  assert.ok(close(13.2 / 30, calcPrecoBase(13.2, 30, 'un')));
});

test('MateriaPrimaFormScreen:1263 (botão Salvar) — preco_por_kg do histórico = vp/(ql/1000) ignora unidade', () => {
  // Ovos: vp=12, ql=30 un → histórico grava 400 R$/un (correto 0,40); kg: vp=10, ql=1 → 10.000 (correto 10)
  const pbHist = (vp, ql) => (ql > 0 ? vp / (ql / 1000) : 0);
  assert.equal(pbHist(12, 30), 400);
  assert.ok(close(calcPrecoBase(12, 30, 'un'), 0.4));
  assert.equal(pbHist(10, 1), 10000);
  assert.equal(calcPrecoBase(10, 1, 'kg'), 10);
  assert.equal(pbHist(6, 1000), 6);                 // só bate para g/mL
  assert.equal(calcPrecoBase(6, 1000, 'g'), 6);
});
