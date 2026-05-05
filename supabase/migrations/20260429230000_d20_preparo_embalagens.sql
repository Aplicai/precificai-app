-- D-20: Embalagens nos preparos.
-- Alguns preparos precisam de embalagem própria pra armazenamento (potes,
-- sacos a vácuo, etc). Esta tabela permite anexar embalagens a preparos.

CREATE TABLE IF NOT EXISTS preparo_embalagens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preparo_id BIGINT NOT NULL REFERENCES preparos(id) ON DELETE CASCADE,
  embalagem_id BIGINT NOT NULL REFERENCES embalagens(id) ON DELETE CASCADE,
  quantidade_utilizada REAL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE preparo_embalagens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user can manage own preparo_embalagens" ON preparo_embalagens;
CREATE POLICY "user can manage own preparo_embalagens"
  ON preparo_embalagens FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_preparo_embalagens_preparo ON preparo_embalagens (preparo_id);
