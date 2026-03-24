-- Histórico de preços de insumos
CREATE TABLE IF NOT EXISTS historico_precos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  materia_prima_id BIGINT NOT NULL REFERENCES materias_primas(id) ON DELETE CASCADE,
  valor_pago REAL NOT NULL,
  preco_por_kg REAL NOT NULL,
  data TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE historico_precos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_data_select" ON historico_precos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_data_insert" ON historico_precos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_data_update" ON historico_precos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_data_delete" ON historico_precos FOR DELETE USING (auth.uid() = user_id);

-- Index para consultas rápidas
CREATE INDEX idx_historico_precos_mp ON historico_precos(materia_prima_id, data DESC);
