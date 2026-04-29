-- Migration APP-29c: Embalagem específica para delivery por produto.
--
-- Empresário pode usar embalagem diferente no delivery (lacre, sacola, etiqueta)
-- gerando CMV diferente do balcão. Este campo opcional aponta pra uma embalagem
-- adicional, somada à embalagem padrão do produto na hora de calcular CMV delivery.
--
-- Aplicar manualmente no Supabase. Se a coluna já existir o ALTER TABLE é no-op.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS embalagem_delivery_id BIGINT REFERENCES embalagens(id) ON DELETE SET NULL;

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS embalagem_delivery_quantidade REAL DEFAULT 1;

-- Não há backfill: produtos antigos continuam usando a embalagem padrão.
