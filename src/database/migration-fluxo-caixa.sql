-- Feature beta: Fluxo de Caixa + DRE.
-- Movimentações financeiras mensais (entradas/saídas) usadas pela tela
-- FluxoCaixaDREScreen. RLS isolada por user_id no padrão das demais tabelas.
--
-- Para SQLite local (expo-sqlite) basta a versão simplificada:
--   CREATE TABLE IF NOT EXISTS fluxo_caixa_movimentos (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     data TEXT NOT NULL,           -- YYYY-MM-DD
--     tipo TEXT NOT NULL,           -- 'entrada' | 'saida'
--     categoria TEXT,
--     descricao TEXT,
--     valor REAL NOT NULL,
--     user_id TEXT,
--     created_at TEXT DEFAULT CURRENT_TIMESTAMP
--   );

CREATE TABLE IF NOT EXISTS fluxo_caixa_movimentos (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data DATE NOT NULL,                         -- YYYY-MM-DD
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida')),
  categoria TEXT,                             -- Vendas Balcão, Salários, Aluguel, etc.
  descricao TEXT,
  valor REAL NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS — cada usuário acessa apenas suas movimentações
ALTER TABLE fluxo_caixa_movimentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_data_select" ON fluxo_caixa_movimentos FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "users_own_data_insert" ON fluxo_caixa_movimentos FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "users_own_data_update" ON fluxo_caixa_movimentos FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "users_own_data_delete" ON fluxo_caixa_movimentos FOR DELETE USING (auth.uid() = user_id);

-- Índice pra consultas por mês
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_user_data ON fluxo_caixa_movimentos(user_id, data DESC);
