import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { spacing, fonts, fontFamily } from '../utils/theme';

/**
 * Faixa vermelha "não deu pra carregar + Tentar novamente" dos formulários de
 * edição (ficha técnica, receita base). Mesmo visual dos banners de erro da
 * tela de combos.
 */
export default function CargaErroBanner({ mensagem, onRetry }) {
  if (!mensagem) return null;
  return (
    <View style={styles.banner} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Text style={styles.texto}>{mensagem}</Text>
      {onRetry ? (
        <TouchableOpacity onPress={onRetry} style={styles.botao} accessibilityRole="button" accessibilityLabel="Tentar carregar novamente">
          <Text style={styles.botaoTexto}>Tentar novamente</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 4,
  },
  texto: {
    flex: 1,
    color: '#991b1b',
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
  },
  botao: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: '#dc2626', borderRadius: 4, marginLeft: spacing.xs,
  },
  botaoTexto: {
    color: '#fff', fontSize: fonts.tiny, fontWeight: '700',
    fontFamily: fontFamily.bold,
  },
});
