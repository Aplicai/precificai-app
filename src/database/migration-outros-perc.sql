-- Migration sessão 28.27 — adiciona "outros_perc" em delivery_config
--
-- MOTIVAÇÃO:
-- Algumas plataformas/contratos têm taxas embutidas que não são comissão da
-- plataforma nem taxa de pagamento online (ex: taxa de marketing, fundo de
-- propaganda, etc). O usuário precisa de um campo genérico pra lançar essas
-- taxas em % e o sistema descontá-las junto.
--
-- APLICAR NO SUPABASE:
-- Rodar este SQL via SQL Editor do Supabase (ou via psql) ANTES de fazer
-- deploy da nova versão do app. É idempotente — pode rodar múltiplas vezes.
--
-- Para SQLite local (expo-sqlite): roda automaticamente em runMigrations
-- via try/catch defensivo (IF NOT EXISTS não é suportado em ALTER TABLE
-- no SQLite, mas o erro é capturado).

ALTER TABLE delivery_config ADD COLUMN IF NOT EXISTS outros_perc REAL DEFAULT 0;
