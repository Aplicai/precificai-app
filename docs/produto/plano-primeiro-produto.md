# Plano técnico: primeiro produto guiado (substitui o Kit no primeiro acesso)

> 15/10/2026. Base: commit b295be2. Proposta de produto em `proposta-primeiro-acesso.md`.

## Fatos do código que mudam o plano
1. `produto_ingredientes.quantidade_utilizada` fica na UNIDADE DO INGREDIENTE (EntityCreateModal.js:884-896; leitores chamam `calcCustoIngrediente(pb, qtd, un, un)`). "Comprei 5 kg, uso 300 g" grava `unidade_medida='kg'` e `quantidade_utilizada=0.3`. Gravar 300 = custo 1000x.
2. Kit em modo setup APAGA tudo (`KitInicioScreen.js:370 if (resetar || isSetup)`); `OnboardingScreen.js:177-185` abre o Kit com `setup:true`. Os dois precisam sair.
3. `determineInitialRoute` (initialRoute.js:56-67, usado pelo WelcomeTour) e `determineInitialRouteSafe` (:138-158, AppNavigator) divergem; unificar numa função pura.
4. PerfilScreen: autosave com debounce de 600 ms é cancelado no `replace` → a última digitação (ex.: segmento) pode se perder. Dar flush antes de navegar.
5. Não há evento de "primeiro produto com preço"; o `Ativacao` dispara com 3 produtos (marketing.js:146-166).
6. O wizard do Financeiro não dá para embutir (FinanceiroConfigScreen, 2665 linhas): navegar até ele (abre o wizard sozinho quando incompleto).
7. `templates.js` ~270 KB: a tela nova precisa ser `lazyScreen`.
8. `onboarding_done` é por aparelho, não por usuário (problema antigo); o rascunho novo usa a chave `primeiro_produto_draft_v1_${user.id}`.

## Funções a reaproveitar
`parseDecimalBR` (calculations.js:21) · `calcPrecoBase` :193 · `calcFatorCorrecao` :212 · `liquidaEfetiva` (insumoFormHelpers.js:44) · `compraSentence.js` (`fraseCustoResultado`, mensagens) · `converterParaBase`/`converterDeBase` :71/:78 · `calcCustoIngrediente` :240 · `getDivisorRendimento` :340 · `buildPricingConfig` :299 · `calcMarkup` :278 + `calcPrecoSugerido` :291 (fórmula inline em EntityCreateModal.js:1580-1600, margem padrão 15%) · `resolverPrecoAoSalvar` (precoAoSalvar.js) · `notifyDataChanged`, `clearQueryCache` · `normalizeSearch` :439 · `abrirNoApp` (KitInicioScreen.js:146).

## Dados
- `materias_primas`: nome, marca '', categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida (g/kg/mL/L/un), valor_pago, preco_por_kg. INSERT em MateriaPrimaFormScreen.js:665-668 (+ historico_precos em try/catch).
- `produtos`: INSERT de 20 colunas em EntityCreateModal.js:1683-1694. `unidade_rendimento` ∈ por_unidade/por_kg/por_litro; por unidade → rendimento_total=1, rendimento_unidades=N; por kg/L → rendimento_total=N, rendimento_unidades=1. `observacoes` não pode começar com "Exemplo do Kit de Início".
- `produto_ingredientes`: (produto_id, materia_prima_id, quantidade_utilizada), EntityCreateModal.js:1704.

## Fluxo
Perfil (telefone opcional, flush do autosave) → `PrimeiroProduto` (RootStack, lazy, passos internos):
1. Produto: nome (chips do segmento) + "rende [N] [unidades|kg|litros]" + link "Prefiro explorar sozinho".
2. Ingredientes (3 linhas, até 6): nome com sugestões do segmento; "Comprei [q] [un] por R$ [v]"; "Uso [q] [un] na receita" (unidades do mesmo tipo); "Isso dá R$ X por kg · na receita R$ Y"; custo somando.
3. Resultado: custo por unidade, preço sugerido ("estimativa sem seus custos do mês"), preço editável, "Salvar com esse preço".
4. Financeiro: "Deixe esse preço mais certo" → FinanceiroMain (wizard) ou "Pular por enquanto" → Home. Pula o passo se o Financeiro já existir.
Rota inicial: perfil ok + 0 ingredientes + sem onboarding_done → PrimeiroProduto. Kit só em Configurações. Home: banner do Kit vira "Monte o preço do seu primeiro produto (3 min)".

## Testes previstos
segmento→template, sugestões, `calcularLinha` (5 kg/R$25 uso 300 g → R$1,50, qtd 0,3; 500 g/R$10 uso 50 g → R$1,00; 12 un/R$18 uso 2 → R$3,00; 1 L/R$6 uso 200 mL → R$1,20), resumo/preço sugerido (paridade com o formulário), payload, rota inicial, serviços com db falso (SQL exato, rollback), evento PrimeiroPreco.

## Estimativa do plano completo
~3,5 a 4 dias (inclui extrair os INSERTs do EntityCreateModal/MateriaPrimaForm para serviços compartilhados e o cartão "antes/depois" no Financeiro).
