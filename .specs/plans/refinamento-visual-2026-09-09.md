# Refinamento visual — tirar a "cara de app genérico" (brief de execução)

Pedido do dono (09/09): "tire esse layout padrão do claude e deixe mais refinado e robusto, com um front end bem amigável". Fase A/B já removeram emoji, sopa de banners, sidebar em caixinhas, rótulos em jargão. Este brief é a camada seguinte: **identidade** e **consistência**.

## Princípios

1. **Um app de caixa, não um dashboard de template.** Números são o conteúdo. Fonte numérica tabular (`fontVariant: ['tabular-nums']` / `fontFeatureSettings: 'tnum'` no web), alinhamento à direita em colunas de valor, R$ sempre com 2 casas.
2. **Cor com significado.** Verde da marca só em ação primária e resultado positivo; vermelho só em prejuízo/erro; âmbar só em atenção. Todo o resto em neutros quentes. Zero azul/roxo decorativo (hoje: KPIs, chips "Lucro 5-15%", "Aposta", legenda do delivery).
3. **Hierarquia por peso e espaço, não por caixa.** Cards só quando agrupam ação; seções separadas por título 13 px uppercase com tracking 0.6 e linha fina. Sombra só em modal/FAB. Cards de lista com borda 1 px `#E6E4DE`, raio 10, fundo branco; sem borda esquerda colorida exceto estado de saúde.
4. **Fundo quente.** `background: #F6F5F1` (era cinza frio), superfícies `#FFFFFF`, texto `#1B2A27`, secundário `#5F706E` (já ok), bordas `#E6E4DE`. Header/sidebar seguem verde-escuro da marca.
5. **Escala fixa.** Título de tela 22/600; título de seção 13/600 uppercase; corpo 14/400; valor destaque 20–24/600 tabular; legenda 12/400. Espaços 4/8/12/16/24/32. Nada fora disso.
6. **Botões**: primário = verde cheio, raio 10, altura 44, texto 15/600; secundário = borda 1 px, sem fundo; destrutivo = texto vermelho sem fundo. Ícone só à esquerda do texto. Um primário por tela/modal.
7. **Microcopy de balcão** já aplicada; manter frases de até ~60 caracteres nos cards.

## Escopo por arquivo (ordem)

1. `src/utils/theme.js` — tokens: `colors.background='#F6F5F1'`, `colors.border='#E6E4DE'`, `radius = {sm:8, md:10, lg:14}`, `typography` (já existe: title 22, section 13, body 14, caption 12, value 22), `numeric = { fontVariant:['tabular-nums'] }`. Remover cores decorativas de KPI (azul/roxo/teal) do tema ou marcá-las `deprecated`.
2. `src/components/web/Sidebar.js` — rótulos de grupo ("CADASTRO", "ANÁLISES", "CONTA") 11/600 tracking, itens 14/500, ativo = fundo `rgba(255,255,255,0.10)` + barra 3 px à esquerda (já existe) — conferir contraste.
3. `src/components/web/WebHeader.js` — título 18/600, sem ícone de voltar em telas de topo no desktop (mostrar só quando a pilha tem >1 rota), avatar 32 px.
4. Cards de lista (Ingredientes/Receitas/Embalagens/Produtos, `gridCard`) — nome 14/500, valor 15/600 tabular à direita, tag "estimado" 11 cinza, ações (copiar/excluir) só no hover no desktop (`:hover` via `Pressable` `hovered` state) e sempre visíveis no mobile.
5. Home — "Saúde da Precificação": 4 tiles com valor grande tabular, label 12 acima, barra de benchmark 4 px; "Como começar" vira lista simples com check verde e texto riscado (já); "Ações Rápidas" vira 4 botões secundários em linha no desktop (grid 2×2 no mobile).
6. Formulários (`materiaPrimaForm.styles.js`, `entityCreateModal.styles.js`, Financeiro) — label 12/600 cinza uppercase? NÃO: label 13/500 sentence case; input 44 px, raio 10, borda 1 px, foco = borda verde 2 px; helper 12 cinza; erro 12 vermelho; espaçamento 16 entre campos. Botão primário full-width no rodapé do modal.
7. Chips/filtros — 30 px altura, raio 15, texto 12/500; selecionado = verde-escuro com texto branco; não selecionado = borda 1 px. Cores por categoria só no ponto de 8 px.
8. Estados vazios — já com exemplo real; garantir ícone 40 px em círculo `#EEF3F1`.
9. Mobile tab bar — 5 itens, ícone 22 + rótulo 10/600; ativo = verde da marca, sem pílula de fundo.

## Fora de escopo

Ilustrações próprias, dark mode, animações. Nenhuma regra de negócio muda.

## Verificação

Playwright screenshots (desktop 1440 / mobile 390) de Home, Ingredientes, Produtos, Financeiro, Delivery antes/depois; `tests/10-responsive.spec.js` verde; contraste AA nos textos secundários (checar `#5F706E` sobre `#F6F5F1`).
