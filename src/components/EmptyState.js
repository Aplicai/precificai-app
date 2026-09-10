import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius, radius } from '../utils/theme';

/**
 * EmptyState — placeholder amigável para listas vazias.
 *
 * Modos:
 *  - default (full): para telas inteiras vazias (icone grande + descrição + CTA opcional)
 *  - compact: para usar dentro de modais/cards onde o espaço é limitado
 *    (icone menor, padding reduzido, sem círculo gigante)
 */
export default function EmptyState({ icon = 'inbox', title, description, ctaLabel, ctaIcon = 'plus', onPress, compact = false }) {
  if (compact) {
    return (
      <View style={styles.compactContainer}>
        <Feather name={icon} size={24} color={colors.primaryLight} style={{ marginBottom: 6 }} />
        <Text style={styles.compactTitle}>{title || 'Nenhum item'}</Text>
        {description && <Text style={styles.compactDescription}>{description}</Text>}
      </View>
    );
  }
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Feather name={icon} size={40} color={colors.primary} />
      </View>
      <Text style={styles.title}>{title || 'Nenhum item'}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {ctaLabel && onPress && (
        <TouchableOpacity style={styles.cta} activeOpacity={0.7} onPress={onPress} accessibilityRole="button" accessibilityLabel={ctaLabel}>
          {ctaIcon ? <Feather name={ctaIcon} size={16} color="#fff" style={{ marginRight: 6 }} /> : null}
          <Text style={styles.ctaText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl * 2,
    paddingHorizontal: spacing.lg,
  },
  iconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.surfaceTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  // UX audit 09/09: escala tipográfica — título 16 semibold, descrição 14
  title: {
    fontSize: 16,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  description: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
    marginBottom: spacing.lg,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    minHeight: 44,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  ctaText: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    fontSize: 15,
  },
  // Variante compacta (dentro de modais/cards)
  compactContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  compactTitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 2,
  },
  compactDescription: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 16,
    maxWidth: 240,
  },
});
