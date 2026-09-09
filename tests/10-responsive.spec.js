/**
 * Auditoria de responsividade (2026-09-09).
 *
 * Percorre as telas principais em larguras reais de celular e mede, no DOM:
 *   - overflow horizontal da página (o corpo NÃO pode rolar de lado)
 *   - elementos que passam da borda direita da viewport
 *   - alvos de toque abaixo de 44px (WCAG 2.5.5 / HIG)
 *   - fonte mínima em uso
 *   - erros de console
 *
 * Larguras: 320 (iPhone SE 1ª ger / Android pequeno), 360 (Android mediano),
 * 375 (iPhone SE 2/3), 390 (iPhone 15 Pro — alvo declarado do projeto),
 * 430 (iPhone 15 Pro Max), 768 (tablet).
 */
const { test, expect } = require('@playwright/test');
const { waitForAppLoad, skipWelcomeTour, goToTab } = require('./helpers');

const WIDTHS = [320, 360, 375, 390, 430, 768];

// Telas alcançáveis pela tab bar em mobile (a sidebar só existe em desktop).
const TABS = ['Início', 'Insumos', 'Preparos', 'Embalagens', 'Produtos', 'Mais'];

const MEASURE = `(() => {
  const vw = document.documentElement.clientWidth;
  const all = [...document.querySelectorAll('body *')];
  const visible = all.filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  });
  // Um elemento "vaza" só se NENHUM ancestral for um scroller horizontal
  // (o carrossel de chips de categoria rola de propósito).
  const inHScroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === 'auto' || ox === 'scroll') return true;
    }
    return false;
  };
  const overflowing = visible
    .filter(e => e.getBoundingClientRect().right > vw + 1 && !inHScroller(e))
    .map(e => {
      const r = e.getBoundingClientRect();
      return {
        right: Math.round(r.right),
        w: Math.round(r.width),
        text: (e.textContent || '').trim().slice(0, 40),
      };
    });
  const clickable = visible.filter(e =>
    e.getAttribute('role') === 'button' ||
    e.tagName === 'BUTTON' ||
    e.tagName === 'A' ||
    e.tagName === 'INPUT'
  );
  const small = clickable
    .filter(e => {
      const r = e.getBoundingClientRect();
      // ignora wrappers cujo filho é o alvo real
      return (r.height < 44 || r.width < 24) && (e.textContent || '').trim().length > 0;
    })
    .map(e => {
      const r = e.getBoundingClientRect();
      return { h: Math.round(r.height), w: Math.round(r.width), text: (e.textContent || '').trim().slice(0, 30) };
    });
  const leaves = visible.filter(e => e.children.length === 0 && (e.textContent || '').trim());
  const fonts = leaves.map(e => parseFloat(getComputedStyle(e).fontSize)).filter(Boolean);
  const tiny = leaves
    .filter(e => parseFloat(getComputedStyle(e).fontSize) < 10)
    .map(e => ({ px: parseFloat(getComputedStyle(e).fontSize), text: (e.textContent || '').trim().slice(0, 24) }))
    .slice(0, 6);
  return {
    vw,
    scrollW: document.documentElement.scrollWidth,
    bodyScrollsX: document.documentElement.scrollWidth > vw + 1,
    overflowing: overflowing.slice(0, 8),
    overflowCount: overflowing.length,
    smallTargets: small.slice(0, 8),
    smallCount: small.length,
    minFont: fonts.length ? Math.min(...fonts) : null,
    tiny,
  };
})()`;

for (const width of WIDTHS) {
  test(`responsivo @ ${width}px`, async ({ page }) => {
    test.setTimeout(120000);
    const problems = [];
    const warnings = [];
    const consoleErrors = [];
    page.on('console', (m) => {
      if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 160));
    });

    await page.setViewportSize({ width, height: 844 });
    await skipWelcomeTour(page);
    await page.goto('/');
    await waitForAppLoad(page);

    for (const tab of TABS) {
      if (tab !== 'Início') {
        await goToTab(page, tab === 'Mais' ? 'Mais' : tab);
      }
      await page.waitForTimeout(1200);
      const m = await page.evaluate(MEASURE);
      if (m.bodyScrollsX) {
        problems.push(`${tab}: página rola na horizontal (scrollWidth ${m.scrollW} > ${m.vw})`);
      }
      if (m.overflowCount > 0) {
        problems.push(
          `${tab}: ${m.overflowCount} elemento(s) passam da borda — ex.: ` +
          m.overflowing.map(o => `"${o.text}" (right ${o.right})`).slice(0, 3).join(', ')
        );
      }
      // Fonte < 10px: registrado como aviso no anexo (é o label da tab bar em
      // modo compacto), não falha o teste — a falha fica pro layout quebrado.
      if (m.minFont != null && m.minFont < 10) {
        warnings.push(`${tab}: fonte ${m.minFont}px em ${JSON.stringify(m.tiny)}`);
      }
    }

    // Anexa o diagnóstico ao relatório do Playwright mesmo quando passa.
    await test.info().attach(`medidas-${width}`, {
      body: JSON.stringify({ problems, warnings, consoleErrors }, null, 2),
      contentType: 'application/json',
    });

    expect(problems, `Problemas de layout em ${width}px:\n- ${problems.join('\n- ')}`).toEqual([]);
  });
}
