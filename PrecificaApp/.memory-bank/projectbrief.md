# Project Brief

## O que e o PrecificaApp

Aplicativo mobile/web de **precificacao de produtos** voltado para pequenos negócios do setor alimentício (padarias, confeitarias, restaurantes, food service). O nome comercial e **Precificaí** (marca aplicaí).

## Proposito

Ajudar empreendedores a calcular o **custo real** dos seus produtos e definir **precos de venda adequados** usando metodologia de markup. Resolve o problema de precificacao errada que causa prejuízo em pequenos negocios.

## Usuarios-alvo

- Donos de padarias, confeitarias, restaurantes
- Empreendedores de food service e delivery
- Produtores artesanais de alimentos
- Qualquer negocio que precisa precificar produtos com insumos, preparos e embalagens

## Funcionalidades Principais

1. **Cadastro de insumos (materias-primas)** - com conversao de unidades (kg, g, L, mL, un), fator de correcao
2. **Cadastro de embalagens** - preco unitario calculado automaticamente
3. **Cadastro de preparos** - receitas intermediarias com seus proprios ingredientes
4. **Ficha tecnica de produtos** - composicao completa (insumos + preparos + embalagens), rendimento, tipo de venda
5. **Calculo automatico de custos e precos** - markup, CMV, margem de lucro, ponto de equilibrio
6. **Configuracao financeira** - despesas fixas, variaveis, faturamento mensal, margem de lucro desejada
7. **Dashboard (Home)** - visao geral com alertas, metricas e insights
8. **Delivery** - precificacao especifica para plataformas de delivery (iFood etc.), combos
9. **Ferramentas** - simulador "E se?", engenharia de cardapio (Matriz BCG), relatorio simplificado, exportacao PDF, comparacao de fornecedores, lista de compras, meta de vendas
10. **Autenticacao** - login/registro via Supabase Auth

## Plataformas

- **Mobile**: React Native via Expo (Android/iOS)
- **Web**: React Native Web com layout responsivo (sidebar + header no desktop, bottom tabs no mobile)

## Estado Atual

MVP funcional com todas as telas implementadas. Backend no Supabase (PostgreSQL). App rodando via Expo Web na porta 8083.
