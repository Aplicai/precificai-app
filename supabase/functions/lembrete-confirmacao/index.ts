// lembrete-confirmacao — reenvia o e-mail de confirmação do cadastro para quem
// ainda não confirmou: 2 h e 24 h depois do cadastro (public.confirmacao_pendentes,
// migration 20261015120000). O e-mail é o próprio template de confirmação do
// Supabase, com link novo (o anterior vence em 1 h).
//
// Chamadas (POST, header x-cron-secret = EMAIL_CRON_SECRET):
//   {}               → simulação: lista quem receberia
//   { enviar: true } → reenvia (o pg_cron chama de hora em hora; só 8h–21h de Brasília)
//
// Os reenvios saem pelo SMTP do Supabase Auth, que tem teto por hora
// (rate_limit_email_sent). Por isso no máximo MAX_POR_EXECUCAO por chamada:
// sobra folga para cadastros novos e troca de senha.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP = 'https://app.precificaiapp.com/';
const MAX_POR_EXECUCAO = 8;

function horaBrasilia(): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method !== 'POST') return new Response('Not found', { status: 404 });
  if (req.headers.get('x-cron-secret') !== Deno.env.get('EMAIL_CRON_SECRET')) {
    return json({ ok: false, error: 'unauthorized' }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const enviar = body?.enviar === true;
  if (enviar) {
    const h = horaBrasilia();
    if (h < 8 || h >= 21) return json({ ok: true, pulado: 'fora do horário', hora: h });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: pendentes, error } = await supabase.rpc('confirmacao_pendentes');
  if (error) return json({ ok: false, error: error.message }, 500);

  const lista = (pendentes || []).slice(0, MAX_POR_EXECUCAO);
  if (!enviar) return json({ ok: true, enviar, total: (pendentes || []).length, lista: lista.map((p) => ({ etapa: p.etapa, email: p.email })) });

  const relatorio: Record<string, unknown>[] = [];
  for (const p of lista) {
    // Registra antes (a chave primária impede envio duplo); falhou → libera.
    const { error: errReserva } = await supabase.from('confirmacao_lembretes').insert({ user_id: p.user_id, etapa: p.etapa });
    if (errReserva) { relatorio.push({ etapa: p.etapa, pulado: 'já enviado' }); continue; }
    const { error: errEnvio } = await supabase.auth.resend({ type: 'signup', email: p.email, options: { emailRedirectTo: APP } });
    if (errEnvio) {
      await supabase.from('confirmacao_lembretes').delete().eq('user_id', p.user_id).eq('etapa', p.etapa);
      relatorio.push({ etapa: p.etapa, erro: errEnvio.message.slice(0, 160) });
      // Teto de e-mails do Auth atingido: para aqui e tenta na próxima hora.
      if (/rate limit/i.test(errEnvio.message)) break;
      continue;
    }
    relatorio.push({ etapa: p.etapa, enviado: true });
  }
  return json({ ok: true, enviar, relatorio });
});
