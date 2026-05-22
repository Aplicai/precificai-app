-- ============================================================
-- ============================================================
--
--   MIGRATION — Asaas (Fase 1) — JÁ APLICADA via Management API
--   em 2026-05-22 (projeto lwznqpxzmqptrpbifvka).
--
--   Contexto: a tabela `subscriptions` JÁ EXISTIA (schema oficial em
--   src/database/supabase-schema.sql, era Stripe) com as colunas
--   `plan`, `status`, `started_at`, `expires_at`, `stripe_subscription_id`,
--   UNIQUE(user_id), e um trigger de signup que insere (user_id, plan, status).
--
--   Por isso NÃO recriamos a tabela. Esta migration é ADITIVA e
--   NÃO-DESTRUTIVA: adiciona as colunas do Asaas e ALARGA o CHECK do
--   `plan` para aceitar os planos novos. Mantém os nomes existentes
--   (`plan`, `expires_at`) — o webhook e o usePlan escrevem/leem esses.
--
--   Modelo de cobranca (regra oficial):
--     - Mensal via cartao:  Pro R$29,90 / Ilimitado R$49,90
--     - Anual via Pix -10%: Pro R$322,90 / Ilimitado R$538,90
--     - Sem trial. Upgrade Pro->Ilimitado proporcional.
--
--   RLS: cada user le SOMENTE a propria assinatura (policy
--   `users_own_data_select` ja existente). Ninguem escreve via cliente —
--   so a Edge Function `asaas-webhook` (service_role, ignora RLS).
--   Downgrade/cancelamento volta `plan` para 'free' (excedentes de
--   produtos/combos viram read-only no app, nunca apagados).
--
--   status usado pelo webhook: 'active' | 'past_due' | 'canceled'
--   (todos ja permitidos pelo CHECK existente subscriptions_status_check).
--
-- ============================================================
-- ============================================================

-- 1) Colunas do Asaas (aditivo).
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS ciclo TEXT,
  ADD COLUMN IF NOT EXISTS asaas_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS asaas_subscription_id TEXT;

-- 2) Alarga o CHECK do plano para os planos atuais (free/pro/ilimitado).
--    Os nomes antigos (essencial/profissional) eram da era Stripe e nao
--    sao mais usados. So existia 1 linha 'free', entao a troca e segura.
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_plan_check CHECK (plan IN ('free', 'pro', 'ilimitado'));

-- 3) CHECK do ciclo (nullable no free).
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_ciclo_check;
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_ciclo_check CHECK (ciclo IS NULL OR ciclo IN ('mensal', 'anual'));

-- 4) Indices p/ reconciliar webhooks do Asaas.
CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_sub ON public.subscriptions(asaas_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_asaas_cus ON public.subscriptions(asaas_customer_id);
