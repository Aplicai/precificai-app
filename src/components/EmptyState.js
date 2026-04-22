import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * EmptyState — placeholder amigável para listas vazias.
 *
 * Modos:
 *  - default (full): para telas inteiras vazias (icone grande + descrição + CTA opcional)
 *  - compact: para usar dentro de modais/cards onde o espaço é limitado
 *    (icone menor, padding reduzido, sem círculo gigante)
 */
export default function EmptyState({ icon = 'inbox', title, description, ctaLabel, onPress, compact = false }) {
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
        <Feather name={icon} size={36} color={colors.primaryLight} />
      </View>
      <Text style={styles.title}>{title || 'Nenhum item'}</Text>
      {description && <Text style={styles.description}>{description}</Text>}
      {ctaLabel && onPress && (
        <TouchableOpacity style={styles.cta} activeOpacity={0.7} onPress={onPress}>
          <Feather name="plus" size={18} color="#fff" style={{ marginRight: 6 }} />
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
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
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
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
  },
  ctaText: {
    color: '#fff',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontSize: fonts.small,
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
