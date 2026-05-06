-- Migration sessão 28.29 — Foundation pra Multi-Loja com persistência Supabase
--
-- HOJE (28.22 → MVP): lojas vivem só em AsyncStorage do dispositivo. Trocar
-- de loja na UI muda a label exibida mas NÃO filtra os dados. Insumos/produtos
-- são compartilhados entre todas as lojas (problema: usuária com 2 lojas vê
-- todos os insumos juntos).
--
-- ESTA MIGRATION é APENAS A FOUNDATION (backwards-compatible):
--   1. Cria tabela `lojas` no Supabase (per-user)
--   2. Adiciona `loja_id BIGINT NULL` em todas as tabelas de dados
--   3. Mantém NULL como "compartilhado" (= dado pré-multi-loja, todas as lojas veem)
--
-- O filtro `WHERE loja_id IS NULL OR loja_id = ?` deve ser aplicado nos READs
-- nas próximas sessões — esta migration NÃO altera comportamento sozinha.
--
-- APLICAR no Supabase SQL Editor antes de habilitar a feature de filtro:
-- - É idempotente (IF NOT EXISTS em todos os comandos).
-- - Não corrompe dados existentes (loja_id default NULL = compartilhado).
-- - Pode rodar em produção sem downtime.

-- 1. Tabela `lojas` (a empresa, com várias lojas/filiais sob mesmo login)
CREATE TABLE IF NOT EXISTS lojas (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE lojas ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'lojas' AND policyname = 'lojas_owner'
  ) THEN
    CREATE POLICY lojas_owner ON lojas FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
  END IF;
END$$;

-- 2. Adiciona loja_id NULL em todas as tabelas de dados
--    NULL = "compartilhado entre todas as lojas" (compat com dados pre-existentes)
ALTER TABLE produtos             ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE materias_primas      ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE preparos             ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE embalagens           ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE vendas               ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE despesas_fixas       ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE despesas_variaveis   ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE faturamento_mensal   ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE delivery_config      ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE delivery_combos      ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE produto_preco_delivery ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;
ALTER TABLE configuracao         ADD COLUMN IF NOT EXISTS loja_id BIGINT REFERENCES lojas(id) ON DELETE SET NULL;

-- 3. Índices pra performance dos filtros futuros
CREATE INDEX IF NOT EXISTS idx_produtos_loja           ON produtos(loja_id);
CREATE INDEX IF NOT EXISTS idx_materias_primas_loja    ON materias_primas(loja_id);
CREATE INDEX IF NOT EXISTS idx_preparos_loja           ON preparos(loja_id);
CREATE INDEX IF NOT EXISTS idx_embalagens_loja         ON embalagens(loja_id);
CREATE INDEX IF NOT EXISTS idx_vendas_loja             ON vendas(loja_id);
CREATE INDEX IF NOT EXISTS idx_delivery_config_loja    ON delivery_config(loja_id);
CREATE INDEX IF NOT EXISTS idx_delivery_combos_loja    ON delivery_combos(loja_id);

-- ROADMAP da próxima rodada (depois de aplicar esta migration):
--   a. Migrar lojas do AsyncStorage → tabela `lojas` (script de migração one-shot).
--   b. Criar helper `currentLojaId()` que lê AsyncStorage e retorna BIGINT do DB.
--   c. Adicionar `WHERE (loja_id IS NULL OR loja_id = ?)` em todos os SELECTs.
--   d. Setar `loja_id = currentLojaId()` em todos os INSERTs.
--   e. UI pra "atribuir item a uma loja" (move loja_id NULL → BIGINT específico).
