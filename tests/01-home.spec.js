const { test, expect } = require('@playwright/test');
const { waitForAppLoad, setupConsoleErrorCheck, filterCriticalErrors } = require('./helpers');

test.describe('Home / Visão Geral', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('loads Home screen with header', async ({ page }) => {
    // HomeScreen usa custom header sem heading <h1>; o cumprimento "Boa tarde/Bom dia"
    // é o único anchor estável independente de hora do dia.
    await expect(page.getByText(/Bom dia|Boa tarde|Boa noite/)).toBeVisible();
  });

  test('shows Saúde da Precificação KPIs', async ({ page }) => {
    // Labels em português de balcão (UX audit 09/09): "CMV Médio"→"Custo dos
    // ingredientes", "Resultado Operacional"→"Sobra do mês",
    // "Margem Líquida"→"Quanto sobra por venda".
    await expect(page.getByText('Saúde da Precificação')).toBeVisible();
    await expect(page.getByText('Custo dos ingredientes').first()).toBeVisible();
    await expect(page.getByText('Sobra do mês').first()).toBeVisible();
    await expect(page.getByText('Quanto sobra por venda').first()).toBeVisible();
  });

  test('shows Ações Rápidas section', async ({ page }) => {
    await expect(page.getByText('Ações Rápidas')).toBeVisible();
  });

  test('all 6 bottom tabs exist as links', async ({ page }) => {
    for (const tab of ['In%C3%ADcio', 'Insumos', 'Preparos', 'Embalagens', 'Produtos', 'Mais']) {
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
