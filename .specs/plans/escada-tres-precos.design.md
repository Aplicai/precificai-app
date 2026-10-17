# Escada dos 3 preços (retenção pós-primeiro preço)

Validado com Erick em 17/10/2026 (brainstorm).

## Problema

- Preço rápido levou a ativação de 2% para ~30%, mas ninguém volta: 0 de 15 que chegaram ao preço voltaram outro dia.
- E-mail D1: 61 entregues, 3 abertos, 1 clique.
- Depois do 1º preço a Home vira o painel completo (cheio no celular), sem próximo passo.

## Decisões

- Foco agora: motivo para voltar dentro do app (canais como WhatsApp/remarketing ficam para depois).
- Próximo passo: Preço rápido do 2º e 3º produto.
- Home simples até 3 produtos com preço.
- Recompensa no 3º: tabela de preços para enviar no WhatsApp.
- Aviso no celular de que no computador o app é mais completo.

## Experiência

1. Após o 1º Preço rápido, a Home simples mostra o produto com preço, a escada "1 de 3" e um botão só: "Calcular o próximo produto (15 s)".
2. Preço rápido em modo "próximo": pergunta só nome, custo da receita, rendimento e quanto cobra hoje. Gastos e vendas do mês vêm do que já está salvo, com linha "Usando seus gastos do mês: R$ X · vendas: R$ Y (alterar)".
3. Home simples até 3 produtos com preço:
   - lista de produtos com preço e a escada;
   - botão do próximo Preço rápido;
   - link "Ver painel completo";
   - produto com preço feito à mão também conta.
4. No 3º produto, tela "Sua tabela de preços está pronta":
   - os produtos com preço;
   - "Enviar no WhatsApp" (texto pronto) e "Copiar";
   - "Ir para o painel".
   - Daí em diante a Home normal é o painel.
5. Na recompensa: aviso de instalar ("Salve o app para atualizar sua tabela quando os preços mudarem").
6. Só no celular:
   - **Na recompensa:** cartão "No computador você vê tudo" com "Copiar link" e "Me mandar o link por e-mail" (e-mail só para a própria conta).
   - **No rodapé da Home simples:** uma dica.
7. Contas em andamento:
   - **1 ou 2 produtos com preço:** veem a escada no ponto em que estão.
   - **3 ou mais:** continuam no painel.

## Técnica

- `src/utils/escadaPrecos.js` (puro, testado):
  - `etapaEscada(produtosComPreco)` devolve `{ feitos, meta: 3, completa }`;
  - `textoTabelaPrecos(nomeNegocio, produtos)`.
- `PrecoRapidoScreen` com param `{ proximo: true }`:
  - **Gastos e vendas do mês:** lê a soma de `despesas_fixas` e a média de `faturamento_mensal` com valor > 0.
  - **"Alterar":** mostra os dois campos de novo, já preenchidos.
  - **Salvar:** usa o mesmo `salvarPrecoRapido`.
  - **No 3º produto:** vai para `TabelaPrecos`.
- `HomeScreen`:
  - `modoComeco` = menos de 3 produtos com preço e não escolheu o painel (`painel_completo_escolhido` no AsyncStorage);
  - quem escolheu o painel e ainda tem menos de 3 vê a escada como card no topo.
- `TabelaPrecosScreen`:
  - **Rota:** nova no RootStack, lazy, como o ComoFunciona; entra em `WebHeader.ROUTE_TITLES` e tem atalho em "Mais".
  - **Botões:**
    - WhatsApp via `https://wa.me/?text=`;
    - Copiar;
    - Ir para o painel;
    - link para o computador.
  - **Aviso de instalar:** `liberarAvisoInstalar()` sai do 1º preço e passa para esta tela. Quem já está liberado continua liberado.
- Edge function `enviar-link-computador`:
  - exige JWT e envia só para o e-mail da conta;
  - máximo 1 por dia por conta;
  - envia pelo Resend que já existe.
- Eventos Meta:
  - `PrecoRapidoProximo` (2º e 3º);
  - `TabelaPrecosPronta`;
  - `TabelaPrecosEnviada`;
  - `LinkComputadorPedido`.

## Erros

- **Falha ao ler gastos e vendas:** volta a perguntar os campos (`isDbErrorResult`, nunca calcula com zero por engano).
- **Falha ao salvar:** a mesma mensagem e a mesma limpeza do Preço rápido.
- **Limite do Grátis (5 produtos):** a escada para em 3; se esbarrar, aparece a mensagem de `planGate`.
- **Sem WhatsApp:** o `wa.me` abre o WhatsApp Web; "Copiar" é o plano B.
- **E-mail falhou:** "Não deu para enviar agora. Copie o link."

## Testes

- **Automáticos:**
  - `escadaPrecos` (contagem; texto com R$ no padrão brasileiro e acentos);
  - regra de `modoComeco` (0, 1, 2, 3; escolheu o painel ou não);
  - leitura dos gastos e vendas no modo "próximo".
- **Na tela, celular e computador:**
  - 1º preço, escada 1/3, 2º, 2/3, 3º, recompensa;
  - os botões.
  - Usar a conta teste só depois de conferir que a sessão de vídeos não a está usando.

## Sucesso (3 dias após publicar, coorte nova vs. anterior)

- Quem fez 1 preço e fez o 2º: de ~0% para 40%.
- Volta em outro dia: de 0/15 para 20%.
- Uso de "Enviar no WhatsApp" e "Me mandar o link".
