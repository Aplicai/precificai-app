-- ============================================================
-- ============================================================
--
--   ATENCAO! MIGRATION MANUAL — RODAR NO SUPABASE SQL EDITOR
--
--   Painel do Supabase -> SQL Editor -> colar -> Run.
--
--   Objetivo (Fase 1 — Planos/Asaas):
--   Tabela `subscriptions` com o plano atual de cada usuario.
--   O app (usePlan) le essa tabela; a Edge Function `asaas-webhook`
--   escreve nela ao receber eventos de pagamento do Asaas.
--
--   Modelo de cobranca (regra oficial):
--     - Mensal via cartao:  Pro R$29,90 / Ilimitado R$49,90
--     - Anual via Pix -10%: Pro R$322,90 / Ilimitado R$538,90
--     - Sem trial. Upgrade Pro->Ilimitado proporcional.
--
--   RLS: cada user le SOMENTE a propria assinatura. Ninguem
--   escreve via cliente — so a Edge Function (service_role).
--   Downgrade/cancelamento volta plano para 'free' (excedentes
--   de produtos/combos viram read-only no app, nunca apagados).
--
-- ============================================================
-- ============================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Plano vigente. Espelha src/config/plans.js.
  plano TEXT NOT NULL DEFAULT 'free' CHECK (plano IN ('free', 'pro', 'ilimitado')),
  -- active | pending | overdue | canceled
  status TEXT NOT NULL DEFAULT 'active',
  -- mensal | anual (null no free)
  ciclo TEXT CHECK (ciclo IN ('mensal', 'anual')),
  -- Referencias do Asaas (pra reconciliar webhooks).
  asaas_customer_id TEXT,
  asaas_subscription_id TEXT,
  -- Fim do periodo pago atual (apos isso, sem renovacao -> volta free).
  current_period_end TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- User le SOMENTE a propria assinatura. SEM policy de write de propósito:
-- so a Edge Function com service_role escreve (ela ignora RLS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'users_read_own_subscription'
  ) THEN
    EXECUTE 'CREATE POLICY "users_read_own_subscription" ON subscriptions FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_sub ON subscriptions(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_cus ON subscriptions(asaas_customer_id);

-- Trigger pra manter updated_at em sync.
CREATE OR REPLACE FUNCTION set_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION set_subscriptions_updated_at();
