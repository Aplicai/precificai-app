# Design — Wizard de configuração financeira (onboarding fácil)

## Problema

Cliente real (público-alvo: confeiteira/pequeno negócio, não-técnica) travou no
primeiro uso — não sabia onde clicar nem o que fazer primeiro, e a tela de
financeiro (custos fixos/variáveis, "quanto fatura por mês", taxa PIX/cartão)
parecia que tinha que preencher tudo. O dono precisou preencher junto com ela.

**Objetivo:** deixar o início do preenchimento financeiro fácil de gente comum,
SEM baixar a precisão — o financeiro é o core do Precificaí e os valores têm que
ser reais. Foco do "aha": chegar rápido ao **preço de 1 produto**.

## Decisão central — a mesma tela, dois modos (sem migração)

A tela de Financeiro passa a ter dois rostos sobre as MESMAS tabelas
(`configuracao`, `faturamento_mensal`, `despesas_fixas`, `despesas_variaveis` —
as mesmas que os STEPs 1–4 já gravam):

- **Modo Guiado (wizard de primeiro uso)** — um passo a passo, uma pergunta por
  tela, em linguagem do dia a dia. Adaptativo (casa vs ponto). Perguntas
  condicionais (só aparece o que é da pessoa). Valores REAIS digitados — nada de
  default-chute escondido.
- **Modo Ajuste (a tela atual, STEPs 1–4)** — continua existindo pra refinar.
  Botão "Ajustar meus custos". Como o wizard grava nas mesmas variáveis, o ajuste
  fica 100% consistente.

**Roteamento:** financeiro vazio (primeiro acesso) → Modo Guiado. Depois, a tela
abre no Modo Ajuste com um botão "Configurar com ajuda" pra reabrir o wizard.

Princípio: "configuração" assusta; "responder umas perguntas" não. Mesmo dado,
embrulho diferente.

## Roteiro do wizard (validado em protótipo)

Regra de ouro: **só perguntar o que a pessoa sabe responder de cabeça**, e o app
só calcula sozinho o que dá pra calcular com CERTEZA.

1. **Como você trabalha hoje?** → 🏠 De casa · 🏪 Tenho um ponto. *(ramifica)*
2. **Custos fixos do negócio** (adaptativo):
   - ponto: "Quanto custa pra manter seu ponto por mês? (aluguel + água + luz +
     gás, num número)" → R$.
   - casa: "Tem gasto fixo do negócio por mês? (internet, gás, ajudante)" →
     "Não, quase nada" OU R$.
3. **O seu trabalho (pró-labore)** — "Quanto você quer ganhar por mês pelo seu
   trabalho?" → R$. Tem "pular por enquanto". **Chave da realidade:** sem isso o
   preço paga ingredientes mas não paga ela.
4. **Faturamento** — "Quanto você vende por mês?" → R$. Botão "me ajuda a
   calcular": *pedidos/semana × ticket médio × 4,33* = faturamento. (Número real
   dela, não chute.)
5. **O que é descontado de cada venda?** (condicional — só o que é o caso):
   - "Recebe no cartão (maquininha)?" Sim → "Qual a taxa que a maquininha cobra?"
     (% real, "está na fatura/app da maquininha").
   - "Qual a situação do seu negócio?" → **MEI** · **Pago Simples** · **Sem CNPJ**.
6. **Lucro desejado** — "Quanto você quer de lucro em cada venda?" → chips 10/20/30
   (sugestão, editável) ou digita o %.
7. **Pronto** → resumo + CTA "Calcular o preço de um produto".

### Regra do imposto (o ponto que a gente refinou)

NÃO inventar a alíquota. O app só sabe o número com certeza em 2 dos 3 casos:

- **MEI** → valor FIXO mensal do DAS (~R$76; idealmente de uma tabela por ano/
  atividade). Entra como linha de `despesas_fixas` ("Imposto MEI"). Não pergunta %.
- **Sem CNPJ / informal** → 0%. Não grava nada.
- **Simples** → **pergunta a alíquota efetiva** (campo %), com a dica *"está na
  sua guia do DAS como 'alíquota efetiva', ou pergunte ao contador"*. Se não
  souber agora → deixa em branco (grava 0, refina depois). NUNCA mostra um %
  calculado/chutado — isso quebrava a confiança.

## Mapeamento das respostas → tabelas existentes

| Resposta do wizard | Onde grava (tabela já existente) |
|---|---|
| Custos fixos (ponto/casa) | `despesas_fixas` (linha) |
| Pró-labore | `despesas_fixas` (linha "Pró-labore") |
| Faturamento | `faturamento_mensal` (modo média) |
| Taxa cartão | `despesas_variaveis` (linha "Taxa maquininha", %) |
| Imposto MEI | `despesas_fixas` (linha "Imposto MEI", R$ fixo) |
| Imposto Simples | `despesas_variaveis` (linha "Imposto", alíquota %) |
| Lucro desejado | `configuracao.lucro_desejado` |

O markup final continua sendo `calcMarkup(despFixasPerc, totalVariaveis,
lucroPerc)` com `despFixasPerc = totalFixas / faturamentoMedio` — sem mudar o
motor de cálculo.

## "Aproximado → exato" (refinamento) — Alt 1, simples

Sem medidor, sem marcação de "estimativa", sem auto-correção por vendas (a DRE não
é usada por todos os usuários). Apenas: **botão "Ajustar meus custos"** abre o Modo
Ajuste pra editar qualquer valor quando algo mudar (aluguel subiu, etc.). Editar é
só editar — nenhum conceito novo pra entender.

## YAGNI (o que NÃO vamos fazer)

- Sem auto-cálculo de Simples por faixa de faturamento (impreciso, quebra confiança).
- Sem registro de vendas/DRE pra auto-corrigir faturamento.
- Sem medidor de "precisão" nem marcação campo-a-campo.
- Sem assistente conversacional/IA.
- Sem migração de banco (reusa as tabelas atuais).

## Plano de implementação (em ordem)

1. **Componente do wizard** (`FinanceiroWizard`) — UI do passo a passo já
   prototipada (estado por step, barra de progresso, voltar/continuar).
2. **Roteamento de entrada** — financeiro vazio → wizard; senão → tela atual com
   botão "Configurar com ajuda".
3. **Adaptativo + condicionais** — casa/ponto muda o step 2; cartão e situação
   revelam campos.
4. **Helper do faturamento** — pedidos × ticket → faturamento.
5. **Regra do imposto** — MEI (valor fixo, idealmente tabela DAS), Simples
   (input de alíquota + dica + defer), informal (zero).
6. **Persistência** — gravar respostas nas tabelas da seção "Mapeamento",
   reusando as funções de save que os STEPs 1–4 já têm.
7. **Gancho final** — após o wizard, CTA "calcular o preço de um produto"
   (leva ao cadastro/lista de produtos).
8. **Botão "Ajustar meus custos"** — atalho pro Modo Ajuste a partir da Home/
   tela de produto.
9. **Verificação** — testar os dois caminhos (casa/ponto), cada situação de
   imposto, e conferir que o markup gerado bate com o da tela atual quando os
   mesmos valores são inseridos.

## Critérios de sucesso

- Uma confeiteira de casa, sozinha, configura o financeiro e chega ao preço de um
  produto sem ajuda externa.
- Nenhum valor é chute: todo número salvo é real (ou deixado em branco
  conscientemente).
- O preço gerado é realista (inclui o trabalho dela e o imposto certo).
