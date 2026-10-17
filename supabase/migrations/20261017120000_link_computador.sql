-- 2026-10-17 — "Me mandar o link por e-mail" (escada dos 3 preços).
--
-- Na tabela de preços, no celular, a pessoa pode pedir o link do app para
-- abrir no computador. A função `enviar-link-computador` manda só para o
-- e-mail da própria conta e no máximo 1 vez a cada 24 h: guarda aqui a hora
-- do último envio (uma linha por conta). Só para service role: RLS ligado e
-- sem política.

create table if not exists public.link_computador_envios (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  enviado_em timestamptz not null default now()
);
alter table public.link_computador_envios enable row level security;
revoke all on table public.link_computador_envios from anon, authenticated;
