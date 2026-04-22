const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab } = require('./helpers');

test.describe('Navigation - Tabs', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await waitForAppLoad(page);
  });

  test('navigate to Insumos tab', async ({ page }) => {
    await goToTab(page, 'Insumos');
    await expect(page.getByRole('heading', { name: 'Insumos' })).toBeVisible();
  });

  test('navigate to Preparos tab', async ({ page }) => {
    await goToTab(page, 'Preparos');
    await expect(page.getByRole('heading', { name: 'Preparos' })).toBeVisible();
  });

  test('navigate to Embalagens tab', async ({ page }) => {
    await goToTab(page, 'Embalagens');
    await expect(page.getByRole('heading', { name: 'Embalagens' })).toBeVisible();
  });

  test('navigate to Produtos tab', async ({ page }) => {
    await goToTab(page, 'Produtos');
    await expect(page.getByRole('heading', { name: 'Produtos' })).toBeVisible();
  });

  test('navigate to Ferramentas tab', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await expect(page.getByRole('heading', { name: 'Ferramentas' })).toBeVisible();
  });

  test('Ferramentas > Financeiro works', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await page.getByText('Markup, despesas, faturamento').click();
    await page.waitForTimeout(1500);
    // ConfiguracaoScreen renderiza um stepper com seções "Margem de Lucro",
    // "Faturamento Mensal", "Despesas Fixas", "Despesas Variáveis" — e o KPI
    // "Mark-up" no topo. Não existe mais o título "Configuração Central".
    await expect(page.getByText('Mark-up').first()).toBeVisible();
  });

  test('Ferramentas > Configurações works', async ({ page }) => {
    await goToTab(page, 'Ferramentas');
    await page.getByText('Ajustes e preferências').click();
    await page.waitForTimeout(1000);
    await expect(page.getByText('Perfil do Negócio')).toBeVisible();
  });

  test('cycle through all tabs', async ({ page }) => {
    for (const tab of ['Insumos', 'Preparos', 'Embalagens', 'Produtos', 'Ferramentas']) {
      await goToTab(page, tab);
      await expect(page.getByRole('heading', { name: tab })).toBeVisible();
    }
  });
});
