import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';

export default function ConfirmDeleteModal({ visible, isFocused = true, titulo, nome, onConfirm, onCancel, confirmLabel = 'Excluir' }) {
  const shouldShow = visible && isFocused;
  return (
    <Modal visible={shouldShow} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.content} onPress={() => {}}>
          <Text style={styles.title}>{titulo || 'Confirmar Exclusão'}</Text>
          <Text style={styles.message}>
            Deseja realmente excluir{'\n'}
            <Text style={styles.nome}>"{nome}"</Text>?
          </Text>
          <Text style={styles.aviso}>
            Esta ação não pode ser desfeita.
          </Text>
          <View style={styles.actions}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm}>
              <Text style={styles.confirmText}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  content: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
  },
  title: {
    fontSize: fonts.large,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md,
  },
  message: {
    fontSize: fonts.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 24,
    marginBottom: spacing.xs,
  },
  nome: {
    fontWeight: '700',
    color: colors.text,
  },
  aviso: {
    fontSize: fonts.tiny,
    color: colors.error,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  cancelBtn: {
    flex: 1,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: fonts.regular,
  },
  confirmBtn: {
    flex: 1,
    padding: spacing.sm + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.error,
    alignItems: 'center',
  },
  confirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: fonts.regular,
  },
});
