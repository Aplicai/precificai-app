import React from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';

export default function SearchBar({ value, onChangeText, placeholder = 'Buscar...' }) {
  return (
    <View style={styles.container}>
      <Feather name="search" size={16} color={colors.disabled} style={styles.icon} />
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.disabled}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    height: 40,
  },
  icon: {
    marginRight: spacing.xs + 2,
  },
  input: {
    flex: 1,
    fontSize: fonts.small,
    color: colors.text,
    paddingVertical: 0,
    height: 38,
  },
  clearBtn: {
    padding: spacing.xs,
  },
});
