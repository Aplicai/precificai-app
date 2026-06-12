# Teste de Usabilidade Hands-On — PrecificaApp (2026-06-12)

> Diferente do checkup anterior (baseado em código), este foi **prático**: o app real
> foi navegado no navegador (`app.precificaiapp.com`, conta de teste logada), flow por flow,
> com observação direta de comportamento. Nenhuma alteração/deploy foi feito durante o teste.

## Metodologia e cobertura
- **Plataforma testada:** Web **desktop** (logado na conta `teste@teste.com.br`).
- **Flows percorridos:** Login → Painel Geral → Criação de produto (ficha técnica + custos) →
  Financeiro → Insumos → Ranking de Produtos → navegação geral.
- **Não testado visualmente:** layout **mobile-web**. A janela do Chrome foi redimensionada,
  mas o viewport interno permaneceu ~1710px (tela de alta densidade), então o app não entrou
  no breakpoint mobile. Recomenda-se QA mobile manual (o layout responsivo existe no código —
  bottom tabs; o checkup de código já apontou as 6 abas apertadas no mobile, com "Embalagens"
  truncada para "Embal.").

---

## 🟢 O que funciona MUITO bem (manter)
- **Painel Geral é excelente.** Saudação ("Boa noite 👋"), barra de progresso de configuração
  ("5 de 6 etapas · 83%"), e uma **camada de insights forte** ("Análises Rápidas"): "Margem
  negativa detectada", "CMV acima da média (53,99% vs 30-35%)", "Produto campeão". Alertas
  acionáveis com CTA ("Ajustar preço →", "Revisar insumos →"). Isso é ótimo para reter.
- **O fluxo de preço entrega o "aha moment".** Adicionar um insumo (ex.: 100g de açúcar) → ver
  **CMV R$ 0,45 → Sugerido R$ 1,04** ao vivo, com composição transparente (CMV 43% / fixos 22%
  / variáveis 14%). O preço sugerido vira placeholder do campo de venda. Muito bom.
- **Financeiro é bem guiado:** "Tudo é salvo automaticamente", passos numerados (1/2/3),
  "Resumo Financeiro" ao vivo, escolha "faturamento médio vs mês a mês", tooltips no jargão.
- **Insumos bem organizado:** agrupado por categoria, busca com atalho (Ctrl K), filtros por chip.

---

## 🔴 Achados (priorizados)

### [ALTO] Inconsistência de margem/CMV entre telas (quebra de confiança)
O MESMO produto mostra números diferentes em telas diferentes:
- **TESTE Aposta:** 100% (modal de produto) · 90% (Ranking) · **53,28%** (Painel "Produto campeão").
- O modal e o Ranking calculam CMV de **campos diferentes** do insumo (com meu insumo de teste,
  o modal lê R$ 0 e o Ranking R$ 2 para o mesmo item); o Painel inclui custos operacionais.
- **Impacto:** para o público leigo, ver "margem 100%" num lugar e "53%" em outro destrói a
  confiança ("qual está certo? meu preço está certo?"). Mesmo que sejam conceitos diferentes
  (margem bruta vs líquida), a UI não explica isso.
- **Sugestão:** unificar a fonte de cálculo de CMV entre modal/Ranking; e rotular explicitamente
  "margem bruta" vs "margem líquida" onde divergirem, com tooltip.

### [ALTO] Financeiro exibe VAZIO enquanto o motor de preço usa valores reais (possível bug)
- A tela **Financeiro** mostra tudo zerado: **Mark-up 1.00x, Custos Fixos 0,00%, Custos Variáveis
  0,00%, Faturamento R$ 0,00**, com "Preencha seu faturamento para ver a análise".
- MAS o modal de produto usa **Custos do mês 22,22% e Custos por venda 14,50%**, e o Painel mostra
  **Resultado Operacional R$ 11.667,20 / Ponto de Equilíbrio R$ 10.577,03 / Margem Líquida 10,49%**
  — valores que só existem com Financeiro preenchido.
- **Impacto:** a tela de configuração financeira **não reflete os dados que o app de fato usa**.
  O usuário olha o Financeiro, acha que não configurou nada, mas os preços já embutem 22% de custo
  fixo. Confuso e potencialmente um **bug de carregamento de dados** (a tela não popula os valores
  salvos) OU há duas fontes de verdade desconectadas.
- **Sugestão:** investigar por que a tela Financeiro não carrega os valores efetivos; garantir
  uma única fonte de verdade entre Financeiro ↔ motor de preço ↔ Painel.

### [MÉDIO] Quantidade default de insumo = "1 g" → custo aparece R$ 0,00
- Ao adicionar um insumo na ficha técnica, a quantidade vem **1 g** por padrão. Para açúcar
  (R$ 4,50/kg), 1g = R$ 0,0045 → exibe **R$ 0,00**. CMV fica R$ 0,00.
- **Impacto:** o usuário adiciona um ingrediente e o custo continua "zero" — parece que não
  funcionou. Só depois de ajustar a quantidade (ex.: 100g) o valor aparece.
- **Sugestão:** default mais útil (ex.: campo vazio com foco automático + teclado numérico, ou
  um default por tipo de unidade), e/ou destacar visualmente "ajuste a quantidade".

### [MÉDIO] Possível bug: insumo tipo "unidade" calcula custo R$ 0 no modal de produto
- Um insumo tipo `un` (preço por unidade) adicionado a um produto mostrou **R$ 0,00** no Resumo
  de Custos do modal, enquanto insumos tipo `kg` (açúcar) calculam corretamente. O Ranking, em
  contraste, computou custo > 0 para o mesmo insumo `un`.
- **Observação:** pode ser artefato do meu insumo sintético (faltam campos como `custo_medio`/
  `valor_pago`). **Verificar** com um insumo `un` real e completo (ex.: ovo, embalagem unitária).
- **Sugestão:** se confirmado, é bug no cálculo de custo do modal para unidades — afeta quem
  usa ingredientes contados por unidade (ovos, pães, etc.).

### [MÉDIO] Kit despeja 88 insumos com preços estimados não-rotulados
- A conta vem com **88 insumos** pré-carregados; **79 são "estimados"** (banner topo: "79 de 88
  estão estimados"). Cada item estimado tem um **ponto laranja (◉)** ao lado do preço, mas **sem
  rótulo/tooltip** — o usuário não sabe o que o ponto significa.
- Há itens fora de contexto/estranhos: **"Touca descartável R$ 0,00"** (item não-alimentar, preço
  zero), "Água sanitária", etc. — ruído para o segmento do usuário.
- **Impacto:** reforça o gargalo de ativação (revisar 79 preços é trabalho) e gera dúvida.
- **Sugestão:** rotular o ◉ ("preço estimado — toque para confirmar"); só pré-carregar insumos
  realmente relevantes ao segmento; nunca pré-carregar item com R$ 0,00.

### [BAIXO] Dois banners persistentes consomem espaço em toda tela
- "**Instalar app**" (canto inferior esquerdo) aparece em **todas** as telas e **sobrepõe** o
  item "Configurações" do menu lateral. "**Confira os preços dos seus insumos**" (topo) também
  persiste.
- **Sugestão:** "Instalar app" deveria ser dispensável de forma persistente (lembrar o dismiss);
  não sobrepor navegação. O banner de preços poderia recolher após 1ª interação.

### [BAIXO] Jargão financeiro no Painel para o público leigo
- "Ponto de Equilíbrio", "Resultado Operacional", "Margem Líquida", "CMV" aparecem crus (com ?
  tooltip). Para MEI sem formação financeira, ainda é denso. (Já houve bom esforço: "Ranking de
  Produtos" em vez de "Matriz BCG", nomes afetivos nos quadrantes, "Ferramentas".)
- **Sugestão:** rótulos mais coloquiais com o termo técnico em parênteses (ex.: "Quanto preciso
  vender pra não ter prejuízo (Ponto de Equilíbrio)").

### [BAIXO] "Lucro R$ -0,45 / Margem —" antes de inserir preço de venda
- No modal de novo produto, antes de digitar o preço de venda, o Resumo mostra **Lucro negativo**
  e **Margem "—"** (calculando sobre preço 0). Pode assustar momentaneamente.
- **Sugestão:** enquanto não há preço, mostrar o estado neutro ("informe o preço de venda") em
  vez de lucro negativo.

---

## 🎯 Prioridades recomendadas
1. **Investigar a inconsistência Financeiro/CMV** (achados ALTO 1 e 2) — é a maior ameaça à
   confiança e pode ser bug real. Antes de qualquer coisa de monetização.
2. **Corrigir o default de 1g** e verificar o **bug de insumo `un`** — afetam o "aha moment".
3. **Rotular o ◉ de preço estimado** + limpar o Kit (sem itens R$ 0,00 / fora de segmento).
4. **Banner "Instalar app"** dispensável e sem sobrepor navegação.
5. **QA mobile-web manual** — não foi possível validar nesta sessão; é a plataforma principal.

---

## Notas
- Teste feito na conta `teste@teste.com.br`, que tem os 4 produtos sintéticos `TESTE *` +
  X-Bacon/X-Burger. Alguns números (CMV R$ 0 nos TESTE) são artefato do dado sintético incompleto,
  sinalizado onde relevante.
- Itens já corrigidos/deployados nesta sessão (não recontados aqui): subtítulo do Ranking, rótulo
  "Custo unit. (CMV)", preço sugerido sem Financeiro (Item B), onboarding destravado (Item C),
  Kit → produto precificado (Item A).
