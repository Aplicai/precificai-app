// enviar-link-computador — "Me mandar o link por e-mail" da tabela de preços
// (escada dos 3 preços, 17/10/2026). No celular, a pessoa pede o link do app
// para abrir no computador.
//
// Regras:
//   - exige o JWT do usuário (o gateway aceita a anon key como JWT; a
//     autenticação de verdade é o auth.getUser abaixo);
//   - envia SÓ para o e-mail da própria conta (o corpo da chamada é ignorado);
//   - no máximo 1 por conta a cada 24 h (public.link_computador_envios,
//     migration 20261017120000; RLS sem política, só a service role grava).
//
// Respostas: { ok: true, email } | { ok: false, error: 'limite' } (429)
//            | { ok: false, error: 'unauthorized' | 'sem_email' | 'envio' }.
//
// Secrets: RESEND_API_KEY (+ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY do runtime).
// Deploy: supabase functions deploy enviar-link-computador

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { COR, FONTE, IMG, par } from '../email-ciclo-vida/layout.ts';

const FROM = 'Precificaí <noreply@precificaiapp.com>';
const REPLY_TO = 'contato@precificaiapp.com';
const LINK = 'https://app.precificaiapp.com';
const JANELA_MS = 24 * 60 * 60 * 1000;

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

const ASSUNTO = 'Seu link do Precificaí para abrir no computador';
const TEXTO = [
  'Abra este link no computador e entre com o mesmo e-mail:',
  LINK,
  '',
  'Na tela maior você vê o painel completo, os relatórios e monta a receita com cada ingrediente.',
  '',
  'Equipe Precificaí',
].join('\n');

function html(): string {
  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${ASSUNTO}</title></head>
<body style="margin:0;padding:0;background-color:${COR.fundo};">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:${COR.fundo};">
<tr><td align="center" style="padding:32px 12px 40px 12px;">
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:20px;">
    <tr><td style="padding:28px 32px 8px 32px;">
      <img src="${IMG}/logo-email-verde.png" width="110" height="19" alt="Precificaí" style="display:block;width:110px;height:auto;border:0;margin:0 0 24px 0;">
      <h1 style="margin:0 0 16px 0;font-family:${FONTE};font-size:24px;line-height:32px;font-weight:700;color:${COR.texto};">Abra o Precificaí no computador</h1>
      ${par('Abra este link no computador e entre com o mesmo e-mail.')}
      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:4px 0 20px 0;"><tr><td align="center" bgcolor="${COR.verde}" style="background-color:${COR.verde};border-radius:12px;">
        <a href="${LINK}" style="display:inline-block;padding:16px 32px;font-family:${FONTE};font-size:17px;line-height:22px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">app.precificaiapp.com</a>
      </td></tr></table>
      ${par('Na tela maior você vê o painel completo, os relatórios e monta a receita com cada ingrediente.')}
      ${par(`Um abraço,<br><b style="color:${COR.texto};">Equipe Precificaí</b>`, 'font-size:15px;line-height:23px;')}
    </td></tr>
    <tr><td style="padding:0 32px 28px 32px;font-family:${FONTE};font-size:12px;line-height:19px;color:${COR.suave};">Você recebeu este e-mail porque pediu o link no app.</td></tr>
  </table>
</td></tr>
</table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, req);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: u, error: uErr } = await admin.auth.getUser(jwt);
  const user = u?.user;
  if (uErr || !user) return json({ ok: false, error: 'unauthorized' }, 401, req);
  const email = user.email;
  if (!email) return json({ ok: false, error: 'sem_email' }, 400, req);

  // Reserva o envio antes de mandar (duas chamadas juntas não mandam dois):
  // primeira vez → insert; já enviou → só renova se passou da janela.
  const agora = new Date();
  let anterior: string | null = null;
  const { error: errInsert } = await admin.from('link_computador_envios').insert({ user_id: user.id, enviado_em: agora.toISOString() });
  if (errInsert) {
    if (errInsert.code !== '23505') return json({ ok: false, error: 'envio' }, 500, req);
    const { data: linha } = await admin.from('link_computador_envios').select('enviado_em').eq('user_id', user.id).maybeSingle();
    anterior = linha?.enviado_em ?? null;
    const limite = new Date(agora.getTime() - JANELA_MS).toISOString();
    const { data: renovado, error: errUpd } = await admin.from('link_computador_envios')
      .update({ enviado_em: agora.toISOString() })
      .eq('user_id', user.id)
      .lt('enviado_em', limite)
      .select('user_id');
    if (errUpd) return json({ ok: false, error: 'envio' }, 500, req);
    if (!renovado || renovado.length === 0) return json({ ok: false, error: 'limite' }, 429, req);
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: [email],
        reply_to: REPLY_TO,
        subject: ASSUNTO,
        html: html(),
        text: TEXTO,
        tags: [{ name: 'campanha', value: 'link_computador' }],
      }),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}`);
  } catch (e) {
    // Não enviou: libera para tentar de novo (volta ao envio anterior, se havia).
    if (anterior) await admin.from('link_computador_envios').update({ enviado_em: anterior }).eq('user_id', user.id);
    else await admin.from('link_computador_envios').delete().eq('user_id', user.id);
    console.error('[enviar-link-computador]', e instanceof Error ? e.message : e);
    return json({ ok: false, error: 'envio' }, 502, req);
  }

  return json({ ok: true, email }, 200, req);
});
