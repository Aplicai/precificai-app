-- ============================================================
-- ============================================================
--
--   ATENCAO! MIGRATION MANUAL — RODAR NO SUPABASE SQL EDITOR
--
--   Este arquivo NAO eh executado automaticamente pelo app.
--   Voce (operador) precisa abrir o painel do Supabase ->
--   SQL Editor -> colar este conteudo -> Run.
--
--   Objetivo:
--   Mover whitelist de feature flags BETA (antes hardcoded em
--   src/utils/featureFlags.js) para uma tabela no banco.
--
--   Beneficios:
--   - Emails de beta testers nao ficam mais expostos no
--     bundle JS minificado entregue ao cliente.
--   - Adicionar/remover acesso vira UPDATE no banco, sem
--     redeploy.
--   - RLS garante que cada user so ve as proprias flags.
--
-- ============================================================
-- ============================================================

CREATE TABLE IF NOT EXISTS beta_features (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feature_key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, feature_key)
);

ALTER TABLE beta_features ENABLE ROW LEVEL SECURITY;

-- User le SOMENTE as proprias flags. INSERT/UPDATE/DELETE nao
-- tem policy de propósito — so service_role (dashboard) muda.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'beta_features' AND policyname = 'users_read_own_beta'
  ) THEN
    EXECUTE 'CREATE POLICY "users_read_own_beta" ON beta_features FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_beta_features_user ON beta_features(user_id);

-- Seed: transfere o unico email que estava na whitelist hardcoded.
-- Idempotente (ON CONFLICT). Se o user nao existir no auth.users,
-- nenhum row eh inserido — sem erro.
INSERT INTO beta_features (user_id, feature_key)
SELECT id, 'dre_fluxo_caixa'
FROM auth.users
WHERE email = 'teste@teste.com.br'
ON CONFLICT (user_id, feature_key) DO NOTHING;
