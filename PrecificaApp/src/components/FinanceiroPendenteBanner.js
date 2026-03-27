import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { getFinanceiroStatus } from '../utils/financeiroStatus';

export default function FinanceiroPendenteBanner() {
  const navigation = useNavigation();
  const [pendente, setPendente] = useState(false);

  useFocusEffect(useCallback(() => {
    getFinanceiroStatus().then(s => setPendente(!s.completo)).catch(() => {});
  }, []));

  if (!pendente) return null;

  function goToFinanceiro() {
    try {
      // Cross-tab navigation: go up to tab navigator, then into Ferramentas > FinanceiroMain
      const parent = navigation.getParent();
      const tabNav = parent?.getParent?.() || parent;
      if (tabNav) {
        tabNav.navigate('Ferramentas', { screen: 'FinanceiroMain' });
      } else {
        navigation.navigate('FinanceiroMain');
      }
    } catch {
      navigation.navigate('FinanceiroMain');
    }
  }

  return (
    <TouchableOpacity style={styles.banner} activeOpacity={0.8} onPress={goToFinanceiro}>
      <Text style={styles.icon}>⚠️</Text>
      <View style={styles.body}>
        <Text style={styles.title}>Configuração financeira pendente</Text>
        <Text style={styles.desc}>Markup, margens e preços sugeridos podem estar incorretos. Toque para configurar.</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderWidth: 1, borderColor: '#FFB74D',
    borderRadius: borderRadius.sm,
    padding: spacing.sm, marginHorizontal: spacing.md, marginTop: spacing.sm,
  },
  icon: { fontSize: 18, marginRight: spacing.sm },
  body: { flex: 1 },
  title: { fontSize: fonts.small, fontWeight: '700', color: '#E65100', marginBottom: 1 },
  desc: { fontSize: fonts.tiny, color: '#BF360C', lineHeight: 16 },
});
