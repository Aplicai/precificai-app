-- Feature beta: DRE (Demonstrativo de Resultados) PERSISTIDA por mês.
-- Antes a DRE vivia só em memória (estado da tela), então trocar de mês ou
-- recarregar perdia tudo e o cabeçalho "DEMONSTRATIVO — {mês}" não batia com
-- os números. Agora cada mês tem sua própria linha (UNIQUE user_id+mes),
-- carregada/autossalva pela FluxoCaixaDREScreen.
--
-- Para SQLite local (expo-sqlite) basta a versão simplificada:
--   CREATE TABLE IF NOT EXISTS dre_mensal (
--     id INTEGER PRIMARY KEY AUTOINCREMENT,
--     mes TEXT NOT NULL,                   -- 'YYYY-MM'
--     receita_bruta REAL DEFAULT 0,
--     deducoes REAL DEFAULT 0,
--     devolucoes REAL DEFAULT 0,
--     cmv REAL DEFAULT 0,
--     despesas_fixas REAL DEFAULT 0,
--     despesas_variaveis REAL DEFAULT 0,
--     outras_despesas REAL DEFAULT 0,
--     outras_receitas REAL DEFAULT 0,
--     usa_fixas_financeiro INTEGER DEFAULT 1,
--     user_id TEXT,
--     updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
--     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
--     UNIQUE(user_id, mes)
--   );

CREATE TABLE IF NOT EXISTS dre_mensal (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mes TEXT NOT NULL,                          -- 'YYYY-MM'
  receita_bruta REAL NOT NULL DEFAULT 0,
  deducoes REAL NOT NULL DEFAULT 0,
  devolucoes REAL NOT NULL DEFAULT 0,
  cmv REAL NOT NULL DEFAULT 0,
  despesas_fixas REAL NOT NULL DEFAULT 0,
  despesas_variaveis REAL NOT NULL DEFAULT 0,
  outras_despesas REAL NOT NULL DEFAULT 0,
  outras_receitas REAL NOT NULL DEFAULT 0,
  -- quando true, as despesas fixas vêm do Financeiro (não deste campo);
  -- "Importar do Fluxo" desliga isso pra não somar fixas em dobro.
  usa_fixas_financeiro BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, mes)
);

-- RLS — cada usuário acessa apenas sua própria DRE
ALTER TABLE dre_mensal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "dre_mensal_select" ON dre_mensal FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "dre_mensal_insert" ON dre_mensal FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "dre_mensal_update" ON dre_mensal FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "dre_mensal_delete" ON dre_mensal FOR DELETE USING (auth.uid() = user_id);

-- Índice pra busca pelo mês selecionado
CREATE INDEX IF NOT EXISTS idx_dre_mensal_user_mes ON dre_mensal(user_id, mes);
