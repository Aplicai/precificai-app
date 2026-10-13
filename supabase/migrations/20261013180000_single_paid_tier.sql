-- 2026-10-13 — FAIXA ÚNICA de plano pago.
--
-- Antes: free 5/5, pro 30/30, ilimitado ∞. Os números de produção mostraram que
-- a faixa do meio não existia — das 23 contas com produto, 12 não passavam de 5,
-- apenas 4 ficavam entre 6 e 30, e 7 já estouravam 30 (a maior com 128). O teto
-- de 30 não separava cliente pequeno de grande: cobrava a mais exatamente dos
-- maiores catálogos. E não havia uma única assinatura paga na faixa de cima.
--
-- Agora 'pro' libera tudo, por R$ 29,90/mês. 'ilimitado' continua aceito e com
-- acesso total (13 contas legadas), mas não é mais vendido — por isso NENHUMA
-- linha de subscriptions é migrada e o CHECK do plano fica como está.
--
-- Esta função é a defesa real do limite: o cliente é burlável por
-- localStorage/DevTools, as policies de INSERT em produtos/delivery_combos não.
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
    WHEN 'pro' THEN 2147483647
    ELSE 5
  END;
$$;
REVOKE ALL ON FUNCTION public.plan_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_limit(uuid, text) TO authenticated;
