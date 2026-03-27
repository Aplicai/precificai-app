import { useWindowDimensions, Platform } from 'react-native';

const BREAKPOINT_DESKTOP = 768;

export default function useResponsiveLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';
  const isDesktop = isWeb && width >= BREAKPOINT_DESKTOP;
  const isMobile = !isDesktop;

  return { isDesktop, isMobile, width };
}
