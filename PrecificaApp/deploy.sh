#!/bin/bash
# Deploy PrecificaApp to Vercel Production
# Usage: bash deploy.sh

set -e

echo "🔨 Building app..."
rm -rf dist/ .vercel/output/
npx expo export --platform web --clear

echo "📦 Preparing Vercel output..."
mkdir -p .vercel/output/static
cp -r dist/* .vercel/output/static/
cat > .vercel/output/config.json << 'EOF'
{
  "version": 3,
  "routes": [
    { "handle": "filesystem" },
    { "src": "/(.*)", "dest": "/index.html" }
  ]
}
EOF

echo "🚀 Deploying to production..."
npx vercel deploy --prebuilt --prod

echo "✅ Deploy complete!"
