-- APP-26: Lucro desejado delivery configurável separado do balcão.
-- Por padrão, herda o valor do `lucro_desejado` (balcão). O usuário pode
-- sobrescrever para trabalhar com lucros diferentes por canal.

ALTER TABLE configuracao
  ADD COLUMN IF NOT EXISTS lucro_desejado_delivery REAL;

UPDATE configuracao
   SET lucro_desejado_delivery = COALESCE(lucro_desejado_delivery, lucro_desejado)
 WHERE lucro_desejado_delivery IS NULL;
