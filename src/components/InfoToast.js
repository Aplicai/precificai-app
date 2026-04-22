import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * InfoToast — toast flutuante de feedback positivo (P2-F).
 *
 * Diferença vs UndoToast: sem botão de desfazer, sem barra de progresso,
 * auto-dismiss silencioso. Ideal para confirmar ações em massa
 * (mover, duplicar, etc.) onde não há "undo".
 *
 * Props:
 *  - visible: boolean
 *  - message: string
 *  - icon?: string (Feather name) — default 'check-circle'
 *  - onDismiss: () => void  — chamado ao final do tempo
 *  - durationMs?: number  (default: 2500)
 *
 * Uso:
 *   const [toast, setToast] = useState(null);
 *   ...
 *   <InfoToast
 *     visible={!!toast}
 *     message={toast?.message}
 *     icon={toast?.icon}
 *     onDismiss={() => setToast(null)}
 *   />
 */
export default function InfoToast({
  visible,
  message = '',
  icon = 'check-circle',
  onDismiss,
  durationMs = 2500,
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 180, useNativeDriver: true }),
      ]).start();
      return undefined;
    }
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }),
    ]).start();
    const t = setTimeout(() => { if (onDismiss) onDismiss(); }, durationMs);
    return () => clearTimeout(t);
  }, [visible, durationMs, onDismiss, opacity, translateY]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, { opacity, transform: [{ translateY }] }]}
    >
      <View style={styles.toast}>
        <Feather name={icon} size={16} color="#fff" style={{ marginRight: spacing.sm }} />
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.select({ web: 24, default: 96 }),
    alignItems: 'center',
    zIndex: 9998,
    paddingHorizontal: spacing.md,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success || '#1F2A36',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 200,
    maxWidth: 480,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
  },
  message: {
    flex: 1,
    color: '#fff',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
});
