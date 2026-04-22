const { test, expect } = require('@playwright/test');

/**
 * WelcomeTour (audit P1-07) — tour de 4 slides mostrado a usuários autenticados
 * que ainda não viram o tour E ainda não completaram o onboarding.
 *
 * Para isolar o tour aqui usamos `addInitScript` para LIMPAR
 * `welcome_tour_done` e `onboarding_done` antes do app rodar — isso força o
 * `determineInitialRoute()` a devolver "WelcomeTour".
 *
 * O storageState carregado pelo Playwright já injeta a sessão Supabase
 * (via globalSetup), então o app entra autenticado direto no fluxo.
 */
test.describe('WelcomeTour (P1-07)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      try {
        window.localStorage.removeItem('welcome_tour_done');
        window.localStorage.removeItem('onboarding_done');
      } catch {}
    });
    await page.goto('/');
    // O tour não tem o anchor de Home, então não usamos waitForAppLoad.
    // Espera o título do primeiro slide aparecer.
    await page.waitForSelector('text=/Bem-vindo ao Precificaí/', { timeout: 30000 });
  });

  test('renders first slide with title and subtitle', async ({ page }) => {
    await expect(page.getByText('Bem-vindo ao Precificaí')).toBeVisible();
    await expect(page.getByText('Precifique com confiança')).toBeVisible();
  });

  test('shows skip button on first slide', async ({ page }) => {
    await expect(page.getByText('Pular')).toBeVisible();
  });

  test('shows Próximo CTA on first slide', async ({ page }) => {
    await expect(page.getByText('Próximo')).toBeVisible();
  });

  test('navigates through all 4 slides via dots', async ({ page }) => {
    // Slide 2 — fluxo
    await page.getByLabel('Ir para passo 2').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('Como funciona')).toBeVisible();

    // Slide 3 — preço
    await page.getByLabel('Ir para passo 3').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('Preço sugerido em segundos')).toBeVisible();

    // Slide 4 — margem
    await page.getByLabel('Ir para passo 4').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('Acompanhe sua margem')).toBeVisible();

    // No último slide, CTA muda para "Começar" e o "Pular" some
    await expect(page.getByText('Começar')).toBeVisible();
    await expect(page.getByText('Pular')).not.toBeVisible();
  });

  test('skip persists welcome_tour_done and exits tour', async ({ page }) => {
    await page.getByText('Pular').click();
    // Após sair do tour, espera ou o setup ou a Home aparecer
    await page.waitForSelector(
      'text=/Saúde da Precificação|Bom dia|Boa tarde|Boa noite|Configure seu app|Perfil do Negócio/',
      { timeout: 15000 }
    );
    const flag = await page.evaluate(() => window.localStorage.getItem('welcome_tour_done'));
    expect(flag).toBe('true');
  });
});
