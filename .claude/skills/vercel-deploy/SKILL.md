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

## Solução estrutural (Sessão 23.5, 2026-04-24)

`vercel.json` na raiz do projeto define `buildCommand` que **força limpeza de cache antes de cada build**:

```json
{
  "buildCommand": "rm -rf dist node_modules/.cache .expo && npx expo export --platform web --clear",
  "outputDirectory": "dist",
  "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }]
}
```

**Como cobre o gotcha cache stale:**
- `rm -rf dist node_modules/.cache .expo` → invalida Vercel runner cache + Metro transformer cache + Expo CLI state
- `npx expo export --platform web --clear` → flag `--clear` oficial do Expo CLI; força fresh transform
- Vale tanto para auto-deploy GitHub (Vercel lê `vercel.json` automaticamente) quanto para `vercel build` local

**Sinal de sucesso:** próximo push em master gera deploy com bundle hash NOVO sem precisar do workaround manual abaixo.

**Se falhar:** workaround manual da seção "Caminho MANUAL" continua válido como fallback.

### ⚠️ Limitação descoberta na validação (Sessão 23.5)

O `vercel.json` acima **NÃO resolve quando Vercel deduplica o build inteiramente**:
- `vercel inspect <deploy>` mostrou `Builds: . [0ms]` no auto-deploy do push `a4825c5`
- Significa que Vercel pulou o build pois detectou árvore Git "equivalente" a deploy anterior, e reusou o output cached
- Quando isso acontece, o `buildCommand` simplesmente **não roda** — `rm -rf` e `--clear` são irrelevantes

**Próximos passos a investigar (não implementados):**
1. Configurar projeto Vercel com `IGNORED_BUILD_STEP=false` ou similar via `vercel project pull` + edit + push
2. Adicionar arquivo `.vercelignore` minimalista para forçar Vercel a "ver" mudanças
3. Setar env var `VERCEL_FORCE_NO_BUILD_CACHE=1` (não-oficial, verificar se existe)
4. Configurar **Project Settings → Build & Development Settings → Build Cache** = OFF via dashboard ou API
5. Adicionar string única ao `index.html` (timestamp ou commit hash) via `expo` build hook para invalidar dedupe

Por ora, o `vercel.json` ajuda quando o build EFETIVAMENTE roda — só não força Vercel a rodar quando ele quer pular.

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

## Caminho MANUAL — cache stale workaround
**Use quando QUALQUER deploy (auto via GitHub OU manual `--prebuilt`) serviu bundle stale.**

### Sintoma
- Bundle hash IDÊNTICO ao deploy anterior, apesar de mudanças no source
- Aplica-se a `vercel deploy --prebuilt --prod` E ao auto-deploy do GitHub (confirmado Sessão 22, 2026-04-24: push de 1370L novas reusou bundle anterior)

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
- Sessão 22 (2026-04-24): **gotcha estendido** — auto-deploy GitHub também serviu bundle stale (push `44eccca` com 1370L novas → deploy `i9ltx64c0` reusou bundle `a0de8d61...`). Workaround manual aplicado, deploy `k5ik2sw7j` serviu bundle novo `8e6c45a6...`. Skill atualizada para cobrir ambos os caminhos
- Sessão 23 (2026-04-24): **3ª confirmação consecutiva** — push `3d6b01d` (Sprint 4, 1315L novas) → auto-deploy `g6us365v2` reusou bundle `a0de8d61...`. Workaround manual aplicado: deploy `drtd82ba8` serviu bundle novo `12afd6407...`. **Padrão estabelecido**: tratar cache stale como default expectation; sempre validar bundle hash live após push e aplicar workaround se idêntico ao anterior.
