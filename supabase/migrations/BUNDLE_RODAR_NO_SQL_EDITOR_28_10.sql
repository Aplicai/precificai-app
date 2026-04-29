-- Sessão 28.10 — Bundle das 2 migrations novas pra rodar no SQL Editor.
-- Cole TUDO de uma vez no SQL Editor do Supabase Dashboard.
-- Idempotente: pode rodar várias vezes sem efeito colateral.

-- ─────────────────────────────────────────────────────────────────
-- APP-36: Embalagem padrão por categoria de produto
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS embalagem_categoria_padrao (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embalagem_id BIGINT NOT NULL REFERENCES embalagens(id) ON DELETE CASCADE,
  categoria_id BIGINT NOT NULL REFERENCES categorias_produtos(id) ON DELETE CASCADE,
  canal TEXT NOT NULL DEFAULT 'balcao' CHECK (canal IN ('balcao', 'delivery')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, categoria_id, canal)
);

ALTER TABLE embalagem_categoria_padrao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user can manage own embalagem_categoria_padrao" ON embalagem_categoria_padrao;
CREATE POLICY "user can manage own embalagem_categoria_padrao"
  ON embalagem_categoria_padrao FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_emb_cat_padrao_user_cat_canal
  ON embalagem_categoria_padrao (user_id, categoria_id, canal);

-- ─────────────────────────────────────────────────────────────────
-- APP-43: Quantitativo de vendas por canal
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE configuracao
  ADD COLUMN IF NOT EXISTS vendas_mes_balcao INTEGER DEFAULT 0;

ALTER TABLE configuracao
  ADD COLUMN IF NOT EXISTS vendas_mes_delivery INTEGER DEFAULT 0;
