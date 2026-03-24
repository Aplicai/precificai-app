import React, { useState, useCallback, useEffect, useRef } from 'react';
import { NavigationContainer, CommonActions, StackActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, Image, Platform, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import WebLayout from '../components/web/WebLayout';
import { getFinanceiroStatus } from '../utils/financeiroStatus';
import { getSetupStatus } from '../utils/setupStatus';
import { useAuth } from '../contexts/AuthContext';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import HomeScreen from '../screens/HomeScreen';
import OnboardingScreen from '../screens/OnboardingScreen';
import ConfiguracaoScreen from '../screens/ConfiguracaoScreen';
import ConfiguracoesScreen from '../screens/ConfiguracoesScreen';
import MateriasPrimasScreen from '../screens/MateriasPrimasScreen';
import MateriaPrimaFormScreen from '../screens/MateriaPrimaFormScreen';
import EmbalagensScreen from '../screens/EmbalagensScreen';
import EmbalagemFormScreen from '../screens/EmbalagemFormScreen';
import PreparosScreen from '../screens/PreparosScreen';
import PreparoFormScreen from '../screens/PreparoFormScreen';
import ProdutosListScreen from '../screens/ProdutosListScreen';
import ProdutoFormScreen from '../screens/ProdutoFormScreen';
import MatrizBCGScreen from '../screens/MatrizBCGScreen';
import DeliveryHubScreen from '../screens/DeliveryHubScreen';
import DeliveryPlataformasScreen from '../screens/DeliveryPlataformasScreen';
import DeliveryPrecosScreen from '../screens/DeliveryPrecosScreen';
import DeliveryProdutosScreen from '../screens/DeliveryProdutosScreen';
import DeliveryCombosScreen from '../screens/DeliveryCombosScreen';
import DeliveryAdicionaisScreen from '../screens/DeliveryAdicionaisScreen';
import MaisScreen from '../screens/MaisScreen';
import AtualizarPrecosScreen from '../screens/AtualizarPrecosScreen';
import SimuladorScreen from '../screens/SimuladorScreen';
import MetaVendasScreen from '../screens/MetaVendasScreen';
import RelatorioSimplesScreen from '../screens/RelatorioSimplesScreen';
import FornecedoresScreen from '../screens/FornecedoresScreen';
import ListaComprasScreen from '../screens/ListaComprasScreen';
import KitInicioScreen from '../screens/KitInicioScreen';
import SobreScreen from '../screens/SobreScreen';
import PerfilScreen from '../screens/PerfilScreen';
import MargemBaixaScreen from '../screens/MargemBaixaScreen';
import ExportPDFScreen from '../screens/ExportPDFScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

const screenOptions = ({ navigation }) => {
  // Only show back button if this stack has screens to go back to
  const state = navigation.getState();
  const canGoBackInStack = state && state.index > 0;
  // On desktop web, hide stack headers (WebHeader handles title/nav)
  const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 1024;
  if (isDesktopWeb) {
    return {
      headerShown: false,
      gestureEnabled: true,
      gestureDirection: 'horizontal',
      fullScreenGestureEnabled: true,
    };
  }
  return {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: colors.textLight,
  headerTitleStyle: { fontWeight: '600', fontFamily: fontFamily.bold },
  headerBackButtonDisplayMode: 'minimal',
  headerBlurEffect: undefined,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  headerBackTitleVisible: false,
  headerBackVisible: false,
  headerLeft: canGoBackInStack ? () => (
    <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginLeft: 8, padding: 6 }} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
      <Feather name="chevron-left" size={20} color="#fff" />
    </TouchableOpacity>
  ) : undefined,
  headerRight: () => (
    <Image
      source={require('../../assets/images/logo-header-white.png')}
      style={{ width: 150, height: 32, marginRight: 4 }}
      resizeMode="contain"
    />
  ),
};
};

const TAB_ICONS = {
  'Início':     { set: 'feather', name: 'home' },
  'Insumos':    { set: 'material', name: 'food-apple-outline' },
  'Embalagens': { set: 'feather', name: 'package' },
  'Preparos':   { set: 'material', name: 'pot-steam-outline' },
  'Produtos':   { set: 'feather', name: 'box' },
  'Ferramentas': { set: 'feather', name: 'menu' },
};

function TabIcon({ label, focused, badge }) {
  const iconDef = TAB_ICONS[label] || { set: 'feather', name: 'file' };
  const size = focused ? 20 : 18;
  const color = focused ? colors.primary : colors.textSecondary;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {focused && (
        <View style={{
          position: 'absolute', top: -3, width: 26, height: 26, borderRadius: 13,
          backgroundColor: colors.primary + '08',
        }} />
      )}
      {iconDef.set === 'material' ? (
        <MaterialCommunityIcons name={iconDef.name} size={size} color={color} />
      ) : (
        <Feather name={iconDef.name} size={size} color={color} />
      )}
      {badge && (
        <View style={{
          position: 'absolute', top: -3, right: -6,
          width: 9, height: 9, borderRadius: 5,
          backgroundColor: colors.error,
          borderWidth: 1.5, borderColor: colors.surface,
        }} />
      )}
    </View>
  );
}

function HomeStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="HomeMain" component={HomeScreen} options={{
        header: () => null, // Custom header rendered inside HomeScreen
      }} />
      <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Meu Perfil' }} />
      <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
      <Stack.Screen name="MargemBaixa" component={MargemBaixaScreen} options={{ title: 'Margem Baixa' }} />
      <Stack.Screen name="ProdutoFormHome" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
    </Stack.Navigator>
  );
}

function ProdutosStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ProdutosList" component={ProdutosListScreen} options={{ title: 'Produtos' }} />
      <Stack.Screen name="ProdutoForm" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
      <Stack.Screen name="CombosScreen" component={DeliveryCombosScreen} options={{ title: 'Combos' }} />
      <Stack.Screen name="MateriaPrimaForm" component={MateriaPrimaFormScreen} options={{ title: 'Novo Insumo' }} />
      <Stack.Screen name="PreparoForm" component={PreparoFormScreen} options={{ title: 'Novo Preparo' }} />
      <Stack.Screen name="EmbalagemForm" component={EmbalagemFormScreen} options={{ title: 'Nova Embalagem' }} />
    </Stack.Navigator>
  );
}

function InsumosStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MateriasPrimas" component={MateriasPrimasScreen} options={{ title: 'Insumos' }} />
      <Stack.Screen name="MateriaPrimaForm" component={MateriaPrimaFormScreen} options={{ title: 'Insumo' }} />
    </Stack.Navigator>
  );
}

function EmbalagensStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Embalagens" component={EmbalagensScreen} options={{ title: 'Embalagens' }} />
      <Stack.Screen name="EmbalagemForm" component={EmbalagemFormScreen} options={{ title: 'Embalagem' }} />
    </Stack.Navigator>
  );
}

function PreparosStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="Preparos" component={PreparosScreen} options={{ title: 'Preparos' }} />
      <Stack.Screen name="PreparoForm" component={PreparoFormScreen} options={{ title: 'Preparo' }} />
      <Stack.Screen name="MateriaPrimaForm" component={MateriaPrimaFormScreen} options={{ title: 'Novo Insumo' }} />
    </Stack.Navigator>
  );
}

function BCGStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MatrizBCG" component={MatrizBCGScreen} options={{ title: 'Engenharia de Cardápio' }} />
      <Stack.Screen name="BCGProdutoForm" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
    </Stack.Navigator>
  );
}

function DeliveryStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="DeliveryHub" component={DeliveryHubScreen} options={{ title: 'Delivery' }} />
      <Stack.Screen name="DeliveryPlataformas" component={DeliveryPlataformasScreen} options={{ title: 'Plataformas' }} />
      <Stack.Screen name="DeliveryPrecos" component={DeliveryPrecosScreen} options={{ title: 'Precificação' }} />
      <Stack.Screen name="DeliveryProdutosScreen" component={DeliveryProdutosScreen} options={{ title: 'Produtos Delivery' }} />
      <Stack.Screen name="DeliveryAdicionaisScreen" component={DeliveryAdicionaisScreen} options={{ title: 'Adicionais' }} />
    </Stack.Navigator>
  );
}

function FinanceiroStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="FinanceiroMain" component={ConfiguracaoScreen} options={{ title: 'Financeiro' }} />
    </Stack.Navigator>
  );
}

function MaisStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="MaisMain" component={MaisScreen} options={{ title: 'Ferramentas' }} />
      <Stack.Screen name="FinanceiroMain" component={ConfiguracaoScreen} options={{ title: 'Financeiro' }} />
      <Stack.Screen name="MatrizBCG" component={MatrizBCGScreen} options={{ title: 'Engenharia de Cardápio' }} />
      <Stack.Screen name="BCGProdutoForm" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
      <Stack.Screen name="DeliveryHub" component={DeliveryHubScreen} options={{ title: 'Delivery' }} />
      <Stack.Screen name="DeliveryPlataformas" component={DeliveryPlataformasScreen} options={{ title: 'Plataformas' }} />
      <Stack.Screen name="DeliveryPrecos" component={DeliveryPrecosScreen} options={{ title: 'Precificação' }} />
      <Stack.Screen name="DeliveryProdutosScreen" component={DeliveryProdutosScreen} options={{ title: 'Produtos Delivery' }} />
      <Stack.Screen name="DeliveryAdicionaisScreen" component={DeliveryAdicionaisScreen} options={{ title: 'Adicionais' }} />
      <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
      <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Meu Perfil' }} />
      <Stack.Screen name="AtualizarPrecos" component={AtualizarPrecosScreen} options={{ title: 'Atualizar Preços' }} />
      <Stack.Screen name="Simulador" component={SimuladorScreen} options={{ title: 'Simulador E se?' }} />
      <Stack.Screen name="MetaVendas" component={MetaVendasScreen} options={{ title: 'Quanto Preciso Vender?' }} />
      <Stack.Screen name="RelatorioSimples" component={RelatorioSimplesScreen} options={{ title: 'Relatório Simplificado' }} />
      <Stack.Screen name="Fornecedores" component={FornecedoresScreen} options={{ title: 'Comparar Fornecedores' }} />
      <Stack.Screen name="ListaCompras" component={ListaComprasScreen} options={{ title: 'Lista de Compras' }} />
      <Stack.Screen name="KitInicio" component={KitInicioScreen} options={{ title: 'Kit de Início' }} />
      <Stack.Screen name="Sobre" component={SobreScreen} options={{ title: 'Sobre o App' }} />
      <Stack.Screen name="ExportPDF" component={ExportPDFScreen} options={{ title: 'Exportar PDF' }} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  const [finPendente, setFinPendente] = useState(false);
  const { isDesktop } = useResponsiveLayout();

  const checkFinanceiro = useCallback(() => {
    getFinanceiroStatus().then(s => setFinPendente(!s.completo)).catch(() => {});
  }, []);

  const tabNavigator = (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} badge={route.name === 'Ferramentas' && finPendente} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          ...(isDesktop ? { display: 'none' } : {}),
          height: Platform.OS === 'ios' ? 86 : 62,
          paddingBottom: Platform.OS === 'ios' ? 28 : 8,
          paddingTop: 6,
          backgroundColor: colors.surface,
          borderTopWidth: 1, borderTopColor: colors.border + '80',
          ...Platform.select({
            web: { boxShadow: '0 -2px 12px rgba(0,77,71,0.06)' },
            default: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 8 },
          }),
        },
        tabBarLabelStyle: { fontSize: 8, fontWeight: '600', fontFamily: fontFamily.semiBold, marginTop: 1 },
      })}
      screenListeners={({ navigation, route }) => ({
        state: checkFinanceiro,
        tabPress: (e) => {
          const state = navigation.getState();
          const currentRoute = state.routes.find(r => r.name === route.name);
          if (currentRoute?.state?.index > 0) {
            e.preventDefault();
            navigation.navigate(route.name);
            setTimeout(() => {
              navigation.dispatch(StackActions.popToTop());
            }, 50);
          }
        },
      })}
    >
      <Tab.Screen name="Início" component={HomeStack} />
      <Tab.Screen name="Insumos" component={InsumosStack} />
      <Tab.Screen name="Preparos" component={PreparosStack} />
      <Tab.Screen name="Embalagens" component={EmbalagensStack} />
      <Tab.Screen name="Produtos" component={ProdutosStack} />
      <Tab.Screen name="Ferramentas" component={MaisStack} />
    </Tab.Navigator>
  );

  if (isDesktop) {
    return <WebLayout>{tabNavigator}</WebLayout>;
  }

  return tabNavigator;
}

const AuthStack = createNativeStackNavigator();

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function AppContent() {
  const [initialRoute, setInitialRoute] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => setInitialRoute('MainTabs'), 5000);
    checkInitialRoute().then(route => {
      clearTimeout(timeout);
      setInitialRoute(route);
    }).catch(() => {
      clearTimeout(timeout);
      setInitialRoute('MainTabs');
    });
    return () => clearTimeout(timeout);
  }, []);

  async function checkInitialRoute() {
    try {
      const { getDatabase } = require('../database/database');
      const db = await getDatabase();
      // Check if profile is filled
      const perfil = await db.getFirstAsync('SELECT * FROM perfil LIMIT 1');
      if (!perfil || !perfil.nome_negocio || perfil.nome_negocio.trim() === '') {
        return 'ProfileSetup';
      }
      // Check financeiro
      const status = await getSetupStatus();
      return status.financeiroCompleto ? 'MainTabs' : 'Onboarding';
    } catch {
      return 'MainTabs';
    }
  }

  if (!initialRoute) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {initialRoute === 'ProfileSetup' && (
        <RootStack.Screen name="ProfileSetup" component={PerfilScreen} options={{
          ...screenOptions, headerShown: true, title: 'Perfil do Negócio',
        }} />
      )}
      {(initialRoute === 'Onboarding' || initialRoute === 'ProfileSetup') && (
        <RootStack.Screen name="KitInicio" component={KitInicioScreen} options={{
          ...screenOptions, headerShown: true, title: 'Kit de Início',
        }} />
      )}
      {(initialRoute === 'Onboarding' || initialRoute === 'ProfileSetup') && (
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{
          ...screenOptions, headerShown: true, title: 'Configuração Inicial',
        }} />
      )}
      <RootStack.Screen name="MainTabs" component={MainTabs} />
      {initialRoute === 'MainTabs' && (
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{
          ...screenOptions, headerShown: true, title: 'Configuração Inicial',
        }} />
      )}
    </RootStack.Navigator>
  );
}

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <AppContent /> : <AuthNavigator />}
    </NavigationContainer>
  );
}
