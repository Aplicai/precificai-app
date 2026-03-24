import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

export default function FornecedoresScreen({ navigation }) {
  const [groups, setGroups] = useState([]);
  const [totalSavings, setTotalSavings] = useState(0);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    const db = await getDatabase();
    const insumos = await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome');

    // Group insumos by base name (ignoring brand differences)
    // Normalize: lowercase, trim
    const nameMap = {};
    for (const ins of insumos) {
      const baseName = ins.nome.trim().toLowerCase();
      if (!nameMap[baseName]) nameMap[baseName] = [];
      nameMap[baseName].push(ins);
    }

    // Build comparison groups (only where there are multiple entries or a brand is set)
    const result = [];
    let savings = 0;

    for (const [baseName, items] of Object.entries(nameMap)) {
      if (items.length < 2) continue; // Need at least 2 to compare

      // Sort by price per kg ascending
      const sorted = [...items].sort((a, b) => (a.preco_por_kg || 0) - (b.preco_por_kg || 0));
      const cheapest = sorted[0];
      const mostExpensive = sorted[sorted.length - 1];

      // Calculate potential savings (difference between most expensive and cheapest)
      const savingPerKg = (mostExpensive.preco_por_kg || 0) - (cheapest.preco_por_kg || 0);
      // Estimate monthly savings assuming ~30kg usage (rough estimate)
      const monthlySaving = savingPerKg * 30;
      savings += monthlySaving;

      result.push({
        baseName: items[0].nome, // Use the original casing from first item
        items: sorted.map(item => ({
          id: item.id,
          nome: item.nome,
          marca: item.marca || 'Sem marca',
          preco_por_kg: item.preco_por_kg || 0,
          unidade_medida: item.unidade_medida || 'kg',
          isCheapest: item.id === cheapest.id,
        })),
        savingPerKg,
        monthlySaving,
        cheapestMarca: cheapest.marca || 'Sem marca',
      });
    }

    // Sort groups by potential savings descending
    result.sort((a, b) => b.monthlySaving - a.monthlySaving);
    setGroups(result);
    setTotalSavings(savings);
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Total savings summary */}
        <View style={styles.savingsCard}>
          <View style={styles.savingsIcon}>
            <Feather name="trending-down" size={20} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.savingsLabel}>Economia potencial estimada/mês</Text>
            <Text style={styles.savingsValue}>{formatCurrency(totalSavings)}</Text>
          </View>
        </View>

        {groups.length === 0 && (
          <View style={styles.emptyState}>
            <Feather name="search" size={32} color={colors.disabled} />
            <Text style={styles.emptyTitle}>Nenhuma comparação disponível</Text>
            <Text style={styles.emptyDesc}>
              Cadastre o mesmo insumo com nomes iguais mas marcas diferentes para comparar preços entre fornecedores.
            </Text>
          </View>
        )}

        {groups.map((group, gi) => (
          <View key={gi} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Feather name="package" size={14} color={colors.primary} />
              <Text style={styles.groupTitle} numberOfLines={1}>{group.baseName}</Text>
              {group.monthlySaving > 0 && (
                <View style={styles.savingBadge}>
                  <Text style={styles.savingBadgeText}>-{formatCurrency(group.savingPerKg)}/kg</Text>
                </View>
              )}
            </View>

            {group.items.map((item, ii) => (
              <View
                key={item.id}
                style={[
                  styles.itemRow,
                  ii < group.items.length - 1 && styles.itemRowBorder,
                  item.isCheapest && styles.itemRowCheapest,
                ]}
              >
                <View style={styles.itemInfo}>
                  <Text style={styles.itemMarca} numberOfLines={1}>{item.marca}</Text>
                  {item.isCheapest && (
                    <View style={styles.cheapestBadge}>
                      <Feather name="check-circle" size={10} color={colors.success} />
                      <Text style={styles.cheapestText}>Melhor preço</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.itemPreco, item.isCheapest && styles.itemPrecoCheapest]}>
                  {formatCurrency(item.preco_por_kg)}/{item.unidade_medida === 'un' ? 'un' : 'kg'}
                </Text>
              </View>
            ))}

            {group.monthlySaving > 0 && (
              <View style={styles.tipRow}>
                <Feather name="info" size={12} color={colors.accent} />
                <Text style={styles.tipText}>
                  Se comprar de "{group.cheapestMarca}", economia de ~{formatCurrency(group.monthlySaving)}/mes
                </Text>
              </View>
            )}
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 960, alignSelf: 'center', width: '100%' },

  // Savings summary
  savingsCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.success + '10', borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.success + '25',
  },
  savingsIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.success + '18',
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  savingsLabel: { fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary },
  savingsValue: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.success },

  // Empty state
  emptyState: {
    alignItems: 'center', padding: spacing.xl,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
  },
  emptyTitle: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginTop: spacing.sm },
  emptyDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.xs, lineHeight: 18 },

  // Group card
  groupCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    marginBottom: spacing.sm, overflow: 'hidden',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  groupTitle: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  savingBadge: {
    backgroundColor: colors.success + '15', borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 2,
  },
  savingBadgeText: { fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.success },

  // Item row
  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  itemRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  itemRowCheapest: { backgroundColor: colors.success + '06' },
  itemInfo: { flex: 1, marginRight: spacing.sm },
  itemMarca: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  cheapestBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  cheapestText: { fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.success },
  itemPreco: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.textSecondary },
  itemPrecoCheapest: { color: colors.success },

  // Tip
  tipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.accent + '08',
  },
  tipText: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.accent, flex: 1, lineHeight: 16 },
});
