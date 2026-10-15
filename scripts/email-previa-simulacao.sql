-- Simulação da régua para o próximo dia útil às 10h (Brasília), para a prévia diária.
-- Sem e-mail, sem id e com os nomes trocados por marcadores: só o que a escolha de
-- tema/formato precisa (etapa, plano, histórico e quais dados existem).
-- Uso: resultado (JSON) → node scripts/email-previa.ts --simulacao amanha.json --dia DD/MM
with alvo as (
  select (d + interval '10 hours') at time zone 'America/Sao_Paulo' as quando, d::date as dia
    from (select (now() at time zone 'America/Sao_Paulo')::date
                 + case extract(isodow from now() at time zone 'America/Sao_Paulo')
                     when 5 then 3 when 6 then 2 else 1 end as d) x
)
select to_char(alvo.dia, 'DD/MM') as dia_alvo, c.estagio, c.plano, c.fase, c.motivo,
       c.temas_recebidos, c.formatos_recentes, c.padroes_recentes,
       case when c.motivo = 'ok' then (
         select jsonb_build_object(
           'negocio', case when d->>'negocio' is not null then 'Negócio' end,
           'insumos', d->'insumos', 'insumos_com_preco', d->'insumos_com_preco',
           'produtos', d->'produtos', 'produtos_com_preco', d->'produtos_com_preco',
           'produto_foco', case when jsonb_typeof(d->'produto_foco') = 'object' then jsonb_build_object(
               'nome', 'Produto', 'ingredientes', d->'produto_foco'->'ingredientes',
               'ingredientes_sem_preco', d->'produto_foco'->'ingredientes_sem_preco',
               'exemplos', case when jsonb_array_length(d->'produto_foco'->'exemplos') > 0 then '["A"]'::jsonb else '[]'::jsonb end) end,
           'produtos_sem_preco', case when jsonb_array_length(d->'produtos_sem_preco') > 0 then '["Produto"]'::jsonb else '[]'::jsonb end,
           'ultimo_produto', case when jsonb_typeof(d->'ultimo_produto') = 'object' then '{"nome":"Produto","preco":1}'::jsonb end,
           'dias_sem_atualizar_precos', d->'dias_sem_atualizar_precos')
           from (select public.email_dados(c.user_id) as d) z)
       end as dados
  from alvo, public.email_regua_candidatos(alvo.quando, true) c;
