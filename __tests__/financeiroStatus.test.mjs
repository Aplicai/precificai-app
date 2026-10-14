/**
 * Testes — src/utils/financeiroStatus.js (helper puro montarStatusFinanceiro).
 *
 * Decisão do dono (14/10/2026, reverte 4ca0482): "Financeiro completo" exige
 * margem de lucro + faturamento mensal + custos do mês + custos por venda.
 * Sem custos o preço não fica certo — nenhuma das 4 etapas é opcional.
 * `setupStatus.js` e a Home usam o MESMO helper, então a regra não diverge.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { montarStatusFinanceiro, textoPendenciaFinanceiro } = await import('../src/utils/financeiroStatus.js');
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
  for (const e of s.etapas) assert.ok(e.label && typeof e.done === 'boolean');
});

test('montarStatusFinanceiro: nenhuma etapa é opcional (custos são obrigatórios)', () => {
  const s = st();
  assert.deepEqual(s.etapas.filter(e => e.opcional).map(e => e.key), []);
  assert.equal('faltamOpcionais' in s, false);
});

test('margem + faturamento sem custos NÃO é completo', () => {
  const s = st({ lucroOk: true, faturamentoOk: true });
  assert.equal(s.completo, false);
  assert.equal(s.concluidas, 2);
  assert.equal(s.progresso, 0.5);
});

test('falta só um dos custos: ainda incompleto', () => {
  assert.equal(st({ lucroOk: true, faturamentoOk: true, fixasOk: true }).completo, false);
  assert.equal(st({ lucroOk: true, faturamentoOk: true, variaveisOk: true }).completo, false);
});

test('incompleto quando falta margem OU faturamento, mesmo com todos os custos', () => {
  assert.equal(st({ faturamentoOk: true, fixasOk: true, variaveisOk: true }).completo, false);
  assert.equal(st({ lucroOk: true, fixasOk: true, variaveisOk: true }).completo, false);
});

test('tudo preenchido: completo', () => {
  const s = st({ lucroOk: true, faturamentoOk: true, fixasOk: true, variaveisOk: true });
  assert.equal(s.completo, true);
  assert.equal(s.progresso, 1);
});

test('custos pendentes seguram o banner (soFaltamEtapasOpcionais = false)', () => {
  assert.equal(soFaltamEtapasOpcionais(st({ lucroOk: true, faturamentoOk: true }).etapas), false);
  assert.equal(soFaltamEtapasOpcionais(st({ lucroOk: true, faturamentoOk: true, fixasOk: true, variaveisOk: true }).etapas), true);
});

test('textoPendenciaFinanceiro: lista o que falta, em linguagem simples', () => {
  assert.equal(textoPendenciaFinanceiro(st({ lucroOk: true, faturamentoOk: true, fixasOk: true, variaveisOk: true })), '');
  assert.equal(textoPendenciaFinanceiro(null), '');
  assert.equal(
    textoPendenciaFinanceiro(st()),
    'Falta: margem de lucro, quanto entra por mês, custos do mês e custos por venda.',
  );
  assert.equal(
    textoPendenciaFinanceiro(st({ lucroOk: true, faturamentoOk: true })),
    'Falta: custos do mês e custos por venda.',
  );
  assert.equal(
    textoPendenciaFinanceiro(st({ lucroOk: true, faturamentoOk: true, fixasOk: true })),
    'Falta: custos por venda.',
  );
  assert.equal(
    textoPendenciaFinanceiro(st({ faturamentoOk: true, fixasOk: true, variaveisOk: true })),
    'Falta: margem de lucro.',
  );
});

test('assinarStatusFinanceiro/publicarStatusFinanceiro: broadcast para quem assinou e desassinatura', async () => {
  const { assinarStatusFinanceiro, publicarStatusFinanceiro } = await import('../src/utils/financeiroStatus.js');
  const recebidos = [];
  const sair = assinarStatusFinanceiro(s => recebidos.push(s.completo));
  const quebrado = assinarStatusFinanceiro(() => { throw new Error('listener ruim'); });
  publicarStatusFinanceiro(st());
  publicarStatusFinanceiro(st({ lucroOk: true, faturamentoOk: true, fixasOk: true, variaveisOk: true }));
  publicarStatusFinanceiro(null); // ignorado
  sair(); quebrado();
  publicarStatusFinanceiro(st());
  assert.deepEqual(recebidos, [false, true]);
});
