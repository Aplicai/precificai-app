// Avisos do Asaas para quem assina no cartão (03/11/2026).
//
// O Asaas cria para cada cliente avisos de "cobrança criada", "10 dias antes"
// e "dia do vencimento". No Pix eles servem (a pessoa precisa pagar). No cartão
// a cobrança é automática: o aviso só assusta ("vai cobrar de novo?") e convida
// a cancelar. Para quem paga no cartão, desligamos os avisos de ANTES da
// cobrança. Ficam o recibo (PAYMENT_RECEIVED) e o de cobrança vencida
// (PAYMENT_OVERDUE), que avisa quando o cartão foi recusado.
// Docs: docs.asaas.com/docs/notificacoes-padroes e
//       docs.asaas.com/docs/alterando-notificacoes-de-um-cliente

export const EVENTOS_DESLIGADOS = new Set([
  'PAYMENT_CREATED',
  'PAYMENT_DUEDATE_WARNING',
  'SEND_LINHA_DIGITAVEL',
  'PAYMENT_UPDATED',
]);

type Notificacao = { id?: string; event?: string; enabled?: boolean };

/** Itens do PUT /notifications/batch: só os ligados que devem sair. */
export function avisosParaDesligar(lista: unknown): { id: string; enabled: false }[] {
  if (!Array.isArray(lista)) return [];
  return (lista as Notificacao[])
    .filter((n) => n && typeof n.id === 'string' && EVENTOS_DESLIGADOS.has(String(n.event)) && n.enabled !== false)
    .map((n) => ({ id: n.id as string, enabled: false as const }));
}

/** O pagamento é no cartão? O checkout cobra mensal no cartão e anual no Pix. */
export function ehCartao(payment: { billingType?: string } | null | undefined, ciclo: string): boolean {
  const tipo = payment?.billingType;
  if (typeof tipo === 'string' && tipo) return tipo === 'CREDIT_CARD';
  return ciclo === 'mensal';
}

/**
 * Desliga os avisos de antes da cobrança para um cliente do Asaas.
 * Melhor esforço: erro só vai para o log, nunca derruba quem chamou.
 */
export async function silenciarAvisosCartao(baseUrl: string, apiKey: string, customerId: string): Promise<number> {
  const headers = { access_token: apiKey, 'Content-Type': 'application/json', 'User-Agent': 'PrecificaiApp' };
  try {
    const res = await fetch(`${baseUrl}/customers/${encodeURIComponent(customerId)}/notifications`, { headers });
    if (!res.ok) {
      console.warn('[avisosCartao] não leu avisos:', customerId, res.status);
      return 0;
    }
    const data = await res.json().catch(() => null);
    const itens = avisosParaDesligar(data?.data);
    if (!itens.length) return 0;
    const put = await fetch(`${baseUrl}/notifications/batch`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ customer: customerId, notifications: itens }),
    });
    if (!put.ok) {
      console.warn('[avisosCartao] Asaas recusou:', customerId, put.status, (await put.text().catch(() => '')).slice(0, 300));
      return 0;
    }
    console.log('[avisosCartao] avisos desligados:', customerId, itens.length);
    return itens.length;
  } catch (e) {
    console.warn('[avisosCartao] falhou (ignorado):', e instanceof Error ? e.message : e);
    return 0;
  }
}
