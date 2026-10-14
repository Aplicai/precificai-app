/**
 * Testes — src/utils/financeiroStatus.js (helper puro montarStatusFinanceiro).
 *
 * Decisão do dono (10/2026): "Financeiro completo" = margem de lucro +
 * faturamento mensal. Custos do mês e custos por venda são refinamento
 * (`opcional: true`) — nunca seguram banner de erro nem pendência na Home.
 * `setupStatus.js` e a Home usam o MESMO helper, então a regra não diverge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { montarStatusFinanceiro } = await import('../src/utils/financeiroStatus.js');
const { soFaltamEtapasOpcionais } = await import('../src/utils/setupStatus.js');

const st = (flags = {}) => montarStatusFinanceiro({
  lucroOk: false, faturamentoOk: false, fixasOk: false, variaveisOk: false, ...flags,
});

test('montarStatusFinanceiro: mantém o shape (4 etapas, chaves, total, progresso)', () => {
  const s = st();
  assert.deepEqual(s.etapas.map(e => e.key), ['faturamento', 'fixas', 'variaveis', 'lucro']);
  assert.equal(s.total, 4);
  assert.equal(s.concluidas, 0);
  assert.equal(s.progresso, 0);
  assert.equal(s.completo, false);
  assert.equal(s.faltamOpcionais, false);
  for (const e of s.etapas) assert.ok(e.label && typeof e.done === 'boolean');
});

test('montarStatusFinanceiro: só fixas e variaveis são opcionais', () => {
  const s = st();
  assert.deepEqual(s.etapas.filter(e => e.opcional === true).map(e => e.key), ['fixas', 'variaveis']);
  assert.equal(s.etapas.find(e => e.key === 'lucro').opcional, undefined);
  assert.equal(s.etapas.find(e => e.key === 'faturamento').opcional, undefined);
});

test('completo = margem + faturamento, mesmo sem nenhum custo', () => {
  const s = st({ lucroOk: true, faturamentoOk: true });
  assert.equal(s.completo, true);
  assert.equal(s.concluidas, 2);
  assert.equal(s.progresso, 0.5);
  assert.equal(s.faltamOpcionais, true);
});

test('incompleto quando falta margem OU faturamento, mesmo com todos os custos', () => {
  assert.equal(st({ faturamentoOk: true, fixasOk: true, variaveisOk: true }).completo, false);
  assert.equal(st({ lucroOk: true, fixasOk: true, variaveisOk: true }).completo, false);
  assert.equal(st({ fixasOk: true, variaveisOk: true }).faltamOpcionais, false);
});

test('tudo preenchido: completo e sem refinamento pendente', () => {
  const s = st({ lucroOk: true, faturamentoOk: true, fixasOk: true, variaveisOk: true });
  assert.equal(s.completo, true);
  assert.equal(s.faltamOpcionais, false);
  assert.equal(s.progresso, 1);
});

test('faltamOpcionais: só um dos custos faltando já conta como refinamento pendente', () => {
  assert.equal(st({ lucroOk: true, faturamentoOk: true, fixasOk: true }).faltamOpcionais, true);
  assert.equal(st({ lucroOk: true, faturamentoOk: true, variaveisOk: true }).faltamOpcionais, true);
});

test('etapas opcionais pendentes não seguram banner (soFaltamEtapasOpcionais)', () => {
  const s = st({ lucroOk: true, faturamentoOk: true });
  assert.equal(soFaltamEtapasOpcionais(s.etapas), true);
  assert.equal(soFaltamEtapasOpcionais(st({ lucroOk: true, fixasOk: true, variaveisOk: true }).etapas), false);
});
