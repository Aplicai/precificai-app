// meta-evento — envia CompleteRegistration / PrimeiroPreco / Ativacao pela
// Conversions API do Meta, como complemento do Pixel (19/10/2026).
//
// Por quê: o Meta só via ~54% dos cadastros reais. Mesmo com aceite de cookies, o
// Pixel se perde no navegador do Instagram, com bloqueador ou quando a pessoa sai
// rápido. O mesmo event_id do Pixel deixa o Meta contar uma vez só.
//
// Regras:
//   - LGPD: só com `consent: 'granted'` (o app só chama depois do "Aceitar");
//     recusou ou não respondeu → nada sai daqui;
//   - exige o JWT do usuário (auth.getUser); e-mail e id vêm da conta, nunca do corpo;
//   - eventos e event_id fixos por conta (evento.ts); custom_data decidido aqui;
//   - no máximo 1 envio por conta + evento a cada 24 h (public.meta_eventos_enviados,
//     migration 20261019130000; RLS sem política, só a service role grava);
//   - logs só com status, nunca e-mail, IP, token ou corpo.
//
// Corpo: { event_name, event_id, custom_data?, fbp?, fbc?, event_source_url?, consent: 'granted' }
// Respostas: { ok: true } | { ok: true, repetido: true }
//            | { ok: false, error: 'unauthorized' | 'sem_consentimento' | 'evento_invalido'
//                                  | 'event_id_invalido' | 'desligado' | 'envio' }.
//
// Secrets: META_PIXEL_ID, META_CAPI_TOKEN, META_GRAPH_VERSION (opcional, padrão v23.0),
//          META_TEST_EVENT_CODE (opcional: só para conferir em "Eventos de teste").
// Deploy: supabase functions deploy meta-evento

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { JANELA_REENVIO_MS, ipDoCliente, montarEvento, validarPedido } from './evento.ts';

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
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const json = (body: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...corsHeaders(req) } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, req);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401, req);

  let body: unknown = null;
  try { body = await req.json(); } catch { /* corpo inválido: validarPedido recusa */ }

  // Consentimento antes de qualquer outra coisa (nem consulta a conta sem ele).
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.consent !== 'granted') return json({ ok: false, error: 'sem_consentimento' }, 403, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await admin.auth.getUser(jwt);
  const user = u?.user;
  if (uErr || !user) return json({ ok: false, error: 'unauthorized' }, 401, req);

  const v = validarPedido(body, user.id);
  if (!v.ok) return json({ ok: false, error: v.error }, v.error === 'sem_consentimento' ? 403 : 400, req);
  const { pedido } = v;

  const pixelId = (Deno.env.get('META_PIXEL_ID') || '').trim();
  const token = (Deno.env.get('META_CAPI_TOKEN') || '').trim();
  if (!pixelId || !token) return json({ ok: false, error: 'desligado' }, 503, req);

  // Reserva antes de enviar (duas abas juntas não mandam dois): primeira vez →
  // insert; já enviou → só renova se passou da janela.
  const agora = new Date();
  let anterior: string | null = null;
  const chave = { user_id: user.id, event_name: pedido.eventName };
  const { error: errInsert } = await admin.from('meta_eventos_enviados')
    .insert({ ...chave, enviado_em: agora.toISOString() });
  if (errInsert) {
    if (errInsert.code !== '23505') {
      console.error('[meta-evento] reserva falhou', errInsert.code);
      return json({ ok: false, error: 'envio' }, 500, req);
    }
    const { data: linha } = await admin.from('meta_eventos_enviados').select('enviado_em')
      .eq('user_id', user.id).eq('event_name', pedido.eventName).maybeSingle();
    anterior = linha?.enviado_em ?? null;
    const limite = new Date(agora.getTime() - JANELA_REENVIO_MS).toISOString();
    const { data: renovado, error: errUpd } = await admin.from('meta_eventos_enviados')
      .update({ enviado_em: agora.toISOString() })
      .eq('user_id', user.id).eq('event_name', pedido.eventName)
      .lt('enviado_em', limite)
      .select('user_id');
    if (errUpd) {
      console.error('[meta-evento] reserva falhou', errUpd.code);
      return json({ ok: false, error: 'envio' }, 500, req);
    }
    // Já enviado nas últimas 24 h: para o app, missão cumprida.
    if (!renovado || renovado.length === 0) return json({ ok: true, repetido: true }, 200, req);
  }

  const evento = await montarEvento({
    pedido,
    userId: user.id,
    email: user.email,
    ip: ipDoCliente((n) => req.headers.get(n)),
    userAgent: req.headers.get('user-agent'),
    agoraMs: agora.getTime(),
  });
  const testCode = (Deno.env.get('META_TEST_EVENT_CODE') || '').trim();
  const version = (Deno.env.get('META_GRAPH_VERSION') || 'v23.0').trim();

  try {
    const res = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ data: [evento], ...(testCode ? { test_event_code: testCode } : {}) }),
    });
    if (!res.ok) throw new Error(`Meta ${res.status}`);
    await res.body?.cancel();
  } catch (e) {
    // Não enviou: libera para tentar de novo (volta ao envio anterior, se havia).
    if (anterior) {
      await admin.from('meta_eventos_enviados').update({ enviado_em: anterior })
        .eq('user_id', user.id).eq('event_name', pedido.eventName);
    } else {
      await admin.from('meta_eventos_enviados').delete()
        .eq('user_id', user.id).eq('event_name', pedido.eventName);
    }
    // Só o status (ex.: "Meta 400"); nunca o corpo da resposta, que ecoa dados.
    console.error('[meta-evento]', pedido.eventName, e instanceof Error ? e.message.slice(0, 40) : 'erro');
    return json({ ok: false, error: 'envio' }, 502, req);
  }

  return json({ ok: true }, 200, req);
});
