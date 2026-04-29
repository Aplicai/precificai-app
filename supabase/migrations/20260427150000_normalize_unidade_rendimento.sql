-- Sessão 28.9 — Auditoria P1-04: normaliza unidade_rendimento legado para enum.
--
-- HISTÓRICO: produtos cadastrados antes de 2025 tinham unidade_rendimento como
-- string livre ('Grama(s)', 'Mililitro(s)', 'Unidade(s)'). A heurística em
-- src/utils/calculations.js#getDivisorRendimento detectava o tipo de venda
-- inferindo do par (string + valor de rendimento_total ≤ 50).
--
-- PROBLEMA: a heurística falha em casos limítrofes:
--   - Bolo de 1.5kg salvo como 'Grama(s)' + rendimento_total=1500 → classificado
--     como UNIDADE (errado — era venda por kg)
--   - Bolo de 100g salvo como 'Grama(s)' + rendimento_total=100 → classificado
--     como UNIDADE (potencialmente errado)
--
-- SOLUÇÃO: aplica a heurística UMA VEZ e persiste o enum normalizado.
--   - 'por_unidade' = vendido por unidade (rendimento_unidades indica qtd por receita)
--   - 'por_kg'      = vendido por kg (rendimento_total = peso da receita em kg)
--   - 'por_litro'   = vendido por litro (rendimento_total = volume em L)
--
-- Após esta migration, getDivisorRendimento pode parar de aplicar heurística.
-- Mas a heurística fica como fallback defensivo (não custa nada).
--
-- IDEMPOTENTE: roda múltiplas vezes sem efeito colateral (WHERE filtra valores
-- já normalizados).

UPDATE produtos SET unidade_rendimento = CASE
  -- Já normalizado → não toca
  WHEN unidade_rendimento IN ('por_unidade', 'por_kg', 'por_litro') THEN unidade_rendimento

  -- Heurística para legados de PESO ('Grama(s)', 'Quilograma(s)', 'kg', 'g')
  WHEN LOWER(COALESCE(unidade_rendimento, '')) ~ 'grama|quilo|^kg$|^g$'
       AND COALESCE(rendimento_total, 0) > 0
       AND COALESCE(rendimento_total, 0) <= 50
    THEN 'por_kg'

  -- Heurística para legados de VOLUME ('Mililitro(s)', 'Litro(s)', 'L', 'mL')
  WHEN LOWER(COALESCE(unidade_rendimento, '')) ~ 'litro|^l$|ml|mililitro'
       AND COALESCE(rendimento_total, 0) > 0
       AND COALESCE(rendimento_total, 0) <= 50
    THEN 'por_litro'

  -- Padrão: venda por unidade
  ELSE 'por_unidade'
END
WHERE unidade_rendimento IS NULL
   OR unidade_rendimento NOT IN ('por_unidade', 'por_kg', 'por_litro');

-- Log: quantos produtos foram atualizados
DO $$
DECLARE
  total INTEGER;
  por_unid INTEGER;
  por_kg_n INTEGER;
  por_litro_n INTEGER;
BEGIN
  SELECT COUNT(*) INTO total FROM produtos;
  SELECT COUNT(*) INTO por_unid FROM produtos WHERE unidade_rendimento = 'por_unidade';
  SELECT COUNT(*) INTO por_kg_n FROM produtos WHERE unidade_rendimento = 'por_kg';
  SELECT COUNT(*) INTO por_litro_n FROM produtos WHERE unidade_rendimento = 'por_litro';
  RAISE NOTICE '[Migration normalize_unidade_rendimento] Total: %, Por unidade: %, Por kg: %, Por litro: %',
    total, por_unid, por_kg_n, por_litro_n;
END$$;

-- Constraint defensiva: novas inserções DEVEM usar o enum.
-- Comentado por padrão (gera erro se algum código antigo ainda inserir legado).
-- Habilitar quando todo o código for verificado.
-- ALTER TABLE produtos ADD CONSTRAINT produtos_unidade_rendimento_enum
--   CHECK (unidade_rendimento IN ('por_unidade', 'por_kg', 'por_litro'));

-- Comentário documental
COMMENT ON COLUMN produtos.unidade_rendimento IS
  'Tipo de venda do produto. Enum: por_unidade | por_kg | por_litro. Determina se rendimento_unidades ou rendimento_total é usado como divisor do CMV.';
