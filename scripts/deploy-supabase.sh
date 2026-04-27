#!/bin/bash
# scripts/deploy-supabase.sh
# Deploy Edge Functions (send-push + suggest-price + send-feedback-email)
# + apply pending migrations.
#
# Pré-requisitos:
#   1) Personal Access Token criado em:
#      https://supabase.com/dashboard/account/tokens
#      Exporte no shell:  export SUPABASE_ACCESS_TOKEN=sbp_xxx...
#
#   2) ANTHROPIC_API_KEY (apenas se for usar a função suggest-price):
#      Pegue em https://console.anthropic.com/settings/keys
#
#   3) RESEND_API_KEY (apenas para send-feedback-email):
#      Crie conta em https://resend.com (free 3000/mês), gere API key,
#      verifique domínio (ou use onboarding@resend.dev).
#
#   4) DB password (para aplicar migrations):
#      Encontre em https://supabase.com/dashboard/project/_/settings/database
#      Exporte:  export SUPABASE_DB_PASSWORD=xxx
#
# Uso:
#   bash scripts/deploy-supabase.sh
#   bash scripts/deploy-supabase.sh --with-anthropic sk-ant-xxx
#   bash scripts/deploy-supabase.sh --with-resend re_xxx --feedback-to suporte@precificaiapp.com
set -e

PROJECT_REF="lwznqpxzmqptrpbifvka"

if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  echo "❌ SUPABASE_ACCESS_TOKEN não definido."
  echo "   1. Crie em: https://supabase.com/dashboard/account/tokens"
  echo "   2. Rode: export SUPABASE_ACCESS_TOKEN=sbp_xxx..."
  exit 1
fi

ANTHROPIC_KEY=""
RESEND_KEY=""
FEEDBACK_TO="suporte@precificaiapp.com"
FEEDBACK_FROM="Precificaí <onboarding@resend.dev>"
while [ $# -gt 0 ]; do
  case "$1" in
    --with-anthropic) ANTHROPIC_KEY="$2"; shift 2;;
    --with-resend)    RESEND_KEY="$2"; shift 2;;
    --feedback-to)    FEEDBACK_TO="$2"; shift 2;;
    --feedback-from)  FEEDBACK_FROM="$2"; shift 2;;
    *) shift;;
  esac
done

cd "$(dirname "$0")/.."

echo "📦 Linkando projeto $PROJECT_REF..."
npx -y supabase link --project-ref "$PROJECT_REF" || true

# Aplica migrations pendentes (precisa SUPABASE_DB_PASSWORD)
if [ -n "$SUPABASE_DB_PASSWORD" ]; then
  echo ""
  echo "🗄️  Aplicando migrations pendentes (db push)..."
  npx -y supabase db push --password "$SUPABASE_DB_PASSWORD" || echo "⚠️  db push falhou — aplique manualmente no SQL Editor"
else
  echo ""
  echo "⚠️  SUPABASE_DB_PASSWORD não setado — pulando db push"
  echo "   Aplique manualmente: cole supabase/migrations/20260427000000_feedback.sql no SQL Editor"
fi

echo ""
echo "🚀 Deployando send-push..."
npx -y supabase functions deploy send-push --project-ref "$PROJECT_REF"

echo ""
echo "🚀 Deployando suggest-price..."
npx -y supabase functions deploy suggest-price --project-ref "$PROJECT_REF"

echo ""
echo "🚀 Deployando send-feedback-email..."
npx -y supabase functions deploy send-feedback-email --project-ref "$PROJECT_REF"

if [ -n "$ANTHROPIC_KEY" ]; then
  echo ""
  echo "🔐 Configurando ANTHROPIC_API_KEY como secret..."
  npx -y supabase secrets set "ANTHROPIC_API_KEY=$ANTHROPIC_KEY" --project-ref "$PROJECT_REF"
fi

if [ -n "$RESEND_KEY" ]; then
  echo ""
  echo "🔐 Configurando RESEND secrets..."
  npx -y supabase secrets set "RESEND_API_KEY=$RESEND_KEY" "FEEDBACK_TO_EMAIL=$FEEDBACK_TO" "FEEDBACK_FROM_EMAIL=$FEEDBACK_FROM" --project-ref "$PROJECT_REF"
fi

echo ""
echo "✅ Deploy concluído!"
echo "   send-push:           https://$PROJECT_REF.supabase.co/functions/v1/send-push"
echo "   suggest-price:       https://$PROJECT_REF.supabase.co/functions/v1/suggest-price"
echo "   send-feedback-email: https://$PROJECT_REF.supabase.co/functions/v1/send-feedback-email"
