# WORKLOG — Precificaí

Memória operacional viva. Atualizar ao final de cada bloco de trabalho.

Status possíveis: `não iniciado` · `em análise` · `validado` · `com risco` · `implementado` · `bloqueado`

---

## Sessão atual (2026-04-22) — Auditoria de produto + fix do modal de Estoque

### Diagnóstico inicial

| # | Item | Status | Notas |
|---|------|--------|-------|
| 1 | Modal "modificar estoque" desalinhado | em análise | Bottom-sheet com `justifyContent: 'flex-end'` aplicado em todas plataformas. No desktop, dá impressão de "muito para baixo". |
| 2 | Função "Estoque" — descoberta | em análise | Mobile: enterrada em Mais → Operação. Desktop: ok via sidebar. Banner reativo no Home só aparece se houver alerta. |
| 3 | Auditoria sistemática de fluxos | não iniciado | Roadmap em fases: ver `Plano` abaixo. |

### Decisões da sessão

- **Estoque permanece como função.** Justificativa: cada entrada recalcula `custo_medio` ponderado, base direta do preço sugerido. Remover quebra a coerência da precificação.
- **Modal de ações sobre item de estoque vai virar dialog responsivo:** bottom-sheet no mobile (≤768 px), centered dialog no desktop (≥768 px), com max-width 480 e padding generoso.
- **Estoque ganha atalho explícito no HomeScreen** (não só banner reativo) — aumenta descoberta sem mexer na arquitetura de tabs.

### Implementado nesta sessão

- [x] Criados `CLAUDE.md`, `WORKLOG.md`, `MARKET_BENCHMARK.md`, `.claude/skills/product-audit/SKILL.md`
- [x] Fix modal de ações do EstoqueHubScreen (responsivo) — `modalOverlayDesktop` + `modalSheetDesktop` + handle só mobile
- [x] Atalho de Estoque no HomeScreen (quick-action proativo) — condicional a `totalInsumos > 0`
- [x] Atualização do memory bank (`activeContext.md` + `progress.md`)

### Próximos passos

1. Validar fix do modal em mobile + desktop (via Playwright ou smoke test manual)
2. Build + deploy quando o usuário decidir
3. **Fase 1** da auditoria sistemática — em andamento. Ordem: HomeScreen → Insumos → Produtos/Ficha → Vendas → Configuração

---

## Plano de auditoria contínua

### FASE 0 — Preparação ✅
- [x] Mapear estrutura do projeto (39 telas, ~30 componentes, RootStack + 6 tabs + MaisStack)
- [x] Criar arquivos de memória
- [x] Registrar plano de trabalho

### FASE 1 — Mapeamento do produto

| Fluxo | Status | Telas envolvidas |
|-------|--------|------------------|
| Login + recuperação | implementado (P0+P1+P2 fix) | LoginScreen, RegisterScreen, ForgotPasswordScreen |
| Onboarding | implementado (P0+P1+P2 fix) | WelcomeTour, ProfileSetup (Perfil), KitInicio, Onboarding, initialRoute |
| Dashboard | implementado (P1+P2 fix) | HomeScreen + banners |
| Insumos | implementado (P1+P2 fix) | MateriasPrimas, MateriaPrimaForm |
| Embalagens | implementado (P0+P1 fix) | Embalagens, EmbalagemForm |
| Preparos | implementado (P0+P1 fix) | Preparos, PreparoForm |
| Produtos / Ficha técnica | implementado (P0+P1 fix) | ProdutosList, ProdutoForm, SuggestPriceModal |
| Estoque | implementado (P0+P1 fix) | EstoqueHub, EntradaEstoque, AjusteEstoque |
| Vendas | implementado (P1+P2 fix) | Vendas, VendaDetalhe, MetaVendas |
| Configuração financeira | implementado (P0+P1 fix) | Configuracao (4 etapas), Configuracoes |
| Análise | implementado (P0+P1 fix) | MatrizBCG, Simulador, RelatorioSimples, MargemBaixa |
| Delivery | implementado (P0+P1 fix) | DeliveryHub, Delivery, DeliveryProdutos, DeliveryCombos, DeliveryPrecos, DeliveryPlataformas, DeliveryAdicionais |
| Operação auxiliar | implementado (P0+P1 fix) | AtualizarPrecos, ListaCompras, Fornecedores, ExportPDF |
| Conta / Ajuda | implementado (P0+P1 fix) | Notificacoes, Suporte, ContaSeguranca, Sobre |

### FASE 2 — Validação fluxo a fluxo
Para cada fluxo executar checklist da skill `product-audit`.

### FASE 3 — Implementação orientada a usabilidade
Aplicar melhorias incrementais. Registrar aqui.

### FASE 4 — Priorização (backlog vivo)

| Tier | Critério | Backlog inicial |
|------|----------|-----------------|
| P0 — bloqueia uso | crash, perda de dado, segurança crítica | ~~SuggestPriceModal R$ NaN~~, ~~ConfiguracaoScreen "Infinityx"~~, ~~salvarFaturamentoMedio 0 silent~~, ~~EmbalagensScreen loadData silent + N+1 removerCategoria~~, ~~PreparosScreen loadData silent~~, ~~PreparoForm autoSave silent + N+1 ingredientes~~, ~~EstoqueHub status só por cor (daltonismo)~~, ~~EntradaEstoque carga silent~~, ~~AjusteEstoque sem confirmação + sem alerta saldo negativo~~, ~~MargemBaixa silent catch + division-by-zero~~, ~~RelatorioSimples silent catch + parseFloat unsafe~~, ~~Simulador silent catch + Infinity em margemDisponivel~~, ~~MatrizBCG silent loadData + parseFloat unsafe~~, ~~Login spinner infinito sem timeout + validação genérica~~, ~~Register expõe min length da senha (anti-enumeração)~~, ~~Onboarding modal "configuração concluída" reaparece toda visita~~, ~~KitInicio expõe `${e.message}` técnico ao usuário~~, ~~Perfil loadPerfil + autoSave silent (perda de dados sem feedback)~~ — todos implementados |
| P1 — atrito alto | erro frequente, fluxo confuso, tempo de tarefa alto | ~~Estoque modal centering~~, ~~Estoque proatividade Home~~, ~~HomeScreen CMV/Margem persist + erro silent~~, ~~Insumos loadData silent~~, ~~MateriaPrimaForm autoSave silent~~, ~~ConfiguracaoScreen loadData silent + parseFloat\|\|0~~, ~~ConfiguracoesScreen versão hardcoded + export sem confirmação~~, ~~EmbalagemForm autoSave silent + parseFloat\|\|0~~, ~~PreparoForm parseFloat\|\|0 + modal NaN~~, ~~Embalagens/Preparos filtroCategoria não persistido~~, ~~EstoqueHub filtros não persistidos~~, ~~EntradaEstoque sem validação inline + typo "um embalagem"~~, ~~AjusteEstoque sem console.error + typo~~, ~~MargemBaixa texto "10%" hardcoded vs config 15% + badge só por cor~~, ~~Simulador sem UX inviável quando custos≥100%~~, ~~MatrizBCG filtros não persistidos + class badge só por cor~~, ~~Login/Register/Forgot errorBox sem borderLeft (daltonismo) + btn enabled durante rate-limit + erro não limpa ao digitar~~, ~~Forgot sem timeout~~, ~~Onboarding silent loadStatus + sem ActivityIndicator inicial + line-through prejudica baixa visão~~, ~~KitInicio segmento não persiste~~, ~~Perfil botão Continuar disabled silent (sem feedback)~~, ~~initialRoute fallback `MainTabs` em qualquer falha (mostra app vazio)~~ — todos implementados |
| P2 — quick win | melhoria fácil de alto retorno | (a popular após Fase 2) |
| P3 — diferenciação | oportunidade vs mercado | (ver MARKET_BENCHMARK.md) |

---

---

## Auditoria — Fase 1 — Delivery (2026-04-23)

### Escopo: 7 telas (Hub + Delivery + DeliveryProdutos + DeliveryCombos + DeliveryPrecos + DeliveryPlataformas + DeliveryAdicionais)

**Total: ~50 findings consolidados.** Cluster crítico de bugs de **precificação**: divisão por zero quando taxa ≥ 100% (gerava `Infinity` na sugestão de preço delivery), `parseFloat || 0` aceitando strings inválidas como `0` silenciosamente, NaN/Infinity propagando para margens/lucros nas tabelas, e SQL injection via field name dinâmico em `UPDATE delivery_config SET ${field}=?`. P1 crítico de UX: ausência de feedback de erro (todos catches eram silent), Switches sem accessibility props, filtros não persistidos.

### Padrão consolidado da casa (helpers + states)

```js
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}
function parseInputNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim().replace(',', '.');
  if (str === '') return null;
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}
// estados: loadError, saveError, isLoadingRef, saveErrorTimerRef
// helper: showSaveError(msg) com setTimeout 4000
```

### DeliveryPrecosScreen.js — fixes
- `safeNum` + `parseInputNumber` + `usePersistedState` para `searchText` e `customPrices`
- `loadData` com try/catch/finally + race-guard (`isLoadingRef`)
- `calcDeliveryPrice` reescrito: retorna `null` quando `taxa ≥ 100` ou divisor inviável; `Number.isFinite` em todos os pontos
- `summaryStats` rastreia `inviaveis` (count de plataformas com taxa ≥ 100)
- Banner de inviabilidade na linha (`accessibilityRole="alert"`) + banner global de loadError com botão retry
- Render de plataforma exibe `—` em vez de NaN quando inviável
- Styles: `errorBanner` (borderLeft 3px #dc2626 — colorblind-accessible) + `inviavelBanner`

### DeliveryScreen.js — fixes
- `PLAT_NUMERIC_FIELDS` whitelist (defesa contra **SQL injection** via field name)
- `loadData` + `updatePlatform` + `adicionarPlataforma` com try/catch + console.error + showSaveError
- `updatePlatform` valida campo permitido + `safeNum(value) >= 0` (impede valores negativos)
- `adicionarPlataforma` faz dedupe case-insensitive
- `calcDeliveryPrice` retorna `null` quando inviável (taxa ≥ 100 ou divisor inválido)
- Switch ganhou `accessibilityRole="switch"` + `accessibilityLabel` + `accessibilityState={{ checked }}`
- Tabela renderiza `—` em vez de NaN para plataformas inviáveis
- Banner de erro de carregamento + banner de saveError

### DeliveryProdutosScreen.js — fixes
- `safeNum` + `parseInputNumber` + `usePersistedState` para `buscaItem`
- `loadData` + `salvarProdutoDelivery` + `removerProdutoDelivery` com try/catch + console.error + showSaveError
- `atualizarQtdItemProduto` rejeita valores ≤ 0 ou inválidos (fallback para 1)
- Render usa `safeNum(dp.preco_venda)` / `safeNum(dp.custo)`; margem badge ganhou `accessibilityRole="text"` + label
- Botão delete com `accessibilityLabel`
- Banner de loadError com retry + banner de saveError

### DeliveryCombosScreen.js — fixes
- `safeNum` + `parseInputNumber` + `usePersistedState` para `busca`
- `loadData` com try/catch/finally + race-guard
- `parseInputValue` reescrito (rejeita negativos, retorna 0 em parse inválido)
- 3 silent catches em `autoSave` / `autoSaveImmediate` / `saveBackBtn` ganharam `console.error('[DeliveryCombosScreen.method]', e)` + `showSaveError`
- `salvarNovo` / `removerCombo` / `duplicarCombo` / `handleDeleteAndExit` com try/catch + console.error
- `alterarQuantidadeItem` rejeita 0/negativo (fallback 1); custos com `safeNum` no breakdown
- `renderComboCard` / `renderDesktopGridCard` margens guardadas com `safeNum`
- Botões delete (mobile + grid) com `accessibilityLabel`
- Banner de loadError com retry + banner de saveError

### DeliveryPlataformasScreen.js — fixes
- `PLAT_NUMERIC_FIELDS` whitelist (SQL injection) + `PLAT_PERCENT_FIELDS` (cap 0–100)
- `safeNum` + `parseInputNumber`
- `loadData` com try/catch/finally + race-guard
- `updatePlatform` valida whitelist + cap em percent fields
- `adicionarPlataforma` dedupe case-insensitive
- `removerPlataforma` envelopado em try/catch
- `parseInputValue(text, { percent })` cap 100 quando percent
- Switch com `accessibilityRole="switch"` + label + state; InputFields com `accessibilityLabel` contextual
- Botões "Adicionar" e "Remover" com `accessibilityLabel`
- Render de taxa_plataforma com `safeNum`
- Banner de loadError com retry + banner de saveError

### DeliveryAdicionaisScreen.js — fixes
- `safeNum` + `parseInputNumber` + states de erro
- `loadData` com try/catch/finally + race-guard
- `adicionarAdicional` dedupe case-insensitive + try/catch
- `removerAdicional` / `salvarEdicao` envelopados em try/catch + console.error
- `parseInputValue` rejeita negativos
- Render usa `safeNum(add.custo)` / `safeNum(add.preco_cobrado)`; bloco lucro+margem com `accessibilityRole="text"` + label
- Botões delete e add com `accessibilityLabel`
- Banner de loadError com retry + banner de saveError

### Validação
- Todos os 7 arquivos validados via `@babel/parser` (`{sourceType:'module',plugins:['jsx']}`) — **OK**

### P0/P1 fechados (Delivery)
- ~~Divisão por zero em `calcDeliveryPrice` quando `taxa ≥ 100`~~ → retorna `null` + banner de inviabilidade
- ~~NaN/Infinity propagando para margens nas tabelas e cards~~ → `safeNum` em todos os pontos de render
- ~~`parseFloat(text) || 0` aceitando "abc" como 0 silenciosamente~~ → `parseInputNumber` retorna null
- ~~SQL injection via `UPDATE delivery_config SET ${field}=?`~~ → whitelist `PLAT_NUMERIC_FIELDS`
- ~~3 silent catches em DeliveryCombosScreen autoSave + 1 em saveBackBtn~~ → console.error + showSaveError
- ~~Falta de race-guard em loadData (re-entrância em focus rápido)~~ → `isLoadingRef`
- ~~Switches de Plataforma sem accessibility props~~ → role + label + state
- ~~Filtros (busca de combos, busca de itens, search de preços) não persistidos~~ → `usePersistedState`
- ~~Sem feedback de erro em todas as telas~~ → banners loadError/saveError com `accessibilityLiveRegion="polite"`
- ~~Adicionar plataforma/adicional aceitava nome duplicado~~ → dedupe case-insensitive
- ~~Percent fields aceitavam > 100~~ → cap em parseInputValue + validação em updatePlatform

### Não implementado (backlog Fase 2/3)
- P2: Modal "Inviabilidade" detalhado com dicas (renegociar taxa, embutir custo, não vender no canal)
- P2: Indicador visual de qual plataforma é mais lucrativa por produto
- P3: Comparativo visual canal próprio vs delivery (potencial de margem)

---

## Auditoria — Fase 1 — Conta/Ajuda (2026-04-23)

### Subagents (4 paralelos): NotificacoesScreen, SuporteScreen, ContaSegurancaScreen, SobreScreen

**Total: ~30 findings consolidados.** ContaSegurancaScreen carregava 3 P0 de **segurança** (silent catch em delete loop, exposição de mensagens de auth do Supabase no Alert, senhas em RAM sem cleanup).

### NotificacoesScreen.js — fixes
- `useState`/`useRef` adicionados: `loadError`, `saveError`, `activating`, `isLoadingRef`
- `carregar` ganhou try/catch + console.error + loadError + race-guard
- `toggle` agora awaitado: optimistic update + rollback em caso de erro + saveError com auto-clear 4s
- `ativarPush` envelopado em try/catch + flag `activating` (evita double-tap, mostra ActivityIndicator)
- Banner clicável de loadError + banner de saveError (`accessibilityLiveRegion="polite"`)
- `accessibilityRole="switch"` + `accessibilityState={{ checked }}` no Item; `accessibilityRole="header"` em sectionTitle
- Botão "Ativar notificações" com `disabled`/`busy` state + label contextual
- Styles: `errorBanner` + `errorBannerText` (padrão da casa)

### SuporteScreen.js — fixes
- Helper `openExternal(url, onError)` com `Linking.canOpenURL` + try/catch + console.error
- `searchText` migrado para `usePersistedState('suporte.busca')`
- `linkError` state + banner com `accessibilityLiveRegion="polite"`
- `accessibilityRole="link"` + `accessibilityLabel` em todos os botões de contato (mailto/website)
- `accessibilityRole="button"` + `accessibilityState={{ expanded }}` nos itens FAQ
- `accessibilityLabel` no TextInput de busca + botão de limpar
- Key do `map` mudada de `index` para `item.question` (estável a reordenações)

### ContaSegurancaScreen.js — fixes (P0 segurança)
- **Helper `mapAuthError(rawMsg)`** mapeia mensagens cruas do Supabase → textos amigáveis (rate-limit, e-mail inválido, e-mail em uso, senha fraca, network, credencial inválida). **Não expõe mais `err.message` cru** que poderia vazar detalhes/stack.
- `console.error('[ContaSegurancaScreen.X]', err)` em todos os 3 catches (handleUpdateEmail, handleUpdatePassword, excluirConta)
- **Silent catch em loop de delete** (linha 138) agora loga + acumula `failedTables[]` + warning final
- **Senhas em RAM cleanup**: `useEffect` com cleanup função limpa `currentPass`/`newPass`/`confirmPass` no unmount + ao trocar de seção (security)
- `isValidEmail` regex robusto substituindo `.includes('@')` simplista
- Novo state `showConfirmPass` separado do `showNewPass` (UX consistente)
- Eye toggles com `accessibilityRole="button"` + `accessibilityState={{ checked }}`
- Botão "Excluir minha conta" com `accessibilityRole="button"` + `accessibilityHint`
- Modal exclusão: hint de erro inline ("Digite exatamente EXCLUIR em letras maiúsculas") + accessibility nos botões Cancelar/Excluir + `busy` state
- Style `deleteModalHintError` (vermelho)

### SobreScreen.js — fixes
- `VERSION = Constants?.expoConfig?.version || '2.0.0'` (antes hard-coded)
- Helper `openExternal` (mesmo padrão SuporteScreen) + `linkError` banner
- `accessibilityRole="link"` + `accessibilityLabel` em todos os 4 link rows
- Novo card "Termos e privacidade" com 2 links (Termos de Uso, Política de Privacidade) — placeholder URLs (`/termos`, `/privacidade`)
- `activeOpacity={0.6}` para feedback tátil
- Styles: `errorBanner` + `errorBannerText`

### Validação

`@babel/parser` sintaxe OK em todos os 4 arquivos.

### Decisões duradouras adicionadas

- **`mapAuthError(rawMsg)`** padrão para mapear erros de auth: nunca expor `err.message` cru ao usuário (security leak de detalhes Supabase)
- **`openExternal(url, onError)`** helper de Linking com `canOpenURL` + try/catch + onError callback (banner amigável)
- **Cleanup de senhas em RAM**: `useEffect(() => () => { setPass(''); }, [])` no unmount de telas que manipulam credenciais
- **`isValidEmail` regex** robusto vs `.includes('@')` simplista
- **VERSION via `Constants.expoConfig.version`** — nunca hardcode

---

## Auditoria — Fase 1 — HomeScreen (2026-04-22)

### Diagnóstico (skill product-audit, 15 perguntas)

**Pontos fortes:**
- Hierarquia visual clara: greeting → status card com CTA → featured insight → KPIs → resumo → ações → análises
- Estados vazios bem cobertos (Kit de Início, step-by-step guide para usuário sem dados)
- KPIs com tooltip educativo e benchmark colorido (verde/amarelo/vermelho)
- `maxWidth: 960` no content + `isDesktop` em kpiRow → responsividade ok
- Microcopy aspiracional ("Operação saudável", "Veja como está sua precificação")

**Pontos fracos identificados:**

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | Modal CMV Meta — "Aplicar" não persistia, só fechava (silencioso) | P1 | implementado |
| 2 | Modal Margem Meta — sem validação de range (>100% / <0% quebra cálculos) | P2 | implementado |
| 3 | `loadAll()` com `catch { /* silencioso */ }` — usuário via tudo zerado se DB quebrasse | P1 | implementado |
| 4 | Resultado Operacional e Ponto de Equilíbrio sem onPress (CMV/Margem têm) | P2 | adiar (drill-down separado) |
| 5 | Loader de texto em vez de Skeleton (padrão Linear/Notion já usado em outras telas) | P3 | adiar (M2) |
| 6 | Termos técnicos ("CMV", "Resultado Operacional") sem glossário — só tooltip | P3 | adiar (já tem InfoTooltip) |

### Implementado nesta sessão

- `src/screens/HomeScreen.js`:
  - Import `AsyncStorage` + constantes `PREF_CMV_META` (`@pref:cmv_meta_pct`) e `PREF_MARGEM_META` (`@pref:margem_meta_pct`) seguindo o padrão `@pref:listDensity`
  - Helper `clampMeta(v)` valida range 5-95% e retorna string normalizada (ou null se NaN)
  - `useEffect` hidrata metas persistidas no mount (sobrevive a reload)
  - `state loadError` + banner vermelho com botão "Tentar de novo" (reaproveita `loadAll()`)
  - Modal CMV Meta agora persiste em AsyncStorage no Aplicar (era no-op antes)
  - Modal Margem Meta clamp + persiste em AsyncStorage **e** em `configuracao.lucro_desejado` (regra de negócio compartilhada com Financeiro)
  - Logs de erro via `console.error` com prefixo `[HomeScreen.xxx]` para facilitar debug em produção

### Decisão de produto duradoura

**Metas configuráveis no Home (CMV target, Margem target) usam AsyncStorage com prefixo `@pref:`** — são preferências de UI por device, não regra de negócio que precisa estar no SQLite/Supabase. Margem é exceção: espelha em `configuracao.lucro_desejado` porque o motor de precificação consome.

Pattern para futuras prefs do tipo: criar constante `@pref:nome` + helper de clamp/validação + hidratar via `useEffect` + persistir no save explícito (não onChange — evita writes excessivos).

### Pendente

- Validar visualmente: abrir CMV Meta, mudar pra 25, fechar/abrir app, verificar se valor permanece
- Forçar erro em loadAll (ex: drop tabela em sandbox) e validar banner

---

## Auditoria — Fase 1 — Insumos (MateriasPrimas + MateriaPrimaForm) (2026-04-23)

### Diagnóstico (skill product-audit, 15 perguntas)

**Pontos fortes:**
- SectionList agrupada por categoria, com chip de filtro horizontal + busca + sort persistido + view-mode (list/grid) + densidade global
- Bulk operations completas: mover, duplicar, reajustar (% e R$), favoritar, exportar CSV, excluir em massa (já usam `WHERE id IN (?)` ✅)
- Soft-delete com UndoToast (P1-11) — 5s para desfazer
- Highlight de termo de busca + InfoToast contextual
- Form com auto-save (600ms debounce), histórico de preços, fator de correção calculado, suporte a múltiplas unidades (peso/volume/un)
- Margin erosion warning quando preço afeta produtos com margem < 10%

**Pontos fracos identificados:**

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `MateriasPrimasScreen.loadData()` sem try/catch — falha de DB ficava silenciosa, usuário via lista vazia | P1 | implementado |
| 2 | `MateriaPrimaForm.autoSave()` catch silencioso — `setSaveStatus(null)` faz parecer que nada foi salvo, mas não sinaliza erro real | P1 | implementado |
| 3 | `removerCategoria` faz N+1 UPDATE (loop por item) em vez de single bulk UPDATE | P2 | implementado |
| 4 | Margin erosion check roda em TODO auto-save (a cada 600ms), com N+1 queries por produto afetado — caro em produtos populares | P2 | implementado (throttle 5s) |
| 5 | `loadCategorias` no Form só roda no mount — categoria adicionada em outra tela não aparece sem reload | P3 | adiar (interaction baixa) |
| 6 | Bulk `duplicarEmMassa`/`favoritarEmMassa`/`reajustarEmMassa` usam `Promise.all` de UPDATEs individuais — funcional mas 5-50× mais lento que single UPDATE em N itens | P3 | adiar (batch <100 itens é aceitável; melhorar quando perf real for problema) |

### Implementado nesta sessão

**`src/screens/MateriasPrimasScreen.js`:**
- Novo `state loadError` + try/catch/finally em `loadData()` com `console.error('[MateriasPrimasScreen.loadData]', e)`
- Banner vermelho com botão "Tentar de novo" (chama `loadData()` direto) — entre headerBar e botão "Novo Insumo"
- `removerCategoria` agora roda single `UPDATE materias_primas SET categoria_id = NULL WHERE categoria_id = ?` (era loop) + try/catch com InfoToast em caso de erro
- Estilos `errorBanner*` adicionados ao StyleSheet

**`src/screens/MateriaPrimaFormScreen.js`:**
- Novo `lastMarginCheckRef` + constante `MARGIN_CHECK_MIN_INTERVAL_MS = 5000` — margin erosion check roda no máximo 1× a cada 5s
- `autoSave()` catch agora chama `setSaveStatus('error')` (SaveStatus já tem ícone x-circle "Erro ao salvar") + `console.error('[MateriaPrimaForm.autoSave]', e)`
- Catch interno do margin check também loga em `console.error('[MateriaPrimaForm.marginCheck]', e)`

### Decisões de produto duradouras

- **Pattern de error banner em telas de listagem com `loadX`:** sempre `setLoadError(null)` no início, `setLoadError(msg)` no catch, banner com "Tentar de novo" reaproveitando o próprio loader. Aplicado em HomeScreen e MateriasPrimasScreen — replicar nas próximas (Produtos, Vendas, etc).
- **Auto-save NUNCA com catch silencioso.** Se houver `SaveStatus`, sempre setar `'error'`. Sem isso, usuário pensa que dado salvou e perde edições.
- **Operações caras em background (margin check, recompute de matriz BCG, reagregação financeira) precisam de throttle por ref + intervalo mínimo** — não rodar a cada keystroke do auto-save (600ms).

### Pendente

- Validar visualmente: editar insumo no form, verificar que SaveStatus mostra "Erro ao salvar" quando DB indisponível
- Validar visualmente: forçar erro no loadData (drop tabela em sandbox) e ver banner vermelho
- Avaliar P3 (bulks como single UPDATE) na próxima rodada quando houver dado real de perf

---

## Auditoria — Fase 1 — Produtos/Ficha técnica (2026-04-23)

### Diagnóstico (skill product-audit, 15 perguntas — auditoria paralela em 3 subagents)

**ProdutosListScreen.js** (1234 linhas)
- Pontos fortes: SectionList agrupada, EmptyState contextual (busca vazia vs lista vazia), bulk ops com cascade delete correto (join tables → entidade), soft-delete via UndoToast, semáforo de margem (verde/amarelo/vermelho) com background.
- Atritos: `loadData` sem try/catch (P1), `removerCategoria/moverEmMassa` com erro silencioso e loop N+1 (P1+P2), reajuste em massa não avisa quando preço fica abaixo do CMV (P1, risco real de operação no prejuízo sem perceber), grid desktop sem skeleton entre loading e renderização (P2), fontSize 9px em itemLucroLabel quebra WCAG AA (P3).

**ProdutoFormScreen.js** (1960 linhas)
- Pontos fortes: separação clara auto-save (edição, debounce 600ms) vs salvar manual (novo + relacionamentos), sidebar sticky com resumo de custos no desktop, fórmula de markup visível ao usuário, intercept de saída quando form incompleto, reuso dos helpers `calcCustoIngrediente/Preparo`.
- Atritos: 4 catches silenciosos (P1) — autoSave (linha 498), histórico load (linha 277), pre-duplicate autoSave (linha 1218), insertHistorico (linha 1478), deleteHistorico (linha 1431). Recálculo de custo em todo render sem useMemo (P2). Sem aviso explícito quando preço < CMV (margem negativa) (P2). Acessibilidade dos botões ✕ (P3).

**SuggestPriceModal.js** (320 linhas)
- Pontos fortes: 3 estados (loading/error/result) com UI diferenciada, CTA principal "Aplicar X" + secundário "Psicológico" claros, retry no error, footer educativo "você decide o preço final".
- Atritos: zero validação para `preco_sugerido = NaN/Infinity` quando despesas+margem ≥ 100% (P0! mostrava "R$ NaN" sem explicação), ausência de breakdown de composição (P1), sem comparação com preço atual (P1).

### Implementado nesta sessão

**`src/components/SuggestPriceModal.js`:**
- Helper `isResultValid(result)` — bloqueia render do card de preço se `preco_sugerido` não é finito ou ≤ 0; mostra error box específico ("Verifique despesas/margem/configuração")
- Helper `PriceDelta` — exibe diferença vs preço atual (% + absoluto, seta ↑/↓ colorida) quando `result.preco_atual` está disponível
- Nova seção "Composição" — mostra Custo (CMV), Despesas variáveis, Despesas fixas, Margem alvo (em % ou R$ conforme o campo). Só renderiza se houver `custo_unitario > 0`.
- Estilos `breakdownRow/breakdownLabel/breakdownValue` adicionados

**`src/screens/ProdutosListScreen.js`:**
- `state loadError` + try/catch/finally em `loadData()` + `console.error('[ProdutosListScreen.loadData]', e)`
- Banner vermelho "Tentar de novo" entre `FinanceiroPendenteBanner` e botão "Novo Produto"
- `removerCategoria` agora roda single `UPDATE produtos SET categoria_id = NULL WHERE categoria_id = ?` + try/catch com InfoToast em erro
- `moverEmMassa` envolto em try/catch + InfoToast em erro
- `reajustarEmMassa` envolto em try/catch + tracking de produtos que ficariam abaixo do CMV — toast diferenciado: "X reajustado (+5%) — 3 ficou abaixo do custo" com ícone `alert-triangle`
- Estilos `errorBanner*` adicionados

**`src/screens/ProdutoFormScreen.js`:**
- `autoSave()` catch agora chama `setSaveStatus('error')` (era `setSaveStatus(null)`) + `console.error('[ProdutoForm.autoSave]', e)`
- 4 catches silenciosos restantes ganharam log via `console.error` com prefixo identificável: `[ProdutoForm.loadHistorico]`, `[ProdutoForm.preDuplicate.autoSave]`, `[ProdutoForm.deleteHistorico]`, `[ProdutoForm.insertHistorico]`

### Decisões duradouras registradas

- **Preço sugerido inválido nunca pode ser exibido como `NaN`/`Infinity`.** O motor de cálculo deve sinalizar invalidez (margem+despesas ≥ 100%, sem ingredientes, configuração financeira incompleta) e o modal mostrar erro educativo apontando o que ajustar — não um número quebrado.
- **Reajustes em massa devem alertar quando geram margens negativas** sem bloquear (operador pode estar fazendo promoção consciente). Toast diferenciado com contagem.
- **Catch silencioso é dívida técnica.** Mesmo quando o erro é "tolerável" (histórico nice-to-have), logar com prefixo `[Tela.acao]` permite debug em produção via Sentry.
- **N+1 UPDATE em loop nunca.** Sempre tentar single bulk `WHERE id IN (...)` ou `WHERE foreign_key = ?`.

### Pendente

- Validar visualmente: SuggestPriceModal com produto sem ingredientes → ver mensagem em vez de NaN
- Validar visualmente: reajustar em massa 5 produtos com -50% → ver toast "X ficou abaixo do custo"
- Validar visualmente: desconectar DB e abrir lista → banner vermelho aparece
- P2 adiados (próxima rodada se houver dado real de perf): useMemo nos cálculos de custo do ProdutoForm; throttle de recálculo de preço sugerido; bulks de duplicar/favoritar via single UPDATE

---

## Auditoria — Fase 1 — Vendas (VendasScreen + VendaDetalheScreen + MetaVendasScreen) (2026-04-23)

### Diagnóstico (skill product-audit, 15 perguntas — auditoria paralela em 3 subagents)

**VendasScreen.js** (445 linhas)
- Pontos fortes: KPIs (Total, Faturamento, Lucro, Ticket Médio) com cores semânticas, seletor de mês horizontal scroll, sort inteligente (mais vendidos primeiro, sem-vendas no rodapé), barra de volume relativo, Promise.all para queries paralelas, opacity/badge para produtos sem venda, EmptyState com CTA "Ir para Produtos".
- Atritos: `loadData` com catch silencioso (linha 134), filtro de mês não persistido (perde ao trocar tela), sem `loadError` banner (P1), cálculos de custo sem guarda contra NaN/divisor 0 (P1), `Math.max(...produtos.map…)` quebra com array vazio (P3, mas tem fallback `, 1`), sort instável em empates (P3), refresh control só mobile sem fallback web (P3).

**VendaDetalheScreen.js** (499 linhas)
- Pontos fortes: card de produto com KPIs do mês corrente, formulário de registro com validação básica, Promise sequencial controlado, baixa de estoque integrada com rollback explícito de venda, `usePushPermissions.askIfNotAsked('first_sale')` como earned moment, ConfirmDeleteModal centralizado, tabela com zebra striping.
- Atritos: `loadData` com catch silencioso (linha 105), validação de quantidade não checa NaN (`parseFloat('abc')` ≤ 0 é falso pois NaN ≤ 0 também é false, mas `!quantidade` salva o caso vazio), validação de data sem regex (length<10 não cobre formato malformado), divisor de rendimento sem fallback se `getDivisorRendimento` retorna 0, sem `useFocusEffect` para reload em retorno de edição (já tem useEffect com mesAtual mas perde edits feitas em outra tela).

**MetaVendasScreen.js** (484 linhas)
- Pontos fortes: fórmula clara `Faturamento = (Fixos + Lucro) / (1 - CMV% - Var%)`, decomposição visual do cálculo (CMV − Var − Fix = Lucro), botões rápidos (3k/5k/8k/10k), info card aspiracional, EmptyState contextual.
- Atritos: `loadData` com catch silencioso (linha 68-71), `parseFloat(valor) || 0` falha em valores como `0.5` (truthy ok mas a expressão `parseFloat('abc') || 0` funciona; o caso real é falta de checagem `Number.isFinite`), sem persistência da meta digitada (perde ao trocar tela), indicação de erro/sucesso só por cor (acessibilidade — daltonismo), sem `loadError` banner (P1).

### Implementado nesta sessão

**`src/screens/VendasScreen.js`:**
- Helper `safeNum(v)` — garante valor finito ≥ 0 nos somatórios (despesas, vendas, custos, embalagens)
- `mesAtual` migrou para `usePersistedState('vendas.mesAtual', meses[0].key)` — persiste filtro entre sessões
- Variável derivada `mesValido` com fallback ao mês mais recente quando o mês persistido sai da janela de 6 meses (rollover de mês)
- `state loadError` + try/catch/finally em `loadData()` + `console.error('[VendasScreen.loadData]', e)`
- Banner vermelho "Tentar de novo" (chama `loadData()` direto) entre seletor de mês e FlatList
- `getDivisorRendimento(p) || 1` — fallback para evitar divisão por zero
- Estilos `errorBanner*` adicionados

**`src/screens/VendaDetalheScreen.js`:**
- `loadData()` catch agora loga `console.error('[VendaDetalheScreen.loadData]', e)`
- Divisor de rendimento com fallback `|| 1` + clamp final do custoUnitario via `Number.isFinite`
- `registrarVenda()` validação reforçada: `qtdNum` calculado uma vez no topo, checagem `Number.isFinite(qtdNum) && qtdNum > 0`, regex `^\d{4}-\d{2}-\d{2}$` para data
- Reuso de `qtdNum` no INSERT (era reparseado dentro do try)

**`src/screens/MetaVendasScreen.js`:**
- Constante `PREF_META_LUCRO = '@pref:metaLucroMensal'`
- `useEffect` hidrata meta persistida no mount; segundo `useEffect` recalcula sempre que `cmvMedioPercent/totalVarDecimal/custoFixoMensal` mudam (evita inconsistência quando dados base chegam depois da meta)
- `loadData()` agora seta `loadError=true` no catch + `console.error('[MetaVendasScreen.loadData]', e)`
- `calcular()` usa `Number.isFinite` em todas as etapas (lucro, margem disponível, faturamento) — evita propagação silenciosa de NaN
- `persistMeta()` helper salva no AsyncStorage em todo onChange/quickValue
- Banner de erro com `Feather alert-triangle` + "Tentar de novo"
- Decomposição do cálculo ganhou ícones (`minus-circle` em itens de dedução, `check-circle` no lucro líquido) — não depende só de cor verde/vermelho (acessibilidade daltonismo)
- Estilos `errorBanner*` adicionados

### Decisões duradouras registradas

- **Filtros de mês/período em telas recorrentes (Vendas, Relatórios) devem ser persistidos via `usePersistedState`** — é fricção lembrar qual mês estava selecionado a cada navegação. Sempre validar se o valor persistido ainda é válido na janela atual (rollover de mês).
- **Cálculos financeiros com somatórios, divisões e composição (`x / (1 - y - z)`) devem usar `Number.isFinite` em CADA etapa** — propagar NaN quebra a UI sem sinal de erro. Helper `safeNum` ou clamp explícito é o mínimo.
- **Acessibilidade visual: nunca depender só de cor para diferenciar status.** Sempre adicionar ícone, prefixo (−/+), badge ou texto explícito. Daltonismo (vermelho/verde) é o caso mais comum, mas vale para qualquer indicador.
- **Validação de input de data: regex em vez de `length < 10`** — `2026-1-1` tem 10 chars com hífens mas é inválido pra `Date.parse` confiável.
- **Validação numérica: `Number.isFinite(parseFloat(...))` em vez de `parseFloat(...) || 0`** — o segundo aceita NaN como 0 silencioso, o primeiro permite ramo de erro explícito.

### Pendente

- Validar visualmente: trocar mês em VendasScreen → fechar app → reabrir → mês permanece
- Validar visualmente: digitar `abc` em quantidade da VendaDetalhe → ver alerta "quantidade válida"
- Validar visualmente: digitar 5000 em meta → fechar app → reabrir → meta permanece + cálculo refeito
- Forçar erro nos loadData (drop tabela em sandbox) → ver banner vermelho nas 3 telas
- P2 adiados: useFocusEffect adicional em VendaDetalheScreen para reload em retorno de edição; sort estável em empates de VendasScreen; refresh control fallback web

---

## Auditoria — Fase 1 — Configuração financeira (2026-04-23)

### Diagnóstico (skill product-audit, 15 perguntas) — 2 arquivos auditados

#### `src/screens/ConfiguracaoScreen.js` (1626 linhas — onboarding 4-etapas)

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `markup.toFixed(2)x` exibia `"Infinityx"` quando `(despFix + despVar + lucro) ≥ 100%` | P0 | implementado |
| 2 | `salvarFaturamentoMedio(0)` aceito sem alerta (zera cálculo de % despesas fixas) | P0 | implementado |
| 3 | `loadData()` sem try/catch — falha de DB deixa tela vazia silenciosa | P1 | implementado |
| 4 | `parseFloat(x) \|\| 0` em totais (NaN vira 0 silencioso) | P1 | implementado |
| 5 | KPI card e markupPreview duplicavam render do mesmo `markup.toFixed(2)x` | P2 | implementado (refator p/ `markupDisplay`) |
| 6 | Sem feedback visual quando "modelo financeiro inviável" (despesas+lucro ≥ 100%) | P1 | implementado (banner inviabilidade) |

#### `src/screens/ConfiguracoesScreen.js` (276 linhas — hub configurações)

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `exportBackup()` catch silencioso + sem log estruturado | P1 | implementado |
| 2 | Versão hardcoded `'1.0.0'` — dessincroniza com `app.json` | P1 | implementado (Constants.expoConfig.version) |
| 3 | Sem confirmação antes de exportar (clique acidental gera arquivo grande) | P1 | implementado (Alert dois botões) |
| 4 | Tabelas faltantes durante export não rastreadas/avisadas | P2 | implementado (warn por tabela) |
| 5 | Sem hitSlop nas rows (acessibilidade toque) | P2 | implementado |

### Implementado nesta sessão

**`src/screens/ConfiguracaoScreen.js`:**
- Helper `parseNum(str)` retorna NaN (não 0) — habilita `Number.isFinite` checks
- Import `useNavigation` adicionado
- `loadError` state + try/catch/finally em `loadData()` + `console.error('[ConfiguracaoScreen.loadData]', e)`
- Helper `showError(msg)` para errors user-facing
- `salvarFaturamentoMedio` valida `Number.isFinite && > 0` + Alert + try/catch
- Cadeia derivada: `custoBruto = 1 - despFixasPerc - totalVariaveis - lucroPerc`; `modeloInviavel = custoBruto <= 0`; `markupValido = Number.isFinite(markup) && markup > 0`; `markupDisplay = markupValido ? '${markup.toFixed(2)}x' : '∞'`
- Substituição de 2 ocorrências `markup.toFixed(2)x` → `markupDisplay`
- Banner inviabilidade dentro do SummaryPanel quando `modeloInviavel === true`
- Banner "Tentar de novo" no topo do ScrollView quando `loadError`
- Estilos `inviabilityBanner`, `inviabilityText`, `errorBanner*` adicionados

**`src/screens/ConfiguracoesScreen.js`:**
- Import `Constants` + `APP_VERSION` dinâmico
- `pedirConfirmacaoExport()` Alert antes de chamar `exportBackup`
- Tracking de `tabelasFaltantes` + console.warn por tabela ausente + console.error no catch geral
- `hitSlop` em todas TouchableOpacity de rows
- `disabled` opacity feedback

### Decisões de produto duradouras

- **Cálculos `1 - (x+y+z)` no denominador SEMPRE com guarda `<= 0`** para detectar modelo inviável — nunca exibir "Infinity"/NaN ao usuário. Usar `'∞'` como placeholder + banner explicativo apontando o que ajustar.
- **Substituir `parseFloat(x) || 0` por `parseNum(x)` que retorna NaN** + `Number.isFinite` no consumidor. Permite distinguir 0 legítimo de input vazio/inválido.
- **Versão do app SEMPRE via `Constants?.expoConfig?.version`** — nunca hardcoded (dessincroniza com `app.json` toda atualização).
- **Operações de export/backup SEMPRE com confirmação prévia** (Alert dois botões). Evita clique acidental gerando arquivo grande.
- **Catch por tabela em loops de export/import** — ausência de tabela é informativa (warn), não fatal (error).

### Pendente

- Validar visualmente: setar despesas variáveis 50% + fixas 30% + lucro 25% (total 105%) → ver banner inviabilidade + markup `∞`
- Validar visualmente: setar faturamento médio 0 → ver alerta
- Validar visualmente: forçar erro de DB → ver banner "Tentar de novo"
- Validar visualmente: clicar exportar backup → ver Alert de confirmação
- P2 adiados: skeletonização de campos numéricos durante load; tooltip educativo para markup; auto-cálculo do "ponto de equilíbrio" entre despesas e margem

---

## Auditoria — Fase 1 — Embalagens + Preparos (2026-04-23)

### Diagnóstico (skill product-audit, 15 perguntas) — 4 arquivos auditados via subagents Explore em paralelo

#### `src/screens/EmbalagensScreen.js` (1066 linhas)

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `loadData()` sem try/catch + sem `loadError` state | P0 | implementado |
| 2 | `removerCategoria` loop N+1 (UPDATE por item) | P0 | implementado (single bulk UPDATE) |
| 3 | `filtroCategoria` com `useState` em vez de `usePersistedState` | P1 | implementado |
| 4 | `duplicarEmbalagem` sem `updated_at` (quebra sort "Editados recentemente") | P1 | implementado |
| 5 | `duplicarEmbalagem` sem try/catch | P1 | implementado |

#### `src/screens/EmbalagemFormScreen.js` (757 linhas)

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `autoSave()` catch com `setSaveStatus(null)` em vez de `'error'` | P0 | implementado |
| 2 | `parseNum`/parseFloat com `\|\| 0` em vez de `Number.isFinite` | P0 | implementado (parseNum usa Number.isFinite) |
| 3 | 3 catches silenciosos sem console.error (loadItem.historico, deleteHistorico, priceHistory) | P1 | implementado |
| 4 | Duplicar embalagem sem try/catch + sem `updated_at` | P1 | implementado |
| 5 | autoSave sem `updated_at` no UPDATE | P1 | implementado |

#### `src/screens/PreparosScreen.js` (1100 linhas)

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `loadData()` sem try/catch + sem `loadError` state | P0 | implementado |
| 2 | `duplicarPreparo` loop N+1 via Promise.all sobre INSERTs de ingredientes | P1 | implementado (bulk INSERT placeholders) |
| 3 | `filtroCategoria` com `useState` em vez de `usePersistedState` | P1 | implementado |
| 4 | `duplicarPreparo` sem try/catch + sem `updated_at` | P1 | implementado |

#### `src/screens/PreparoFormScreen.js` (986 linhas)

| # | Item | Severidade | Status |
|---|------|------------|--------|
| 1 | `autoSave()` catch com `setSaveStatus(null)` em vez de `'error'` | P0 | implementado |
| 2 | autoSave loop N+1: DELETE + INSERT por ingrediente | P0 | implementado (bulk INSERT placeholders) |
| 3 | `parseNum` com `\|\| 0` + cálculos sem `Number.isFinite` | P1 | implementado |
| 4 | `confirmQuantity` aceita NaN como inválido (`<=0` vira false) | P1 | implementado (Number.isFinite guard) |
| 5 | calcCustoIngrediente sem proteção `safeCusto` (NaN propagado) | P1 | implementado |

### Implementado nesta sessão

**`src/screens/EmbalagensScreen.js`:**
- `loadError` state + try/catch/finally em `loadData()` + banner vermelho "Tentar de novo" + `console.error('[EmbalagensScreen.loadData]', e)`
- `removerCategoria` → single bulk `UPDATE embalagens SET categoria_id=NULL, updated_at=? WHERE categoria_id=?` (era loop N+1) + try/catch + setInfoToast feedback
- `duplicarEmbalagem` envolto em try/catch + `updated_at` + Alert em erro
- `filtroCategoria` migrou para `usePersistedState('embalagens.filtroCategoria', null)`
- Estilos `errorBanner*` adicionados (mesmo pattern dos outros)

**`src/screens/EmbalagemFormScreen.js`:**
- `parseNum` retorna 0 só se NaN (Number.isFinite check explícito)
- `autoSave` agora usa `parseNum` + adiciona `updated_at` no UPDATE + catch chama `setSaveStatus('error')` + `console.error('[EmbalagemForm.autoSave]', e)`
- Duplicação envolvida em try/catch (`'[EmbalagemForm.duplicate]'`) + `updated_at` + Alert em erro
- Catches `loadItem.historico`, `deleteHistorico`, `priceHistory` ganharam `console.error('[EmbalagemForm.acao]', e)`

**`src/screens/PreparosScreen.js`:**
- `loadError` state + try/catch/finally em `loadData()` + banner vermelho "Tentar de novo" + `console.error('[PreparosScreen.loadData]', e)`
- `duplicarPreparo` envolto em try/catch + `updated_at` + ingredientes copiados via bulk INSERT (placeholders concatenados) em vez de Promise.all + Alert em erro
- `filtroCategoria` migrou para `usePersistedState('preparos.filtroCategoria', null)`
- Estilos `errorBanner*` adicionados

**`src/screens/PreparoFormScreen.js`:**
- `parseNum` com Number.isFinite + helper `safeCusto(v)` que filtra NaN/negativo
- `custoTotal` reduce envelopa cálculos com safeCusto; `custoKg` adiciona `Number.isFinite(custoTotal)` na divisão
- `confirmQuantity` valida `Number.isFinite(qtd) && qtd > 0` (mantém modal aberto p/ correção)
- `autoSave` usa `parseNum` para rendimento e validade, `safeCusto` no reduce, bulk INSERT placeholders + catch chama `setSaveStatus('error')` + `console.error('[PreparoForm.autoSave]', e)`

### Decisões de produto duradouras

- **Bulk INSERT com placeholders dinâmicos**: padrão para inserir N rows — montar `(?,?,?,?)` repetido + flatten dos params em vez de Promise.all (1 round-trip ao DB em vez de N). Aplica especialmente em duplicação que copia ingredientes.
- **Filtros recorrentes (categoria, sort, viewMode) SEMPRE via `usePersistedState`** — UX reverte para o último estado consistente entre sessões, evita "começar do zero" toda vez.
- **`updated_at` SEMPRE em INSERTs/UPDATEs de duplicação** — caso contrário o sort "Editados recentemente" / "Modificados" fica inconsistente, escondendo trabalho recente.
- **Modal de quantidade NUNCA fecha automaticamente em valor inválido** — usuário corrige no próprio modal; fechar perdendo input é UX hostil.
- **Helper `safeCusto(v)` para cálculos de custo de ingrediente**: `Number.isFinite(v) && v >= 0 ? v : 0` — evita NaN propagado em reduce sem mascarar input legítimo zero.

### Pendente

- Validar visualmente: criar embalagem com categoria, remover categoria, ver embalagens caírem em "Sem categoria" (single UPDATE)
- Validar visualmente: forçar erro DB → ver banners "Tentar de novo" nas 4 telas
- Validar visualmente: digitar `abc` em quantidade do PreparoForm → modal pede correção (não fecha)
- Validar visualmente: trocar filtro categoria → fechar app → reabrir → filtro permanece
- P2 adiados: useMemo em visibleItems (Preparos), acessibilidade chips de categoria, skeleton em campos numéricos durante load

---

## Auditoria — Fase 1 — Estoque (2026-04-23)

Telas: `EstoqueHubScreen.js`, `EntradaEstoqueScreen.js`, `AjusteEstoqueScreen.js`

### Diagnóstico (3 subagents Explore em paralelo)
| Tela | P0 | P1 | P2/P3 (deferidos) |
|------|----|----|-------------------|
| EstoqueHub | Status pill só por cor (daltonismo ~8% homens) | Carga sem console.error; tab/período não persistidos; `parseFloat` sem `Number.isFinite` em `SaldoRow` | Filtro tipo (insumo/emb), useMemo |
| EntradaEstoque | `carregar()` `try/finally` sem catch — falha silenciosa | Sem validação inline (só desabilita botão); typo "um embalagem"; sem console.error em catch | Motivo dropdown taxonomia |
| AjusteEstoque | Mutação destrutiva sem confirmação; sem alerta saldo→negativo | Carga silent; typo; console.error ausente; sem preview saldo antes/depois | Audit log `created_by`/`device_id` (schema) |

### Fixes implementados
- **EstoqueHubScreen** — `safeNum` com `Number.isFinite`; pill com `<Feather name=>` + label; `usePersistedState('estoque.tab')` + `'estoque.periodo'`; `console.error('[EstoqueHub.carregar]')`
- **EntradaEstoqueScreen** — `loadError` state + try/catch + banner; `qtdInvalida`/`custoInvalido` com mensagens específicas + borda vermelha; `console.error` nos 2 catches; typo corrigido
- **AjusteEstoqueScreen** — `loadError` + banner; **card preview saldo A → B** (vermelho/⚠ se < 0); função `confirmar()` (window.confirm web / Alert.alert nativo) com mensagem detalhada; botão chama `pedirConfirmacao()` em vez de `salvar()` direto; `console.error` nos 2 catches; typo corrigido

### Decisões duradouras (consolidadas)
- Pill de status SEMPRE com ícone + texto (acessibilidade daltonismo)
- Mutação destrutiva de saldo sempre via `confirmar()` + preview do delta
- Validação inline por campo (mensagem específica + borda vermelha) > apenas desabilitar botão

### Diferimentos (não bloqueiam release)
- Race condition `custo_medio` no RPC (fix SQL futura migration)
- Audit log `created_by`/`device_id` (schema change)
- Motivo dropdown taxonomia (refactor componente)
- Filtro tipo (insumo/embalagem) na tab Saldos (UX nice-to-have)

### Validação
- `@babel/parser` OK nos 3 arquivos
- Validar visualmente: tab Estoque → ler status com plugin daltonismo → ver ícone + texto, não só cor
- Validar visualmente: AjusteEstoque → quantidade > saldo → ver banner vermelho ⚠ + confirmar → mostra "ficará negativo"
- Validar visualmente: EntradaEstoque → custo 0 → ver borda vermelha + msg "Custo > 0; para zerar use Ajuste"

---

## Auditoria — Fase 1 — Análise (2026-04-23)

Telas: `MatrizBCGScreen.js`, `SimuladorScreen.js`, `RelatorioSimplesScreen.js`, `MargemBaixaScreen.js`

### Diagnóstico (4 subagents Explore em paralelo)
| Tela | LOC | P0 | P1 | P2/P3 (deferidos) |
|------|-----|----|----|-------------------|
| MatrizBCG | 865 | parseFloat unsafe (margemPerc, combos); sem try/catch em loadData | Filtros não persistidos; class badge só por cor; sem accessibilityLabel | Tooltip pedagógico nos quadrantes; useMemo em mediana se base>200 |
| Simulador | 927 | Silent catch; parseFloat unsafe (ajuste, metaLucro); division-by-zero divisor; **Infinity em margemDisponivel quando custos≥100% sem UX inviável** | — | Chart histórico meta vs realidade |
| RelatorioSimples | 840 | Silent catch; parseFloat unsafe; division-by-zero em custo unitário | — | Filtro por categoria de produto |
| MargemBaixa | 202 | Silent catch; division-by-zero em custoUn; **texto "10%" hardcoded vs config 15%** | Badge margem só por cor (sem ícone/label) | Comparativo histórico (variação 30d) |

### Fixes implementados
- **MargemBaixaScreen** — `safeNum()` helper; `loadError` + try/catch + `console.error('[MargemBaixa.loadData]', e)` (era `/* silent */`); banner padrão "Tentar de novo"; division-by-zero guard `divisor > 0 ? safeNum(...) : 0`; helpers `getMargemIcon`/`getMargemLabel` → `alert-octagon`(Crítico)/`alert-triangle`(Atenção) **junto** ao % + badge texto; texto consistente com `formatPercent(margemMeta)`
- **RelatorioSimplesScreen** — `safeNum()`; `loadError` + try/catch + `console.error('[RelatorioSimples.loadData]', e)`; division-by-zero guard em `custoUn`; banner padrão; `console.warn` em catch interno
- **SimuladorScreen** — `safeNum()`; `loadError` + try/catch + `console.error('[Simulador.loadData]', e)`; hardenização `simular()` (`safeNum(ajuste)/100`, divisor guarded, ingredientes wrapped); `calcularMeta()` com **Inviável detection** quando `margemDisponivel ≤ 0` ou não-finito → bloco UI dedicado (`alert-octagon` + banner vermelho + "Reduza CMV/variáveis em Configurações antes de definir uma meta"); `parseFloat(metaLucro)||0` → `safeNum(metaLucro)`
- **MatrizBCGScreen** — `safeNum()`; `loadError` + try/catch/finally + `console.error('[MatrizBCG.loadData]', e)`; division-by-zero guard `divisor > 0 ? safeNum((ing+pr+emb)/divisor) : 0`; margem produto e combo wrapeadas; `filterClass`/`sortBy`/`sortDir` migrados para `usePersistedState('bcg.*')`; summary chips com `Feather name={cfg.icon}` + `accessibilityLabel`; class badge na tabela troca emoji decorativo por `<Feather name={cfg.icon}>` + `accessibilityLabel`

### Decisões duradouras (consolidadas)
- `safeNum(v) = Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0` é o padrão da casa para qualquer entrada numérica em telas de cálculo financeiro
- Division-by-zero sempre guard `divisor > 0 ? safeNum(num/divisor) : 0`
- Modelos financeiros (Simulador, Configuração) viram bloco UI "inviável" antes de tentar calcular meta inalcançável
- Filtros de Análise (classe, sort, direction) persistem por usuário via `usePersistedState`
- Badge/chip de classificação SEMPRE com ícone Feather + texto (consistente com pill de Estoque)

### Diferimentos (não bloqueiam release)
- BCG: tooltip pedagógico nos quadrantes (texto já cobre; hover/tap-info seria UX++)
- BCG: useMemo para `medianaVendas`/`medianaMargem` quando base > 200 produtos
- Simulador: chart de comparação meta vs realidade
- RelatorioSimples: filtro por categoria de produto
- MargemBaixa: comparativo histórico (variação 30d)

### Validação
- `@babel/parser` OK nos 4 arquivos
- Validar visualmente: Simulador → Configurar CMV ≥ 100% → ver banner vermelho "Modelo financeiro inviável" antes do bloco de meta
- Validar visualmente: BCG → mudar filtro classe → fechar/abrir app → filtro permanece
- Validar visualmente: MargemBaixa → ler com plugin daltonismo → identificar Crítico vs Atenção pelo ícone (não só cor)
- Validar visualmente: forçar erro em loadData (drop temporário) → ver banner "Tentar de novo" em todas as 4 telas

---

## Auditoria — Fase 1 — Login / Onboarding (2026-04-23)

Telas: `LoginScreen.js`, `RegisterScreen.js`, `ForgotPasswordScreen.js`, `WelcomeTourScreen.js`, `OnboardingScreen.js`, `KitInicioScreen.js`, `PerfilScreen.js`, `src/utils/initialRoute.js`

### Diagnóstico (4 subagents Explore em paralelo, 8 arquivos)
| Arquivo | LOC | P0 | P1 | P2 (deferidos) |
|---------|-----|----|----|----------------|
| LoginScreen | 177 | Spinner infinito sem timeout; validação genérica "preencha tudo"; sem `console.error` antes do `mapAuthError` | errorBox sem borderLeft (daltonismo); btn enabled durante rate-limit; erro não limpa ao digitar | Countdown visível durante rate-limit; medidor de força de senha |
| RegisterScreen | 351 | Mensagens validação genéricas; **expõe min length da senha (anti-enumeração)** | Mesmas issues do Login + placeholder "Mínimo 6 caracteres" exposto | Medidor força senha (zxcvbn) |
| ForgotPasswordScreen | 152 | Sem timeout; catch silencia falha sem `console.error` | errorBox sem borderLeft; erro não limpa; btn não trava em rate-limit | — |
| WelcomeTourScreen | 376 | — | Catches silent (`catch {}`) sem log; parse `Number()` sem guard contra NaN | Skip permanente após 1ª aparição (analytics drop-off) |
| OnboardingScreen | 343 | **Modal "configuração concluída" reaparece toda visita** (sem flag) | silent catch loadStatus; sem `ActivityIndicator` no load inicial; `line-through` na lista de etapas concluídas (ruim para baixa visão); navToStep duplica regras | Barra de progresso sticky no topo |
| KitInicioScreen | 382 | **Mensagem `${e.message}` técnica vai para o usuário** | Segmento escolhido não persiste; `valor_pago.toFixed` sem safeNum; catch silencioso na navegação | Preview de margem média estimada por segmento |
| PerfilScreen | 214 | **loadPerfil + autoSave silent (perda de dados sem feedback)** | Botão Continuar disabled silent (UX ruim); sem feedback visual de validação | Avatar customizado (upload) |
| initialRoute | 62 | — | Silent catch devolve `MainTabs` em qualquer falha → app vazio sem explicação | ETag/cache de `getSetupStatus` para acelerar boot |

### Fixes implementados
- **LoginScreen** — `EMAIL_RE` + `LOGIN_TIMEOUT_MS=30000` + flag `timedOut`; validação por campo (ambos vazios / só email / só senha / regex inválido); `onChangeEmail/Password` limpam erro; `console.error('[LoginScreen.handleLogin]', err)`; `btnDisabled = loading || !!rateLimit.isLocked` + `primaryBtnDisabled` opacity 0.5 + `accessibilityState`; errorBox com borderLeft vermelho 3px
- **RegisterScreen** — paridade com Login; senha fraca com mensagem genérica "Senha muito curta. Use uma senha mais segura..." (anti-enumeração); placeholder "Mínimo 6 caracteres" → "Crie uma senha segura"; `console.error('[RegisterScreen.handleRegister]', err)`
- **ForgotPasswordScreen** — paridade com Login; `RESET_TIMEOUT_MS=30000`; `console.error('[ForgotPassword.handleReset]', err)`
- **WelcomeTourScreen** — `Number.isFinite(parsed) ? parsed : 0` defensivo; `console.error('[WelcomeTour.incrementCount]', e)`, `'.persistDone'`, `'.initialRoute'` (3 catches anteriormente silent)
- **OnboardingScreen** — `STEP_NAV_MAP` centralizado; **flag `onboarding_complete_shown`** em AsyncStorage (modal não reabre); `loadError` state + tela "Tentar de novo"; `ActivityIndicator` no load inicial (antes era tela em branco); `console.error` em todos AsyncStorage writes; `finSubTextDone` removeu `line-through` (mantém só verde + semi-bold — `Feather check-circle` já indica done)
- **KitInicioScreen** — `safeNum()` helper module-level; `safeNum(ins.valor_pago).toFixed(2)` na preview; **mensagem amigável**: "Não foi possível aplicar o kit. Verifique sua conexão e tente novamente. Se o problema continuar, fale com o suporte." (sem `${e.message}`); `console.error('[KitInicio.executarKit]', e)`; persiste `AsyncStorage('segmento_negocio', selected)` em `navegarAposKit` para futuras recomendações
- **PerfilScreen** — `loadError` state + banner clicável "Tentar de novo" + `console.error('[Perfil.loadPerfil]', err)`; autoSave try/catch + `setSaveStatus('error')` + toast vermelho "Falha ao salvar. Tente de novo." (variante `toastError`); **botão Continuar não fica mais disabled silent** — clica e mostra `showNameError` inline com borda vermelha + ícone `alert-circle` + texto "Nome do negócio é obrigatório para continuar."; erro limpa quando usuário digita; `accessibilityRole`/`accessibilityLabel`/`accessibilityHint`
- **initialRoute** — `console.error('[determineInitialRoute]', err)` + fallback `'ProfileSetup'` (era `'MainTabs'`)

### Decisões duradouras (consolidadas — itens 12-18 novos)
- **Auth — validação por campo**: ambos vazios / só email / só senha / email inválido (regex `EMAIL_RE`) com mensagens específicas
- **Auth — senha fraca anti-enumeração**: nunca expor min length exato no UI/placeholder
- **Auth — timeout 30s + flag `timedOut`** evita spinner infinito quando backend trava
- **Auth — `btnDisabled = loading || !!rateLimit.isLocked`** + `accessibilityState` + `primaryBtnDisabled` (opacity 0.5)
- **Modais celebratórios** (configuração concluída, primeira venda etc) usam flag `*_shown` em AsyncStorage para não repetir a cada visita
- **Botão de form principal não fica disabled silent** — clica e mostra erro inline (acessibilidade > affordance que parece "quebrado")
- **Mensagens de erro técnicas nunca vão para o usuário** — `${e?.message}` apenas em `console.error('[Tela.acao]', e)`; UI mostra mensagem amigável + ação ("tente de novo / fale com suporte")
- **Fallback de boot** em catch de `determineInitialRoute` devolve `ProfileSetup` (benigno), nunca `MainTabs` (mostra app vazio)

### Diferimentos (não bloqueiam release)
- LoginScreen: countdown visível durante rate-limit
- LoginScreen/Register: medidor de força de senha (zxcvbn)
- WelcomeTour: skip permanente após 1ª aparição
- Onboarding: barra de progresso sticky no topo
- KitInicio: preview de margem média estimada por segmento (motivacional)
- Perfil: avatar customizado (upload)
- initialRoute: ETag/cache de `getSetupStatus`

### Validação
- `@babel/parser` OK nos 8 arquivos
- Validar visualmente: Login com Wi-Fi desligado → spinner deve sair em 30s + mensagem de timeout
- Validar visualmente: Register com senha curta → mensagem genérica (sem expor min length)
- Validar visualmente: Onboarding — completar setup, sair, voltar → modal "concluída" NÃO deve reabrir
- Validar visualmente: Perfil — clicar Continuar com nome vazio → erro inline (não fica disabled silent)
- Validar visualmente: forçar drop em `getSetupStatus` → ver banner "Tentar de novo" no Onboarding
- Validar visualmente: ler erro de auth com plugin de daltonismo → ícone `alert-circle` + borderLeft vermelho identificável

---

## Auditoria — Fase 1 — Operação auxiliar (2026-04-23)

**Quatro telas auditadas via 4 subagents Explore em paralelo (51 findings consolidados).**

### FornecedoresScreen.js (10 findings) — implementado
- **P0** `loadData` silent catch → `console.error('[Fornecedores.loadData]', e)` + try/catch/finally + `loadError` state + banner com retry + `loading` state com ActivityIndicator
- **P0** Race-condition em loads concorrentes (useFocusEffect + 2 deps) → `isLoadingRef` ref-guard
- **P1** `safeNum` em todos os `preco_por_kg` (substitui `|| 0`)
- **P1** `usePersistedState('fornecedores.busca'/'filtroCategoria')` (era useState)
- **P1** Accessibility props em chips (`accessibilityState.selected`) e cards de item (label completo)

### ListaComprasScreen.js (13 findings) — implementado
- **P0** `loadProdutos` silent catch → console.error + try/catch/finally + `loadError` banner com retry
- **P0** **`gerarLista` catch silencioso travava o botão sem feedback** → console.error + `gerarError` state + banner alert
- **P1** `safeNum` em consolidado/totalGramas/qtLiqGramas/pacotesNecessarios/custoTotal
- **P1** Substituiu `&middot;` HTML literal por `•` Unicode (linha 487)
- **P1** `usePersistedState('listaCompras.busca')` (era useState)
- **P1** Accessibility nos botões +/- (label "Aumentar/Diminuir quantidade de X"), TextInput de qty, botão Gerar Lista (state busy/disabled), botão Exportar PDF

### AtualizarPrecosScreen.js (15 findings) — implementado
- **P0** `loadData` silent catch → console.error + try/catch/finally + `loadError` banner + `isLoadingRef` race-guard
- **P0** **`confirmSave` aceitava qualquer string como 0 silent (`parseFloat('abc') || 0`)** → `Number.isFinite(parsed) && parsed >= 0`; erro inline no modal
- **P0** `confirmSave` sem try/catch (falha de DB invisível) → catch → `editError` (modal) + `saveError` (banner global)
- **P1** `safeNum` em `qtdLiquida`/`embalagens.quantidade` (division-by-zero reforçado)
- **P1** `usePersistedState('atualizarPrecos.busca')` + ActivityIndicator import + box de loading
- **P1** Badge "Salvo" com `accessibilityLabel` + `accessibilityLiveRegion="polite"` (anunciado por screen reader)
- **P1** TextInput do modal com `accessibilityLabel="Novo preço"`

### ExportPDFScreen.js (13 findings) — implementado
- **P0** 4 catches silent (loadProdutos, loadPreparos, handleExport, handleExportPreparos) → console.error em todos + `loadError`/`exportError` states
- **P0** **`alert('Erro ao exportar: ' + e.message)` expunha stack trace** → banner amigável `setExportError('Não foi possível exportar...')` (auto-dismiss 4s)
- **P1** Botão Exportar com `accessibilityState={{ disabled, busy }}` + label contextual ("Selecione ao menos um item" / "Exportar PDF com N produtos" / "Gerando PDF, aguarde")
- **P1** ActivityIndicator com texto "Gerando PDF..." (era spinner sem contexto durante export longo)
- **P1** Banner de loadError com retry callback que dispara loadProdutos + loadPreparos

### Validação
`@babel/parser` em todos os 4 arquivos: OK.

### Padrões consolidados
- `safeNum(v)` helper standard em telas com cálculos numéricos
- `isLoadingRef` ref-guard em useFocusEffect quando deps mudam
- `accessibilityLiveRegion="polite"` em badges de status (Salvo) para SR
- Substituir `alert(e.message)` por banners contextuais (nunca expor stack ao usuário)

---

## Bugs conhecidos (não fechados)

Nenhum aberto no momento. Bugs históricos resolvidos estão em `.memory-bank/progress.md`.

## Riscos abertos

- **Modo `bypassPermissions` ativado em `.claude/settings.local.json`** — autonomia total. Implica que comandos potencialmente destrutivos (rm, drop, push --force) executam sem prompt. Mitigação: regras de não-destrutividade em CLAUDE.md + revisão dos commits antes do push.
- **Cache TTL Supabase 5s** — se duas operações concorrentes escreverem no mesmo recurso entre invalidações, dados podem ficar stale por até 5 s. Risco baixo (single-tenant por user).
