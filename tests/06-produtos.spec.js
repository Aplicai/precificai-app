const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab, setupConsoleErrorCheck } = require('./helpers');

test.describe('Produtos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await goToTab(page, 'Produtos');
    await page.waitForTimeout(500);
  });

  test('shows search bar', async ({ page }) => {
    await expect(page.getByPlaceholder('Buscar produto...')).toBeVisible();
  });

  test('shows category chip', async ({ page }) => {
    // A barra "Combos" foi removida do ProdutosListScreen (combos viraram
    // recurso isolado em Delivery). Em vez disso checamos que pelo menos
    // uma categoria de produto aparece nos chips de filtro.
    const chips = page.locator('text=/Bolos|Brownies|Doces|Sobremesas|Tortas|Sem categoria/');
    expect(await chips.count()).toBeGreaterThan(0);
  });

  test('shows Todos filter', async ({ page }) => {
    await expect(page.getByText('Todos').first()).toBeVisible();
  });

  test('products show price info', async ({ page }) => {
    // Should show CMV or Venda info if products exist
    const priceInfo = page.locator('text=/CMV|Venda|R\\$/');
    expect(await priceInfo.count()).toBeGreaterThan(0);
  });

  test('no console errors', async ({ page }) => {
    const errors = setupConsoleErrorCheck(page);
    await page.waitForTimeout(2000);
    const critical = errors.filter(e => !e.includes('development-only') && !e.includes('Warning') && !e.includes('onStartShouldSetResponder'));
    expect(critical).toHaveLength(0);
  });
});
