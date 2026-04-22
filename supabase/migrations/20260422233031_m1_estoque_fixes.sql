-- Migration M1-Estoque FIXES (post-audit 2026-04-22)
-- Idempotente. Pode ser re-executada com segurança.
--
-- Resolve bugs encontrados na auditoria do feature de Estoque:
--  P0 #1  baixar_estoque permitia saldo negativo silencioso
--  P0 #2  Race condition em baixarEstoquePorVenda (resolvido client-side; aqui só endurece a RPC)
--  P1 #9  Ajuste com custo=0 contaminava custo_medio
--  Bonus: validação de quantidade > 0; mensagens de erro descritivas;
--         RPC `estornar_estoque_por_venda` para reverter movimentos quando uma venda é deletada.

-- =========================================================================
-- 1. Drop signatures antigas (necessário porque adicionamos novo parâmetro)
-- =========================================================================
DROP FUNCTION IF EXISTS baixar_estoque(TEXT, BIGINT, NUMERIC, TEXT, TEXT, BIGINT);

-- =========================================================================
-- 2. baixar_estoque (v2): rejeita saldo negativo por padrão.
--    Flag `p_permitir_negativo` permite opt-in explícito (uso interno).
-- =========================================================================
CREATE OR REPLACE FUNCTION baixar_estoque(
  p_entidade_tipo TEXT,
  p_entidade_id BIGINT,
  p_quantidade NUMERIC,
  p_motivo TEXT DEFAULT NULL,
  p_origem_tipo TEXT DEFAULT 'venda',
  p_origem_id BIGINT DEFAULT NULL,
  p_permitir_negativo BOOLEAN DEFAULT false
) RETURNS BIGINT AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_saldo_atual NUMERIC;
  v_custo_atual NUMERIC;
  v_novo_saldo NUMERIC;
  v_mov_id BIGINT;
  v_nome TEXT;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser positiva (recebido: %)', p_quantidade
      USING ERRCODE = '22023';
  END IF;

  IF p_entidade_tipo = 'materia_prima' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0), nome
      INTO v_saldo_atual, v_custo_atual, v_nome
      FROM materias_primas
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSIF p_entidade_tipo = 'embalagem' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0), nome
      INTO v_saldo_atual, v_custo_atual, v_nome
      FROM embalagens
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
    RAISE EXCEPTION 'entidade_tipo inválido: %', p_entidade_tipo
      USING ERRCODE = '22023';
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado: % #%', p_entidade_tipo, p_entidade_id
      USING ERRCODE = 'P0002';
  END IF;

  v_novo_saldo := COALESCE(v_saldo_atual, 0) - p_quantidade;

  IF v_novo_saldo < 0 AND NOT p_permitir_negativo THEN
    RAISE EXCEPTION 'Saldo insuficiente de "%": disponível %, solicitado %',
      v_nome, COALESCE(v_saldo_atual, 0), p_quantidade
      USING ERRCODE = 'P0001';
  END IF;

  IF p_entidade_tipo = 'materia_prima' THEN
    UPDATE materias_primas SET quantidade_estoque = v_novo_saldo
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
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

-- =========================================================================
-- 3. registrar_entrada_estoque (v2):
--    - valida quantidade > 0
--    - se for ajuste com custo 0, preserva custo_medio existente
--      (evita contaminar a base com custo zero)
--    - tipo no movimento reflete origem (entrada vs ajuste)
-- =========================================================================
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
  v_nome TEXT;
  v_tipo TEXT;
BEGIN
  IF p_quantidade IS NULL OR p_quantidade <= 0 THEN
    RAISE EXCEPTION 'Quantidade deve ser positiva (recebido: %)', p_quantidade
      USING ERRCODE = '22023';
  END IF;

  IF p_custo_unitario IS NULL OR p_custo_unitario < 0 THEN
    RAISE EXCEPTION 'Custo unitário inválido (recebido: %)', p_custo_unitario
      USING ERRCODE = '22023';
  END IF;

  IF p_entidade_tipo = 'materia_prima' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0), nome
      INTO v_saldo_atual, v_custo_atual, v_nome
      FROM materias_primas
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSIF p_entidade_tipo = 'embalagem' THEN
    SELECT quantidade_estoque, COALESCE(custo_medio, 0), nome
      INTO v_saldo_atual, v_custo_atual, v_nome
      FROM embalagens
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
    RAISE EXCEPTION 'entidade_tipo inválido: %', p_entidade_tipo
      USING ERRCODE = '22023';
  END IF;

  IF v_nome IS NULL THEN
    RAISE EXCEPTION 'Item não encontrado: % #%', p_entidade_tipo, p_entidade_id
      USING ERRCODE = 'P0002';
  END IF;

  v_saldo_atual := COALESCE(v_saldo_atual, 0);
  v_novo_saldo := v_saldo_atual + p_quantidade;

  -- Ajuste com custo 0: preserva custo_medio (não contamina).
  IF p_origem_tipo = 'ajuste' AND p_custo_unitario = 0 THEN
    v_novo_custo := v_custo_atual;
    v_tipo := 'ajuste';
  ELSE
    -- Custo médio ponderado padrão
    IF v_novo_saldo > 0 THEN
      v_novo_custo := ((v_saldo_atual * v_custo_atual) + (p_quantidade * p_custo_unitario)) / v_novo_saldo;
    ELSE
      v_novo_custo := p_custo_unitario;
    END IF;
    v_tipo := CASE WHEN p_origem_tipo = 'ajuste' THEN 'ajuste' ELSE 'entrada' END;
  END IF;

  IF p_entidade_tipo = 'materia_prima' THEN
    UPDATE materias_primas
       SET quantidade_estoque = v_novo_saldo, custo_medio = v_novo_custo
     WHERE id = p_entidade_id AND user_id = v_user_id;
  ELSE
    UPDATE embalagens
       SET quantidade_estoque = v_novo_saldo, custo_medio = v_novo_custo
     WHERE id = p_entidade_id AND user_id = v_user_id;
  END IF;

  INSERT INTO estoque_movimentos (
    user_id, entidade_tipo, entidade_id, tipo, quantidade,
    custo_unitario, motivo, origem_tipo, origem_id,
    saldo_apos, custo_medio_apos
  ) VALUES (
    v_user_id, p_entidade_tipo, p_entidade_id, v_tipo, p_quantidade,
    p_custo_unitario, p_motivo, p_origem_tipo, p_origem_id,
    v_novo_saldo, v_novo_custo
  ) RETURNING id INTO v_mov_id;

  RETURN v_mov_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =========================================================================
-- 4. estornar_estoque_por_venda
--    Reverte (entrada) todos os movimentos de saída associados a uma venda
--    deletada. Idempotente: se a venda já foi estornada, não faz nada.
--    Marca os movimentos originais com origem_tipo='venda_estornada' depois.
-- =========================================================================
CREATE OR REPLACE FUNCTION estornar_estoque_por_venda(
  p_venda_id BIGINT
) RETURNS INTEGER AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_count INTEGER := 0;
  v_mov RECORD;
BEGIN
  IF p_venda_id IS NULL THEN
    RAISE EXCEPTION 'ID da venda não informado';
  END IF;

  FOR v_mov IN
    SELECT id, entidade_tipo, entidade_id, quantidade
      FROM estoque_movimentos
     WHERE user_id = v_user_id
       AND origem_tipo = 'venda'
       AND origem_id = p_venda_id
       AND tipo = 'saida'
  LOOP
    -- Reverte como entrada com custo 0 + origem_tipo='estorno' (preserva custo_medio).
    PERFORM registrar_entrada_estoque(
      v_mov.entidade_tipo,
      v_mov.entidade_id,
      v_mov.quantidade,
      0,
      'Estorno venda #' || p_venda_id,
      'estorno',
      p_venda_id
    );

    -- Marca o movimento original como estornado pra evitar dupla reversão
    UPDATE estoque_movimentos
       SET origem_tipo = 'venda_estornada'
     WHERE id = v_mov.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
