# Deploy M1 — Estoque + PWA + Push + IA

Guia rápido para colocar o M1 em produção.

## ✅ Já feito automaticamente

- [x] Commit + push para `master` (GitHub: Aplicai/precificai-app)
- [x] Vercel deploy automático disparado pelo push (e CLI prod deploy)
- [x] PWA shipped (manifest.json, service worker, install prompt)
- [x] Frontend novo: Estoque (3 telas), Notificações, IA Modal

## 🛠️ Pendente — exige ação humana

### 1. Rodar migration SQL no Supabase

Vai em https://supabase.com/dashboard/project/lwznqpxzmqptrpbifvka/sql/new
e cola o conteúdo de `src/database/migration-m1-estoque.sql`. Roda.
Cria:
- Colunas `quantidade_estoque`, `estoque_minimo`, `custo_medio` em
  `materias_primas` e `embalagens`
- Tabela `estoque_movimentos` (RLS habilitada)
- RPCs `registrar_entrada_estoque` e `baixar_estoque`
- Tabelas `device_tokens` e `notif_prefs` (RLS)

> ⚠️ Idempotente — pode rodar múltiplas vezes sem efeito colateral.

### 2. Deploy das Edge Functions Supabase

Crie um Personal Access Token em
https://supabase.com/dashboard/account/tokens
e exporte:

```bash
export SUPABASE_ACCESS_TOKEN=sbp_xxx...
```

Pegue sua chave Anthropic em https://console.anthropic.com/settings/keys
(`sk-ant-...`) e rode:

```bash
bash scripts/deploy-supabase.sh --with-anthropic sk-ant-xxx
```

Isso vai:
1. Linkar o projeto `lwznqpxzmqptrpbifvka`
2. Deployar `send-push` (notificações)
3. Deployar `suggest-price` (IA pricing)
4. Configurar `ANTHROPIC_API_KEY` como secret do projeto

### 3. (Opcional) Instalar expo-notifications

Push só funciona em build native (iOS/Android). No web, o serviço degrada
silenciosamente. Quando autorizar:

```bash
npm install expo-notifications expo-device
```

Não precisa mexer em mais nada — o `services/push.js` já usa
`try { require() } catch {}` para detectar a presença da lib.

### 4. (Opcional) Cron jobs Supabase

Para disparar notificações automáticas:
- Estoque baixo às 8h
- Resumo diário às 20h

Use o `pg_cron` do Supabase ou Edge Functions com cron schedule.
Esses jobs chamam `send-push` via HTTP com `bypass_prefs=false`.

## URLs de produção

- **Web app:** https://app.precificaiapp.com
- **Repo:** https://github.com/Aplicai/precificai-app
- **Supabase:** https://lwznqpxzmqptrpbifvka.supabase.co
- **Edge Functions** (após deploy):
  - https://lwznqpxzmqptrpbifvka.supabase.co/functions/v1/send-push
  - https://lwznqpxzmqptrpbifvka.supabase.co/functions/v1/suggest-price
