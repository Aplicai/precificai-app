import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';

export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  prefix,
  suffix,
  editable = true,
  multiline = false,
  numberOfLines = 1,
  style,
  inputStyle,
  rightLabel,
  error,
  errorText,
}) {
  return (
    <View style={[styles.container, style]}>
      {label && (
        <View style={styles.labelRow}>
          <Text style={[styles.label, error && { color: colors.error }]}>{label}</Text>
          {rightLabel}
        </View>
      )}
      <View style={styles.inputContainer}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          style={[
            styles.input,
            !editable && styles.inputDisabled,
            multiline && { height: numberOfLines * 40, textAlignVertical: 'top' },
            prefix && { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 },
            error && { borderColor: colors.error, borderWidth: 1.5 },
            inputStyle,
          ]}
          value={String(value ?? '')}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.disabled}
          keyboardType={keyboardType}
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
        />
        {suffix && <Text style={styles.suffix}>{suffix}</Text>}
      </View>
      {error && errorText ? <Text style={styles.errorText}>{errorText}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  label: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minWidth: 0,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    fontSize: fonts.regular,
    color: colors.text,
  },
  inputDisabled: {
    backgroundColor: '#EEEEEE',
    color: colors.textSecondary,
  },
  prefix: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderTopLeftRadius: borderRadius.sm,
    borderBottomLeftRadius: borderRadius.sm,
    borderRightWidth: 0,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.xs + 2,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  suffix: {
    marginLeft: spacing.sm,
    fontSize: fonts.small,
    color: colors.textSecondary,
    minWidth: 50,
  },
  errorText: {
    fontSize: fonts.tiny || 11,
    color: colors.error,
    marginTop: 2,
    fontWeight: '500',
  },
});
