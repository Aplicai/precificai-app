-- APP-43: Quantitativo de vendas por canal (balcão vs delivery).
--
-- Campos simples na tabela `configuracao` pra capturar quantas unidades
-- o usuário vende por mês em cada canal. Usado depois pelo painel pra
-- calcular faturamento por canal, ticket médio e custo fixo por venda.

ALTER TABLE configuracao
  ADD COLUMN IF NOT EXISTS vendas_mes_balcao INTEGER DEFAULT 0;

ALTER TABLE configuracao
  ADD COLUMN IF NOT EXISTS vendas_mes_delivery INTEGER DEFAULT 0;
