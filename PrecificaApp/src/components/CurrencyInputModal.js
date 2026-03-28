import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, StyleSheet, Modal, TouchableOpacity, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius, fontFamily } from '../utils/theme';

export default function CurrencyInputModal({ visible, title, value, prefix, suffix, placeholder, onConfirm, onCancel, keyboardType = 'numeric' }) {
  const [inputValue, setInputValue] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setInputValue(value || '');
      setSaving(false);
      setTimeout(() => inputRef.current?.focus(), 200);
    }
  }, [visible, value]);

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await onConfirm(inputValue);
    } catch (e) {
      if (__DEV__) console.warn('CurrencyInputModal save error:', e);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableOpacity style={styles.overlayBg} activeOpacity={1} onPress={onCancel} />
        <View style={styles.card}>
          {title && <Text style={styles.title}>{title}</Text>}
          <View style={styles.inputRow}>
            {prefix && (
              <View style={styles.prefixBox}>
                <Text style={styles.prefixText}>{prefix}</Text>
              </View>
            )}
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                prefix && { borderTopLeftRadius: 0, borderBottomLeftRadius: 0, borderLeftWidth: 0 },
                suffix && { borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 },
              ]}
              value={inputValue}
              onChangeText={setInputValue}
              placeholder={placeholder || '0,00'}
              placeholderTextColor={colors.disabled}
              keyboardType={keyboardType}
              selectTextOnFocus
              onSubmitEditing={handleConfirm}
              returnKeyType="done"
            />
            {suffix && (
              <View style={styles.suffixBox}>
                <Text style={styles.suffixText}>{suffix}</Text>
              </View>
            )}
          </View>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} activeOpacity={0.7}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.confirmBtn, saving && { opacity: 0.6 }]} onPress={handleConfirm} activeOpacity={0.7} disabled={saving}>
              {saving ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Feather name="check" size={18} color="#fff" />
                  <Text style={styles.confirmText}>OK</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },
  overlayBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '85%', maxWidth: 340,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 12,
  },
  title: {
    fontSize: fonts.regular, fontWeight: '700', fontFamily: fontFamily.bold,
    color: colors.text, marginBottom: spacing.md, textAlign: 'center',
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.md,
  },
  prefixBox: {
    backgroundColor: colors.primary + '12',
    borderWidth: 1.5, borderColor: colors.primary + '40',
    borderTopLeftRadius: borderRadius.sm, borderBottomLeftRadius: borderRadius.sm,
    borderRightWidth: 0,
    height: 48, paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center', alignItems: 'center',
  },
  prefixText: {
    fontSize: fonts.regular, fontWeight: '700', color: colors.primary,
  },
  suffixBox: {
    backgroundColor: colors.primary + '12',
    borderWidth: 1.5, borderColor: colors.primary + '40',
    borderTopRightRadius: borderRadius.sm, borderBottomRightRadius: borderRadius.sm,
    borderLeftWidth: 0,
    height: 48, paddingHorizontal: spacing.sm + 2,
    justifyContent: 'center', alignItems: 'center',
  },
  suffixText: {
    fontSize: fonts.regular, fontWeight: '700', color: colors.primary,
  },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: colors.inputBg,
    borderWidth: 1.5, borderColor: colors.primary + '40',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.md,
    fontSize: fonts.large || 18,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row', gap: spacing.sm,
  },
  cancelBtn: {
    flex: 1, paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm, borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelText: {
    fontSize: fonts.regular, fontWeight: '600', color: colors.textSecondary,
  },
  confirmBtn: {
    flex: 1, flexDirection: 'row',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center', gap: 4,
  },
  confirmText: {
    fontSize: fonts.regular, fontWeight: '700', color: '#fff',
  },
});
