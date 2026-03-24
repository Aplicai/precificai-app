const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab } = require('./helpers');

test.describe('All Screens Load Without Crash', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('Home loads', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Início' })).toBeVisible();
  });

  test('Insumos loads', async ({ page }) => {
    await goToTab(page, 'Insumos');
    await expect(page.getByRole('heading', { name: 'Insumos' })).toBeVisible();
  });

  test('Preparos loads', async ({ page }) => {
    await goToTab(page, 'Preparos');
    await expect(page.getByRole('heading', { name: 'Preparos' })).toBeVisible();
  });

  test('Embalagens loads', async ({ page }) => {
    await goToTab(page, 'Embalagens');
    await expect(page.getByRole('heading', { name: 'Embalagens' })).toBeVisible();
  });

  test('Produtos loads', async ({ page }) => {
    await goToTab(page, 'Produtos');
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
  });

  test('Ferramentas loads', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await expect(page.getByRole('heading', { name: 'Ferramentas' })).toBeVisible();
  });

  test('Financeiro loads via Ferramentas', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await page.getByText('Markup, despesas, faturamento').click();
    await page.waitForTimeout(1500);
    await expect(page.getByText('Configuração Central')).toBeVisible();
  });

  test('Delivery menu item exists in Ferramentas', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    // Verify Delivery option is visible (click limited by RN Web)
    await expect(page.getByText('Plataformas, preços e combos')).toBeVisible();
  });

  test('Matriz BCG loads via Ferramentas', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await page.getByText('Análise de portfólio').click();
    await page.waitForTimeout(1500);
    const content = page.locator('text=/Estrela|Preço de Venda|CMV/');
    await expect(content.first()).toBeVisible();
  });

  test('Configurações loads via Ferramentas', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await page.getByText('Ajustes e preferências').click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Perfil do Negócio')).toBeVisible();
  });
});
