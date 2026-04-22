import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent } from '../utils/calculations';

/**
 * CostBreakdownChart — visual proportional breakdown of CMV (audit P1-13).
 *
 * Shows a horizontal stacked bar (cost composition) plus a compact legend
 * with values and percentages. Built with pure View/StyleSheet — no SVG
 * dependency required. Works identically on web, iOS and Android.
 *
 * Por que barra empilhada e não donut:
 *  - Sem react-native-svg (não queremos adicionar dependência)
 *  - Barra empilhada comunica composição relativa tão bem quanto donut
 *  - Funciona em qualquer largura, escala melhor em sidebars estreitas
 *
 * Props:
 *  - segments: [{ label, value, color }]  — value em R$, somatório > 0
 *  - total?: opcional; se não informado, soma os values
 *  - compact?: layout reduzido (esconde labels do legend, mantém pontos coloridos)
 */
export default function CostBreakdownChart({ segments = [], total, compact = false }) {
  const filtered = segments.filter((s) => (s?.value || 0) > 0);
  const sum = total ?? filtered.reduce((acc, s) => acc + (s.value || 0), 0);

  if (sum <= 0 || filtered.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>Sem dados de custo para exibir</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Barra empilhada */}
      <View style={styles.barTrack}>
        {filtered.map((s, idx) => {
          const ratio = (s.value || 0) / sum;
          const flex = Math.max(ratio, 0.001); // evita segmentos invisíveis
          const isFirst = idx === 0;
          const isLast = idx === filtered.length - 1;
          return (
            <View
              key={`${s.label}-${idx}`}
              style={[
                styles.barSegment,
                {
                  flex,
                  backgroundColor: s.color,
                  borderTopLeftRadius: isFirst ? borderRadius.full : 0,
                  borderBottomLeftRadius: isFirst ? borderRadius.full : 0,
                  borderTopRightRadius: isLast ? borderRadius.full : 0,
                  borderBottomRightRadius: isLast ? borderRadius.full : 0,
                },
              ]}
            />
          );
        })}
      </View>

      {/* Legenda */}
      <View style={[styles.legend, compact && styles.legendCompact]}>
        {filtered.map((s, idx) => {
          const ratio = (s.value || 0) / sum;
          return (
            <View key={`leg-${idx}`} style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: s.color }]} />
              <Text style={styles.legendLabel} numberOfLines={1}>{s.label}</Text>
              {!compact && (
                <Text style={styles.legendValue}>
                  {formatCurrency(s.value)} <Text style={styles.legendPerc}>({formatPercent(ratio)})</Text>
                </Text>
              )}
              {compact && (
                <Text style={styles.legendPerc}>{formatPercent(ratio)}</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  barTrack: {
    flexDirection: 'row',
    width: '100%',
    height: 12,
    backgroundColor: colors.border,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  barSegment: {
    height: '100%',
  },
  legend: {
    marginTop: spacing.sm,
    gap: 4,
  },
  legendCompact: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.xs + 2,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  legendLabel: {
    flex: 1,
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  legendValue: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  legendPerc: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  empty: {
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
});
