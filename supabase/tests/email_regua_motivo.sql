-- Teste da regra do calendário da régua (public.email_regua_motivo).
-- Rodar depois da migration 20261015100000: devolve só as linhas que FALHARAM (vazio = tudo certo).
with casos(caso, dias, sem_usar, ultimo_qualquer, ultimo_regua, pausado, esperado) as (values
  ('dia 6 ainda não',               6,  10, null::int, null::int, false, 'antes do dia 7'),
  ('dia 7 primeira vez',            7,  10, null,      null,      false, 'ok'),
  ('usou o app ontem',             10,   1, null,      null,      false, 'usou o app nos últimos 3 dias'),
  ('usou há exatos 3 dias',        10,   3, null,      null,      false, 'ok'),
  ('reativação há 5 dias',         40,  10, 5,         null,      false, 'recebeu e-mail nos últimos 7 dias'),
  ('reativação há 7 dias',         40,  10, 7,         null,      false, 'ok'),
  ('semanal: régua há 6 dias',     20,  10, 6,         6,         false, 'recebeu e-mail nos últimos 7 dias'),
  ('semanal: régua há 7 dias',     21,  10, 7,         7,         false, 'ok'),
  ('quinzenal: régua há 10 dias',  50,  20, 10,        10,        false, 'ainda não é o dia'),
  ('quinzenal: régua há 15 dias',  50,  20, 15,        15,        false, 'ok'),
  ('dia 30 ainda semanal',         30,  20, 7,         7,         false, 'ok'),
  ('dia 31 vira quinzenal',        31,  20, 7,         7,         false, 'ainda não é o dia'),
  ('mensal: régua há 20 dias',    200,  50, 20,        20,        false, 'ainda não é o dia'),
  ('mensal: régua há 30 dias',    200,  50, 30,        30,        false, 'ok'),
  ('mensal pausado',              200,  90, 30,        30,        true,  'pausado: 3 mensais sem clique')
)
select caso, esperado,
       public.email_regua_motivo(dias, date '2026-10-20', sem_usar,
         date '2026-10-20' - ultimo_qualquer, date '2026-10-20' - ultimo_regua, pausado) as obtido
  from casos
 where public.email_regua_motivo(dias, date '2026-10-20', sem_usar,
         date '2026-10-20' - ultimo_qualquer, date '2026-10-20' - ultimo_regua, pausado) is distinct from esperado;
