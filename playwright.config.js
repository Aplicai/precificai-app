const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  // globalSetup: loga no Supabase 1× via HTTP API e grava o token em
  // storageState.json. Sem isso o app cai no AuthNavigator e os testes
  // estoura timeout esperando pela Home.
  globalSetup: require.resolve('./tests/globalSetup.js'),
  use: {
    baseURL: 'http://localhost:8083',
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 15 Pro
    actionTimeout: 10000,
    // Bumped: o dev server do Expo Web faz lazy-compile na primeira navegação,
    // então a primeira goto() de cada worker pode estourar 15s.
    navigationTimeout: 30000,
    // Estado pré-autenticado + welcome_tour_done (audit P1-07) — preenchido
    // pelo globalSetup antes da primeira spec rodar.
    storageState: './tests/storageState.json',
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium' } },
  ],
  webServer: {
    command: 'npx expo start --web --port 8083',
    port: 8083,
    timeout: 60000,
    reuseExistingServer: true,
  },
});
