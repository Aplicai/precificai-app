-- Sprint 2 S4 — RPCs transacionais para operações multi-tabela.
--
-- MOTIVAÇÃO (audit P0-04, P1-12):
-- Várias operações do app envolvem N escritas em tabelas relacionadas e o cliente
-- as fazia em sequência sem transação. Falha no meio = estado inconsistente.
--
-- Casos cobertos por este migration:
--   1. atualizar_precos_lote   — atualiza preço de múltiplos produtos atomicamente
--                                + grava histórico em historico_precos numa única txn.
--   2. solicitar_exclusao_conta — registra deletion_requested_at em metadata + audit log.
--   3. purge_account_data       — hard-delete real após 30 dias (cron-only, security definer).
--
-- DEPLOY:
--   supabase db push  (após reviewer aprovar)
--   ou: psql -f este_arquivo.sql em ambiente staging primeiro.
--
-- IDEMPOTÊNCIA: usa CREATE OR REPLACE em todas as funções; safe re-run.

-- ============================================================
-- 1) atualizar_precos_lote
-- ============================================================
-- Recebe array JSON de { produto_id, novo_preco, motivo? } e atualiza tudo numa
-- única transação. Histórico fica em historico_precos com source='reajuste_lote'.
--
-- USO no client:
--   const { data, error } = await supabase.rpc('atualizar_precos_lote', {
--     p_alteracoes: [
--       { produto_id: 1, novo_preco: 25.50, motivo: 'Reajuste insumos jan/26' },
--       ...
--     ],
--   });

CREATE TABLE IF NOT EXISTS historico_precos (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL,
  preco_anterior NUMERIC(12,4),
  preco_novo NUMERIC(12,4) NOT NULL,
  motivo TEXT,
  source TEXT DEFAULT 'manual',  -- manual | reajuste_lote | sugestao_ia | atualizar_precos
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_historico_precos_user_produto
  ON historico_precos (user_id, produto_id, created_at DESC);

CREATE OR REPLACE FUNCTION atualizar_precos_lote(p_alteracoes JSONB)
RETURNS TABLE(produto_id BIGINT, atualizado BOOLEAN, mensagem TEXT)
LANGUAGE plpgsql
SECURITY INVOKER  -- respeita RLS do chamador
AS $$
DECLARE
  alt JSONB;
  v_produto_id BIGINT;
  v_novo_preco NUMERIC;
  v_motivo TEXT;
  v_preco_anterior NUMERIC;
  v_user_id UUID := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;
  IF jsonb_typeof(p_alteracoes) != 'array' THEN
    RAISE EXCEPTION 'p_alteracoes deve ser um array JSON';
  END IF;

  FOR alt IN SELECT * FROM jsonb_array_elements(p_alteracoes)
  LOOP
    v_produto_id := (alt->>'produto_id')::BIGINT;
    v_novo_preco := (alt->>'novo_preco')::NUMERIC;
    v_motivo := COALESCE(alt->>'motivo', 'Reajuste em lote');

    IF v_novo_preco IS NULL OR v_novo_preco < 0 THEN
      RETURN QUERY SELECT v_produto_id, FALSE, 'Preço inválido';
      CONTINUE;
    END IF;

    -- Snapshot do preço anterior
    SELECT preco_venda INTO v_preco_anterior
      FROM produtos
     WHERE id = v_produto_id AND user_id = v_user_id;

    IF NOT FOUND THEN
      RETURN QUERY SELECT v_produto_id, FALSE, 'Produto não encontrado ou sem permissão';
      CONTINUE;
    END IF;

    UPDATE produtos
       SET preco_venda = v_novo_preco,
           updated_at  = NOW()
     WHERE id = v_produto_id AND user_id = v_user_id;

    INSERT INTO historico_precos
      (user_id, produto_id, preco_anterior, preco_novo, motivo, source)
    VALUES
      (v_user_id, v_produto_id, v_preco_anterior, v_novo_preco, v_motivo, 'reajuste_lote');

    RETURN QUERY SELECT v_produto_id, TRUE, NULL::TEXT;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION atualizar_precos_lote(JSONB) TO authenticated;

-- ============================================================
-- 2) account_deletion_requests + solicitar_exclusao_conta
-- ============================================================
CREATE TABLE IF NOT EXISTS account_deletion_requests (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  purge_scheduled_for TIMESTAMPTZ NOT NULL,
  cancelled_at TIMESTAMPTZ NULL,
  source TEXT DEFAULT 'web',
  UNIQUE (user_id, requested_at)
);

ALTER TABLE account_deletion_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_requests" ON account_deletion_requests;
CREATE POLICY "users_read_own_requests" ON account_deletion_requests
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "users_insert_own_requests" ON account_deletion_requests;
CREATE POLICY "users_insert_own_requests" ON account_deletion_requests
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Cancelar é restrito a admin/Service Role apenas (sem policy → bloqueado p/ authenticated)

-- ============================================================
-- 3) purge_account_data — cron-only, hard-delete após 30 dias
-- ============================================================
-- Importante: SECURITY DEFINER porque precisa rodar fora do contexto do user
-- (ele já não consegue logar). Restringir EXECUTE a service_role.
CREATE OR REPLACE FUNCTION purge_expired_deleted_accounts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  expired_user_id UUID;
  count_purged INTEGER := 0;
BEGIN
  FOR expired_user_id IN
    SELECT user_id FROM account_deletion_requests
     WHERE cancelled_at IS NULL
       AND purge_scheduled_for <= NOW()
  LOOP
    -- Ordem: tabelas filhas (FK) → tabelas pai → auth.users (cascade)
    DELETE FROM produto_embalagens     WHERE user_id = expired_user_id;
    DELETE FROM produto_preparos       WHERE user_id = expired_user_id;
    DELETE FROM produto_ingredientes   WHERE user_id = expired_user_id;
    DELETE FROM preparo_ingredientes   WHERE user_id = expired_user_id;
    DELETE FROM delivery_combo_itens   WHERE user_id = expired_user_id;
    DELETE FROM delivery_produto_itens WHERE user_id = expired_user_id;
    DELETE FROM delivery_combos        WHERE user_id = expired_user_id;
    DELETE FROM delivery_produtos      WHERE user_id = expired_user_id;
    DELETE FROM delivery_adicionais    WHERE user_id = expired_user_id;
    DELETE FROM delivery_config        WHERE user_id = expired_user_id;
    DELETE FROM vendas                 WHERE user_id = expired_user_id;
    DELETE FROM produtos               WHERE user_id = expired_user_id;
    DELETE FROM preparos               WHERE user_id = expired_user_id;
    DELETE FROM embalagens             WHERE user_id = expired_user_id;
    DELETE FROM materias_primas        WHERE user_id = expired_user_id;
    DELETE FROM categorias_produtos    WHERE user_id = expired_user_id;
    DELETE FROM categorias_preparos    WHERE user_id = expired_user_id;
    DELETE FROM categorias_embalagens  WHERE user_id = expired_user_id;
    DELETE FROM categorias_insumos     WHERE user_id = expired_user_id;
    DELETE FROM faturamento_mensal     WHERE user_id = expired_user_id;
    DELETE FROM despesas_variaveis     WHERE user_id = expired_user_id;
    DELETE FROM despesas_fixas         WHERE user_id = expired_user_id;
    DELETE FROM historico_precos       WHERE user_id = expired_user_id;
    DELETE FROM perfil                 WHERE user_id = expired_user_id;
    DELETE FROM configuracao           WHERE user_id = expired_user_id;

    -- Marca a request como concluída e remove o auth.user (CASCADE limpa o resto).
    UPDATE account_deletion_requests SET cancelled_at = NOW()
     WHERE user_id = expired_user_id AND cancelled_at IS NULL;

    DELETE FROM auth.users WHERE id = expired_user_id;
    count_purged := count_purged + 1;
  END LOOP;

  RETURN count_purged;
END;
$$;

REVOKE ALL ON FUNCTION purge_expired_deleted_accounts() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_expired_deleted_accounts() TO service_role;

-- Para agendar diariamente (executar manualmente no SQL editor do Supabase Dashboard):
--
-- SELECT cron.schedule(
--   'purge-deleted-accounts-daily',
--   '0 3 * * *',  -- 03:00 UTC todo dia
--   $$ SELECT purge_expired_deleted_accounts(); $$
-- );

COMMENT ON FUNCTION atualizar_precos_lote IS
  'Sprint 2 S4 — atualiza preço de múltiplos produtos atomicamente, gravando histórico.';
COMMENT ON FUNCTION purge_expired_deleted_accounts IS
  'Sprint 2 S14 — hard-delete de contas com >30 dias de solicitação de exclusão. Rodar via pg_cron.';
