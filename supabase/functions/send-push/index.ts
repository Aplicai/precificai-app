// Supabase Edge Function — send-push (M1-33)
//
// Recebe { user_id, title, body, data?, channelId? } e despacha via Expo Push API
// para todos os tokens registrados em `device_tokens` daquele usuário.
//
// Deploy:
//   supabase functions deploy send-push --no-verify-jwt=false
//
// Variáveis de ambiente esperadas:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injetadas pelo Supabase)
//   SUPABASE_ANON_KEY (auto-injetada — usada para validar JWT do caller)
//   INTERNAL_CRON_TOKEN (opcional — habilita disparos administrativos via header
//     X-Internal-Cron-Token; usado pelo cron de notificações de margem baixa, etc)
//
// Auth (Sessão 28.68 — security hardening C-1):
//   1) Chamadas autenticadas de usuário final: JWT é validado, user_id do payload
//      DEVE bater com o sub do JWT, senão 403.
//   2) Chamadas internas (cron jobs): devem enviar header X-Internal-Cron-Token
//      igual ao secret INTERNAL_CRON_TOKEN. Nesse modo qualquer user_id é aceito.

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

interface PushPayload {
  user_id: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  channelId?: string;
  /** Se true, ignora a preferência do usuário (use só para alertas críticos). */
  bypass_prefs?: boolean;
  /** Chave da preferência: 'estoque_baixo' | 'margem_critica' | 'resumo_diario'. */
  pref_key?: 'estoque_baixo' | 'margem_critica' | 'resumo_diario';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  let payload: PushPayload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  const { user_id, title, body, data = {}, channelId = 'default', bypass_prefs, pref_key } = payload;
  if (!user_id || !title || !body) {
    return json({ error: 'missing_fields' }, 400);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const INTERNAL_CRON_TOKEN = Deno.env.get('INTERNAL_CRON_TOKEN') ?? '';

  // === Sessão 28.68 — security gate (C-1) ===
  // Aceita 1) chamada interna autenticada via X-Internal-Cron-Token, OU
  // 2) JWT de usuário cujo sub == payload.user_id.
  const internalToken = req.headers.get('X-Internal-Cron-Token') ?? '';
  const isInternal = !!INTERNAL_CRON_TOKEN && internalToken === INTERNAL_CRON_TOKEN;

  if (!isInternal) {
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader || !SUPABASE_ANON_KEY) {
      return json({ error: 'unauthorized' }, 401);
    }
    let authedUserId: string | null = null;
    try {
      const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u, error: uErr } = await userClient.auth.getUser();
      if (uErr || !u?.user) {
        return json({ error: 'unauthorized' }, 401);
      }
      authedUserId = u.user.id;
    } catch {
      return json({ error: 'unauthorized' }, 401);
    }
    if (authedUserId !== user_id) {
      return json({ error: 'forbidden', detail: 'Cannot send push to another user' }, 403);
    }
  }
  // === fim do security gate ===

  const supa = createClient(SUPABASE_URL, SERVICE_ROLE);

  // 1. Checa preferências (skip se bypass)
  if (!bypass_prefs && pref_key) {
    const { data: prefs } = await supa
      .from('notif_prefs').select(pref_key).eq('user_id', user_id).maybeSingle();
    if (prefs && prefs[pref_key] === false) {
      return json({ skipped: 'user_pref_disabled' });
    }
  }

  // 2. Busca tokens
  const { data: tokens, error: tokErr } = await supa
    .from('device_tokens').select('expo_push_token, platform').eq('user_id', user_id);
  if (tokErr) return json({ error: tokErr.message }, 500);
  if (!tokens || tokens.length === 0) return json({ skipped: 'no_tokens' });

  // 3. Monta mensagens batch p/ Expo Push API
  const messages = tokens.map((t) => ({
    to: t.expo_push_token,
    title, body, data,
    sound: 'default',
    channelId,
    priority: 'high' as const,
  }));

  const resp = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Accept-encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });
  const result = await resp.json();

  // 4. Limpeza: tokens inválidos (DeviceNotRegistered) — remove do DB
  if (Array.isArray(result?.data)) {
    const invalidIdx: number[] = [];
    result.data.forEach((r: any, i: number) => {
      if (r.status === 'error' && r.details?.error === 'DeviceNotRegistered') invalidIdx.push(i);
    });
    if (invalidIdx.length) {
      const badTokens = invalidIdx.map((i) => tokens[i].expo_push_token);
      await supa.from('device_tokens').delete().in('expo_push_token', badTokens);
    }
  }

  return json({ sent: messages.length, result });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-internal-cron-token',
  };
}
