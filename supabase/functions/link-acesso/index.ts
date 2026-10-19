// link-acesso — link de acesso de uso único (tela do primeiro preço,
// 19/10/2026). Quem calculou o 1º preço dentro do navegador do Instagram/
// Facebook toca em "Abrir no Chrome" e o app abre lá JÁ LOGADO: 72 pessoas
// começaram no Instagram e nenhuma voltou outro dia (ao fechar o Instagram,
// o app some, e no Chrome ela não estava logada).
//
// Regras:
//   - exige o JWT do usuário (o gateway aceita a anon key como JWT; a
//     autenticação de verdade é o auth.getUser abaixo);
//   - gera o link SÓ para o e-mail da própria conta (o corpo é ignorado);
//   - no máximo 5 por hora por conta (public.link_acesso_reservar,
//     migration 20261019120000; RLS sem política, só a service role usa);
//   - o link é uma credencial: nunca vai para log.
//
// generateLink não envia e-mail: só devolve o action_link (uso único, expira
// como os magic links do projeto). Depois do login o Supabase redireciona
// para https://app.precificaiapp.com/?instalar=1 (precisa estar na lista de
// Redirect URLs do Auth; senão cai no Site URL, ainda logado).
//
// Respostas: { ok: true, link } | { ok: false, error: 'limite' } (429)
//            | { ok: false, error: 'unauthorized' | 'sem_email' | 'erro' }.
//
// Secrets: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY do runtime.
// Deploy: supabase functions deploy link-acesso

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REDIRECT = 'https://app.precificaiapp.com/?instalar=1';
const MAX_POR_HORA = 5;

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

// no-store: a resposta carrega uma credencial de login.
const json = (body: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) },
  });

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

  // Conta antes de gerar (atômico no banco): 5 por hora por conta.
  const { data: liberado, error: errLimite } = await admin.rpc('link_acesso_reservar', {
    p_user_id: user.id,
    p_max: MAX_POR_HORA,
  });
  if (errLimite) {
    console.error('[link-acesso] limite', errLimite.message);
    return json({ ok: false, error: 'erro' }, 500, req);
  }
  if (liberado !== true) return json({ ok: false, error: 'limite' }, 429, req);

  const { data: gerado, error: errLink } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: REDIRECT },
  });
  const link = gerado?.properties?.action_link;
  if (errLink || !link) {
    // Só a mensagem do erro: nunca o link nem o objeto `gerado`.
    console.error('[link-acesso] generateLink', errLink?.message ?? 'sem action_link');
    return json({ ok: false, error: 'erro' }, 500, req);
  }

  return json({ ok: true, link }, 200, req);
});
