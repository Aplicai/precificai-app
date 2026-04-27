import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useListDensity from '../hooks/useListDensity';

/**
 * Chip — pílula compacta com truncamento semântico e tooltip nativo no web.
 *
 * Resolve o problema (audit P1-14) de chips/badges atuais que cortam o texto
 * silenciosamente, sem dar ao usuário como ver o conteúdo completo:
 *  - Em mobile, mantém a UX inalterada (numberOfLines={1} + ellipsize="tail").
 *  - Em web, adiciona `title={fullLabel}` no DOM, gerando o tooltip do navegador
 *    ao passar o mouse — sem custo de bibliotecas extras.
 *
 * Variantes: default | success | warning | danger | info | neutral.
 * Tamanho: 'sm' (default) | 'md'.
 *
 * Uso:
 *   <Chip label={categoria.nome} variant="success" maxWidth={120} />
 *   <Chip label="iFood 23%" tooltip="Taxa da plataforma iFood: 23%" variant="warning" />
 */
const VARIANT_COLORS = {
  default: { bg: colors.primary + '15', fg: colors.primary },
  success: { bg: colors.success + '15', fg: colors.success },
  warning: { bg: '#FFF3E0',             fg: '#E65100' },
  danger:  { bg: '#FEE2E2',             fg: '#dc2626' },
  info:    { bg: (colors.info || colors.accent) + '15', fg: colors.info || colors.accent },
  neutral: { bg: colors.border,         fg: colors.textSecondary },
};

export default function Chip({
  label,
  tooltip,
  variant = 'default',
  size = 'sm',
  maxWidth,
  color,        // override manual de cor (compatível com chips coloridos por categoria)
  style,
  textStyle,
  icon,         // node opcional renderizado antes do texto
}) {
  const palette = color
    ? { bg: color + '15', fg: color }
    : (VARIANT_COLORS[variant] || VARIANT_COLORS.default);
  const { chipHeight } = useListDensity();

  const fullLabel = String(label ?? '');
  const tooltipText = tooltip || fullLabel;

  // No web, `title` produz tooltip nativo. RN ignora props desconhecidas.
  const webProps = Platform.OS === 'web' ? { title: tooltipText } : {};

  return (
    <View
      style={[
        styles.chip,
        size === 'md' && styles.chipMd,
        { backgroundColor: palette.bg, minHeight: chipHeight },
        maxWidth ? { maxWidth } : null,
        style,
      ]}
      {...webProps}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text
        style={[styles.text, size === 'md' && styles.textMd, { color: palette.fg }, textStyle]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {fullLabel}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: borderRadius.full,
  },
  chipMd: {
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
  },
  icon: {
    marginRight: 4,
  },
  text: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    // overflow hidden + flexShrink garantem que ellipsize funcione no web também
    flexShrink: 1,
  },
  textMd: {
    fontSize: fonts.small,
  },
});
