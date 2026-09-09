-- ============================================================
-- Audit 2026-09-08 — security hardening (findings A1, A3, A5, M5, B1, B8)
-- Rodar no SQL Editor do Supabase (prod) após revisão. Idempotente.
-- ============================================================

-- ------------------------------------------------------------
-- A1) handle_new_user: o trigger roda como supabase_auth_admin (search_path=auth)
--     e usava nomes não qualificados → INSERT falhava e o EXCEPTION engolia.
--     Resultado: usuários sem linha em subscriptions/configuracao/perfil.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  INSERT INTO public.subscriptions (user_id, plan, status)
    VALUES (NEW.id, 'free', 'active')
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.configuracao (user_id, lucro_desejado, faturamento_mensal, margem_seguranca)
    VALUES (NEW.id, 0.15, 0, 0)
    ON CONFLICT (user_id) DO NOTHING;
  INSERT INTO public.perfil (user_id, nome_negocio, segmento, telefone)
    VALUES (NEW.id, '', '', '')
    ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Não bloqueia o signup, mas deixa rastro visível nos logs do Postgres.
  RAISE WARNING 'handle_new_user falhou para %: % (%)', NEW.id, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- Backfill: todo usuário existente sem assinatura vira free explícito.
INSERT INTO public.subscriptions (user_id, plan, status)
SELECT u.id, 'free', 'active'
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ------------------------------------------------------------
-- A3/B8) feedback: sem INSERT anônimo; user_id obrigatório = auth.uid().
--        A tela de Suporte só existe no stack autenticado.
-- ------------------------------------------------------------
DROP POLICY IF EXISTS anon_insert_feedback ON public.feedback;
DROP POLICY IF EXISTS auth_insert_feedback ON public.feedback;
CREATE POLICY auth_insert_feedback ON public.feedback
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- user_email não pode ser forjado: força o e-mail do JWT.
CREATE OR REPLACE FUNCTION public.feedback_force_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
BEGIN
  NEW.user_id := auth.uid();
  NEW.user_email := (SELECT email FROM auth.users WHERE id = auth.uid());
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS feedback_force_email_trg ON public.feedback;
CREATE TRIGGER feedback_force_email_trg
  BEFORE INSERT ON public.feedback
  FOR EACH ROW EXECUTE FUNCTION public.feedback_force_email();

-- ------------------------------------------------------------
-- M5) asaas-webhook: idempotência por payment.id (reentrega não estende plano)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.asaas_events (
  payment_id   TEXT PRIMARY KEY,
  event        TEXT NOT NULL,
  user_id      UUID,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.asaas_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.asaas_events FROM anon, authenticated;
-- (sem policies: só service_role, usado pela edge function)

-- ------------------------------------------------------------
-- A5) Exclusão de conta (LGPD): purge alinhado ao schema REAL de prod
--     account_deletion_requests(id, user_id, requested_at, status, scheduled_for, completed_at, reason)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_deleted_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  r RECORD;
  count_purged INTEGER := 0;
  t TEXT;
BEGIN
  FOR r IN
    SELECT id, user_id FROM public.account_deletion_requests
     WHERE status = 'pending' AND scheduled_for <= NOW()
  LOOP
    -- Tabelas filhas primeiro (FKs sem cascade), depois pais. Lista dinâmica:
    -- toda tabela public com coluna user_id.
    FOREACH t IN ARRAY ARRAY[
      'produto_embalagens','produto_preparos','produto_ingredientes','produto_preco_delivery',
      'preparo_ingredientes','preparo_subpreparos','preparo_embalagens',
      'delivery_combo_itens','delivery_produto_itens','vendas_combos','delivery_combos',
      'delivery_produtos','delivery_adicionais','delivery_config',
      'vendas','estoque_movimentos','historico_precos',
      'produtos','preparos','embalagens','materias_primas','embalagem_categoria_padrao',
      'categorias_produtos','categorias_preparos','categorias_embalagens','categorias_insumos',
      'faturamento_mensal','despesas_variaveis','despesas_fixas','dre_mensal','fluxo_caixa_movimentos',
      'perfil','configuracao','device_tokens','notif_prefs','beta_features','feedback','subscriptions'
    ] LOOP
      IF to_regclass('public.' || t) IS NOT NULL THEN
        EXECUTE format('DELETE FROM public.%I WHERE user_id = $1', t) USING r.user_id;
      END IF;
    END LOOP;

    UPDATE public.account_deletion_requests
       SET status = 'completed', completed_at = NOW()
     WHERE id = r.id;

    DELETE FROM auth.users WHERE id = r.user_id;
    count_purged := count_purged + 1;
  END LOOP;
  RETURN count_purged;
END;
$$;
REVOKE ALL ON FUNCTION public.purge_expired_deleted_accounts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_deleted_accounts() TO service_role;

-- Agendamento diário (requer extensão pg_cron habilitada no dashboard):
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('purge-deleted-accounts-daily', '0 3 * * *',
--   $$ SELECT public.purge_expired_deleted_accounts(); $$);

-- ------------------------------------------------------------
-- B1) Grants: TRUNCATE/TRIGGER/REFERENCES não passam por RLS; RPCs SECURITY DEFINER
--     não devem ser executáveis por anon; search_path fixo.
-- ------------------------------------------------------------
REVOKE TRUNCATE, TRIGGER, REFERENCES ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, TRIGGER, REFERENCES ON TABLES FROM anon, authenticated;

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY['baixar_estoque','estornar_estoque_por_venda','registrar_entrada_estoque'] LOOP
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname = 'public' AND p.proname = fn) THEN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I FROM anon, public', fn);
      EXECUTE format('ALTER FUNCTION public.%I SET search_path = public, pg_catalog', fn);
    END IF;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- Audit CÁLCULO (delivery_config): o editor inline do DeliveryHub gravava a
-- "Comissão (%)" em `comissao_app` (coluna da taxa de pagamento online) e o
-- "Cupom R$" em `embalagem_extra`. Semântica canônica (tela Plataformas):
--   taxa_plataforma = comissão %, comissao_app = taxa pgto online %,
--   desconto_promocao = cupom R$. Realinha as linhas gravadas pelo Hub:
-- comissão "grande" (>10%) em comissao_app sem taxa_plataforma → move.
-- (Aggregate em prod 2026-09-09: 10 linhas nesse estado, 1 com embalagem_extra.)
-- ------------------------------------------------------------
UPDATE public.delivery_config
   SET taxa_plataforma = comissao_app,
       comissao_app = 0
 WHERE COALESCE(taxa_plataforma, 0) = 0
   AND COALESCE(comissao_app, 0) > 10;

UPDATE public.delivery_config
   SET desconto_promocao = COALESCE(desconto_promocao, 0) + embalagem_extra,
       embalagem_extra = 0
 WHERE COALESCE(embalagem_extra, 0) > 0;

-- Audit A10: faturamento_mensal sem UNIQUE permitia duplicar os 12 meses.
-- (Se já houver duplicatas, remover antes: manter o menor id por (user_id, mes).)
DELETE FROM public.faturamento_mensal f
 USING public.faturamento_mensal g
 WHERE f.user_id = g.user_id AND f.mes = g.mes AND f.id > g.id;
CREATE UNIQUE INDEX IF NOT EXISTS faturamento_mensal_user_mes_uidx
  ON public.faturamento_mensal (user_id, mes);

-- ------------------------------------------------------------
-- Verificação pós-aplicação (deve retornar 0):
-- SELECT count(*) FROM auth.users u
--  WHERE NOT EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = u.id);
-- ------------------------------------------------------------
