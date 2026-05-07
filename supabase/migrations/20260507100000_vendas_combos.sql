-- Sessão 28.47 — bug ranking BCG: vendas de combos não estavam entrando
-- no ranking porque vendas.produto_id tem FK pra produtos(id), então o
-- INSERT com id negativo (sentinel pra combo) falhava silenciosamente.
--
-- Solução: tabela separada `vendas_combos` análoga a `vendas`.

CREATE TABLE IF NOT EXISTS public.vendas_combos (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  combo_id BIGINT NOT NULL REFERENCES public.delivery_combos(id) ON DELETE CASCADE,
  data TEXT NOT NULL,
  quantidade NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, combo_id, data)
);

ALTER TABLE public.vendas_combos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vendas_combos_owner_all" ON public.vendas_combos;
CREATE POLICY "vendas_combos_owner_all" ON public.vendas_combos
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vendas_combos_user_data ON public.vendas_combos(user_id, data);
CREATE INDEX IF NOT EXISTS idx_vendas_combos_combo ON public.vendas_combos(combo_id);
