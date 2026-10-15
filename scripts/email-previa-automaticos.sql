-- E-mails automáticos (d1 e d3) previstos para o próximo dia útil, por etapa. Só totais.
-- d1 sai 24 a 48 h depois do cadastro e d3 72 a 96 h depois (job de hora em hora, 8h às 20h,
-- inclusive fim de semana). Aproximação por dia: d1 = cadastros do dia anterior ao alvo,
-- d3 = cadastros de 3 dias antes. Só e-mail confirmado; quem já recebeu não entra.
with alvo as (
  select (now() at time zone 'America/Sao_Paulo')::date
         + case extract(isodow from now() at time zone 'America/Sao_Paulo') when 5 then 3 when 6 then 2 else 1 end as dia
),
c as (
  select campanha, x.user_id from alvo,
  lateral (
    select 'd1' as campanha, u.id as user_id from auth.users u
     where (u.created_at at time zone 'America/Sao_Paulo')::date = alvo.dia - 1
    union all
    select 'd3', u.id from auth.users u
     where (u.created_at at time zone 'America/Sao_Paulo')::date = alvo.dia - 3
  ) x
  join auth.users u on u.id = x.user_id
  where u.email_confirmed_at is not null
    and u.email !~* '(teste|e2e|exemplo|\.test$)'
    and not exists (select 1 from email_optout o where o.user_id = u.id)
    and not exists (select 1 from email_envios e where e.user_id = u.id and e.campanha = x.campanha)
)
select campanha, public.email_estagio(user_id) as estagio, count(*) as n
  from c group by 1, 2 order by 1, 2;
