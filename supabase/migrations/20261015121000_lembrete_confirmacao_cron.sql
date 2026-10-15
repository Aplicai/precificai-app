-- 2026-10-15 — Agenda o lembrete de confirmação de hora em hora (minuto 37,
-- longe do email-ciclo-vida às :07). Segredo no Vault (mesmo do email-ciclo-vida).
select cron.schedule(
  'lembrete-confirmacao-hora',
  '37 * * * *',
  $job$
  select net.http_post(
    url := 'https://lwznqpxzmqptrpbifvka.supabase.co/functions/v1/lembrete-confirmacao',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'email_cron_secret')
    ),
    body := '{"enviar": true}'::jsonb,
    timeout_milliseconds := 60000
  );
  $job$
);
