# Proposta: primeiro acesso até o primeiro preço

> 15/10/2026, 20h. Dados desde o início dos anúncios (14/10, 14h40).

## O problema em números

| | Contas |
|---|---|
| Cadastros | 43 (R$ 87,57 de anúncio, ~R$ 2 por cadastro) |
| Confirmaram e entraram | 34 |
| Pegaram o Kit de Início e pararam sem nenhum preço | 14 |
| Pularam o Kit e não cadastraram nenhum ingrediente | 7 |
| Colocaram preço em algum ingrediente, sem produto com preço | 9 |
| **Chegaram a um produto com preço** | **1** |
| Voltaram depois da primeira visita | 1 de 33 |

Quem não chega ao primeiro preço na primeira visita não volta. O anúncio e o cadastro funcionam; o primeiro acesso, não.

## O que o código mostra (por que as pessoas param)

Caminho de hoje: Cadastro → Tour (4 telas) → Perfil (nome, segmento e **telefone obrigatório**) → Kit de Início → tela "Configure seu app" → Financeiro.

1. **O Kit de Início recomenda pular o Kit.** A primeira opção, em destaque, é "Começar com o app vazio. **Recomendado.**" Quem toca ali cai direto no Financeiro e nunca cadastra ingrediente. Isso explica as 7 contas com Financeiro preenchido e zero ingredientes. (`KitInicioScreen.js` linhas 811–828)
2. **Erro: os botões do fim do Kit não levam ao produto.** Depois de "Kit aplicado!", os 3 botões ("Ver meu primeiro produto", "Depois", "Atualizar preços") mandam todos para a tela do Financeiro obrigatório. O momento "olha o preço do seu produto" nunca acontece para nenhum dos 14 que pegaram o Kit. (`KitInicioScreen.js` linhas 141–166: a tela não acha o menu de abas nesse modo)
3. **Tudo empurra o Financeiro primeiro.** São 5 lugares pedindo "Financeiro (obrigatório)": a tela de configuração, o cartão da Home, o aviso no topo, o guia do celular e a lista de passos. O Financeiro tem 4 etapas obrigatórias e termina numa tela longa com "Voltar ao Início", sem dizer o próximo passo.
4. **O Kit entrega tudo zerado.** São ~90 ingredientes, embalagens e 2 produtos, todos a R$ 0 (mudança de 13/10). Por isso o preço sugerido dos produtos do Kit é R$ 0 e o "Usar sugerido" nem aparece. Para ver um preço, a pessoa teria que descobrir quais dos 90 ingredientes vão na receita do produto.
5. **O segmento digitado no perfil não é usado.** A pessoa escreve "Confeitaria" e depois tem que escolher de novo entre 12 cartões. "Massas" e "Doces" não têm cartão óbvio.
6. Menores: o telefone obrigatório no perfil; o aviso "Os valores do Kit são médias de mercado", que não é mais verdade; e quem sai no meio do perfil volta direto para o Financeiro, sem passar pelo Kit.

## Opções

### A. Destravar o caminho atual (rápido, baixo risco: ~meio dia)
- Corrigir os botões do fim do Kit: "Ver meu primeiro produto" abre o produto do Kit.
- Inverter a recomendação: o Kit vira a opção destacada e "Começar vazio" vira um link discreto.
- Já deixar marcado o cartão do Kit a partir do segmento digitado (palavras-chave: doce, bolo, brigadeiro → Confeitaria; massa, pizza → Pizzaria; açaí; sorvete; sushi → Japonesa…).
- Tirar o Financeiro da frente: depois do Kit (ou de pular), o passo principal passa a ser "Monte seu primeiro preço". O Financeiro vira o passo seguinte ("deixe seu preço mais certo"). O preço sugerido já funciona sem o Financeiro (usa margem padrão).
- Telefone opcional no perfil; corrigir o texto do aviso de preços zerados.

Resolve os pontos 1, 2, 3, 5 e 6. Não resolve o 4: o produto do Kit continua com custo R$ 0 até a pessoa achar os ingredientes certos.

### B. Primeiro preço guiado (médio: 1 a 2 dias), **recomendada junto com A**
Logo depois do perfil, em vez de jogar 90 ingredientes na tela:
1. "Qual produto você mais vende?" A pessoa escolhe um dos sugeridos do segmento (ex.: Bolo de Chocolate 1 kg) ou digita o dela.
2. A tela mostra **só os 5 a 8 ingredientes daquela receita**, cada um com a frase "Comprei [5] [kg] por R$ [25]".
3. Na hora aparecem o custo do produto e o preço sugerido, com o botão **"Salvar com esse preço"**.
4. Pronto o primeiro preço, o resto do Kit entra em segundo plano e o app oferece o Financeiro para deixar o preço mais certo.

É o caminho mais curto até o "aha": 1 produto com preço em ~3 minutos, com os preços que a pessoa realmente paga.

### C. Kit com preço de referência (rápido, mas arriscado)
Voltar a preencher o Kit com preços médios de mercado (`src/data/marketPrices.js`), marcados como "estimado", para o preço sugerido aparecer na hora.
- Risco: o preço sai errado para quem compra mais caro ou mais barato. Foi por isso que tiramos os preços em 13/10. A pessoa pode confiar num número que não é dela.
- Só faria sentido como apoio dentro da B (sugerir o valor no campo, e a pessoa confirma).

## Recomendação

1. **Hoje/amanhã: opção A.** É barata, corrige um erro real (botões do Kit) e tira o Financeiro do caminho. Pode já mudar o número com o anúncio rodando.
2. **Em seguida: opção B**, o primeiro preço guiado.
3. C fica de fora, a não ser como sugestão de valor dentro da B.

## Como medir

- **Métrica principal:** % dos cadastros que chegam a um produto com preço de venda em até 24 h. Hoje: 1 de 34 (3%). **Meta: 25%.**
- **Apoio:** % que coloca preço em pelo menos 3 ingredientes na primeira visita; % que volta no dia seguinte.
- **Comparação:** cohort antes x depois da publicação, com o mesmo anúncio rodando.
