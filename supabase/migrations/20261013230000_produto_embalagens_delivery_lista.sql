-- 2026-10-13 — VÁRIAS embalagens de delivery por produto.
--
-- Antes: produtos.embalagem_delivery_id + embalagem_delivery_quantidade (UMA
-- embalagem). Quem mandava marmita + sacola + talher precisava cadastrar uma
-- "embalagem composta" com o preço somado à mão.
--
-- Agora a lista fica em produtos.embalagens_delivery: [{ "id": <embalagem>, "qtd": <n> }].
-- Coluna na própria linha do produto (e não tabela filha) porque toda tela que
-- calcula custo de delivery já lê `SELECT * FROM produtos` — a lista chega sem
-- query extra e sem mais um lugar pra lembrar em duplicar/apagar/exportar.
--
-- O par legado continua gravado com o PRIMEIRO item da lista: abas abertas com
-- a versão anterior do app seguem funcionando. NULL = nunca gravada; a leitura
-- (embalagensDeliveryDoProduto, src/utils/deliveryAdapter.js) cai no par legado,
-- por isso NENHUMA linha existente é alterada aqui.
ALTER TABLE public.produtos
  ADD COLUMN IF NOT EXISTS embalagens_delivery jsonb;

COMMENT ON COLUMN public.produtos.embalagens_delivery IS
  'Embalagens extras do delivery: [{"id": embalagens.id, "qtd": numero}]. NULL = usar embalagem_delivery_id/_quantidade.';
