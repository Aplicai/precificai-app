#!/usr/bin/env node
/**
 * ensure-vercel-headers.js (SEC F-2)
 *
 * O deploy web usa `vercel deploy --prebuilt`, que lê `.vercel/output/config.json`
 * e IGNORA o `vercel.json`. Resultado: os headers de segurança/CSP definidos no
 * vercel.json NÃO chegavam à produção.
 *
 * Como `.vercel/` é gitignored, não dá pra versionar o config.json. Então este
 * script (versionado) GARANTE, de forma idempotente, que a rota de headers de
 * segurança esteja presente no config.json antes de cada deploy. Chamado pelo
 * scripts/deploy-web.sh.
 *
 * Mantenha a CSP em sync com `vercel.json` (fonte de referência humana).
 */
const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '..', '.vercel', 'output', 'config.json');

const SECURITY_HEADERS = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://browser.sentry-cdn.com",
    "connect-src 'self' https://*.supabase.co https://*.sentry.io wss://*.supabase.co",
    "img-src 'self' data: blob: https:",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "object-src 'none'",
  ].join('; ') + ';',
};

function main() {
  if (!fs.existsSync(CONFIG)) {
    console.error('[ensure-vercel-headers] config.json não encontrado em', CONFIG);
    process.exit(1);
  }
  const cfg = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  cfg.routes = Array.isArray(cfg.routes) ? cfg.routes : [];
  // Remove qualquer rota de headers anterior nossa (idempotência) e recoloca no topo.
  cfg.routes = cfg.routes.filter(
    (r) => !(r && r.headers && r.headers['Content-Security-Policy'])
  );
  cfg.routes.unshift({ src: '/(.*)', headers: SECURITY_HEADERS, continue: true });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n');
  console.log('[ensure-vercel-headers] headers de segurança garantidos no config.json');
}

main();
