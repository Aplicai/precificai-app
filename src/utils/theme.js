export const colors = {
  // Paleta oficial aplicaí / Precificaí
  primary: '#004d47',
  primaryLight: '#1d716a',
  primaryMid: '#39948d',
  primarySoft: '#56b7b0',
  primaryPale: '#72dbd3',
  primaryDark: '#003833',
  // Refinamento visual 09/09 — @deprecated (decorativas). Azul/roxo/teal só
  // existiam pra "colorir" KPI e contadores; cor agora tem significado (verde =
  // ação/positivo, vermelho = prejuízo/erro, âmbar = atenção). As chaves ficam
  // porque outras telas ainda importam; NÃO usar em código novo. A paleta de
  // categoria (ponto de 8 px) é a única exceção legítima.
  /** @deprecated decorativa — use colors.primary / colors.text */
  accent: '#265bb0',
  /** @deprecated decorativa */
  accentLight: '#4173c3',
  /** @deprecated decorativa */
  accentMid: '#5b8bd6',
  /** @deprecated decorativa */
  accentSoft: '#76a2e9',
  /** @deprecated decorativa */
  accentPale: '#90bafc',
  yellow: '#e3b842',
  yellowLight: '#eac35a',
  yellowMid: '#f1cf72',
  yellowSoft: '#f8db89',
  yellowPale: '#ffe6a1',
  coral: '#e3704d',
  coralLight: '#ea8262',
  /** @deprecated decorativa — use colors.textSecondary */
  purple: '#6a4fb0',
  /** @deprecated decorativa */
  purpleLight: '#7f65c4',
  red: '#c74040',
  redLight: '#d35959',
  // UI colors
  secondary: '#e3b842',
  secondaryLight: '#eac35a',
  // Refinamento visual 09/09 — fundo quente (era #F4F6F5, cinza frio) e borda
  // quente. textSecondary #5F706E sobre #F6F5F1 = 4.78:1 (AA ok, ver themeContrast.test).
  background: '#F6F5F1',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1B2A27',
  textSecondary: '#5F706E', // Audit a11y: 4.8:1 sobre background / 5.2:1 sobre surface (era #6B7D7B = 3.99:1, fail AA)
  textLight: '#FFFFFF',
  border: '#E6E4DE',
  // Tinta neutra-esverdeada para círculos de ícone (EmptyState) e fundos de tile.
  surfaceTint: '#EEF3F1',
  error: '#c74040',
  success: '#2E7D32',
  warning: '#e3704d',
  // Texto sobre tinta âmbar (yellow + '26'): 5.3:1 — AA pra legenda 11-12 px.
  warningDark: '#8A5A00',
  /** @deprecated decorativa — use colors.primary para ícones informativos */
  info: '#265bb0',
  disabled: '#B0BEC5',
  // Sprint 3 S10 — placeholder usava `disabled` (#B0BEC5) que é WCAG AA fail
  // contra fundo branco (contraste 2.4:1). Novo token tem ratio 5.2:1.
  // Componentes de input devem usar `colors.placeholder` (não `disabled`)
  // para texto de placeholder/hint.
  placeholder: '#5F706E', // Audit a11y: mesmo tom do textSecondary (AA ≥ 4.5:1)
  inputBg: '#F8FAF9',
  shadow: '#004d47',
  // Sprint 1 Q1 — token fantasma usado em 5 telas (ConfiguracoesScreen, ContaSegurancaScreen) sem declaração; alias para accent.
  blue: '#265bb0',
};

// Sprint 3 S10 — tokens de foco acessível para web.
// Substitui `outlineStyle: 'none'` que removia foco visível (WCAG 2.4.7 fail).
// Usar em telas web: `Platform.select({ web: focus.visibleRing })`.
export const focus = {
  visibleRing: {
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: colors.primary,
    outlineOffset: 2,
  },
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const fonts = {
  regular: 16,
  small: 14,
  tiny: 12,
  medium: 17,
  large: 18,
  title: 22,
  header: 28,
  // Sprint 1 Q1 — tokens fantasma usados em 8 telas mas inexistentes; sem isso fontSize: undefined colapsava hierarquia.
  body: 15,
  xlarge: 24,
};

// UX audit 2026-09-09 (Fase B) — escala tipográfica única. Mínimo legível é
// 10 (badges/contadores) e 11 para qualquer texto corrido/legenda; nada abaixo.
// Refinamento visual 09/09 — escala fixa: título de tela 22/600; título de
// seção 13/600 uppercase (tracking 0.6); corpo 14/400; valor destaque 22/600
// tabular; legenda 12/400; micro 11.
export const typography = {
  title: 22,
  section: 13,
  body: 14,
  caption: 12,
  value: 22,
  micro: 11,
};

// Estilo pronto do título de seção (13/600 uppercase, tracking 0.6, 8 px abaixo).
// Uso: `<Text style={sectionTitle}>` ou `[sectionTitle, { ... }]`.
export const sectionTitle = {
  fontSize: 13,
  fontWeight: '600',
  fontFamily: 'DMSans-SemiBold',
  color: '#5F706E',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 8,
};

// Números são o conteúdo: dígitos tabulares alinham colunas de R$ e %.
// Web (react-native-web 0.21) mapeia fontVariant → font-variant-numeric.
export const numeric = {
  fontVariant: ['tabular-nums'],
};

// Raios do refinamento visual (borderRadius abaixo continua para código legado).
export const radius = {
  sm: 8,
  md: 10,
  lg: 14,
};

export const fontFamily = {
  regular: 'DMSans-Regular',
  medium: 'DMSans-Medium',
  semiBold: 'DMSans-SemiBold',
  bold: 'DMSans-Bold',
  extraBold: 'DMSans-ExtraBold',
};

export const borderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 50,
};

export const webLayout = {
  sidebarExpanded: 260,
  sidebarCollapsed: 68,
  headerHeight: 56,
  breakpointDesktop: 1024,
};
