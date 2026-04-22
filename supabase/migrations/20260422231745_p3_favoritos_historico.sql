-- Migration P3-H (Favoritos) + P3-I (Histórico de alterações)
-- Idempotente: pode ser executada várias vezes sem efeitos colaterais.
-- Executada em 2026-04-22 via Supabase Management API.

-- =========================================================================
-- 1. Coluna `favorito` (P3-H) — SMALLINT 0/1, NOT NULL DEFAULT 0
-- =========================================================================
ALTER TABLE public.materias_primas ADD COLUMN IF NOT EXISTS favorito SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.embalagens      ADD COLUMN IF NOT EXISTS favorito SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.preparos        ADD COLUMN IF NOT EXISTS favorito SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.produtos        ADD COLUMN IF NOT EXISTS favorito SMALLINT NOT NULL DEFAULT 0;

-- =========================================================================
-- 2. Coluna `created_at` (P3-I) — onde ainda não existe
-- =========================================================================
ALTER TABLE public.materias_primas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.embalagens      ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.preparos        ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
-- produtos.created_at já existe

-- =========================================================================
-- 3. Coluna `updated_at` (P3-I) — TIMESTAMPTZ DEFAULT now()
-- =========================================================================
ALTER TABLE public.materias_primas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.embalagens      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.preparos        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE public.produtos        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- =========================================================================
-- 4. Trigger function `set_updated_at` (P3-I)
-- =========================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =========================================================================
-- 5. Triggers BEFORE UPDATE em cada tabela
-- =========================================================================
DROP TRIGGER IF EXISTS trg_materias_primas_set_updated_at ON public.materias_primas;
CREATE TRIGGER trg_materias_primas_set_updated_at
  BEFORE UPDATE ON public.materias_primas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_embalagens_set_updated_at ON public.embalagens;
CREATE TRIGGER trg_embalagens_set_updated_at
  BEFORE UPDATE ON public.embalagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_preparos_set_updated_at ON public.preparos;
CREATE TRIGGER trg_preparos_set_updated_at
  BEFORE UPDATE ON public.preparos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_produtos_set_updated_at ON public.produtos;
CREATE TRIGGER trg_produtos_set_updated_at
  BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================================================================
-- 6. Índices úteis para sort/filter
-- =========================================================================
CREATE INDEX IF NOT EXISTS idx_materias_primas_user_favorito ON public.materias_primas(user_id, favorito DESC);
CREATE INDEX IF NOT EXISTS idx_embalagens_user_favorito      ON public.embalagens(user_id, favorito DESC);
CREATE INDEX IF NOT EXISTS idx_preparos_user_favorito        ON public.preparos(user_id, favorito DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_user_favorito        ON public.produtos(user_id, favorito DESC);

CREATE INDEX IF NOT EXISTS idx_materias_primas_user_updated  ON public.materias_primas(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_embalagens_user_updated       ON public.embalagens(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_preparos_user_updated         ON public.preparos(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_produtos_user_updated         ON public.produtos(user_id, updated_at DESC);
