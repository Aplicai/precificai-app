# Product Context

## Regras de Negocio

### Sistema de Unidades
- Unidades suportadas: kg, g, L, mL, un (unidade)
- Conversao automatica para base (g/mL) ao calcular custos
- Para peso/volume: preco armazenado por 1000 unidades base (= 1kg ou 1L)
- Para unidade (un): preco direto por unidade, sem divisao por 1000

### Custo de Ingredientes
- `calcCustoIngrediente(precoBase, qtdUsada, unidadeIngrediente, unidadeUso)`
- Se tipo = 'unidade': `precoBase * qtd`
- Se tipo = peso/volume: `(qtdEmBase / 1000) * precoBase`

### Custo de Preparos
- `calcCustoPreparo(custoKgPreparo, qtdUsada, unidadeUso)`
- Converte para base e divide por 1000

### Fator de Correcao
- `FC = quantidadeLiquida / quantidadeBruta`
- Representa aproveitamento real do insumo

### Precificacao via Markup
- **Markup** = `1 / (1 - despFixas% - despVar% - lucro%)`
- **Preco sugerido** = `custoUnitario * markup`
- Despesas fixas como % do faturamento
- Despesas variaveis como % (impostos, taxas cartao etc.)

### Tipo de Venda
- Tres tipos: por kg, por litro, por unidade
- Campo `unidade_rendimento` define o tipo ('por_kg', 'por_litro', ou padrao unidade)
- `getDivisorRendimento()` retorna divisor correto para custo unitario
- Heuristica de legado para valores antigos ('Grama(s)', 'Mililitro(s)')

### CMV (Custo de Mercadoria Vendida)
- `CMV% = custoInsumos / precoVenda`
- Dashboard mostra CMV medio de todos os produtos

### Engenharia de Cardapio (Matriz BCG)
- Classifica produtos em: Estrela, Vaca Leiteira, Interrogacao, Abacaxi
- Baseado em participacao de mercado e crescimento de vendas

### Delivery
- Precificacao separada considerando taxas de plataformas (iFood etc.)
- Suporte a combos
- Produtos podem ter precos diferentes para delivery

### Configuracao Financeira (4 etapas)
1. Faturamento mensal
2. Despesas fixas (aluguel, energia, salarios etc.)
3. Despesas variaveis (impostos, taxas cartao etc.)
4. Margem de lucro desejada

## Fluxos do Usuario

### Onboarding
1. Login/Registro (Supabase Auth)
2. Preenchimento do perfil do negocio (PerfilScreen)
3. Kit de Inicio (KitInicioScreen) - templates prontos
4. Configuracao financeira (OnboardingScreen)
5. Dashboard (HomeScreen)

### Fluxo Principal
1. Cadastrar insumos (materias-primas)
2. Cadastrar embalagens
3. Cadastrar preparos (receitas intermediarias)
4. Criar ficha tecnica do produto (ingredientes + preparos + embalagens)
5. Definir rendimento e tipo de venda
6. Sistema calcula custo e sugere preco via markup
7. Acompanhar pelo dashboard

### Vendas
- Registro de vendas por produto
- Detalhamento por venda
- Meta de vendas mensal

## Entidades do Banco

| Tabela | Descricao |
|--------|-----------|
| `perfil` | Dados do negocio (nome, tipo) |
| `materias_primas` | Insumos com preco, unidade, fator correcao |
| `embalagens` | Embalagens com preco unitario |
| `preparos` | Receitas intermediarias |
| `produtos` | Produtos finais com rendimento e preco |
| `produto_ingredientes` | Relacao produto-insumo (qtd utilizada) |
| `produto_embalagens` | Relacao produto-embalagem |
| `produto_preparos` | Relacao produto-preparo |
| `categorias` | Categorias de produtos |
| `configuracao` | Config financeira (markup, margens) |
| `despesas_fixas` | Despesas fixas mensais |
| `despesas_variaveis` | Despesas variaveis (%) |
| `faturamento_mensal` | Faturamento por mes |
| `delivery_produtos` | Produtos no delivery |
| `delivery_combos` | Combos de delivery |
| `vendas` | Registro de vendas |
