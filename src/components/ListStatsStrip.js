import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * ListStatsStrip — strip compacta de estatísticas no topo de listas.
 *
 * Renderiza 1-3 métricas com ícone + label + valor, lado a lado.
 * Pensada para ficar abaixo da SearchBar e acima das chips de categoria
 * (ou no header da lista).
 *
 * Props:
 *  - stats: Array<{ icon, label, value, color? }>
 *  - compact?: boolean  (reduz padding)
 *
 * Sessão Mobile-29 — responsividade para tela pequena (iPhone 15 Pro e <):
 * cada célula usa flex:1 + minWidth:0, numberOfLines={1} no valor, e
 * tamanho de fonte adaptativo conforme largura. Garante que valores
 * grandes (ex: "R$ 12.345,67") não invadam vizinhos.
 */
export default function ListStatsStrip({ stats = [], compact = false }) {
  const { width } = useWindowDimensions();
  if (!stats || stats.length === 0) return null;
  // Adaptive sizing: telas estreitas ≤360pt → fonte menor + sem ícone esquerdo
  // se houver 3+ métricas.
  const isNarrow = width <= 360;
  const isMid = width > 360 && width <= 414;
  const hideIcon = isNarrow && stats.length >= 3;
  const valueFont = isNarrow ? 12 : (isMid ? 13 : fonts.small);
  const labelFont = isNarrow ? 9 : (fonts.xsmall || 10);
  const iconSize = isNarrow ? 11 : 13;
  return (
    <View style={[styles.strip, compact && styles.compact, isNarrow && styles.stripNarrow]}>
      {stats.map((stat, idx) => (
        <React.Fragment key={`${stat.label}-${idx}`}>
          {idx > 0 && <View style={[styles.separator, isNarrow && { marginHorizontal: 4 }]} />}
          <View style={styles.cell}>
            {!hideIcon && !!stat.icon && (
              <Feather
                name={stat.icon}
                size={iconSize}
                color={stat.color || colors.primary}
                style={{ marginRight: 4 }}
              />
            )}
            <View style={styles.cellTexts}>
              <Text style={[styles.label, { fontSize: labelFont }]} numberOfLines={1}>{stat.label}</Text>
              <Text
                style={[styles.value, { fontSize: valueFont }, stat.color && { color: stat.color }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {stat.value}
              </Text>
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface || '#fff',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border || '#EEF1F4',
  },
  compact: {
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  stripNarrow: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginHorizontal: spacing.sm,
  },
  cell: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cellTexts: {
    flex: 1,
    minWidth: 0,
  },
  separator: {
    width: 1,
    height: 24,
    backgroundColor: colors.border || '#EEF1F4',
    marginHorizontal: spacing.sm,
  },
  label: {
    fontSize: fonts.xsmall || 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  value: {
    fontSize: fonts.small,
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
});
