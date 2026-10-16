/**
 * planGate.js — recusa do SERVIDOR por causa do plano (puro, testável).
 *
 * Desde 2026-10-16 o Postgres também confere o plano (migration
 * 20261016120000_plano_no_servidor.sql): gravar no módulo Delivery exige Pro,
 * e passar de 5 produtos/combos no Grátis é recusado. A recusa chega como erro
 * 42501 ("new row violates row-level security policy" ou "limite_do_plano").
 *
 * O app já bloqueia antes com o popup de upgrade; isto só cobre o caso em que
 * o app achou que podia (plano em cache vencido, duas abas, resposta
 * adulterada) e o servidor disse não. Em vez de "Erro ao salvar em
 * delivery_config: new row violates…", a pessoa lê o motivo real.
 */

// Tabelas em que a recusa significa "limite do Grátis", não "recurso Pro".
const TABELAS_COM_LIMITE = {
  produtos: 'produtos',
  delivery_combos: 'combos',
};

export const MSG_RECURSO_PRO =
  'Isso faz parte do plano Pro e sua assinatura não está ativa. '
  + 'Assine o Pro para salvar (se já assinou, atualize a página).';

export function msgLimitePlano(entidade) {
  const nome = entidade === 'combos' ? 'combos' : 'produtos';
  return `Você atingiu o limite de ${nome} do plano Grátis. `
    + 'Assine o Pro para cadastrar sem limite (se já assinou, atualize a página).';
}

/** O erro (do PostgREST ou já traduzido pelo wrapper) é recusa por plano? */
export function isPlanRejection(err) {
  if (!err) return false;
  if (err.planRejected === true) return true;
  if (String(err.code || '') === '42501') return true;
  const msg = String(err.message || '');
  return /row-level security|limite_do_plano/i.test(msg);
}

/** Mensagem amigável pra recusa por plano ao gravar em `table`. */
export function planRejectionMessage(table) {
  const entidade = TABELAS_COM_LIMITE[table];
  return entidade ? msgLimitePlano(entidade) : MSG_RECURSO_PRO;
}

/** Erro pronto pra lançar: mensagem amigável + marca `planRejected`. */
export function planRejectionError(table) {
  const e = new Error(planRejectionMessage(table));
  e.planRejected = true;
  e.code = '42501';
  e.table = table;
  return e;
}

/**
 * Pra blocos catch das telas: se foi o plano, devolve a mensagem amigável que
 * o wrapper montou; senão, a mensagem genérica da própria tela.
 */
export function mensagemErroSalvar(err, fallback) {
  if (isPlanRejection(err)) {
    return err?.planRejected && err?.message ? err.message : MSG_RECURSO_PRO;
  }
  return fallback;
}
