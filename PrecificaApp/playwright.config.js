const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  timeout: 30000,
  retries: 0,
  use: {
    baseURL: 'http://localhost:8083',
    headless: true,
    viewport: { width: 390, height: 844 }, // iPhone 15 Pro
    actionTimeout: 10000,
    navigationTimeout: 15000,
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
