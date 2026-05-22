// Supabase Edge Function — asaas-create-checkout (Fase 1 — Planos/Asaas)
//
// Cria um LINK DE PAGAMENTO recorrente hospedado no Asaas e devolve a URL pro
// app abrir num navegador/WebView. O cliente preenche CPF/cartão na página do
// Asaas — o app NUNCA toca em dados financeiros (bom p/ PCI/LGPD).
//
// Por que paymentLinks (e não /subscriptions): paymentLinks devolve uma URL
// hospedada e NÃO exige customer/CPF pré-criado. (Pesquisa Asaas API v3.)
//
// Segurança:
//   - verify_jwt LIGADO (default). Só usuário autenticado chama.
//   - O user_id vem do JWT verificado (auth.getUser), NUNCA do body do client.
//   - A chave secreta do Asaas mora em ASAAS_API_KEY (secret), nunca no client.
//
// Variáveis de ambiente (Supabase Dashboard → Functions → Secrets):
//   ASAAS_API_KEY  — chave do Asaas. Prefixo define o ambiente:
//                      $aact_hmlg_… → sandbox (api-sandbox.asaas.com)
//                      $aact_prod_… → produção (api.asaas.com)
//   SUPABASE_URL / SUPABASE_ANON_KEY — injetadas automaticamente.
//
// Deploy: supabase functions deploy asaas-create-checkout
//
// LIGAÇÃO com o webhook: externalReference = `${userId}|${plano}|${ciclo}`.
// O asaas-webhook lê isso pra ativar o plano certo do usuário certo.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// === CORS (mesma whitelist das outras functions) ===
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

// === Matriz de preços — ESPELHA src/config/plans.js (manter em sync) ===
const PRICING: Record<string, Record<string, number>> = {
  pro: { mensal: 29.9, anual: 322.9 },
  ilimitado: { mensal: 49.9, anual: 538.9 },
};
const PLAN_LABEL: Record<string, string> = { pro: 'Pro', ilimitado: 'Ilimitado' };
// Regra de cobrança: mensal no cartão (renovação automática) / anual no Pix (−10%).
const CYCLE_MAP: Record<string, string> = { mensal: 'MONTHLY', anual: 'YEARLY' };
const BILLING_MAP: Record<string, string> = { mensal: 'CREDIT_CARD', anual: 'PIX' };

function asaasBaseUrl(apiKey: string): string {
  // Sandbox keys começam com $aact_hmlg_; produção com $aact_prod_.
  return apiKey.includes('_hmlg_')
    ? 'https://api-sandbox.asaas.com/v3'
    : 'https://api.asaas.com/v3';
}

function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json' },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders(req) });
  }
  if (req.method !== 'POST') {
    return json(req, 405, { error: 'Method not allowed' });
  }

  try {
    // 1) Identifica o usuário pelo JWT (NUNCA confia em userId vindo do client).
    const authHeader = req.headers.get('Authorization') || '';
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return json(req, 401, { error: 'Não autenticado.' });
    }

    // 2) Valida plano + ciclo do body.
    let payload: { plano?: string; ciclo?: string };
    try {
      payload = await req.json();
    } catch {
      return json(req, 400, { error: 'Body inválido.' });
    }
    const plano = String(payload?.plano || '');
    const ciclo = String(payload?.ciclo || '');
    if (!PRICING[plano]) {
      return json(req, 400, { error: 'Plano inválido. Use "pro" ou "ilimitado".' });
    }
    if (!CYCLE_MAP[ciclo]) {
      return json(req, 400, { error: 'Ciclo inválido. Use "mensal" ou "anual".' });
    }

    const value = PRICING[plano][ciclo];
    const apiKey = Deno.env.get('ASAAS_API_KEY');
    if (!apiKey) {
      console.error('[asaas-create-checkout] ASAAS_API_KEY não configurada.');
      return json(req, 500, { error: 'Pagamento indisponível no momento. Tente mais tarde.' });
    }

    // 3) Cria o link de pagamento recorrente hospedado.
    const cicloLabel = ciclo === 'anual' ? 'Anual' : 'Mensal';
    const linkBody = {
      name: `Precificaí ${PLAN_LABEL[plano]} ${cicloLabel}`,
      description: `Assinatura ${PLAN_LABEL[plano]} (${ciclo}) do Precificaí`,
      billingType: BILLING_MAP[ciclo],
      chargeType: 'RECURRENT',
      subscriptionCycle: CYCLE_MAP[ciclo],
      value,
      // Carrega quem é + qual plano/ciclo. O webhook lê em payment.externalReference.
      externalReference: `${user.id}|${plano}|${ciclo}`,
      notificationEnabled: true,
      // Redireciona de volta pro app depois do pagamento.
      callback: {
        successUrl: 'https://app.precificaiapp.com/?assinatura=ok',
        autoRedirect: true,
      },
    };

    const res = await fetch(`${asaasBaseUrl(apiKey)}/paymentLinks`, {
      method: 'POST',
      headers: {
        access_token: apiKey,
        'Content-Type': 'application/json',
        'User-Agent': 'PrecificaiApp',
      },
      body: JSON.stringify(linkBody),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      console.error('[asaas-create-checkout] Asaas error:', res.status, JSON.stringify(data));
      return json(req, 502, { error: 'Não foi possível iniciar o checkout. Tente novamente.' });
    }

    return json(req, 200, { ok: true, url: data.url, id: data.id, plano, ciclo, value });
  } catch (e) {
    console.error('[asaas-create-checkout]', e);
    return json(req, 500, { error: String((e as Error)?.message || e) });
  }
});
