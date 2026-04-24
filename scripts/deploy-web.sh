#!/usr/bin/env bash
#
# deploy-web.sh — build + deploy do app web pra Vercel produção
#
# Resolve o "Vercel cache stale" recorrente: `npx vercel deploy --prebuilt`
# usa `.vercel/output/static/` como fonte (NÃO `dist/`). Se você só roda
# `expo export` e depois `vercel --prebuilt`, o deploy sobe o bundle ANTIGO
# que ainda está em `.vercel/output/static/`.
#
# Este script:
#   1. Roda `expo export --platform web --clear` (gera `dist/` novo)
#   2. Limpa `.vercel/output/static/` dos artefatos antigos
#   3. Copia `dist/*` → `.vercel/output/static/`
#   4. Roda `vercel deploy --prebuilt --prod --yes` e captura a URL
#   5. Aliasa o novo deploy pros 2 domínios de prod
#   6. Smoke test: confere que ambos os domínios servem o NOVO bundle
#
# Uso: bash scripts/deploy-web.sh
#

set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> [1/6] Build web (expo export --clear)"
npx expo export --platform web --clear

# Captura o hash do bundle gerado (assumindo um único bundle index-*.js)
NEW_BUNDLE=$(ls dist/_expo/static/js/web/index-*.js 2>/dev/null | head -1 | xargs -I{} basename {})
if [ -z "$NEW_BUNDLE" ]; then
  echo "ERRO: bundle não encontrado em dist/_expo/static/js/web/" >&2
  exit 1
fi
echo "    bundle gerado: $NEW_BUNDLE"

echo "==> [2/6] Limpa .vercel/output/static/ (artefatos antigos)"
rm -rf \
  .vercel/output/static/_expo \
  .vercel/output/static/assets \
  .vercel/output/static/index.html \
  .vercel/output/static/favicon.ico \
  .vercel/output/static/metadata.json

echo "==> [3/6] Sincroniza dist/* → .vercel/output/static/"
cp -r dist/* .vercel/output/static/

# Verifica que a sincronização funcionou
SYNCED_BUNDLE=$(ls .vercel/output/static/_expo/static/js/web/index-*.js 2>/dev/null | head -1 | xargs -I{} basename {})
if [ "$SYNCED_BUNDLE" != "$NEW_BUNDLE" ]; then
  echo "ERRO: sync falhou. dist=$NEW_BUNDLE, .vercel=$SYNCED_BUNDLE" >&2
  exit 1
fi
echo "    .vercel/output/static/ contém: $SYNCED_BUNDLE"

echo "==> [4/6] Deploy --prebuilt --prod"
DEPLOY_OUTPUT=$(npx vercel deploy --prebuilt --prod --yes 2>&1)
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://precificai-[a-z0-9]+-aplicais-projects\.vercel\.app' | head -1)
if [ -z "$DEPLOY_URL" ]; then
  echo "ERRO: não consegui extrair URL do deploy" >&2
  echo "$DEPLOY_OUTPUT" >&2
  exit 1
fi
DEPLOY_HOST=$(echo "$DEPLOY_URL" | sed 's|https://||')
echo "    deploy: $DEPLOY_URL"

echo "==> [5/6] Alias pros domínios de prod"
npx vercel alias set "$DEPLOY_HOST" precificaiapp.com
npx vercel alias set "$DEPLOY_HOST" app.precificaiapp.com

echo "==> [6/6] Smoke test (curl com browser UA)"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
sleep 5  # leve para CDN propagar
PROD_BUNDLE=$(curl -s -A "$UA" "https://precificaiapp.com/?v=$(date +%s%N)" | grep -oE 'index-[a-f0-9]+\.js' | head -1)
APP_BUNDLE=$(curl -s -A "$UA" "https://app.precificaiapp.com/?v=$(date +%s%N)" | grep -oE 'index-[a-f0-9]+\.js' | head -1)
echo "    precificaiapp.com:     $PROD_BUNDLE"
echo "    app.precificaiapp.com: $APP_BUNDLE"
echo "    esperado:              $NEW_BUNDLE"

if [ "$PROD_BUNDLE" = "$NEW_BUNDLE" ] && [ "$APP_BUNDLE" = "$NEW_BUNDLE" ]; then
  echo ""
  echo "✅ Deploy completo. Bundle $NEW_BUNDLE servido em ambos os domínios."
else
  echo ""
  echo "⚠️  Deploy feito MAS smoke test não bate (CDN talvez ainda propagando)."
  echo "    Aguarde 1-2 min e recarregue manualmente."
  exit 2
fi
