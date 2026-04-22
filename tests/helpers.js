const { expect } = require('@playwright/test');

async function waitForAppLoad(page) {
  await page.waitForLoadState('networkidle');
  // Anchors estáveis pós-redesign: a Home mostra "Saúde da Precificação" ou
  // "Boa tarde/Bom dia/Boa noite"; o onboarding ainda usa "Configure seu app".
  // Timeout maior porque o primeiro hit no Expo Web compila lazily.
  await page.waitForSelector(
    'text=/Saúde da Precificação|Bom dia|Boa tarde|Boa noite|Configure seu app/',
    { timeout: 30000 }
  );
}

/**
 * Marca o WelcomeTour (audit P1-07) como já visto antes de carregar o app.
 * Deve ser chamado antes de page.goto() para evitar que o tour interativo
 * apareça e bloqueie os testes que esperam pela Home.
 */
async function skipWelcomeTour(page) {
  await page.addInitScript(() => {
    try { window.localStorage.setItem('welcome_tour_done', 'true'); } catch {}
  });
}

async function goToTab(page, tabName) {
  const tab = page.locator(`a[href*="${tabName}"]`);
  await tab.click();
  await page.waitForTimeout(800);
}

/**
 * Click a menu item in the Ferramentas screen by its title.
 * Uses the specific menu card structure to avoid ambiguity.
 */
async function clickFerramentaItem(page, title) {
  // Menu items have structure: icon circle > body > title text + desc
  // Use the exact title text within a clickable container
  const item = page.locator(`div:has(> div:has-text("${title}")) >> text="${title}"`).first();
  await item.click({ timeout: 5000 });
  await page.waitForTimeout(1500);
}

function setupConsoleErrorCheck(page) {
  const errors = [];
  page.on('console', msg => {
    if (msg.type() === 'error' && !msg.text().includes('Warning:')) {
      errors.push(msg.text());
    }
  });
  return errors;
}

function filterCriticalErrors(errors) {
  return errors.filter(e =>
    !e.includes('development-only') &&
    !e.includes('Warning') &&
    !e.includes('onStartShouldSetResponder') &&
    !e.includes('React.Fragment')
  );
}

module.exports = {
  waitForAppLoad,
  skipWelcomeTour,
  goToTab,
  clickFerramentaItem,
  setupConsoleErrorCheck,
  filterCriticalErrors,
};
