# Régua de e-mails do Precificaí (remarketing por etapa)

> Desenho validado com o Erick em 14/10/2026. Base: sistema `email-ciclo-vida` (ver `docs/marketing/emails-ciclo-vida.md`).

## Objetivo

Lembrar cada cliente do próximo passo dentro do Precificaí, com conteúdo que interessa e sem virar spam. Cada e-mail fala da etapa em que a pessoa está e usa os dados da própria conta.

## Calendário

| Quando | Frequência |
|---|---|
| Dias 1 e 3 | Primeiros passos (já existe) |
| Dias 7, 14, 21, 30 | 1 por semana, pela etapa |
| Dias 30 a 90 | De 15 em 15 dias |
| Depois do dia 90 | 1 por mês, novidades. Para depois de 3 mensais seguidos sem clique e sem voltar ao app |

Regras que valem sempre:
- No máximo 1 e-mail por semana por pessoa, somando tudo (régua, reativação, campanhas). Exceção: dias 1 e 3.
- Usou o app nos últimos 3 dias: não recebe.
- Dia perdido (por uso do app ou limite semanal) vai para o próximo dia possível.
- Só segunda a sexta, 9h às 19h de Brasília.
- Fora: e-mail não confirmado, `email_optout`, quem marcou spam ou teve devolução, contas de teste e internas.
- Voltou ao app depois de parado: volta à régua normal da etapa atual.

## Parte 1: arquitetura

- **Banco:** função `email_proximo(uid)` devolve "nada hoje" ou `{campanha, tema, formato}`. `email_envios` ganha `tema` e `formato`. Tabela nova `email_eventos` (clique, devolução, spam) alimentada pelo webhook do Resend.
- **Edge function `email-ciclo-vida`:** catálogo de temas × formatos; pergunta ao banco o que mandar; mesmo template da marca.
- **Webhook do Resend:** grava eventos; spam ou devolução viram opt-out automático.
- **pg_cron:** o job de hora em hora vira 1 job diário às 10h (dias úteis).
- **Claude (tarefa agendada, só leitura):** todo dia às 17h simula o envio do dia seguinte e atualiza a página de prévia (Parte 6). Não envia nada.

Sinal de engajamento: clique e volta ao app (`utm_campaign`). Abertura entra só no relatório como tendência (Apple Mail infla, bloqueio de imagem esconde).

## Parte 2: segurança e testes

- Reserva antes de enviar (já existe) + unique por pessoa e dia.
- Teto de 150 envios por dia; passou, o relatório avisa.
- Falha no Resend desfaz a reserva; 3 falhas seguidas param o dia.
- Erro de leitura no banco: não envia (nunca tratar `[]` com erro como "pode mandar").
- Acabaram os temas da etapa: vai para o mensal de novidades, nunca repete.
- Testes automáticos da regra de calendário (dia 1, dia 7, usou ontem, reativação há 5 dias, 3 mensais sem clique).
- Render local de todos os textos: sem `RR$`, `nbsp;` solto ou travessão.
- Primeira semana em modo simulação; o Erick liga o envio.

## Parte 3: temas

Cada tema parte de uma dúvida real de quem vende comida. Números só reais.

- **Sem perfil:** quanto custa de verdade o seu bolo; preço da vizinha engana; kit do seu segmento.
- **Sem ingrediente / kit sem preço:** cadastre como você compra (tutorial 2); perda e preço por quilo; os 4 ingredientes que mais pesam; embalagem é custo (tutorial 4).
- **Sem produto / produto sem preço:** receita base uma vez só (tutorial 3); use o sugerido; lucro escondido no Financeiro.
- **Ativo:** ingrediente subiu e o seu produto? (atualizar preços); qual produto dá mais lucro; quanto cobrar no iFood (Pro, só Grátis); cadastre os 5 que mais vende.
- **Mensal:** novidades do app + tutorial do mês.

Texto: "você", imperativo, nunca travessão.

## Parte 4: dados da pessoa e imagens

| Etapa | Dados usados |
|---|---|
| Sem perfil | Segmento do cadastro, se houver |
| Kit sem preço | Total de ingredientes, quantos com preço, 1 produto do kit e seus 4 ingredientes |
| Sem ingrediente | Nome do negócio, segmento |
| Sem produto | Ingredientes com preço, 3 mais recentes |
| Produto sem preço | Até 3 produtos sem preço |
| Ativo | Produtos com preço, último atualizado, dias sem atualizar ingredientes |

- V1 **não calcula custo nem margem** no servidor (risco de divergir da tela). Só nomes, contagens e preços digitados pela pessoa. Custo entra quando o app gravar o custo calculado do produto.
- Dado faltando ou erro: versão genérica do texto. Nunca campo vazio ou "0 ingredientes".
- Nome cortado em 40 caracteres; tudo passa por `esc()`.
- 1 imagem estática por tema (tela exata da ação, conta de teste, motor dos tutoriais), 560 px, `alt` descritivo, em `precificaiapp.com/assets/email/`.
- Fora da V1: datas sazonais (entram antes do Natal) e e-mails assinados pelo Erick.

## Parte 5: variação visual

Moldura fixa: logo, paleta, fonte, rodapé, remetente. Miolo em 6 formatos:

1. Passo a passo (cabeçalho verde, jornada, caixa de exemplo)
2. Painel de números (dados dela em destaque)
3. Tela anotada (print grande com marcações)
4. Carta (fundo branco, tom pessoal)
5. Mito ou verdade
6. Checklist (feito / falta)

Regras:
- Nunca o mesmo formato 2 vezes seguidas, nem 2 vezes em 4 envios.
- Padrão do assunto varia: pergunta, número, nome da pessoa, curiosidade. Nunca o mesmo padrão 2 vezes seguidas.
- Botão varia: cheio, link no texto, print clicável.
- Cada tema escrito em 2 formatos; o sistema escolhe o que respeita as regras.

## Parte 6: validação pelo Erick

- Nada vai para a caixa do Erick por padrão (amostra `[Teste]` só se ele pedir).
- Página privada no claude.ai, mesmo link todo dia, atualizada às 17h com: quantos sairão amanhã (por etapa e formato), print de cada modelo distinto em celular e computador com dados de conta de exemplo, e alertas (texto nunca aprovado, teto, erro).
- Primeira vez: prints de todos os temas × formatos para aprovar o lote inteiro.
- Também mostra a sequência de 5 e-mails que uma mesma pessoa receberia, para checar a variação.

## Fora do escopo

Custo/margem calculados no e-mail, sazonais, e-mails assinados, WhatsApp, resumo semanal personalizado.
