import { useWindowDimensions, Platform } from 'react-native';

// Sprint 1 Q2 — alinhado com webLayout.breakpointDesktop (theme) e AppNavigator (1024).
// Antes era 768: entre 768-1023px o hook dizia "desktop" (sidebar montada) mas BottomTab continuava visível,
// quebrando layout em tablet portrait e laptop pequeno.
const BREAKPOINT_DESKTOP = 1024;

export default function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktop = isWeb && width >= BREAKPOINT_DESKTOP;
  const isMobile = !isDesktop;

  return { isDesktop, isMobile, width };
}
