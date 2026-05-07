-- Sessão 28.44 (Auditoria de segurança H1)
-- Habilita RLS nas 3 tabelas que o cliente acessa via Supabase JS mas que
-- não tinham migration confirmada no repo:
--   - device_tokens (Expo push tokens)
--   - notif_prefs (preferências de notificação)
--   - account_deletion_requests (requests LGPD de exclusão de conta)
--
-- Sem RLS, qualquer usuário autenticado pode ler/escrever push tokens de
-- outros usuários (vetor de spam de notificações) ou enumerar contas em
-- processo de deleção.
--
-- Esta migration é idempotente: cria as tabelas se não existirem, habilita
-- RLS e aplica policies apenas pra dono (auth.uid() = user_id).
--
-- IMPORTANTE: rodar este SQL no SQL editor do Supabase em produção.

-- =========================================================
-- device_tokens
-- =========================================================
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token TEXT NOT NULL,
  platform TEXT,
  device_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, token)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "device_tokens_owner_all" ON public.device_tokens;
CREATE POLICY "device_tokens_owner_all" ON public.device_tokens
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id ON public.device_tokens(user_id);

-- =========================================================
-- notif_prefs
-- =========================================================
CREATE TABLE IF NOT EXISTS public.notif_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  push_enabled BOOLEAN DEFAULT TRUE,
  email_enabled BOOLEAN DEFAULT TRUE,
  margem_baixa BOOLEAN DEFAULT TRUE,
  preco_desatualizado BOOLEAN DEFAULT TRUE,
  resumo_semanal BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.notif_prefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_prefs_owner_all" ON public.notif_prefs;
CREATE POLICY "notif_prefs_owner_all" ON public.notif_prefs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- =========================================================
-- account_deletion_requests
-- =========================================================
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','cancelled')),
  scheduled_for TIMESTAMPTZ, -- 30 dias após request (LGPD grace period)
  completed_at TIMESTAMPTZ,
  reason TEXT,
  UNIQUE(user_id) -- só 1 request ativo por user
);

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;

-- Owner pode INSERT (criar request) e SELECT (ver status). UPDATE/DELETE
-- ficam bloqueados (apenas service role / Edge Function pode mudar status).
DROP POLICY IF EXISTS "deletion_req_owner_select" ON public.account_deletion_requests;
CREATE POLICY "deletion_req_owner_select" ON public.account_deletion_requests
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deletion_req_owner_insert" ON public.account_deletion_requests;
CREATE POLICY "deletion_req_owner_insert" ON public.account_deletion_requests
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_deletion_req_status ON public.account_deletion_requests(status, scheduled_for);

-- =========================================================
-- Verificação manual (rodar após migration):
-- SELECT relname, relrowsecurity FROM pg_class
-- WHERE relname IN ('device_tokens','notif_prefs','account_deletion_requests');
-- Esperado: relrowsecurity = true em todas.
-- =========================================================
