import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FinanceiroPendenteBanner from '../components/FinanceiroPendenteBanner';
import InfoTooltip from '../components/InfoTooltip';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, calcDespesasFixasPercentual, converterParaBase } from '../utils/calculations';

const QUADRANTS = [
  {
    key: 'Estrela', icon: 'star', label: 'Estrela',
    bg: '#FFF8E1', border: '#FFD700', color: '#F9A825',
    desc: 'Preço alto + custo baixo. Seus melhores produtos! Mantenha a qualidade e destaque no cardápio.',
    acao: 'Promover e manter',
  },
  {
    key: 'Cavalo de Batalha', icon: 'zap', label: 'Cavalo de Batalha',
    bg: '#E8F5E9', border: '#4CAF50', color: '#388E3C',
    desc: 'Preço alto + custo alto. Bom faturamento, mas margem apertada. Renegocie com fornecedores ou ajuste porções.',
    acao: 'Otimizar custos',
  },
  {
    key: 'Quebra-Cabeça', icon: 'grid', label: 'Quebra-Cabeça',
    bg: '#E3F2FD', border: '#2196F3', color: '#1565C0',
    desc: 'Preço baixo + custo baixo. Margem razoável, mas pouco faturamento. Aumente o preço gradualmente ou crie combos.',
    acao: 'Reposicionar preço',
  },
  {
    key: 'Abacaxi', icon: 'alert-triangle', label: 'Abacaxi',
    bg: '#FFEBEE', border: '#F44336', color: '#C62828',
    desc: 'Preço baixo + custo alto. Prejuízo potencial. Reformule a receita, aumente o preço ou considere retirar do cardápio.',
    acao: 'Reformular ou retirar',
  },
];

export default function MatrizBCGScreen({ navigation }) {
  const [produtos, setProdutos] = useState([]);
  const [expanded, setExpanded] = useState({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  function toggleExpand(key) {
    setExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  }

  async function loadData() {
    setLoading(true);
    const db = await getDatabase();
    const [fixas, variaveis, fat, prods, allIngs, allPreps, allEmbs,
           embalagensList, materiasList, preparosList,
           dProds, allDProdItens, combos, allComboItens] = await Promise.all([
      db.getAllAsync('SELECT * FROM despesas_fixas'),
      db.getAllAsync('SELECT * FROM despesas_variaveis'),
      db.getAllAsync('SELECT * FROM faturamento_mensal'),
      db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      db.getAllAsync('SELECT id, preco_unitario FROM embalagens'),
      db.getAllAsync('SELECT id, preco_por_kg, unidade_medida FROM materias_primas'),
      db.getAllAsync('SELECT id, custo_por_kg FROM preparos'),
      db.getAllAsync('SELECT * FROM delivery_produtos'),
      db.getAllAsync('SELECT * FROM delivery_produto_itens'),
      db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_combo_itens'),
    ]);

    const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
    const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
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
    const prodCustoMap = {};

    for (const p of prods) {
      const ings = ingsByProd[p.id] || [];
      const custoIng = ings.reduce((a, i) => {
        if (i.unidade_medida === 'un') return a + i.quantidade_utilizada * (i.preco_por_kg || 0);
        const qtBase = converterParaBase(i.quantidade_utilizada, i.unidade_medida);
        return a + (qtBase / 1000) * (i.preco_por_kg || 0);
      }, 0);

      const preps = prepsByProd[p.id] || [];
      const custoPr = preps.reduce((a, pp) => {
        const qtBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g');
        return a + (qtBase / 1000) * (pp.custo_por_kg || 0);
      }, 0);

      const embs = embsByProd[p.id] || [];
      const custoEmb = embs.reduce((a, e) => a + (e.preco_unitario || 0) * e.quantidade_utilizada, 0);

      const custoUnitario = (custoIng + custoPr + custoEmb) / (p.rendimento_unidades || 1);
      const precoVenda = p.preco_venda || 0;
      const lucro = precoVenda - custoUnitario - (precoVenda * dfPerc) - (precoVenda * totalVar);
      const margemPerc = precoVenda > 0 ? ((precoVenda - custoUnitario) / precoVenda) * 100 : 0;

      prodCustoMap[p.id] = custoUnitario;
      result.push({ ...p, custoUnitario, lucro, margemPerc, precoVenda, isCombo: false });
    }

    // Combos - use lookup maps instead of per-item queries
    const dProdItensByDProd = {};
    (allDProdItens || []).forEach(i => { (dProdItensByDProd[i.delivery_produto_id] = dProdItensByDProd[i.delivery_produto_id] || []).push(i); });
    const comboItensByCombo = {};
    (allComboItens || []).forEach(i => { (comboItensByCombo[i.combo_id] = comboItensByCombo[i.combo_id] || []).push(i); });

    const dProdCustoMap = {};
    for (const dp of dProds) {
      const itens = dProdItensByDProd[dp.id] || [];
      let custo = 0;
      for (const item of itens) {
        if (item.tipo === 'produto') custo += (prodCustoMap[item.item_id] || 0) * item.quantidade;
        else if (item.tipo === 'embalagem') {
          const emb = embalagensList.find(e => e.id === item.item_id);
          if (emb) custo += emb.preco_unitario * item.quantidade;
        }
      }
      dProdCustoMap[dp.id] = custo;
    }

    for (const combo of combos) {
      const itens = comboItensByCombo[combo.id] || [];
      let custoCombo = 0;
      for (const item of itens) {
        if (item.tipo === 'produto') custoCombo += (prodCustoMap[item.item_id] || 0) * item.quantidade;
        else if (item.tipo === 'delivery_produto') custoCombo += (dProdCustoMap[item.item_id] || 0) * item.quantidade;
      }
      const precoVenda = combo.preco_venda || 0;
      const lucro = precoVenda - custoCombo - (precoVenda * dfPerc) - (precoVenda * totalVar);
      const margemPerc = precoVenda > 0 ? ((precoVenda - custoCombo) / precoVenda) * 100 : 0;
      result.push({ id: `combo_${combo.id}`, nome: combo.nome, custoUnitario: custoCombo, lucro, margemPerc, precoVenda, isCombo: true });
    }

    // Classify using median
    const validItems = result.filter(p => p.precoVenda > 0);
    if (validItems.length === 0) {
      setProdutos(result.map(p => ({ ...p, classificacao: 'Quebra-Cabeça' })));
      setLoading(false);
      return;
    }

    const sorted = (arr) => [...arr].sort((a, b) => a - b);
    const median = (arr) => { const s = sorted(arr); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
    const medianaPreco = median(validItems.map(p => p.precoVenda));
    const medianaCusto = median(validItems.map(p => p.custoUnitario));

    const classified = result.map(p => {
      const alto = p.precoVenda >= medianaPreco;
      const caro = p.custoUnitario >= medianaCusto;
      let classificacao;
      if (alto && !caro) classificacao = 'Estrela';
      else if (alto && caro) classificacao = 'Cavalo de Batalha';
      else if (!alto && !caro) classificacao = 'Quebra-Cabeça';
      else classificacao = 'Abacaxi';
      return { ...p, classificacao };
    });

    setProdutos(classified);
    setLoading(false);
  }

  const grupos = {};
  QUADRANTS.forEach(q => { grupos[q.key] = produtos.filter(p => p.classificacao === q.key); });

  function navigateToProduto(item) {
    if (!item.isCombo) {
      navigation.navigate('BCGProdutoForm', { id: item.id });
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <FinanceiroPendenteBanner />

      {/* Header with tooltip */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>Engenharia de Cardápio</Text>
          <Text style={styles.subtitle}>Análise de preço vs custo dos seus produtos</Text>
        </View>
        <InfoTooltip
          title="Como funciona?"
          text="A Engenharia de Cardápio classifica seus produtos em 4 categorias baseado no preço de venda e no custo (CMV). O ponto de corte é a mediana: metade dos produtos fica acima e metade abaixo."
          examples={[
            'Estrela: preço alto + custo baixo = melhor margem',
            'Cavalo: preço alto + custo alto = otimize custos',
            'Quebra-Cabeça: preço baixo + custo baixo = aumente preço',
            'Abacaxi: preço baixo + custo alto = reformule',
          ]}
        />
      </View>

      {loading ? (
        <View style={styles.emptyState}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.emptyTitle, { marginTop: 12 }]}>Carregando análise...</Text>
        </View>
      ) : produtos.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="bar-chart-2" size={48} color={colors.disabled} />
          <Text style={styles.emptyTitle}>Sem dados para análise</Text>
          <Text style={styles.emptyDesc}>Cadastre produtos com preço de venda para ver a classificação</Text>
        </View>
      ) : (
        <>
          {/* Summary row */}
          <View style={styles.summaryRow}>
            {QUADRANTS.map(q => {
              const count = (grupos[q.key] || []).length;
              return (
                <TouchableOpacity
                  key={q.key}
                  style={[styles.summaryCard, { backgroundColor: q.bg, borderColor: q.border }]}
                  activeOpacity={0.7}
                  onPress={() => toggleExpand(q.key)}
                >
                  <Feather name={q.icon} size={16} color={q.color} />
                  <Text style={[styles.summaryCount, { color: q.color }]}>{count}</Text>
                  <Text style={[styles.summaryLabel, { color: q.color }]} numberOfLines={1}>{q.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Quadrant cards - collapsible */}
          {QUADRANTS.map(q => {
            const prods = grupos[q.key] || [];
            const isExpanded = expanded[q.key] || false;

            return (
              <View key={q.key} style={styles.quadrantCard}>
                <TouchableOpacity
                  style={styles.quadrantHeader}
                  activeOpacity={0.7}
                  onPress={() => toggleExpand(q.key)}
                >
                  <View style={[styles.quadrantIconCircle, { backgroundColor: q.color + '15' }]}>
                    <Feather name={q.icon} size={16} color={q.color} />
                  </View>
                  <View style={styles.quadrantHeaderBody}>
                    <View style={styles.quadrantTitleRow}>
                      <Text style={styles.quadrantTitle}>{q.label}</Text>
                      <View style={[styles.countBadge, { backgroundColor: q.color + '15' }]}>
                        <Text style={[styles.countBadgeText, { color: q.color }]}>{prods.length}</Text>
                      </View>
                    </View>
                    <Text style={styles.quadrantDesc}>{q.desc}</Text>
                    <View style={[styles.acaoBadge, { backgroundColor: q.bg }]}>
                      <Feather name="target" size={10} color={q.color} />
                      <Text style={[styles.acaoText, { color: q.color }]}>{q.acao}</Text>
                    </View>
                  </View>
                  <Feather
                    name={isExpanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={colors.disabled}
                  />
                </TouchableOpacity>

                {/* Expanded product list */}
                {isExpanded && (
                  <View style={styles.prodList}>
                    {prods.length === 0 ? (
                      <Text style={styles.noProdText}>Nenhum produto nesta categoria</Text>
                    ) : (
                      prods.map((p, i) => {
                        const isLast = i === prods.length - 1;
                        return (
                          <TouchableOpacity
                            key={p.id}
                            style={[styles.prodRow, !isLast && styles.prodRowBorder]}
                            activeOpacity={p.isCombo ? 1 : 0.6}
                            onPress={() => navigateToProduto(p)}
                          >
                            <View style={[styles.prodAvatar, { backgroundColor: q.color + '12' }]}>
                              {p.isCombo ? (
                                <Feather name="layers" size={14} color={q.color} />
                              ) : (
                                <Text style={[styles.prodAvatarText, { color: q.color }]}>
                                  {(p.nome || '?').charAt(0).toUpperCase()}
                                </Text>
                              )}
                            </View>
                            <View style={styles.prodBody}>
                              <Text style={styles.prodName} numberOfLines={1}>{p.nome}</Text>
                              <View style={styles.prodMeta}>
                                <Text style={styles.prodMetaText}>
                                  Venda {formatCurrency(p.precoVenda)}
                                </Text>
                                <Text style={styles.prodMetaSep}>·</Text>
                                <Text style={styles.prodMetaText}>
                                  CMV {formatCurrency(p.custoUnitario)}
                                </Text>
                                <Text style={styles.prodMetaSep}>·</Text>
                                <Text style={[styles.prodMetaText, {
                                  color: p.margemPerc >= 30 ? colors.success : p.margemPerc >= 0 ? colors.coral : colors.error
                                }]}>
                                  {p.margemPerc.toFixed(0)}%
                                </Text>
                              </View>
                            </View>
                            {!p.isCombo && <Feather name="chevron-right" size={14} color={colors.disabled} />}
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: { flex: 1, marginRight: spacing.sm },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: fonts.body, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  // Summary row
  summaryRow: {
    flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.md,
  },
  summaryCard: {
    flex: 1, alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 1.5,
    paddingVertical: spacing.sm, paddingHorizontal: 4,
  },
  summaryCount: { fontSize: fonts.xlarge, fontFamily: fontFamily.bold, fontWeight: '700', marginTop: 2 },
  summaryLabel: { fontSize: 9, fontFamily: fontFamily.semiBold, fontWeight: '600', textAlign: 'center' },

  // Quadrant card
  quadrantCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
    overflow: 'hidden',
  },
  quadrantHeader: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: spacing.md,
  },
  quadrantIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm, marginTop: 2,
  },
  quadrantHeaderBody: { flex: 1, marginRight: spacing.xs },
  quadrantTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 4 },
  quadrantTitle: { fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  countBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1 },
  countBadgeText: { fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700' },
  quadrantDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 16, marginBottom: 6 },
  acaoBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    alignSelf: 'flex-start', borderRadius: borderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  acaoText: { fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600' },

  // Product list
  prodList: {
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  noProdText: {
    fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.disabled,
    textAlign: 'center', paddingVertical: spacing.md,
  },
  prodRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
  },
  prodRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  prodAvatar: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  prodAvatarText: { fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700' },
  prodBody: { flex: 1, marginRight: spacing.xs },
  prodName: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  prodMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  prodMetaText: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary },
  prodMetaSep: { marginHorizontal: 4, color: colors.disabled, fontSize: 10 },
});
