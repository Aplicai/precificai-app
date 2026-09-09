-- ============================================================
-- Audit 2026-09-09 (S-A2) — limites de plano no SERVIDOR.
-- O cliente (usePlan/plans.js) já bloqueia o 6º produto/combo no free e o 31º
-- no pro, mas é burlável (localStorage/DevTools). Esta policy é a defesa real.
-- Limites espelham src/config/plans.js: free 5/5, pro 30/30, ilimitado ∞.
-- ============================================================
CREATE OR REPLACE FUNCTION public.plan_limit(uid uuid, kind text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE
    COALESCE((
      SELECT s.plan FROM public.subscriptions s
       WHERE s.user_id = uid
         AND (
           (s.status IN ('active','past_due') AND (s.expires_at IS NULL OR s.expires_at > now()))
           OR (s.status = 'canceled' AND s.expires_at IS NOT NULL AND s.expires_at > now())
         )
       LIMIT 1
    ), 'free')
    WHEN 'ilimitado' THEN 2147483647
    WHEN 'pro' THEN 30
    ELSE 5
  END;
$$;
REVOKE ALL ON FUNCTION public.plan_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_limit(uuid, text) TO authenticated;

DROP POLICY IF EXISTS users_own_data_insert ON public.produtos;
CREATE POLICY users_own_data_insert ON public.produtos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (SELECT count(*) FROM public.produtos p WHERE p.user_id = auth.uid()) < public.plan_limit(auth.uid(), 'produtos')
  );

DROP POLICY IF EXISTS users_own_data_insert ON public.delivery_combos;
CREATE POLICY users_own_data_insert ON public.delivery_combos
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (SELECT count(*) FROM public.delivery_combos c WHERE c.user_id = auth.uid()) < public.plan_limit(auth.uid(), 'combos')
  );
