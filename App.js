import React from 'react';
import { View, Text, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import AppNavigator from './src/navigation/AppNavigator';
import { AuthProvider } from './src/contexts/AuthContext';
import { colors } from './src/utils/theme';
import { initErrorReporter, wrap as wrapWithSentry } from './src/utils/errorReporter';
import GlobalToastHost from './src/components/GlobalToastHost';

// Inicializa o reporter de erros (P0-01). No-op se DSN ausente.
initErrorReporter();

// Remove browser default outline on all inputs (web only)
if (Platform.OS === 'web' && typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    input, textarea, select, [contenteditable] {
      outline: none !important;
      -webkit-tap-highlight-color: transparent;
    }
    input:focus, textarea:focus, select:focus {
      outline: none !important;
      box-shadow: none !important;
    }
  `;
  document.head.appendChild(style);
}

function App() {
  const [fontsLoaded] = useFonts({
    'DMSans-Regular': require('./assets/fonts/DMSans-Regular.ttf'),
    'DMSans-Medium': require('./assets/fonts/DMSans-Medium.ttf'),
    'DMSans-SemiBold': require('./assets/fonts/DMSans-SemiBold.ttf'),
    'DMSans-Bold': require('./assets/fonts/DMSans-Bold.ttf'),
    'DMSans-ExtraBold': require('./assets/fonts/DMSans-ExtraBold.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 16, color: colors.textSecondary }}>Carregando...</Text>
      </View>
    );
  }

  return (
    <AuthProvider>
      <View style={{ flex: 1 }}>
        <StatusBar style="light" />
        <AppNavigator />
        {/* Sessão 28.53 — toast bus global p/ feedback após ações que encerram a tela */}
        <GlobalToastHost />
      </View>
    </AuthProvider>
  );
}

// Boundary global do Sentry — captura erros não tratados em qualquer lugar do app
export default wrapWithSentry(App);
