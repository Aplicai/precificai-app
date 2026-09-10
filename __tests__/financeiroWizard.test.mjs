/**
 * Testes — src/components/financeiro/wizardSteps.js (wizard financeiro guiado).
 * Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  WIZARD_STEPS, SUGESTOES_LUCRO,
  wizardProgressLabel, deveMostrarWizard, passoConcluido, primeiroPassoPendente,
  validarLucroInput, validarFaturamentoInput, fracaoParaInputPercentual, formatMarkup,
} from '../src/components/financeiro/wizardSteps.js';

function status(done) {
  const etapas = ['faturamento', 'fixas', 'variaveis', 'lucro'].map(key => ({ key, label: key, done: !!done[key] }));
  const concluidas = etapas.filter(e => e.done).length;
  return { etapas, concluidas, total: 4, completo: concluidas === 4, progresso: concluidas / 4 };
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

test('wizardProgressLabel: "Passo N de 4", com clamp', () => {
  assert.equal(wizardProgressLabel(0), 'Passo 1 de 4');
  assert.equal(wizardProgressLabel(1), 'Passo 2 de 4');
  assert.equal(wizardProgressLabel(3), 'Passo 4 de 4');
  assert.equal(wizardProgressLabel(9), 'Passo 4 de 4');
  assert.equal(wizardProgressLabel(-2), 'Passo 1 de 4');
  assert.equal(wizardProgressLabel(undefined), 'Passo 1 de 4');
});

test('deveMostrarWizard: só quando status carregado e incompleto', () => {
  assert.equal(deveMostrarWizard(null), false);
  assert.equal(deveMostrarWizard(undefined), false);
  assert.equal(deveMostrarWizard(status({})), true);
  assert.equal(deveMostrarWizard(status({ lucro: true, faturamento: true })), true);
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
