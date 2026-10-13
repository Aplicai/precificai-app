/**
 * Testes — avisoVencimento.js e aguardarAtivacao.js (13/10/2026)
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/avisoVencimento.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { calcAvisoVencimento, textoPrazo, DIAS_DE_AVISO } from '../src/utils/avisoVencimento.js';
import { aguardarAtivacao } from '../src/utils/aguardarAtivacao.js';

const AGORA = new Date('2027-10-01T12:00:00Z');
const emDias = (d) => new Date(AGORA.getTime() + d * 86400000).toISOString();
const base = { ciclo: 'anual', status: 'active', agora: AGORA };

test('anual a 10 dias do vencimento avisa, com a contagem certa', () => {
  const a = calcAvisoVencimento({ ...base, expiresAt: emDias(10) });
  assert.equal(a.dias, 10);
});

test('anual longe do vencimento não avisa; no limite exato avisa', () => {
  assert.equal(calcAvisoVencimento({ ...base, expiresAt: emDias(DIAS_DE_AVISO + 1) }), null);
  assert.equal(calcAvisoVencimento({ ...base, expiresAt: emDias(DIAS_DE_AVISO) }).dias, DIAS_DE_AVISO);
});

test('mensal nunca avisa — o cartão renova sozinho', () => {
  assert.equal(calcAvisoVencimento({ ...base, ciclo: 'mensal', expiresAt: emDias(2) }), null);
});

test('vitalício, cancelado e já vencido não avisam', () => {
  assert.equal(calcAvisoVencimento({ ...base, expiresAt: null }), null);
  assert.equal(calcAvisoVencimento({ ...base, status: 'canceled', expiresAt: emDias(3) }), null);
  assert.equal(calcAvisoVencimento({ ...base, expiresAt: emDias(-1) }), null);
});

test('últimas horas contam como "vence hoje"', () => {
  const a = calcAvisoVencimento({ ...base, expiresAt: emDias(0.5) });
  assert.equal(a.dias, 0);
  assert.equal(textoPrazo(a.dias), 'vence hoje');
  assert.equal(textoPrazo(1), 'vence amanhã');
  assert.equal(textoPrazo(7), 'vence em 7 dias');
});

test('entrada quebrada não avisa nem estoura', () => {
  assert.equal(calcAvisoVencimento(), null);
  assert.equal(calcAvisoVencimento({ ...base, expiresAt: 'isso não é data' }), null);
});

// --- aguardarAtivacao -------------------------------------------------------

function relogio() {
  let t = 0;
  return { agora: () => t, esperar: async (ms) => { t += ms; } };
}

test('detecta a ativação na consulta em que o plano muda', async () => {
  const r = relogio();
  const respostas = ['free', 'free', 'pro'];
  let n = 0;
  const out = await aguardarAtivacao({ planoAntes: 'free', consultar: async () => respostas[n++], ...r });
  assert.deepEqual(out, { ativou: true, plano: 'pro', motivo: 'ativado' });
  assert.equal(n, 3);
});

test('desiste no tempo máximo se o cliente não pagar', async () => {
  const r = relogio();
  const out = await aguardarAtivacao({
    planoAntes: 'free', consultar: async () => 'free', ...r, intervaloMs: 1000, tempoMaximoMs: 5000,
  });
  assert.equal(out.ativou, false);
  assert.equal(out.motivo, 'tempo_esgotado');
});

test('erro de rede numa consulta não derruba a espera', async () => {
  const r = relogio();
  let n = 0;
  const out = await aguardarAtivacao({
    planoAntes: 'free',
    consultar: async () => { n++; if (n === 1) throw new Error('offline'); return 'pro'; },
    ...r,
  });
  assert.equal(out.ativou, true);
});

test('para quando é cancelada e não confunde plano igual ao anterior com ativação', async () => {
  const r = relogio();
  const c = await aguardarAtivacao({ planoAntes: 'free', consultar: async () => 'pro', ...r, cancelado: () => true });
  assert.equal(c.motivo, 'cancelado');
  const r2 = relogio();
  const igual = await aguardarAtivacao({
    planoAntes: 'pro', consultar: async () => 'pro', ...r2, intervaloMs: 1000, tempoMaximoMs: 3000,
  });
  assert.equal(igual.ativou, false);
});
