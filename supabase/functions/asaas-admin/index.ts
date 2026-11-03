// Supabase Edge Function — asaas-admin (03/11/2026)
//
// Tarefas de manutenção, chamadas à mão. Só aceita a service role key no
// Authorization (ninguém do app chama). Body JSON:
//   { "acao": "silenciar-avisos" }
//       Desliga os lembretes de vencimento do Asaas para quem JÁ assina no
//       cartão (o asaas-webhook faz isso sozinho nas assinaturas novas).
//       Idempotente.
//   { "acao": "reenviar-compra", "payment_id": "pay_..." }
//       Manda ao Meta a compra de um pagamento confirmado que não chegou lá
//       (ex.: aceite de cookies gravado depois). Mesmo event_id do webhook,
//       então o Meta não conta duas vezes. O Meta só aceita até 7 dias.
// Deploy: supabase functions deploy asaas-admin --no-verify-jwt

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { silenciarAvisosCartao } from '../asaas-webhook/avisosCartao.ts';
import { sendMetaPurchase } from '../asaas-webhook/metaCompra.ts';

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
  const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  let body: { acao?: string; payment_id?: string } = {};
  try { body = await req.json(); } catch { /* sem body */ }

  if (body.acao === 'reenviar-compra') {
    const paymentId = String(body.payment_id || '');
    if (!/^pay_[A-Za-z0-9]+$/.test(paymentId)) return resp(400, { ok: false, error: 'payment_id inválido' });
    // asaas_events.payment_id guarda a chave do webhook: `${payment.id}:${event}`.
    const { data: ev } = await supabase.from('asaas_events').select('user_id, processed_at')
      .in('payment_id', [`${paymentId}:PAYMENT_CONFIRMED`, `${paymentId}:PAYMENT_RECEIVED`])
      .order('processed_at', { ascending: true }).limit(1).maybeSingle();
    if (!ev?.user_id) return resp(404, { ok: false, error: 'pagamento confirmado não encontrado' });
    const eventTime = Math.floor(new Date(ev.processed_at).getTime() / 1000);
    if (Date.now() / 1000 - eventTime > 7 * 24 * 3600 - 600) return resp(400, { ok: false, error: 'mais de 7 dias: o Meta não aceita' });
    const r = await fetch(`${asaasBaseUrl(apiKey)}/payments/${paymentId}`, { headers: { access_token: apiKey, 'User-Agent': 'PrecificaiApp' } });
    const pay = await r.json().catch(() => null);
    const [uid, plano, ciclo] = String(pay?.externalReference || '').split('|');
    if (!r.ok || uid !== ev.user_id || !plano || !ciclo || !Number.isFinite(Number(pay?.value))) {
      return resp(400, { ok: false, error: 'pagamento do Asaas não confere', asaas_status: r.status });
    }
    const resultado = await sendMetaPurchase(supabase, { userId: ev.user_id, paymentId, value: Number(pay.value), plano, ciclo, eventTime });
    return resp(resultado === 'enviado' ? 200 : 422, { ok: resultado === 'enviado', resultado });
  }
  if (body.acao !== 'silenciar-avisos') return resp(400, { ok: false, error: 'acao: silenciar-avisos | reenviar-compra' });

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
