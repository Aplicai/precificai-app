#!/usr/bin/env node
/**
 * Validate critical environment variables at build time.
 * Prevents incidents like the 26-day "Invalid API key" outage caused
 * by a truncated EXPO_PUBLIC_SUPABASE_ANON_KEY on Vercel.
 *
 * Runs as `prebuild` hook (see package.json). Fails the build if any
 * required env var is missing, malformed, or suspiciously short.
 */

/* eslint-disable no-console */

// Load .env locally (Vercel injects vars directly, no .env file there).
try { require('dotenv').config(); } catch { /* dotenv unavailable in CI; ok */ }

const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const RESET = '\x1b[0m';

const errors = [];
const warnings = [];

function fail(msg) { errors.push(msg); }
function warn(msg) { warnings.push(msg); }

// --- EXPO_PUBLIC_SUPABASE_URL ---
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
if (!url) {
  fail('EXPO_PUBLIC_SUPABASE_URL is missing.');
} else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  fail(`EXPO_PUBLIC_SUPABASE_URL has an unexpected shape: "${url}". Expected "https://<ref>.supabase.co".`);
}

// --- EXPO_PUBLIC_SUPABASE_ANON_KEY ---
const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
if (!key) {
  fail('EXPO_PUBLIC_SUPABASE_ANON_KEY is missing.');
} else {
  // A valid Supabase JWT has 3 dot-separated base64url segments and is ~200+ chars.
  const parts = key.split('.');
  if (parts.length !== 3) {
    fail(`EXPO_PUBLIC_SUPABASE_ANON_KEY does not look like a JWT (expected 3 dot-separated segments, got ${parts.length}). Length=${key.length}.`);
  } else if (key.length < 150) {
    fail(`EXPO_PUBLIC_SUPABASE_ANON_KEY is suspiciously short (${key.length} chars). A valid Supabase anon JWT is typically 200+ chars. THE KEY MAY BE TRUNCATED — this caused a 26-day outage in Apr/2026.`);
  } else {
    // Try to decode the payload to confirm it's an anon key.
    try {
      const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
      if (payload.role && payload.role !== 'anon') {
        warn(`EXPO_PUBLIC_SUPABASE_ANON_KEY decoded role is "${payload.role}", expected "anon". Make sure you are NOT shipping a service_role key to the client.`);
      }
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        fail(`EXPO_PUBLIC_SUPABASE_ANON_KEY has expired (exp=${new Date(payload.exp * 1000).toISOString()}).`);
      }
    } catch {
      warn('Could not decode EXPO_PUBLIC_SUPABASE_ANON_KEY payload for sanity-check.');
    }
  }
}

// --- Output ---
console.log('');
console.log('🔍 Validating build-time environment variables...');
console.log('');

if (warnings.length > 0) {
  for (const w of warnings) console.log(`${YELLOW}⚠️  ${w}${RESET}`);
  console.log('');
}

if (errors.length > 0) {
  for (const e of errors) console.log(`${RED}❌ ${e}${RESET}`);
  console.log('');
  console.log(`${RED}Build aborted: ${errors.length} environment variable error(s).${RESET}`);
  console.log(`${RED}Fix on Vercel:  npx vercel env rm <NAME> <env> --yes && echo "$KEY" | npx vercel env add <NAME> <env>${RESET}`);
  console.log('');
  process.exit(1);
}

console.log(`${GREEN}✅ Environment looks healthy.${RESET}`);
console.log('');
