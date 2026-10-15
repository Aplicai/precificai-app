# E-mails do Precificaí — contexto para outro chat

> Cole este arquivo no início de um chat novo (ou peça: "leia docs/marketing/emails-ciclo-vida.md").
> Atualizado em 14/10/2026, 23h. Projeto Supabase `lwznqpxzmqptrpbifvka`.

## Regras que não mudam

- **Nenhum e-mail para cliente sai sem um "sim" claro do Erick** para aquele envio (amostras `[Teste]` para erickfa@live.com estão liberadas).
- Texto: "você", verbos no imperativo ("Precifique", "Crie"), **nunca travessão (—)**, só números reais.
- Segredos (Resend, cron, opt-out) **nunca** aparecem no chat. Estão nos secrets do Supabase e no Vault; cópias locais ficam na pasta scratchpad da sessão (`.email_cron_secret`, `.email_optout_secret`, com permissão 077). Num chat novo, a scratchpad é outra: peça ao Erick ou leia do Vault via SQL só para usar no header, sem imprimir.
- Ler dados de clientes só no agregado ou o mínimo necessário. Mostrar e-mail mascarado (`mari…@gmail.com`).

## Peças do sistema

| O quê | Onde |
|---|---|
| Função (monta e envia) | `supabase/functions/email-ciclo-vida/index.ts` (`montarEmail`) |
| Tabelas e regras de etapa | `supabase/migrations/20261014200000_email_ciclo_vida.sql` |
| Cron de hora em hora | `supabase/migrations/20261014210000_email_ciclo_vida_cron.sql` |
| Envio por período (`desde`/`ate`) | `supabase/migrations/20261014230000_email_candidatos_periodo.sql` |
| Ordem das etapas (kit antes de produto) | `supabase/migrations/20261014233000_email_estagio_kit_primeiro.sql` |
| Imagens do e-mail | repositório `../precificai-site/assets/email/` (logo branca, logo verde, capa do vídeo). Servidas em `https://precificaiapp.com/assets/email/…`. Mudou imagem: commit + `vercel deploy --prod --yes` no precificai-site |
| E-mail de confirmação de cadastro | template do Supabase Auth (PT-BR), não passa por esta função |

Envio pelo Resend: remetente `Precificaí <noreply@precificaiapp.com>`, resposta para `contato@precificaiapp.com`, cabeçalho List-Unsubscribe, 600 ms entre envios.

## Quem recebe o quê

**Etapa** (`public.email_estagio(uid)`), a primeira que bater:

1. `sem_perfil`: nome do negócio vazio
2. `sem_ingrediente`: nenhum ingrediente
3. `ativo`: tem produto com preço de venda
4. `kit_sem_preco`: nenhum ingrediente com preço (caso típico: pegou o Kit de Início, que cria ~90 ingredientes e 2 produtos sem preço)
5. `produto_sem_preco`: tem produto e algum ingrediente com preço, mas nenhum produto com preço
6. `sem_produto`: ingredientes com preço, nenhum produto

**Campanhas** (`public.email_candidatos(p_campanha, p_desde, p_ate)`):

- `d1`: cadastro entre 24 h e 48 h atrás. E-mail da etapa.
- `d3`: cadastro entre 72 h e 96 h atrás. Se `ativo` e plano Grátis: e-mail do Pro. Se `ativo` e já assina: não envia. Senão: e-mail da etapa com "Faltou pouco".
- qualquer outro nome (ex. `reativacao-2026-10`): conta criada antes de 13/10/2026 e parada há 7 dias. E-mail "O Precificaí ficou mais fácil" + novidades + "Seu próximo passo" (etapa).
- com `desde`/`ate`: troca a janela acima pelo período de cadastro (e ignora a regra dos 7 dias).

Sempre: só e-mail confirmado, fora quem pediu para sair (`email_optout`), fora quem já recebeu a mesma campanha (`email_envios`, unique por pessoa + campanha), fora contas de teste (`teste|e2e|exemplo|.test`) e internas (erickfa@live.com, erickkfa@gmail.com, contato@esali.com.br, erick.ali.sebrae@gmail.com, marketing@aplicaiconsultoria.com.br, felipecvasconcelos22@gmail.com).

## Como chamar a função

`POST https://lwznqpxzmqptrpbifvka.supabase.co/functions/v1/email-ciclo-vida`, header `x-cron-secret: <segredo>`.

| Corpo | Faz |
|---|---|
| `{"teste":{"para":"erickfa@live.com","campanha":"d1","estagio":"kit_sem_preco","plano":"free","negocio":"Doces da Ana"}}` | 1 amostra com "[Teste]" no assunto, não registra |
| `{"campanha":"reativacao-2026-10"}` | **simulação**: lista quem receberia, não envia |
| `{"campanha":"d1","desde":"2026-10-13T00:00:00-03:00","ate":"2026-10-15T00:00:00-03:00"}` | simulação por período |
| mesmo corpo + `"enviar":true,"limite":60` | **envia de verdade** (só com OK do Erick) |
| `{"automatico":true}` | d1 + d3; é o que o cron chama. Fora das 8h–20h de Brasília não faz nada |

Atenção no zsh: `set -- $var` não separa palavras. Para laços, use `camp=${c%%:*}; est=${c##*:}`.

Consultas no banco: `scratchpad/audit/q.py "<sql>"` (Management API, token do `.env.local`). Num chat novo, recrie o script ou use o SQL Editor do Supabase.

## Agendamentos ativos (pg_cron)

- `email-ciclo-vida-hora` (`7 * * * *`): d1 + d3 automáticos.
- `email-reativacao-2026-10` (`0 12 15 10 *` = **quinta 15/10, 9h**): envia `reativacao-2026-10` (29 contas na simulação de 14/10, 23h) e se apaga sozinho. **Aprovado pelo Erick.**

## PENDENTE para quinta 15/10 (pedido do Erick em 14/10)

> "Amanhã faça um checkup e dispare os emails para todo mundo que criar o cadastro até hoje 00:00."

1. **Checkup** (antes de disparar):
   - `select jobid, jobname, schedule, active from cron.job where jobname like 'email%';`
   - Depois das 9h: `select * from cron.job_run_details where jobid = 3 order by start_time desc limit 1;` e `select campanha, estagio, count(*) from email_envios group by 1, 2 order by 1, 2;` (esperado ~29 em `reativacao-2026-10`).
   - Rodar a simulação do passo 2 e conferir as etapas.
   - Mandar 1 amostra `[Teste]` de cada etapa que vai sair e conferir se o HTML não tem `RR$` nem `nbsp;` solto (já houve esse bug).
2. **Disparo para quem se cadastrou até 15/10 00:00 e não está na reativação** (cadastros de 13 e 14/10; em 14/10 às 23h eram 11 confirmados: 6 `kit_sem_preco`, 2 `sem_perfil`, 2 `produto_sem_preco`, 1 `ativo`):
   `{"campanha":"d1","desde":"2026-10-13T00:00:00-03:00","ate":"2026-10-15T00:00:00-03:00","enviar":true,"limite":60}`
   Usar a campanha `d1` de propósito: assim o d1 automático não manda de novo e o d3 sai normalmente no 3º dia.
3. **Contas antigas que usaram o app nos últimos 7 dias** (2 contas, ficam fora da reativação automática). "Todo mundo" inclui elas:
   `{"campanha":"reativacao-2026-10","ate":"2026-10-13T00:00:00-03:00","enviar":true}`. Simular antes sem `enviar`: devem aparecer só as 2 que faltam.
4. Quem não confirmou o e-mail não entra (4 contas em 14/10). Se confirmarem depois, entram no d1/d3 automático.
5. Reportar ao Erick: quantos saíram por etapa, falhas, e no dia seguinte quantos voltaram ao app.

## Histórico

- 14/10: sistema criado (d1/d3/campanhas, descadastro com link assinado), layout novo da marca (cabeçalho verde, barra de jornada, caixa "Você escreve", capa do vídeo, preços do Pro), bug do `R$` corrigido antes de qualquer envio real, etapa do kit corrigida.
- Ideias em espera (decidir com mais dados, ~30 contas que chegaram ao Kit): o Kit de Início com ~90 ingredientes sem preço parece travar o primeiro preço.
- Próximo vídeo tutorial: mostrar "Vende no delivery" dentro de Produtos e que dá para cadastrar insumo, embalagem e receita de dentro do produto.
