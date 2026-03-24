const { test, expect } = require('@playwright/test');
const { waitForAppLoad, setupConsoleErrorCheck, filterCriticalErrors } = require('./helpers');

test.describe('Home / Visão Geral', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('loads Home screen with header', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible();
  });

  test('shows Saúde da Precificação KPIs', async ({ page }) => {
    await expect(page.getByText('Saúde da Precificação')).toBeVisible();
    await expect(page.getByText('Margem Média')).toBeVisible();
    await expect(page.getByText('Custo Médio').first()).toBeVisible();
    await expect(page.getByText('Lucro Estimado').first()).toBeVisible();
  });

  test('shows Ações Rápidas section', async ({ page }) => {
    await expect(page.getByText('Ações Rápidas')).toBeVisible();
  });

  test('all 6 bottom tabs exist as links', async ({ page }) => {
    for (const tab of ['In%C3%ADcio', 'Insumos', 'Preparos', 'Embalagens', 'Produtos', 'Ferramentas']) {
      const link = page.locator(`a[href*="${tab}"]`);
      expect(await link.count()).toBeGreaterThan(0);
    }
  });

  test('no critical console errors', async ({ page }) => {
    const errors = setupConsoleErrorCheck(page);
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });
});
