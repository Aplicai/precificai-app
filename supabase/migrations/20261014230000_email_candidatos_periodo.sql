-- 2026-10-14 — Disparo por período de cadastro.
--
-- O dono pediu para mandar, de uma vez, o e-mail de quem se cadastrou até
-- 15/10 00:00 (sem esperar a janela de 24 h do d1). `p_desde` / `p_ate`
-- trocam a janela da campanha pelo período de cadastro e ignoram a regra de
-- "parado há 7 dias" das campanhas avulsas. Sem eles, nada muda.

drop function if exists public.email_candidatos(text);

create or replace function public.email_candidatos(
  p_campanha text,
  p_desde timestamptz default null,
  p_ate timestamptz default null
)
returns table (user_id uuid, email text, estagio text, plano text, negocio text)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with base as (
    select u.id, u.email, u.created_at,
      greatest(
        u.created_at,
        (select max(coalesce(updated_at, created_at)) from materias_primas where user_id = u.id),
        (select max(coalesce(updated_at, created_at)) from produtos where user_id = u.id),
        (select max(coalesce(updated_at, created_at)) from preparos where user_id = u.id)
      ) as ultima_atividade
    from auth.users u
    where u.email_confirmed_at is not null
      and u.email is not null
      and u.email !~* '(teste|e2e|exemplo|\.test$)'
      and lower(u.email) not in (
        -- contas internas da equipe e duplicadas de clientes
        'erickfa@live.com', 'erickkfa@gmail.com', 'contato@esali.com.br',
        'erick.ali.sebrae@gmail.com', 'marketing@aplicaiconsultoria.com.br',
        'felipecvasconcelos22@gmail.com'
      )
      and not exists (select 1 from email_optout o where o.user_id = u.id)
      and not exists (select 1 from email_envios e where e.user_id = u.id and e.campanha = p_campanha)
  )
  select b.id, b.email, public.email_estagio(b.id),
    coalesce((
      select s.plan from subscriptions s
       where s.user_id = b.id
         and (
           (s.status in ('active', 'past_due') and (s.expires_at is null or s.expires_at > now()))
           or (s.status = 'canceled' and s.expires_at > now())
         )
       limit 1
    ), 'free'),
    (select nome_negocio from perfil where user_id = b.id limit 1)
  from base b
  where case
    when p_desde is not null or p_ate is not null then
      (p_desde is null or b.created_at >= p_desde) and (p_ate is null or b.created_at < p_ate)
    when p_campanha = 'd1' then b.created_at <= now() - interval '24 hours' and b.created_at > now() - interval '48 hours'
    when p_campanha = 'd3' then b.created_at <= now() - interval '72 hours' and b.created_at > now() - interval '96 hours'
    else b.created_at < timestamptz '2026-10-13 00:00-03' and b.ultima_atividade < now() - interval '7 days'
  end;
$$;

revoke all on function public.email_candidatos(text, timestamptz, timestamptz) from public, anon, authenticated;
