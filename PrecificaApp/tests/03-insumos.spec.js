const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab, setupConsoleErrorCheck } = require('./helpers');

test.describe('Insumos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await goToTab(page, 'Insumos');
    await page.waitForTimeout(500);
  });

  test('shows search bar', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar por nome ou marca...')).toBeVisible();
  });

  test('shows Todos filter chip', async ({ page }) => {
    await expect(page.getByText('Todos').first()).toBeVisible();
  });

  test('search filters items', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Buscar por nome ou marca...');
    await searchInput.fill('Farinha');
    await page.waitForTimeout(500);
    const results = page.getByText('Farinha', { exact: false });
    expect(await results.count()).toBeGreaterThan(0);
  });

  test('no console errors', async ({ page }) => {
    const errors = setupConsoleErrorCheck(page);
    await page.waitForTimeout(2000);
    const critical = errors.filter(e => !e.includes('development-only') && !e.includes('Warning') && !e.includes('onStartShouldSetResponder'));
    expect(critical).toHaveLength(0);
  });
});
