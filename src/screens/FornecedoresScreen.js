import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, safeNum } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';

const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function normalizeStr(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export default function FornecedoresScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const [groups, setGroups] = useState([]);
  const [totalSavings, setTotalSavings] = useState(0);
  // Audit P1: persistir filtros entre navegações (padrão da casa)
  const [busca, setBusca] = usePersistedState('fornecedores.busca', '');
  const [filtroCategoria, setFiltroCategoria] = usePersistedState('fornecedores.filtroCategoria', null);
  const [categorias, setCategorias] = useState([]);
  // Audit P0: estados de erro/loading (antes era silent + tela travada)
  const [loadError, setLoadError] = useState(null);
  const [loading, setLoading] = useState(true);
  // Audit P0: guard contra race condition em loadData concorrente
  const isLoadingRef = useRef(false);

  useFocusEffect(useCallback(() => { loadData(); }, [busca, filtroCategoria]));

  async function loadData() {
    if (isLoadingRef.current) return; // P0: evita corridas
    isLoadingRef.current = true;
    setLoading(true);
    try {
      setLoadError(null);
      const db = await getDatabase();
      const [insumosBrutos, cats] = await Promise.all([
        db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome'),
        db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome'),
      ]);
      setCategorias(cats);

      // Filter by search and category
      let insumos = insumosBrutos;
      if (busca.trim()) {
        const termo = normalizeStr(busca);
        insumos = insumos.filter(i => normalizeStr(i.nome).includes(termo) || normalizeStr(i.marca).includes(termo));
      }
      if (filtroCategoria !== null) {
        insumos = insumos.filter(i => i.categoria_id === filtroCategoria);
      }

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

        // Audit P1: safeNum em vez de `|| 0` — protege contra NaN/Infinity
        const sorted = [...items].sort((a, b) => safeNum(a.preco_por_kg) - safeNum(b.preco_por_kg));
        const cheapest = sorted[0];
        const mostExpensive = sorted[sorted.length - 1];

        // Calculate savings per unit (difference between most expensive and cheapest)
        const savingPerKg = safeNum(mostExpensive.preco_por_kg) - safeNum(cheapest.preco_por_kg);
        savings += savingPerKg;

        result.push({
          baseName: items[0].nome, // Use the original casing from first item
          items: sorted.map(item => ({
            id: item.id,
            nome: item.nome,
            marca: item.marca || 'Sem marca',
            preco_por_kg: safeNum(item.preco_por_kg),
            unidade_medida: item.unidade_medida || 'kg',
            isCheapest: item.id === cheapest.id,
          })),
          savingPerKg,
          monthlySaving: savingPerKg,
          cheapestMarca: cheapest.marca || 'Sem marca',
        });
      }

      // Sort groups by potential savings descending
      result.sort((a, b) => b.monthlySaving - a.monthlySaving);
      setGroups(result);
      setTotalSavings(savings);
    } catch (e) {
      // Audit P0: era silent — agora loga e mostra banner com retry.
      console.error('[Fornecedores.loadData]', e);
      setLoadError('Não foi possível carregar a comparação de fornecedores. Tente novamente.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }

  const isWeb = Platform.OS === 'web';

  function renderDesktopGrid() {
    if (!isDesktop || groups.length === 0) return null;
    return (
      <View style={{ marginTop: spacing.xs }}>
        {groups.map((group, gi) => (
          <View key={gi} style={{ marginBottom: spacing.md }}>
            <View style={styles.gridCatHeader}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[gi % CATEGORY_COLORS.length] }} />
              <Text style={styles.gridCatTitle}>{group.baseName} ({group.items.length})</Text>
              {group.monthlySaving > 0 && (
                <View style={styles.savingBadge}>
                  <Text style={styles.savingBadgeText}>-{formatCurrency(group.savingPerKg)}/kg</Text>
                </View>
              )}
            </View>
            <View style={styles.gridContainer}>
              {group.items.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.gridCard,
                    item.isCheapest && { borderColor: colors.success + '40', backgroundColor: colors.success + '04' },
                    isWeb && { cursor: 'pointer' },
                  ]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: item.id, returnTo: 'Fornecedores' } })}
                >
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.gridCardName} numberOfLines={1}>
                      {item.nome}{item.marca !== 'Sem marca' ? ` (${item.marca})` : ''}
                    </Text>
                    {item.isCheapest && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
                        <Feather name="check-circle" size={9} color={colors.success} />
                        <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.success }}>Melhor preço</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.gridCardPrice, item.isCheapest && { color: colors.success }]}>
                    {formatCurrency(item.preco_por_kg)}/{item.unidade_medida === 'un' ? 'un' : 'kg'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {group.monthlySaving > 0 && (
              <View style={[styles.tipRow, { marginTop: 4, borderRadius: borderRadius.sm }]}>
                <Feather name="info" size={12} color={colors.accent} />
                <Text style={styles.tipText}>
                  Comprando de "{group.cheapestMarca}", você economiza {formatCurrency(group.monthlySaving)}/kg
                </Text>
              </View>
            )}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search + Category Filter */}
      <View style={styles.headerBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtrosList}
          nestedScrollEnabled
        >
          {[{ id: null, nome: 'Todos' }, ...categorias].map((item, index) => {
            const isActive = filtroCategoria === item.id;
            const chipColor = item.id === null ? colors.primary : getCategoryColor(index - 1);
            return (
              <TouchableOpacity
                key={String(item.id)}
                style={[styles.filtroChip, isActive && { backgroundColor: chipColor, borderColor: chipColor }]}
                onPress={() => setFiltroCategoria(item.id === filtroCategoria ? null : item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isActive }}
                accessibilityLabel={`Filtrar por ${item.nome}${isActive ? ' (selecionado)' : ''}`}
              >
                {item.id === null ? (
                  <Feather name="list" size={11} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 3 }} />
                ) : (
                  <View style={[styles.chipDot, { backgroundColor: isActive ? '#fff' : chipColor }]} />
                )}
                <Text style={[styles.filtroTexto, isActive && styles.filtroTextoAtivo]} numberOfLines={1}>
                  {item.nome}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar..." />
      </View>

      {/* Audit P0: banner de erro de carregamento (era silent) */}
      {loadError ? (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={loadData}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar fornecedores novamente"
        >
          <Feather name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Audit P0: loading visível (antes era tela em branco) */}
      {loading && groups.length === 0 && !loadError ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando comparações...</Text>
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content}>
        {/* Total savings summary */}
        <View style={styles.savingsCard}>
          <View style={styles.savingsIcon}>
            <Feather name="trending-down" size={20} color={colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.savingsLabel}>Economia potencial por kg (soma)</Text>
            <Text style={styles.savingsValue}>{formatCurrency(totalSavings)}/kg</Text>
          </View>
        </View>

        {groups.length === 0 && (
          <EmptyState
            icon="search"
            title="Nenhuma comparação disponível"
            description="Cadastre o mesmo insumo com marcas diferentes para comparar preços entre fornecedores."
          />
        )}

        {isDesktop ? (
          renderDesktopGrid()
        ) : (
          groups.map((group, gi) => (
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
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.itemRow,
                    ii < group.items.length - 1 && styles.itemRowBorder,
                    item.isCheapest && styles.itemRowCheapest,
                  ]}
                  activeOpacity={0.6}
                  onPress={() => navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: item.id, returnTo: 'Fornecedores' } })}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${item.nome} marca ${item.marca}, ${formatCurrency(item.preco_por_kg)} por ${item.unidade_medida === 'un' ? 'unidade' : 'kg'}${item.isCheapest ? ', melhor preço' : ''}`}
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
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.itemPreco, item.isCheapest && styles.itemPrecoCheapest]}>
                      {formatCurrency(item.preco_por_kg)}/{item.unidade_medida === 'un' ? 'un' : 'kg'}
                    </Text>
                    <Feather name="edit-2" size={14} color={colors.textSecondary} />
                  </View>
                </TouchableOpacity>
              ))}

              {group.monthlySaving > 0 && (
                <View style={styles.tipRow}>
                  <Feather name="info" size={12} color={colors.accent} />
                  <Text style={styles.tipText}>
                    Comprando de "{group.cheapestMarca}", você economiza {formatCurrency(group.monthlySaving)}/kg
                  </Text>
                </View>
              )}
            </View>
          ))
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 1200, width: '100%' },

  // Audit P0: banner de erro de carregamento + loading visível
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
  },
  errorBannerText: { color: '#dc2626', fontSize: fonts.small, flex: 1, fontFamily: fontFamily.regular },
  loadingBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg, gap: 8,
  },
  loadingText: { fontSize: fonts.small, color: colors.textSecondary, fontFamily: fontFamily.regular },

  // Header bar
  headerBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  filtrosList: { paddingHorizontal: spacing.md, gap: 2 },
  filtroChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginRight: 2,
  },
  chipDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4,
  },
  filtroTexto: {
    fontSize: 11, fontWeight: '600', color: colors.text, maxWidth: 90,
    fontFamily: fontFamily.semiBold,
  },
  filtroTextoAtivo: { color: '#fff' },

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

  // Desktop grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  gridCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    width: '23.5%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridCardName: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  gridCardPrice: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    flexShrink: 0,
  },
  gridCatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  gridCatTitle: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },

  // Tip
  tipRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.accent + '08',
  },
  tipText: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.accent, flex: 1, lineHeight: 16 },
});
