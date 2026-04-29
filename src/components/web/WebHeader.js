import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, useWindowDimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigationState } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, fontFamily, webLayout } from '../../utils/theme';
import useListDensity from '../../hooks/useListDensity';

const ROUTE_TITLES = {
  'Início': 'Painel Geral',
  'HomeMain': 'Painel Geral',
  'Insumos': 'Insumos',
  'MateriasPrimasMain': 'Insumos',
  'MateriasPrimas': 'Insumos',
  'MateriasPrimasForm': 'Editar Insumo',
  'MateriaPrimaForm': 'Editar Insumo',
  'Preparos': 'Preparos',
  'PreparosMain': 'Preparos',
  'PreparoForm': 'Editar Preparo',
  'Embalagens': 'Embalagens',
  'EmbalagensMain': 'Embalagens',
  'EmbalagemForm': 'Editar Embalagem',
  'Produtos': 'Produtos',
  'ProdutosMain': 'Produtos',
  'ProdutosList': 'Produtos',
  'ProdutoForm': 'Editar Produto',
  'ProdutoFormHome': 'Editar Produto',
  'BCGProdutoForm': 'Editar Produto',
  'CombosScreen': 'Combos',
  'DeliveryCombosScreen': 'Combos',
  'MargemBaixa': 'Produtos com Margem Baixa',
  // Sprint 1 Q3 — display "Ferramentas" (route name "Mais" preservado para persistência).
  'Mais': 'Ferramentas',
  'MaisMain': 'Ferramentas',
  'FinanceiroMain': 'Financeiro',
  'DeliveryHub': 'Delivery',
  'DeliveryPlataformas': 'Plataformas',
  'DeliveryPrecos': 'Precificação Delivery',
  'DeliveryProdutosScreen': 'Produtos Delivery',
  // APP-28: Simulador em lote
  'SimuladorLote': 'Simulador em Lote',
  // Sprint 1 Q4 — "Engenharia do Cardápio" → "Ranking de Produtos" (linguagem clara para o usuário leigo).
  'MatrizBCG': 'Ranking de Produtos',
  'Configuracoes': 'Configurações',
  'ContaSeguranca': 'Conta e Segurança',
  'Perfil': 'Perfil do Negócio',
  'AtualizarPrecos': 'Atualizar Preços',
  'Simulador': 'Simulador',
  'RelatorioSimples': 'Relatório',
  'Fornecedores': 'Fornecedores',
  'ListaCompras': 'Lista de Compras',
  'ExportPDF': 'Exportar PDF',
  'KitInicio': 'Kit de Início',
  'Sobre': 'Sobre o App',
  'Suporte': 'Suporte',
  'EntradaEstoque': 'Entrada de Estoque',
  'AjusteEstoque': 'Ajuste de Estoque',
  'Notificacoes': 'Notificações',
  'ComparativoCanais': 'Comparativo Canais',
  'Termos': 'Termos de Uso',
  'Privacidade': 'Política de Privacidade',
};

// Routes rendered as transparentModal popups — header should ignore them
const MODAL_FORM_ROUTES = new Set([
  'MateriaPrimaForm',
  'EmbalagemForm',
  'PreparoForm',
]);

function getPageTitle(navState) {
  if (!navState) return 'Painel Geral';
  const tabRoute = navState.routes?.[navState.index];
  if (!tabRoute) return 'Painel Geral';

  // Check nested stack
  const stackState = tabRoute.state;
  if (stackState) {
    let idx = stackState.index;
    let stackRoute = stackState.routes?.[idx];

    // If active route is a modal form, step back through the stack to find the underlying route
    while (stackRoute?.name && MODAL_FORM_ROUTES.has(stackRoute.name) && idx > 0) {
      idx--;
      stackRoute = stackState.routes[idx];
    }

    if (stackRoute?.name) {
      // Check if this route has a nested screen via params
      const nestedScreen = stackRoute.params?.screen;
      if (nestedScreen && ROUTE_TITLES[nestedScreen]) {
        return ROUTE_TITLES[nestedScreen];
      }
      return ROUTE_TITLES[stackRoute.name] || stackRoute.name;
    }
  }

  // Fallback: check params.screen for direct sidebar navigation
  const paramScreen = tabRoute.params?.screen || tabRoute.state?.routes?.[0]?.name;
  if (paramScreen && ROUTE_TITLES[paramScreen]) {
    return ROUTE_TITLES[paramScreen];
  }

  return ROUTE_TITLES[tabRoute.name] || tabRoute.name;
}

export default function WebHeader({ navigation, notifCount, onNotifPress }) {
  const { user, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);
  // Sessão UX — em viewports desktop estreitos (<1280) apertar padding e altura
  // para preservar área útil. WebHeader só monta em width >= 1024 (useResponsiveLayout).
  const { width } = useWindowDimensions();
  const isCompact = width < 1280;
  // Sessão 28.6 — tokens de densidade (compact=52 / comfortable=64)
  const { headerHeight, iconSize, isCompact: densityCompact } = useListDensity();
  const titleFontSize = densityCompact ? 16 : 18;
  const backIconSize = densityCompact ? 18 : 20;

  const navState = useNavigationState(s => s);
  const tabState = navState?.routes?.[navState.index]?.state;
  const title = getPageTitle(tabState);

  // Check if current stack has screens to go back to
  const tabRoute = tabState?.routes?.[tabState.index];
  const stackState = tabRoute?.state;
  const activeStackRoute = stackState?.routes?.[stackState?.index];
  const isModalFormActive = activeStackRoute?.name && MODAL_FORM_ROUTES.has(activeStackRoute.name);
  // Don't show back arrow when a modal form is on top — modal has its own close button
  const canGoBack = stackState && stackState.index > 0 && !isModalFormActive;

  // Map child screens to their parent tab + screen
  const PARENT_SCREENS = {
    // Ferramentas sub-screens
    'ContaSeguranca': { tab: 'Mais', screen: 'Configuracoes' },
    'Perfil': { tab: 'Mais', screen: 'Configuracoes' },
    'KitInicio': { tab: 'Mais', screen: 'Configuracoes' },
    'Sobre': { tab: 'Mais', screen: 'Configuracoes' },
    'BCGProdutoForm': { tab: 'Mais', screen: 'MatrizBCG' },
    'DeliveryPlataformas': { tab: 'Mais', screen: 'DeliveryHub' },
    'DeliveryPrecos': { tab: 'Mais', screen: 'DeliveryHub' },
    'DeliveryProdutosScreen': { tab: 'Mais', screen: 'DeliveryHub' },
    'SimuladorLote': { tab: 'Mais', screen: 'DeliveryHub' },
    // Form screens inside tab stacks
    'ProdutoForm': { tab: 'Produtos', screen: 'ProdutosList' },
    'ProdutoFormHome': { tab: 'Início', screen: 'HomeMain' },
    'CombosScreen': { tab: 'Produtos', screen: 'ProdutosList' },
    'DeliveryCombosScreen': { tab: 'Produtos', screen: 'ProdutosList' },
    'MateriaPrimaForm': { tab: 'Insumos', screen: 'MateriasPrimas' },
    'EmbalagemForm': { tab: 'Embalagens', screen: 'Embalagens' },
    'PreparoForm': { tab: 'Preparos', screen: 'Preparos' },
    'MargemBaixa': { tab: 'Início', screen: 'HomeMain' },
    'Fornecedores': { tab: 'Mais', screen: 'Fornecedores' },
    'Suporte': { tab: 'Mais', screen: 'Suporte' },
    'ComparativoCanais': { tab: 'Mais', screen: 'DeliveryHub' },
    'Termos': { tab: 'Mais', screen: 'Configuracoes' },
    'Privacidade': { tab: 'Mais', screen: 'Configuracoes' },
    // Estoque (modo avançado) — sub-telas voltam para Insumos onde o saldo
    // é exibido inline quando flag.modo_avancado_estoque está ativa.
    'EntradaEstoque': { tab: 'Insumos', screen: 'MateriasPrimas' },
    'AjusteEstoque': { tab: 'Insumos', screen: 'MateriasPrimas' },
  };

  // Check if current screen has a returnTo param or a known parent
  const currentStackRoute = stackState?.routes?.[stackState?.index];
  // Fallback: if no stack state, check if the tab route itself has nested params
  const currentScreenName = currentStackRoute?.name || tabRoute?.state?.routes?.[0]?.name || tabRoute?.params?.screen;
  const returnTo = isModalFormActive ? null : (currentStackRoute?.params?.returnTo || currentStackRoute?.params?.params?.returnTo || tabRoute?.params?.params?.returnTo);
  const parentScreen = isModalFormActive ? null : PARENT_SCREENS[currentScreenName];

  function handleGoBack() {
    // 1. Check returnTo param (passed when navigating from another context)
    if (returnTo) {
      const returnParent = PARENT_SCREENS[returnTo];
      if (returnParent) {
        navigation.navigate(returnParent.tab, { screen: returnTo });
      } else {
        // Try navigating directly to the returnTo screen in current tab
        try { navigation.navigate(returnTo); } catch(e) {
          navigation.navigate('Início', { screen: 'HomeMain' });
        }
      }
      return;
    }
    // 2. Use explicit parent mapping — always reliable on web
    if (parentScreen && parentScreen.tab && parentScreen.screen) {
      navigation.navigate(parentScreen.tab, { screen: parentScreen.screen });
      return;
    }
    // 3. Last resort
    navigation.navigate('Início', { screen: 'HomeMain' });
  }

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'US';

  return (
    <View style={[styles.container, { height: headerHeight, paddingHorizontal: isCompact ? spacing.md : 24 }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
        {(canGoBack || parentScreen || returnTo) && Platform.OS === 'web' && (
          <div
            onClick={handleGoBack}
            role="button"
            aria-label="Voltar"
            style={{
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 44, height: 44, borderRadius: 22,
            }}
          >
            <Feather name="arrow-left" size={backIconSize} color="#fff" />
          </div>
        )}
        <Text style={[styles.title, { fontSize: titleFontSize }]} numberOfLines={1}>{title}</Text>
      </View>

      <View style={styles.actions}>
        {/* Notifications */}
        {notifCount > 0 && (
          <TouchableOpacity style={styles.iconBtn} onPress={onNotifPress} activeOpacity={0.7}>
            <Feather name="bell" size={20} color="#fff" />
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{notifCount > 9 ? '9+' : notifCount}</Text>
            </View>
          </TouchableOpacity>
        )}

        {/* User avatar */}
        {Platform.OS === 'web' ? (
          <div
            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
            style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', border: '1.5px solid rgba(255,255,255,0.4)',
              userSelect: 'none', position: 'relative', zIndex: 10000,
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: '#fff', pointerEvents: 'none' }}>{initials}</span>
          </div>
        ) : (
          <TouchableOpacity style={styles.avatar} onPress={() => setShowMenu(!showMenu)} activeOpacity={0.7}>
            <Text style={styles.avatarText}>{initials}</Text>
          </TouchableOpacity>
        )}

        {/* Dropdown menu */}
        {showMenu && Platform.OS === 'web' && (
          <div style={{
            position: 'fixed', top: 52, right: 24, zIndex: 99999,
            backgroundColor: '#fff', borderRadius: 12, border: `1px solid ${colors.border}`,
            padding: '8px 0', width: 220, userSelect: 'none',
            boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
          }}>
            <div style={{ padding: '8px 16px', fontSize: 12, color: colors.textSecondary, borderBottom: `1px solid ${colors.border}`, marginBottom: 4 }}>
              {user?.email}
            </div>
            <div onClick={() => { setShowMenu(false); navigation.navigate('Início', { screen: 'Perfil' }); }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', gap: 10 }}>
              <Feather name="user" size={16} color={colors.text} />
              <span style={{ fontSize: 14, color: colors.text, fontFamily: 'DM Sans' }}>Meu Perfil</span>
            </div>
            <div onClick={() => { setShowMenu(false); navigation.navigate('Mais', { screen: 'Configuracoes' }); }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', gap: 10 }}>
              <Feather name="settings" size={16} color={colors.text} />
              <span style={{ fontSize: 14, color: colors.text, fontFamily: 'DM Sans' }}>Configurações</span>
            </div>
            <div style={{ height: 1, backgroundColor: colors.border, margin: '4px 0' }} />
            <div onClick={() => { setShowMenu(false); signOut(); }}
              style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', padding: '10px 16px', cursor: 'pointer', gap: 10 }}>
              <Feather name="log-out" size={16} color={colors.error} />
              <span style={{ fontSize: 14, color: colors.error, fontFamily: 'DM Sans' }}>Sair</span>
            </div>
          </div>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 56,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    overflow: 'visible',
    zIndex: 100,
  },
  title: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    fontFamily: fontFamily.semiBold,
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    position: 'relative',
    zIndex: 9999,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#fff',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  avatarText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  dropdown: {
    position: 'absolute',
    top: 44,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    width: 220,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    zIndex: 999,
  },
  dropdownEmail: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: 4,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  dropdownLabel: {
    fontSize: 14,
    color: colors.text,
    fontFamily: fontFamily.medium,
  },
  dropdownDivider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
});
