-- 2026-10-15 — Régua de e-mails por etapa (desenho: .specs/plans/email-regua.design.md).
--
-- Depois do d1 e do d3, cada pessoa recebe no máximo 1 e-mail por semana:
--   dias 7 a 30  → a cada 7 dias
--   dias 31 a 90 → a cada 15 dias
--   depois       → a cada 30 dias, e para depois de 3 mensais seguidos sem
--                  clique e sem voltar ao app
-- Ninguém recebe se usou o app nos últimos 3 dias ou se recebeu qualquer e-mail
-- nosso (fora d1/d3) nos últimos 7 dias.
--
-- O banco decide QUEM recebe (email_regua_candidatos) e entrega os dados da
-- conta (email_dados). A função `email-ciclo-vida` escolhe tema e formato.
-- Tudo só para o service role: RLS ligado e sem política.

-- ---------- envios: tema, formato e dia ----------

alter table public.email_envios
  add column if not exists tema    text,
  add column if not exists formato text,
  add column if not exists padrao  text,    -- padrão do assunto: pergunta, numero, nome, curiosidade
  add column if not exists fase    text,    -- semanal, quinzenal, mensal
  add column if not exists dia     date;

update public.email_envios
   set dia = (enviado_em at time zone 'America/Sao_Paulo')::date
 where dia is null;

alter table public.email_envios
  alter column dia set default ((now() at time zone 'America/Sao_Paulo')::date),
  alter column dia set not null;

-- Régua: no máximo 1 por pessoa por dia, mesmo se o job rodar duas vezes.
create unique index if not exists email_envios_regua_dia
  on public.email_envios (user_id, dia)
  where campanha like 'regua-%';

create index if not exists email_envios_resend_id on public.email_envios (resend_id);

-- ---------- eventos do Resend (webhook) ----------

create table if not exists public.email_eventos (
  id         bigserial primary key,
  resend_id  text not null,
  tipo       text not null,                 -- clicked, opened, bounced, complained, delivered…
  user_id    uuid references auth.users(id) on delete cascade,
  criado_em  timestamptz not null default now(),
  unique (resend_id, tipo)                  -- 1 linha por e-mail e tipo (cliques repetidos não somam)
);
alter table public.email_eventos enable row level security;

-- ---------- chave liga/desliga ----------

create table if not exists public.email_config (
  chave  text primary key,
  valor  jsonb not null
);
alter table public.email_config enable row level security;

-- Nasce desligada: na 1ª semana só a prévia diária roda. Ligar:
--   update public.email_config set valor = 'true' where chave = 'regua_ativa';
insert into public.email_config (chave, valor) values ('regua_ativa', 'false')
on conflict (chave) do nothing;

-- ---------- regra do calendário (pura, testável com valores soltos) ----------

create or replace function public.email_regua_fase(p_dias int)
returns text language sql immutable
as $$
  select case when p_dias <= 30 then 'semanal' when p_dias <= 90 then 'quinzenal' else 'mensal' end;
$$;

-- 'ok' ou o motivo de não mandar hoje (o relatório conta os motivos).
create or replace function public.email_regua_motivo(
  p_dias int,                   -- dias desde o cadastro
  p_hoje date,                  -- hoje em Brasília
  p_dias_sem_usar numeric,      -- dias desde a última atividade no app
  p_ultimo_qualquer date,       -- último e-mail nosso fora d1/d3 (null = nunca)
  p_ultimo_regua date,          -- último e-mail da régua (null = nunca)
  p_pausado boolean             -- 3 mensais seguidos sem clique e sem voltar ao app
)
returns text language sql immutable
as $$
  select case
    when p_dias < 7 then 'antes do dia 7'
    when p_dias_sem_usar < 3 then 'usou o app nos últimos 3 dias'
    when p_ultimo_qualquer is not null and p_ultimo_qualquer > p_hoje - 7 then 'recebeu e-mail nos últimos 7 dias'
    when p_ultimo_regua is not null and p_ultimo_regua > p_hoje - (case public.email_regua_fase(p_dias)
           when 'semanal' then 7 when 'quinzenal' then 15 else 30 end) then 'ainda não é o dia'
    when p_pausado then 'pausado: 3 mensais sem clique'
    else 'ok'
  end;
$$;

-- ---------- quem recebe hoje ----------
-- p_todos = true devolve também quem NÃO recebe, com o motivo (para a prévia e o relatório).

create or replace function public.email_regua_candidatos(p_agora timestamptz default now(), p_todos boolean default false)
returns table (
  user_id uuid, email text, estagio text, plano text, negocio text,
  dias int, fase text, motivo text,
  temas_recebidos text[], formatos_recentes text[], padroes_recentes text[]
)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with base as (
    select u.id, u.email,
      (p_agora at time zone 'America/Sao_Paulo')::date as hoje,
      floor(extract(epoch from (p_agora - u.created_at)) / 86400)::int as dias,
      greatest(
        u.created_at,
        u.last_sign_in_at,
        (select max(coalesce(updated_at, created_at)) from materias_primas where user_id = u.id),
        (select max(coalesce(updated_at, created_at)) from produtos where user_id = u.id),
        (select max(coalesce(updated_at, created_at)) from preparos where user_id = u.id)
      ) as ultima_atividade
    from auth.users u
    where u.email_confirmed_at is not null
      and u.email is not null
      and u.email !~* '(teste|e2e|exemplo|\.test$)'
      and lower(u.email) not in (
        'erickfa@live.com', 'erickkfa@gmail.com', 'contato@esali.com.br',
        'erick.ali.sebrae@gmail.com', 'marketing@aplicaiconsultoria.com.br',
        'felipecvasconcelos22@gmail.com'
      )
      and not exists (select 1 from email_optout o where o.user_id = u.id)
      and not exists (select 1 from email_eventos v where v.user_id = u.id and v.tipo in ('bounced', 'complained'))
  ),
  calc as (
    select b.*,
      public.email_regua_fase(b.dias) as fase,
      public.email_regua_motivo(
        b.dias, b.hoje,
        extract(epoch from (p_agora - b.ultima_atividade)) / 86400,
        (select max(e.dia) from email_envios e where e.user_id = b.id and e.campanha not in ('d1', 'd3')),
        (select max(e.dia) from email_envios e where e.user_id = b.id and e.campanha like 'regua-%'),
        -- Pausa: os 3 últimos da régua foram mensais, nenhum teve clique e a pessoa não voltou depois deles.
        coalesce((
          select count(*) = 3
                 and bool_and(t.fase = 'mensal')
                 and bool_and(not exists (select 1 from email_eventos v where v.resend_id = t.resend_id and v.tipo = 'clicked'))
                 and b.ultima_atividade < min(t.enviado_em)
            from (select e.fase, e.resend_id, e.enviado_em from email_envios e
                   where e.user_id = b.id and e.campanha like 'regua-%'
                   order by e.enviado_em desc limit 3) t
        ), false)
      ) as motivo
    from base b
  )
  select c.id, c.email, public.email_estagio(c.id),
    coalesce((
      select s.plan from subscriptions s
       where s.user_id = c.id
         and (
           (s.status in ('active', 'past_due') and (s.expires_at is null or s.expires_at > now()))
           or (s.status = 'canceled' and s.expires_at > now())
         )
       limit 1
    ), 'free'),
    (select nome_negocio from perfil where user_id = c.id limit 1),
    c.dias, c.fase, c.motivo,
    coalesce((select array_agg(e.tema) from email_envios e where e.user_id = c.id and e.tema is not null), '{}'),
    coalesce((select array_agg(t.formato order by t.enviado_em desc) from (
      select e.formato, e.enviado_em from email_envios e
       where e.user_id = c.id and e.formato is not null order by e.enviado_em desc limit 3) t), '{}'),
    coalesce((select array_agg(t.padrao order by t.enviado_em desc) from (
      select e.padrao, e.enviado_em from email_envios e
       where e.user_id = c.id and e.padrao is not null order by e.enviado_em desc limit 3) t), '{}')
  from calc c
  where p_todos or c.motivo = 'ok';
$$;

revoke all on function public.email_regua_candidatos(timestamptz, boolean) from public, anon, authenticated;

-- ---------- dados da conta para personalizar o e-mail ----------
-- Só nomes, contagens e preços que a própria pessoa digitou. Nada de custo
-- calculado (a conta do app roda no app; refazer aqui poderia divergir da tela).

create or replace function public.email_dados(uid uuid)
returns jsonb
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'negocio', (select nullif(trim(nome_negocio), '') from perfil where user_id = uid limit 1),
    'segmento', (select nullif(trim(segmento), '') from perfil where user_id = uid limit 1),
    'insumos', (select count(*) from materias_primas where user_id = uid),
    'insumos_com_preco', (select count(*) from materias_primas where user_id = uid and coalesce(preco_por_kg, 0) > 0),
    'produtos', (select count(*) from produtos where user_id = uid),
    'produtos_com_preco', (select count(*) from produtos where user_id = uid and coalesce(preco_venda, 0) > 0),
    -- Produto sem preço com mais ingredientes (no kit, o "carro-chefe" do segmento).
    'produto_foco', (
      select jsonb_build_object(
        'nome', p.nome,
        'ingredientes', (select count(*) from produto_ingredientes pi where pi.produto_id = p.id),
        'ingredientes_sem_preco', (select count(*) from produto_ingredientes pi
                                     join materias_primas m on m.id = pi.materia_prima_id
                                    where pi.produto_id = p.id and coalesce(m.preco_por_kg, 0) = 0),
        'exemplos', (select coalesce(jsonb_agg(t.nome), '[]') from (
                       select m.nome from produto_ingredientes pi
                         join materias_primas m on m.id = pi.materia_prima_id
                        where pi.produto_id = p.id and coalesce(m.preco_por_kg, 0) = 0
                        order by pi.quantidade_utilizada desc nulls last limit 3) t)
      )
      from produtos p
      where p.user_id = uid and coalesce(p.preco_venda, 0) = 0
      order by (select count(*) from produto_ingredientes pi where pi.produto_id = p.id) desc, p.id
      limit 1
    ),
    'insumos_recentes', (select coalesce(jsonb_agg(t.nome), '[]') from (
        select nome from materias_primas
         where user_id = uid and coalesce(preco_por_kg, 0) > 0
         order by coalesce(updated_at, created_at) desc nulls last limit 3) t),
    'produtos_sem_preco', (select coalesce(jsonb_agg(t.nome), '[]') from (
        select nome from produtos
         where user_id = uid and coalesce(preco_venda, 0) = 0
         order by coalesce(updated_at, created_at) desc nulls last limit 3) t),
    'ultimo_produto', (select jsonb_build_object('nome', nome, 'preco', preco_venda) from produtos
         where user_id = uid and coalesce(preco_venda, 0) > 0
         order by coalesce(updated_at, created_at) desc nulls last limit 1),
    'dias_sem_atualizar_precos', (
      select floor(extract(epoch from (now() - greatest(
        (select max(data) from historico_precos where user_id = uid),
        (select max(coalesce(updated_at, created_at)) from materias_primas where user_id = uid and coalesce(preco_por_kg, 0) > 0)
      ))) / 86400)::int)
  );
$$;

revoke all on function public.email_dados(uuid) from public, anon, authenticated;
