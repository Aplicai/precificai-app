/**
 * AUDIT (Agente 9 — Fluxo de Caixa + DRE) — ver relatório a9-dre.md.
 *
 * `FluxoCaixaDREScreen.js` importa react-native (View/Text/...), então não é
 * importável em Node. Os helpers abaixo marcados "REPLICADO" são cópias
 * fiéis (mesma lógica, mesmas linhas citadas) das funções locais do screen —
 * qualquer mudança na fonte deve ser espelhada aqui. `parseDecimalBROrZero`
 * e `formatCurrency` são importados de verdade de `src/utils/calculations.js`
 * (módulo puro, sem react-native) via o loader de audit-loader.mjs.
 *
 * Rodar: node --test '__tests__/audit-dre.test.mjs'
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { register } from 'node:module';

register('./audit-loader.mjs', import.meta.url);

const calc = await import('../src/utils/calculations.js');
const { parseDecimalBROrZero, formatCurrency } = calc;

// ───────────────────────────────────────────────────────────────────
// REPLICADO de FluxoCaixaDREScreen.js (linhas 41-102) — helpers puros.
// ───────────────────────────────────────────────────────────────────
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidDateStr(s) {
  if (!s || typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

function formatBRNumber(n) {
  const num = safeNum(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function sanitizeCurrencyInput(raw) {
  if (raw == null) return '';
  let s = String(raw).replace(/[^\d.,]/g, '');
  const firstComma = s.indexOf(',');
  if (firstComma >= 0) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  }
  const parts = s.split(',');
  if (parts.length === 2 && parts[1].length > 2) {
    s = parts[0] + ',' + parts[1].slice(0, 2);
  }
  return s;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function getMonthKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }
function monthRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${pad2(last)}` };
}
function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return getMonthKey(date);
}

// REPLICADO — fórmula DRE (linhas 295-302).
function dreLinhas(dreNum) {
  const receitaLiquida = dreNum.receitaBruta - dreNum.deducoes - dreNum.devolucoes;
  const lucroBruto = receitaLiquida - dreNum.cmv;
  const totalOperacionais = dreNum.despesasFixas + dreNum.despesasVariaveis;
  const lucroOperacional = lucroBruto - totalOperacionais;
  const lucroLiquido = lucroOperacional - dreNum.outrasDespesas + dreNum.outrasReceitas;
  return { receitaLiquida, lucroBruto, totalOperacionais, lucroOperacional, lucroLiquido };
}

// REPLICADO — mapeamento "Importar do Fluxo" (linhas 427-465), extraído em
// função pura (a original também tem side-effects de setState que não
// testamos aqui).
const SAIDAS_FIXAS = ['Salários', 'Aluguel', 'Energia/Água', 'Internet/Telefone', 'Manutenção'];
function importarDoFluxoCalc(movimentos) {
  let receita = 0, outrasRec = 0, cmv = 0, despFixas = 0, despVar = 0, deducoes = 0, outrasDesp = 0;
  let totalSaidas = 0;
  for (const m of movimentos) {
    const cat = String(m.categoria || '');
    const v = safeNum(m.valor);
    if (m.tipo === 'entrada') {
      if (cat === 'Outras Receitas') outrasRec += v;
      else receita += v;
    } else {
      totalSaidas += v;
      if (cat === 'Insumos' || cat === 'Embalagens') cmv += v;
      else if (SAIDAS_FIXAS.includes(cat)) despFixas += v;
      else if (cat === 'Marketing') despVar += v;
      else if (cat === 'Impostos') deducoes += v;
      else outrasDesp += v;
    }
  }
  return { receita, outrasRec, cmv, despFixas, despVar, deducoes, outrasDesp, totalSaidas };
}

// ───────────────────────────────────────────────────────────────────
// 1. Fórmula da DRE — cenário do brief (a9-dre): receita 10.000, CMV 3.000,
//    despesas variáveis R$1.150 (= 11,5% de 10.000), fixas 2.000
//    → lucro operacional esperado 3.850 = 38,5% da receita.
// ───────────────────────────────────────────────────────────────────
test('DRE — receita 10000, CMV 3000, variaveis 1150 (11,5%), fixas 2000 -> lucro 3850 (38,5%)', () => {
  const dreNum = {
    receitaBruta: 10000, deducoes: 0, devolucoes: 0, cmv: 3000,
    despesasFixas: 2000, despesasVariaveis: 1150,
    outrasDespesas: 0, outrasReceitas: 0,
  };
  const linhas = dreLinhas(dreNum);
  assert.equal(linhas.receitaLiquida, 10000);
  assert.equal(linhas.lucroBruto, 7000);
  assert.equal(linhas.totalOperacionais, 3150);
  assert.equal(linhas.lucroOperacional, 3850);
  assert.equal(linhas.lucroLiquido, 3850);
  const pct = (linhas.lucroOperacional / dreNum.receitaBruta) * 100;
  assert.ok(Math.abs(pct - 38.5) < 1e-9, `esperado 38,5%, obtido ${pct}%`);
});

test('DRE — deduções e devoluções entram antes do CMV (receita liquida)', () => {
  const dreNum = {
    receitaBruta: 10000, deducoes: 500, devolucoes: 200, cmv: 3000,
    despesasFixas: 0, despesasVariaveis: 0, outrasDespesas: 0, outrasReceitas: 0,
  };
  const linhas = dreLinhas(dreNum);
  assert.equal(linhas.receitaLiquida, 9300);
  assert.equal(linhas.lucroBruto, 6300);
});

test('DRE — outras receitas somam e outras despesas subtraem do lucro liquido', () => {
  const dreNum = {
    receitaBruta: 10000, deducoes: 0, devolucoes: 0, cmv: 3000,
    despesasFixas: 2000, despesasVariaveis: 1150,
    outrasDespesas: 300, outrasReceitas: 100,
  };
  const linhas = dreLinhas(dreNum);
  assert.equal(linhas.lucroOperacional, 3850);
  assert.equal(linhas.lucroLiquido, 3850 - 300 + 100);
});

test('DRE — prejuizo (fixas+variaveis > lucro bruto) fica negativo, sem clamp em zero', () => {
  const dreNum = {
    receitaBruta: 5000, deducoes: 0, devolucoes: 0, cmv: 2000,
    despesasFixas: 2500, despesasVariaveis: 1200,
    outrasDespesas: 0, outrasReceitas: 0,
  };
  const linhas = dreLinhas(dreNum);
  assert.equal(linhas.lucroBruto, 3000);
  assert.equal(linhas.lucroOperacional, -700);
});

// ───────────────────────────────────────────────────────────────────
// 2. parseDecimalBROrZero / formatCurrency (import REAL de calculations.js)
//    — usados no autosave; nunca podem produzir NaN gravado no banco.
// ───────────────────────────────────────────────────────────────────
test('parseDecimalBROrZero — campo vazio/invalido nunca gera NaN (autosave seguro)', () => {
  assert.equal(parseDecimalBROrZero(''), 0);
  assert.equal(parseDecimalBROrZero(undefined), 0);
  assert.equal(parseDecimalBROrZero(null), 0);
  assert.equal(parseDecimalBROrZero('abc'), 0);
  assert.equal(parseDecimalBROrZero('1.150,00'), 1150);
  assert.equal(parseDecimalBROrZero('1150'), 1150);
});

test('formatCurrency — nunca retorna NaN/undefined na UI', () => {
  assert.equal(formatCurrency(NaN), 'R$ 0,00');
  assert.equal(formatCurrency(undefined), 'R$ 0,00');
  assert.equal(formatCurrency(3850), 'R$ 3.850,00');
});

// ───────────────────────────────────────────────────────────────────
// 3. sanitizeCurrencyInput / formatBRNumber — máscara de moeda digitada.
// ───────────────────────────────────────────────────────────────────
test('sanitizeCurrencyInput — mantém so 1a virgula e 2 casas decimais', () => {
  assert.equal(sanitizeCurrencyInput('1,150,50'), '1,15'); // 2a virgula descartada, so 2 casas
  assert.equal(sanitizeCurrencyInput('abc123,456'), '123,45');
  assert.equal(sanitizeCurrencyInput(''), '');
  assert.equal(sanitizeCurrencyInput(null), '');
});

test('formatBRNumber — separador de milhar pt-BR', () => {
  assert.equal(formatBRNumber(1150), '1.150,00');
  assert.equal(formatBRNumber(3850), '3.850,00');
  assert.equal(formatBRNumber('não é número'), '0,00');
});

// ───────────────────────────────────────────────────────────────────
// 4. Mês (monthRange/shiftMonth) — sem bug de fuso (usa componentes
//    locais de Date, não parsing de string ISO).
// ───────────────────────────────────────────────────────────────────
test('monthRange — setembro/2026 tem 30 dias', () => {
  assert.deepEqual(monthRange('2026-09'), { start: '2026-09-01', end: '2026-09-30' });
});

test('monthRange — fevereiro/2027 (nao bissexto) tem 28 dias', () => {
  assert.deepEqual(monthRange('2027-02'), { start: '2027-02-01', end: '2027-02-28' });
});

test('monthRange — fevereiro/2028 (bissexto) tem 29 dias', () => {
  assert.deepEqual(monthRange('2028-02'), { start: '2028-02-01', end: '2028-02-29' });
});

test('shiftMonth — rollover de ano (dezembro -> janeiro e vice-versa)', () => {
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2027-01', -1), '2026-12');
});

test('isValidDateStr — rejeita datas inexistentes (31/02, 30/02) e aceita validas', () => {
  assert.equal(isValidDateStr('2026-02-31'), false);
  assert.equal(isValidDateStr('2026-02-30'), false);
  assert.equal(isValidDateStr('2026-02-29'), false); // 2026 nao é bissexto
  assert.equal(isValidDateStr('2028-02-29'), true); // 2028 é bissexto
  assert.equal(isValidDateStr('2026-09-09'), true);
  assert.equal(isValidDateStr('09/09/2026'), false);
});

// ───────────────────────────────────────────────────────────────────
// 5. "Importar do Fluxo" — mapeamento categoria -> linha da DRE
//    (linhas 427-465 do screen).
// ───────────────────────────────────────────────────────────────────
test('importarDoFluxo — mapeia categorias de entrada/saida para as linhas certas da DRE', () => {
  const movimentos = [
    { tipo: 'entrada', categoria: 'Vendas Balcão', valor: 6000 },
    { tipo: 'entrada', categoria: 'Vendas Delivery', valor: 3000 },
    { tipo: 'entrada', categoria: 'Outras Receitas', valor: 100 },
    { tipo: 'saida', categoria: 'Insumos', valor: 2500 },
    { tipo: 'saida', categoria: 'Embalagens', valor: 500 },
    { tipo: 'saida', categoria: 'Salários', valor: 1500 },
    { tipo: 'saida', categoria: 'Aluguel', valor: 500 },
    { tipo: 'saida', categoria: 'Marketing', valor: 300 },
    { tipo: 'saida', categoria: 'Impostos', valor: 200 },
    { tipo: 'saida', categoria: 'Outros', valor: 150 },
  ];
  const r = importarDoFluxoCalc(movimentos);
  assert.equal(r.receita, 9000); // Balcão + Delivery (Outras Receitas NÃO entra aqui)
  assert.equal(r.outrasRec, 100);
  assert.equal(r.cmv, 3000); // Insumos + Embalagens
  assert.equal(r.despFixas, 2000); // Salários + Aluguel
  assert.equal(r.despVar, 300); // Marketing
  assert.equal(r.deducoes, 200); // Impostos
  assert.equal(r.outrasDesp, 150); // Outros
  assert.equal(r.totalSaidas, 2500 + 500 + 1500 + 500 + 300 + 200 + 150);
});

test('importarDoFluxo — categoria de saida desconhecida cai em "Outras Despesas" (nao é perdida)', () => {
  const movimentos = [{ tipo: 'saida', categoria: 'Categoria Nova Que Não Existia', valor: 999 }];
  const r = importarDoFluxoCalc(movimentos);
  assert.equal(r.outrasDesp, 999);
  assert.equal(r.cmv, 0);
  assert.equal(r.despFixas, 0);
});

// ───────────────────────────────────────────────────────────────────
// 6. AUDIT — documenta a ambiguidade "vazio real vs. erro" apontada no
//    achado CRÍTICO do a9-dre.md: getAllAsync/getFirstAsync devolvem o
//    mesmo formato ([] / null) tanto quando não há dados quanto quando a
//    query falhou (erro de rede/Supabase). A tela NUNCA chama
//    `isDbErrorResult` (exportado por supabaseDb.js) para diferenciar os
//    dois casos antes de usar o valor no autosave. Este teste apenas
//    documenta o contrato hoje — não é uma alegação de que isso é
//    correto (ver a9-dre.md, achado CRÍTICO #1/#2).
// ───────────────────────────────────────────────────────────────────
test('AUDIT doc — "nenhuma despesa fixa" e "falha ao buscar despesas fixas" produzem o MESMO total (0)', () => {
  // Simula o reduce da tela (linha 205): soma de `rows` vinda de getAllAsync.
  const semDespesas = []; // caso real: usuário não cadastrou nada no Financeiro
  const erroDeRede = []; // caso de erro: getAllAsync devolve [] (markErrorResult) e a tela ignora a marca
  const total = (rows) => rows.reduce((s, d) => s + safeNum(d.valor), 0);
  assert.equal(total(semDespesas), 0);
  assert.equal(total(erroDeRede), 0);
  // A tela não tem como distinguir os dois casos acima (ambos batem 0) e,
  // com o toggle "Usar do Financeiro" ligado, PERSISTE esse 0 em dre_mensal
  // via autosave (linhas 216-223 + 308-335) — corrompendo a DRE do mês em
  // caso de falha transitória. Ver a9-dre.md.
});
