-- M1-10/11/12 — Estoque Real
-- Idempotente. Pode ser re-executada com segurança.

-- 1. Saldos por insumo/embalagem
ALTER TABLE materias_primas
  ADD COLUMN IF NOT EXISTS quantidade_estoque NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC,
  ADD COLUMN IF NOT EXISTS custo_medio NUMERIC;

ALTER TABLE embalagens
  ADD COLUMN IF NOT EXISTS quantidade_estoque NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estoque_minimo NUMERIC,
  ADD COLUMN IF NOT EXISTS custo_medio NUMERIC;

-- 2. Movimentos de estoque (livro razão)
CREATE TABLE IF NOT EXISTS estoque_movimentos (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('materia_prima','embalagem')),
  entidade_id BIGINT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
  quantidade NUMERIC NOT NULL,             -- sempre positivo; sinal vem do tipo
  custo_unitario NUMERIC,                   -- preenchido em entradas
  motivo TEXT,
  origem_tipo TEXT,                         -- 'venda','manual','inventario','recebimento'
  origem_id BIGINT,
  saldo_apos NUMERIC NOT NULL,
  custo_medio_apos NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_estmov_user_data ON estoque_movimentos(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_estmov_entidade ON estoque_movimentos(entidade_tipo, entidade_id);
CREATE INDEX IF NOT EXISTS idx_estmov_origem ON estoque_movimentos(origem_tipo, origem_id);

-- 3. RLS
ALTER TABLE estoque_movimentos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "estmov_select_own" ON estoque_movimentos;
CREATE POLICY "estmov_select_own" ON estoque_movimentos
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "estmov_insert_own" ON estoque_movimentos;
CREATE POLICY "estmov_insert_own" ON estoque_movimentos
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "estmov_update_own" ON estoque_movimentos;
CREATE POLICY "estmov_update_own" ON estoque_movimentos
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "estmov_delete_own" ON estoque_movimentos;
CREATE POLICY "estmov_delete_own" ON estoque_movimentos
  FOR DELETE USING (auth.uid() = user_id);

-- 4. Função RPC: registrar entrada com custo médio ponderado atomicamente
CREATE OR REPLACE FUNCTION registrar_entrada_estoque(
  p_entidade_tipo TEXT,
  p_entidade_id BIGINT,
  p_quantidade NUMERIC,
  p_custo_unitario NUMERIC,
  p_motivo TEXT DEFAULT NULL,
  p_origem_tipo TEXT DEFAULT 'recebimento',
  p_origem_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_saldo_atual NUMERIC;
  v_custo_atual NUMERIC;
  v_novo_saldo NUMERIC;
  v_novo_custo NUMERIC;
  v_mov_id BIGINT;
BEGIN
  IF p_entidade_tipo = 'materia_prima' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0)
      INTO v_saldo_atual, v_custo_atual
      FROM materias_primas WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSIF p_entidade_tipo = 'embalagem' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0)
      INTO v_saldo_atual, v_custo_atual
      FROM embalagens WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
    RAISE EXCEPTION 'entidade_tipo inválido';
  END IF;

  v_saldo_atual := COALESCE(v_saldo_atual, 0);
  v_novo_saldo := v_saldo_atual + p_quantidade;
  -- Custo médio ponderado
  IF v_novo_saldo > 0 THEN
    v_novo_custo := ((v_saldo_atual * v_custo_atual) + (p_quantidade * p_custo_unitario)) / v_novo_saldo;
  ELSE
    v_novo_custo := p_custo_unitario;
  END IF;

  -- Atualizar saldo + custo médio
  IF p_entidade_tipo = 'materia_prima' THEN
    UPDATE materias_primas
       SET quantidade_estoque = v_novo_saldo, custo_medio = v_novo_custo
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
    UPDATE embalagens
       SET quantidade_estoque = v_novo_saldo, custo_medio = v_novo_custo
     WHERE id = p_entidade_id AND user_id = v_user_id;
  END IF;

  -- Registrar movimento
  INSERT INTO estoque_movimentos (
    user_id, entidade_tipo, entidade_id, tipo, quantidade,
    custo_unitario, motivo, origem_tipo, origem_id,
    saldo_apos, custo_medio_apos
  ) VALUES (
    v_user_id, p_entidade_tipo, p_entidade_id, 'entrada', p_quantidade,
    p_custo_unitario, p_motivo, p_origem_tipo, p_origem_id,
    v_novo_saldo, v_novo_custo
  ) RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Função RPC: baixa de estoque (saída)
CREATE OR REPLACE FUNCTION baixar_estoque(
  p_entidade_tipo TEXT,
  p_entidade_id BIGINT,
  p_quantidade NUMERIC,
  p_motivo TEXT DEFAULT NULL,
  p_origem_tipo TEXT DEFAULT 'venda',
  p_origem_id BIGINT DEFAULT NULL
) RETURNS BIGINT AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_saldo_atual NUMERIC;
  v_custo_atual NUMERIC;
  v_novo_saldo NUMERIC;
  v_mov_id BIGINT;
BEGIN
  IF p_entidade_tipo = 'materia_prima' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0)
      INTO v_saldo_atual, v_custo_atual
      FROM materias_primas WHERE id = p_entidade_id AND user_id = v_user_id;
    v_novo_saldo := COALESCE(v_saldo_atual, 0) - p_quantidade;
    UPDATE materias_primas SET quantidade_estoque = v_novo_saldo
      WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
    SELECT quantidade_estoque, COALESCE(custo_medio, 0)
      INTO v_saldo_atual, v_custo_atual
      FROM embalagens WHERE id = p_entidade_id AND user_id = v_user_id;
    v_novo_saldo := COALESCE(v_saldo_atual, 0) - p_quantidade;
    UPDATE embalagens SET quantidade_estoque = v_novo_saldo
      WHERE id = p_entidade_id AND user_id = v_user_id;
  END IF;

  INSERT INTO estoque_movimentos (
    user_id, entidade_tipo, entidade_id, tipo, quantidade,
    custo_unitario, motivo, origem_tipo, origem_id,
    saldo_apos, custo_medio_apos
  ) VALUES (
    v_user_id, p_entidade_tipo, p_entidade_id, 'saida', p_quantidade,
    v_custo_atual, p_motivo, p_origem_tipo, p_origem_id,
    v_novo_saldo, v_custo_atual
  ) RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. M1-Push: device tokens
CREATE TABLE IF NOT EXISTS device_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expo_push_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios','android','web')),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, expo_push_token)
);
CREATE INDEX IF NOT EXISTS idx_devtok_user ON device_tokens(user_id);

ALTER TABLE device_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "devtok_all_own" ON device_tokens;
CREATE POLICY "devtok_all_own" ON device_tokens
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7. Preferências de notificação por user
CREATE TABLE IF NOT EXISTS notif_prefs (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  estoque_baixo BOOLEAN NOT NULL DEFAULT true,
  margem_critica BOOLEAN NOT NULL DEFAULT true,
  resumo_diario BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE notif_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notifprefs_all_own" ON notif_prefs;
CREATE POLICY "notifprefs_all_own" ON notif_prefs
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
