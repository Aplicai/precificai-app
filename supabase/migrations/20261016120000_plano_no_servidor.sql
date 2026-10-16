-- 2026-10-16 — O PLANO TAMBÉM VALE NO SERVIDOR.
--
-- Bug (gravação de tutorial): o navegador de captura recebeu uma resposta
-- falsa de "Pro ativo" numa conta GRÁTIS e o banco aceitou gravar plataformas
-- e preços de delivery. O cadeado só existia no app: quem adulterasse a
-- resposta de `subscriptions` no próprio navegador usava o Pro de graça.
--
-- O que esta migration faz:
--   1. public.tem_plano_pago(uid) — espelho EXATO de syncPlanFromServer
--      (src/hooks/usePlan.js) + normalizePlan (src/config/plans.js).
--   2. plan_limit passa a derivar de tem_plano_pago (uma regra só).
--   3. Políticas RESTRITIVAS de INSERT/UPDATE nas tabelas do módulo Delivery
--      (FEATURE_MIN_PLAN.delivery = 'pro'). SELECT e DELETE ficam livres:
--      quem caiu pro Grátis continua vendo e apagando os próprios dados.
--      As políticas permissivas existentes (dono = auth.uid()) NÃO mudam.
--   4. Gatilho do limite do Grátis (5 produtos / 5 combos) com trava por
--      usuário: a policy de INSERT por count(*) já existia, mas inserções em
--      paralelo enxergavam a mesma contagem e passavam juntas do teto.
--
-- Fora do escopo de propósito (decisão de produto, não esquecimento):
--   - delivery_combos / delivery_combo_itens: combos são LIVRES no Grátis
--     (até 5) — MaisScreen "Combos: livre em todos os planos".
--   - vendas / vendas_combos: o Ranking é "ver é grátis" e a digitação de
--     vendas no Ranking (MatrizBCGScreen.saveVenda) não tem cadeado no app.
--   - Lista de compras e Relatório de insumos são só leitura (sem tabela).
--   - Fichas técnicas são livres; só o PDF é Pro e ele é gerado no aparelho.
--
-- Idempotente: CREATE OR REPLACE / DROP ... IF EXISTS antes de cada CREATE.
-- Não altera nenhuma linha.

-- ============================================================
-- 1. Quem tem plano pago
-- ============================================================
-- Mesma regra do cliente:
--   plan ∈ {pro, ilimitado}  (qualquer outro valor = 'free')
--   status active|past_due → vale se expires_at NULL (vitalício/teste) ou futuro
--   status canceled        → vale só até expires_at (período já pago)
--   sem linha              → grátis
-- Só responde pelo PRÓPRIO usuário (ou por chamadas sem JWT: service_role,
-- SQL Editor, jobs) — não serve pra descobrir o plano de outra conta via RPC.
CREATE OR REPLACE FUNCTION public.tem_plano_pago(uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.user_id = uid
       AND (auth.uid() IS NULL OR uid = auth.uid())
       AND s.plan IN ('pro', 'ilimitado')
       AND (
         (s.status IN ('active', 'past_due') AND (s.expires_at IS NULL OR s.expires_at > now()))
         OR (s.status = 'canceled' AND s.expires_at IS NOT NULL AND s.expires_at > now())
       )
  );
$$;
REVOKE ALL ON FUNCTION public.tem_plano_pago(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tem_plano_pago(uuid) TO authenticated, service_role;

-- ============================================================
-- 2. Limite numérico (mesma regra, uma fonte só)
-- ============================================================
-- Espelha PLAN_LIMITS: free 5/5, pro e ilimitado sem teto.
CREATE OR REPLACE FUNCTION public.plan_limit(uid uuid, kind text)
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT CASE WHEN public.tem_plano_pago(uid) THEN 2147483647 ELSE 5 END;
$$;
REVOKE ALL ON FUNCTION public.plan_limit(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.plan_limit(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 3. Delivery: gravar exige plano pago
-- ============================================================
-- AS RESTRICTIVE: soma (AND) com as policies permissivas que já existem.
-- UPDATE com USING (true) + WITH CHECK: a linha continua visível pro UPDATE e
-- a recusa vira erro 42501 ("violates row-level security policy") em vez de
-- um UPDATE silencioso de 0 linhas — o app mostra a mensagem do plano.
-- `(SELECT ...)` faz o Postgres avaliar a função uma vez por comando.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'delivery_config',         -- plataformas, taxas e comissões
    'produto_preco_delivery',  -- preço de cada produto por plataforma
    'delivery_produtos',       -- produtos exclusivos do delivery
    'delivery_produto_itens',
    'delivery_adicionais'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'tabela public.% não existe — pulando', t;
      CONTINUE;
    END IF;
    EXECUTE format('DROP POLICY IF EXISTS plano_pago_insert ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY plano_pago_insert ON public.%I AS RESTRICTIVE FOR INSERT TO authenticated '
      'WITH CHECK ((SELECT public.tem_plano_pago(auth.uid())))', t);
    EXECUTE format('DROP POLICY IF EXISTS plano_pago_update ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY plano_pago_update ON public.%I AS RESTRICTIVE FOR UPDATE TO authenticated '
      'USING (true) WITH CHECK ((SELECT public.tem_plano_pago(auth.uid())))', t);
  END LOOP;
END $$;

-- ============================================================
-- 4. Limite do Grátis em produtos e combos, à prova de corrida
-- ============================================================
-- A policy users_own_data_insert (20260909000000) continua igual. Este gatilho
-- fecha o buraco das inserções simultâneas: trava por usuário+tabela até o fim
-- da transação, então a 6ª inserção enxerga as 5 anteriores já gravadas.
-- Só INSERT: quem já passou do teto segue editando e apagando normalmente.
CREATE OR REPLACE FUNCTION public.limite_plano_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_kind   text := TG_ARGV[0];
  v_total  bigint;
  v_limite integer;
BEGIN
  -- Sem JWT (service_role, SQL Editor, jobs internos): não limita.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF public.tem_plano_pago(NEW.user_id) THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(TG_TABLE_NAME || ':' || NEW.user_id::text, 0));
  EXECUTE format('SELECT count(*) FROM %I.%I WHERE user_id = $1', TG_TABLE_SCHEMA, TG_TABLE_NAME)
     INTO v_total USING NEW.user_id;
  v_limite := public.plan_limit(NEW.user_id, v_kind);
  IF v_total >= v_limite THEN
    RAISE EXCEPTION 'limite_do_plano: o plano Grátis permite até % %', v_limite, v_kind
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
-- (Sem REVOKE: função de gatilho não pode ser chamada direto, e não mexer nos
-- grants evita qualquer dúvida sobre permissão no disparo do gatilho.)

DROP TRIGGER IF EXISTS trg_limite_plano ON public.produtos;
CREATE TRIGGER trg_limite_plano
  BEFORE INSERT ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.limite_plano_insert('produtos');

DROP TRIGGER IF EXISTS trg_limite_plano ON public.delivery_combos;
CREATE TRIGGER trg_limite_plano
  BEFORE INSERT ON public.delivery_combos
  FOR EACH ROW EXECUTE FUNCTION public.limite_plano_insert('combos');
