import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, borderRadius, fonts, fontFamily } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

// Sessão 28 — Audit mobile-web: bottom: 20 ficava encoberto pelo BottomTab (66pt).
// Em mobile (sem sidebar), elevamos o FAB para acima da tab. Em desktop mantemos 20.
export default function FAB({ onPress, iconName = 'plus', size = 56, label }) {
  const { isMobile } = useResponsiveLayout();
  const bottomOffset = isMobile ? 86 : 20;
  if (label) {
    return (
      <TouchableOpacity style={[styles.fab, styles.fabExpanded, { bottom: bottomOffset }]} onPress={onPress} activeOpacity={0.8}>
        <Feather name={iconName} size={20} color={colors.textLight} />
        <Text style={styles.fabLabel}>{label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={[styles.fab, { width: size, height: size, borderRadius: size / 2, bottom: bottomOffset }]} onPress={onPress} activeOpacity={0.8}>
      <Feather name={iconName} size={24} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabExpanded: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: borderRadius.md,
    gap: 8,
  },
  fabLabel: {
    color: colors.textLight,
    fontSize: fonts.regular,
    fontWeight: '600',
    fontFamily: fontFamily.semiBold,
  },
});
