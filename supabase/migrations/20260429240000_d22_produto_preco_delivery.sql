-- D-21/D-22: Preço de delivery por produto × plataforma.
--
-- Hoje só existe `produtos.preco_venda` único. Mas no delivery o usuário precisa
-- de preço diferente por plataforma (iFood cobra mais comissão que próprio site,
-- então preço diferente). Esta tabela permite persistir preço×plataforma.
--
-- Quando vazio, a UI usa o preço sugerido calculado pela engine.

CREATE TABLE IF NOT EXISTS produto_preco_delivery (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  plataforma_id BIGINT NOT NULL REFERENCES delivery_config(id) ON DELETE CASCADE,
  preco_venda REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, produto_id, plataforma_id)
);

ALTER TABLE produto_preco_delivery ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user can manage own produto_preco_delivery" ON produto_preco_delivery;
CREATE POLICY "user can manage own produto_preco_delivery"
  ON produto_preco_delivery FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_ppd_user_produto ON produto_preco_delivery (user_id, produto_id);
