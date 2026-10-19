-- 2026-10-19 — Tela do primeiro preço (PrimeiroPrecoScreen).
--
-- 1) Aceite de lembretes no WhatsApp (LGPD: opt-in explícito, botão "Quero
--    receber"). O app só guarda o aceite; nenhuma mensagem é enviada por ele.
--    O próprio usuário grava pela RLS de `perfil` (users_own_data_update).
--    `whatsapp_lembretes_em` é carimbado pelo banco a cada mudança do aceite
--    (o valor mandado pelo aparelho é ignorado): registro confiável de quando
--    a pessoa aceitou ou desistiu.
--
-- 2) Link de acesso de uso único (edge function `link-acesso`): abre o app no
--    Chrome/Safari já logado, saindo do navegador do Instagram. Limite de 5
--    links por hora por conta, contado aqui de forma atômica pela função
--    `link_acesso_reservar` (só service role; RLS ligado e sem política).

-- 1) perfil ------------------------------------------------------------------

alter table public.perfil
  add column if not exists whatsapp_lembretes boolean not null default false,
  add column if not exists whatsapp_lembretes_em timestamptz;

create or replace function public.perfil_whatsapp_lembretes_em()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.whatsapp_lembretes_em := case when coalesce(new.whatsapp_lembretes, false) then now() else null end;
  elsif new.whatsapp_lembretes is distinct from old.whatsapp_lembretes then
    new.whatsapp_lembretes_em := now();
  else
    new.whatsapp_lembretes_em := old.whatsapp_lembretes_em;
  end if;
  return new;
end;
$$;

drop trigger if exists perfil_whatsapp_lembretes_em on public.perfil;
create trigger perfil_whatsapp_lembretes_em
  before insert or update on public.perfil
  for each row execute function public.perfil_whatsapp_lembretes_em();

-- 2) link de acesso -----------------------------------------------------------

create table if not exists public.link_acesso_pedidos (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  janela_inicio timestamptz not null default now(),
  contagem      integer not null default 0
);
alter table public.link_acesso_pedidos enable row level security;
revoke all on table public.link_acesso_pedidos from anon, authenticated;

-- true = pode gerar mais um link agora (e já conta); false = passou do limite.
-- Janela fixa por conta: a 1ª chamada abre a janela; passada a janela,
-- recomeça do 1. Um único upsert: duas chamadas juntas não furam o limite.
create or replace function public.link_acesso_reservar(
  p_user_id uuid,
  p_max integer default 5,
  p_janela interval default interval '1 hour'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  insert into public.link_acesso_pedidos as l (user_id, janela_inicio, contagem)
  values (p_user_id, now(), 1)
  on conflict (user_id) do update
    set janela_inicio = case when l.janela_inicio <= now() - p_janela then now() else l.janela_inicio end,
        contagem      = case when l.janela_inicio <= now() - p_janela then 1 else l.contagem + 1 end
    where l.janela_inicio <= now() - p_janela or l.contagem < p_max
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.link_acesso_reservar(uuid, integer, interval) from public, anon, authenticated;
grant execute on function public.link_acesso_reservar(uuid, integer, interval) to service_role;
