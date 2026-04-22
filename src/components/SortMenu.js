import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Pressable } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * SortMenu — botão "Ordenar" + popover de opções (audit P1-22).
 *
 * Compacto, encaixa ao lado de filtros/busca.
 *
 * Props:
 *  - value: chave da opção atual
 *  - options: [{ key, label, icon? }]
 *  - onChange: (key) => void
 *  - label?: rótulo curto a exibir no botão (default: 'Ordenar')
 *  - compact?: true → mostra só ícone + chevron
 */
export default function SortMenu({ value, options = [], onChange, label = 'Ordenar', compact = false }) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.key === value);

  const handleSelect = (key) => {
    onChange?.(key);
    setOpen(false);
  };

  return (
    <>
      <TouchableOpacity
        style={[styles.btn, compact && styles.btnCompact]}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Feather name="bar-chart-2" size={13} color={colors.textPrimary} style={{ transform: [{ rotate: '90deg' }] }} />
        {!compact && (
          <Text style={styles.btnText} numberOfLines={1}>
            {current?.label || label}
          </Text>
        )}
        <Feather name="chevron-down" size={14} color={colors.textSecondary} />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            <Text style={styles.menuTitle}>Ordenar por</Text>
            {options.map((opt) => {
              const isActive = opt.key === value;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.menuItem, isActive && styles.menuItemActive]}
                  onPress={() => handleSelect(opt.key)}
                  activeOpacity={0.7}
                >
                  {opt.icon && (
                    <Feather
                      name={opt.icon}
                      size={14}
                      color={isActive ? colors.primary : colors.textSecondary}
                      style={{ marginRight: 8 }}
                    />
                  )}
                  <Text style={[styles.menuItemText, isActive && styles.menuItemTextActive]}>
                    {opt.label}
                  </Text>
                  {isActive && (
                    <Feather name="check" size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />
                  )}
                </TouchableOpacity>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    height: 34,
  },
  btnCompact: {
    paddingHorizontal: spacing.sm,
    gap: 4,
  },
  btnText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
    maxWidth: 120,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  menu: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    minWidth: 240,
    maxWidth: 320,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 10,
  },
  menuTitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: spacing.sm,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  menuItemActive: {
    backgroundColor: colors.primary + '12',
  },
  menuItemText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  menuItemTextActive: {
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
});
