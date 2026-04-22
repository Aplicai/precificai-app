#!/bin/bash
# scripts/deploy-supabase.sh
# Deploy Edge Functions M1 (send-push + suggest-price) para o Supabase.
#
# Pré-requisitos:
#   1) Personal Access Token criado em:
#      https://supabase.com/dashboard/account/tokens
#      Exporte no shell:  export SUPABASE_ACCESS_TOKEN=sbp_xxx...
#
#   2) ANTHROPIC_API_KEY (apenas se for usar a função suggest-price):
#      Pegue em https://console.anthropic.com/settings/keys
#
# Uso:
#   bash scripts/deploy-supabase.sh
#   bash scripts/deploy-supabase.sh --with-anthropic sk-ant-xxx
set -e

PROJECT_REF="lwznqpxzmqptrpbifvka"

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ SUPABASE_ACCESS_TOKEN não definido."
  echo "   1. Crie em: https://supabase.com/dashboard/account/tokens"
  echo "   2. Rode: export SUPABASE_ACCESS_TOKEN=sbp_xxx..."
  exit 1
fi

ANTHROPIC_KEY=""
if [ "$1" = "--with-anthropic" ] && [ -n "$2" ]; then
  ANTHROPIC_KEY="$2"
fi

cd "$(dirname "$0")/.."

echo "📦 Linkando projeto $PROJECT_REF..."
npx -y supabase link --project-ref "$PROJECT_REF" || true

echo ""
echo "🚀 Deployando send-push..."
npx -y supabase functions deploy send-push --project-ref "$PROJECT_REF"

echo ""
echo "🚀 Deployando suggest-price..."
npx -y supabase functions deploy suggest-price --project-ref "$PROJECT_REF"

if [ -n "$ANTHROPIC_KEY" ]; then
  echo ""
  echo "🔐 Configurando ANTHROPIC_API_KEY como secret..."
  npx -y supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" --project-ref "$PROJECT_REF"
fi

echo ""
echo "✅ Deploy concluído!"
echo "   send-push:     https://$PROJECT_REF.supabase.co/functions/v1/send-push"
echo "   suggest-price: https://$PROJECT_REF.supabase.co/functions/v1/suggest-price"
