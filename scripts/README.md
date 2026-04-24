# Scripts

## `deploy-web.sh`
Build + deploy do app web pra Vercel produção em um único comando. **Use este sempre** em vez de chamar `vercel deploy` direto.

```bash
bash scripts/deploy-web.sh
```

Resolve o problema recorrente "Vercel cache stale": `vercel deploy --prebuilt` usa `.vercel/output/static/` (NÃO `dist/`). Sem sincronizar manualmente, o deploy sobe o bundle ANTIGO. Este script automatiza:

1. `expo export --platform web --clear` (gera dist novo)
2. Limpa `.vercel/output/static/` dos artefatos antigos
3. Sincroniza `dist/*` → `.vercel/output/static/`
4. `vercel deploy --prebuilt --prod --yes`
5. Aliasa o novo deploy pra `precificaiapp.com` + `app.precificaiapp.com`
6. Smoke test (curl com browser UA) — confirma que o NOVO bundle está live em ambos os domínios

Falha (exit 1) se sync ou deploy quebrar; warning (exit 2) se smoke test não bater (CDN ainda propagando).

## `validate-env.js`
Runs as `prebuild` hook on every `npm run build:web`. Fails the build if `EXPO_PUBLIC_SUPABASE_*` env vars are missing or malformed (e.g. truncated JWT).

## `smoke-test-prod.js`
Manual or CI post-deploy check. Verifies the production URL responds, the bundle contains a full-length JWT, and the Supabase auth endpoint accepts the key.

```bash
PROD_URL=https://app.precificaiapp.com \
  EXPO_PUBLIC_SUPABASE_URL=... \
  EXPO_PUBLIC_SUPABASE_ANON_KEY=... \
  node scripts/smoke-test-prod.js
```

Wire into CI as the last step after `vercel --prod` so a broken deploy fails loudly instead of silently rotting in production for 26 days.

---

## Sentry — instalado e integrado ✅ (P0-01)

`@sentry/react-native` v7.2 está instalado e plugado no app via abstração
`src/utils/errorReporter.js`. Funcionamento:

- **DSN ausente** → todas as funções viram no-op (log em DEV apenas)
- **DSN setado em `.env`** → Sentry init + `wrap(App)` global + breadcrumbs auth + setUser pelo id opaco
- **DEV** → `enabled: false` (não polui o projeto Sentry com erros locais)
- **Prod** → `tracesSampleRate: 0.1`, `beforeSend` strip de headers/cookies sensíveis

### Para ativar em produção

1. Criar projeto no Sentry → copiar DSN
2. Setar variáveis no Vercel:
   ```
   EXPO_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/yyy
   EXPO_PUBLIC_ENV=production
   ```
3. (Opcional, recomendado) Source maps automáticos:
   - Adicionar `SENTRY_AUTH_TOKEN` no Vercel (token org-level, scope `project:write`)
   - Configurar `organization` e `project` no plugin do `app.config.js`:
     ```js
     plugins: [
       ['@sentry/react-native/expo', {
         organization: 'sua-org',
         project: 'precificai-app',
       }],
     ]
     ```
   - Build do Expo Web já gera source maps via `getSentryExpoConfig` no metro
4. Configurar alerta Sentry: **>1% de `auth/v1/token` em 4xx em 5min → notificar dono**
5. Configurar release tracking — passar `release` em `Sentry.init` baseado em `app.json` version

### API de uso (qualquer lugar do app)

```js
import { captureException, addBreadcrumb, setUser } from './src/utils/errorReporter';

try { ... } catch (err) {
  captureException(err, { screen: 'Login', action: 'signIn' });
  throw err;
}

addBreadcrumb({ category: 'navigation', message: 'tab change to Insumos' });
```
