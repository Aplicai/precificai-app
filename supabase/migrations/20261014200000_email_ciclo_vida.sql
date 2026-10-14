-- 2026-10-14 — E-mails de ciclo de vida (1 e 3 dias após o cadastro) e campanhas.
--
-- Dados de 14/10: metade de quem se cadastra para antes do primeiro produto
-- (perfil vazio, nenhum ingrediente, kit com preço zerado). A função
-- `email-ciclo-vida` escolhe o e-mail pela ETAPA em que a pessoa parou; este
-- arquivo guarda o controle (quem já recebeu o quê, quem pediu para sair) e a
-- regra de etapa, que fica em SQL pra ser conferida direto no banco.
--
-- Tudo aqui é só para o service role (a função). RLS ligado e sem política:
-- nenhum usuário do app lê ou escreve nessas tabelas.

create table if not exists public.email_envios (
  id          bigserial primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  campanha    text not null,             -- 'd1', 'd3', 'reativacao-2026-10'…
  estagio     text,
  enviado_em  timestamptz not null default now(),
  resend_id   text,
  unique (user_id, campanha)             -- cada pessoa recebe cada campanha uma vez
);
alter table public.email_envios enable row level security;

create table if not exists public.email_optout (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  criado_em  timestamptz not null default now()
);
alter table public.email_optout enable row level security;

-- Etapa em que a conta está. A ordem importa: a primeira que falta é a etapa.
create or replace function public.email_estagio(uid uuid)
returns text
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with n as (
    select
      coalesce((select nome_negocio from perfil where user_id = uid limit 1), '') as negocio,
      (select count(*) from materias_primas where user_id = uid) as insumos,
      (select count(*) from materias_primas where user_id = uid and coalesce(preco_por_kg, 0) > 0) as insumos_com_preco,
      (select count(*) from produtos where user_id = uid) as produtos,
      (select count(*) from produtos where user_id = uid and coalesce(preco_venda, 0) > 0) as produtos_com_preco
  )
  select case
    when trim(negocio) = ''        then 'sem_perfil'
    when insumos = 0               then 'sem_ingrediente'
    when produtos_com_preco > 0    then 'ativo'
    when produtos > 0              then 'produto_sem_preco'
    when insumos_com_preco = 0     then 'kit_sem_preco'
    else 'sem_produto'
  end
  from n;
$$;

-- Quem deve receber a campanha AGORA.
--   d1 → cadastrou entre 48 h e 24 h atrás
--   d3 → cadastrou entre 96 h e 72 h atrás
--   outra (campanha avulsa, ex. 'reativacao-2026-10') → conta de antes de 13/10
--        sem mexer em nada há 7 dias
-- Sempre: e-mail confirmado, sem pedido de saída, sem ter recebido a mesma
-- campanha, fora contas internas e de teste.
create or replace function public.email_candidatos(p_campanha text)
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
  where case p_campanha
    when 'd1' then b.created_at <= now() - interval '24 hours' and b.created_at > now() - interval '48 hours'
    when 'd3' then b.created_at <= now() - interval '72 hours' and b.created_at > now() - interval '96 hours'
    else b.created_at < timestamptz '2026-10-13 00:00-03' and b.ultima_atividade < now() - interval '7 days'
  end;
$$;

revoke all on function public.email_estagio(uuid) from public, anon, authenticated;
revoke all on function public.email_candidatos(text) from public, anon, authenticated;
