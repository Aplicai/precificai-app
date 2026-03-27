# System Patterns

## Estrutura de Pastas

```
PrecificaApp/
├── App.js                    # Entry point, AuthProvider + AppNavigator
├── package.json
├── assets/
│   ├── fonts/                # DM Sans (5 pesos)
│   └── images/               # Logos e imagens
├── src/
│   ├── config/
│   │   └── supabase.js       # Cliente Supabase
│   ├── contexts/
│   │   └── AuthContext.js    # Auth state global (user, session, signIn/Out)
│   ├── database/
│   │   ├── database.js       # Facade: getDatabase(), resetDatabase()
│   │   └── supabaseDb.js     # Wrapper SQL → Supabase JS API
│   ├── navigation/
│   │   └── AppNavigator.js   # Tab navigator + stacks por secao
│   ├── screens/              # ~39 telas
│   ├── components/           # Componentes reutilizaveis
│   │   ├── Card.js
│   │   ├── InputField.js
│   │   ├── PickerSelect.js
│   │   ├── SearchBar.js
│   │   ├── InfoTooltip.js
│   │   ├── ConfirmDeleteModal.js
│   │   ├── FAB.js
│   │   ├── EmptyState.js
│   │   ├── LoadingState.js
│   │   └── web/              # Componentes exclusivos desktop
│   │       ├── Sidebar.js
│   │       ├── WebHeader.js
│   │       └── WebLayout.js
│   ├── hooks/
│   │   └── useResponsiveLayout.js
│   ├── utils/
│   │   ├── calculations.js   # Todas as funcoes de calculo
│   │   ├── theme.js          # Cores, spacing, fontes, borderRadius
│   │   ├── financeiroStatus.js
│   │   ├── setupStatus.js
│   │   └── templates.js      # Templates do Kit de Inicio
│   └── data/
│       └── templates.js      # Dados de templates
└── .memory-bank/             # Memoria persistente do projeto
```

## Padroes de Codigo

### Telas (Screens)
- Componentes funcionais com hooks
- `useFocusEffect(useCallback(() => { load(); }, []))` para carregar dados ao focar
- `getDatabase()` para obter instancia do DB
- Queries SQL diretas (o wrapper traduz para Supabase)
- `useResponsiveLayout()` para adaptar layout mobile/desktop
- StyleSheet.create() no final do arquivo

### Navegacao
- 6 tabs no BottomTabNavigator: Inicio, Insumos, Preparos, Embalagens, Produtos, Ferramentas
- Cada tab tem seu proprio Stack Navigator
- Auth flow separado: Login → Register → ForgotPassword
- Onboarding flow: ProfileSetup → KitInicio → Onboarding → MainTabs
- Desktop: headers das stacks escondidos (WebHeader assume)

### Componentes Reutilizaveis
- `Card` - container com sombra e borda
- `InputField` - input estilizado com label
- `PickerSelect` - select customizado
- `InfoTooltip` - icone (i) com modal explicativo
- `ConfirmDeleteModal` - confirmacao de exclusao com botao ✕ visivel (preferencia do usuario)
- `SearchBar` - barra de busca com icone
- `FAB` - floating action button
- `EmptyState` / `LoadingState` - estados vazios e carregamento

### Theme System
- Cores centralizadas em `colors` (paleta teal/verde-escuro como primaria)
- `fontFamily` com 5 pesos de DM Sans
- `spacing` (xs=4, sm=8, md=16, lg=24, xl=32)
- `borderRadius` (sm=8, md=12, lg=16, xl=20, full=50)
- `webLayout` para dimensoes do layout desktop

### Convencoes
- Interface 100% em portugues brasileiro
- Moeda: R$ (Real brasileiro), formato `R$ 1.234,56`
- Percentuais internos como decimal (0.15 = 15%), exibidos como `15,00%`
- `formatCurrency()` e `formatPercent()` para formatacao
- `normalizeSearch()` para busca sem acentos

### Padrao de Calculo
- **NUNCA** fazer `/1000` inline nas telas
- Sempre usar `calcCustoIngrediente()` e `calcCustoPreparo()` de `calculations.js`
- Verificar tipo 'un' (unidade) que nao divide por 1000

### Padrao de Exclusao
- Usuario prefere botao ✕ visivel em vez de long-press para deletar itens

### Auth Pattern
- `AuthProvider` no App.js envolve tudo
- `useAuth()` retorna `{ user, session, loading, signIn, signUp, signOut, resetPassword }`
- Se `user` existe → AppContent, senao → AuthNavigator
- Logout limpa cache do DB via `resetDatabase()`

### Database Pattern
- Toda query passa por `getDatabase()` → retorna wrapper Supabase
- INSERT automaticamente adiciona `user_id`
- SELECT com cache de 5s, invalidado por tabela no write
- JOINs suportados via parser dedicado (2 queries + merge em memoria)
