import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { colors, spacing, fonts, fontFamily } from '../utils/theme';

/**
 * Loader — placeholder de carregamento com mensagem contextual (audit P1-16).
 *
 * Por padrão renderiza uma barra de progresso indeterminada e a mensagem
 * "Carregando...". Use a prop `message` para descrever ESPECIFICAMENTE o que
 * está sendo carregado — isso reduz a percepção de demora e dá contexto.
 *
 * Exemplos:
 *   <Loader message="Calculando custos..." />
 *   <Loader message="Sincronizando seus produtos..." />
 *   <Loader message="Atualizando preços do mercado..." />
 *
 * Variantes:
 *  - mode="bar" (default): barra de progresso animada, mais discreta
 *  - mode="spinner": ActivityIndicator clássico (para áreas pequenas)
 *  - mode="inline": versão compacta para usar dentro de cards/listas
 */
export default function Loader({
  message = 'Carregando...',
  mode = 'bar',
  size = 'small',
  color = colors.primary,
  style,
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (mode !== 'bar') return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, { toValue: 1, duration: 900, useNativeDriver: false }),
        Animated.timing(anim, { toValue: 0, duration: 900, useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, mode]);

  if (mode === 'inline') {
    return (
      <View style={[styles.inlineContainer, style]}>
        <ActivityIndicator size="small" color={color} />
        {message && <Text style={styles.inlineText}>{message}</Text>}
      </View>
    );
  }

  if (mode === 'spinner') {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size={size} color={color} />
        {message && <Text style={styles.message}>{message}</Text>}
      </View>
    );
  }

  // Default: animated bar
  const widthInterpolated = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['20%', '80%'],
  });

  return (
    <View style={[styles.container, style]}>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, { width: widthInterpolated, backgroundColor: color }]} />
      </View>
      {message && <Text style={styles.message}>{message}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  barTrack: {
    width: 200,
    height: 4,
    backgroundColor: colors.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  barFill: {
    height: 4,
    borderRadius: 2,
  },
  message: {
    marginTop: 12,
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    textAlign: 'center',
  },
  inlineContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  inlineText: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
});
