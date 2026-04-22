import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
 */
export default function ListStatsStrip({ stats = [], compact = false }) {
  if (!stats || stats.length === 0) return null;
  return (
    <View style={[styles.strip, compact && styles.compact]}>
      {stats.map((stat, idx) => (
        <React.Fragment key={`${stat.label}-${idx}`}>
          {idx > 0 && <View style={styles.separator} />}
          <View style={styles.cell}>
            {!!stat.icon && (
              <Feather
                name={stat.icon}
                size={13}
                color={stat.color || colors.primary}
                style={{ marginRight: 5 }}
              />
            )}
            <View>
              <Text style={styles.label} numberOfLines={1}>{stat.label}</Text>
              <Text style={[styles.value, stat.color && { color: stat.color }]} numberOfLines={1}>
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
  cell: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    width: 1,
    height: 26,
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
