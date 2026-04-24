export const colors = {
  // Paleta oficial aplicaí / Precificaí
  primary: '#004d47',
  primaryLight: '#1d716a',
  primaryMid: '#39948d',
  primarySoft: '#56b7b0',
  primaryPale: '#72dbd3',
  primaryDark: '#003833',
  accent: '#265bb0',
  accentLight: '#4173c3',
  accentMid: '#5b8bd6',
  accentSoft: '#76a2e9',
  accentPale: '#90bafc',
  yellow: '#e3b842',
  yellowLight: '#eac35a',
  yellowMid: '#f1cf72',
  yellowSoft: '#f8db89',
  yellowPale: '#ffe6a1',
  coral: '#e3704d',
  coralLight: '#ea8262',
  purple: '#6a4fb0',
  purpleLight: '#7f65c4',
  red: '#c74040',
  redLight: '#d35959',
  // UI colors
  secondary: '#e3b842',
  secondaryLight: '#eac35a',
  background: '#F4F6F5',
  surface: '#FFFFFF',
  card: '#FFFFFF',
  text: '#1A2B2A',
  textSecondary: '#6B7D7B',
  textLight: '#FFFFFF',
  border: '#D8E0DE',
  error: '#c74040',
  success: '#2E7D32',
  warning: '#e3704d',
  info: '#265bb0',
  disabled: '#B0BEC5',
  // Sprint 3 S10 — placeholder usava `disabled` (#B0BEC5) que é WCAG AA fail
  // contra fundo branco (contraste 2.4:1). Novo token tem ratio 5.2:1.
  // Componentes de input devem usar `colors.placeholder` (não `disabled`)
  // para texto de placeholder/hint.
  placeholder: '#6B7D7B',
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
