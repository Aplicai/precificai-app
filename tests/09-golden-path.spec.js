/**
 * 09 — Golden path (auditoria A8): insumo → preparo → produto → cascata de preço.
 *
 * Cenário (todos os registros com prefixo `E2E-`; limpeza no beforeAll e afterAll):
 *   1. Insumo  E2E-Farinha: 1000 g bruta / 1000 g líquida por R$ 5,00  → R$ 5,00/kg
 *   2. Preparo E2E-Massa: 500 g de farinha, rendimento 700 g            → custo R$ 2,50 (R$ 3,571/kg)
 *   3. Produto E2E-Bolo: 350 g de massa, 1 unidade, preço R$ 20         → custo 350/700 × 2,50 = R$ 1,25
 *   4. Farinha passa a R$ 10,00 (mesmos 1000 g)                          → custo do produto R$ 2,50
 *
 * Nota: o roteiro da auditoria pedia "custo ≈ 2,50 → 5,00" com 350 g de massa;
 * pela regra de rendimento (350 g de um preparo de 700 g = metade do lote) o
 * valor correto é 1,25 → 2,50. Os asserts abaixo seguem o domínio, não o roteiro.
 *
 * Seletores: texto/placeholder/aria-label. Ícones sem accessibilityLabel (FAB "+",
 * lixeira dos insumos) são localizados pelo glyph da fonte Feather, que o
 * @expo/vector-icons renderiza como texto no web.
 *
 * Achado A8 (test rot, não bug de app): Preparos e Produtos migraram do form
 * de tela cheia (PreparoFormScreen/ProdutoFormScreen) pra um modal único
 * compartilhado `EntityCreateModal` (nome, categoria, rendimento/venda,
 * busca+lista de itens com stepper de quantidade, resumo de custos, "Salvar").
 * Os passos 2 e 3 abaixo foram reescritos pra esse modal — placeholders,
 * labels e o texto do botão salvar ("Salvar", não mais "Salvar Preparo"/
 * "Salvar Produto") mudaram. Insumos continuam num form de tela cheia
 * separado (MateriaPrimaFormScreen) — passos 1 e 4 não precisaram mudar.
 */
const { test, expect } = require('@playwright/test');
const { waitForAppLoad, goToTab } = require('./helpers');
const glyphs = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Feather.json');

const ICON = { plus: String.fromCodePoint(glyphs.plus) };
// Sufixo único por execução: se um cleanup anterior falhar (rede/UI), o resíduo
// `E2E-Farinha` de outra rodada — que o passo 4 deixa a R$ 10,00/kg — não é
// escolhido no lugar do insumo recém-criado (flake que dava custo R$ 5,00).
const RUN = String(Date.now()).slice(-5);
const N = { farinha: `E2E-Farinha-${RUN}`, massa: `E2E-Massa-${RUN}`, bolo: `E2E-Bolo-${RUN}` };

// `retries: 1` — a cascata (passo 4) depende de recálculo assíncrono no
// servidor; sob carga (5 workers rodando as outras specs na MESMA conta) o
// primeiro assert pode chegar antes da propagação.
test.describe.configure({ mode: 'serial', retries: 1 });

// ───────────────────────────── helpers ─────────────────────────────

/**
 * Clica o FAB "+" (TouchableOpacity sem label no mobile): pega o glyph "plus"
 * mais próximo do canto inferior direito, DENTRO do viewport.
 *
 * Achado A8: a heurística original (score = box.x + box.y, sem filtrar por
 * viewport) pegava o "+" de "Nova Categoria" — que fica dentro de uma lista
 * horizontal de chips com scroll e começa fora da tela (x ~1550 num viewport
 * de 390px) — porque esse x gigante vencia o score mesmo com y pequeno.
 * Playwright rola o elemento pra dentro da view antes do .click(), então o
 * teste abria "Nova Categoria" em vez do form de insumo. Fix: descarta
 * candidatos fora do viewport antes de pontuar.
 */
async function clickFab(page) {
  const candidates = page.getByText(ICON.plus, { exact: true });
  await expect(candidates.first()).toBeVisible({ timeout: 10000 });
  const viewport = page.viewportSize();
  const n = await candidates.count();
  let best = null;
  let bestScore = -Infinity;
  for (let i = 0; i < n; i++) {
    const box = await candidates.nth(i).boundingBox();
    if (!box) continue;
    if (viewport && (box.x < 0 || box.y < 0 || box.x > viewport.width || box.y > viewport.height)) continue;
    const score = box.x + box.y;
    if (score > bestScore) { bestScore = score; best = candidates.nth(i); }
  }
  await best.click();
  await page.waitForTimeout(800);
}

/** InputField renderiza <Text label/> seguido do <input>; pega o input logo após o label. */
function inputAfterLabel(page, label) {
  return page.getByText(label, { exact: true }).first().locator('xpath=following::input[1]');
}

async function fillPlaceholder(page, placeholder, value) {
  const inp = page.getByPlaceholder(placeholder).first();
  await expect(inp).toBeVisible({ timeout: 10000 });
  await inp.fill(value);
}

/**
 * Achado A8: as tabs (Insumos/Preparos/Produtos) ficam montadas em segundo
 * plano — cada visita acumula mais um SearchBar oculto no DOM com valor
 * "preso" da última busca feita nele. Num spec serial de 4 passos que
 * revisita tabs, `.first()` pode resolver pra uma dessas instâncias ocultas
 * (`toBeVisible` falha). Filtra explicitamente por visível.
 */
async function search(page, term) {
  const inputs = page.getByPlaceholder(/Buscar/);
  // Poll até algum candidato ficar visível (não necessariamente o .first()) —
  // evita afirmar visibilidade de um índice específico antes de saber qual é.
  let target = null;
  await expect(async () => {
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      if (await inputs.nth(i).isVisible().catch(() => false)) { target = inputs.nth(i); return; }
    }
    throw new Error('nenhum campo "Buscar" visível ainda');
  }).toPass({ timeout: 10000 });
  await target.fill(term);
  await page.waitForTimeout(600);
}

/**
 * Container de uma célula do "Resumo de Custos" do EntityCreateModal
 * (label + valor no mesmo View, ex: "Custo total", "Custo unit. (CMV)").
 *
 * Usa `.last()`: a tela de fundo (PreparosScreen/ProdutosListScreen) continua
 * montada atrás do modal e o `ListStatsStrip` dela também mostra um stat
 * "Custo total" — `.first()` pegava esse, não o resumo do modal, que vem
 * depois no DOM.
 */
function resumoCell(page, labelRegex) {
  return page.getByText(labelRegex).last().locator('xpath=..');
}

/** Busca no picker "Adicionar" do EntityCreateModal (2º SearchBar "Buscar..." da tela — o 1º é o da lista de fundo). */
function modalSearch(page) {
  return page.getByPlaceholder('Buscar...').last();
}

/** Adiciona um item (insumo/preparo) pela busca do modal e ajusta a quantidade no stepper da linha. */
async function addItemAndSetQty(page, nome, qtd) {
  await modalSearch(page).fill(nome);
  await page.waitForTimeout(600);
  await page.getByLabel(`Adicionar ${nome}`, { exact: false }).first().click();
  await page.waitForTimeout(500);
  const qtdInput = page.getByText(nome, { exact: false }).last().locator('xpath=following::input[1]');
  await qtdInput.fill(String(qtd));
  await page.waitForTimeout(500);
}

async function confirmDeleteModal(page) {
  // ConfirmDeleteModal: accessibilityRole="button" + accessibilityLabel={confirmLabel} ('Excluir')
  const btn = page.locator('[aria-label="Excluir"]').last();
  await expect(btn).toBeVisible({ timeout: 5000 });
  await btn.click();
  // Exclusão é soft-delete com "Desfazer" (5 s). Fechar o contexto antes disso
  // perdia o commit e deixava resíduo E2E- na conta. Espera a janela passar.
  await page.waitForTimeout(6000);
}

/** Remove qualquer registro E2E- remanescente, na ordem produto → preparo → insumo. Tolerante a ausência. */
async function cleanupE2E(page) {
  await page.goto('/');
  await waitForAppLoad(page);

  // Produtos: card mobile tem aria-label="Excluir produto"
  await goToTab(page, 'Produtos');
  await search(page, 'E2E-');
  for (let i = 0; i < 5; i++) {
    const btn = page.locator('[aria-label="Excluir produto"]').first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await confirmDeleteModal(page);
  }

  // Preparos (tab "Receitas base"): aria-label="Excluir receita base"
  await goToTab(page, 'Preparos');
  await search(page, 'E2E-');
  for (let i = 0; i < 5; i++) {
    const btn = page.locator('[aria-label="Excluir receita base"]').first();
    if (!(await btn.isVisible().catch(() => false))) break;
    await btn.click();
    await confirmDeleteModal(page);
  }

  // Insumos: desktop grid tem aria-label="Excluir ingrediente"; fallback (mobile) abre o form.
  await goToTab(page, 'Insumos');
  await search(page, 'E2E-');
  for (let i = 0; i < 5; i++) {
    const btn = page.locator('[aria-label="Excluir ingrediente"]').first();
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await confirmDeleteModal(page);
      continue;
    }
    const row = page.getByText(/^E2E-/).first();
    if (!(await row.isVisible().catch(() => false))) break;
    await row.click();
    await page.waitForTimeout(800);
    const del = page.getByText('Excluir', { exact: true }).first();
    if (!(await del.isVisible().catch(() => false))) break;
    await del.click();
    await confirmDeleteModal(page);
    await page.waitForTimeout(500);
  }
}

// ───────────────────────────── setup / teardown ─────────────────────────────

test.beforeAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: './tests/storageState.json' });
  const page = await ctx.newPage();
  try { await cleanupE2E(page); } finally { await ctx.close(); }
});

test.afterAll(async ({ browser }) => {
  const ctx = await browser.newContext({ storageState: './tests/storageState.json' });
  const page = await ctx.newPage();
  try { await cleanupE2E(page); } finally { await ctx.close(); }
});

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await waitForAppLoad(page);
});

// ───────────────────────────── steps ─────────────────────────────

test('1. cria insumo E2E-Farinha a R$ 5,00/kg', async ({ page }) => {
  test.setTimeout(60000);
  await goToTab(page, 'Insumos');
  await clickFab(page);

  await fillPlaceholder(page, 'Ex: Farinha de trigo', N.farinha);
  // Unidade padrão do form é "g": 1000 g por R$ 5,00 ⇒ R$ 5,00/kg
  await fillPlaceholder(page, 'Ex: 1000 (use vírgula para decimais)', '1000');
  await fillPlaceholder(page, 'Ex: 800 (use vírgula para decimais)', '1000');
  await fillPlaceholder(page, 'Ex: 5,00 (total da nota por essa quantidade)', '5');
  await page.getByText('Salvar Ingrediente', { exact: true }).click();
  await page.waitForTimeout(1500);

  await search(page, N.farinha);
  await expect(page.getByText(N.farinha).first()).toBeVisible();
  // preço por kg exibido na lista
  await expect(page.getByText(/R\$\s?5,00/).first()).toBeVisible();
});

test('2. cria preparo E2E-Massa (500 g farinha, rendimento 700 g) com custo R$ 2,50', async ({ page }) => {
  test.setTimeout(60000);
  await goToTab(page, 'Preparos');
  await clickFab(page);

  // EntityCreateModal (modo preparo): nome, rendimento total (unidade padrão "g"), busca+add.
  await fillPlaceholder(page, 'Ex: Massa de pizza', N.massa);
  await fillPlaceholder(page, '0', '700'); // "Rendimento total" — único placeholder "0" antes de itens existirem

  await addItemAndSetQty(page, N.farinha, 500);

  // Custo total = 0,5 kg × R$ 5,00/kg
  await expect(resumoCell(page, 'Custo total')).toContainText('2,50');

  await page.getByLabel('Salvar', { exact: true }).click();
  await page.waitForTimeout(1500);

  await search(page, N.massa);
  await expect(page.getByText(N.massa).first()).toBeVisible();
});

test('3. cria produto E2E-Bolo (350 g massa, 1 un, R$ 20) com custo R$ 1,25', async ({ page }) => {
  test.setTimeout(60000);
  await goToTab(page, 'Produtos');
  await clickFab(page);

  // EntityCreateModal (modo produto): "Por unidade" já é o padrão; "Unidades
  // por receita" já vem com "1".
  await fillPlaceholder(page, 'Ex: Bolo de chocolate', N.bolo);

  await addItemAndSetQty(page, N.massa, 350);

  const preco = page.getByText('Preço de venda /un (R$)', { exact: true }).locator('xpath=following::input[1]');
  await preco.fill('20');
  await page.waitForTimeout(500);

  // 350 g de um preparo que custa R$ 2,50 / 700 g ⇒ R$ 1,25
  await expect(resumoCell(page, /Custo unit\. \(CMV\)/)).toContainText('1,25');

  await page.getByLabel('Salvar', { exact: true }).click();
  await page.waitForTimeout(1500);

  await search(page, N.bolo);
  await expect(page.getByText(N.bolo, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/CMV\s*R\$\s?1,25/).first()).toBeVisible();
});

test('4. farinha sobe para R$ 10,00/kg → custo do produto vira R$ 2,50 (cascata)', async ({ page }) => {
  test.setTimeout(90000);
  await goToTab(page, 'Insumos');
  await search(page, N.farinha);
  await page.getByText(N.farinha).first().click();
  await page.waitForTimeout(1000);

  await inputAfterLabel(page, 'Valor pago pela quantidade comprada (R$)').fill('10');
  // BUG DE APP encontrado por este teste (reportado na auditoria, ver a8-tests.md
  // §5): "Salvar e voltar" NÃO persiste o preço editado — ele só grava
  // historico_precos (MateriaPrimaFormScreen.js:1252-1291) e depende inteiramente
  // do autoSave debounced em 600ms (linha ~200-215) + um flush no unmount/blur
  // que não é confiável a tempo de goBackSafe() navegar. Clicar "Salvar e voltar"
  // logo após digitar (<600ms) navega de volta SEM salvar — sem nenhum erro
  // visível. Repro confirmado headless: type→wait 300ms→click Salvar e voltar→
  // preço volta a mostrar o valor antigo na lista. Aguardar aqui >600ms antes de
  // clicar é o workaround pro golden path continuar validando a CASCATA (não o
  // race do botão, que é o achado em si).
  await page.waitForTimeout(800);
  await page.getByText('Salvar e voltar', { exact: true }).click();
  await page.waitForTimeout(2000);

  // Lista de produtos: card mostra "CMV R$ x,xx" (custoTotal recalculado)
  await goToTab(page, 'Produtos');
  await search(page, N.bolo);
  await expect(page.getByText(N.bolo, { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/CMV\s*R\$\s?2,50/).first()).toBeVisible({ timeout: 15000 });

  // Reabre o produto (EntityCreateModal em modo edição): resumo "Custo unit.
  // (CMV)" também deve refletir a cascata. Não existe mais tela de "ficha
  // técnica" separada — editar reabre o mesmo modal usado pra criar.
  await page.getByText(N.bolo, { exact: true }).first().click();
  await page.waitForTimeout(1200);
  await expect(resumoCell(page, /Custo unit\. \(CMV\)/)).toContainText('2,50');
});
