-- 2026-10-15 — Lembrete para quem não confirmou o e-mail do cadastro.
--
-- 14–15/10: 9 de 17 cadastros por e-mail e senha nunca confirmaram. Quem
-- confirma faz em ~7 min; o link vale 1 h. A função `lembrete-confirmacao`
-- reenvia o e-mail de confirmação do Supabase (link novo) 2 h e 24 h depois
-- do cadastro. Só para service role: RLS ligado e sem política.

create table if not exists public.confirmacao_lembretes (
  user_id    uuid not null references auth.users(id) on delete cascade,
  etapa      text not null check (etapa in ('2h', '24h')),
  enviado_em timestamptz not null default now(),
  primary key (user_id, etapa)
);
alter table public.confirmacao_lembretes enable row level security;

-- Quem deve receber agora. Uma etapa por pessoa por vez (a mais atrasada).
--   2h  → cadastro entre 2 h e 24 h atrás
--   24h → cadastro entre 24 h e 72 h atrás
-- Só cadastro por e-mail e senha, ainda sem confirmar, fora contas de teste.
create or replace function public.confirmacao_pendentes()
returns table (user_id uuid, email text, etapa text)
language sql stable security definer
set search_path = public, pg_catalog
as $$
  select u.id, u.email,
    case when u.created_at <= now() - interval '24 hours' then '24h' else '2h' end
  from auth.users u
  where u.email_confirmed_at is null
    and u.email is not null
    and coalesce(u.raw_app_meta_data->>'provider', 'email') = 'email'
    and u.email !~* '(teste|e2e|exemplo|\.test$)'
    and u.created_at <= now() - interval '2 hours'
    and u.created_at >  now() - interval '72 hours'
    and not exists (
      select 1 from confirmacao_lembretes l
       where l.user_id = u.id
         and l.etapa = case when u.created_at <= now() - interval '24 hours' then '24h' else '2h' end
    )
  order by u.created_at;
$$;

revoke all on function public.confirmacao_pendentes() from public, anon, authenticated;
