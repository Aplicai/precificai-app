# Design — Categorias no Delivery + embalagem do delivery no cálculo

## Pedido do dono

1. Produtos do delivery **por categoria** — aparecendo ao **adicionar preços de venda**
   e no **resumo geral** do delivery. (Cliente quer organizar.)
2. Um jeito melhor de colocar a **embalagem do delivery no cálculo** (hoje é item a
   item, manual, em cada produto).

## Descoberta: a feature está PELA METADE (não precisa inventar)

| Peça | Estado |
|---|---|
| Tabela `embalagem_categoria_padrao` (`embalagem_id, categoria_id, canal`, UNIQUE por categoria+canal) | ✅ existe |
| `canal` aceita `'balcao'` \| `'delivery'` | ✅ existe |
| Service `embalagemPadrao.js` (`getEmbalagemPadrao(cat, canal)`, `setCategoriasPadraoDaEmbalagem`) | ✅ pronto |
| UI que consome | ❌ **hardcoda `'balcao'`** (EmbalagemForm:205/262/311, EntityCreateModal:196) |
| TODO no código | `EmbalagemFormScreen:259` — *"canal balcão por enquanto; delivery vem com APP-29c UI"* |
| `delivery_produtos.categoria_id` | ❌ não existe |
| `produtos.embalagem_delivery_id` / `embalagem_delivery_quantidade` | ⚠️ **colunas MORTAS** — zero uso no código |

**FK confirmada ao vivo:** `embalagem_categoria_padrao.categoria_id → categorias_produtos(id)`.

## Decisão central

**Reusar `categorias_produtos`** no delivery (mesmas categorias: Salgados, Bebidas…),
NÃO criar tabela de categorias só pra delivery. Motivo: a FK acima. Com o mesmo
espaço de `categoria_id`, a embalagem padrão por (categoria, canal='delivery')
funciona **direto**, sem tabela nem service novo.

Os dois pedidos viram **uma feature: terminar o canal delivery.**

## Escopo

### 1. Migration
```sql
ALTER TABLE delivery_produtos
  ADD COLUMN categoria_id BIGINT REFERENCES categorias_produtos(id) ON DELETE SET NULL;
```
Nullable (produtos delivery existentes ficam "sem categoria"). Sem backfill.

### 2. Telas
- **DeliveryProdutosScreen** — seletor de categoria ao criar/editar produto delivery.
  Ao escolher categoria → `getEmbalagemPadrao(db, categoriaId, 'delivery')` →
  adiciona a embalagem aos itens automaticamente (mesma mecânica que o
  EntityCreateModal já faz pro balcão em `:196`).
- **DeliveryPrecosScreen** — agrupar/filtrar por categoria (pedido 1a).
- **DeliveryHubScreen** — resumo geral por categoria (pedido 1b).
- **EmbalagemFormScreen** — permitir marcar a embalagem como padrão **no canal
  delivery** (hoje só balcão). Passar `'delivery'` em vez de hardcode.

### 3. Limpeza
Decidir `produtos.embalagem_delivery_id` / `embalagem_delivery_quantidade`:
ou liga (produto do balcão com embalagem específica de delivery) ou **DROP**.
Recomendo DROP — a embalagem padrão por categoria+canal já cobre o caso, e coluna
morta confunde quem lê o schema.

## O que muda pra cliente

Antes: adiciona a embalagem como item, um por um, em cada produto delivery.
Depois: marca UMA vez "essa embalagem é padrão da categoria X no delivery" → todo
produto delivery daquela categoria **já entra com a embalagem no custo**.

## Plano de implementação (ordem)

1. Migration `delivery_produtos.categoria_id` (+ rodar em prod).
2. `DeliveryProdutosScreen`: seletor de categoria + persistir.
3. Auto-embalagem: `getEmbalagemPadrao(cat, 'delivery')` ao escolher categoria.
4. `EmbalagemFormScreen`: canal delivery (parar de hardcodar `'balcao'`).
5. `DeliveryPrecosScreen`: agrupar por categoria.
6. `DeliveryHubScreen`: resumo por categoria.
7. DROP das colunas mortas `embalagem_delivery_*`.
8. Verificar: produto delivery sem categoria continua funcionando (nullable).

## YAGNI

- Sem tabela de categorias própria do delivery (reusa `categorias_produtos`).
- Sem backfill de categoria nos delivery_produtos existentes.
- Sem embalagem por produto delivery individual (padrão por categoria resolve;
  ela ainda pode adicionar item manual se quiser exceção).

## Risco / verificação

Migration em prod + 4 telas. Precisa de conta de teste com produtos delivery pra
validar antes de chegar em cliente. Produtos delivery sem categoria (todos os
atuais) NÃO podem quebrar — categoria é opcional.
