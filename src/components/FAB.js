import React from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, borderRadius } from '../utils/theme';

export default function FAB({ onPress, iconName = 'plus', size = 56 }) {
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
});
