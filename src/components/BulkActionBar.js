import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

/**
 * BulkActionBar — barra flutuante de ações em massa (audit P1-21).
 *
 * Aparece quando há itens selecionados em modo bulk.
 * Mostra contagem + botões de ação (Excluir, Selecionar tudo, Cancelar).
 *
 * Props:
 *  - visible: boolean
 *  - count: number — itens selecionados
 *  - totalVisible?: number — total visível na lista (para "Selecionar todos")
 *  - onSelectAll?: () => void — callback opcional de "Selecionar todos"
 *  - onDelete: () => void — callback do botão excluir
 *  - onCancel: () => void — callback do botão cancelar (sai do modo)
 *  - actions?: [{ icon, label, onPress, color? }] — ações extras (ex.: mover)
 */
export default function BulkActionBar({
  visible,
  count = 0,
  totalVisible,
  onSelectAll,
  onDelete,
  onCancel,
  actions = [],
}) {
  const { isMobile } = useResponsiveLayout();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(40)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(opacity, { toValue: 0, duration: 140, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 40, duration: 160, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, opacity, translateY]);

  if (!visible && opacity.__getValue?.() === 0) return null;

  const showSelectAll = onSelectAll && totalVisible && count < totalVisible;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.wrap, { bottom: isMobile ? 84 : 16, opacity, transform: [{ translateY }] }]}
    >
      <View style={styles.bar}>
        {/* Contagem + Cancelar */}
        <TouchableOpacity onPress={onCancel} style={styles.cancelBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={18} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.countText}>
          {count} {count === 1 ? 'selecionado' : 'selecionados'}
        </Text>

        {/* Spacer */}
        <View style={{ flex: 1 }} />

        {/* Selecionar todos (opcional) */}
        {showSelectAll && (
          <TouchableOpacity onPress={onSelectAll} style={styles.actionBtn}>
            <Feather name="check-square" size={15} color={colors.textPrimary} />
            <Text style={styles.actionText}>Todos</Text>
          </TouchableOpacity>
        )}

        {/* Ações extras */}
        {actions.map((a, i) => (
          <TouchableOpacity key={i} onPress={a.onPress} style={styles.actionBtn}>
            <Feather name={a.icon} size={15} color={a.color || colors.textPrimary} />
            <Text style={[styles.actionText, a.color && { color: a.color }]}>{a.label}</Text>
          </TouchableOpacity>
        ))}

        {/* Excluir */}
        {onDelete && (
          <TouchableOpacity onPress={onDelete} style={[styles.actionBtn, styles.deleteBtn]}>
            <Feather name="trash-2" size={15} color="#fff" />
            <Text style={[styles.actionText, { color: '#fff' }]}>Excluir</Text>
          </TouchableOpacity>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    // Sessão 28 — `bottom` agora calculado inline via useResponsiveLayout (web mobile também tem BottomTab).
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    zIndex: 950,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: 8,
    paddingLeft: 10,
    paddingRight: 6,
    minWidth: 280,
    maxWidth: 540,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelBtn: {
    padding: 4,
    marginRight: 4,
  },
  countText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: borderRadius.sm,
    marginLeft: 4,
  },
  actionText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  deleteBtn: {
    backgroundColor: colors.error,
  },
});
