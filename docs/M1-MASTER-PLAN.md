# M1 Master Plan — Estoque + PWA/Push + IA Pricing

Sessão 4 (2026-04-22). Escopo: 3 frentes M1 simultâneas.

## Fase 1 — Estoque Real (M1-10/11/12)

### Schema novo
```sql
-- Saldos
ALTER TABLE materias_primas ADD COLUMN quantidade_estoque NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE materias_primas ADD COLUMN estoque_minimo NUMERIC;
ALTER TABLE embalagens      ADD COLUMN quantidade_estoque NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE embalagens      ADD COLUMN estoque_minimo NUMERIC;

-- Movimentos (entrada, saída, ajuste)
CREATE TABLE estoque_movimentos (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entidade_tipo TEXT NOT NULL CHECK (entidade_tipo IN ('materia_prima','embalagem')),
  entidade_id BIGINT NOT NULL,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada','saida','ajuste')),
  quantidade NUMERIC NOT NULL,
  custo_unitario NUMERIC,           -- preenchido em entradas
  motivo TEXT,                       -- "Recebimento NF 1234", "Venda #45", "Inventário"
  origem_tipo TEXT,                  -- 'venda','manual','inventario','recebimento'
  origem_id BIGINT,                  -- referência para venda.id quando origem='venda'
  saldo_apos NUMERIC NOT NULL,       -- snapshot do saldo após o movimento
  custo_medio_apos NUMERIC,          -- custo médio ponderado após o movimento
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_estmov_user_data ON estoque_movimentos(user_id, created_at DESC);
CREATE INDEX idx_estmov_entidade ON estoque_movimentos(entidade_tipo, entidade_id);
```

### Telas
- `EstoqueHubScreen` — overview com tabs (Saldos | Movimentos | Inventário)
- `EstoqueSaldosScreen` — lista de insumos+embalagens com saldo + chip de status (OK/Baixo/Zerado)
- `EntradaEstoqueScreen` — formulário de recebimento (qtd + custo unit → atualiza saldo + custo médio ponderado)
- `MovimentosEstoqueScreen` — histórico de entradas/saídas
- `AjusteEstoqueScreen` — ajuste manual com motivo obrigatório

### Lógica
- **Custo médio ponderado**: `novo_custo = (saldo_atual * custo_atual + qtd_entrada * custo_entrada) / (saldo_atual + qtd_entrada)`
- **Baixa em venda**: ao registrar venda em `VendasScreen`, calcular insumos+embalagens consumidos (BOM expansion via `produto_ingredientes` + `produto_preparos.preparo_id` → `preparo_ingredientes`) e gerar movimentos `tipo='saida'` automaticamente
- **Banner Home**: contador de itens com `quantidade_estoque <= estoque_minimo`

## Fase 2 — PWA Real (M1-31)

### Arquivos
- `public/manifest.json` (já tem ícones em `/assets`)
- `public/sw.js` — service worker com cache strategy:
  - `network-first` para `/api/*` (Supabase)
  - `cache-first` para assets (`*.js`, `*.css`, `*.png`, fonts)
  - `stale-while-revalidate` para HTML
- `index.web.js` — registrar SW no boot
- `app.config.js` web → `themeColor`, `backgroundColor`, `display: 'standalone'`
- `src/components/web/InstallPrompt.js` — captura `beforeinstallprompt`, mostra CTA "Instalar app"

## Fase 3 — Push Notifications (M1-33)

### Stack
- `expo-notifications` para receber pushes no nativo (web é PWA Push API separado, fica para v2)
- Tabela `device_tokens` no Supabase (user_id, expo_push_token, platform, last_seen)
- Edge Function `send-push` em `supabase/functions/send-push/index.ts` — recebe `{user_id, title, body, data}` e chama Expo Push API

### Triggers
- **Estoque baixo** (cron diário 8h): query `materias_primas` + `embalagens` com `quantidade_estoque <= estoque_minimo` por user → chama edge function
- **Margem crítica** (após reajuste): se algum produto ficou com `margem < 5%` → push imediato
- **Resumo diário** (cron 20h): "Hoje: 12 vendas · R$ 480 · Lucro R$ 145"

### UI
- `NotificacoesScreen` em /Mais — toggle por tipo (estoque, margem, resumo)
- `usePushPermissions` hook — pede permissão na 1ª venda registrada (não no boot)

## Fase 4 — Sugestão de Preço por IA (M1-23)

### Backend
- Endpoint Claude API via `fetch` (sem SDK pra evitar dep extra)
- Prompt engineering com:
  - CMV unitário do produto
  - Margem-alvo do user (`configuracao.lucro_desejado`)
  - Despesas fixas % + variáveis %
  - Categoria + nome do produto (contexto qualitativo)
  - Histórico de preço dos últimos 6 meses (se houver)
  - Preços médios da categoria (calc on-the-fly do user's data)

### Output esperado
```json
{
  "preco_sugerido": 12.90,
  "preco_psicologico": 12.99,
  "faixa_recomendada": [11.50, 14.50],
  "margem_resultante": 0.32,
  "racional": "Considerando CMV de R$5.20, sua meta de 30%, ...",
  "alertas": ["Concorrentes da categoria geralmente cobram entre R$10 e R$15"]
}
```

### UI
- `SuggestPriceModal` — botão "Sugerir preço com IA ✨" no `ProdutoFormScreen`
- Loading → resultado com cards de preço sugerido, faixa, racional
- CTA "Aplicar preço sugerido" → seta `preco_venda`

### Config
- `EXPO_PUBLIC_AI_PROXY_URL` — endpoint backend (criar Edge Function `suggest-price` que proxy pra Claude com chave server-side)
- **Importante**: chave Anthropic NUNCA no client; sempre server-side via Edge Function

## Ordem de execução
1. Schema estoque + migration (foundation)
2. EstoqueHubScreen + Saldos (UI básica funcional)
3. PWA manifest + SW (atalho de retenção)
4. expo-notifications scaffold + device_tokens schema
5. Edge function `suggest-price` + UI integração ProdutoForm
6. Triggers de baixa em venda (mais complexo, fica por último)

## Limitações / TODO pós-M1
- Conflict resolution offline-first (M1-01) — não incluído nesta sessão
- Audit log (M1-04) — não incluído
- Web Push (PWA) — fica para v2; M1 só nativo via Expo
- Tributos (M1-28) — não incluído
