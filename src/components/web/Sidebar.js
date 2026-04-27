import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Image, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigationState, CommonActions, StackActions } from '@react-navigation/native';
import { colors, spacing, fontFamily, webLayout } from '../../utils/theme';
import useFeatureFlag from '../../hooks/useFeatureFlag';
// Sessão 28.8 — alinha altura do logoArea com WebHeader.container (mesmo token)
import useListDensity from '../../hooks/useListDensity';

// Ordem segue o fluxo de composição (audit P1-08):
// Insumos → Preparos (combina insumos) → Embalagens (wrapper) → Produtos (final).
const NAV_SECTIONS = [
  {
    items: [
      { key: 'home', label: 'Painel Geral', icon: 'home', iconSet: 'feather', tab: 'Início' },
      { key: 'insumos', label: 'Insumos', icon: 'shopping-bag', iconSet: 'feather', tab: 'Insumos', screen: 'MateriasPrimas' },
      { key: 'preparos', label: 'Preparos', icon: 'pot-steam-outline', iconSet: 'material', tab: 'Preparos', screen: 'Preparos' },
      { key: 'embalagens', label: 'Embalagens', icon: 'package', iconSet: 'feather', tab: 'Embalagens', screen: 'Embalagens' },
      { key: 'produtos', label: 'Produtos', icon: 'tag', iconSet: 'feather', tab: 'Produtos', screen: 'ProdutosList' },
      { key: 'combos', label: 'Combos', icon: 'layers', iconSet: 'feather', tab: 'Produtos', screen: 'CombosScreen', flag: 'usa_delivery' },
    ],
  },
  {
    items: [
      { key: 'financeiro', label: 'Financeiro', icon: 'dollar-sign', iconSet: 'feather', tab: 'Mais', screen: 'FinanceiroMain' },
      { key: 'delivery', label: 'Delivery', icon: 'truck', iconSet: 'feather', tab: 'Mais', screen: 'DeliveryHub', flag: 'usa_delivery' },
      // Sprint 1 Q4 — "Eng. do Cardápio" → "Ranking de Produtos" (linguagem clara para usuário leigo).
      { key: 'bcg', label: 'Ranking de Produtos', icon: 'bar-chart-2', iconSet: 'feather', tab: 'Mais', screen: 'MatrizBCG', flag: 'modo_avancado_analise' },
      { key: 'precos', label: 'Atualizar Preços', icon: 'refresh-cw', iconSet: 'feather', tab: 'Mais', screen: 'AtualizarPrecos' },
      // Sessão 26 — Simulador agora é CTA contextual dentro da Ficha Técnica
      { key: 'relatorio', label: 'Relatório', icon: 'file-text', iconSet: 'feather', tab: 'Mais', screen: 'RelatorioSimples' },
      { key: 'fornecedores', label: 'Fornecedores', icon: 'users', iconSet: 'feather', tab: 'Mais', screen: 'Fornecedores', flag: 'modo_avancado_analise' },
      { key: 'listacompras', label: 'Lista de Compras', icon: 'shopping-cart', iconSet: 'feather', tab: 'Mais', screen: 'ListaCompras' },
      { key: 'exportpdf', label: 'Exportar PDF', icon: 'printer', iconSet: 'feather', tab: 'Mais', screen: 'ExportPDF' },
    ],
  },
  {
    items: [
      { key: 'config', label: 'Configurações', icon: 'settings', iconSet: 'feather', tab: 'Mais', screen: 'Configuracoes' },
    ],
  },
  {
    items: [
      { key: 'suporte', label: 'Suporte', icon: 'help-circle', iconSet: 'feather', tab: 'Mais', screen: 'Suporte' },
    ],
  },
];

function getActiveKey(navState) {
  if (!navState) return 'home';
  const tabRoute = navState.routes?.[navState.index];
  if (!tabRoute) return 'home';

  const tabName = tabRoute.name;

  // Top-level tabs
  if (tabName === 'Início') return 'home';
  if (tabName === 'Insumos') return 'insumos';
  if (tabName === 'Preparos') return 'preparos';
  if (tabName === 'Embalagens') return 'embalagens';
  if (tabName === 'Produtos') {
    const stackState = tabRoute.state;
    const stackRoute = stackState?.routes?.[stackState.index];
    const screenName = stackRoute?.name;
    if (screenName === 'CombosScreen') return 'combos';
    return 'produtos';
  }

  // Ferramentas sub-screens
  if (tabName === 'Mais') {
    const stackState = tabRoute.state;
    const stackRoute = stackState?.routes?.[stackState.index];
    const screenName = stackRoute?.name;
    // Entrada/Ajuste de estoque vivem agora dentro do contexto de Insumos (modo avançado).
    if (screenName === 'EntradaEstoque' || screenName === 'AjusteEstoque') return 'insumos';
    if (screenName === 'FinanceiroMain') return 'financeiro';
    if (screenName === 'DeliveryHub' || screenName?.startsWith('Delivery')) return 'delivery';
    if (screenName === 'MatrizBCG' || screenName === 'BCGProdutoForm') return 'bcg';
    if (screenName === 'AtualizarPrecos') return 'precos';
    if (screenName === 'Simulador') return 'simulador';
    if (screenName === 'RelatorioSimples') return 'relatorio';
    if (screenName === 'Fornecedores') return 'fornecedores';
    if (screenName === 'ListaCompras') return 'listacompras';
    if (screenName === 'KitInicio') return 'kitinicio';
    if (screenName === 'ExportPDF') return 'exportpdf';
    if (screenName === 'Configuracoes' || screenName === 'Perfil') return 'config';
    if (screenName === 'Suporte') return 'suporte';
    return 'home'; // default for MaisMain or unknown
  }

  return 'home';
}

// Web-native clickable button that works reliably with mouse clicks
function SidebarButton({ onPress, style, children, tooltip }) {
  if (Platform.OS === 'web') {
    const flat = StyleSheet.flatten(style) || {};
    // Convert React Native style to CSS-compatible style
    const cssStyle = {
      display: 'flex',
      flexDirection: flat.flexDirection || 'row',
      alignItems: flat.alignItems || 'center',
      justifyContent: flat.justifyContent || undefined,
      cursor: 'pointer',
      userSelect: 'none',
      paddingTop: flat.paddingVertical ?? flat.paddingTop ?? 0,
      paddingBottom: flat.paddingVertical ?? flat.paddingBottom ?? 0,
      paddingLeft: flat.paddingHorizontal ?? flat.paddingLeft ?? 0,
      paddingRight: flat.paddingHorizontal ?? flat.paddingRight ?? 0,
      marginTop: flat.marginVertical ?? flat.marginTop ?? 0,
      marginBottom: flat.marginVertical ?? flat.marginBottom ?? 0,
      marginLeft: flat.marginHorizontal ?? flat.marginLeft ?? 0,
      marginRight: flat.marginHorizontal ?? flat.marginRight ?? 0,
      borderRadius: flat.borderRadius ?? 0,
      backgroundColor: flat.backgroundColor || 'transparent',
      borderWidth: flat.borderWidth ? `${flat.borderWidth}px` : undefined,
      borderStyle: flat.borderWidth ? 'solid' : undefined,
      borderColor: flat.borderColor || undefined,
      borderLeftWidth: flat.borderLeftWidth ? `${flat.borderLeftWidth}px` : undefined,
      borderLeftColor: flat.borderLeftColor || undefined,
      position: flat.position || 'relative',
      transition: 'background-color 0.15s, border-color 0.15s',
      boxSizing: 'border-box',
    };
    return (
      <div onClick={(e) => { e.stopPropagation(); onPress(); }} style={cssStyle} title={tooltip || undefined}>
        {children}
      </div>
    );
  }
  return <View style={style}>{children}</View>;
}

export default function Sidebar({ navigation, collapsed, onToggleCollapse }) {
  const navState = useNavigationState(s => s);
  const tabState = navState?.routes?.[navState.index]?.state;
  const activeKey = getActiveKey(tabState);
  // Sessão 28.8 — Header da Sidebar deve ter MESMA altura do WebHeader.container
  // (que usa headerHeight do useListDensity: 52 compact / 64 comfortable).
  const { headerHeight } = useListDensity();
  // Sessão 26 — feature flags filtram itens da sidebar para esconder Delivery/BCG/Fornecedores
  const [usaDelivery] = useFeatureFlag('usa_delivery');
  const [analiseAvancada] = useFeatureFlag('modo_avancado_analise');
  const flagOn = (name) => {
    if (!name) return true;
    if (name === 'usa_delivery') return !!usaDelivery;
    if (name === 'modo_avancado_analise') return !!analiseAvancada;
    return true;
  };
  const filteredSections = NAV_SECTIONS
    .map((sec) => ({ ...sec, items: sec.items.filter((it) => flagOn(it.flag)) }))
    .filter((sec) => sec.items.length > 0);

  const handlePress = (item) => {
    if (item.screen) {
      // Navigate to Ferramentas tab with target screen
      navigation.navigate(item.tab, {
        screen: item.screen,
        params: { _t: Date.now() },
      });
    } else {
      // Navigate to tab root
      try {
        navigation.dispatch(
          CommonActions.reset({
            index: navState?.index || 0,
            routes: (navState?.routes || []).map(route => {
              if (route.name === item.tab) {
                return { ...route, state: undefined };
              }
              return route;
            }),
          })
        );
      } catch(e) { console.error('[Sidebar.navegacao]', e); }
      navigation.navigate(item.tab);
    }
  };

  const sidebarWidth = collapsed ? webLayout.sidebarCollapsed : webLayout.sidebarExpanded;

  return (
    <View style={[styles.container, { width: sidebarWidth }]}>
      {/* Logo */}
      <View style={[styles.logoArea, { height: headerHeight }]}>
        {collapsed ? (
          <Image
            source={require('../../../assets/images/logo-icon-green.png')}
            style={{ width: 32, height: 32 }}
            resizeMode="contain"
          />
        ) : (
          <Image
            source={require('../../../assets/images/logo-header-white.png')}
            style={{ width: 140, height: 30 }}
            resizeMode="contain"
          />
        )}
      </View>

      {/* Nav items - use div on web for visible scrollbar */}
      <ScrollView style={[styles.nav, Platform.OS === 'web' && { overflowY: 'auto' }]} showsVerticalScrollIndicator={true}>
        {filteredSections.map((section, sIdx) => (
          <View key={sIdx}>
            {sIdx > 0 && <View style={styles.divider} />}
            {section.items.map((item) => {
              const isActive = activeKey === item.key;
              const IconComp = item.iconSet === 'material' ? MaterialCommunityIcons : Feather;

              return (
                <SidebarButton
                  key={item.key}
                  onPress={() => handlePress(item)}
                  tooltip={collapsed ? item.label : undefined}
                  style={[
                    styles.navItem,
                    isActive && styles.navItemActive,
                    collapsed && styles.navItemCollapsed,
                  ]}
                >
                  {isActive && <View style={styles.activeBar} />}
                  <IconComp
                    name={item.icon}
                    size={20}
                    color={isActive ? colors.primary : colors.textSecondary}
                  />
                  {!collapsed && (
                    <Text
                      style={[
                        styles.navLabel,
                        isActive && styles.navLabelActive,
                      ]}
                      numberOfLines={1}
                    >
                      {item.label}
                    </Text>
                  )}
                </SidebarButton>
              );
            })}
          </View>
        ))}
      </ScrollView>

      {/* Bottom: collapse toggle */}
      <View style={styles.bottomArea}>
        <SidebarButton
          style={[styles.collapseBtn, collapsed && styles.navItemCollapsed]}
          onPress={onToggleCollapse}
          tooltip={collapsed ? 'Expandir menu' : undefined}
        >
          <Feather
            name={collapsed ? 'chevrons-right' : 'chevrons-left'}
            size={18}
            color={colors.textSecondary}
          />
          {!collapsed && (
            <Text style={styles.collapseLabel}>Recolher</Text>
          )}
        </SidebarButton>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: colors.border,
    height: '100%',
  },
  logoArea: {
    height: 56,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.primary,
  },
  nav: {
    flex: 1,
    paddingTop: spacing.md,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginHorizontal: 16,
    marginVertical: 8,
  },
  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    marginHorizontal: 12,
    marginVertical: 3,
    borderRadius: 10,
    position: 'relative',
    backgroundColor: colors.background,
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    borderLeftColor: 'transparent',
  },
  navItemCollapsed: {
    justifyContent: 'center',
    paddingHorizontal: 0,
    marginHorizontal: 8,
  },
  navItemActive: {
    backgroundColor: colors.primary + '10',
    borderTopColor: colors.primary + '40',
    borderRightColor: colors.primary + '40',
    borderBottomColor: colors.primary + '40',
    borderLeftColor: colors.primary,
  },
  activeBar: {
    display: 'none',
  },
  navLabel: {
    marginLeft: 12,
    fontSize: 14,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  navLabelActive: {
    color: colors.primary,
    fontFamily: fontFamily.bold,
  },
  bottomArea: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingVertical: spacing.sm,
  },
  collapseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginHorizontal: 8,
    borderRadius: 8,
  },
  collapseLabel: {
    marginLeft: 12,
    fontSize: 13,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
});
