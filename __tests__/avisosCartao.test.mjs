/**
 * Testes — supabase/functions/asaas-webhook/avisosCartao.ts
 * Quem assina no cartão não recebe lembrete de vencimento do Asaas (o cartão
 * cobra sozinho). Recibo e aviso de falha no cartão continuam.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { avisosParaDesligar, ehCartao, EVENTOS_DESLIGADOS } from '../supabase/functions/asaas-webhook/avisosCartao.ts';

const padrao = [
  { id: 'n1', event: 'PAYMENT_CREATED', scheduleOffset: 0, enabled: true },
  { id: 'n2', event: 'PAYMENT_DUEDATE_WARNING', scheduleOffset: 0, enabled: true },
  { id: 'n3', event: 'PAYMENT_RECEIVED', scheduleOffset: 0, enabled: true },
  { id: 'n4', event: 'SEND_LINHA_DIGITAVEL', scheduleOffset: 0, enabled: true },
  { id: 'n5', event: 'PAYMENT_OVERDUE', scheduleOffset: 0, enabled: true },
  { id: 'n6', event: 'PAYMENT_OVERDUE', scheduleOffset: 7, enabled: true },
  { id: 'n7', event: 'PAYMENT_DUEDATE_WARNING', scheduleOffset: 10, enabled: true },
  { id: 'n8', event: 'PAYMENT_UPDATED', scheduleOffset: 0, enabled: true },
];

test('desliga só os avisos de antes da cobrança', () => {
  assert.deepEqual(avisosParaDesligar(padrao).map((n) => n.id), ['n1', 'n2', 'n4', 'n7', 'n8']);
  for (const n of avisosParaDesligar(padrao)) assert.equal(n.enabled, false);
});

test('recibo (PAYMENT_RECEIVED) e cartão recusado (PAYMENT_OVERDUE) continuam ligados', () => {
  assert.ok(!EVENTOS_DESLIGADOS.has('PAYMENT_RECEIVED'));
  assert.ok(!EVENTOS_DESLIGADOS.has('PAYMENT_OVERDUE'));
});

test('já desligado não entra de novo; lista inválida vira vazia', () => {
  assert.deepEqual(avisosParaDesligar([{ id: 'x', event: 'PAYMENT_DUEDATE_WARNING', enabled: false }]), []);
  assert.deepEqual(avisosParaDesligar(null), []);
  assert.deepEqual(avisosParaDesligar([{ event: 'PAYMENT_CREATED', enabled: true }]), []); // sem id
});

test('cartão: billingType do pagamento manda; sem ele, mensal é cartão (regra do checkout)', () => {
  assert.equal(ehCartao({ billingType: 'CREDIT_CARD' }, 'anual'), true);
  assert.equal(ehCartao({ billingType: 'PIX' }, 'mensal'), false);
  assert.equal(ehCartao({}, 'mensal'), true);
  assert.equal(ehCartao({}, 'anual'), false);
});
