# Checkup de Segurança — PrecificaApp (2026-06-12)

> Data: 2026-06-12

## Índice

- [Postura geral](#postura-geral)
- [Achados](#achados)
  - [Médios](#médios)
  - [Baixos](#baixos)
  - [Informativos](#informativos)
- [Riscos de fraude de assinatura](#riscos-de-fraude-de-assinatura)
- [O que está bem feito](#o-que-está-bem-feito)

## Postura geral

**BOA / madura.** Nenhum Crítico/Alto explorável remotamente. RLS consistente (~40 tabelas com `auth.uid() = user_id`), segredos server-side, JWT verificado nas edge functions, CSP, PII scrubbing no Sentry.

## Achados

### Médios

- **[MÉDIO] M-1 — Webhook confia no `externalReference` sem reconciliar com a API do Asaas.**
  - Referência: `supabase/functions/asaas-webhook/index.ts:48-58,87-136`
  - Sem validação valor↔plano.
  - Risco: forjar pagamento (se token vazar) ou pagar plano barato e receber o caro.
  - Remediação: `GET /payments/{id}`, validar status + value, validar `PRICING[plano][ciclo] == value`, validar UUID/plano.

- **[MÉDIO] M-2 — Schema versionado de `subscriptions` diverge da produção** (CHECK com `'essencial'`/`'profissional'`, faltam colunas ciclo/`asaas_*`).
  - Referências: `src/database/supabase-schema.sql:266-275` vs `asaas-webhook/index.ts:104-112`
  - Remediação: versionar migration reconciliando.

### Baixos

- **[BAIXO] B-1 — `deploy.sh` (raiz) publica sem headers CSP.**
  - Remediação: remover ou chamar `ensure-vercel-headers.js`.

- **[BAIXO] B-2 — CSP com `unsafe-inline`/`unsafe-eval` + JWT em `localStorage`** (defesa em profundidade; sem XSS conhecido).

- **[BAIXO] B-3 — `send-feedback-email` pode estar sem `verify_jwt`** (não há `config.toml` versionado).
  - Remediação: versionar `supabase/config.toml` com `verify_jwt` por função.

### Informativos

- **[INFO] I-1 — `send-push` lê `expo_push_token` mas a coluna é `token`** (migration `20260507000000`) — quebra push.
  - Referência: `send-push/index.ts:109,117,149`

## Riscos de fraude de assinatura

- Auto-upgrade pelo client **BLOQUEADO** (RLS read-only em `subscriptions`, nenhum insert/update no client).
- O único vetor real é **M-1 (webhook)**.

## O que está bem feito

- `validate-env.js` alerta se `service_role` for shipada como anon.
- RLS abrangente.
- Sem SQL injection (placeholders no SQLite local).
- Senha forte.
- Sentry remove PII.
- CSP completa.
- Deps modernas.

> Não foi rodado `npm audit` — recomendado no CI.
