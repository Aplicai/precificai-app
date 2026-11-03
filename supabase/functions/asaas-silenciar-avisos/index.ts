// Supabase Edge Function — asaas-silenciar-avisos (admin, 03/11/2026)
//
// Desliga os lembretes de vencimento do Asaas para quem JÁ assina no cartão
// (o asaas-webhook faz isso sozinho para assinaturas novas). Rodar uma vez
// depois do deploy; pode rodar de novo sem efeito colateral (idempotente).
//
// Só aceita a service role key no Authorization (ninguém do app chama).
// Deploy: supabase functions deploy asaas-silenciar-avisos --no-verify-jwt

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { silenciarAvisosCartao } from '../asaas-webhook/avisosCartao.ts';

function asaasBaseUrl(apiKey: string): string {
  const env = (Deno.env.get('ASAAS_ENV') || '').trim().toLowerCase();
  if (env === 'sandbox') return 'https://api-sandbox.asaas.com/v3';
  if (env === 'production' || env === 'prod') return 'https://api.asaas.com/v3';
  return apiKey.includes('_hmlg_') ? 'https://api-sandbox.asaas.com/v3' : 'https://api.asaas.com/v3';
}

async function iguais(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [ha, hb] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(a)), crypto.subtle.digest('SHA-256', enc.encode(b))]);
  const va = new Uint8Array(ha), vb = new Uint8Array(hb);
  let d = 0;
  for (let i = 0; i < va.length; i++) d |= va[i] ^ vb[i];
  return d === 0;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!service || !token || !(await iguais(token, service))) return new Response('Unauthorized', { status: 401 });

  const apiKey = (Deno.env.get('ASAAS_API_KEY') || '').trim().replace(/^["']|["']$/g, '');
  if (!apiKey) return new Response(JSON.stringify({ ok: false, error: 'sem ASAAS_API_KEY' }), { status: 500 });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, service);
  // Mensal = cartão (regra do asaas-create-checkout). Só assinaturas vivas.
  const { data, error } = await supabase
    .from('subscriptions')
    .select('asaas_customer_id')
    .eq('ciclo', 'mensal')
    .in('status', ['active', 'past_due'])
    .not('asaas_customer_id', 'is', null);
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });

  const clientes = [...new Set((data || []).map((r: { asaas_customer_id: string }) => r.asaas_customer_id))];
  let desligados = 0;
  for (const c of clientes) desligados += await silenciarAvisosCartao(asaasBaseUrl(apiKey), apiKey, c);
  return new Response(JSON.stringify({ ok: true, clientes: clientes.length, avisos_desligados: desligados }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
