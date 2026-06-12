# Checkup de Usabilidade — PrecificaApp (2026-06-12)

> Data: 2026-06-12

## Índice

- [Resumo](#resumo)
- [Achados](#achados)
  - [Críticos](#críticos)
  - [Altos](#altos)
  - [Médios](#médios)
  - [Baixos](#baixos)
- [Top 3 para destravar ativação](#top-3-para-destravar-ativação)
- [Quick wins](#quick-wins)
- [Pontos fortes](#pontos-fortes)

## Resumo

A base de UX é boa, mas o gargalo é o caminho longo/ambíguo até o "aha moment" (primeiro produto precificado). **70% das contas reais não ativam.**

## Achados

### Críticos

- **[CRÍTICO] Kit de Início termina em "Atualizar preços agora"** (lista de manutenção de insumos) em vez de num produto precificado.
  - Referência: `src/screens/KitInicioScreen.js:959-993`
  - Sugestão: CTA "Ver/criar meu primeiro produto" abrindo o `EntityCreateModal` com produto-exemplo.

- **[CRÍTICO] "Financeiro obrigatório" gateia o 1º preço com jargão**; sem ele "Sugerido" mostra "—".
  - Referências: `src/screens/OnboardingScreen.js:281-310`, `src/components/EntityCreateModal.js:966`
  - Sugestão: modo simplificado de 1 pergunta ("quanto de lucro? 30%").

### Altos

- **[ALTO] 3 fluxos de onboarding concorrentes + roteamento frágil.**
  - Referências: `src/utils/initialRoute.js`, `WelcomeTourScreen` / `OnboardingScreen` / `KitInicioScreen`
  - Sugestão: funil linear único.

- **[ALTO] Subtítulo do Ranking "Mês atual entra a partir do dia 5" descreve regra inexistente.**
  - Referência: `src/screens/MatrizBCGScreen.js:391`
  - Sugestão: "Baseado nas vendas do mês anterior (mais estável que o mês em curso)."

### Médios

- **[MÉDIO] 6 abas na barra inferior** (4 são conceitos-meio).
  - Referência: `src/navigation/AppNavigator.js:514-522`
  - Sugestão: reduzir para Início / Produtos / Mais.

- **[MÉDIO] Jargão "CMV" cru.**
  - Referência: `EntityCreateModal.js:954`
  - Sugestão: "Custo do produto (CMV)".

- **[MÉDIO] Análise de preço some silenciosamente sem Financeiro.**
  - Referência: `EntityCreateModal.js:1000-1037`

### Baixos

- **[BAIXO] WelcomeTour limitado a 2 exibições.**
  - Referência: `initialRoute.js:31-39`

- **[BAIXO] Acessibilidade:** cobertura boa (41/48 telas com `accessibilityLabel`), lacunas em `hitSlop` / contraste / foco de teclado no web.

## Top 3 para destravar ativação

1. Kit termina num produto precificado.
2. Tirar gate de Financeiro do 1º preço.
3. Unificar onboarding num funil linear.

## Quick wins

- Corrigir subtítulo "dia 5".
- Renomear CMV.
- Nunca mostrar "—" no Sugerido.
- Renomear/remover aba Embalagens.
- Análise de preço sempre visível.

## Pontos fortes

- Preview de custo/margem ao vivo.
- `UpgradeModal` exemplar.
- Empty states com CTA.
- `ROUTE_TITLES` completo.
- Menu "Ferramentas" bem seccionado.
