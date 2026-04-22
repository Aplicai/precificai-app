#!/usr/bin/env node
/**
 * Smoke-test production after deploy.
 * Run manually:  node scripts/smoke-test-prod.js
 * Or wire into CI to fail the deploy if production is broken.
 *
 * Checks:
 *   1. Production URL responds 200.
 *   2. The bundled JS contains a full-length Supabase anon key (not truncated).
 *   3. Supabase REST endpoint responds with a valid auth challenge.
 */

/* eslint-disable no-console */

const PROD_URL = process.env.PROD_URL || 'https://app.precificaiapp.com';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

let failed = 0;

async function step(name, fn) {
  process.stdout.write(`• ${name}... `);
  try {
    await fn();
    console.log(`${GREEN}OK${RESET}`);
  } catch (err) {
    console.log(`${RED}FAIL${RESET}\n   ${err.message}`);
    failed++;
  }
}

(async () => {
  console.log(`\n🔬 Smoke-testing ${PROD_URL}\n`);

  let html = '';

  await step('Production URL responds', async () => {
    const res = await fetch(PROD_URL);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    html = await res.text();
  });

  await step('HTML references the JS bundle', async () => {
    if (!/_expo\/static\/js\/web\/index-[a-z0-9]+\.js/i.test(html)) {
      throw new Error('Could not find expected bundle path in HTML.');
    }
  });

  await step('Bundled anon key is full-length (not truncated)', async () => {
    const match = html.match(/_expo\/static\/js\/web\/(index-[a-z0-9]+\.js)/i);
    if (!match) throw new Error('No bundle path found.');
    const bundleUrl = `${PROD_URL}/_expo/static/js/web/${match[1]}`;
    const bundle = await fetch(bundleUrl).then((r) => r.text());
    // Find any JWT-shaped string. A truncated Supabase anon key has only 1-2 segments
    // or is <150 chars; a valid one has 3 segments and 200+ chars.
    const jwts = bundle.match(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g) || [];
    const valid = jwts.find((t) => t.length >= 150);
    if (!valid) {
      throw new Error(`No full-length JWT found in bundle. Found ${jwts.length} JWT-like strings, longest ${jwts.reduce((m, t) => Math.max(m, t.length), 0)} chars. Anon key may be truncated.`);
    }
  });

  if (SUPABASE_URL && SUPABASE_KEY) {
    await step('Supabase auth endpoint accepts the anon key', async () => {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { 'apikey': SUPABASE_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'smoke-test@invalid.invalid', password: 'invalid' }),
      });
      // We expect 400 (invalid_grant) — that means the key is valid and the server processed the request.
      // 401 with "Invalid API key" means the key itself is bad.
      const body = await res.text();
      if (/invalid api key/i.test(body)) {
        throw new Error('Supabase rejected the anon key as invalid.');
      }
      if (res.status !== 400) {
        throw new Error(`Unexpected status ${res.status}: ${body.slice(0, 200)}`);
      }
    });
  }

  console.log('');
  if (failed > 0) {
    console.log(`${RED}❌ ${failed} smoke test(s) failed.${RESET}\n`);
    process.exit(1);
  }
  console.log(`${GREEN}✅ Production looks healthy.${RESET}\n`);
})();
