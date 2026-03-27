# Progress

## Comprehensive Code Audit of ALL 16+ Screens: COMPLETE (2026-03-25)

### 6 Bugs Found and Fixed
1. **getDivisorRendimento regression** -- heuristic for legacy values
2. **SimuladorScreen** -- missing fields (unidade_rendimento, rendimento_total)
3. **SimuladorScreen** -- missing 'un' unit check
4. **ExportPDFScreen** -- missing 'un' unit check + totalVar/100 double-division bug
5. **DeliveryHubScreen** -- missing 'un' unit check
6. **DeliveryScreen** -- missing 'un' check for materia_prima

### 4 Refactoring Improvements in ProdutoFormScreen
1. `getTipoVenda` now used (was dead code)
2. Inline tipoVenda duplication eliminated
3. Sidebar ingredient cost uses `calcCustoIngrediente` (handles 'un')
4. Sidebar preparo cost uses `calcCustoPreparo` (consistent)

## Full Centralized Cost Function Refactoring: COMPLETE (2026-03-25)

### Scope
- **15+ screens** refactored to use `calcCustoIngrediente` / `calcCustoPreparo` from `calculations.js`
- Zero remaining inline `/1000` cost calculation patterns

### Batches
- **Batch 1:** ProdutosListScreen, VendasScreen, VendaDetalheScreen, MargemBaixaScreen, RelatorioSimplesScreen
- **Batch 2:** MatrizBCGScreen, MetaVendasScreen, DeliveryHubScreen, SimuladorScreen, DeliveryScreen
- **Batch 3:** DeliveryPrecosScreen, DeliveryProdutosScreen, DeliveryCombosScreen
- **Manual:** ExportPDFScreen, ProdutoFormScreen, ConfiguracaoScreen

### 2 Additional Bug Fixes (beyond original 6)
7. **ExportPDFScreen** -- all HTML inline calcs replaced with centralized functions
8. **ConfiguracaoScreen** -- `adicionarSugestaoVariavel` was saving percentual without `/100`, causing despesas variáveis to show as 0.18% instead of 18%

### New Feature
- **ExportPDFScreen** -- added "Rendimento e Unidades" section (Tipo de Venda, Rendimento, Peso Unitário, nº Unidades)

### Total Bug Count: 8
- 6 from original audit + 2 new (ExportPDFScreen inline calcs, ConfiguracaoScreen suggestion flow)

### Note
- User should re-export PDF to see corrected despesas variáveis percentage
