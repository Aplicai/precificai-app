// Supabase Edge Function — asaas-renewal-link
//
// Devolve a URL da fatura de RENOVAÇÃO que o Asaas já gerou para a assinatura
// do usuário. Existe por causa do plano anual no Pix: não há débito automático,
// o Asaas manda a cobrança por e-mail/SMS, e se o cliente perder o e-mail o
// plano cai. O app mostra um aviso perto do vencimento com um botão que chama
// esta função.
//
// SOMENTE LEITURA: faz um GET no Asaas. Não cria cobrança, não cria assinatura,
// não altera nada no banco.
//
// Segurança (mesmo desenho das outras functions do Asaas):
//   - verify_jwt ligado; o user_id vem do JWT verificado, nunca do body.
//   - O id da assinatura é lido do banco com service_role — o cliente não tem
//     como pedir a fatura de outra pessoa.
//   - A chave do Asaas fica em ASAAS_API_KEY.
//
// Deploy: supabase functions deploy asaas-renewal-link

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
  const SANDBOX = 'https://api-sandbox.asaas.com/v3';
  const PROD = 'https://api.asaas.com/v3';
  const env = (Deno.env.get('ASAAS_ENV') || '').trim().toLowerCase();
  if (env === 'sandbox') return SANDBOX;
  if (env === 'production' || env === 'prod') return PROD;
  return apiKey.includes('_hmlg_') ? SANDBOX : PROD;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json(req, 405, { error: 'Method not allowed' });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const authed = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await authed.auth.getUser();
    if (userErr || !user) return json(req, 401, { error: 'Não autenticado.' });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: sub, error: readErr } = await admin
      .from('subscriptions')
      .select('asaas_subscription_id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (readErr) {
      console.error('[asaas-renewal-link] read error:', readErr);
      return json(req, 500, { error: 'Não foi possível ler sua assinatura.' });
    }
    if (!sub?.asaas_subscription_id) return json(req, 200, { ok: true, url: null });

    const apiKey = (Deno.env.get('ASAAS_API_KEY') || '').trim().replace(/^["']|["']$/g, '');
    if (!apiKey) {
      console.error('[asaas-renewal-link] ASAAS_API_KEY não configurada.');
      return json(req, 500, { error: 'Pagamento indisponível no momento. Tente mais tarde.' });
    }

    // Cobranças em aberto desta assinatura. PENDING = ainda no prazo;
    // OVERDUE = venceu e não foi paga. Pega a de vencimento mais próximo.
    const abertas: Array<{ dueDate?: string; invoiceUrl?: string }> = [];
    for (const status of ['PENDING', 'OVERDUE']) {
      const res = await fetch(
        `${asaasBaseUrl(apiKey)}/subscriptions/${sub.asaas_subscription_id}/payments?status=${status}`,
        { headers: { access_token: apiKey, 'User-Agent': 'PrecificaiApp' } },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error('[asaas-renewal-link] Asaas error:', res.status, JSON.stringify(data));
        return json(req, 502, { error: 'Não foi possível buscar a cobrança agora.', asaas_status: res.status });
      }
      if (Array.isArray(data?.data)) abertas.push(...data.data);
    }

    const comLink = abertas.filter((p) => typeof p.invoiceUrl === 'string' && p.invoiceUrl);
    comLink.sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));

    // Sem cobrança em aberto: o Asaas ainda não gerou a do próximo ciclo.
    return json(req, 200, { ok: true, url: comLink[0]?.invoiceUrl || null, dueDate: comLink[0]?.dueDate || null });
  } catch (e) {
    console.error('[asaas-renewal-link]', e);
    return json(req, 500, { error: 'Erro ao buscar a cobrança. Tente novamente.' });
  }
});
