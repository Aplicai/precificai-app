-- Teste do limite do link de acesso (public.link_acesso_reservar, migration 20261019120000).
-- Roda numa transação desfeita no fim (não deixa rastro). Usa a primeira conta de auth.users.
-- Devolve só as linhas que FALHARAM (vazio = tudo certo).
begin;

create temp table _r (caso text, esperado boolean, obtido boolean) on commit drop;

do $$
declare
  uid uuid := (select id from auth.users order by created_at limit 1);
  i int;
begin
  delete from public.link_acesso_pedidos where user_id = uid;
  for i in 1..5 loop
    insert into _r values ('pedido ' || i || ' de 5', true, public.link_acesso_reservar(uid));
  end loop;
  insert into _r values ('6º pedido na mesma hora', false, public.link_acesso_reservar(uid));
  insert into _r values ('7º pedido na mesma hora', false, public.link_acesso_reservar(uid));
  update public.link_acesso_pedidos set janela_inicio = now() - interval '61 minutes' where user_id = uid;
  insert into _r values ('passou a hora: libera de novo', true, public.link_acesso_reservar(uid));
  insert into _r values ('janela nova conta do 1',
    true, (select contagem = 1 and janela_inicio = now() from public.link_acesso_pedidos where user_id = uid));
end $$;

select caso, esperado, obtido from _r where obtido is distinct from esperado;

rollback;
