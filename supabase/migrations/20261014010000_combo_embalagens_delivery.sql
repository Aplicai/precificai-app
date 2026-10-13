-- 2026-10-14 — embalagens de delivery no COMBO.
--
-- O combo no delivery saía com o custo de balcão dos itens: nem as embalagens
-- de delivery dos produtos nem uma sacola/caixa do próprio combo entravam.
--
-- delivery_combos.embalagens_delivery: [{ "id": <embalagem>, "qtd": <n> }],
-- mesmo formato de produtos.embalagens_delivery. NULL = combo sem lista própria;
-- a leitura (embalagemDeliveryDoCombo, src/utils/deliveryAdapter.js) usa então
-- as embalagens de delivery de cada produto do combo. Nenhuma linha é alterada.
ALTER TABLE public.delivery_combos
  ADD COLUMN IF NOT EXISTS embalagens_delivery jsonb;

COMMENT ON COLUMN public.delivery_combos.embalagens_delivery IS
  'Embalagens de delivery do combo: [{"id": embalagens.id, "qtd": numero}]. NULL = usar as dos produtos do combo.';
