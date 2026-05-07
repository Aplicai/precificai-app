/**
 * RelatoriosHubScreen — Sessão 28.40
 *
 * Combina o Relatório geral e o Relatório de Insumos em uma única página
 * com guias internas no estilo do DeliveryHub. Header da página fica fixo
 * ("Relatórios") e o user alterna entre "Geral" e "Insumos" via tabs.
 *
 * Cada filho é renderizado em modo `embedded` (sem header próprio, sem
 * pageShell duplicado) — apenas o conteúdo. O focus do React Navigation
 * permanece neste hub; useFocusEffect dos filhos dispara no mount, então
 * a primeira aba carrega ao abrir e a outra carrega ao trocar de tab
 * (mount/unmount via render condicional).
 *
 * Suporta param `aba` ('geral' | 'insumos') pra abrir em uma tab específica.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useRoute } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

import RelatorioSimplesScreen from './RelatorioSimplesScreen';
import RelatorioInsumosScreen from './RelatorioInsumosScreen';

const TABS = [
  { key: 'geral',   label: 'Geral',   icon: 'book-open' },
  { key: 'insumos', label: 'Insumos', icon: 'bar-chart-2' },
];

export default function RelatoriosHubScreen({ navigation }) {
  const route = useRoute();
  const initialTab = route?.params?.aba === 'insumos' ? 'insumos' : 'geral';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Permite que outras telas naveguem pra cá com `aba: 'insumos'` e a tab certa abra
  useEffect(() => {
    if (route?.params?.aba === 'insumos' || route?.params?.aba === 'geral') {
      setActiveTab(route.params.aba);
    }
  }, [route?.params?.aba]);

  return (
    <View style={styles.container}>
      <View style={styles.pageShell}>
        {/* Page Header */}
        <View style={styles.pageHeader}>
          <View style={styles.pageHeaderIcon}>
            <Feather name="bar-chart-2" size={20} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.pageHeaderTitle}>Relatórios</Text>
            <Text style={styles.pageHeaderSubtitle}>
              Visão geral do negócio e saúde do cadastro de insumos
            </Text>
          </View>
        </View>

        {/* Tabs */}
        <View style={styles.tabsRow}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.7}
                accessibilityRole="tab"
                accessibilityState={{ selected: isActive }}
              >
                <Feather name={tab.icon} size={14} color={isActive ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Conteúdo da aba ativa.
            Render condicional (não toggle de visibilidade) pra garantir que
            useFocusEffect/useEffect dos filhos disparem ao trocar de aba e
            pra não acumular memória das duas árvores ao mesmo tempo. */}
        <View style={{ flex: 1 }}>
          {activeTab === 'geral' && (
            <RelatorioSimplesScreen embedded navigation={navigation} />
          )}
          {activeTab === 'insumos' && (
            <RelatorioInsumosScreen embedded navigation={navigation} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = {
  container: { flex: 1, backgroundColor: colors.background },
  pageShell: {
    flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center',
  },
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pageHeaderIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  pageHeaderTitle: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  pageHeaderSubtitle: { fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', flexDirection: 'row', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    justifyContent: 'center',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  tabTextActive: { color: colors.primary },
};
