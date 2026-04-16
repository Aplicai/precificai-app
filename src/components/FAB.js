import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, borderRadius, fonts, fontFamily } from '../utils/theme';

export default function FAB({ onPress, iconName = 'plus', size = 56, label }) {
  if (label) {
    return (
      <TouchableOpacity style={[styles.fab, styles.fabExpanded]} onPress={onPress} activeOpacity={0.8}>
        <Feather name={iconName} size={20} color={colors.textLight} />
        <Text style={styles.fabLabel}>{label}</Text>
      </TouchableOpacity>
    );
  }
  return (
    <TouchableOpacity style={[styles.fab, { width: size, height: size, borderRadius: size / 2 }]} onPress={onPress} activeOpacity={0.8}>
      <Feather name={iconName} size={24} color={colors.textLight} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
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
