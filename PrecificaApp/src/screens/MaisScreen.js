import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const MENU_ITEMS = [
  {
    key: 'financeiro',
    title: 'Financeiro',
    desc: 'Markup, despesas, faturamento e margem de lucro',
    icon: 'dollar-sign',
    set: 'feather',
    color: colors.success,
    screen: 'FinanceiroMain',
  },
  {
    key: 'delivery',
    title: 'Delivery',
    desc: 'Plataformas, preços e combos para delivery',
    icon: 'moped-outline',
    set: 'material',
    color: colors.coral,
    screen: 'DeliveryHub',
  },
  {
    key: 'bcg',
    title: 'Engenharia de Cardápio',
    desc: 'Análise de portfólio de produtos',
    icon: 'bar-chart-2',
    set: 'feather',
    color: colors.accent,
    screen: 'MatrizBCG',
  },
  {
    key: 'atualizar_precos',
    title: 'Atualizar Preços',
    desc: 'Atualize preços de insumos e produtos rapidamente',
    icon: 'dollar-sign',
    set: 'feather',
    color: colors.yellow,
    screen: 'AtualizarPrecos',
  },
  {
    key: 'simulador',
    title: 'Simulador E se?',
    desc: 'Simule variações de preço e veja o impacto nos custos',
    icon: 'zap',
    set: 'feather',
    color: colors.coral,
    screen: 'Simulador',
  },
  {
    key: 'relatorio',
    title: 'Relatório Simplificado',
    desc: 'Seus números traduzidos em linguagem simples',
    icon: 'file-text',
    set: 'feather',
    color: colors.accent,
    screen: 'RelatorioSimples',
  },
  {
    key: 'fornecedores',
    title: 'Comparar Fornecedores',
    desc: 'Compare preços e encontre economia',
    icon: 'users',
    set: 'feather',
    color: colors.purple,
    screen: 'Fornecedores',
  },
  {
    key: 'listacompras',
    title: 'Lista de Compras',
    desc: 'Gere sua lista de compras automática',
    icon: 'shopping-cart',
    set: 'feather',
    color: colors.success,
    screen: 'ListaCompras',
  },
  {
    key: 'exportpdf',
    title: 'Exportar PDF',
    desc: 'Gere fichas técnicas em PDF para impressão',
    icon: 'printer',
    set: 'feather',
    color: colors.primary,
    screen: 'ExportPDF',
  },
  {
    key: 'config',
    title: 'Configurações',
    desc: 'Ajustes e preferências do app',
    icon: 'settings',
    set: 'feather',
    color: colors.textSecondary,
    screen: 'Configuracoes',
  },
  {
    key: 'suporte',
    title: 'Suporte',
    desc: 'Perguntas frequentes e contato',
    icon: 'help-circle',
    set: 'feather',
    color: colors.primary,
    screen: 'Suporte',
  },
];

export default function MaisScreen({ navigation }) {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {MENU_ITEMS.map((item) => (
        <TouchableOpacity
          key={item.key}
          style={styles.menuCard}
          activeOpacity={0.6}
          onPress={() => navigation.navigate(item.screen)}
        >
          <View style={[styles.iconCircle, { backgroundColor: item.color + '12' }]}>
            {item.set === 'material' ? (
              <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
            ) : (
              <Feather name={item.icon} size={22} color={item.color} />
            )}
          </View>
          <View style={styles.menuBody}>
            <Text style={styles.menuTitle}>{item.title}</Text>
            <Text style={styles.menuDesc}>{item.desc}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.disabled} />
        </TouchableOpacity>
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.md, paddingBottom: 40,
    maxWidth: 720, alignSelf: 'center', width: '100%',
  },
  sectionTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.md, marginTop: spacing.xs,
  },
  menuCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  iconCircle: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.md,
  },
  menuBody: { flex: 1 },
  menuTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: 2,
  },
  menuDesc: {
    fontSize: fonts.tiny, fontFamily: fontFamily.regular,
    color: colors.textSecondary, lineHeight: 16,
  },
});
