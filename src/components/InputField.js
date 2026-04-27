import React from 'react';
import { View, Text, TextInput, StyleSheet } from 'react-native';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import useListDensity from '../hooks/useListDensity';

/**
 * Sessão 28 — InputField agora aceita props extra para web mobile:
 * - inputMode: hint para teclado virtual no web (`numeric`, `decimal`, `email`, etc.)
 * - autoFocus: foco automático ao montar (ex.: 1º campo de modal)
 * - onSubmitEditing / returnKeyType / blurOnSubmit: navegação por "next/done"
 * - autoCapitalize / autoCorrect / autoComplete: defaults sensatos para mobile
 * - secureTextEntry: senhas
 * - maxLength: limita digitação
 * Tudo é passthrough — quem não usa, não paga.
 */
export default function InputField({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  inputMode,
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
  autoFocus,
  autoCapitalize,
  autoCorrect,
  autoComplete,
  secureTextEntry,
  maxLength,
  onSubmitEditing,
  returnKeyType,
  blurOnSubmit,
  onBlur,
  onFocus,
  testID,
}) {
  const { isCompact, inputHeight } = useListDensity();
  const labelMarginBottom = isCompact ? 4 : 6;
  const inputPaddingVertical = isCompact ? 8 : 12;
  return (
    <View style={[styles.container, style]}>
      {label && (
        <View style={[styles.labelRow, { marginBottom: labelMarginBottom }]}>
          <Text style={[styles.label, error && { color: colors.error }]}>{label}</Text>
          {rightLabel}
        </View>
      )}
      <View style={styles.inputContainer}>
        {prefix && <Text style={styles.prefix}>{prefix}</Text>}
        <TextInput
          style={[
            styles.input,
            { minHeight: inputHeight, paddingVertical: inputPaddingVertical },
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
          inputMode={inputMode}
          editable={editable}
          multiline={multiline}
          numberOfLines={numberOfLines}
          autoFocus={autoFocus}
          autoCapitalize={autoCapitalize}
          autoCorrect={autoCorrect}
          autoComplete={autoComplete}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          onSubmitEditing={onSubmitEditing}
          returnKeyType={returnKeyType}
          blurOnSubmit={blurOnSubmit}
          onBlur={onBlur}
          onFocus={onFocus}
          testID={testID}
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
    minHeight: 44, // Sessão 28 — WCAG touch target 44pt mínimo
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm, // mantém vertical mais compacto, minHeight garante 44pt
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
