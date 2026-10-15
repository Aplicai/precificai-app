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

Conta do Resend: login **contato@aplicaiconsultoria.com.br** (a `RESEND_API_KEY` é só de envio; webhook, cliques e logs só pelo painel). Envio pelo Resend: remetente `Precificaí <noreply@precificaiapp.com>`, resposta para `contato@precificaiapp.com`, cabeçalho List-Unsubscribe, 600 ms entre envios.

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

**Checkup feito em 14/10 (noite):** crons 2 e 3 ativos. Simulação via SQL (`select estagio, plano, count(*) from public.email_candidatos(...)` passa no classificador; chamar a função HTTP não passa, nem amostra): reativação do cron 29, d1 de 13 e 14/10 11 (6 kit, 2 sem_perfil, 2 produto_sem_preco, 1 ativo), reativação até 13/10 31 (as 29 + 2 `ativo` ilimitado). Total previsto: 42. Os 11 modelos foram renderizados localmente (`montarEmail` via `node --experimental-strip-types`) sem `RR$`, sem `nbsp;` solto e sem travessão.
**Amostras e disparo (14/10, noite):** as 11 amostras `[Teste]` saíram para erickfa@live.com e o Erick aprovou. Passos 2 e 3 agendados no pg_cron como job 4 `email-disparo-2026-10-15` (`15 12 15 10 *` = 15/10, 9h15; se apaga sozinho; o segredo vem do Vault). Falta só o passo 5 (relatório): conferir `cron.job_run_details` dos jobs 3 e 4 e `email_envios` por campanha/etapa (esperado 29 + 11 + 2 = 42).
**Cópia para o Erick:** 1 amostra `[Teste]` de cada modelo para erickfa@live.com ANTES de cada disparo (sem BCC em cada envio). Scripts na scratchpad da sessão 5161be97: `amostras.sh` (11 amostras) e `disparo-15-10.sh` (passos 2 e 3; recusa rodar antes das 9h15). Os dois leem o segredo de `03abd2a9…/scratchpad/.email_cron_secret`; se o /tmp for limpo (reboot), ler de novo do Vault.

## Régua semanal (código pronto em 14/10, NÃO aplicada nem publicada)

Desenho: `.specs/plans/email-regua.design.md`. Depois do d1/d3: dias 7-30 a cada 7 dias, 31-90 a cada 15, depois mensal (pausa após 3 mensais sem clique e sem voltar ao app). Nunca para quem usou o app nos últimos 3 dias nem para quem recebeu qualquer e-mail (fora d1/d3) nos últimos 7.

| Peça | Onde |
|---|---|
| Regra de calendário e candidatos | migration `20261015100000_email_regua.sql` (`email_regua_fase`, `email_regua_motivo`, `email_regua_candidatos(p_agora, p_todos)`, `email_dados(uid)`, tabelas `email_eventos` e `email_config`) |
| Teste da regra (SQL) | `supabase/tests/email_regua_motivo.sql` (vazio = ok; rodado inline em 14/10: 15/15) |
| Temas × formatos e escolha | `supabase/functions/email-ciclo-vida/regua.ts` (14 temas de etapa + 2 mensais, 2 formatos cada) |
| Moldura e 6 formatos | `layout.ts` (`moldura`, `htmlNumeros`, `htmlMito`, `htmlChecklist`, `htmlVideo`, `htmlTela`) |
| d1/d3/campanhas (sem mudança de HTML) | `legado.ts` |
| Testes | `__tests__/emailRegua.test.mjs` |
| Prévia (página) | `node scripts/email-previa.ts --saida X.html [--simulacao amanha.json --dia 16/10]`; publicada em https://claude.ai/artifact/AksERXs6xcxa3mwZM4KJPk |

Chamadas novas: `{"regua":true}` simula; `{"regua":true,"enviar":true}` envia. Automático: o job de hora em hora roda a régua às 10h de Brasília em dia útil, só com `email_config.regua_ativa = true` (nasce `false`). Teto de 150/dia; 3 falhas seguidas param o dia. Webhook do Resend: POST com headers `svix-*` na mesma função (secret `RESEND_WEBHOOK_SECRET`); `bounced`/`complained` viram opt-out.

**Para ligar (cada passo com OK do Erick, só depois do disparo de 15/10 9h15):**
1. Aplicar a migration `20261015100000` e rodar `supabase/tests/email_regua_motivo.sql`.
2. Deploy: `npx supabase functions deploy email-ciclo-vida --no-verify-jwt --project-ref lwznqpxzmqptrpbifvka`.
3. Resend: ligar rastreio de clique no domínio e criar webhook (`email.clicked`, `email.opened`, `email.bounced`, `email.complained`, `email.delivered`) para a URL da função; salvar o segredo `whsec_…` como `RESEND_WEBHOOK_SECRET` nos secrets da função.
4. Tarefa agendada do Claude às 17h (dias úteis): simular amanhã com `email_regua_candidatos(<amanhã 10h>, true)` + dados anonimizados, rodar `scripts/email-previa.ts` e republicar a prévia no mesmo link.
5. 1 semana em simulação; Erick liga: `update public.email_config set valor = 'true' where chave = 'regua_ativa';`

Pendente na V1: prints de tela (formato `tela`, pasta `assets/email/telas/`) ainda não existem, então nenhum tema usa esse formato; custo/margem no e-mail; datas sazonais; e-mails assinados.

## Histórico

- 14/10: sistema criado (d1/d3/campanhas, descadastro com link assinado), layout novo da marca (cabeçalho verde, barra de jornada, caixa "Você escreve", capa do vídeo, preços do Pro), bug do `R$` corrigido antes de qualquer envio real, etapa do kit corrigida.
- Ideias em espera (decidir com mais dados, ~30 contas que chegaram ao Kit): o Kit de Início com ~90 ingredientes sem preço parece travar o primeiro preço.
- Próximo vídeo tutorial: mostrar "Vende no delivery" dentro de Produtos e que dá para cadastrar insumo, embalagem e receita de dentro do produto.
