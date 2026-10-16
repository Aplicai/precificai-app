/**
 * avisoVencimento — "o plano está perto de vencer e ninguém vai debitar sozinho?"
 *
 * No plano mensal o cartão renova por conta própria. No anual o pagamento é
 * Pix: o Asaas manda a cobrança por e-mail e SMS, mas se o cliente ignorar, o
 * plano cai para o grátis no vencimento e ele só percebe pelos cadeados. Até
 * 13/10/2026 nenhuma tela do app mostrava a data de vencimento.
 *
 * Funções puras pra dar pra testar com data fixa.
 */

export const DIAS_DE_AVISO = 15;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} p
 * @param {string|null} p.ciclo      'mensal' | 'anual' | null
 * @param {string|null} p.status     status da assinatura
 * @param {string|null} p.expiresAt  ISO da validade
 * @param {Date|number} [p.agora]    injetável nos testes
 * @param {number} [p.diasAviso]
 * @returns {null | { dias: number, venceEm: Date }}
 *   `dias` = dias inteiros que faltam (0 = vence hoje). null = não avisar.
 */
export function calcAvisoVencimento({ ciclo, status, expiresAt, agora, diasAviso = DIAS_DE_AVISO } = {}) {
  // Só o anual: é o único ciclo sem débito automático.
  if (ciclo !== 'anual') return null;
  // Cancelado já sabe que vai acabar; quem cancelou não quer lembrete de pagar.
  if (status !== 'active' && status !== 'past_due') return null;
  if (!expiresAt) return null; // vitalício

  const vence = new Date(expiresAt);
  const t = vence.getTime();
  if (!Number.isFinite(t)) return null;

  const now = agora instanceof Date ? agora.getTime() : (Number.isFinite(agora) ? agora : Date.now());
  const falta = t - now;
  if (falta <= 0) return null; // já venceu: o plano virou grátis, o aviso é outro
  if (falta > diasAviso * DIA_MS) return null;

  return { dias: Math.floor(falta / DIA_MS), venceEm: vence };
}

/** "vence hoje" / "vence amanhã" / "vence em 7 dias" */
export function textoPrazo(dias) {
  if (dias <= 0) return 'vence hoje';
  if (dias === 1) return 'vence amanhã';
  return `vence em ${dias} dias`;
}

/**
 * Linha de validade do card "Meu Plano". Só o mensal (cartão) renova sozinho;
 * o anual (Pix) não tem débito automático, então "Renova em" prometia algo
 * que não acontece. `venc` já formatado (dd/mm/aaaa) ou vazio = vitalício.
 */
export function textoValidadePlano({ ciclo, venc } = {}) {
  if (!venc) return 'Acesso vitalício';
  return ciclo === 'mensal' ? `Renova em ${venc}` : `Válido até ${venc}`;
}
