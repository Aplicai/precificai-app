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
    // Labels atuais (renomeados após o redesign de KPIs):
    // "Margem Média"→"CMV Médio", "Custo Médio"→"Resultado Operacional",
    // "Lucro Estimado"→"Margem Líquida" / "Ponto de Equilíbrio".
    await expect(page.getByText('Saúde da Precificação')).toBeVisible();
    await expect(page.getByText('CMV Médio').first()).toBeVisible();
    await expect(page.getByText('Resultado Operacional').first()).toBeVisible();
    await expect(page.getByText('Margem Líquida').first()).toBeVisible();
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
