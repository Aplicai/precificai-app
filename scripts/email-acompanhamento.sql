-- Acompanhamento dos e-mails (só totais, nenhum e-mail ou nome): para cada campanha
-- e modelo, quantos receberam, abriram, clicaram, voltaram ao app em até 7 dias,
-- avançaram de etapa (etapa de hoje × etapa no envio) e saíram da lista.
-- "Voltou ao app" = mexeu em ingrediente, produto ou receita, ou fez login, depois do e-mail.
-- Abertura é tendência (Apple Mail infla, bloqueio de imagem esconde); clique e volta valem mais.
with ordem(estagio, n) as (values
  ('sem_perfil', 0), ('sem_ingrediente', 1), ('kit_sem_preco', 2), ('sem_produto', 3), ('produto_sem_preco', 4), ('ativo', 5)
),
e as (
  select e.*, coalesce(e.tema, e.campanha) as modelo,
         (select n from ordem where ordem.estagio = e.estagio) as n_antes,
         (select n from ordem where ordem.estagio = public.email_estagio(e.user_id)) as n_hoje
    from email_envios e
   where e.enviado_em >= now() - interval '60 days'
),
ev as (
  select resend_id,
         bool_or(tipo = 'delivered') as entregue, bool_or(tipo = 'opened') as abriu, bool_or(tipo = 'clicked') as clicou,
         bool_or(tipo = 'bounced') as devolveu, bool_or(tipo = 'complained') as spam
    from email_eventos group by 1
)
select e.campanha, e.modelo, coalesce(e.formato, '-') as formato,
       min(e.enviado_em at time zone 'America/Sao_Paulo')::date as primeiro_envio,
       count(*) as enviados,
       count(*) filter (where ev.entregue) as entregues,
       count(*) filter (where ev.abriu) as abriram,
       count(*) filter (where ev.clicou) as clicaram,
       count(*) filter (where
         exists (select 1 from auth.users u where u.id = e.user_id and u.last_sign_in_at between e.enviado_em and e.enviado_em + interval '7 days')
         or exists (select 1 from materias_primas m where m.user_id = e.user_id and coalesce(m.updated_at, m.created_at) between e.enviado_em and e.enviado_em + interval '7 days')
         or exists (select 1 from produtos p where p.user_id = e.user_id and coalesce(p.updated_at, p.created_at) between e.enviado_em and e.enviado_em + interval '7 days')
         or exists (select 1 from preparos r where r.user_id = e.user_id and coalesce(r.updated_at, r.created_at) between e.enviado_em and e.enviado_em + interval '7 days')
       ) as voltaram_7d,
       count(*) filter (where e.n_hoje > e.n_antes) as avancaram,
       count(*) filter (where exists (select 1 from email_optout o where o.user_id = e.user_id and o.criado_em > e.enviado_em)) as sairam,
       count(*) filter (where ev.devolveu) as devolvidos,
       count(*) filter (where ev.spam) as spam
  from e left join ev on ev.resend_id = e.resend_id
 group by 1, 2, 3
 order by primeiro_envio desc, enviados desc;
