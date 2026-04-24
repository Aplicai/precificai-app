/**
 * Sprint 3 S7 — `<Heading variant>` para unificar 60+ declarações inline.
 *
 * MOTIVAÇÃO (audit TY1):
 * 60+ ocorrências de `<Text style={{ fontFamily: fontFamily.bold, fontSize: fonts.title }}>`
 * com variações sutis (cor, margin, fontWeight) que acumulam drift tipográfico.
 *
 * API:
 *   <Heading variant="h1">Título da tela</Heading>           // fontFamily.bold + fonts.title  (22)
 *   <Heading variant="h2">Seção</Heading>                    // fontFamily.bold + fonts.large  (18)
 *   <Heading variant="h3">Subseção</Heading>                 // fontFamily.semiBold + fonts.medium (17)
 *   <Heading variant="body">Parágrafo</Heading>              // fontFamily.regular + fonts.regular (16)
 *   <Heading variant="caption">Legenda</Heading>             // fontFamily.regular + fonts.small (14)
 *
 * PROPS EXTRAS:
 *   color     → override de cor (default: colors.text; caption: colors.textSecondary)
 *   align     → 'left' | 'center' | 'right'
 *   numberOfLines
 *   style     → merge final (tem prioridade)
 *
 * RESOLVE: TY1 (drift tipográfico).
 */

import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { colors, fonts, fontFamily } from '../utils/theme';

const VARIANTS = Object.freeze({
  h1: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.title,
    fontWeight: '700',
    color: colors.text,
    lineHeight: Math.round(fonts.title * 1.25),
  },
  h2: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.large,
    fontWeight: '700',
    color: colors.text,
    lineHeight: Math.round(fonts.large * 1.3),
  },
  h3: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.medium,
    fontWeight: '600',
    color: colors.text,
    lineHeight: Math.round(fonts.medium * 1.3),
  },
  body: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.regular,
    fontWeight: '400',
    color: colors.text,
    lineHeight: Math.round(fonts.regular * 1.45),
  },
  caption: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    fontWeight: '400',
    color: colors.textSecondary,
    lineHeight: Math.round(fonts.small * 1.4),
  },
});

export default function Heading({
  variant = 'body',
  color,
  align,
  numberOfLines,
  style,
  children,
  accessibilityRole,
  testID,
  ...rest
}) {
  const variantStyle = VARIANTS[variant] || VARIANTS.body;
  const resolvedRole = accessibilityRole || (variant === 'h1' || variant === 'h2' || variant === 'h3' ? 'header' : undefined);

  return (
    <Text
      style={[
        variantStyle,
        color ? { color } : null,
        align ? { textAlign: align } : null,
        style,
      ]}
      numberOfLines={numberOfLines}
      accessibilityRole={resolvedRole}
      testID={testID}
      {...rest}
    >
      {children}
    </Text>
  );
}

Heading.VARIANTS = Object.keys(VARIANTS);
