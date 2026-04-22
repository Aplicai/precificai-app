import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Animated, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * UndoToast — toast flutuante de "ação desfazível" (audit P1-11).
 *
 * Padrão soft-delete por UX (sem schema change): a tela esconde a linha
 * imediatamente, mostra esse toast com botão Desfazer e barra de progresso
 * decrescente. Se o usuário não clicar em Desfazer dentro de `durationMs`,
 * a deleção é efetivada via `onTimeout` (executar o DELETE de fato no DB).
 *
 * Props:
 *  - visible: boolean
 *  - message: string  (ex.: 'Insumo "Farinha" excluído')
 *  - onUndo: () => void  — restaura a linha (re-exibe), o caller cancela o timer
 *  - onTimeout: () => void  — efetiva a deleção no banco
 *  - onDismiss?: () => void — chamado quando usuário fecha manualmente sem desfazer
 *  - durationMs?: number  (default: 5000)
 *  - actionLabel?: string  (default: 'Desfazer')
 *
 * Uso:
 *   const [pending, setPending] = useState(null);
 *   ...
 *   <UndoToast
 *     visible={!!pending}
 *     message={pending?.message}
 *     onUndo={() => setPending(null)}
 *     onTimeout={async () => { await pending.commit(); setPending(null); }}
 *   />
 */
export default function UndoToast({
  visible,
  message = 'Item excluído',
  onUndo,
  onTimeout,
  onDismiss,
  durationMs = 5000,
  actionLabel = 'Desfazer',
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(20)).current;
  const progress = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 20, duration: 180, useNativeDriver: true }),
      ]).start();
      progress.setValue(1);
      return undefined;
    }

    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, friction: 8, tension: 80 }),
    ]).start();

    progress.setValue(1);
    Animated.timing(progress, {
      toValue: 0,
      duration: durationMs,
      useNativeDriver: false,
    }).start();

    const t = setTimeout(() => {
      if (onTimeout) onTimeout();
    }, durationMs);

    return () => clearTimeout(t);
  }, [visible, durationMs, onTimeout, opacity, translateY, progress]);

  if (!visible) return null;

  const widthPct = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      <View style={styles.toast}>
        <Feather name="trash-2" size={16} color="#fff" style={{ marginRight: spacing.sm }} />
        <Text style={styles.message} numberOfLines={2}>{message}</Text>
        <TouchableOpacity onPress={onUndo} style={styles.undoBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
          <Text style={styles.undoText}>{actionLabel}</Text>
        </TouchableOpacity>
        {onDismiss && (
          <TouchableOpacity onPress={onDismiss} style={styles.closeBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
            <Feather name="x" size={14} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
        )}
        <Animated.View style={[styles.progressBar, { width: widthPct }]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: Platform.select({ web: 24, default: 96 }), // acima do tab-bar no mobile
    alignItems: 'center',
    zIndex: 9999,
    paddingHorizontal: spacing.md,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1F2A36',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    minWidth: 260,
    maxWidth: 480,
    overflow: 'hidden',
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
    fontFamily: fontFamily.medium,
  },
  undoBtn: {
    marginLeft: spacing.md,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
  },
  undoText: {
    color: colors.accent || '#7BB3FF',
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  closeBtn: {
    marginLeft: spacing.xs,
    padding: 4,
  },
  progressBar: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    backgroundColor: colors.accent || '#7BB3FF',
  },
});
