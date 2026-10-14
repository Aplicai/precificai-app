/**
 * Testes — src/components/financeiro/wizardSteps.js (wizard financeiro guiado).
 * Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  WIZARD_STEPS, SUGESTOES_LUCRO, MARKUP_NAO_FECHA,
  wizardProgressLabel, deveMostrarWizard, passoConcluido, primeiroPassoPendente,
  validarLucroInput, validarFaturamentoInput, fracaoParaInputPercentual, formatMarkup,
  exemploMargemEmReais,
} from '../src/components/financeiro/wizardSteps.js';
import { montarStatusFinanceiro } from '../src/utils/financeiroStatus.js';

// Mesma regra de "completo" da tela (margem + faturamento; custos opcionais).
function status(done) {
  return montarStatusFinanceiro({
    lucroOk: !!done.lucro, faturamentoOk: !!done.faturamento,
    fixasOk: !!done.fixas, variaveisOk: !!done.variaveis,
  });
}

test('WIZARD_STEPS: 4 passos na ordem margem → faturamento → fixas → variáveis, com copy curta', () => {
  assert.deepEqual(WIZARD_STEPS.map(s => s.key), ['lucro', 'faturamento', 'fixas', 'variaveis']);
  for (const s of WIZARD_STEPS) {
    assert.ok(s.titulo && s.ajuda && s.exemplo && s.pendente, `passo ${s.key} incompleto`);
    assert.ok(s.ajuda.length <= 90, `ajuda de ${s.key} longa demais (${s.ajuda.length})`);
    assert.ok(s.exemplo.startsWith('Ex.:'), `exemplo de ${s.key} deve começar com "Ex.:"`);
  }
  assert.deepEqual(SUGESTOES_LUCRO, [10, 20, 30]);
});

test('WIZARD_STEPS: só custos (fixas/variaveis) são opcionais; margem e faturamento são núcleo', () => {
  assert.deepEqual(WIZARD_STEPS.filter(s => s.opcional === true).map(s => s.key), ['fixas', 'variaveis']);
  assert.equal(WIZARD_STEPS.find(s => s.key === 'lucro').opcional, undefined);
  assert.equal(WIZARD_STEPS.find(s => s.key === 'faturamento').opcional, undefined);
});

test('WIZARD_STEPS: copy em reais e linguagem do dia a dia (sem jargão contábil)', () => {
  const lucro = WIZARD_STEPS.find(s => s.key === 'lucro');
  assert.ok(lucro.titulo.includes('R$ 100'), 'margem perguntada em cima de R$ 100');
  const fixas = WIZARD_STEPS.find(s => s.key === 'fixas');
  assert.ok(/aluguel/i.test(fixas.ajuda + fixas.exemplo));
  const variaveis = WIZARD_STEPS.find(s => s.key === 'variaveis');
  assert.ok(/cart[ãa]o/i.test(variaveis.ajuda));
  const texto = WIZARD_STEPS.map(s => `${s.titulo} ${s.ajuda} ${s.exemplo}`).join(' ');
  for (const jargao of ['pró-labore', 'Percentuais descontados', '% do preço']) {
    assert.ok(!texto.includes(jargao), `jargão "${jargao}" ainda no wizard`);
  }
});

test('exemploMargemEmReais: "Em R$ 100 vendidos, sobram R$ X" a partir do input em %', () => {
  assert.equal(exemploMargemEmReais('20'), 'Em R$ 100 vendidos, sobram R$ 20');
  assert.equal(exemploMargemEmReais('12,5'), 'Em R$ 100 vendidos, sobram R$ 12,50');
  assert.equal(exemploMargemEmReais('30.0'), 'Em R$ 100 vendidos, sobram R$ 30');
  assert.equal(exemploMargemEmReais('0'), '');
  assert.equal(exemploMargemEmReais(''), '');
  assert.equal(exemploMargemEmReais('abc'), '');
  assert.equal(exemploMargemEmReais('150'), '');
});

test('wizardProgressLabel: "Passo N de 4", com clamp', () => {
  assert.equal(wizardProgressLabel(0), 'Passo 1 de 4');
  assert.equal(wizardProgressLabel(1), 'Passo 2 de 4');
  assert.equal(wizardProgressLabel(3), 'Passo 4 de 4');
  assert.equal(wizardProgressLabel(9), 'Passo 4 de 4');
  assert.equal(wizardProgressLabel(-2), 'Passo 1 de 4');
  assert.equal(wizardProgressLabel(undefined), 'Passo 1 de 4');
});

test('deveMostrarWizard: só quando status carregado e falta margem ou faturamento', () => {
  assert.equal(deveMostrarWizard(null), false);
  assert.equal(deveMostrarWizard(undefined), false);
  assert.equal(deveMostrarWizard(status({})), true);
  assert.equal(deveMostrarWizard(status({ lucro: true })), true);
  assert.equal(deveMostrarWizard(status({ fixas: true, variaveis: true })), true);
  // Custos são opcionais: margem + faturamento já bastam pra não reabrir o wizard.
  assert.equal(deveMostrarWizard(status({ lucro: true, faturamento: true })), false);
  assert.equal(deveMostrarWizard(status({ lucro: true, faturamento: true, fixas: true, variaveis: true })), false);
});

test('passoConcluido / primeiroPassoPendente seguem as chaves de getFinanceiroStatus', () => {
  const st = status({ lucro: true, faturamento: true });
  assert.equal(passoConcluido(st, 'lucro'), true);
  assert.equal(passoConcluido(st, 'fixas'), false);
  assert.equal(passoConcluido(st, 'inexistente'), false);
  assert.equal(passoConcluido(null, 'lucro'), false);

  assert.equal(primeiroPassoPendente(null), 0);
  assert.equal(primeiroPassoPendente(status({})), 0);
  assert.equal(primeiroPassoPendente(status({ lucro: true })), 1);
  assert.equal(primeiroPassoPendente(st), 2);
  assert.equal(primeiroPassoPendente(status({ lucro: true, faturamento: true, fixas: true })), 3);
  // Pula passos já feitos no meio (ex.: usuário preencheu custos antes da margem)
  assert.equal(primeiroPassoPendente(status({ fixas: true, variaveis: true })), 0);
  assert.equal(primeiroPassoPendente(status({ lucro: true, faturamento: true, fixas: true, variaveis: true })), -1);
});

test('validarLucroInput: PT-BR, NaN/negativo/≥100 rejeitados, retorna fração', () => {
  assert.deepEqual(validarLucroInput('20'), { ok: true, valor: 0.2, erro: '' });
  assert.equal(validarLucroInput('12,5').valor, 0.125);
  assert.equal(validarLucroInput('12.5').valor, 0.125);
  assert.deepEqual(validarLucroInput('0'), { ok: true, valor: 0, erro: '' });
  assert.equal(validarLucroInput('abc').ok, false);
  assert.equal(validarLucroInput('').ok, false);
  assert.equal(validarLucroInput(null).ok, false);
  assert.equal(validarLucroInput('-5').ok, false);
  assert.equal(validarLucroInput('abc').erro, 'Digite uma margem de lucro válida (ex.: 20).');
  assert.equal(validarLucroInput('100').ok, false);
  assert.equal(validarLucroInput('150').erro, 'A margem precisa ser menor que 100%.');
});

test('validarFaturamentoInput: precisa ser > 0, aceita milhar PT-BR', () => {
  assert.deepEqual(validarFaturamentoInput('15000'), { ok: true, valor: 15000, erro: '' });
  assert.equal(validarFaturamentoInput('1.000,50').valor, 1000.5);
  assert.equal(validarFaturamentoInput('0').ok, false);
  assert.equal(validarFaturamentoInput('-10').ok, false);
  assert.equal(validarFaturamentoInput('x').ok, false);
  assert.equal(validarFaturamentoInput('').erro, 'O faturamento médio deve ser maior que zero.');
});

test('fracaoParaInputPercentual: fração → texto com vírgula', () => {
  assert.equal(fracaoParaInputPercentual(0.2), '20');
  assert.equal(fracaoParaInputPercentual(0.125), '12,5');
  assert.equal(fracaoParaInputPercentual(0.15), '15');
  assert.equal(fracaoParaInputPercentual(0), '');
  assert.equal(fracaoParaInputPercentual(NaN), '');
  assert.equal(fracaoParaInputPercentual(undefined), '');
});

// Auditoria 09/09 — walkthrough real reportou "1.95x" (ponto) no mark-up
// exibido na tela Financeiro, quando o resto do app usa vírgula PT-BR.
test('MARKUP_NAO_FECHA: frase simples no lugar do "∞" na tela', () => {
  assert.equal(MARKUP_NAO_FECHA, 'Não fecha: custos + lucro passam de 100% do preço. Reduza a margem ou os custos.');
  assert.ok(!MARKUP_NAO_FECHA.includes('∞'));
});

test('formatMarkup: usa vírgula PT-BR (nunca ponto), sufixo "x"', () => {
  assert.equal(formatMarkup(1.95), '1,95x');
  assert.equal(formatMarkup(2), '2,00x');
  assert.equal(formatMarkup(1.666666), '1,67x');
  assert.equal(formatMarkup(0), '∞');
  assert.equal(formatMarkup(-1), '∞');
  assert.equal(formatMarkup(NaN), '∞');
  assert.equal(formatMarkup(undefined), '∞');
  // nunca deve conter ponto decimal
  assert.ok(!formatMarkup(3.14159).includes('.'));
});
