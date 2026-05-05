# ✅ CHECKLIST DE VALIDAÇÃO — Sessão 28.10

**Origem:** feedback do teste de usabilidade da Daniele
**Deploy validado:** `index-8b4f3502bb851e1e5f65d1dfe9442dbd.js`
**URL:** https://app.precificaiapp.com

> ⚠️ **Antes de começar:** faça **hard refresh** (`Ctrl+Shift+R` no Chrome/Edge ou `Cmd+Shift+R` no Mac) pra garantir que o bundle novo carregou. Confirme em DevTools → Network o hash `8b4f3502bb...`.

---

## 🔐 1. AUTENTICAÇÃO (APP-01, APP-02, APP-03)

### APP-01 — Reset de senha
- [ ] Sair do app → tela de Login → clicar **"Esqueci minha senha"**
- [ ] Digitar email cadastrado → clicar enviar
- [ ] **Esperado:** mensagem "Email enviado". Verifique caixa de entrada **e spam**
- [ ] Email deve ter o **logo branco "Precificaí"** (sem amarelo no "í"), botão verde "Redefinir senha"
- [ ] Clicar no link → abre tela de redefinir senha → digitar nova senha → salva
- [ ] **Esperado:** redireciona pro Login automaticamente

### APP-02 — Link "Esqueci minha senha" maior
- [ ] Na tela de Login, conferir que o link "Esqueci minha senha" está **bem visível** (15pt, negrito, sublinhado)
- [ ] **Esperado:** dá pra clicar fácil no celular sem zoom

### APP-03 — Validação senha em tempo real
- [ ] Tela de Cadastro → digitar uma senha qualquer
- [ ] **Esperado:** aparece checklist em tempo real:
  - ⭕/✅ Mínimo 8 caracteres
  - ⭕/✅ Pelo menos 1 letra maiúscula
  - ⭕/✅ Pelo menos 1 letra minúscula
  - ⭕/✅ Pelo menos 1 número
  - ⭕/✅ Pelo menos 1 símbolo (recomendado)
- [ ] Cada critério vira ✅ verde quando atendido

---

## 💰 2. CONFIGURAÇÃO FINANCEIRA (APP-11, 30, 31, 32, 33, 34, 43)

Acesso: **Mais → Financeiro** (ou pela tab Configurações)

### APP-11 — Botão "Salvar e voltar" sempre visível
- [ ] **Esperado:** banner verde no topo: "Tudo é salvo automaticamente"
- [ ] **Esperado:** botão fixo no rodapé "Salvar e voltar ao painel"

### APP-30 — Margem de segurança com sugestão por segmento
- [ ] **Step 1 → Margem de Segurança** → ícone `?` ao lado
- [ ] Tap no `?` → tooltip mostra explicação + faixas:
  - Confeitaria: 5-10%
  - Lanchonete: 5-8%
  - Pizzaria: 8-12%
  - Restaurante: 5-10%
  - Food truck: 8-15%
  - **+ "Seu segmento (X): sugerimos Y%"** se você cadastrou segmento no perfil
- [ ] Microcopy abaixo do campo: "Protege você de aumentos de fornecedor sem precisar atualizar preços. Sugestão pra X: Y%"
- [ ] Digitar **35%** → confirma → **esperado:** banner amarelo "Margem de segurança acima de 30% é incomum"
- [ ] Digitar **10%** → salva sem warning

### APP-31 — Faturamento toggle média vs mês-a-mês
- [ ] **Step 2 → Faturamento Mensal** — esperado ver dois cards:
  - **Faturamento médio mensal** ("Mais rápido. Use se seu faturamento é parecido todo mês.")
  - **Faturamento mês a mês** ("Mais preciso. Use se você tem datas sazonais fortes.")
- [ ] Card selecionado fica destacado (borda verde)
- [ ] No modo "média": preencher R$ 10.000 → **esperado:** aparece "Total anual estimado: R$ 120.000,00"
- [ ] Trocar pra "mês a mês" → preencher Janeiro = R$ 8.000 → **esperado:** botão "Replicar valor para todos os meses"
- [ ] Tap no botão → confirma replicar → todos os 12 meses ficam R$ 8.000
- [ ] **Esperado:** "Total anual: R$ 96.000,00" + "Média mensal: R$ 8.000,00"

### APP-32 — Perdas e desperdícios removido das sugestões
- [ ] **Step 4 → Custos por venda** → tap em "Selecione para adicionar"
- [ ] **Esperado:** "Perdas e desperdícios" **NÃO aparece** mais nas sugestões
- [ ] Esperado ver: Impostos, Taxa maquininha, Taxa PIX, Comissão, etc.

### APP-33 — Pró-labore tooltip + warnings
- [ ] **Step 3 → Custos do mês** → "Selecione para adicionar"
- [ ] Achar chip **"Pró-labore"** → tem ícone `?` ao lado
- [ ] Tap no `?` → tooltip explica o conceito + sugestão "Mínimo: R$ 1.518,00"
- [ ] Tap no chip "Pró-labore" → modal abre com placeholder **R$ 1.518,00**
- [ ] Confirmar com R$ 0 → **esperado:** alerta "Pró-labore zerado — você não está se pagando?" com 2 botões
- [ ] Confirmar com R$ 800 → **esperado:** alerta "Abaixo do salário mínimo (R$ 1.518,00)"
- [ ] Confirmar com R$ 1.518 → salva sem warning

### APP-34 — Card Saúde dos custos fixos
- [ ] No painel lateral direito (desktop) ou abaixo (mobile) → seção **Resumo Financeiro**
- [ ] Card **"📊 Saúde dos seus custos fixos"** com:
  - Faturamento mensal: R$ X
  - Custos fixos do mês: R$ Y
  - % do faturamento: Z% (com cor)
- [ ] Cores esperadas:
  - **🟢 Saudável** (verde) se ≤ 25%
  - **🟡 Atenção** (amarelo) se 25-35%
  - **🔴 Crítico** (vermelho) se > 35%
- [ ] Texto explicativo muda conforme a faixa
- [ ] Faixas de referência aparecem listadas no rodapé do card

### APP-43 — Volumes de venda por canal (NOVO)
- [ ] Ainda no Step 2 (Faturamento), ver sub-seção **"Volume de vendas por canal (opcional)"**
- [ ] Dois campos lado a lado: **Balcão** e **Delivery**
- [ ] Tap em "Balcão" → modal "Vendas/mês — Balcão" → digitar 150 → salva
- [ ] Tap em "Delivery" → digitar 80 → salva
- [ ] **⚠️ Se não persistir:** rode o bundle SQL no Supabase (instruções no fim)

---

## 📦 3. CADASTRO DE INSUMOS (APP-04, 05, 07, 14, 15, 16, 17, 18)

Acesso: **Insumos** (tab inferior)

### APP-04 — Bug grave da unidade NÃO voltar pra "un"
- [ ] Cadastrar novo insumo "Maracujá teste" → unidade **kg** → quantidade bruta 1000 → líquida 350 → preço R$ 8 → salvar
- [ ] **Sair da tela** e **abrir o item de novo** (modo edição)
- [ ] **Esperado:** unidade ainda é **kg** (não voltou pra "un")
- [ ] Repetir 3x trocando unidade pra `g`, `L`, `mL` → todas devem persistir

### APP-07 — Decimais aceitos
- [ ] No mesmo formulário, digitar **0,25** ou **1,5** em qualquer campo numérico
- [ ] **Esperado:** aceita vírgula sem reclamar
- [ ] Placeholder mostra "Ex: 1000 (use vírgula para decimais)"

### APP-14 — Kit com valores estimados + badge
- [ ] **Configurações → Aplicar Kit de Início → Confeitaria → Aplicar**
- [ ] Voltar pra Insumos → abrir qualquer um (ex: Açúcar refinado)
- [ ] **Esperado:** badge amarelo **"💡 Valor estimado a partir de média de mercado. Atualize com o seu preço real."**
- [ ] Na lista de insumos, badges amarelos visíveis nos itens com valor estimado
- [ ] Salvar (mesmo sem mudar valor) → badge desaparece

### APP-15 — Gelatina reclassificada
- [ ] Filtrar por categoria → **esperado:** existe categoria **"Espessantes e Gelificantes"**
- [ ] Gelatina em pó, Gelatina em folha, Ágar-ágar aparecem nessa categoria (NÃO em "Fermentos")

### APP-16 — Tooltips qty bruta vs líquida
- [ ] Form do insumo → tooltip `?` ao lado de **Qtd. Bruta** → "É o peso TOTAL na hora da compra... 1 kg de maracujá com casca = 1000 g"
- [ ] Tooltip `?` ao lado de **Qtd. Líquida** → "É o peso APROVEITÁVEL... 1 kg de maracujá rende 350 g de polpa"

### APP-17 — Nota fator de perda
- [ ] Quando **Perda %** > 0 (ex: maracujá), aparece nota:
  - "Fatores de perda baseados em referências do setor (Tabela TACO e literatura de food cost). Ajuste se o seu rendimento real for diferente."

### APP-18 + APP-05 — Editar tudo (incluindo categoria)
- [ ] No form do insumo, todos os campos editáveis (nome, marca, categoria, qty, preço, unidade)
- [ ] Trocar a categoria pelo PickerSelect funciona → salva

---

## 🍰 4. CADASTRO DE PREPAROS (APP-06, APP-08, APP-09)

### APP-06 — Editar ingrediente do preparo (sem excluir)
- [ ] Abrir um preparo qualquer (ex: "Massa de bolo branca")
- [ ] **Tap em qualquer linha de ingrediente** (não no ✕, na linha)
- [ ] **Esperado:** abre modal pra editar quantidade
- [ ] Salvar → quantidade atualiza sem precisar excluir

### APP-08, APP-09 — Cascade de preço
- [ ] Voltar pra Insumos → editar preço do **ovo** (mudar de R$ X pra R$ Y)
- [ ] Voltar e abrir o preparo "Massa de bolo branca" (que usa ovo)
- [ ] **Esperado:** custo do ovo já está atualizado **automaticamente**
- [ ] Mesma coisa pra produtos: abrir produto que usa esse preparo → custo total propaga

---

## 🛍️ 5. CADASTRO DE EMBALAGENS (APP-35, APP-36)

### APP-35 — 3 inputs (qty + preço total + custo unitário)
- [ ] Cadastrar nova embalagem "Pote 100ml"
- [ ] Inputs visíveis: **Quantidade** (ex: 100) + **Preço total do pacote** (ex: R$ 100)
- [ ] **Custo por unidade** aparece automaticamente: **R$ 1,00** (calculado)

### APP-36 — Embalagem padrão por categoria (NOVO)
- [ ] No mesmo form, role até embaixo → **"Definir como padrão para:"**
- [ ] Microcopy: "Quando você cadastrar um novo produto nessas categorias, esta embalagem virá pré-selecionada."
- [ ] Lista de chips com todas as categorias de produto
- [ ] Selecionar 1 ou 2 categorias (ex: "Bolos") → salvar
- [ ] **Cadastrar novo produto** → escolher categoria "Bolos"
- [ ] **Esperado:** embalagem "Pote 100ml" já vem **pré-selecionada** no produto
- [ ] Pode trocar manualmente
- [ ] **⚠️ Se não funcionar:** rode o bundle SQL no Supabase

---

## 🍽️ 6. CADASTRO DE PRODUTOS (APP-19, APP-21, APP-37)

### APP-19 + APP-21 — Fórmula completa + nomenclatura padronizada
- [ ] Criar/editar um produto com insumos
- [ ] Card "Análise de Custos" mostra: **CMV / Sugerido / Lucro Líquido / Margem Líq.** (não mais só "Lucro" ambíguo)
- [ ] Tap em **"Sugerido"** (com ícone `?`) → abre modal **"Como esse preço foi calculado?"**
- [ ] Modal mostra a quebra completa: CMV + Lucro % + Custos fixos % + Custos variáveis % = Preço final
- [ ] Modal explica a fórmula em linguagem clara

### APP-37 — Preço sugerido em tempo real
- [ ] No form do produto, mudar quantidade de qualquer insumo
- [ ] **Esperado:** Preço sugerido recalcula instantaneamente, sem delay perceptível

### APP-38 — Toast ao salvar combo
- [ ] Cadastrar combo → salvar
- [ ] **Esperado:** toast verde "✓ Combo criado com sucesso" aparece e some sozinho
- [ ] Combo aparece na lista imediatamente (otimistic update)

---

## 🚚 7. DELIVERY (APP-25, 26, 27, 27b, 28, 29, 29b)

Acesso: **Mais → Delivery**

### APP-29 + APP-29b — Plataformas reorganizadas
- [ ] Tab **Plataformas** → expandir uma (ex: iFood)
- [ ] **Esperado:** duas seções:
  - **"Custos sempre aplicados"**: Comissão da plataforma (%) + Taxa de pagamento online (%)
  - **"Promoções recorrentes"**: Cupom de desconto (R$) + Frete subsidiado (R$) — opcional
- [ ] Defaults pré-cadastrados: iFood 27% + 3,2%, Rappi 25% + 3%, 99Food 22% + 3%, Uber 30% + 3%, Site Próprio 0%+0%
- [ ] Toggle ativar/desativar funciona

### APP-25 + APP-27 — Fórmula completa + comparação balcão
- [ ] Tab **Precificação** (DeliveryPrecos)
- [ ] Ver lista de produtos com plataformas → para cada produto+plataforma:
  - **Sugerido** (calculado com fórmula completa)
  - Tap em "Sugerido" → modal **"Como calculado"** mostra: CMV + cupom + frete = numerador / 1 - (lucro + fixo + imposto + comissão + taxa pgto online) = preço
- [ ] **Esperado:** preço delivery iFood é maior que balcão (regra: comissão + taxas fazem aumentar)
- [ ] Se delivery < balcão → banner vermelho "Erro de cálculo detectado"

### APP-27b — Validação soma % >= 100%
- [ ] Cenário extremo: configurar lucro 50% + custos fixos 30% + imposto 5% + comissão 25%
- [ ] **Esperado:** banner vermelho "Seus percentuais somam X% — é impossível ter lucro"

### APP-26 — Lucro delivery configurável
- [ ] Configuração financeira tem `lucro_desejado_delivery` (após rodar a migration anterior)
- [ ] Se não tiver, usa o lucro do balcão como fallback (sem quebrar)

### APP-28 — Simulador em lote (NOVO)
- [ ] Tab **"Simulador em Lote"** (novo)
- [ ] **Esperado:** tabela com TODOS os produtos × TODAS as plataformas
- [ ] Colunas: Produto / CMV / Balcão / iFood / Rappi / 99Food / etc.
- [ ] Indicadores ✅ verde / ⚠️ amarelo / ❌ vermelho por linha
- [ ] Tap em qualquer cell de preço → abre modal "Como calculado" daquele produto+plataforma
- [ ] Legenda no rodapé explica os ícones

---

## 📊 8. PAINEL (APP-41, 42, 43, 44, 47)

Acesso: **Home (tab início)**

### APP-42 — Tabs Geral / Balcão / Delivery (NOVO)
- [ ] No topo do painel, **segmented control** com 3 opções: 🌐 Geral / 🛍️ Balcão / 🚚 Delivery
- [ ] Tap em "Balcão" → ver card **"Visão balcão"**:
  - Vendas/mês: 150 un (vem do APP-43)
  - Ticket médio (estimado)
  - Faturamento estimado
- [ ] Tap em "Delivery" → mesma coisa pro delivery
- [ ] Se ainda não preencheu volumes (APP-43): card mostra "Informe o volume de vendas no Financeiro"

### APP-41 — KPIs principais funcionam
- [ ] CMV Médio + Resultado Operacional + Ponto de Equilíbrio + Margem Líquida visíveis
- [ ] Tap em CMV ou Margem → abre modal pra editar a meta

### APP-46 — Hint para parâmetros editáveis
- [ ] **Configurações** → toggle "Análise avançada" ativo
- [ ] **Esperado:** linha de hint "💡 Ajuste os limites no Painel: clique em qualquer KPI..."

### APP-47 — Controle de estoque oculto
- [ ] **Esperado:** menu não tem "Controle de estoque" (foi removido)

---

## 📋 9. LISTA DE COMPRAS (APP-39)

Acesso: **Mais → Lista de Compras**

### APP-39 — Quantidades corretas
- [ ] Adicionar 2 bolos + 30 mousses
- [ ] **Esperado:** lista soma corretamente:
  - Açúcar: agrupado dos dois produtos
  - Maracujá: aplica fator de perda (200g de polpa → ~571g de fruta com casca)
  - Conversão de unidades respeitada (g↔kg)
- [ ] Insumos repetidos aparecem em UMA linha agrupada

---

## 🎁 10. KIT DE INÍCIO (APP-51, APP-52)

### APP-52 — Múltiplos kits sem sobrescrever (NOVO)
- [ ] **Configurações → Aplicar Kit** → selecionar Confeitaria → Aplicar
- [ ] Após sucesso, voltar e **aplicar de novo** (Confeitaria 2x)
- [ ] **Esperado:** mensagem final: **"Pronto! 0 insumos... X itens já existiam e foram preservados."**
- [ ] Aplicar OUTRO kit (ex: Lanchonete) → adiciona novos sem apagar os de Confeitaria

---

## 📄 11. PDF / FICHA TÉCNICA (APP-49)

Acesso: **Produtos → abrir um → Exportar PDF**

### APP-49 — Modo de preparo no PDF
- [ ] Editar um produto → preencher campo "Modo de preparo" com lista
- [ ] Exportar PDF
- [ ] **Esperado:** seção "Modo de Preparo" aparece no PDF abaixo dos ingredientes (com quebras de linha preservadas)

---

## 🆘 12. SUPORTE (APP-54)

Acesso: **Configurações → Central de Suporte**

### APP-54 — Vídeo placeholder + WhatsApp + Email
- [ ] Topo da tela: card **"Vídeo tutorial em produção"** (com ícone play, em destaque)
- [ ] Logo abaixo: **2 botões grandes lado a lado**:
  - 💬 **WhatsApp** (verde)
  - ✉️ **E-mail** (verde escuro)
- [ ] Tap no WhatsApp → abre wa.me com mensagem pronta (número placeholder por ora)
- [ ] Tap no E-mail → abre cliente de email com `contato@precificaiapp.com`

---

## 🔙 13. NAVEGAÇÃO CONFIGURAÇÕES (APP-12, APP-13)

### APP-12 + APP-13 — Voltar para Configurações
- [ ] Em qualquer subseção (Perfil, Conta, Suporte, Termos, Privacidade, Sobre, Notificações)
- [ ] **Esperado:** topo tem link **"← Voltar para Configurações"** sempre visível
- [ ] Tap volta corretamente
- [ ] Após salvar email/senha → volta automático pra Configurações

---

## 🛠️ AÇÕES PENDENTES SUAS

### 1. Rodar migrations no Supabase (5 min)

Pra **APP-36** e **APP-43** persistirem corretamente, cole no SQL Editor do Supabase Dashboard:

```sql
-- APP-36: Embalagem padrão por categoria
CREATE TABLE IF NOT EXISTS embalagem_categoria_padrao (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  embalagem_id BIGINT NOT NULL REFERENCES embalagens(id) ON DELETE CASCADE,
  categoria_id BIGINT NOT NULL REFERENCES categorias_produtos(id) ON DELETE CASCADE,
  canal TEXT NOT NULL DEFAULT 'balcao' CHECK (canal IN ('balcao', 'delivery')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, categoria_id, canal)
);
ALTER TABLE embalagem_categoria_padrao ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user can manage own embalagem_categoria_padrao" ON embalagem_categoria_padrao;
CREATE POLICY "user can manage own embalagem_categoria_padrao"
  ON embalagem_categoria_padrao FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_emb_cat_padrao_user_cat_canal
  ON embalagem_categoria_padrao (user_id, categoria_id, canal);

-- APP-43: Quantitativo de vendas por canal
ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS vendas_mes_balcao INTEGER DEFAULT 0;
ALTER TABLE configuracao ADD COLUMN IF NOT EXISTS vendas_mes_delivery INTEGER DEFAULT 0;
```

### 2. Antes do go-live público
- [ ] APP-53: substituir placeholders Aplicais (CNPJ + razão social + endereço) em `TermosScreen.js` e `PrivacidadeScreen.js`
- [ ] APP-54: gravar vídeo tutorial + decidir/atualizar número de WhatsApp real
- [ ] LP-01 a LP-10: revisão da landing page

---

## ⚠️ Se algo não funcionar

Cada item acima tem o ID (APP-XX). Reporte qual deu errado citando o ID e o sintoma — vamos direto na linha do código.

**Hard refresh obrigatório:** `Ctrl+Shift+R` no Chrome/Edge ou `Cmd+Shift+R` no Mac.

Bundle live: `index-8b4f3502bb851e1e5f65d1dfe9442dbd.js` — confirme em DevTools → Network.

---

## 📊 RESUMO DOS TICKETS

**Total de tickets cobertos:** 40 itens (APP-01 a APP-54, exceto APP-45 que é V2)

**Status:**
- ✅ **31 implementados e prontos pra validar** nesta build
- 🟡 **3 dependem de migration SQL** (APP-36, APP-43, APP-26 — rodar bundle no SQL Editor)
- 🟡 **2 dependem de conteúdo externo** (APP-53 dados Aplicais, APP-54 vídeo + WhatsApp real)
- ❓ **1 V2** (APP-45 customização de widgets)
- ❓ **3 QA manuais** (QA-01 planilha Flora, QA-02 refazer teste, QA-03 mobile nativo)

Bom teste! 🚀
