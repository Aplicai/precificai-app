# ✅ CHECKLIST RODADA 2 — Feedback Daniele

**Bundle live:** `index-e34a02c779f0921857bb9158884d8b91.js`
**URL:** https://app.precificaiapp.com
**Hard refresh obrigatório:** `Ctrl+Shift+R`

> ⚠️ Antes de testar D-22, D-26 e D-29, rodar no SQL Editor do Supabase Dashboard o bundle de migrations da rodada 2 (no fim deste checklist).

---

## 🌊 ONDA A — Bugs visíveis + remoções

### D-01 — Validação de senha
- [ ] Tela de Cadastro
- [ ] Digitar senha sem letra maiúscula → tentar enviar
- [ ] **Esperado:** erro "A senha precisa ter pelo menos 1 letra MAIÚSCULA"
- [ ] Repetir pra cada critério: minúscula, número, mínimo 8 caracteres

### D-02 — Sair da conta no mobile
- [ ] Configurações (tab Mais → Configurações)
- [ ] Rolar até o fim
- [ ] **Esperado:** botão vermelho **"Sair da conta"** + email exibido abaixo
- [ ] Tap → confirmação → desloga

### D-03 — "Salvar e voltar" navega pro Painel
- [ ] Configurações Financeiras → tap em "Salvar e voltar ao painel"
- [ ] **Esperado:** vai pro **Painel Geral (Home)**, não mais pra tela aleatória

### D-04 — Margem de segurança salva
- [ ] Configurações Financeiras → Step 1 → Margem de Segurança
- [ ] Digitar **10%** → confirmar
- [ ] **Esperado:** valor persiste; recarregar tela → continua 10%
- [ ] Repetir com 25%, 35%

### D-05 — Combo toggle some da lateral
- [ ] Configurações → toggle "Combos / Kits" ON
- [ ] Sidebar / Mais → "Combos" aparece
- [ ] Voltar e desligar toggle
- [ ] **Esperado:** "Combos" some imediatamente da Sidebar/Mais

### D-06 — Unidade do insumo correta no produto
- [ ] Insumos → criar "Maracujá Teste" → unidade **kg** → quantidade bruta 1000 → líquida 350 → preço R$ 8 → salvar
- [ ] Produtos → criar produto novo → adicionar "Maracujá Teste" como insumo
- [ ] **Esperado:** linha aparece com unidade **kg** (não mais "un")
- [ ] Repetir com `g`, `L`, `mL`

### D-07 — Embalagem padrão pré-seleciona (após migration)
- [ ] Embalagens → criar "Pote 100ml" → marcar categoria "Bolos" como padrão → salvar
- [ ] Produtos → criar novo → escolher categoria "Bolos"
- [ ] **Esperado:** "Pote 100ml" já aparece pré-selecionado

### D-08 — Plataformas com defaults
- [ ] Delivery → Plataformas → seção "Adicionar Plataforma"
- [ ] **Esperado:** chips com iFood/Rappi/99Food/Uber/Site Próprio (mostrando taxa)
- [ ] Tap em "iFood" → adiciona com **27% comissão + 3,2% taxa pgto online**

### D-09 — PDF sem página em branco
- [ ] Produtos → exportar PDF de qualquer produto
- [ ] **Esperado:** primeira página já tem o conteúdo (não mais cabeçalho isolado)

### D-10 — Volume de vendas removido
- [ ] Configurações Financeiras → Step 2 (Faturamento)
- [ ] **Esperado:** seção "Volume de vendas por canal" **NÃO** existe mais

### D-11 — Botão Replicar removido
- [ ] Faturamento mês a mês → preencher Janeiro
- [ ] **Esperado:** botão "Replicar valor para todos os meses" **NÃO** existe mais

### D-13 — Tooltip Pró-labore só ao adicionar
- [ ] Custos do mês → "Selecione para adicionar"
- [ ] **Esperado:** chip "Pró-labore" sem ícone `?` ao lado (limpo)
- [ ] Tap no chip → modal abre com explicação do conceito **no título**: "Pró-labore  💡 Quanto você se paga pelo trabalho. Sugestão: R$ 1.518,00+"

---

## 🌊 ONDA B — UX cadastro

### D-14 — Tooltip taxa maquininha
- [ ] Custos por venda → tap no `?`
- [ ] **Esperado:** explicação clara: "NÃO cadastre as taxas de débito e crédito separadas... Use só UMA Taxa maquininha (média)"
- [ ] Exemplo visível: "60% crédito (3,5%) + 40% débito (1,5%) = média 2,7%"

### D-15 — Salvar produto rápido
- [ ] Produto com 5+ insumos + 2 preparos + 1 embalagem
- [ ] Tap em Salvar
- [ ] **Esperado:** salva em **menos de 1 segundo** (era 5s)

### D-16 — Marca dos insumos visível
- [ ] Cadastrar 2 insumos com mesmo nome ("Açúcar") e marcas diferentes ("União" e "Caravelas")
- [ ] Adicionar ambos num produto
- [ ] **Esperado:** linha mostra nome em cima e **marca em itálico** abaixo

### D-17 — Editar preço inline no produto
- [ ] Form do produto → tabela de insumos → tap em qualquer **valor de Custo** (com ícone ✏)
- [ ] **Esperado:** modal "Atualizar preço do insumo" abre
- [ ] Mudar preço → "Salvar e propagar"
- [ ] **Esperado:** preço atualiza no insumo, no preparo, no produto, em TODA a aplicação (cascade)

### D-19 — Cascade automático
- [ ] Após salvar novo preço (D-17), abrir tela de Insumos → preço novo está lá
- [ ] Abrir um preparo que usa esse insumo → custo recalculado
- [ ] Abrir um combo que usa esse produto → custo recalculado

---

## 🌊 ONDA C — Delivery

### D-22 — Salvar preço delivery por plataforma (após migration)
- [ ] Delivery → Precificação → expandir um produto
- [ ] Editar o preço delivery numa plataforma (ex: iFood)
- [ ] **Esperado:** botão verde ✓ aparece ao lado do input
- [ ] Tap em ✓ → salva
- [ ] **Esperado:** ícone muda pra check verde indicando "salvo"
- [ ] Recarregar a tela → valor persistido

### D-24 — Simulador em Lote inline
- [ ] Delivery → tab "Simulador em Lote"
- [ ] **Esperado:** abre **dentro do hub** (não mudar de tela), com mesma navegação das outras tabs

### D-25 — Cabeçalho educativo
- [ ] Delivery → Precificação
- [ ] **Esperado:** card no topo "Como o preço delivery é calculado" explicando que considera tudo (CMV + custos fixos + impostos + comissão + etc)

---

## 🌊 ONDA D — Kits + Fator de Correção

### D-26 — Aviso persistente sobre valores estimados
- [ ] Aplicar Kit Confeitaria
- [ ] Voltar ao Painel
- [ ] **Esperado:** banner amarelo aparece: "Confira os preços dos seus insumos (X de Y estão estimados)"
- [ ] Atualizar 1 insumo → contador desce. Atualizar todos → banner some

### D-27/D-28 — Fator de correção pré-preenchido
- [ ] Aplicar Kit Confeitaria
- [ ] Abrir insumo "Batata inglesa" (ou qualquer com perda conhecida — banana, frango com osso, etc.)
- [ ] **Esperado:** quantidade líquida já vem ajustada (ex: batata inglesa 1000g bruta → ~847g líquida, FC ≈ 1,18)
- [ ] Nota TACO aparece automaticamente

### D-29 — Aplicar kit com 2 opções
- [ ] **Configurações → Aplicar Kit** → selecionar segmento → Aplicar
- [ ] **No mobile:** alerta com 3 botões: "Cancelar / Adicionar aos existentes / Substituir tudo"
- [ ] **No web:** confirm: "OK = Adicionar / Cancelar = abre 2º confirm pra Substituir"
- [ ] Testar "Adicionar aos existentes": kit aplicado preserva insumos atuais
- [ ] Testar "Substituir tudo": apaga e recria

### D-26 (segmentos novos) — Preços médios pros 11 segmentos
- [ ] Aplicar Kit **Hamburgueria** → ver insumos com preços médios (carnes ~R$ 38, queijo cheddar ~R$ 45, etc.)
- [ ] Repetir pros outros: Pizzaria, Restaurante, Padaria, Marmitaria, Açaí, Cafeteria, Sorveteria, Salgaderia, Japonesa
- [ ] **Esperado:** todos vêm com preços + badge "valor estimado"

---

## 🌊 ONDA E — Combo + PDF

### D-30 — Card combo igual produto
- [ ] Delivery → Combos → ver lista
- [ ] **Esperado:** cards mostram **CMV / Preço de Venda / Lucro Líquido / Margem Líq.** (alinhado com produtos)

### D-31 — Cabeçalho PDF maior
- [ ] Exportar PDF de produto
- [ ] **Esperado:** cabeçalho ocupa parte significativa do topo, "Precificaí" com 42px (era 24px), nome da loja com 20px (era 14px)

---

## 🛠️ MIGRATIONS PENDENTES — Rodar no SQL Editor

```sql
-- D-20: Embalagens nos preparos (estrutura pra futuro UI)
CREATE TABLE IF NOT EXISTS preparo_embalagens (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  preparo_id BIGINT NOT NULL REFERENCES preparos(id) ON DELETE CASCADE,
  embalagem_id BIGINT NOT NULL REFERENCES embalagens(id) ON DELETE CASCADE,
  quantidade_utilizada REAL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE preparo_embalagens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user can manage own preparo_embalagens" ON preparo_embalagens;
CREATE POLICY "user can manage own preparo_embalagens"
  ON preparo_embalagens FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_preparo_embalagens_preparo ON preparo_embalagens (preparo_id);

-- D-22: Preço de delivery por produto × plataforma
CREATE TABLE IF NOT EXISTS produto_preco_delivery (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  produto_id BIGINT NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
  plataforma_id BIGINT NOT NULL REFERENCES delivery_config(id) ON DELETE CASCADE,
  preco_venda REAL NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, produto_id, plataforma_id)
);
ALTER TABLE produto_preco_delivery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "user can manage own produto_preco_delivery" ON produto_preco_delivery;
CREATE POLICY "user can manage own produto_preco_delivery"
  ON produto_preco_delivery FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_ppd_user_produto ON produto_preco_delivery (user_id, produto_id);
```

---

## ⚠️ Itens **NÃO** implementados nesta rodada (precisam de mais info)

- **D-12** — Ícone "trocar insumo" no produto: sem screenshot fica difícil identificar qual ícone exatamente. Manda print que removo.
- **D-18** — Editar preparo direto no form do produto: implementado parcialmente (D-17 cobre insumo). Pra preparo precisa decidir se abre modal próprio ou navega.
- **D-20 (UI)** — Embalagens em preparos: schema criado (migration), UI ainda não. Próxima rodada.
- **D-23 (performance delivery)** — Algumas otimizações ainda pendentes. SimuladorLote agora é inline (D-24) — testar se já melhorou percepção de lentidão.

---

## 📊 Total

**31 itens (D-01 a D-31) — 28 implementados, 3 pendentes.**

Bundle live: `index-e34a02c779f0921857bb9158884d8b91.js` em `https://app.precificaiapp.com`.
