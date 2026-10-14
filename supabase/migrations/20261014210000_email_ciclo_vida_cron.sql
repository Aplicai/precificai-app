-- 2026-10-14 — agenda os e-mails de 1 e 3 dias (função email-ciclo-vida).
--
-- De hora em hora, aos 7 minutos. A função só envia entre 8h e 20h de Brasília
-- e cada pessoa recebe cada e-mail uma vez (email_envios), então rodar a toda
-- hora não repete nada; só garante que ninguém fique de fora da janela.
--
-- O segredo do header vem do Vault ('email_cron_secret'), criado à parte
-- (não fica no repositório). Mesmo valor do secret EMAIL_CRON_SECRET da função.
create extension if not exists pg_net with schema extensions;

select cron.unschedule('email-ciclo-vida-hora')
 where exists (select 1 from cron.job where jobname = 'email-ciclo-vida-hora');

select cron.schedule(
  'email-ciclo-vida-hora',
  '7 * * * *',
  $job$
  select net.http_post(
    url := 'https://lwznqpxzmqptrpbifvka.supabase.co/functions/v1/email-ciclo-vida',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    body := '{"automatico": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
