import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, RefreshControl, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import { getFinanceiroStatus } from '../utils/financeiroStatus';

export default function MargemBaixaScreen({ navigation }) {
  const [produtos, setProdutos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [margemMeta, setMargemMeta] = useState(0.15);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }

  async function loadData() {
    try {
      const db = await getDatabase();
      const status = await getFinanceiroStatus();

      const [fixas, variaveis, fat, prodsR, allIngs, allPreps, allEmbs, cfgs] = await Promise.all([
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT * FROM produtos'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT lucro_desejado FROM configuracao LIMIT 1'),
      ]);
      const meta = cfgs?.[0]?.lucro_desejado || 0.15;
      setMargemMeta(meta);
      const totalFixas = fixas.reduce((a, x) => a + (x.valor || 0), 0);
      const totalVar = variaveis.reduce((a, x) => a + (x.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
      const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);

      // Build lookup maps
      const ingsByProd = {};
      (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      const result = [];

      for (const p of prodsR) {
        const ings = ingsByProd[p.id] || [];
        const custoIng = ings.reduce((a, i) => {
          return a + calcCustoIngrediente(i.preco_por_kg || 0, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida);
        }, 0);

        const embs = embsByProd[p.id] || [];
        const custoEmb = embs.reduce((a, e) => a + (e.preco_unitario || 0) * e.quantidade_utilizada, 0);

        const prepsQ = prepsByProd[p.id] || [];
        const custoPr = prepsQ.reduce((a, pp) => {
          return a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g');
        }, 0);

        const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);

        if (p.preco_venda > 0) {
          const despFixasVal = p.preco_venda * dfPerc;
          const despVarVal = p.preco_venda * totalVar;
          const lucro = p.preco_venda - custoUnit - despFixasVal - despVarVal;
          const margem = lucro / p.preco_venda;

          if (margem < meta) {
            result.push({
              id: p.id,
              nome: p.nome,
              preco: p.preco_venda,
              cmv: custoUnit,
              margem,
            });
          }
        }
      }

      result.sort((a, b) => a.margem - b.margem);
      setProdutos(result);
    } catch (e) { /* silent */ }
    setLoading(false);
  }

  const getMargemColor = (m) => {
    if (m < margemMeta - 0.10) return colors.error;
    return '#E6A800';
  };

  const renderItem = ({ item }) => {
    const mc = getMargemColor(item.margem);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('ProdutoFormHome', { id: item.id, returnTo: 'MargemBaixa' })}
      >
        <View style={[styles.avatar, { backgroundColor: mc + '15' }]}>
          <Text style={[styles.avatarText, { color: mc }]}>
            {item.nome.charAt(0).toUpperCase()}
          </Text>
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.cardName} numberOfLines={1}>{item.nome}</Text>
          <View style={styles.cardMeta}>
            <Text style={styles.cardMetaText}>Venda: {formatCurrency(item.preco)}</Text>
            <Text style={styles.cardMetaSep}>·</Text>
            <Text style={styles.cardMetaText}>CMV: {formatCurrency(item.cmv)}</Text>
          </View>
        </View>
        <View style={styles.cardRight}>
          <Text style={[styles.margemValue, { color: mc }]}>{formatPercent(item.margem)}</Text>
          <Feather name="chevron-right" size={16} color={colors.disabled} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.summary}>
        <View style={[styles.summaryIcon, { backgroundColor: colors.coral + '12' }]}>
          <Feather name="alert-triangle" size={18} color={colors.coral} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.summaryTitle}>{produtos.length} produto{produtos.length !== 1 ? 's' : ''} com margem abaixo de 10%</Text>
          <Text style={styles.summaryDesc}>Abra cada produto para ajustar preço ou custos</Text>
        </View>
      </View>

      <FlatList
        data={produtos}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        refreshControl={Platform.OS !== 'web' ? (
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
        ) : undefined}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Feather name="check-circle" size={48} color={colors.success} />
            <Text style={styles.emptyTitle}>Nenhum produto em risco</Text>
            <Text style={styles.emptyDesc}>Todos os produtos estão com margem saudável</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  summary: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.coral + '08', padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  summaryIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  summaryTitle: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  summaryDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  list: { padding: spacing.md },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
  },
  avatar: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  avatarText: { fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700' },
  cardBody: { flex: 1 },
  cardName: { fontSize: fonts.body, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  cardMetaText: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary },
  cardMetaSep: { marginHorizontal: 4, color: colors.disabled },
  cardRight: { alignItems: 'flex-end', marginLeft: spacing.sm },
  margemValue: { fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700', marginBottom: 2 },
  separator: { height: spacing.xs },
  empty: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 60,
  },
  emptyTitle: { fontSize: fonts.body, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 4 },
});
