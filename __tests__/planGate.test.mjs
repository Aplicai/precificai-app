/**
 * Testes — recusa do servidor por plano (src/utils/planGate.js) e
 * vagasRestantes (src/config/plans.js). Roda via `npm test`.
 *
 * Contexto: migration 20261016120000_plano_no_servidor.sql — o Postgres passou
 * a recusar (42501) gravação no Delivery sem Pro e o 6º produto/combo no Grátis.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  isPlanRejection,
  planRejectionMessage,
  planRejectionError,
  mensagemErroSalvar,
  MSG_RECURSO_PRO,
} from '../src/utils/planGate.js';
import { vagasRestantes, planAllowsCount } from '../src/config/plans.js';

test('isPlanRejection: erro cru do PostgREST (42501 / RLS / gatilho)', () => {
  assert.equal(isPlanRejection({ code: '42501', message: 'new row violates row-level security policy for table "delivery_config"' }), true);
  assert.equal(isPlanRejection({ message: 'new row violates row-level security policy for table "produtos"' }), true);
  assert.equal(isPlanRejection({ code: '42501', message: 'limite_do_plano: o plano Grátis permite até 5 produtos' }), true);
  assert.equal(isPlanRejection({ message: 'limite_do_plano: ...' }), true);
});

test('isPlanRejection: outros erros NÃO viram mensagem de plano', () => {
  assert.equal(isPlanRejection(null), false);
  assert.equal(isPlanRejection(undefined), false);
  assert.equal(isPlanRejection(new Error('Failed to fetch')), false);
  assert.equal(isPlanRejection({ code: '23505', message: 'duplicate key value violates unique constraint' }), false);
  assert.equal(isPlanRejection({ code: 'PGRST116', message: 'JSON object requested' }), false);
});

test('planRejectionMessage: produtos/combos = limite do Grátis; resto = recurso Pro', () => {
  assert.match(planRejectionMessage('produtos'), /limite de produtos do plano Grátis/);
  assert.match(planRejectionMessage('delivery_combos'), /limite de combos do plano Grátis/);
  assert.equal(planRejectionMessage('delivery_config'), MSG_RECURSO_PRO);
  assert.equal(planRejectionMessage('produto_preco_delivery'), MSG_RECURSO_PRO);
  // Nunca vaza texto técnico
  for (const t of ['produtos', 'delivery_config']) {
    assert.ok(!/row-level|42501|policy/i.test(planRejectionMessage(t)));
  }
});

test('planRejectionError: marca planRejected e continua reconhecível', () => {
  const e = planRejectionError('delivery_config');
  assert.ok(e instanceof Error);
  assert.equal(e.planRejected, true);
  assert.equal(e.table, 'delivery_config');
  assert.equal(isPlanRejection(e), true);
  assert.equal(e.message, MSG_RECURSO_PRO);
});

test('mensagemErroSalvar: plano → mensagem amigável; outro erro → fallback da tela', () => {
  assert.match(mensagemErroSalvar(planRejectionError('produtos'), 'x'), /limite de produtos/);
  // Erro cru (sem passar pelo wrapper) ainda vira mensagem de plano
  assert.equal(mensagemErroSalvar({ code: '42501', message: 'new row violates row-level security policy' }, 'x'), MSG_RECURSO_PRO);
  assert.equal(mensagemErroSalvar(new Error('Failed to fetch'), 'Não foi possível salvar.'), 'Não foi possível salvar.');
  assert.equal(mensagemErroSalvar(undefined, 'fallback'), 'fallback');
});

test('vagasRestantes: Grátis conta até 5; pagos sem teto; nunca negativo', () => {
  assert.equal(vagasRestantes('free', 'produtos', 0), 5);
  assert.equal(vagasRestantes('free', 'produtos', 3), 2);
  assert.equal(vagasRestantes('free', 'produtos', 5), 0);
  // Conta legada acima do teto: 0, não negativo
  assert.equal(vagasRestantes('free', 'produtos', 9), 0);
  assert.equal(vagasRestantes('free', 'combos', 4), 1);
  assert.equal(vagasRestantes('pro', 'produtos', 500), Infinity);
  assert.equal(vagasRestantes('ilimitado', 'combos', 500), Infinity);
  // Plano desconhecido = Grátis (mesma regra de normalizePlan)
  assert.equal(vagasRestantes('trial', 'produtos', 4), 1);
  assert.equal(vagasRestantes('free', 'produtos', undefined), 5);
});

test('vagasRestantes concorda com planAllowsCount pro próximo item (duplicar 1)', () => {
  for (const plano of ['free', 'pro', 'ilimitado']) {
    for (let n = 0; n <= 7; n++) {
      assert.equal(vagasRestantes(plano, 'produtos', n) >= 1, planAllowsCount(plano, 'produtos', n), `${plano} n=${n}`);
    }
  }
});
