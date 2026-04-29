-- APP-36: Embalagem padrão por categoria de produto.
--
-- Permite marcar uma embalagem como padrão para uma ou mais categorias
-- de produto, opcionalmente diferenciada por canal (balcão vs delivery).
--
-- Quando o usuário cria um novo produto e escolhe a categoria, a UI
-- pré-seleciona a embalagem padrão dessa categoria. Usuário pode trocar.

CREATE TABLE IF NOT EXISTS embalagem_categoria_padrao (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embalagem_id BIGINT NOT NULL REFERENCES embalagens(id) ON DELETE CASCADE,
  categoria_id BIGINT NOT NULL REFERENCES categorias_produtos(id) ON DELETE CASCADE,
  canal TEXT NOT NULL DEFAULT 'balcao' CHECK (canal IN ('balcao', 'delivery')),
  created_at TIMESTAMPTZ DEFAULT now(),
  -- Uma embalagem padrão por (user, categoria, canal)
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
