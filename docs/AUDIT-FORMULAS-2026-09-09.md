# Auditoria de fórmulas — Precificaí — 2026-09-09

**Escopo:** todas as fórmulas que o usuário vê, ponta a ponta (ingrediente → receita base → produto → preço sugerido → delivery → combo → ranking → Home → Relatórios → Lista de Compras → DRE), verificadas contra cálculo manual.
**Evidência executável:** `__tests__/audit-formulas-2026-09-09.test.mjs` (45 casos; 41 passam, **4 falham de propósito** — cada um marcado `// BUG:` prova um bug listado abaixo e passa a verde quando o bug for corrigido).
**Método:** funções puras importadas de `src/` (via `__tests__/audit-loader.mjs`); lógica que só existe dentro de telas React Native foi replicada no teste com `arquivo:linha` de origem. Somente leitura em `src/` — nada foi alterado no app.

Legenda: ✔ correto · ✘ bug · ⚠ inconsistente na UI / risco de interpretação.

---

## Resumo executivo

| # | Tema | Veredito | Resumo |
|---|------|----------|--------|
| 1 | Ingrediente (preço/kg, L, un, fator de correção) | ✔ | Fórmulas corretas, unidades legadas ("Grama(s)") resolvidas, perda aplicada uma única vez. `dz` não é reconhecida (vira "unidade"). |
| 2 | Receita base (custo total, custo/kg, sub-receitas, cascata) | ✘ 1 bug | Custo/kg e sub-receitas corretos; cascata converge. **Embalagem dentro da receita NÃO entra no custo** apesar do texto da tela dizer que entra. |
| 3 | Produto (CMV, preço sugerido, lucro bruto × líquido) | ✔ | Mark-up, CMV máximo, FAQ, ProdutoForm e engine concordam entre si (mesma fórmula em 5 lugares). |
| 4 | Delivery ("mesmo lucro", "sugerido", lucro por venda, comissão 0) | ✔ cálculo / ⚠ UI | Os números de prod (**R$ 26,49 / R$ 12,30 / R$ 9,22**) estão certos pela fórmula — mas só fecham com fixos **22,78 %** (não 22,22 %), imposto reconhecido **0 %** e margem de segurança **5 %**. Três telas mostram três "sugeridos" diferentes; legenda da tela Preços promete "mesmo lucro do balcão" e não entrega. |
| 5 | Combos | ✘ 2 bugs / ⚠ | Soma × qtd e mark-up divisor corretos; sem dupla contagem de embalagem. **Insumo em kg dentro do combo custa 1000× diferente entre o modal e a lista.** Card rotula "Lucro Líquido" mas mostra lucro bruto. |
| 6 | Ranking (Matriz BCG) | ✔ / ✘ 1 bug | Usa margem BRUTA e diz isso explicitamente; medianas e caso de 1 produto corretos. **Custo do combo no ranking confunde id de embalagem/insumo com id de produto.** |
| 7 | Home (CMV médio, sobra do mês, mínimo pra pagar as contas, sobra por venda) | ✔ / ⚠ | "R$ 3.765,88 / dia R$ 125,53" consistente (÷30). "Sobra do mês" ignora CMV e variáveis e pode contradizer o card ao lado. |
| 8 | Relatórios ("De cada R$ 10,00…") | ✔ / ✘ 1 bug | 1,65 + 2,28 + 1,15 + 4,92 = 10,00 ✔. **"Ponto de Equilíbrio Traduzido" usa fórmula diferente da Home/Simulador/FAQ** (1,5–2,5× maior). |
| 9 | Lista de Compras | ✔ / ⚠ | 350 g de receita de 700 g × 3 → 750 g ✔. Quantidade lida com `parseInt` (fração some); produto "por kg" tratado como unidade. |
| 10 | DRE / Fluxo de caixa | ✔ | Receita líquida → lucro bruto → operacional → líquido; saldo = inicial + entradas − saídas. |

---

## 1. Ingrediente — `src/utils/calculations.js`

**Fórmula no código**
- `calcPrecoBase(valorPago, qtdLíquida, unidade)` (L.147): peso/volume → `valor / converterParaBase(qtd) × 1000` (R$ por kg ou L); unidade → `valor / qtd` (R$/un); `qtd ≤ 0` → 0.
- `calcFatorCorrecao(bruta, líquida)` (L.166) = `líquida / bruta` (≤ 1); `bruta ≤ 0` → 1. Só informativo: o preço usa **a quantidade líquida direto**, então a perda entra uma vez só.
- `normalizarUnidade` (L.98) aceita "Grama(s)", "Quilograma(s)", "Litro(s)", "ml", "l", "UN.", "Unidades"…; `converterParaBase` usa isso como fallback.

**Exemplos (testes 1.1–1.6)**
| Entrada | Esperado à mão | Código |
|---|---|---|
| R$ 10 / 500 g | 10 ÷ 0,5 kg = **R$ 20/kg** | 20 ✔ |
| R$ 10 / 0,5 kg | R$ 20/kg | 20 ✔ |
| R$ 10 / 250 mL | **R$ 40/L** | 40 ✔ |
| R$ 12 / 30 un | **R$ 0,40/un** | 0,40 ✔ |
| R$ 10 / "Grama(s)" 500 | = 'g' | 20 ✔ |
| líquida vazia / 0 / "abc" | 0 (sem Infinity) | 0 ✔ |
| 1 kg bruto R$ 8, líquida 800 g, usa 250 g | 8/0,8 = R$ 10/kg → 250 g = **R$ 2,50** | 2,50 ✔ |

**Veredito:** ✔ correto.
⚠ `dz` (dúzia) não é reconhecida: cai em "unidade" → R$ 12 por "1 dz" vira R$ 12/un (teste 1.4). O form não avisa. Cadastrar como "12 un".
⚠ `calcFatorCorrecao(800, 1000)` = 1,25 (líquida > bruta) não é travado — o form deveria validar.

## 2. Receita base — `calculations.js` + `src/services/cascadeRecalc.js` + `PreparoFormScreen.js`

**Fórmula no código**
- `calcCustoPorKgPreparo(custoTotal, rendimento, unidade)` (L.84) = `custoTotal / converterParaBase(rendimento) × 1000` → "custo por 1000 unidades-base" (kg, L ou 1000 un).
- `calcCustoPreparo(custoKg, qtd, unidadeUso)` (L.229) = `converterParaBase(qtd)/1000 × custoKg`.
- `PreparoFormScreen.js:300-319`: `custoTotal = custoInsumos + custoSubpreparos`; `custoKg = calcCustoPorKgPreparo(...)`.
- `cascadeRecalc.recalcularPreparo` (L.41): insumos + sub-preparos (custo_por_kg atual) → grava `custo_por_kg`. `recalcularPreparosDoInsumo` sobe pelos pais até 5 níveis; `recalcularTodosPreparos` itera até estabilizar.

**Exemplos (testes 2.1–2.4)**
| Caso | À mão | Código |
|---|---|---|
| R$ 20 rende 2 kg / 2000 g | R$ 10/kg | 10 ✔ (ambas grafias) |
| R$ 6 rende 1,5 L / 1500 mL | R$ 4/L | 4 ✔ |
| R$ 5 rende 10 un | R$ 500 "por 1000 un" → 1 un = R$ 0,50 | ✔ |
| massa 700 g: 500 g farinha R$ 5/kg + 200 g açúcar R$ 4/kg | R$ 3,30 → R$ 4,714/kg → 350 g = **R$ 1,65** | ✔ |
| bolo 1 kg = 300 g insumo (R$ 20/kg) + 500 g recheio (R$ 10/kg) | 6 + 5 = **R$ 11,00 = R$ 11/kg** | ✔ (rendimento "1 kg" convertido, não 11.000) |
| insumo sobe de 20 → 30/kg | preparo 10 → 15; pai 5 → 7,50 | ✔ cascata direcionada |

**Veredito:** ✔ cálculo; **✘ 1 bug**:
- **[B1] Embalagem dentro da receita base não entra no custo.** `PreparoFormScreen.js:883` diz *"O custo entra no total do preparo"*, mas `custoTotal` (`PreparoFormScreen.js:317`) e `cascadeRecalc.recalcularPreparo` (`cascadeRecalc.js:41-77`) somam só insumos + sub-preparos; `preparo_embalagens` só é lida para exibir a linha (`:927`). Teste **2.5** (`// BUG:` falha): insumos R$ 5 + embalagem R$ 1,50 deveria dar R$ 6,50, dá R$ 5,00.

## 3. Produto — `ProdutoFormScreen.js`, `precificacao.js`, `FinanceiroConfigScreen.js`, `SuporteScreen.js`

**Fórmula no código**
- CMV: `custoTotalReceita = insumos + preparos + embalagens` (`ProdutoFormScreen.js:490-509`); unitário = `/ rendimento_total` (kg/L) ou `/ rendimento_unidades` (`:512`). `getDivisorRendimento` (calculations.js:261) idem para as outras telas.
- Mark-up: `calcMarkup(fixos%, var%, lucro%) = 1/(1 − fixos − var − lucro)` (calculations.js:246); `≥ 100 %` → 0.
- Preço sugerido: `custoUnitario × (1 + margemSegurança) × markup` (`ProdutoFormScreen.js:538`) ≡ engine `calcularPrecoBalcao` (`precificacao.js:141`) ≡ `calcPrecoSugerido`.
- Lucro líquido: `preço − CMV − preço×fixos% − preço×var%` (`calcLucroLiquido`, `calcularLucroLiquido`); margem líquida = lucro/preço; lucro bruto = `preço − CMV` (`calcMargem`).
- CMV máximo (`FinanceiroConfigScreen.js:605`) = `1 − fixos − var − lucro`.

**Exemplos (testes 3.1–3.7)**
| Caso | À mão | Código |
|---|---|---|
| Mark-up com lucro 15 %, fixos 22,22 %, var 11,5 % | 1/(1−0,15−0,2222−0,115) = 1/0,5128 = **1,950** → "1,95x" | ✔ |
| CMV máximo | 1 − 0,4872 = **51,28 %** | ✔ |
| Preço sugerido CMV 4,13 | 4,13 × 1,950 = **R$ 8,05** — FAQ = mark-up = engine | ✔ (3 caminhos iguais) |
| Com margem de segurança 5 % | 4,13 × 1,05 × 1,950 = R$ 8,46 | ✔ ProdutoForm = engine |
| Composição do sugerido | CMV + lucroR + fixoR + varR = preço; margem líquida no sugerido = 15 % | ✔ |
| Balcão R$ 25, CMV 4,13, fixos 22,78 %, var 11,5 % | bruto **20,87 (83,5 %)**; líquido 25 − 4,13 − 5,70 − 2,88 = **12,30 (49,2 %)** | ✔ |
| Bolo 2 ing + 1 preparo + 1 emb, rende 4 un (cascade) | 12,20 / 4 = 3,05 | ✔ |
| Soma ≥ 100 % | markup 0, preço 0, `validarSomaPercentual` inviável | ✔ |

**Veredito:** ✔ correto e consistente.
⚠ `calcDespesasFixasPercentual(fixas, faturamento=0)` = 0: sem faturamento cadastrado, **os custos fixos somem do preço em silêncio** (teste 3.7). Financeiro mostra "falta faturamento" (`:650`), mas ProdutoForm/Home não avisam.
⚠ Tooltip `ProdutoFormScreen.js:1445` não menciona a margem de segurança que entra no sugerido.

## 4. Delivery — `deliveryPricing.js`, `deliveryAdapter.js`, `DeliveryHubScreen.js`, `DeliveryPrecosScreen.js`

**Fórmulas no código**
- Contexto: `buildContextoFinanceiro` (`deliveryAdapter.js:118`): `fixo% = Σfixas / média(faturamento > 0)`; `imposto% = Σ variáveis cuja descrição casa /imposto|icms|iss|issqn|simples|mei|das|tributo/`; `variavel% = Σ todas`.
- **"Mesmo lucro em R$"** (`calcPrecoMesmoLucroReais`, `deliveryPricing.js:279`): `preço = (lucroAlvoR$ + CMV + cupom + frete) / (1 − fixo% − imposto% − comissão% − taxaOnline% − outros%)`. O alvo vem do Hub (`DeliveryHubScreen.js:390-391`): `lucroBalcão = balcão − CMV − balcão×(fixo% + variável%)`.
- **"Sugerido (margem do financeiro)"** (`calcSugestaoDeliveryCompleta` → `calcularPrecoDelivery`): `preço = CMV×(1+seg) + cupom + frete) / (1 − lucro% − fixo% − imposto% − comissão% − taxaOnline% − outros%)`.
- **"Lucro estimado por venda"** nas linhas (`calcResultadoDelivery`, `deliveryPricing.js:70`): modelo LEGADO — `receitaLíq = preço×(1−desc) − cupom − (base+frete)×comissão − frete; lucro = receitaLíq − CMV` (**sem fixos, sem imposto**).
- Visão Geral do Hub e Comparativo (`sugerirPrecoDelivery`, `calcPrecoBreakEven`): margem BRUTA alvo 30 %, sem fixos.

**Exemplo de prod (testes 4.1–4.5)** — CMV 4,13 · balcão 25,00 · comissão 12 % · taxa online 3,2 %:

| Tela mostra | Recalculado à mão | Veredito |
|---|---|---|
| lucro balcão **R$ 12,30** | 25 − 4,13 − 25×(0,2278 + 0,115) = 25 − 4,13 − 8,57 = **12,30** | ✔ (só fecha com fixos = **22,78 %**; com 22,22 % daria 12,44) |
| mesmo lucro **R$ 26,49** | (12,30 + 4,13) / (1 − 0,2278 − 0,12 − 0,032) = 16,43 / 0,6202 = **26,49** | ✔ (exige imposto reconhecido = 0 %) |
| round-trip a 26,49 | 26,49 − 4,13 − 26,49×(0,2278 + 0,152) = **12,30** | ✔ |
| sugerido **R$ 9,22** | 4,13 × **1,05** / (1 − 0,15 − 0,2278 − 0,152) = 4,3365 / 0,4702 = **9,22** | ✔ (exige margem de segurança 5 %; sem ela 8,78; com 22,22 % 8,68) |

Conclusão: **os dois números estão certos pela fórmula**. Os parâmetros implícitos que fazem fechar são: custos fixos **22,78 %** (o mesmo que aparece como "R$ 2,28 de cada R$ 10" no Relatório), **nenhuma despesa variável reconhecida como imposto** (as 11,5 % do balcão somem no delivery inteiras) e **margem de segurança 5 %** (só no sugerido; o "mesmo lucro" não usa).

**Comissão = 0 (teste 4.6):** "mesmo lucro" devolve `(12,30 + 4,13)/(1 − 0,2278)` = **R$ 21,28 < balcão 25** — porque as variáveis do balcão (maquininha etc.) são descartadas e nada as substitui; `compararDeliveryVsBalcao` classifica como "Erro de cálculo detectado". Modelo legado com comissão 0: lucro = preço − CMV (bruto). Sugerido completo com comissão 0 só iguala o balcão se `imposto% == variável%`.

**Vereditos**
- ✔ `calcPrecoMesmoLucroReais`, `calcularPrecoDelivery`, adapter e cupom/frete como custo absoluto (teste 4.7) — corretos e coerentes entre si.
- **✘ [B5] Legenda errada** — `DeliveryPrecosScreen.js:636`: *"Tudo somado pra você ter o mesmo lucro líquido do balcão"*. O sugerido dessa tela é `calcSugestaoDeliveryCompleta` = **lucro desejado % sobre o preço**, não o R$ do balcão. No exemplo, a R$ 9,22 sobra ≈ R$ 1,4 contra R$ 12,30 no balcão (teste 4.4), e o próprio app marca "crítico" por ser menor que o balcão.
- **⚠ [B6] Três "sugeridos" para o mesmo produto/plataforma** (teste 4.8): Preços = R$ 9,22 (lucro % + fixos); Hub Visão Geral (`DeliveryHubScreen.js:1025`, margem bruta 30 %) = R$ 7,54; Comparativo (`ComparativoCanaisScreen.js:208`, break-even sobre o balcão) = R$ 29,50.
- **⚠ [B7] Dois "lucros" para o mesmo preço** (teste 4.5): a R$ 26,49 a linha da tela Preços/Hub (`calcResultadoDelivery`) mostra lucro **R$ 18,33 (69 %)**; a "Composição com este preço" do Hub (`DeliveryHubScreen.js:900-906`) mostra **R$ 12,30**. Só a segunda desconta fixos e imposto.
- **⚠ [B8] "Lucro médio" do resumo ≠ linhas** — `DeliveryPrecosScreen.js:355-381`: `summaryStats` usa `calcDeliveryPrice` (**break-even** `balcão/(1−comissão)`) quando não há preço salvo, enquanto `renderPlatformRow` (`:396`) usa a fórmula completa. O card de resumo soma lucros de preços que não são os exibidos.
- **⚠ [B9] Variáveis do balcão somem no delivery sem aviso** — só nomes que casam a regex viram "imposto"; "Nota fiscal", "Tributação", "Taxas" etc. são descartadas (teste 4.1). O rótulo no Hub mostra "Imposto (0,0 %)" mas nada diz que 11,5 % foram ignorados.
- ⚠ Rótulo "Comissão plataforma (15,2 %)" no Hub (`:819, :918`) soma comissão + taxa online + outros sob um nome só, enquanto a plataforma cadastrada mostra 12 %.
- ⚠ `sugerirPrecoDelivery` (legado) ainda é usado como placeholder do input de preço custom (`DeliveryHubScreen.js:882`) com margem alvo 30 % bruta.

## 5. Combos — `DeliveryCombosScreen.js`, `precificacao.calcularPrecoCombo`, `cascadeRecalc.recalcularCombo`

**Fórmulas no código**
- Modal: `custoTotal = Σ custoUnit × quantidade` (`calcSomaItens`, `:741`), onde `custoUnit` vem de `getItemCustoEUnidade` (`:650`): produto/delivery_produto → `custoUnitario`; insumo → `calcCustoIngrediente(preço, 1, u, u)` (**1 unidade nativa**: "1 kg"); preparo → `calcCustoPreparo(custoKg, 1, u)`; embalagem → `preco_unitario`.
- Sugerido do combo (`:756`): `calcularPrecoCombo` = mark-up divisor sobre o total (lucro balcão + fixos + variáveis), desconto R$ ou % opcional com composição refeita.
- Card/lista: `lucro = preço − custo`; `margem = calcMargem` (bruta) (`:769-772`, `:844-847`).
- Lista/`loadData` (`:274, :280`), `DeliveryPrecosScreen.js:210,218`, `DeliveryProdutosScreen.js:163,166` e `cascadeRecalc.recalcularCombo` (`:118-125`): insumo/preparo com **`unidadeUso = 'g'`** (quantidade tratada como gramas).
- "Economia vs soma dos itens": **não existe** na tela — o combo mostra custo, preço, lucro, margem e sugerido apenas.

**Exemplos (testes 5.1–5.5)**
| Caso | À mão | Código |
|---|---|---|
| 2 × produto 4,13 + caixa 0,50 + 3 × insumo 0,40 | 9,96; sugerido 9,96/(1−0,15−0,2278−0,115) = **R$ 19,64**; composição fecha; desconto R$ 2 → 17,64 e lucro recalculado | ✔ |
| Produto com embalagem própria (R$ 0,50) ×2 + caixa do combo R$ 1,20 | (2,00+0,50)×2 + 1,20 = 6,20 — a embalagem do produto entra uma vez, a do combo é adicional | ✔ sem dupla contagem |
| Combo com "delivery_produto" | custo = `dp.custo` = Σ itens do produto delivery (produto base + extras) | ✔ (`DeliveryPrecosScreen.js:197-227`) |

**Vereditos**
- ✔ soma × qtd, mark-up divisor, desconto, sem dupla contagem de embalagem.
- **✘ [B2] Insumo/receita em kg ou L dentro do combo custa 1000× diferente entre o modal e o resto** (teste **5.4**, `// BUG:` falha). No modal (28.51) "1 kg de farinha a R$ 5/kg" = R$ 5,00 e a UI mostra o badge "kg"; ao salvar, `loadData` (`:274/:280`), `DeliveryPrecosScreen`, `DeliveryProdutosScreen` e `cascadeRecalc.recalcularCombo` recalculam com `'g'` → R$ 0,005. O card do combo muda de valor logo depois de salvar. (Para insumos em `g`/`un` os dois caminhos coincidem.) Observação: `audit-pricing-engine.test.mjs:418` fixa a semântica "gramas" para o cascade — é preciso escolher UMA semântica e alinhar as 5 ocorrências.
- **✘ [B4] Card rotula "Lucro Líquido" / "Margem Líq." mas calcula bruto** (`DeliveryCombosScreen.js:843-847` rótulos; `:769-772` e `:844-847` valores). Teste 5.2: preço 19,64 / custo 9,96 → card mostra **9,68 (49 %)**; líquido real (fixos 22,78 % + var 11,5 %) = **2,95 (15 %)**. O comentário `:832` ("alinhadas com card de produto — Lucro Líquido / Margem Líq.") confirma a intenção de ser líquido.

## 6. Ranking (Matriz BCG) — `src/utils/bcgClassify.js`, `MatrizBCGScreen.js`

**Fórmula no código**
- `margemPerc = (preço − custoUnitário)/preço × 100` (`MatrizBCGScreen.js:276`) — **BRUTA**, e a tela diz isso ("margem bruta", `:463`, `:686`, `:741`).
- `classificarMatrizBCG`: mediana da margem (todos com preço > 0) e mediana das vendas (só itens com venda > 0); `altaMargem = margem ≥ medianaMargem`; `altaVenda = qtd > 0 && qtd > medianaVendas` (estrito). < 2 itens válidos → todos "Quebra-Cabeça".
- Combos (`:294`): `custo = Σ prodCostMap[item.item_id] × qtd`.

**Exemplos (testes 5.5, 6.1, 6.2)**
| Caso | Esperado | Código |
|---|---|---|
| 1 produto | Quebra-Cabeça | ✔ |
| margens 83/40/70/30, vendas 100/90/5/0 | medianas 55 e 90 → Estrela / Abacaxi (90 = mediana ⇒ baixa venda) / Quebra-Cabeça / Abacaxi | ✔ |

**Veredito:** ✔ classificação; **✘ [B3] custo do combo no ranking** (teste **5.5**, `// BUG:` falha): `prodCostMap[item.item_id]` é consultado para **qualquer** tipo de item. Uma embalagem/insumo/preparo com `item_id = 3` recebe o custo do **produto** id 3 (no teste: R$ 12,00 em vez de R$ 0,50 → custo do combo 16,13 em vez de 4,63 → margem e quadrante errados). Itens não-produto deveriam usar seu custo próprio (ou ser somados como nas outras telas).

## 7. Home — `HomeScreen.js:206-236` (KPIs) e `:826-838` (cards)

**Fórmulas no código**
- CMV médio = `Σ custoUnit / Σ preço` dos produtos com preço (**não ponderado por vendas**).
- "Sobra do mês" (`resultadoFinanceiro`) = `faturamento médio − Σ fixas`.
- "Mínimo pra pagar as contas" (`pontoEquilibrio`) = `Σ fixas / (1 − CMV% − variáveis%)`; "por dia" = `/ 30` (`:346-348`).
- "Quanto sobra por venda" (`margemMedia`) = média simples de `calcMargemLiquida` por produto.

**Exemplos (testes 7.1–7.3)**
| Caso | À mão | Código |
|---|---|---|
| fixas 2.711,43; CMV 16,5 %; var 11,5 % | 2.711,43 / 0,72 = **R$ 3.765,88**; ÷30 = **R$ 125,53** | ✔ consistente com o visto em prod |
| 1 produto 25/4,13, fixos 22,78 %, var 11,5 % | sobra por venda = 12,30/25 = 49,2 % | ✔ |

**Veredito:** ✔ fórmulas e unidades (PE é mensal, "/dia" = ÷30 corridos). Tooltips (`:831`, `:837`) descrevem exatamente a conta do código.
- **⚠ [B10] "Sobra do mês" contradiz o card vizinho** (teste 7.2): com faturamento 3.500 e fixas 2.733, mostra **+R$ 767 "Receita cobre custos"**, enquanto "Mínimo pra pagar as contas" = 3.796 diz **"Falta R$ 296"**; o resultado real (descontando CMV e variáveis) é **−R$ 213**. O tooltip é honesto ("faturamento menos custos do mês"), mas o subtítulo "Receita cobre custos" (`:829`) é falso nesse cenário.
- ⚠ CMV médio não pondera por volume vendido — um produto caro e pouco vendido pesa igual a um barato e muito vendido; afeta o PE.

## 8. Relatórios — `RelatorioSimplesScreen.js:158-176` e `:187-203`

**Fórmula no código:** `percIng = Σ custoUn / Σ preço`; `percFixas = dfPerc`; `percVar = Σ variáveis`; `percLucro = 1 − percIng − percFixas − percVar`; cada um × 10 com 2 casas.

**Exemplo (teste 8.1):** produto 25/4,13, fixos 22,78 %, var 11,5 % → **"R$ 1,65 / R$ 2,28 / R$ 1,15 / sobram R$ 4,92"** — soma **10,00** ✔ e bate com o Financeiro (mesmas variáveis e mesmo `calcDespesasFixasPercentual`).
⚠ O "R$ 2,28" implica fixos = **22,8 %**, não os **22,22 %** citados do Financeiro (que dariam "R$ 2,22"). O código dos dois lugares é idêntico (`Σfixas / média(faturamento > 0)`); a divergência não é reproduzível pelo código — provável foto em momentos diferentes (faturamento/fixas editados entre telas) ou valor não salvo no wizard. Vale conferir em prod: se persistir, é bug de estado do `FinanceiroConfigScreen` (que usa `Number.isFinite(d.valor)` nas rows cruas, `:594-597`, enquanto as outras telas usam `safeNum`/`|| 0`).

- **✘ [B11] "Ponto de Equilíbrio Traduzido" com fórmula diferente** (teste **8.2**, `// BUG:` falha): `RelatorioSimplesScreen.js:190-193` faz `Σfixas / margemLíquidaMédia / 30`. A margem líquida **já desconta os fixos %**, então o divisor fica menor e o PE inflado — no teste **R$ 185,20/dia vs R$ 126,59/dia** da Home/Simulador (`HomeScreen.js:234`, `SimuladorScreen.js:441`, FAQ `SuporteScreen.js:78`). Correto: `Σfixas / (1 − CMV% − var%)`. (Já documentado como divergência em `audit-calculations.test.mjs:362`; continua aberto.)

## 9. Lista de Compras — `ListaComprasScreen.js:163-197, 208, 262-271`

**Fórmula no código:** por produto pedido, `qtdPorUnidade = quantidade_utilizada / rendimento_unidades`; insumo direto → `× unidades`; preparo → `proporcao = (qtdPreparo/rendUn × unidades) / rendimento_total_do_preparo` e cada insumo do preparo `× proporcao`; tudo convertido para g/mL/un e somado por insumo. Custo estimado = `totalBase / líquidaBase × valor_pago`.

**Exemplos (testes 9.1–9.3)**
| Caso | À mão | Código |
|---|---|---|
| 350 g de receita de 700 g com 500 g farinha × 3 | proporção 1,5 → **750 g**; custo 750/1000 × R$ 5 = **R$ 3,75** | ✔ |
| ficha rende 4 un, pede 3 | usa 3/4 da receita (187,5 g de farinha; 150 g do insumo direto) | ✔ (quantidades da ficha são por receita, coerente com o CMV) |
| farinha cadastrada em kg (líquida 1 kg) | mesmo custo | ✔ |

**Veredito:** ✔ escala e custo.
- ⚠ `parseInt(quantidades[id])` (`:208`, `:328`, `:495`, `:514`): "0,5" → 0 e "1,5" → 1 — frações são descartadas em silêncio.
- ⚠ Produto vendido **por kg/L** usa `rendimento_unidades || 1` como se fosse unidade: pedir "3" = 3 receitas inteiras (6 kg se a receita rende 2 kg), não 3 kg. A tela não indica a unidade do campo.
- ⚠ Embalagens de combos e de produtos não entram na lista (comentário `:239`) — coerente com "lista de insumos", mas o usuário pode esperar caixas.

## 10. DRE / Fluxo de caixa — `FluxoCaixaDREScreen.js:303-330`, `:936-946`

**Fórmula no código:** `receitaLíquida = bruta − deduções − devoluções`; `lucroBruto = receitaLíquida − CMV`; `operacional = lucroBruto − (fixas + variáveis)`; `líquido = operacional − outrasDespesas + outrasReceitas`; percentuais `= valor / receitaBruta`. Fluxo: `saldoFinal = saldoInicial + entradas − saídas` (itens com exclusão pendente ficam fora).

**Exemplos (testes 10.1–10.3)**
| Caso | À mão | Código |
|---|---|---|
| receita 12.000, CMV 1.980, var 1.380, fixas 2.733,60 | bruto 10.020 → **líquido 5.906,40 = 49,2 %** (= "sobram R$ 4,92") | ✔ |
| deduções 500 + devoluções 200, outras desp. 800, outras rec. 300 | 9.300 → 5.300 → 1.300 → **800** | ✔ |
| prejuízo | −500 (−10,0 %), sem clamp | ✔ |
| saldo 300 + 1.000 − 250,50 (item oculto fora) | **1.049,50** | ✔ |

**Veredito:** ✔ correto (complementa `audit-dre.test.mjs`).

---

## Onde a UI explica uma fórmula — confere com o código?

| Local | Texto | Código | Veredito |
|---|---|---|---|
| `SuporteScreen.js:52` (FAQ) | "Preço = Custo / (1 − Margem% − Desp.Fixas% − Desp.Variáveis%)" | `calcMarkup` / `calcularPrecoBalcao` | ✔ (teste 3.4) |
| `SuporteScreen.js:78` (FAQ) | PE = "faturamento mínimo mensal para cobrir todos os custos" | Home/Simulador `fixas/(1−CMV%−var%)` | ✔ Home · ✘ Relatório usa outra fórmula [B11] |
| `SuporteScreen.js:66` (FAQ) | "o preço no delivery geralmente precisa ser 20-30 % maior" | — | ⚠ conselho, não fórmula; exemplo de prod dá +6 % (26,49) ou −63 % (9,22) |
| `FinanceiroConfigScreen.js:645` | "Mark-up = 1 / (1 − fixos % − por venda % − lucro %); Preço = custo × mark-up" | `calcMarkup`, `ProdutoFormScreen.js:538` | ✔ (omite margem de segurança) |
| `FinanceiroConfigScreen.js:667` | "CMV máximo = 100 % − fixos − por venda − lucro" | `:605` | ✔ |
| `FinanceiroConfigScreen.js:793` | "Mark-up resultante: 1,95x" | `formatMarkup(calcMarkup)` | ✔ |
| `ComoCalculadoModal.js:100` | "Preço = (CMV + custos absolutos) ÷ (1 − lucro% − fixo% − variável%)" | `calcularPrecoSugerido` | ✔ (composição exibida fecha 100 %) |
| `ProdutoFormScreen.js:1445` | "preço sugerido = Mark-up sobre o custo unitário… custos do mês, por venda e margem" | `:538` | ✔ (⚠ não cita margem de segurança) |
| `HomeScreen.js:828` | "Conta: faturamento menos custos do mês" | `fatMedio − totalFixas` | ✔ literal · ⚠ subtítulo "Receita cobre custos" pode ser falso [B10] |
| `HomeScreen.js:831/346` | "Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas" | `fixas/(1−CMV%−var%)` | ✔ |
| `HomeScreen.js:837` | "Conta: preço menos ingredientes, custos do mês e taxas, dividido pelo preço" | `calcMargemLiquida` | ✔ |
| `MatrizBCGScreen.js:463, 686, 741` | "margem BRUTA = (preço − custo) ÷ preço, SEM fixas nem taxas" | `:276` | ✔ |
| `SimuladorScreen.js:444-449` | "Ponto de Equilíbrio … CMV médio + % por venda + R$ mensais" | `fixas/(1−CMV%−var%)` | ✔ |
| `DeliveryPrecosScreen.js:636` | "…pra você ter o mesmo lucro líquido do balcão" | `calcSugestaoDeliveryCompleta` (lucro % sobre o preço) | ✘ [B5] |
| `DeliveryHubScreen.js:795-806` | "Preço sugerido (sua margem do financeiro) — Pra atingir 15 % de lucro" | `calcSugestaoDeliveryCompleta` | ✔ |
| `DeliveryHubScreen.js:833-836` | "Pra ganhar o MESMO lucro em R$ do balcão — sobrar R$ 12,30 líquido" | `calcPrecoMesmoLucroReais` | ✔ (round-trip fecha) |
| `DeliveryHubScreen.js:819/918` | "Comissão plataforma (15,2 %)" | comissão + taxa online + outros | ⚠ rótulo agrega três taxas |
| `DeliveryCombosScreen.js:843-847` | "Lucro Líquido" / "Margem Líq." | `preço − custo` (bruto) | ✘ [B4] |
| `PreparoFormScreen.js:883` | "O custo [da embalagem] entra no total do preparo" | `custoTotal` sem embalagens | ✘ [B1] |
| `RelatorioSimplesScreen.js:408` | "De cada R$ 10,00…" | `:158-176` | ✔ soma 10 |
| `RelatorioSimplesScreen.js:434` | "precisa vender pelo menos R$ X por dia para não ter prejuízo" | `fixas/margemLíquida/30` | ✘ [B11] |

---

## Bugs priorizados

| Pri | ID | Onde (`arquivo:linha`) | Problema | Impacto | Prova |
|---|---|---|---|---|---|
| **P0** | B2 | `DeliveryCombosScreen.js:274,280` · `DeliveryPrecosScreen.js:210,218` · `DeliveryProdutosScreen.js:163,166` · `cascadeRecalc.js:118-125` vs modal `DeliveryCombosScreen.js:661,666` | Insumo/receita em kg ou L dentro de combo: modal usa unidade nativa, todo o resto trata a quantidade como gramas | Custo do combo 1000× menor após salvar; margem ~100 %; sugerido irrisório | teste 5.4 (falha) |
| **P0** | B11 | `RelatorioSimplesScreen.js:190-193` | PE = fixas / margem líquida média ÷ 30 (margem já desconta fixos) | "Precisa vender R$ X/dia" 1,5–2,5× maior que Home/Simulador/FAQ | teste 8.2 (falha) |
| **P1** | B1 | `PreparoFormScreen.js:317` · `cascadeRecalc.js:41-77` (texto `:883`) | Embalagem da receita base não entra no custo_total/custo_por_kg | CMV subestimado em toda receita que tem embalagem; UI promete o contrário | teste 2.5 (falha) |
| **P1** | B3 | `MatrizBCGScreen.js:294` | `prodCostMap[item.item_id]` para qualquer tipo de item do combo | Combo com embalagem/insumo herda custo de um produto homônimo em id → margem e quadrante errados | teste 5.5 (falha) |
| **P1** | B4 | `DeliveryCombosScreen.js:843-847` (valores `:769-772`, `:844-847`) | Rótulo "Lucro Líquido"/"Margem Líq." com cálculo bruto | Usuário acha que o combo rende 49 % líquido quando rende 15 % | teste 5.2 |
| **P1** | B5 | `DeliveryPrecosScreen.js:636` | Legenda "mesmo lucro líquido do balcão" para um sugerido que entrega lucro % (≈ R$ 1,4 vs R$ 12,30) | Promessa falsa; sugerido abaixo do balcão marcado como "erro de cálculo" pelo próprio app | teste 4.4 |
| **P2** | B8 | `DeliveryPrecosScreen.js:355-381` | Resumo "Lucro médio" usa break-even (`calcDeliveryPrice`) e as linhas usam a fórmula completa | Card de resumo não corresponde às linhas | leitura |
| **P2** | B6 | `DeliveryHubScreen.js:1025` · `ComparativoCanaisScreen.js:208` · `DeliveryPrecosScreen.js:249` | Três "sugeridos" diferentes (7,54 / 9,22 / 29,50) para o mesmo produto/plataforma | Confiança no número | teste 4.8 |
| **P2** | B7 | `DeliveryPrecosScreen.js:410` · `DeliveryHubScreen.js:447` vs `:900-906` | "Lucro" das linhas = modelo legado (sem fixos/imposto); "Composição" = completo | 18,33 vs 12,30 para o mesmo preço | teste 4.5 |
| **P2** | B9 | `deliveryAdapter.js:87-97` + Hub `:818` | Só variáveis com nome de imposto seguem para o delivery; as outras (11,5 %) somem sem aviso | "Mesmo lucro" com comissão 0 fica ABAIXO do balcão; imposto com nome fora da regex é ignorado | testes 4.1, 4.6 |
| **P2** | B10 | `HomeScreen.js:829` | "Sobra do mês" = faturamento − fixas; subtítulo "Receita cobre custos" ignora CMV/variáveis | Contradiz o card "Mínimo pra pagar as contas" ao lado | teste 7.2 |
| **P3** | — | `ListaComprasScreen.js:208` | `parseInt` descarta fração; produto por kg tratado como unidade | 0,5 → 0; ambiguidade do campo | teste 9.3 |
| **P3** | — | `calculations.js:98` / `MateriaPrimaFormScreen.js` | `dz` cai em unidade; líquida > bruta não validada | Preço/un errado se alguém digitar "dz" | testes 1.4, 1.5 |
| **P3** | — | `calculations.js:239` + `HomeScreen`/`ProdutoForm` | Sem faturamento, fixos % = 0 silenciosamente (só o Financeiro avisa) | Preço sugerido sem custos fixos | teste 3.7 |
| ⚠ verificar | — | `FinanceiroConfigScreen.js:594-599` vs restante | Financeiro exibiu 22,22 % e mark-up 1,95x; Home/Relatório/Delivery operam com 22,78 % (1,97x) | Não reproduzível pelo código — conferir em prod se persiste | testes 3.3, 8.1 |

---

## Resultado do `npm test`

`npm test` → **328 testes: 323 passam, 5 falham.**

- **4 falhas intencionais** deste audit (`__tests__/audit-formulas-2026-09-09.test.mjs`, marcadas `// BUG:`): **2.5** (B1 embalagem na receita), **5.4** (B2 combo kg), **5.5** (B3 BCG combo), **8.2** (B11 PE do Relatório). Cada uma passa a verde quando o bug for corrigido (sem mudar o esperado; réplicas de tela precisam ser espelhadas ao alterar a tela).
- **1 falha alheia a este audit:** `__tests__/deliveryHubMesmoLucro.test.mjs` (arquivo novo, não rastreado, criado por outro agente durante esta sessão; falha sozinho: `esperado 16.25, obtido 20.79`). Causa: o teste calcula o preço com o modelo completo (fixos 10 % + imposto 4 %) e faz o round-trip pelo `calcResultadoDelivery` (legado: sem fixos/imposto, comissão sobre preço + frete) — exatamente a inconsistência [B7]; a expectativa do teste mistura dois modelos. Não foi tocado.

Comandos: `npm test` (tudo) · `node --import ./__tests__/loader.mjs --test __tests__/audit-formulas-2026-09-09.test.mjs` (só este audit).
