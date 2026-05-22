// Supabase Edge Function — asaas-cancel-subscription (Fase 1 — Planos/Asaas)
//
// Cancela a assinatura do usuário no Asaas (para futuras cobranças) MAS mantém
// o acesso ativo até o fim do período já pago (expires_at). Depois disso, o
// usePlan calcula 'free' automaticamente.
//
// Segurança:
//   - verify_jwt LIGADO. Só o próprio usuário (JWT verificado) cancela.
//   - A escrita na tabela usa service_role (RLS bloqueia escrita via client).
//   - A chave do Asaas (ASAAS_API_KEY) fica server-side.
//
// Deploy: supabase functions deploy asaas-cancel-subscription

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ALLOWED_ORIGINS = new Set<string>([
  'https://app.precificaiapp.com',
  'https://precificaiapp.com',
  'http://localhost:8081',
  'http://localhost:19006',
]);

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.precificaiapp.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

function asaasBaseUrl(apiKey: string): string {
  return apiKey.includes('_hmlg_')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });

  try {
    // 1) Usuário via JWT.
    const authHeader = req.headers.get('Authorization') || '';
    const authed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json(req, 401, { error: 'Não autenticado.' });

    // 2) Lê a assinatura atual (service_role).
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: sub, error: readErr } = await admin
      .from('subscriptions')
      .select('plan,status,expires_at,asaas_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readErr) {
      console.error('[asaas-cancel] read error:', readErr);
      return json(req, 500, { error: 'Não foi possível ler sua assinatura.' });
    }
    if (!sub || sub.plan === 'free') {
      return json(req, 200, { ok: true, alreadyFree: true });
    }

    // 3) Cancela no Asaas (best-effort; 404 = já cancelada).
    const apiKey = Deno.env.get('ASAAS_API_KEY');
    if (apiKey && sub.asaas_subscription_id) {
      try {
        const res = await fetch(`${asaasBaseUrl(apiKey)}/subscriptions/${sub.asaas_subscription_id}`, {
          method: 'DELETE',
          headers: { access_token: apiKey, 'User-Agent': 'PrecificaiApp' },
        });
        if (!res.ok && res.status !== 404) {
          const body = await res.text().catch(() => '');
          console.error('[asaas-cancel] Asaas delete falhou:', res.status, body);
          // Não aborta: ainda marcamos cancelado local p/ não cobrar de novo no app.
        }
      } catch (e) {
        console.error('[asaas-cancel] Asaas delete erro de rede:', e);
      }
    }

    // 4) Marca cancelado MAS mantém plano + expires_at (acesso até o fim do período).
    const { error: updErr } = await admin
      .from('subscriptions')
      .update({ status: 'canceled' })
      .eq('user_id', user.id);
    if (updErr) {
      console.error('[asaas-cancel] update error:', updErr);
      return json(req, 500, { error: 'Não foi possível concluir o cancelamento.' });
    }

    return json(req, 200, { ok: true, plan: sub.plan, expires_at: sub.expires_at });
  } catch (e) {
    console.error('[asaas-cancel]', e);
    return json(req, 500, { error: String((e as Error)?.message || e) });
  }
});
