// Supabase Edge Function — asaas-webhook (Fase 1 — Planos/Asaas)
//
// Recebe os eventos de pagamento do Asaas e atualiza a tabela `subscriptions`
// (plano/status do usuário). O app (usePlan) lê essa tabela e libera/bloqueia
// features conforme o plano.
//
// Variáveis de ambiente (configurar no Supabase Dashboard / CLI):
//   SUPABASE_URL                — injetada automaticamente
//   SUPABASE_SERVICE_ROLE_KEY   — injetada automaticamente (ignora RLS p/ escrever)
//   ASAAS_WEBHOOK_TOKEN         — segredo compartilhado; o Asaas envia no header
//                                  "asaas-access-token". Defina o MESMO valor aqui
//                                  e no painel do Asaas (Configurações > Webhooks).
//   ASAAS_API_KEY              — MESMA chave usada em asaas-create-checkout. Usada
//                                  para RECONCILIAR o pagamento direto na API do
//                                  Asaas antes de conceder o plano (defesa M-1).
//                                  Prefixo define o ambiente (sandbox/prod).
//
// Deploy:
//   supabase functions deploy asaas-webhook --no-verify-jwt
//   supabase secrets set ASAAS_WEBHOOK_TOKEN=<um_token_aleatorio_forte>
//   supabase secrets set ASAAS_API_KEY=<a mesma chave do create-checkout>
//   (--no-verify-jwt porque o Asaas não manda JWT do Supabase; a auth é via token)
//
// No Asaas (sandbox e produção): Configurações > Integrações > Webhooks
//   URL: https://<seu-projeto>.supabase.co/functions/v1/asaas-webhook
//   Token de autenticação: o mesmo ASAAS_WEBHOOK_TOKEN
//   Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE,
//            SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED
//
// LIGAÇÃO user_id <-> Asaas:
//   No checkout (asaas-create-checkout), ao criar o paymentLink no Asaas, define
//   externalReference = `${userId}|${plano}|${ciclo}`  (ex: "uuid|pro|anual").
//   O webhook lê isso pra saber de quem é e qual plano aplicar.
//
// SEGURANÇA (M-1):
//   O header asaas-access-token sozinho NÃO basta: se vazar, dá pra forjar um
//   PAYMENT_CONFIRMED e conceder plano de graça. Por isso, antes de conceder:
//     1) RECONCILIAÇÃO — buscamos GET /payments/{id} na API do Asaas com a
//        ASAAS_API_KEY (server-side) e exigimos status pago de verdade.
//     2) VALOR↔PLANO — o `value` reconciliado (vindo do Asaas, não do body) tem
//        que bater com PRICING[plano][ciclo] do externalReference.
//   Em qualquer dúvida -> NÃO concede. Respondemos 200 (evita retry storm) mas
//   logamos e abortamos o upsert.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// === Matriz de preços — fonte da verdade: src/config/plans.js, espelhada em
// asaas-create-checkout/index.ts (PRICING). Mantida duplicada porque cada edge
// function é um módulo isolado (Deno deploy). Se mudar o preço, mude nos 3.
const PRICING: Record<string, Record<string, number>> = {
  pro: { mensal: 29.9, anual: 322.9 },
  ilimitado: { mensal: 49.9, anual: 538.9 },
};

const VALID_PLANOS = new Set(['pro', 'ilimitado']);
const VALID_CICLOS = new Set(['mensal', 'anual']);

// Status que o Asaas considera efetivamente pago.
const PAID_STATUSES = new Set(['CONFIRMED', 'RECEIVED', 'RECEIVED_IN_CASH']);

// Tolerância de centavos ao comparar valor esperado vs. valor do Asaas.
const VALUE_TOLERANCE = 0.01;

// Timeout defensivo p/ a chamada de reconciliação na API do Asaas.
const RECONCILE_TIMEOUT_MS = 8000;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asaasBaseUrl(apiKey: string): string {
  // Sandbox keys começam com $aact_hmlg_; produção com $aact_prod_.
  // (mesma lógica de asaas-create-checkout / asaas-cancel-subscription)
  return apiKey.includes('_hmlg_')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

type Target = { userId: string; plano: string; ciclo: string };

// Resolve { userId, plano, ciclo } a partir do externalReference do payload.
// Retorna null se faltar ou estiver em formato inválido — NÃO há mais fallback
// por valor (era inseguro: concedia plano sem identificar/validar o usuário).
function resolveTarget(payment: any): Target | null {
  const ext = payment?.externalReference;
  if (typeof ext !== 'string' || !ext.includes('|')) return null;
  const [userId, plano, ciclo] = ext.split('|');
  if (!userId || !UUID_RE.test(userId)) return null;
  if (!VALID_PLANOS.has(plano)) return null;
  if (!VALID_CICLOS.has(ciclo)) return null;
  return { userId, plano, ciclo };
}

// Reconcilia o pagamento direto na API do Asaas usando a ASAAS_API_KEY.
// Retorna { ok, value, status } — ok=true só quando o pagamento existe E está
// num status efetivamente pago. Qualquer erro (rede/timeout/HTTP/parse) -> ok=false.
async function reconcilePayment(
  apiKey: string,
  paymentId: string,
): Promise<{ ok: boolean; value?: number; status?: string; reason?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RECONCILE_TIMEOUT_MS);
  try {
    const res = await fetch(`${asaasBaseUrl(apiKey)}/payments/${encodeURIComponent(paymentId)}`, {
      method: 'GET',
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'PrecificaiApp',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      return { ok: false, reason: `http_${res.status}:${txt.slice(0, 200)}` };
    }
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== 'object') {
      return { ok: false, reason: 'parse_error' };
    }
    // Confirma que o id retornado é o mesmo solicitado (defesa extra).
    if (data.id && data.id !== paymentId) {
      return { ok: false, reason: `id_mismatch:${data.id}` };
    }
    const status = String(data.status ?? '');
    const value = Number(data.value);
    if (!PAID_STATUSES.has(status)) {
      return { ok: false, status, value, reason: `status_not_paid:${status}` };
    }
    if (!Number.isFinite(value)) {
      return { ok: false, status, reason: 'value_not_numeric' };
    }
    return { ok: true, value, status };
  } catch (e) {
    return { ok: false, reason: `fetch_error:${String((e as Error)?.message || e)}` };
  } finally {
    clearTimeout(timer);
  }
}

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // Auth via token compartilhado (o Asaas envia no header configurado).
  const expected = Deno.env.get('ASAAS_WEBHOOK_TOKEN');
  const got = req.headers.get('asaas-access-token');
  if (!expected || got !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const event: string = body?.event || '';
  // Eventos de cobrança trazem `payment`; eventos de assinatura trazem `subscription`.
  const payment = body?.payment || body?.subscription || {};
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    // externalReference é obrigatório e validado p/ TODOS os eventos.
    const target = resolveTarget(payment);
    if (!target) {
      console.warn(
        '[asaas-webhook] externalReference ausente/inválido. event:',
        event,
        'payment:',
        payment?.id,
        'ext:',
        payment?.externalReference,
      );
      return new Response(JSON.stringify({ ok: true, skipped: 'bad_external_ref' }), { status: 200 });
    }
    const { userId, plano, ciclo } = target;

    const now = new Date();
    let row: Record<string, unknown> | null = null;

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        // === DEFESA M-1: nunca conceder confiando só no body do webhook. ===
        const apiKey = Deno.env.get('ASAAS_API_KEY');
        if (!apiKey) {
          // Sem chave não há como reconciliar -> NÃO concede (fail closed).
          console.error('[asaas-webhook] ASAAS_API_KEY ausente; não é possível reconciliar. event:', event);
          return new Response(JSON.stringify({ ok: true, skipped: 'no_api_key' }), { status: 200 });
        }
        const paymentId = payment?.id;
        if (!paymentId || typeof paymentId !== 'string') {
          console.warn('[asaas-webhook] payment.id ausente; não reconciliável. event:', event);
          return new Response(JSON.stringify({ ok: true, skipped: 'no_payment_id' }), { status: 200 });
        }

        // 1) Reconciliação: o pagamento existe e está realmente pago?
        const rec = await reconcilePayment(apiKey, paymentId);
        if (!rec.ok) {
          console.warn(
            '[asaas-webhook] reconciliação FALHOU; não concede. paymentId:',
            paymentId,
            'reason:',
            rec.reason,
          );
          return new Response(JSON.stringify({ ok: true, skipped: 'reconcile_failed' }), { status: 200 });
        }

        // 2) Valor↔plano: o valor REAL (vindo da API do Asaas) bate com o plano
        //    declarado no externalReference? Bloqueia "pagar barato, pedir caro".
        const expectedValue = PRICING[plano][ciclo];
        if (Math.abs((rec.value as number) - expectedValue) > VALUE_TOLERANCE) {
          console.warn(
            '[asaas-webhook] valor divergente do plano; não concede. paymentId:',
            paymentId,
            'plano:',
            plano,
            ciclo,
            'esperado:',
            expectedValue,
            'recebido:',
            rec.value,
          );
          return new Response(JSON.stringify({ ok: true, skipped: 'value_mismatch' }), { status: 200 });
        }

        // Passou nas duas checagens -> concede.
        // NB: a tabela `subscriptions` usa as colunas `plan` e `expires_at`
        // (schema oficial em src/database/supabase-schema.sql).
        row = {
          user_id: userId,
          plan: plano,
          ciclo,
          status: 'active',
          asaas_customer_id: payment?.customer || null,
          asaas_subscription_id: payment?.subscription || null,
          expires_at: addDays(now, ciclo === 'anual' ? 365 : 30),
        };
        break;
      }
      case 'PAYMENT_OVERDUE': {
        // Mantém o plano mas marca past_due (o app dá uma graça curta).
        // Não concede acesso novo -> não precisa reconciliar valor.
        row = { user_id: userId, status: 'past_due' };
        break;
      }
      case 'SUBSCRIPTION_DELETED':
      case 'SUBSCRIPTION_INACTIVATED':
      case 'PAYMENT_DELETED': {
        // Cancelamento: NÃO rebaixa na hora. Mantém plano + expires_at — o acesso
        // segue até o fim do período já pago. O usePlan calcula 'free' assim que
        // expires_at passa. Excedentes ficam read-only no app, nunca apagados.
        // Só remove acesso (downgrade futuro) -> não há risco de elevação aqui,
        // basta o externalReference já validado p/ identificar o usuário.
        row = { user_id: userId, status: 'canceled' };
        break;
      }
      default:
        console.log('[asaas-webhook] evento ignorado:', event);
        return new Response(JSON.stringify({ ok: true, ignored: event }), { status: 200 });
    }

    const { error } = await supabase
      .from('subscriptions')
      .upsert(row, { onConflict: 'user_id' });

    if (error) {
      console.error('[asaas-webhook] erro upsert:', error);
      return new Response(JSON.stringify({ ok: false }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true, event, userId, plano }), { status: 200 });
  } catch (e) {
    console.error('[asaas-webhook] erro:', e);
    return new Response(JSON.stringify({ ok: false }), { status: 500 });
  }
});
