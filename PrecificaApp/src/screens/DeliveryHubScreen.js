import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { formatCurrency, converterParaBase } from '../utils/calculations';

export default function DeliveryHubScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const [stats, setStats] = useState({
    plataformasAtivas: 0,
    plataformasTotal: 0,
    produtosDelivery: 0,
    adicionais: 0,
    combos: 0,
    margemMedia: null,
  });

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [])
  );

  async function loadStats() {
    const db = await getDatabase();
    const [plats, dProds, adds, combosCount, prods, allIngs, allPreps, allEmbs] = await Promise.all([
      db.getAllAsync('SELECT * FROM delivery_config'),
      db.getAllAsync('SELECT COUNT(*) as c FROM delivery_produtos'),
      db.getAllAsync('SELECT COUNT(*) as c FROM delivery_adicionais'),
      db.getAllAsync('SELECT COUNT(*) as c FROM delivery_combos'),
      db.getAllAsync('SELECT * FROM produtos WHERE preco_venda > 0'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
    ]);
    const platsAtivas = plats.filter(p => p.ativo === 1);

    // Build lookup maps
    const ingsByProd = {};
    (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
    const prepsByProd = {};
    (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
    const embsByProd = {};
    (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

    // Margem média dos produtos
    let somaMargens = 0;
    let countMargens = 0;
    for (const p of prods) {
      const ings = ingsByProd[p.id] || [];
      const custoIng = ings.reduce((a, i) => {
        if (i.unidade_medida === 'un') return a + i.quantidade_utilizada * i.preco_por_kg;
        const qtBase = converterParaBase(i.quantidade_utilizada, i.unidade_medida);
        return a + (qtBase / 1000) * i.preco_por_kg;
      }, 0);
      const preps = prepsByProd[p.id] || [];
      const custoPr = preps.reduce((a, pp) => {
        const qtBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g');
        return a + (qtBase / 1000) * pp.custo_por_kg;
      }, 0);
      const embs = embsByProd[p.id] || [];
      const custoEmb = embs.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);
      const custoTotal = custoIng + custoPr + custoEmb;
      const custoUnit = custoTotal / (p.rendimento_unidades || 1);
      if (p.preco_venda > 0) {
        const margem = ((p.preco_venda - custoUnit) / p.preco_venda) * 100;
        somaMargens += margem;
        countMargens++;
      }
    }

    setStats({
      plataformasAtivas: platsAtivas.length,
      plataformasTotal: plats.length,
      produtosDelivery: dProds[0]?.c || 0,
      adicionais: adds[0]?.c || 0,
      combos: combosCount[0]?.c || 0,
      margemMedia: countMargens > 0 ? somaMargens / countMargens : null,
    });
  }

  const sections = [
    {
      screen: 'DeliveryPlataformas',
      icon: '📱',
      title: 'Plataformas',
      desc: 'Configure taxas do iFood, Rappi, Uber Eats e outras',
      color: '#1976D2',
      badge: stats.plataformasAtivas > 0
        ? `${stats.plataformasAtivas}/${stats.plataformasTotal} ativas`
        : null,
    },
    {
      screen: 'DeliveryPrecos',
      icon: '💰',
      title: 'Precificação Delivery',
      desc: 'Preços sugeridos por plataforma com taxas e comissões',
      color: '#388E3C',
      badge: stats.margemMedia !== null
        ? `Margem ${stats.margemMedia.toFixed(0)}%`
        : null,
    },
    {
      screen: 'DeliveryProdutosScreen',
      icon: '🛵',
      title: 'Itens para Delivery',
      desc: 'Monte combos e kits exclusivos para venda por delivery',
      color: '#F57C00',
      badge: stats.produtosDelivery > 0
        ? `${stats.produtosDelivery} ${stats.produtosDelivery === 1 ? 'item' : 'itens'}`
        : null,
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Dashboard indicators */}
      <View style={styles.indicatorsRow}>
        <View style={styles.indicator}>
          <Text style={styles.indicatorValue}>{stats.plataformasAtivas}</Text>
          <Text style={styles.indicatorLabel}>Plataformas</Text>
        </View>
        <View style={styles.indicator}>
          <Text style={styles.indicatorValue}>{stats.produtosDelivery}</Text>
          <Text style={styles.indicatorLabel}>Produtos</Text>
        </View>
        <View style={styles.indicator}>
          <Text style={styles.indicatorValue}>{stats.combos}</Text>
          <Text style={styles.indicatorLabel}>Combos</Text>
        </View>
        <View style={styles.indicator}>
          <Text style={[styles.indicatorValue, stats.margemMedia !== null && stats.margemMedia < 30 ? { color: colors.warning } : { color: colors.success }]}>
            {stats.margemMedia !== null ? `${stats.margemMedia.toFixed(0)}%` : '—'}
          </Text>
          <Text style={styles.indicatorLabel}>Margem</Text>
        </View>
      </View>

      <Text style={styles.subtitle}>Gerencie tudo relacionado às suas vendas por delivery</Text>

      {sections.map((s) => (
        <TouchableOpacity
          key={s.screen}
          style={styles.card}
          activeOpacity={0.7}
          onPress={() => navigation.navigate(s.screen)}
        >
          <View style={[styles.iconBox, { backgroundColor: s.color + '15' }]}>
            <Text style={styles.icon}>{s.icon}</Text>
          </View>
          <View style={styles.cardBody}>
            <Text style={styles.cardTitle}>{s.title}</Text>
            <Text style={styles.cardDesc}>{s.desc}</Text>
            {s.badge && (
              <View style={[styles.microBadge, { backgroundColor: s.color + '15' }]}>
                <Text style={[styles.microBadgeText, { color: s.color }]}>{s.badge}</Text>
              </View>
            )}
          </View>
          <Text style={styles.chevron}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 40,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },
  indicatorsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  indicator: {
    flex: 1,
    alignItems: 'center',
  },
  indicatorValue: {
    fontSize: fonts.large,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  indicatorLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
  },
  subtitle: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: {
    fontSize: 24,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: fonts.regular,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  microBadge: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 4,
  },
  microBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 24,
    color: colors.disabled,
    marginLeft: spacing.sm,
  },
});
