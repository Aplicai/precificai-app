# MARKET_BENCHMARK — Precificaí

Referências de mercado, padrões de UX/Design relevantes, oportunidades de diferenciação.

Atualizar sempre que surgir referência útil ou anti-padrão a evitar.

---

## Concorrência direta (precificação para alimentos / fichas técnicas)

| Produto | Foco | O que faz bem | O que faz mal | Lição para o Precificaí |
|---------|------|---------------|---------------|-------------------------|
| **MarketMan** | Inventário + custo para restaurantes (US) | Recipe costing automático ao alterar preço de insumo. Reports de waste. | Onboarding longo, UI cheia de jargão. Caro. | Recalcular preço sugerido automaticamente quando custo médio do insumo muda. Já fazemos via custo_medio + markup, mas falta um indicador visual "preço desatualizado". |
| **Apicbase** | Restaurantes médio/grande porte (EU) | BOM hierárquico (sub-recipes), allergen tracking, multi-unidade. | Pesado para SMB. Custo alto. | Já temos BOM recursivo (preparos dentro de produtos). Diferencial: simplicidade. |
| **eAi Chef** | SaaS BR, restaurante/foodservice | Cardápio + ficha técnica + CMV em PT-BR. | UX antiquada estilo ERP, telas densas, muito clique. | Alvo natural a desbancar pela UX. Manter foco em **leigo + rápido**. |
| **Menu Control** | Foodservice BR, planilha-style | Acessível para padarias. | Visual de planilha, sem mobile real. | Posicionar Precificaí como "o que devia ter sido essa planilha" — 100% mobile, vocabulário simples. |
| **iFood Gestor** | Operação delivery BR | Onboarding leve, menu intuitivo, cores fortes (vermelho). | Não faz precificação — só gestão de pedido. | Padrões de cor + microcopy aspiracional ("vamos vender mais") cabem aqui. |

## Padrões de UX gerais observados em SaaS B2B SMB que cabem no Precificaí

| Padrão | Onde se vê | Por que funciona | Status no Precificaí |
|--------|-----------|------------------|----------------------|
| **Empty state com call-to-action** | Notion, Linear, Vercel | Vira tela vazia em entrada de produto | ✅ EmptyState component já existe |
| **Bottom sheet em mobile + dialog centered em desktop** | Stripe, Notion mobile, iFood | Adapta padrão à plataforma | ⚠️ EstoqueHub usa bottom-sheet em ambas — fix aplicado |
| **Quick-actions na home** | QuickBooks, Conta Azul | Reduz hops para tarefas repetitivas | ⚠️ Home tem alguns; falta "Registrar entrada" |
| **Banner de insight contextual** | Linear, Stripe Tax | Mostra anomalia antes do usuário procurar | ✅ FinanceiroPendenteBanner, alertas estoque |
| **Setup checklist visível** | Slack, Linear, Vercel | Reduz abandono no onboarding | ✅ Onboarding 4 etapas + KitInicio |
| **Undo toast em vez de confirm-dialog** | Gmail, Notion | Reduz fricção sem perder segurança | ✅ UndoToast + useUndoableDelete já implementados |
| **Microcopy aspiracional / didática** | Stripe, Mailchimp | Reduz medo de errar em dado financeiro | ✅ Loader messages contextuais (P1-16) |
| **Skeleton em vez de spinner** | Linear, Notion, YouTube | Percepção de velocidade | ✅ Skeleton component em uso |
| **Cmd+K** | Linear, GitHub, Notion | Power-user atalho | ✅ Implementado em SearchBar (P3-F) |

## O que NÃO copiar do mercado

- **Telas tipo planilha/Excel** (eAi Chef, MenuControl) — mesmo que poderoso, alienam o público leigo. Manter cards + lista.
- **Permissões granulares por usuário** — não cabe no perfil SMB single-user. Adiar.
- **Multi-loja em produto único** — adiciona complexidade pra 80% dos donos que têm 1 loja só. Postergar até demanda real.
- **Notificações push agressivas** — só quando earned (já implementado: M1-33 com `usePushPermissions().askIfNotAsked`).
- **Onboarding com vídeo modal forçado** — alta taxa de skip + frustração.

## Oportunidades de diferenciação — Precificaí

1. **Simplicidade brutal para o leigo.** Reduzir cliques + microcopy didática + jamais usar "CMV" sem explicar.
2. **Preço sugerido com 1 toque a partir do custo médio real** (já implementado: SuggestPriceModal). Diferencial vs MarketMan/Apicbase que pedem markup manual.
3. **Mobile-first PWA instalável** sem app store. Reduz fricção vs apps nativos enormes (eAi Chef nativo é 80MB+).
4. **Estoque "para precificar", não para gerenciar logística.** Foco no custo médio, sem multi-armazém, sem lote, sem validade. Mantém escopo curto e UX rápida.
5. **Engenharia de cardápio (BCG)** — raríssimo em SaaS BR para SMB. Já implementado, marketing pode explorar.
6. **Lista de compras automática a partir de estoque mínimo** — aproveitar `estoque_minimo` para sugerir compra. (Hipótese a validar — ListaComprasScreen existe mas não confirmamos integração com mínimo.)
7. **Markup educativo** — explicação inline em vez de só campo. (Status: parcialmente; InfoTooltip já existe mas a cobertura pode aumentar.)

## Anti-padrões observados no próprio Precificaí (a corrigir)

| Anti-padrão | Onde | Impacto | Solução |
|-------------|------|---------|---------|
| Bottom-sheet único em todas plataformas | EstoqueHub action sheet | Visual ruim no desktop | Responsivo: dialog centered em ≥768 px |
| Função critical (Estoque) escondida em Mais no mobile | MaisScreen | Subutilização | Atalho proativo no Home + manter Mais |
| Alert.alert com 3+ botões em web | (já corrigido na sessão anterior) | Botões silenciosamente removidos | Modal customizado |
| Título "Mais" sobrepondo "Estoque" no header web | (corrigido) | Confusão de contexto | WebHeader.ROUTE_TITLES expandido |

## Referências futuras a investigar

- **Linear**: animações de transição entre estados, design system minimalista
- **Vercel**: dashboard com cards de status + drill-down, tom didático
- **iFood Shop / iFood Gestor**: tom de voz para SMB BR
- **Stripe Tax**: explicação inline de cálculo financeiro complexo
