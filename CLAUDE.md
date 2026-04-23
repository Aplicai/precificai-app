# PrecificaApp — Regras de inicialização

## Regra obrigatória de início de sessão

Em toda nova sessão neste projeto (incluindo após `/compact` e `/resume`):

1. **Ler TODOS os arquivos de `.memory-bank/` via `mcp__memory-bank__memory_bank_read`:**
   - `activeContext.md` — estado mais recente, sessão em andamento
   - `progress.md` — o que está pronto vs pendente
   - `projectbrief.md` — escopo geral
   - `productContext.md` — regras de negócio e UX
   - `techContext.md` — stack, gotchas, padrões técnicos
   - `systemPatterns.md` — decisões de arquitetura
2. Ler este `CLAUDE.md` por completo
3. Resumir em 3-5 linhas o estado atual antes de qualquer alteração
4. Só então começar análise ou implementação

**NUNCA pergunte ao usuário "o que estávamos fazendo?" — a resposta está no Memory Bank.**

## Auditoria de contexto

- Use `/memory` a qualquer momento para conferir o que está carregado.
- Se o Memory Bank parecer desatualizado em relação ao código, atualizar `activeContext.md` antes de seguir.

## Escrita obrigatória no Memory Bank

| QUANDO | ARQUIVO |
|--------|---------|
| Após concluir qualquer tarefa | `activeContext.md` + `progress.md` |
| Decisão arquitetural | `systemPatterns.md` |
| Padrão técnico descoberto / gotcha resolvido | `techContext.md` |
| Antes de `/compact` | `activeContext.md` (snapshot completo) |
| Regra de negócio mapeada | `productContext.md` |

## Stack do projeto

- **Mobile + Web:** React Native + Expo SDK 54 (web/iOS/Android)
- **Local DB:** SQLite (expo-sqlite) — schema em `src/database/`
- **Remoto:** Supabase (auth + sync) — env em `.env.local`
- **Deploy web:** Vercel (`precificaiapp.com`) via `expo export --platform web --clear` + `vercel deploy --prebuilt --prod --yes`
- **Erros:** Sentry (DSN inlined no build)
- **Navegação:** React Navigation (Tab + Stack + RootStack)

## Gotchas críticos (já resolvidos — não repetir)

- **Alert.alert no React Native Web:** só renderiza ≤2 botões via `window.confirm`; descarta extras. Use Modal+Pressable para ActionSheets.
- **Alert.alert post-success no web:** o callback `onPress` não dispara confiavelmente. Use `window.alert(...)` síncrono + `navigation.goBack()`.
- **Hooks tipo `useState` por tela:** não fazem broadcast cross-screen. Para preferências globais (densidade, tema), use module-level store + Set de listeners (ver `src/hooks/useListDensity.js`).
- **Vercel env vars `EXPO_PUBLIC_*`:** inlined em BUILD time. Mudou env? Tem que rebuildar.
- **`WebHeader.ROUTE_TITLES`:** mapeamento manual — adicionar TODA rota nova senão título cai no nome da tab.

## Convenções

- **Idioma:** Comunicação com usuário sempre em PT-BR. Código + commits em inglês.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- **Push:** Nunca pushar sem confirmação explícita do usuário.
- **Skills obrigatórias:** Ver `~/.claude/CLAUDE.md` (global) — `brainstorming`, `systematic-debugging`, `verification-before-completion`, etc.
