/**
 * Abre as páginas legais publicadas (public/terms e public/privacy).
 *
 * Uma fonte só para Termos e Privacidade: o cadastro e a tela Sobre tinham
 * cópias próprias (texto de março/2026 e links para www.precificaiapp.com/termos,
 * que não existe). Na web abre o caminho relativo em nova aba (vale também no
 * preview/localhost); no nativo, a URL absoluta do app.
 */
import { Linking, Platform } from 'react-native';

export const APP_ORIGIN = 'https://app.precificaiapp.com';
export const TERMS_PATH = '/terms';
export const PRIVACY_PATH = '/privacy';

export function openLegalPage(path) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(path, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(APP_ORIGIN + path).catch(() => {});
}
