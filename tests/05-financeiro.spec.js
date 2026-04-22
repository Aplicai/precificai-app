const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab, setupConsoleErrorCheck, filterCriticalErrors } = require('./helpers');

test.describe('Financeiro', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await goToTab(page, 'Ferramentas');
    await page.waitForTimeout(500);
    await page.getByText('Markup, despesas, faturamento').click();
    await page.waitForTimeout(1500);
  });

  test('loads Financeiro main view', async ({ page }) => {
    // ConfiguracaoScreen renderiza um stepper com KPI "Mark-up" no topo
    // (substituiu o título "Configuração Central" antigo).
    await expect(page.getByText('Mark-up').first()).toBeVisible();
  });

  test('shows markup panel', async ({ page }) => {
    await expect(page.getByText('Mark-up').first()).toBeVisible();
  });

  test('shows section headers', async ({ page }) => {
    // At least one section should be visible
    const sections = page.locator('text=/Margem de Lucro|Faturamento Mensal|Despesas Fixas|Despesas Variáveis/');
    expect(await sections.count()).toBeGreaterThanOrEqual(2);
  });

  test('has help tooltips', async ({ page }) => {
    const tooltips = page.locator('text="?"');
    expect(await tooltips.count()).toBeGreaterThan(0);
  });

  test('no critical console errors', async ({ page }) => {
    const errors = setupConsoleErrorCheck(page);
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });
});
