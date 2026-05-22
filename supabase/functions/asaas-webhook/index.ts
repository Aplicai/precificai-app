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
//
// Deploy:
//   supabase functions deploy asaas-webhook --no-verify-jwt
//   supabase secrets set ASAAS_WEBHOOK_TOKEN=<um_token_aleatorio_forte>
//   (--no-verify-jwt porque o Asaas não manda JWT do Supabase; a auth é via token)
//
// No Asaas (sandbox e produção): Configurações > Integrações > Webhooks
//   URL: https://<seu-projeto>.supabase.co/functions/v1/asaas-webhook
//   Token de autenticação: o mesmo ASAAS_WEBHOOK_TOKEN
//   Eventos: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_OVERDUE,
//            SUBSCRIPTION_DELETED, SUBSCRIPTION_INACTIVATED
//
// LIGAÇÃO user_id <-> Asaas:
//   No checkout (a implementar), ao criar a assinatura no Asaas, defina
//   externalReference = `${userId}|${plano}|${ciclo}`  (ex: "uuid|pro|anual").
//   O webhook lê isso pra saber de quem é e qual plano aplicar. Fallback:
//   mapeia pelo valor da cobrança (ver PLAN_BY_VALUE abaixo).

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Fallback de mapeamento por valor (R$) quando não houver externalReference.
const PLAN_BY_VALUE: Record<string, { plano: string; ciclo: string }> = {
  '29.9': { plano: 'pro', ciclo: 'mensal' },
  '322.9': { plano: 'pro', ciclo: 'anual' },
  '49.9': { plano: 'ilimitado', ciclo: 'mensal' },
  '538.9': { plano: 'ilimitado', ciclo: 'anual' },
};

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  return d.toISOString();
}

// Resolve { userId, plano, ciclo } a partir do payload do Asaas.
function resolveTarget(payment: any): { userId: string | null; plano: string; ciclo: string } {
  const ext = payment?.externalReference || '';
  if (typeof ext === 'string' && ext.includes('|')) {
    const [userId, plano, ciclo] = ext.split('|');
    if (userId) return { userId, plano: plano || 'pro', ciclo: ciclo || 'mensal' };
  }
  // Fallback por valor
  const val = String(payment?.value ?? '');
  const byVal = PLAN_BY_VALUE[val];
  return { userId: null, plano: byVal?.plano || 'pro', ciclo: byVal?.ciclo || 'mensal' };
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
  const payment = body?.payment || {};
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  try {
    const { userId, plano, ciclo } = resolveTarget(payment);

    // Sem como identificar o usuário -> loga e responde 200 (evita retry infinito).
    if (!userId) {
      console.warn('[asaas-webhook] sem externalReference (userId). event:', event, 'payment:', payment?.id);
      return new Response(JSON.stringify({ ok: true, skipped: 'no_user' }), { status: 200 });
    }

    const now = new Date();
    let row: Record<string, unknown> | null = null;

    switch (event) {
      case 'PAYMENT_CONFIRMED':
      case 'PAYMENT_RECEIVED': {
        row = {
          user_id: userId,
          plano,
          ciclo,
          status: 'active',
          asaas_customer_id: payment?.customer || null,
          asaas_subscription_id: payment?.subscription || null,
          current_period_end: addDays(now, ciclo === 'anual' ? 365 : 30),
        };
        break;
      }
      case 'PAYMENT_OVERDUE': {
        // Mantém o plano mas marca overdue (o app pode dar uma graça curta).
        row = { user_id: userId, status: 'overdue' };
        break;
      }
      case 'SUBSCRIPTION_DELETED':
      case 'SUBSCRIPTION_INACTIVATED':
      case 'PAYMENT_DELETED': {
        // Cancelamento -> volta pro free. Excedentes ficam read-only no app.
        row = { user_id: userId, plano: 'free', status: 'canceled', ciclo: null };
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
