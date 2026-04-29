-- Migration APP-26: Lucro desejado delivery configurável separado do balcão.
--
-- Por padrão, ele assume o mesmo valor do `lucro_desejado` (balcão); o usuário
-- pode sobrescrever pra trabalhar com lucros diferentes por canal.
--
-- Aplicar manualmente no Supabase quando estiver pronto pra deploy. Se a coluna
-- já existir, o ALTER TABLE simplesmente falha sem efeito.

ALTER TABLE configuracao
  ADD COLUMN IF NOT EXISTS lucro_desejado_delivery REAL;

-- Backfill: usa lucro_desejado como default para usuários existentes
UPDATE configuracao
   SET lucro_desejado_delivery = COALESCE(lucro_desejado_delivery, lucro_desejado)
 WHERE lucro_desejado_delivery IS NULL;
