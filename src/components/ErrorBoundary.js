/**
 * ErrorBoundary — boundary GLOBAL de render (Sessão 17/06/2026).
 *
 * Motivação: o app não tinha NENHUM ErrorBoundary com fallback de UI. O
 * `wrap()` do App.js só usa `Sentry.wrap()`, que NÃO renderiza fallback — e
 * com EXPO_PUBLIC_SENTRY_DSN vazio o Sentry nem inicializa. Resultado: qualquer
 * erro de render (um `.toFixed()` em null, `.map` em undefined, etc.) virava
 * TELA BRANCA (React Native Web desmonta a árvore). Já aconteceu em Insumos e
 * no Financeiro.
 *
 * Este boundary captura o erro, reporta (captureException — no-op se Sentry
 * off, mas sempre loga no console) e mostra uma tela de recuperação com a
 * mensagem do erro (ajuda o usuário a mandar print pro suporte e nós a
 * diagnosticar mesmo sem Sentry).
 *
 * IMPORTANTE: boundaries só pegam erros de RENDER/lifecycle, não de handlers
 * async (esses são unhandled rejections e normalmente não branqueiam). Por isso
 * os handlers de salvar também devem ter try/catch próprio.
 */
import React from 'react';
import { View, Text, Pressable, Platform, ScrollView } from 'react-native';
import { colors } from '../utils/theme';
import { captureException } from '../utils/errorReporter';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    try {
      captureException(error, { boundary: 'global' });
    } catch (_) {}
    if (typeof console !== 'undefined' && console.error) {
      // eslint-disable-next-line no-console
      console.error('[ErrorBoundary] erro de render capturado:', error, info && info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleReload = () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location) {
      window.location.reload();
    } else {
      this.handleReset();
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const msg = (this.state.error && this.state.error.message) || 'Erro desconhecido';

    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>😕</Text>
        <Text style={{ fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center', marginBottom: 8 }}>
          Algo deu errado nesta tela
        </Text>
        <Text style={{ fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 20, maxWidth: 360 }}>
          Seus dados estão salvos. Tente recarregar — se o problema continuar, tire um print desta mensagem e mande pro suporte.
        </Text>
        <Pressable
          onPress={this.handleReload}
          style={{ backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: 28, borderRadius: 10, marginBottom: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Recarregar"
        >
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Recarregar</Text>
        </Pressable>
        <Pressable onPress={this.handleReset} style={{ paddingVertical: 8, paddingHorizontal: 16 }} accessibilityRole="button" accessibilityLabel="Tentar de novo">
          <Text style={{ color: colors.textSecondary, fontSize: 13, textDecorationLine: 'underline' }}>Tentar de novo sem recarregar</Text>
        </Pressable>
        <ScrollView style={{ maxHeight: 90, marginTop: 16 }} contentContainerStyle={{ paddingHorizontal: 8 }}>
          <Text style={{ fontSize: 11, color: colors.textSecondary, opacity: 0.6, textAlign: 'center' }}>
            Detalhe técnico: {String(msg).slice(0, 240)}
          </Text>
        </ScrollView>
      </View>
    );
  }
}
