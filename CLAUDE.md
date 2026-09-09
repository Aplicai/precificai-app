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

- **Alert.alert no React Native Web é NO-OP nativo** (`class Alert { static alert() {} }` em react-native-web 0.21). Desde a auditoria 2026-09, `index.js` instala o shim `src/utils/webAlert.js`: 0-1 botão → `window.alert` + `onPress`; 2+ botões → `window.confirm` (OK = último botão não-cancel, Cancelar = `style:'cancel'`). Fluxos com 3 opções reais devem usar Modal+Pressable.
- **`supabaseDb.js` (SQL → PostgREST):** parser em `src/database/sqlParse.js` (puro, testado). Suporta `=`, `!=`, `<`, `>`, `<=`, `>=`, `IS [NOT] NULL`, `IN (...)`, um JOIN, aliases `x.col AS y`, `ORDER BY col [COLLATE] [DESC]`, `LIMIT`. Condição não suportada (LIKE/OR/BETWEEN) → resultado de erro (nunca "todas as linhas"); em UPDATE/DELETE → throw. Colunas da tabela joinada no WHERE são filtradas client-side.
- **`[]` do wrapper pode ser ERRO, não "vazio":** use `isDbErrorResult(rows)` antes de semear defaults/apagar/zerar algo baseado em lista vazia.
- **Parse numérico PT-BR:** sempre `parseDecimalBR`/`parseDecimalBROrZero` (`src/utils/calculations.js`). `parseFloat(x.replace(',', '.'))` quebra em "1.000,50" → 1.
- **Hooks tipo `useState` por tela:** não fazem broadcast cross-screen. Para preferências globais (densidade, tema), use module-level store + Set de listeners (ver `src/hooks/useListDensity.js`).
- **Vercel env vars `EXPO_PUBLIC_*`:** inlined em BUILD time. Mudou env? Tem que rebuildar.
- **`WebHeader.ROUTE_TITLES`:** mapeamento manual — adicionar TODA rota nova senão título cai no nome da tab.

## Convenções

- **Idioma:** Comunicação com usuário sempre em PT-BR. Código + commits em inglês.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`).
- **Push:** Nunca pushar sem confirmação explícita do usuário.
- **Skills obrigatórias:** Ver `~/.claude/CLAUDE.md` (global) — `brainstorming`, `systematic-debugging`, `verification-before-completion`, etc.
