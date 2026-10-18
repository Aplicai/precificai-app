-- 2026-10-18 — Quantas vezes cada conta abre o app, e se foi pelo app
-- instalado (ícone na tela inicial) ou pelo navegador.
--
-- Motivo: o Meta só conta a instalação aceita pelo nosso botão no Chrome
-- (InstalouApp) e só de quem aceitou cookies. O navegador sabe quando o app
-- está aberto como app instalado (display-mode: standalone) no Android e no
-- iPhone: registrar a abertura mede instalações de verdade e o retorno.
--
-- O app só INSERE a própria linha (RLS). Leitura só pelo service role/SQL.

create table if not exists public.app_aberturas (
  id                bigserial primary key,
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  aberto_em         timestamptz not null default now(),
  instalado         boolean not null,
  plataforma        text,
  navegador_interno boolean not null default false
);
create index if not exists app_aberturas_user_idx on public.app_aberturas (user_id, aberto_em desc);

alter table public.app_aberturas enable row level security;
revoke all on table public.app_aberturas from anon;
grant insert on table public.app_aberturas to authenticated;
grant usage on sequence public.app_aberturas_id_seq to authenticated;

drop policy if exists app_aberturas_insert_own on public.app_aberturas;
create policy app_aberturas_insert_own on public.app_aberturas
  for insert to authenticated
  with check (user_id = auth.uid());
