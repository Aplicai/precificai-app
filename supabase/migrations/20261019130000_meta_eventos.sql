-- 2026-10-19 — Conversions API do Meta (função `meta-evento`).
--
-- O app manda CompleteRegistration / PrimeiroPreco / Ativacao também pelo
-- servidor (só para quem aceitou os cookies), deduplicado com o Pixel pelo
-- mesmo event_id. Para não virar canal de spam, a função envia no máximo
-- 1 vez por conta + evento a cada 24 h: guarda aqui a hora do último envio.
-- Só para service role: RLS ligado e sem política.

create table if not exists public.meta_eventos_enviados (
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_name text not null,
  enviado_em timestamptz not null default now(),
  primary key (user_id, event_name)
);
alter table public.meta_eventos_enviados enable row level security;
revoke all on table public.meta_eventos_enviados from anon, authenticated;
