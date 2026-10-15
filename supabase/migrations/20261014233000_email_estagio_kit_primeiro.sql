-- 2026-10-14 — Etapa "kit sem preço" antes de "produto sem preço".
--
-- O Kit de Início cria 2 produtos de exemplo com preço zerado. Na ordem antiga,
-- quem pegou o kit e não colocou preço em NENHUM ingrediente caía em
-- 'produto_sem_preco' ("você já montou seu produto"), o que não é verdade.
-- Sem ingrediente com preço, o próximo passo é sempre colocar preço nos ingredientes.

create or replace function public.email_estagio(uid uuid)
returns text
language sql stable security definer
set search_path = public, pg_catalog
as $$
  with n as (
    select
      coalesce((select nome_negocio from perfil where user_id = uid limit 1), '') as negocio,
      (select count(*) from materias_primas where user_id = uid) as insumos,
      (select count(*) from materias_primas where user_id = uid and coalesce(preco_por_kg, 0) > 0) as insumos_com_preco,
      (select count(*) from produtos where user_id = uid) as produtos,
      (select count(*) from produtos where user_id = uid and coalesce(preco_venda, 0) > 0) as produtos_com_preco
  )
  select case
    when trim(negocio) = ''        then 'sem_perfil'
    when insumos = 0               then 'sem_ingrediente'
    when produtos_com_preco > 0    then 'ativo'
    when insumos_com_preco = 0     then 'kit_sem_preco'
    when produtos > 0              then 'produto_sem_preco'
    else 'sem_produto'
  end
  from n;
$$;

revoke all on function public.email_estagio(uuid) from public, anon, authenticated;
