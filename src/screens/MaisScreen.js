import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useFeatureFlag from '../hooks/useFeatureFlag';

/**
 * Hub "Ferramentas" reorganizado (audit S9 — Sprint 4).
 *
 * MUDANÇAS SPRINT 4 S9:
 *  - Grupo "Ferramentas" (1 item: Exportar PDF) removido → movido para Operação.
 *  - Grupo "Negócio" (1 item: Financeiro) removido → Financeiro movido para
 *    Operação (aumenta discoverability; resolve N2/N21 sem precisar adicionar
 *    tab nativa e ultrapassar o limite de 6 tabs no mobile).
 *  - 1 cor por grupo (não por item): cada grupo tem `groupColor` que sobrescreve
 *    a cor individual do item — reduz ruído visual.
 *
 * Grupos finais (4):
 *  1. Operação — dia-a-dia: Financeiro, Atualizar Preços, Lista Compras,
 *     Fornecedores (flag), Exportar PDF
 *  2. Análise — visões estratégicas: Ranking de Produtos, Relatório
 *  3. Delivery — tudo de delivery (escondido até `usa_delivery` = true)
 *  4. Conta & Ajuda — Notificações, Configurações, Suporte
 */
const MENU_GROUPS = [
  {
    key: 'operacao',
    title: 'Operação',
    groupColor: colors.primary,
    items: [
      {
        key: 'financeiro',
        title: 'Financeiro',
        desc: 'Markup, despesas, faturamento e margem de lucro',
        icon: 'dollar-sign',
        set: 'feather',
        screen: 'FinanceiroMain',
      },
      {
        key: 'atualizar_precos',
        title: 'Atualizar Preços',
        desc: 'Atualize preços de insumos e produtos rapidamente',
        icon: 'refresh-cw', // Sprint 4 S9 — alinhado com Sidebar (N22)
        set: 'feather',
        screen: 'AtualizarPrecos',
      },
      {
        key: 'listacompras',
        title: 'Lista de Compras',
        desc: 'Gere sua lista de compras automática',
        icon: 'shopping-cart',
        set: 'feather',
        screen: 'ListaCompras',
      },
      {
        key: 'fornecedores',
        title: 'Comparar Fornecedores',
        desc: 'Compare preços e descubra onde economizar',
        icon: 'users',
        set: 'feather',
        screen: 'Fornecedores',
        flag: 'modo_avancado_analise',
      },
      {
        key: 'exportpdf',
        title: 'Exportar PDF',
        desc: 'Gere fichas técnicas em PDF para impressão',
        icon: 'printer',
        set: 'feather',
        screen: 'ExportPDF',
      },
    ],
  },
  {
    key: 'analise',
    title: 'Análise',
    groupColor: colors.accent,
    items: [
      {
        key: 'bcg',
        title: 'Ranking de Produtos',
        desc: 'Veja quais produtos vendem mais e dão mais lucro',
        icon: 'bar-chart-2',
        set: 'feather',
        screen: 'MatrizBCG',
        flag: 'modo_avancado_analise',
      },
      {
        key: 'relatorio',
        title: 'Relatório',
        desc: 'Seus números traduzidos em linguagem simples',
        icon: 'file-text',
        set: 'feather',
        screen: 'RelatorioSimples',
      },
    ],
  },
  {
    key: 'delivery_grp',
    title: 'Delivery',
    groupColor: colors.coral,
    flag: 'usa_delivery',
    items: [
      {
        key: 'delivery',
        title: 'Delivery',
        desc: 'Plataformas, preços e combos para delivery',
        icon: 'moped-outline',
        set: 'material',
        screen: 'DeliveryHub',
        flag: 'usa_delivery',
      },
      {
        key: 'comparativo_canais',
        title: 'Comparativo Canais',
        desc: 'Compare a margem do balcão vs cada plataforma de delivery',
        icon: 'bar-chart',
        set: 'feather',
        screen: 'ComparativoCanais',
        flag: 'usa_delivery',
      },
    ],
  },
  {
    key: 'conta',
    title: 'Conta & Ajuda',
    groupColor: colors.purple,
    items: [
      {
        key: 'notificacoes',
        title: 'Notificações',
        desc: 'Estoque baixo, margem crítica e resumo diário',
        icon: 'bell',
        set: 'feather',
        screen: 'Notificacoes',
      },
      {
        key: 'config',
        title: 'Configurações',
        desc: 'Ajustes e preferências do app',
        icon: 'settings',
        set: 'feather',
        screen: 'Configuracoes',
      },
      {
        key: 'suporte',
        title: 'Suporte',
        desc: 'Perguntas frequentes e contato',
        icon: 'help-circle',
        set: 'feather',
        screen: 'Suporte',
      },
    ],
  },
];

export default function MaisScreen({ navigation }) {
  // Sessão 26 — feature flags ocultam grupos/itens não-essenciais até user habilitar
  const [usaDelivery] = useFeatureFlag('usa_delivery');
  const [analiseAvancada] = useFeatureFlag('modo_avancado_analise');
  const flagOn = (name) => {
    if (!name) return true;
    if (name === 'usa_delivery') return !!usaDelivery;
    if (name === 'modo_avancado_analise') return !!analiseAvancada;
    return true;
  };
  const visibleGroups = MENU_GROUPS
    .filter((g) => flagOn(g.flag))
    .map((g) => ({ ...g, items: g.items.filter((it) => flagOn(it.flag)) }))
    .filter((g) => g.items.length > 0);
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {visibleGroups.map((group, gIdx) => {
        // Sprint 4 S9 — 1 cor por grupo. Item.color é fallback legacy.
        const c = group.groupColor || colors.primary;
        return (
          <View key={group.key} style={[styles.group, gIdx > 0 && { marginTop: spacing.lg }]}>
            <Text style={styles.sectionTitle}>{group.title}</Text>
            {group.items.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuCard}
                activeOpacity={0.6}
                onPress={() => navigation.navigate(item.screen)}
                accessibilityRole="button"
                accessibilityLabel={`${item.title}. ${item.desc}`}
              >
                <View style={[styles.iconCircle, { backgroundColor: c + '12', borderWidth: 1, borderColor: c + '30' }]}>
                  {item.set === 'material' ? (
                    <MaterialCommunityIcons name={item.icon} size={22} color={c} />
                  ) : (
                    <Feather name={item.icon} size={22} color={c} />
                  )}
                </View>
                <View style={styles.menuBody}>
                  <Text style={styles.menuTitle} numberOfLines={1}>{item.title}</Text>
                  <Text style={styles.menuDesc} numberOfLines={2}>{item.desc}</Text>
                </View>
                <Feather name="chevron-right" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            ))}
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    // Sessão 28 — paddingBottom 40→100 (BottomTab clearance mobile)
    padding: spacing.md, paddingBottom: 100,
    maxWidth: 720, alignSelf: 'center', width: '100%',
  },
  group: {},
  // Restaurado para o tipo da marca Precificaí — mesma família/peso dos demais
  // títulos (fontFamily.bold, fontWeight 700, fonts.regular). Sem caixa-alta
  // tracked: a hierarquia entre grupos vem do espaçamento (marginTop: lg).
  sectionTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.md, marginLeft: spacing.xs,
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
