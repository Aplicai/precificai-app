-- 2026-10-21 — Montar a receita tocando (edge function `montar-receita`).
--
-- Limite de uso da IA (Gemini, plano grátis): no máximo N montagens por conta
-- por dia e um teto do projeto inteiro por dia (linha do UUID zero), contados
-- de forma atômica antes de chamar o Google. Passou do limite: o app usa a
-- lista do nicho (nunca trava). Só a service role usa (RLS ligado, sem
-- política). Mesmo padrão de `link_acesso_reservar` (20261019120000).

create table if not exists public.montar_receita_uso (
  user_id  uuid primary key,
  dia      date not null default (now() at time zone 'America/Sao_Paulo')::date,
  contagem integer not null default 0
);
alter table public.montar_receita_uso enable row level security;
revoke all on table public.montar_receita_uso from anon, authenticated;

-- true = pode montar mais uma agora (e já conta); false = passou do limite.
-- O dia vira à meia-noite de Brasília. Um único upsert: duas chamadas juntas
-- não furam o limite.
create or replace function public.montar_receita_reservar(p_user_id uuid, p_max integer default 10)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ok boolean;
begin
  insert into public.montar_receita_uso as u (user_id, dia, contagem)
  values (p_user_id, v_hoje, 1)
  on conflict (user_id) do update
    set dia      = v_hoje,
        contagem = case when u.dia <> v_hoje then 1 else u.contagem + 1 end
    where u.dia <> v_hoje or u.contagem < p_max
  returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.montar_receita_reservar(uuid, integer) from public, anon, authenticated;
grant execute on function public.montar_receita_reservar(uuid, integer) to service_role;
