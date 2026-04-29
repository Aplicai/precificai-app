-- APP-29c: Embalagem específica para delivery por produto.
-- Empresário pode usar embalagem diferente no delivery (lacre, sacola, etiqueta)
-- gerando CMV diferente do balcão. Campo opcional aponta pra uma embalagem
-- adicional, somada à embalagem padrão na hora de calcular CMV delivery.

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS embalagem_delivery_id BIGINT REFERENCES embalagens(id) ON DELETE SET NULL;

ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS embalagem_delivery_quantidade REAL DEFAULT 1;
