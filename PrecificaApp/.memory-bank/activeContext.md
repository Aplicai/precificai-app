# Active Context

## Current State (2026-03-25)

### Completed: ProdutoFormScreen.js Bug Fixes & Refactoring
- Added `getTipoVenda` and `calcCustoPreparo` to imports from calculations.js
- Replaced inline tipoVenda logic (10 lines) with centralized `getTipoVenda(form)` call
- Fixed sidebar ingredient cost to use `calcCustoIngrediente()` (handles 'un' unit type)
- Fixed sidebar preparo cost to use `calcCustoPreparo()` (consistent with rest of codebase)

### Completed: Comprehensive Code Audit (All 6 Bugs Fixed)
- App running on port 8083 without console errors
- All 6 bugs found in audit have been fixed (see progress.md for details)

### Remaining Items Identified (NOT Fixed)
- **MatrizBCGScreen** margin format (0-100) vs other screens (0-1) -- cosmetic difference, not a bug
- **RelatorioSimplesScreen** uses different preco sugerido formula (custoUn / 0.30) -- intentional simplified view
- `getTipoVenda()` was dead code, now used by ProdutoFormScreen
- ~~Cost calculation still duplicated inline in ~7 other screens~~ **RESOLVED** — see refactoring below

### Completed: Full Centralized Cost Function Refactoring (2026-03-25)
- **ALL 15+ screens** now use centralized `calcCustoIngrediente` / `calcCustoPreparo` from `calculations.js`
- Zero remaining inline `/1000` patterns across the codebase
- Three parallel refactoring batches completed successfully:
  - **Batch 1:** ProdutosListScreen, VendasScreen, VendaDetalheScreen, MargemBaixaScreen, RelatorioSimplesScreen
  - **Batch 2:** MatrizBCGScreen, MetaVendasScreen, DeliveryHubScreen, SimuladorScreen, DeliveryScreen
  - **Batch 3:** DeliveryPrecosScreen, DeliveryProdutosScreen, DeliveryCombosScreen
  - **Manual:** ExportPDFScreen, ProdutoFormScreen, ConfiguracaoScreen

### Completed: ExportPDFScreen Enhancements (2026-03-25)
- New "Rendimento e Unidades" section added (Tipo de Venda, Rendimento, Peso Unitário, nº Unidades)
- All inline calcs refactored to centralized functions

### Completed: ConfiguracaoScreen Bug Fix (2026-03-25)
- `adicionarSugestaoVariavel` was saving percentual without `/100` — fixed

### Current App State
- App running on port 8083, zero console errors, all dashboard values stable
- User needs to re-export PDF to see corrected despesas variáveis percentage (was showing 0.18% due to old /100 bug)
