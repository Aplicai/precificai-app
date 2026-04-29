-- Sessão 28.9 (encerramento) — Fecha TODAS as pendências de DB acumuladas:
--
-- 1. Tabela `feedback` + RLS (Sessão 28.7 — falhou na 1ª tentativa por DB password)
-- 2. Policy `anon_insert_feedback` (Sessão 28.7 rev2)
-- 3. CHECK constraint em produtos.unidade_rendimento (Sessão 28.9 P1-04 — agora
--    seguro habilitar pois dados foram normalizados)
-- 4. Sanidade: confirma que enum está respeitado em todos os produtos
--
-- TUDO IDEMPOTENTE — pode rodar múltiplas vezes sem efeito colateral.

-- ====================================================================
-- BLOCO 1: feedback (Sessão 28.7)
-- ====================================================================

CREATE TABLE IF NOT EXISTS feedback (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  nome_negocio TEXT,
  segmento TEXT,
  mensagem TEXT NOT NULL CHECK (length(mensagem) > 0 AND length(mensagem) <= 5000),
  app_versao TEXT,
  plataforma TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created_at ON feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feedback_user_id ON feedback(user_id);

ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;

-- Policies (drop+create pra garantir idempotência)
DROP POLICY IF EXISTS "auth_insert_feedback" ON feedback;
DROP POLICY IF EXISTS "anon_insert_feedback" ON feedback;
DROP POLICY IF EXISTS "auth_select_own_feedback" ON feedback;

CREATE POLICY "auth_insert_feedback"
  ON feedback FOR INSERT TO authenticated
  WITH CHECK (user_id IS NULL OR user_id = auth.uid());

CREATE POLICY "anon_insert_feedback"
  ON feedback FOR INSERT TO anon
  WITH CHECK (user_id IS NULL);

CREATE POLICY "auth_select_own_feedback"
  ON feedback FOR SELECT TO authenticated
  USING (user_id = auth.uid());

COMMENT ON TABLE feedback IS
  'Sugestões enviadas pela Central de Suporte. Service-role lê tudo; usuário só vê o próprio. Anon pode inserir com user_id NULL.';

-- ====================================================================
-- BLOCO 2: Sanidade antes de habilitar CHECK em unidade_rendimento
-- ====================================================================

DO $$
DECLARE
  invalid_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO invalid_count
  FROM produtos
  WHERE unidade_rendimento IS NULL
     OR unidade_rendimento NOT IN ('por_unidade', 'por_kg', 'por_litro');

  IF invalid_count > 0 THEN
    RAISE WARNING '[Sanity] Existem % produtos com unidade_rendimento fora do enum. Aplicando normalização agora.', invalid_count;

    -- Re-aplica a normalização (caso a migration anterior não tenha sido rodada
    -- ou novos dados legados tenham entrado entre uma execução e outra)
    UPDATE produtos SET unidade_rendimento = CASE
      WHEN unidade_rendimento IN ('por_unidade', 'por_kg', 'por_litro') THEN unidade_rendimento
      WHEN LOWER(COALESCE(unidade_rendimento, '')) ~ 'grama|quilo|^kg$|^g$'
           AND COALESCE(rendimento_total, 0) > 0
           AND COALESCE(rendimento_total, 0) <= 50
        THEN 'por_kg'
      WHEN LOWER(COALESCE(unidade_rendimento, '')) ~ 'litro|^l$|ml|mililitro'
           AND COALESCE(rendimento_total, 0) > 0
           AND COALESCE(rendimento_total, 0) <= 50
        THEN 'por_litro'
      ELSE 'por_unidade'
    END
    WHERE unidade_rendimento IS NULL
       OR unidade_rendimento NOT IN ('por_unidade', 'por_kg', 'por_litro');
  ELSE
    RAISE NOTICE '[Sanity] Todos os produtos têm unidade_rendimento normalizado. OK pra habilitar CHECK.';
  END IF;
END$$;

-- ====================================================================
-- BLOCO 3: CHECK constraint em produtos.unidade_rendimento
-- ====================================================================

-- Dropa constraint antiga se existir (pra permitir re-execução)
ALTER TABLE produtos DROP CONSTRAINT IF EXISTS produtos_unidade_rendimento_enum;

-- Cria a constraint defensiva — agora seguro pois dados estão normalizados
ALTER TABLE produtos
  ADD CONSTRAINT produtos_unidade_rendimento_enum
  CHECK (unidade_rendimento IN ('por_unidade', 'por_kg', 'por_litro'));

-- ====================================================================
-- BLOCO 4: Resumo final
-- ====================================================================

DO $$
DECLARE
  feedback_existe BOOLEAN;
  total_produtos INTEGER;
  por_unid INTEGER;
  por_kg_n INTEGER;
  por_litro_n INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_name = 'feedback'
  ) INTO feedback_existe;

  SELECT COUNT(*) INTO total_produtos FROM produtos;
  SELECT COUNT(*) INTO por_unid FROM produtos WHERE unidade_rendimento = 'por_unidade';
  SELECT COUNT(*) INTO por_kg_n FROM produtos WHERE unidade_rendimento = 'por_kg';
  SELECT COUNT(*) INTO por_litro_n FROM produtos WHERE unidade_rendimento = 'por_litro';

  RAISE NOTICE '================================================================';
  RAISE NOTICE 'Sessão 28.9 — TODAS PENDÊNCIAS DE DB FECHADAS';
  RAISE NOTICE '================================================================';
  RAISE NOTICE 'feedback table:           %', CASE WHEN feedback_existe THEN 'OK ✓' ELSE 'FALHA ✗' END;
  RAISE NOTICE 'produtos total:           %', total_produtos;
  RAISE NOTICE '  por_unidade:            %', por_unid;
  RAISE NOTICE '  por_kg:                 %', por_kg_n;
  RAISE NOTICE '  por_litro:              %', por_litro_n;
  RAISE NOTICE 'CHECK constraint:         OK ✓ (produtos_unidade_rendimento_enum)';
  RAISE NOTICE '================================================================';
END$$;
