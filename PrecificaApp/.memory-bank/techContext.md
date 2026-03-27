# Tech Context

## Stack Principal

| Camada | Tecnologia | Versao |
|--------|-----------|--------|
| Framework | React Native (Expo) | Expo ~54, RN 0.81.5 |
| Web | react-native-web | 0.21.0 |
| React | React | 19.1.0 |
| Navegacao | React Navigation | v6 (native-stack + bottom-tabs) |
| Backend/DB | Supabase (PostgreSQL) | supabase-js 2.100.0 |
| Auth | Supabase Auth | via supabase-js |
| Storage local | AsyncStorage | 3.0.1 (para sessao auth) |
| Fontes | expo-font | DM Sans (Regular, Medium, SemiBold, Bold, ExtraBold) |
| Icones | @expo/vector-icons | Feather + MaterialCommunityIcons |
| Animacoes | react-native-reanimated | ~4.1.1 |
| Gestos | react-native-gesture-handler | ~2.28.0 |
| Testes E2E | Playwright | 1.58.2 (devDependency) |

## Arquitetura do Banco de Dados

### Wrapper SQL-to-Supabase (`supabaseDb.js`)
- O app foi originalmente escrito para SQLite (expo-sqlite)
- `supabaseDb.js` e um wrapper que traduz SQL strings para chamadas da API Supabase JS
- Expoe a mesma interface: `getAllAsync()`, `getFirstAsync()`, `runAsync()`
- Suporta SELECT, INSERT, UPDATE, DELETE e JOINs simples
- Cache em memoria com TTL de 5 segundos para queries de leitura
- Invalidacao de cache por tabela em operacoes de escrita
- Cada registro tem `user_id` para isolamento multi-tenant

### `database.js` (Facade)
- `getDatabase()` retorna instancia do Supabase DB cacheada
- Vincula ao `userId` da sessao autenticada
- Executa migracoes idempotentes na primeira chamada
- `resetDatabase()` limpa cache no logout

### Migracoes
- Converte `unidade_rendimento` legado ('Grama(s)' -> 'por_kg', 'Mililitro(s)' -> 'por_litro')
- Roda uma unica vez por sessao, idempotente

## Configuracao Supabase
- URL e Anon Key via variaveis de ambiente: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`
- Auth com persistencia via AsyncStorage
- Auto-refresh de token habilitado

## Layout Responsivo
- Breakpoint desktop: 768px (useResponsiveLayout) / 1024px (AppNavigator para headers)
- Mobile: bottom tabs (6 abas)
- Desktop web: sidebar lateral (WebLayout) + WebHeader, bottom tabs escondidas
- `useResponsiveLayout()` hook retorna `{ isDesktop, isMobile, width }`

## Decisoes Arquiteturais

1. **SQL wrapper sobre Supabase** - Permite manter todo o codigo de telas inalterado (originalmente SQLite). Trade-off: parser SQL customizado e limitado mas funcional.

2. **Calculos centralizados** - Todas as funcoes de custo em `calculations.js`. Nenhuma tela faz calculo inline de `/1000`.

3. **Multi-tenant por user_id** - Cada INSERT adiciona `user_id` automaticamente. Isolamento via RLS no Supabase.

4. **Cache com TTL curto** - 5s de cache para leituras evita queries repetidas sem dados stale.

5. **Expo managed workflow** - Sem eject, usando expo-font, expo-sqlite (backup), expo-status-bar.

6. **DM Sans como fonte unica** - Tipografia consistente em 5 pesos.

## Scripts

```
npm start       → expo start
npm run web     → expo start --web
npm run android → expo start --android
npm run ios     → expo start --ios
```

## Porta de Desenvolvimento
- App web roda na porta 8083
