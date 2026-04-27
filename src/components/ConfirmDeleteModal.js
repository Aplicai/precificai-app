import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, useWindowDimensions } from 'react-native';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import useListDensity from '../hooks/useListDensity';

export default function ConfirmDeleteModal({ visible, isFocused = true, titulo, nome, onConfirm, onCancel, confirmLabel = 'Excluir', aviso = null }) {
  const shouldShow = visible && isFocused;
  // Sessão UX — em mobile (<= 480pt) os botões ficam stacked com a ação destrutiva
  // em destaque acima e Cancelar como link abaixo. Em desktop continuam side-by-side.
  const { width } = useWindowDimensions();
  const isMobile = width <= 480;
  // Sessão 28.6 — tokens de densidade aplicados aos botões e padding interno.
  const { buttonHeight, cardPadding } = useListDensity();
  return (
    <Modal visible={shouldShow} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={[styles.content, isMobile && styles.contentMobile, { padding: cardPadding }]} onPress={() => {}}>
          <Text style={styles.title}>{titulo || 'Confirmar Exclusão'}</Text>
          {nome ? (
            <Text style={styles.message}>
              Deseja realmente excluir{'\n'}
              <Text style={styles.nome}>"{nome}"</Text>?
            </Text>
          ) : (
            <Text style={styles.message}>Deseja realmente excluir?</Text>
          )}
          {aviso ? (
            <Text style={styles.avisoCustom}>{aviso}</Text>
          ) : (
            <Text style={styles.aviso}>Esta ação não pode ser desfeita.</Text>
          )}
          {isMobile ? (
            <View style={styles.actionsStacked}>
              <TouchableOpacity style={[styles.confirmBtnFull, { height: buttonHeight, minHeight: buttonHeight }]} onPress={onConfirm} accessibilityRole="button" accessibilityLabel={confirmLabel}>
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.cancelLink, { height: buttonHeight, minHeight: buttonHeight }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancelar">
                <Text style={styles.cancelLinkText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.actions}>
              <TouchableOpacity style={[styles.cancelBtn, { height: buttonHeight }]} onPress={onCancel} accessibilityRole="button" accessibilityLabel="Cancelar">
                <Text style={styles.cancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { height: buttonHeight }]} onPress={onConfirm} accessibilityRole="button" accessibilityLabel={confirmLabel}>
                <Text style={styles.confirmText}>{confirmLabel}</Text>
              </TouchableOpacity>
            </View>
          )}
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
    maxWidth: 400,
    alignItems: 'center',
  },
  contentMobile: {
    width: '90%',
    maxWidth: '90%',
    padding: spacing.md,
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
  avisoCustom: {
    fontSize: fonts.small,
    color: colors.error,
    textAlign: 'left',
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 20,
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    width: '100%',
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
  actionsStacked: {
    width: '100%',
    flexDirection: 'column',
    gap: spacing.xs,
  },
  confirmBtnFull: {
    width: '100%',
    paddingVertical: spacing.sm + 4,
    minHeight: 48,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.error,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLink: {
    width: '100%',
    paddingVertical: spacing.sm + 2,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLinkText: {
    color: colors.textSecondary,
    fontWeight: '600',
    fontSize: fonts.regular,
    textDecorationLine: 'underline',
  },
});
