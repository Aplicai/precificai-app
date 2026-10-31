/**
 * Testes — Preço rápido (primeiro acesso, 16/10/2026).
 * src/utils/precoRapido.js (conta) e src/services/precoRapidoService.js (gravação).
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/precoRapido.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calcularPrecoRapido, parseValorBR, LUCRO_PADRAO, camposDoPrecoPreenchidos, TEXTO_RESULTADO_VAZIO } from '../src/utils/precoRapido.js';
import { salvarPrecoRapido, garantirFinanceiro, MESES, TAXAS_PADRAO_DESCRICAO } from '../src/services/precoRapidoService.js';
import { salvarPrecoMontado } from '../src/services/montarReceitaService.js';
import { montarStatusFinanceiro } from '../src/utils/financeiroStatus.js';
import { calcMarkup, buildPricingConfig } from '../src/utils/calculations.js';

const perto = (a, b, m) => assert.ok(Math.abs(a - b) < 1e-6, `${m ?? ''} esperado ${b}, veio ${a}`);
const base = { custoReceita: '40', rendimento: '20', gastoMes: '2.000', vendaMes: '8.000' };

test('preço = custo por unidade × markup do Financeiro (custos do mês + 15% de lucro)', () => {
  const r = calcularPrecoRapido(base);
  assert.equal(r.ok, true);
  perto(r.custoUnit, 2);
  perto(r.fixosPerc, 0.25);
  const markup = calcMarkup(0.25, 0, LUCRO_PADRAO);
  perto(r.preco, 2 * markup);
  // Mesmo número que o app calcula com o Financeiro preenchido assim.
  const pc = buildPricingConfig({
    cfgs: [{ lucro_desejado: 0.15 }], fixas: [{ valor: 2000 }], vars: [], fat: [{ valor: 8000 }],
  });
  perto(r.preco, 2 * pc.markup);
  // As partes somam o preço.
  perto(r.partes.custo + r.partes.gastos + r.partes.lucro, r.preco);
  perto(r.partes.gastos, r.preco * 0.25);
  perto(r.partes.lucro, r.preco * 0.15);
});

test('comparação com o preço de hoje', () => {
  const baixo = calcularPrecoRapido({ ...base, cobraHoje: '3' });
  assert.equal(baixo.comparacao.situacao, 'abaixo');
  perto(baixo.comparacao.diferenca, baixo.preco - 3);
  const alto = calcularPrecoRapido({ ...base, cobraHoje: '10' });
  assert.equal(alto.comparacao.situacao, 'cobre');
  assert.equal(calcularPrecoRapido(base).comparacao, null);
});

test('ponto de milhar nos valores do mês', () => {
  const r = calcularPrecoRapido({ ...base, gastoMes: '2.000', vendaMes: '12.500,00' });
  perto(r.fixosPerc, 2000 / 12500);
  perto(calcularPrecoRapido({ ...base, gastoMes: 'R$ 1.500', vendaMes: '6000' }).fixosPerc, 0.25);
});

test('números em PT-BR e entradas faltando', () => {
  perto(calcularPrecoRapido({ ...base, custoReceita: '1.250,50', rendimento: '10' }).custoUnit, 125.05);
  const faltando = calcularPrecoRapido({ custoReceita: '', rendimento: '20', gastoMes: '', vendaMes: '8000' });
  assert.equal(faltando.ok, false);
  assert.ok(faltando.erros.custoReceita && faltando.erros.gastoMes);
  assert.ok(!faltando.erros.rendimento);
});

test('gastos do mês maiores que as vendas não fecham a conta', () => {
  const r = calcularPrecoRapido({ ...base, gastoMes: '9000', vendaMes: '8000' });
  assert.equal(r.ok, false);
  assert.equal(r.inviavel, true);
  assert.equal(r.preco, 0);
});

test('gasto do mês zero é permitido (quem trabalha em casa sem custo fixo)', () => {
  const r = calcularPrecoRapido({ ...base, gastoMes: '0' });
  assert.equal(r.ok, true);
  perto(r.preco, 2 / 0.85);
});

test('cartão de resultado: neutro até a pessoa pôr custo, rendimento e números do mês', () => {
  assert.equal(camposDoPrecoPreenchidos({ custoReceita: '', rendimento: '', gastoMes: '', vendaMes: '' }), false);
  assert.equal(camposDoPrecoPreenchidos({ custoReceita: '40', rendimento: '20', gastoMes: '', vendaMes: '8.000' }), false);
  assert.equal(camposDoPrecoPreenchidos({ custoReceita: '40', rendimento: '20', gastoMes: ' ', vendaMes: '8.000' }), false);
  assert.equal(camposDoPrecoPreenchidos({ custoReceita: undefined, rendimento: '20', gastoMes: '0', vendaMes: '8.000' }), false);
  // Gasto do mês "0" conta como preenchido (quem trabalha em casa sem custo fixo).
  assert.equal(camposDoPrecoPreenchidos({ custoReceita: '40', rendimento: '20', gastoMes: '0', vendaMes: '8.000' }), true);
  // Custo vindo da receita montada chega como número.
  assert.equal(camposDoPrecoPreenchidos({ custoReceita: 8.145, rendimento: 12, gastoMes: '2.000', vendaMes: '8.000' }), true);
  assert.equal(typeof TEXTO_RESULTADO_VAZIO, 'string');
  assert.ok(TEXTO_RESULTADO_VAZIO.length > 0 && !TEXTO_RESULTADO_VAZIO.includes('—'));
});

function dbFalso({ fat = [], fixas = [], cfgs = [], vars = [], falharEm } = {}) {
  const chamadas = [];
  let id = 500;
  return {
    chamadas,
    async getAllAsync(sql) {
      if (sql.includes('faturamento_mensal')) return fat;
      if (sql.includes('despesas_fixas')) return fixas;
      if (sql.includes('despesas_variaveis')) return vars;
      if (sql.includes('configuracao')) return cfgs;
      return [];
    },
    async runAsync(sql, params) {
      chamadas.push({ sql: sql.replace(/\s+/g, ' ').trim(), params });
      if (falharEm && falharEm(sql)) throw new Error('falha simulada');
      id += 1;
      return { lastInsertRowId: id };
    },
  };
}

const entrada = { nome: 'Bolo de chocolate', ...base, cobraHoje: '3,50' };

test('conta nova: cria Financeiro, custo estimado, produto com preço e ligação', async () => {
  const db = dbFalso();
  const r = await salvarPrecoRapido(db, entrada);
  const sqls = db.chamadas.map((c) => c.sql);
  assert.ok(sqls.includes('INSERT INTO configuracao (lucro_desejado, margem_seguranca) VALUES (0.15, 0)'));
  const fat = db.chamadas.filter((c) => c.sql.startsWith('INSERT INTO faturamento_mensal'));
  assert.equal(fat.length, 12);
  assert.deepEqual(fat.map((c) => c.params[0]), MESES);
  assert.ok(fat.every((c) => c.params[1] === 8000));
  const fixa = db.chamadas.find((c) => c.sql.startsWith('INSERT INTO despesas_fixas'));
  assert.deepEqual(fixa.params, ['Gastos do mês (estimativa)', 2000]);
  // Custos por venda: uma linha de 0% (visível e editável no Financeiro) para o
  // Financeiro ficar completo e nenhum aviso "pendente" aparecer depois do 1º preço.
  const variavel = db.chamadas.filter((c) => c.sql.startsWith('INSERT INTO despesas_variaveis'));
  assert.equal(variavel.length, 1);
  assert.deepEqual(variavel[0].params, [TAXAS_PADRAO_DESCRICAO, 0]);
  assert.ok(!TAXAS_PADRAO_DESCRICAO.includes('—'));
  // Nome sem "cartão/maquininha": o Financeiro só aceita UMA taxa de cartão e
  // a pessoa precisa conseguir adicionar a dela depois.
  assert.ok(!/maquin|cart[aã]o|cr[eé]dito|d[eé]bito/i.test(TAXAS_PADRAO_DESCRICAO));
  const mp = db.chamadas.find((c) => c.sql.startsWith('INSERT INTO materias_primas'));
  assert.equal(mp.sql, 'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)');
  assert.deepEqual(mp.params, ['Receita do Bolo de chocolate (custo estimado)', '', null, 1, 1, 1, 'un', 40, 40]);
  const prod = db.chamadas.find((c) => c.sql.startsWith('INSERT INTO produtos'));
  assert.equal(prod.params[0], 'Bolo de chocolate');
  assert.equal(prod.params[3], 'por_unidade');
  assert.equal(prod.params[4], 20);
  assert.ok(prod.params[6] > 0);
  const lig = db.chamadas.find((c) => c.sql.startsWith('INSERT INTO produto_ingredientes'));
  assert.deepEqual(lig.params, [r.produtoId, r.materiaId, 1]);
});

test('Financeiro já preenchido não é sobrescrito; meses zerados recebem as vendas', async () => {
  const comDados = dbFalso({ fat: [{ id: 1, valor: 5000 }], fixas: [{ id: 9, valor: 100 }], cfgs: [{ id: 3, lucro_desejado: 0.2 }], vars: [{ id: 4, descricao: 'Taxa da maquininha', percentual: 0.035 }] });
  await salvarPrecoRapido(comDados, entrada);
  const sqls = comDados.chamadas.map((c) => c.sql);
  assert.ok(!sqls.some((s) => s.includes('faturamento_mensal')));
  assert.ok(!sqls.some((s) => s.includes('despesas_fixas')));
  assert.ok(!sqls.some((s) => s.includes('despesas_variaveis')));
  assert.ok(!sqls.some((s) => s.includes('INSERT INTO configuracao')));

  const zerados = dbFalso({ fat: [{ id: 1, valor: 0 }, { id: 2, valor: 0 }], cfgs: [{ id: 3, lucro_desejado: 0.15 }] });
  await salvarPrecoRapido(zerados, entrada);
  const upd = zerados.chamadas.filter((c) => c.sql.startsWith('UPDATE faturamento_mensal'));
  assert.deepEqual(upd.map((c) => c.params), [[8000, 1], [8000, 2]]);
});

test('falha no produto apaga o custo estimado criado', async () => {
  const db = dbFalso({ falharEm: (sql) => sql.includes('INSERT INTO produtos') });
  await assert.rejects(() => salvarPrecoRapido(db, entrada), /falha simulada/);
  assert.ok(db.chamadas.some((c) => c.sql === 'DELETE FROM materias_primas WHERE id = ?'));
});

test('entrada inválida não grava nada', async () => {
  const db = dbFalso();
  await assert.rejects(() => salvarPrecoRapido(db, { ...entrada, custoReceita: '' }));
  await assert.rejects(() => salvarPrecoRapido(db, { ...entrada, nome: ' ' }));
  assert.equal(db.chamadas.length, 0);
});

test('2º produto: usa lucro, taxas e margem de segurança da conta (mesma conta do app)', async () => {
  const { calcMarkup, calcPrecoSugerido } = await import('../src/utils/calculations.js');
  const r = calcularPrecoRapido({ custoReceita: '40', rendimento: '20', gastoMes: '2000', vendaMes: '8000', lucro: 0.2, taxasPerc: 0.05, margemSeguranca: 0.1 });
  assert.equal(r.ok, true);
  const esperado = calcPrecoSugerido(2, calcMarkup(0.25, 0.05, 0.2), 0.1);
  assert.ok(Math.abs(r.preco - esperado) < 1e-9);
  // As partes somam o preço.
  const soma = r.partes.custo + r.partes.seguranca + r.partes.gastos + r.partes.taxas + r.partes.lucro;
  assert.ok(Math.abs(soma - r.preco) < 1e-9);
});

test('número já calculado não é relido como texto (8.145 não vira 8145)', () => {
  assert.equal(parseValorBR(8.145), 8.145);
  assert.equal(parseValorBR(1234.5), 1234.5);
  assert.equal(parseValorBR(NaN), null);
  const a = calcularPrecoRapido({ custoReceita: 8.145, rendimento: 12, gastoMes: '2.000', vendaMes: '8.000' });
  const b = calcularPrecoRapido({ custoReceita: '8,145', rendimento: '12', gastoMes: '2.000', vendaMes: '8.000' });
  assert.ok(Math.abs(a.preco - b.preco) < 1e-9);
  assert.ok(a.preco < 2);
});

/**
 * Banco falso COM estado: guarda o que foi inserido, para conferir o status do
 * Financeiro do jeito que getFinanceiroStatus/setupStatus/Home contam
 * (configuracao com lucro > 0, faturamento com valor > 0, 1+ despesa fixa,
 * 1+ despesa variável).
 */
function dbComEstado() {
  const tabelas = { configuracao: [], faturamento_mensal: [], despesas_fixas: [], despesas_variaveis: [], materias_primas: [], embalagens: [], produtos: [], produto_ingredientes: [], produto_embalagens: [] };
  let id = 1;
  const tabelaDe = (sql) => Object.keys(tabelas).find((t) => new RegExp(`\\b${t}\\b`).test(sql));
  return {
    tabelas,
    async getAllAsync(sql) { return [...(tabelas[tabelaDe(sql)] || [])]; },
    async runAsync(sql, params = []) {
      const t = tabelaDe(sql);
      if (/^\s*INSERT INTO configuracao/i.test(sql)) {
        const m = sql.match(/VALUES \(([^,]+), ([^)]+)\)/);
        tabelas.configuracao.push({ id: id++, lucro_desejado: Number(m[1]), margem_seguranca: Number(m[2]) });
      } else if (/^\s*INSERT INTO faturamento_mensal/i.test(sql)) {
        tabelas.faturamento_mensal.push({ id: id++, mes: params[0], valor: params[1] });
      } else if (/^\s*INSERT INTO despesas_fixas/i.test(sql)) {
        tabelas.despesas_fixas.push({ id: id++, descricao: params[0], valor: params[1] });
      } else if (/^\s*INSERT INTO despesas_variaveis/i.test(sql)) {
        tabelas.despesas_variaveis.push({ id: id++, descricao: params[0], percentual: params[1] });
      } else if (/^\s*INSERT/i.test(sql) && t) {
        tabelas[t].push({ id: id++, params });
      }
      return { lastInsertRowId: id - 1 };
    },
  };
}

function statusDoBanco(db) {
  const cfg = db.tabelas.configuracao[0] ?? null;
  return montarStatusFinanceiro({
    lucroOk: cfg != null && cfg.lucro_desejado > 0,
    faturamentoOk: db.tabelas.faturamento_mensal.filter((f) => f.valor > 0).length >= 1,
    fixasOk: db.tabelas.despesas_fixas.length > 0,
    variaveisOk: db.tabelas.despesas_variaveis.length > 0,
  });
}

test('depois do Preço rápido o Financeiro fica completo: nenhum aviso "pendente"', async () => {
  const db = dbComEstado();
  assert.equal(statusDoBanco(db).completo, false);
  await salvarPrecoRapido(db, entrada);
  const s = statusDoBanco(db);
  assert.equal(s.completo, true, JSON.stringify(s.etapas));
  assert.deepEqual(db.tabelas.despesas_variaveis.map((d) => [d.descricao, d.percentual]), [[TAXAS_PADRAO_DESCRICAO, 0]]);
  // A linha de 0% não muda o preço (taxas somam 0 no markup).
  const pc = buildPricingConfig({ cfgs: db.tabelas.configuracao, fixas: db.tabelas.despesas_fixas, vars: db.tabelas.despesas_variaveis, fat: db.tabelas.faturamento_mensal });
  perto(pc.despVarPerc, 0);
  perto(pc.markup, calcMarkup(0.25, 0, LUCRO_PADRAO));
});

test('gasto do mês 0 também deixa o Financeiro completo (custos do mês: linha de R$ 0)', async () => {
  const db = dbComEstado();
  await salvarPrecoRapido(db, { ...entrada, gastoMes: '0' });
  const s = statusDoBanco(db);
  assert.equal(s.completo, true, JSON.stringify(s.etapas));
  assert.deepEqual(db.tabelas.despesas_fixas.map((d) => d.valor), [0]);
});

test('receita montada passa pelo mesmo garantirFinanceiro: Financeiro completo', async () => {
  const db = dbComEstado();
  const itens = [{ nome: 'Farinha', q: 500, un: 'g', preco: 5, contaId: null, emb: false }];
  await salvarPrecoMontado(db, { nome: 'Bolo', itens, rende: 10, custoReceita: 2.5, gastoMes: '2.000', vendaMes: '8.000', cobraHoje: '' });
  assert.equal(statusDoBanco(db).completo, true);
});

test('garantirFinanceiro só semeia a linha de 0% quando não há custo por venda', async () => {
  const db = dbComEstado();
  db.tabelas.despesas_variaveis.push({ id: 99, descricao: 'Imposto', percentual: 0.06 });
  await garantirFinanceiro(db, { vendaMes: 8000, gastoMes: 2000 });
  assert.equal(db.tabelas.despesas_variaveis.length, 1);
  // Chamar de novo (2º produto) não duplica nada.
  await garantirFinanceiro(db, { vendaMes: 9000, gastoMes: 2500 });
  assert.equal(db.tabelas.despesas_variaveis.length, 1);
  assert.equal(db.tabelas.despesas_fixas.length, 1);
  assert.equal(db.tabelas.faturamento_mensal.length, 12);
  assert.equal(db.tabelas.configuracao.length, 1);
});
