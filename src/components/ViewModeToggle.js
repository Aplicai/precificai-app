import React from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, borderRadius } from '../utils/theme';

/**
 * ViewModeToggle — par de pílulas list/grid (P3-D).
 *
 * Props:
 *  - value: 'list' | 'grid'
 *  - onChange: (mode) => void
 *  - size?: number (default 28)
 */
export default function ViewModeToggle({ value, onChange, size = 30 }) {
  const isList = value === 'list';
  return (
    <View style={[styles.wrap, { height: size + 4 }]}>
      <TouchableOpacity
        accessibilityLabel="Visualizar em lista"
        onPress={() => onChange('list')}
        style={[styles.btn, { width: size + 6, height: size }, isList && styles.btnActive]}
      >
        <Feather name="list" size={15} color={isList ? colors.primary : colors.textSecondary} />
      </TouchableOpacity>
      <TouchableOpacity
        accessibilityLabel="Visualizar em grade"
        onPress={() => onChange('grid')}
        style={[styles.btn, { width: size + 6, height: size }, !isList && styles.btnActive]}
      >
        <Feather name="grid" size={14} color={!isList ? colors.primary : colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    alignItems: 'center',
  },
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: borderRadius.sm - 2,
  },
  btnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary + '40',
  },
});
