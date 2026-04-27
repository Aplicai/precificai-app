import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, Pressable, KeyboardAvoidingView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useListDensity from '../hooks/useListDensity';

/**
 * Wraps a form screen to render as a modal popup on desktop web
 * and as a full-screen with custom header on mobile.
 *
 * Usage:
 * <ModalFormWrapper title="Novo Insumo" onClose={() => navigation.goBack()}>
 *   <ScrollView>...</ScrollView>
 *   <Footer>...</Footer>
 * </ModalFormWrapper>
 */
export default function ModalFormWrapper({ children, title, onClose }) {
  const { isDesktop } = useResponsiveLayout();
  // Sessão 28.6 — densidade aplicada ao header mobile do modal.
  const { isCompact, iconSize } = useListDensity();
  const backBtnDim = isCompact ? 40 : 44;
  const titleFontSize = isCompact ? 16 : 18;
  const headerPadV = isCompact ? 8 : 14;

  if (!isDesktop) {
    // Mobile: full-screen with custom header.
    // Sessão 28 — backBtn aumentou para 44x44 (WCAG); KeyboardAvoidingView envolve
    // conteúdo no iOS para o footer não ficar atrás do teclado.
    return (
      <View style={styles.mobileWrapper}>
        <View style={[styles.mobileHeader, { paddingVertical: headerPadV }]}>
          <TouchableOpacity
            onPress={onClose}
            style={[styles.backBtn, { width: backBtnDim, height: backBtnDim, borderRadius: backBtnDim / 2 }]}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel="Voltar"
          >
            <Feather name="arrow-left" size={iconSize} color={colors.textLight} />
          </TouchableOpacity>
          <Text style={[styles.mobileTitle, { fontSize: titleFontSize }]} numberOfLines={1}>{title}</Text>
          <View style={{ width: backBtnDim }} />
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {children}
        </KeyboardAvoidingView>
      </View>
    );
  }

  // Desktop: modal popup overlay
  return (
    <View style={styles.overlay}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose}>
        <View style={styles.backdrop} />
      </Pressable>
      <View style={styles.card}>
        <View style={styles.desktopHeader}>
          <Text style={styles.desktopTitle} numberOfLines={1}>{title}</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
            <Feather name="x" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          {children}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Mobile
  mobileWrapper: {
    flex: 1,
    backgroundColor: colors.background,
  },
  mobileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    height: 56,
    ...Platform.select({
      ios: { paddingTop: 50, height: 96 },
      default: {},
    }),
  },
  backBtn: {
    width: 44, // Sessão 28 — WCAG 44pt min
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mobileTitle: {
    flex: 1,
    textAlign: 'center',
    color: colors.textLight,
    fontSize: 17,
    fontFamily: fontFamily.semiBold || fontFamily.bold,
    fontWeight: '600',
  },

  // Desktop overlay
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  card: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.lg,
    width: '90%',
    maxWidth: 640,
    maxHeight: '90%',
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      },
      default: {
        elevation: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.3,
        shadowRadius: 20,
      },
    }),
  },
  desktopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  desktopTitle: {
    flex: 1,
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
});
