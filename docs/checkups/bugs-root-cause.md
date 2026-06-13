# Root-Cause dos achados ALTO do teste de usabilidade (2026-06-12)

> Investigação READ-ONLY. Nenhum arquivo foi alterado. Decisões de fix ficam para revisão.

## 🐛 BUG 1 — Tela Financeiro exibe tudo vazio (alto risco de fix)

**Sintoma:** `FinanceiroConfigScreen` mostra Mark-up 1.00x, Custos Fixos/Variáveis 0,00%,
Faturamento R$ 0,00 ("Preencha seu faturamento"), enquanto o modal de produto usa Custos do mês
22,22% / variáveis 14,50% e o Painel mostra Resultado Operacional R$ 11.667 / Ponto de Equilíbrio
R$ 10.577. As 3 telas leem as MESMAS tabelas (`configuracao`, `despesas_fixas`,
`despesas_variaveis`, `faturamento_mensal`) pela MESMA instância `getDatabase()`. Não há fonte
desconectada → as tabelas têm dados.

**Causa raiz:** `src/database/supabaseDb.js` — `executeQuery` **engole erro** e retorna `[]`/`null`
sem lançar (linhas ~142, 196, 199). O `getAllAsync` então **cacheia esse `[]`** por
`CACHE_TTL = 2000`ms (linhas ~80-81), e o `.catch` (linha ~83) nunca dispara porque não houve
throw. Se as 5 queries paralelas da tela Financeiro (`Promise.all`) caírem numa janela de erro
transitório (sessão renovando / RLS / rede), todas voltam vazias e ficam cacheadas → a tela
popula defaults. O cache **não distingue `[]`-de-erro de `[]`-legítimo**.

**Fix recomendado (⚠️ camada central — exige revisão + QA cuidadoso, afeta TODAS as telas):**
- Em `executeQuery`, NÃO cachear respostas de erro: distinguir erro de vazio (lançar em caso de
  `error`, OU retornar um sentinel que `getAllAsync` reconheça para não chamar `setCache`).
- Isso faz o `setLoadError`/retry da `FinanceiroConfigScreen` (linha ~215, hoje morto) voltar a
  funcionar.
- **NÃO deployar sem QA** — `executeQuery` é usado por todas as telas; mudar o comportamento de
  cache/erro pode ter efeitos amplos.

## ✅ "BUG" 2 — RESOLVIDO: NÃO era bug (insumo `un` calcula certo)

> **VEREDITO (confirmado ao vivo 12/06):** NÃO é bug de cálculo. Um insumo `un`
> legítimo (cadastrado pela UI, com `unidade_medida='un'` + `preco_por_kg`) calcula
> custo corretamente. Teste ao vivo: adicionei **Ovo** (R$0,73/un real do Kit) a um
> produto → custo **R$ 0,73** e CMV **R$ 0,73**, certinho. O R$0,00 observado antes
> era 100% artefato do **insumo sintético** (inserido direto no DB via service_role
> com `valor_pago=0/quantidade_liquida=0`, fora do fluxo `buildItem→calcCustoUnit`).
> O cálculo `calcCustoIngrediente(preco_por_kg, 1, 'un', 'un') = preco × 1` está correto
> e não passa por conversão de peso que zere. O fix defensivo #2 (reconciliação em
> `EntityCreateModal`) foi DEPLOYADO, é inofensivo e sem regressão, mas mirou um
> não-bug — pode ser mantido como blindagem ou revertido sem impacto.

### (registro original — mantido para histórico)
## 🐛 BUG 2 — Insumo tipo `un` calcula custo R$ 0,00 no modal de produto

**Sintoma:** insumo tipo `un` (preço por unidade) adicionado a um produto mostra custo R$ 0,00 no
Resumo de Custos do `EntityCreateModal`, inflando a margem para ~100%. O Ranking (`MatrizBCGScreen`)
mostra o custo correto para o mesmo insumo. As FÓRMULAS são idênticas (`calcCustoIngrediente` com
`preco_por_kg` nas duas telas) — a divergência vem do VALOR lido.

**Causa raiz provável:** no caminho de carga do modal, o `preco_por_kg` chega nulo. Suspeitos:
o parser de JOIN em `supabaseDb.js` `executeJoinQuery` (linhas ~414-421) ignora a lista de colunas
do SELECT e faz `select('*')` com merge "main wins"; + race read-after-write (comentários sobre
read-replica retornar `data=null`, linhas ~718-720). A query de edição usa
`SELECT pi.*, mp.preco_por_kg, ...` (linha ~532).

**Fix recomendado (médio risco):** no `EntityCreateModal`, após `calcCustoUnit`, se `custoUnit===0`
mas o insumo existe em `allMaterias` (array já em memória, usado no `rateLabel` ~linhas 819-822),
refazer o lookup do `preco_por_kg` de `allMaterias`. NÃO mexer em `calculations.js` (corretas).
**Verificar antes** com um insumo `un` real e completo (campos `preco_por_kg`/`custo_medio` setados).

## ⚠️ NÃO-BUG 3 — 90% (Ranking) vs 53,28% (Painel) é margem bruta vs líquida

**Diagnóstico:** não é bug. Ranking e header do modal mostram margem **BRUTA** `(preço−CMV)/preço`
(`MatrizBCGScreen.js:215`). O "Produto campeão" do Painel mostra margem **LÍQUIDA**, descontando
despesas fixas e variáveis (`HomeScreen.js:315/330`). Ambas corretas; o problema é que as duas se
chamam só "margem". 

**Fix recomendado (baixo risco):** rotular explicitamente "margem bruta" no Ranking e "margem
líquida" no Painel (ou mostrar as duas lado a lado / tooltip). Nenhuma fórmula muda.

---

## Resumo de prioridade
| # | Tipo | Risco do fix | Onde |
|---|------|--------------|------|
| 1 | BUG carregamento (Financeiro vazio) | **ALTO** (camada DB central) | `supabaseDb.js executeQuery/cache` |
| 2 | BUG dados (insumo `un` R$0) | Médio | `EntityCreateModal` lookup `preco_por_kg` |
| 3 | UX/rótulo (bruta vs líquida) | Baixo | `MatrizBCGScreen` / `HomeScreen` labels |

**Recomendação:** o nº 3 é quick win seguro. O nº 2 precisa de verificação com insumo real. O nº 1
é o mais impactante MAS o mais arriscado — fazer com cuidado, com QA amplo, fora desta sessão
autônoma.
