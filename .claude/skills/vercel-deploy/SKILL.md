---
name: vercel-deploy
description: Deploy do PrecificaApp Web na Vercel com workaround do `--prebuilt` cache stale. Use quando precisar publicar mudanças que NÃO foram propagadas via auto-deploy do GitHub (ex: rebuild forçado, sobrescrever bundle, deploy manual emergencial).
---

# Vercel Deploy — PrecificaApp Web

## Quando usar
- Auto-deploy do GitHub falhou ou não foi disparado
- Precisa publicar deploy manual emergencial fora do fluxo de commit
- `vercel deploy --prebuilt` está servindo bundle antigo apesar do source ter mudado (gotcha do cache stale)
- Mudou env var `EXPO_PUBLIC_*` na Vercel e precisa rebuildar pra refletir

## Pré-requisitos
- CWD = raiz do projeto (`PrecificaApp/`)
- `npx vercel whoami` funcionando (logado em `aplicais-projects`)
- Branch local sincronizada com `origin/master`

## Caminho FELIZ — auto-deploy via push
**Padrão para fluxo normal.** Push em `master` dispara deploy automático.

```bash
git push origin master
# Aguarde ~1min, então:
npx vercel ls | head -3   # confirma novo deploy "● Ready" no topo
curl -s https://app.precificaiapp.com/ | grep -oE 'index-[a-f0-9]+\.js'
```

Se o bundle hash mudou e o deploy está Ready → terminado.

## Caminho MANUAL — `--prebuilt` cache stale workaround
**Use apenas quando o auto-deploy serviu bundle stale.**

### Sintoma
`vercel deploy --prebuilt --prod` serve bundle antigo mesmo após `vercel build --prod` ter rodado.
Bundle hash IDÊNTICO ao deploy anterior, mesmo com source novo.

### Causa
`vercel build` reaproveita Metro/Babel cache em `.vercel/output/static/` quando o output dir já existe.

### Workaround verificado (2026-04-23)

```bash
# 1. Limpar caches
rm -rf dist .vercel/output

# 2. Build Expo Web fresco
npx expo export --platform web --clear

# 3. Build Vercel (cria .vercel/output/, pode ter bundle stale)
npx vercel build --prod

# 4. SOBRESCREVER static/ com dist fresco
rm -rf .vercel/output/static/_expo \
       .vercel/output/static/assets \
       .vercel/output/static/index.html \
       .vercel/output/static/metadata.json \
       .vercel/output/static/favicon.ico

cp -r dist/_expo dist/assets dist/index.html dist/favicon.ico dist/metadata.json \
      .vercel/output/static/

# 5. Deploy prebuilt
npx vercel deploy --prebuilt --prod --yes
# Captura URL do output, ex: https://precificai-XXXXXXXXX-aplicais-projects.vercel.app

# 6. Apontar aliases
npx vercel alias set <new-deploy-url> precificaiapp.com
npx vercel alias set <new-deploy-url> app.precificaiapp.com
```

### Validação obrigatória pós-deploy

```bash
# Bundle hash deve ser o NOVO (não o antigo)
curl -s https://precificaiapp.com/ | grep -oE 'index-[a-f0-9]+\.js'
curl -s https://app.precificaiapp.com/ | grep -oE 'index-[a-f0-9]+\.js'

# Confirmar status Ready
npx vercel ls | head -3
```

## Alternativa
`npx vercel deploy --prod` (sem `--prebuilt`) deixa Vercel buildar remoto — mais lento mas evita o gotcha.

## Drift entre apex e subdomínio
`precificaiapp.com` (apex/landing) e `app.precificaiapp.com` (app) podem servir bundles **diferentes** se você só atualizou um alias. Sempre confirme os DOIS curls retornam o mesmo hash após deploy completo.

## Env vars `EXPO_PUBLIC_*`
Inlined em **build time**. Mudou env? Rebuildar é obrigatório (não basta redeploy).

```bash
npx vercel env add EXPO_PUBLIC_SENTRY_DSN production
# Depois: rodar workflow manual acima OU push qualquer commit pra disparar auto-deploy
```

Se "Invalid API key" só em produção: verificar truncation da Supabase anon key (ver `.claude/projects/.../memory/project_vercel_supabase_key.md`).

## Histórico
- Sessão 17 (2026-04-23): gotcha `--prebuilt` cache stale descoberto e workaround consolidado
- Sessão 20 (2026-04-23): workaround aplicado com sucesso (deploy `mc2b1ofdt`, bundle `cbc3abd...`)
- Sessão 21 (2026-04-23): caminho feliz validado — push `da0d6b9` disparou auto-deploy `auv9y475k` em ~7 min sem necessidade do workaround manual
