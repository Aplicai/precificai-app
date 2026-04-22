/**
 * Playwright globalSetup — autentica via Supabase HTTP API e grava o token no
 * storageState.json antes da suite rodar.
 *
 * Por que: o AppNavigator gata todo o app em `user`. Sem sessão Supabase no
 * localStorage, o app renderiza Register/Login e os 43 testes falham timeout
 * na Home. Esse setup loga uma vez (por suite) e injeta o token no estado
 * persistido que o Playwright carrega em todos os contexts.
 *
 * Credenciais de teste vêm de TEST_EMAIL/TEST_PASSWORD ou caem no default
 * do ambiente de dev (teste@teste.com.br / 123456).
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const TEST_EMAIL = process.env.TEST_EMAIL || 'teste@teste.com.br';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '123456';
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:8083';
const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

const STORAGE_STATE_PATH = path.resolve(__dirname, 'storageState.json');

function projectRefFromUrl(url) {
  // https://lwznqpxzmqptrpbifvka.supabase.co → lwznqpxzmqptrpbifvka
  const m = url.match(/^https?:\/\/([^.]+)\.supabase\.co/);
  if (!m) throw new Error(`Não consegui extrair project ref da URL: ${url}`);
  return m[1];
}

module.exports = async function globalSetup() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('[globalSetup] EXPO_PUBLIC_SUPABASE_* ausentes — pulando login. Tests vão falhar.');
    return;
  }

  const ref = projectRefFromUrl(SUPABASE_URL);
  const tokenUrl = `${SUPABASE_URL}/auth/v1/token?grant_type=password`;

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`[globalSetup] Falha no login Supabase (${res.status}): ${body}`);
  }

  const session = await res.json();
  // session: { access_token, refresh_token, expires_in, expires_at, token_type, user }

  // Formato esperado pelo @supabase/supabase-js v2 em localStorage:
  // chave: sb-<ref>-auth-token
  // valor: JSON.stringify(session) — o cliente lê o objeto inteiro
  const storageKey = `sb-${ref}-auth-token`;
  const storageValue = JSON.stringify(session);

  const origin = new URL(BASE_URL).origin;
  const state = {
    cookies: [],
    origins: [
      {
        origin,
        localStorage: [
          { name: storageKey, value: storageValue },
          // Pula o WelcomeTour (audit P1-07) para não bloquear assertions de Home.
          { name: 'welcome_tour_done', value: 'true' },
        ],
      },
    ],
  };

  fs.writeFileSync(STORAGE_STATE_PATH, JSON.stringify(state, null, 2));
  console.log(`[globalSetup] Login OK como ${TEST_EMAIL}, storageState gravado em ${STORAGE_STATE_PATH}`);
};
