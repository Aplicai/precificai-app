# Design — Embalagem de delivery dentro do produto (sem cadastro duplicado)

Data: 2026-09-09 · Origem: pedido do dono no walkthrough ("o cliente tem que cadastrar todas as embalagens de delivery de novo; pensar numa solução que não obrigue criar dois itens, ou que duplique rápido e seja intuitivo").

## Problema observado

- Produto do balcão tem ingredientes + receitas + embalagem de balcão (ex.: guardanapo).
- No delivery o mesmo produto sai com marmita + sacola + talher. Hoje o caminho é criar um **"produto delivery" separado** (`delivery_produtos` + `delivery_produto_itens`) repetindo tudo.
- Resultado: cadastro dobrado, custo de delivery frequentemente errado (esquece embalagem), e o "Visão Geral" do Delivery calcula "mesmo lucro" e "mínimo" a partir do CMV de balcão — **sem a embalagem do delivery**.

## Decisão: o produto é um só; o canal muda a embalagem

O produto ganha uma seção **"Delivery"**. O que muda entre balcão e delivery é só embalagem (e as taxas da plataforma, que já são tratadas em `deliveryPricing`). Nada de segundo cadastro.

### Modelo de dados (já existe, hoje morto)

| Coluna | Estado |
|---|---|
| `produtos.embalagem_delivery_id` (FK embalagens) | existe em prod (migration APP-29c), zero uso |
| `produtos.embalagem_delivery_quantidade` REAL default 1 | idem |
| `embalagem_categoria_padrao (embalagem_id, categoria_id, canal)` | existe; UI só usa canal `'balcao'` |
| `services/embalagemPadrao.js` `getEmbalagemPadrao(db, categoriaId, canal)` | pronto |

**Limitação aceita:** uma embalagem de delivery por produto (a coluna é 1:1). Quando o delivery leva 2+ itens (marmita + sacola), o dono cadastra uma embalagem composta ("Kit marmita delivery": marmita + sacola + talher, com preço unitário = soma) — o formulário de embalagem já mostra preço unitário a partir do pacote. Registrar isso no helper text. Se virar dor real, evoluir para tabela `produto_embalagens.canal` (item 6 abaixo).

### UX

1. **Formulário de produto (EntityCreateModal desktop + ProdutoFormScreen mobile)** — nova seção depois de "Itens", título "Delivery", com um toggle **"Vende no delivery?"** (default ligado se a conta tem alguma plataforma ativa em `delivery_config`).
   - Ligado → aparece "Embalagem do delivery" (picker de embalagens, mesmo componente da busca de itens filtrado por embalagens) + quantidade (default 1).
   - Pré-preenchido pela categoria: `getEmbalagemPadrao(db, categoria_id, 'delivery')`. Chip "Padrão da categoria" quando veio do padrão; se o usuário trocar, vira "Personalizada".
   - Linha de resumo dentro da seção: "Custo no delivery: R$ 4,13 + R$ 2,50 embalagem = **R$ 6,63**".
   - Desligado → grava `embalagem_delivery_id = NULL`.
2. **Formulário de embalagem** — o bloco "Definir como padrão para:" ganha duas linhas: **Balcão** (categorias) e **Delivery** (categorias). Hoje o código hardcoda `'balcao'` em `EmbalagemFormScreen` (3 lugares) e `EntityCreateModal:196`. Passar o canal.
3. **Delivery › Visão Geral e "Meus preços nesta plataforma"** — CMV usado nos cálculos de delivery = CMV balcão − embalagem de balcão? **Não**: manter simples e explícito: `cmvDelivery = cmvBalcao + embalagemDelivery` (a embalagem de balcão, quando existe, costuma ir junto — guardanapo, saquinho). Mostrar coluna "Custo no delivery" ao lado de "Custo dos ingredientes" e usar `cmvDelivery` em "mesmo lucro" e "mínimo". Legenda: "Custo no delivery = ingredientes + embalagem de delivery do produto".
4. **Lista de produtos** — no card, ícone pequeno de moto/caixa quando o produto tem embalagem de delivery (tooltip "Delivery: + R$ 2,50 de embalagem").
5. **Produtos Delivery (tela atual `DeliveryProdutosScreen`)** — fica como "itens só do delivery" (ex.: refrigerante em lata que não existe no balcão). Renomear o título para "Itens só do delivery" e colocar no topo um aviso: "Produtos do cardápio já entram no delivery automaticamente — aqui só o que não existe no balcão." Botão "Duplicar do balcão" continua útil pra exceções.
6. **Futuro (não agora):** `produto_embalagens.canal` ('balcao' | 'delivery' | 'ambos') pra N embalagens por canal, migrando `embalagem_delivery_id` para uma linha com canal='delivery'.

### Cálculo

- `custoDelivery(produto) = cmv(produto) + preco_unitario(embalagem_delivery) × embalagem_delivery_quantidade`.
- `deliveryPricing.calcMesmoLucro / calcPrecoMinimo` recebem `cmv = custoDelivery`. Nada mais muda (comissão %, taxa pgto, outros %, cupom R$, frete R$ já tratados).
- Lista de compras: embalagens de delivery entram na lista quando o usuário marcar "produção para delivery" (fora de escopo agora; anotar).

### Arquivos

- `src/components/EntityCreateModal.js` (seção Delivery + persistência), `src/screens/ProdutoFormScreen.js` (mobile), `src/screens/ProdutosListScreen.js` (ícone), `src/screens/EmbalagemFormScreen.js` (canal delivery), `src/services/embalagemPadrao.js` (sem mudança), `src/utils/deliveryAdapter.js` (montar `custoDelivery`), `src/screens/DeliveryHubScreen.js` + `DeliveryPrecosScreen.js` (coluna/legenda), `src/screens/DeliveryProdutosScreen.js` (copy).
- Migration: nenhuma (colunas existem). Verificado em prod em 2026-09-09.
- Testes: `__tests__/deliveryPricing.test.mjs` (novo caso com embalagem de delivery), `__tests__/embalagemPadrao.test.mjs` (canal delivery).

### Critério de pronto

Bolo de cenoura (CMV 4,13, balcão 25,00) + "Caixa para bolo" (2,50) marcada como embalagem de delivery → Visão Geral mostra "Custo no delivery 6,63", "mesmo lucro" e "mínimo" recalculados com 6,63; produto criado na categoria "À la carte" já nasce com a caixa se ela for padrão de delivery da categoria; nenhum cadastro em `delivery_produtos` necessário.
