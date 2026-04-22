import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing, Platform } from 'react-native';
import { colors, spacing, borderRadius } from '../utils/theme';

/**
 * Skeleton — placeholder animado para loading.
 *
 * Substitui o `<ActivityIndicator />` genérico em telas baseadas em listas
 * (audit P1-11). Em vez de spinner sem contexto, o usuário vê o
 * "esqueleto" do conteúdo que está vindo — reduz ansiedade e dá
 * sensação de que o conteúdo carrega mais rápido (perceived performance).
 *
 * Uso:
 *   <Skeleton width={120} height={16} />
 *   <Skeleton.Card />               // skeleton de um item de lista padrão
 *   <Skeleton.List count={6} />     // 6 cards skeleton enfileirados
 */
function Skeleton({ width = '100%', height = 16, radius = borderRadius.sm, style }) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    // Pulse 0.4 → 0.85 → 0.4. Animated.loop com useNativeDriver: true.
    // Em web, useNativeDriver é ignorado mas Animated funciona via JS.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.85,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 700,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius: radius, opacity },
        style,
      ]}
    />
  );
}

// Card padrão para listas (Insumos/Preparos/Embalagens/Produtos)
Skeleton.Card = function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton width={40} height={40} radius={20} />
      <View style={{ flex: 1, marginLeft: spacing.md }}>
        <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
        <Skeleton width="40%" height={11} />
      </View>
      <Skeleton width={56} height={20} radius={10} />
    </View>
  );
};

// Lista de N skeletons (default: 5)
Skeleton.List = function SkeletonList({ count = 5 }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton.Card key={i} />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.border,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderRadius: borderRadius.md,
  },
  list: {
    padding: spacing.md,
  },
});

export default Skeleton;
