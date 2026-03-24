import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNavigationState } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { colors, spacing, fontFamily, webLayout } from '../../utils/theme';

const ROUTE_TITLES = {
  'Início': 'Painel Geral',
  'HomeMain': 'Painel Geral',
  'Insumos': 'Insumos',
  'MateriasPrimasMain': 'Insumos',
  'MateriasPrimasForm': 'Editar Insumo',
  'Preparos': 'Preparos',
  'PreparosMain': 'Preparos',
  'PreparoForm': 'Editar Preparo',
  'Embalagens': 'Embalagens',
  'EmbalagensMain': 'Embalagens',
  'EmbalagemForm': 'Editar Embalagem',
  'Produtos': 'Produtos',
  'ProdutosMain': 'Produtos',
  'ProdutoForm': 'Editar Produto',
  'Ferramentas': 'Ferramentas',
  'MaisMain': 'Ferramentas',
  'FinanceiroMain': 'Financeiro',
  'DeliveryHub': 'Delivery',
  'DeliveryProdutosScreen': 'Produtos Delivery',
  'DeliveryAdicionaisScreen': 'Adicionais Delivery',
  'DeliveryPlataformas': 'Plataformas Delivery',
  'DeliveryPrecos': 'Precificação Delivery',
  'MatrizBCG': 'Engenharia de Cardápio',
  'AtualizarPrecos': 'Atualizar Preços',
  'Simulador': 'Simulador E se?',
  'MetaVendas': 'Quanto Preciso Vender?',
  'RelatorioSimples': 'Relatório Simplificado',
  'Fornecedores': 'Comparar Fornecedores',
  'ListaCompras': 'Lista de Compras',
  'KitInicio': 'Kit de Início Rápido',
  'ExportPDF': 'Exportar PDF',
  'Sobre': 'Sobre o App',
  'ContaSeguranca': 'Conta e Segurança',
  'KitInicio': 'Kit de Início',
  'Configuracoes': 'Configurações',
  'Perfil': 'Meu Perfil',
};

function getPageTitle(navState) {
  if (!navState) return 'Painel Geral';
  const tabRoute = navState.routes?.[navState.index];
  if (!tabRoute) return 'Painel Geral';

  // Check nested stack
  const stackState = tabRoute.state;
  if (stackState) {
    const stackRoute = stackState.routes?.[stackState.index];
    if (stackRoute?.name) {
      return ROUTE_TITLES[stackRoute.name] || stackRoute.name;
    }
  }

  return ROUTE_TITLES[tabRoute.name] || tabRoute.name;
}

export default function WebHeader({ navigation, notifCount, onNotifPress }) {
  const { user, signOut } = useAuth();
  const [showMenu, setShowMenu] = useState(false);

  const navState = useNavigationState(s => s);
  const tabState = navState?.routes?.[navState.index]?.state;
  const title = getPageTitle(tabState);

  // Check if current stack has screens to go back to
  const tabRoute = tabState?.routes?.[tabState.index];
  const stackState = tabRoute?.state;
  const canGoBack = stackState && stackState.index > 0;

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'US';

  return (
    <View style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {canGoBack && Platform.OS === 'web' && (
          <div
            onClick={() => navigation.goBack()}
            style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}
          >
            <Feather name="arrow-left" size={20} color="#fff" />
          </div>
        )}
        <Text style={styles.title}>{title}</Text>
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
            <div onClick={() => { setShowMenu(false); navigation.navigate('Ferramentas', { screen: 'Configuracoes' }); }}
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
    fontSize: 18,
    fontFamily: fontFamily.semiBold,
    color: '#fff',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    position: 'relative',
    zIndex: 9999,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
