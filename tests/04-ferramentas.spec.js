const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab, setupConsoleErrorCheck, filterCriticalErrors } = require('./helpers');

test.describe('Ferramentas & Sub-screens', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
    await goToTab(page, 'Ferramentas');
    await page.waitForTimeout(800);
  });

  test('shows Ferramentas heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Ferramentas' })).toBeVisible();
  });

  test('shows menu items with descriptions', async ({ page }) => {
    // Descrições atualizadas em MaisScreen — strings curtas e estáveis:
    await expect(page.getByText('Markup, despesas, faturamento').first()).toBeVisible();
    await expect(page.getByText('Ajustes e preferências do app')).toBeVisible();
    await expect(page.getByText('Veja quais produtos vendem mais')).toBeVisible();
  });

  test('Financeiro navigates correctly', async ({ page }) => {
    await page.getByText('Markup, despesas, faturamento').click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('Mark-up').first()).toBeVisible();
  });

  test('Delivery menu item is visible', async ({ page }) => {
    // Note: Delivery click doesn't work on web due to React Native Web TouchableOpacity limitation
    // Works correctly on mobile. Here we just verify the menu item exists.
    await expect(page.getByText('Plataformas, preços e combos').first()).toBeVisible();
  });

  test('Matriz BCG navigates correctly', async ({ page }) => {
    // "Análise de portfólio" foi reescrito como "Veja quais produtos vendem mais e dão mais lucro".
    await page.getByText('Veja quais produtos vendem mais').click();
    await page.waitForTimeout(1500);
    // O BCG abre como "Engenharia de Cardápio" com formulário "Vendas do mês".
    // Anchor estável que só existe nessa tela.
    await expect(page.getByText('Vendas do mês').first()).toBeVisible();
  });

  test('no console errors', async ({ page }) => {
    const errors = setupConsoleErrorCheck(page);
    await page.waitForTimeout(2000);
    expect(filterCriticalErrors(errors)).toHaveLength(0);
  });
});
