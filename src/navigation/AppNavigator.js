import React, { useState, useCallback, useEffect, useRef } from 'react';
import { NavigationContainer, CommonActions, StackActions } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text, View, Image, Platform, TouchableOpacity, ActivityIndicator, Dimensions } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, fontFamily } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useListDensity from '../hooks/useListDensity';
import WebLayout from '../components/web/WebLayout';
import FinanceiroPendenteBanner from '../components/FinanceiroPendenteBanner';
import PrecosZeradosBanner from '../components/PrecosZeradosBanner';
import { getFinanceiroStatus } from '../utils/financeiroStatus';
import { getSetupStatus } from '../utils/setupStatus';
import { determineInitialRoute, determineInitialRouteSafe } from '../utils/initialRoute';
import { useAuth } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';

import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import ForgotPasswordScreen from '../screens/ForgotPasswordScreen';
import ResetPasswordScreen from '../screens/ResetPasswordScreen';
// Sessão 28.8 — LandingScreen NÃO é importada porque a landing fica em
// projeto Vercel separado (`precificai-site` em precificaiapp.com).
// Este app vive em app.precificaiapp.com e abre direto em Login/Register.
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
import MaisScreen from '../screens/MaisScreen';
import AtualizarPrecosScreen from '../screens/AtualizarPrecosScreen';
import SimuladorScreen from '../screens/SimuladorScreen';
// APP-28: simulador em lote (todos produtos × todas plataformas em uma tela)
import SimuladorLoteScreen from '../screens/SimuladorLoteScreen';
// Sessão 28.40: RelatorioSimples e RelatorioInsumos foram unificados em RelatoriosHub.
// Imports legados removidos — RelatoriosHubScreen importa os dois internamente.
import RelatoriosHubScreen from '../screens/RelatoriosHubScreen';
import FornecedoresScreen from '../screens/FornecedoresScreen';
import PrecosPlataformaScreen from '../screens/PrecosPlataformaScreen';
import SimulacaoProdutoScreen from '../screens/SimulacaoProdutoScreen';
import ListaComprasScreen from '../screens/ListaComprasScreen';
import KitInicioScreen from '../screens/KitInicioScreen';
import WelcomeTourScreen from '../screens/WelcomeTourScreen';
import SobreScreen from '../screens/SobreScreen';
import ContaSegurancaScreen from '../screens/ContaSegurancaScreen';
import PerfilScreen from '../screens/PerfilScreen';
import MargemBaixaScreen from '../screens/MargemBaixaScreen';
import ExportPDFScreen from '../screens/ExportPDFScreen';
import SuporteScreen from '../screens/SuporteScreen';
import EntradaEstoqueScreen from '../screens/EntradaEstoqueScreen';
import AjusteEstoqueScreen from '../screens/AjusteEstoqueScreen';
import NotificacoesScreen from '../screens/NotificacoesScreen';
import ComparativoCanaisScreen from '../screens/ComparativoCanaisScreen';
import TermosScreen from '../screens/TermosScreen';
import PrivacidadeScreen from '../screens/PrivacidadeScreen';
// Feature beta — só visível pra emails com whitelist + toggle ativo (ver useFeatureFlags).
import FluxoCaixaDREScreen from '../screens/FluxoCaixaDREScreen';


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
  // Sessão UX — title 17/600 com fonte semiBold para hierarquia mobile consistente.
  headerTitleStyle: { fontSize: 17, fontWeight: '600', fontFamily: fontFamily.semiBold || fontFamily.bold },
  headerBackButtonDisplayMode: 'minimal',
  headerBlurEffect: undefined,
  gestureEnabled: true,
  gestureDirection: 'horizontal',
  fullScreenGestureEnabled: true,
  headerBackTitleVisible: false,
  headerBackVisible: false,
  // Sessão UX — back button 44x44 (WCAG) com hitSlop adicional.
  headerLeft: canGoBackInStack ? () => (
    <TouchableOpacity
      onPress={() => navigation.goBack()}
      style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 0 }}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel="Voltar"
    >
      <Feather name="chevron-left" size={22} color="#fff" />
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
  'Mais': { set: 'feather', name: 'menu' },
};

function TabIcon({ label, focused, badge, baseSize }) {
  const iconDef = TAB_ICONS[label] || { set: 'feather', name: 'file' };
  // Sessão 28.6 — usa token iconSize do useListDensity (compact=18, comfortable=22).
  // baseSize default 22 mantém retrocompatibilidade.
  const fallbackBase = baseSize ?? 22;
  const size = focused ? fallbackBase : fallbackBase - 2;
  const color = focused ? colors.primary : colors.textSecondary;

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      {/* Polish — indicador ativo reforçado: barra superior colorida + halo circular */}
      {focused && (
        <View style={{
          position: 'absolute', top: -10, width: 24, height: 3,
          borderRadius: 2, backgroundColor: colors.primary,
        }} />
      )}
      {focused && (
        <View style={{
          position: 'absolute', top: -3, width: 30, height: 30, borderRadius: 15,
          backgroundColor: colors.primary + '1A',
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

// Sessão 28.9 — Wrapper que adiciona o FinanceiroPendenteBanner global acima
// do Stack. Com isso o banner aparece em TODAS as telas dentro de cada tab,
// sem precisar editar cada screen individualmente.
function StackWithBanner({ children }) {
  return (
    <View style={{ flex: 1 }}>
      <FinanceiroPendenteBanner />
      <PrecosZeradosBanner />
      {children}
    </View>
  );
}

function HomeStack() {
  return (
    <StackWithBanner>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="HomeMain" component={HomeScreen} options={{
          header: () => null, // Custom header rendered inside HomeScreen
        }} />
        <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Meu Perfil' }} />
        <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
        <Stack.Screen name="MargemBaixa" component={MargemBaixaScreen} options={{ title: 'Margem Baixa' }} />
        <Stack.Screen name="ProdutoFormHome" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
      </Stack.Navigator>
    </StackWithBanner>
  );
}

function ProdutosStack() {
  return (
    <StackWithBanner>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="ProdutosList" component={ProdutosListScreen} options={({ navigation }) => ({ title: 'Produtos', ...backToHomeOption(navigation) })} />
        <Stack.Screen name="ProdutoForm" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
        <Stack.Screen name="CombosScreen" component={DeliveryCombosScreen} options={{ title: 'Combos' }} />
        <Stack.Screen name="MateriaPrimaForm" component={MateriaPrimaFormScreen} options={{ title: 'Novo Insumo', presentation: 'transparentModal', headerShown: false }} />
        <Stack.Screen name="PreparoForm" component={PreparoFormScreen} options={{ title: 'Novo Preparo', presentation: 'transparentModal', headerShown: false }} />
        <Stack.Screen name="EmbalagemForm" component={EmbalagemFormScreen} options={{ title: 'Nova Embalagem', presentation: 'transparentModal', headerShown: false }} />
      </Stack.Navigator>
    </StackWithBanner>
  );
}

// Back-to-home button for root screens of non-Home tabs
function backToHomeOption(navigation) {
  const isDesktopWeb = Platform.OS === 'web' && Dimensions.get('window').width >= 1024;
  if (isDesktopWeb) return {};
  return {
    headerLeft: () => (
      <TouchableOpacity
        onPress={() => {
          const parent = navigation.getParent();
          if (parent) parent.navigate('Início');
        }}
        style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: 0 }}
        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
        accessibilityRole="button"
        accessibilityLabel="Voltar para o início"
      >
        <Feather name="chevron-left" size={22} color="#fff" />
      </TouchableOpacity>
    ),
  };
}

function InsumosStack() {
  return (
    <StackWithBanner>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="MateriasPrimas" component={MateriasPrimasScreen} options={({ navigation }) => ({ title: 'Insumos', ...backToHomeOption(navigation) })} />
        <Stack.Screen name="MateriaPrimaForm" component={MateriaPrimaFormScreen} options={{ title: 'Insumo', presentation: 'transparentModal', headerShown: false }} />
      </Stack.Navigator>
    </StackWithBanner>
  );
}

function EmbalagensStack() {
  return (
    <StackWithBanner>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Embalagens" component={EmbalagensScreen} options={({ navigation }) => ({ title: 'Embalagens', ...backToHomeOption(navigation) })} />
        <Stack.Screen name="EmbalagemForm" component={EmbalagemFormScreen} options={{ title: 'Embalagem', presentation: 'transparentModal', headerShown: false }} />
      </Stack.Navigator>
    </StackWithBanner>
  );
}

function PreparosStack() {
  return (
    <StackWithBanner>
      <Stack.Navigator screenOptions={screenOptions}>
        <Stack.Screen name="Preparos" component={PreparosScreen} options={({ navigation }) => ({ title: 'Preparos', ...backToHomeOption(navigation) })} />
        <Stack.Screen name="PreparoForm" component={PreparoFormScreen} options={{ title: 'Preparo', presentation: 'transparentModal', headerShown: false }} />
        <Stack.Screen name="MateriaPrimaForm" component={MateriaPrimaFormScreen} options={{ title: 'Novo Insumo', presentation: 'transparentModal', headerShown: false }} />
      </Stack.Navigator>
    </StackWithBanner>
  );
}

function BCGStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      {/* Sprint 1 Q4 — display "Ranking de Produtos". */}
      <Stack.Screen name="MatrizBCG" component={MatrizBCGScreen} options={{ title: 'Ranking de Produtos' }} />
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
      <Stack.Screen name="SimuladorLote" component={SimuladorLoteScreen} options={{ title: 'Simulador em lote' }} />
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

// Whitelist de screens do MaisStack que podem ser restauradas no refresh.
// Mantém só telas "pousáveis" (que o user pode estar consultando) — exclui
// forms modais e telas que dependem de params (ex.: BCGProdutoForm).
const RESTORABLE_MAIS_SCREENS = new Set([
  'MaisMain',
  'FinanceiroMain',
  'MatrizBCG',
  'DeliveryHub',
  'DeliveryPlataformas',
  'DeliveryPrecos',
  'DeliveryProdutosScreen',
  'SimuladorLote',
  'Configuracoes',
  'Perfil',
  'AtualizarPrecos',
  'Simulador',
  'Relatorios',
  'Fornecedores',
  'PrecosPlataforma',
  'SimulacaoProduto',
  'ListaCompras',
  'KitInicio',
  'Sobre',
  'ContaSeguranca',
  'ExportPDF',
  'Suporte',
  'Notificacoes',
  'Termos',
  'Privacidade',
  'FluxoCaixaDRE',
]);

// Sessão 28.X — Persistência do screen interno da tab Mais.
// Antes só persistíamos LAST_TAB_KEY (qual tab estava ativa). Refresh em
// /Configuracoes (que vive no MaisStack) abria o MaisMain (lista de
// Ferramentas), parecendo que a tela "não existia mais". Agora também
// persistimos o screen ativo dentro do MaisStack e usamos como
// initialRouteName via module-level var (lida no mount de MaisStack).
let __initialMaisScreen = 'MaisMain';

function MaisStack() {
  return (
    <StackWithBanner>
    <Stack.Navigator
      screenOptions={screenOptions}
      initialRouteName={RESTORABLE_MAIS_SCREENS.has(__initialMaisScreen) ? __initialMaisScreen : 'MaisMain'}
    >
      {/* Sprint 1 Q3 — display "Ferramentas" mas mantém route name "Mais" para preservar AsyncStorage LAST_TAB_KEY e refs cross-tab. */}
      <Stack.Screen name="MaisMain" component={MaisScreen} options={({ navigation }) => ({ title: 'Ferramentas', ...backToHomeOption(navigation) })} />
      <Stack.Screen name="FinanceiroMain" component={ConfiguracaoScreen} options={{ title: 'Financeiro' }} />
      {/* Sprint 1 Q4 — display "Ranking de Produtos" (route name MatrizBCG mantido). */}
      <Stack.Screen name="MatrizBCG" component={MatrizBCGScreen} options={{ title: 'Ranking de Produtos' }} />
      <Stack.Screen name="BCGProdutoForm" component={ProdutoFormScreen} options={{ title: 'Ficha Técnica' }} />
      <Stack.Screen name="DeliveryHub" component={DeliveryHubScreen} options={{ title: 'Delivery' }} />
      <Stack.Screen name="DeliveryPlataformas" component={DeliveryPlataformasScreen} options={{ title: 'Plataformas' }} />
      <Stack.Screen name="DeliveryPrecos" component={DeliveryPrecosScreen} options={{ title: 'Precificação' }} />
      <Stack.Screen name="DeliveryProdutosScreen" component={DeliveryProdutosScreen} options={{ title: 'Produtos Delivery' }} />
      <Stack.Screen name="SimuladorLote" component={SimuladorLoteScreen} options={{ title: 'Simulador em lote' }} />
      <Stack.Screen name="Configuracoes" component={ConfiguracoesScreen} options={{ title: 'Configurações' }} />
      <Stack.Screen name="Perfil" component={PerfilScreen} options={{ title: 'Meu Perfil' }} />
      <Stack.Screen name="AtualizarPrecos" component={AtualizarPrecosScreen} options={{ title: 'Atualizar Preços' }} />
      <Stack.Screen name="Simulador" component={SimuladorScreen} options={{ title: 'Simulador E se?' }} />
      {/* Sessão 28.40: Relatórios unificados em uma única página com tabs internas (Geral / Insumos).
          Rotas legadas (RelatorioSimples / RelatorioInsumos) removidas — usar `Relatorios` com param `aba`. */}
      <Stack.Screen name="Relatorios" component={RelatoriosHubScreen} options={{ title: 'Relatórios' }} />
      <Stack.Screen name="Fornecedores" component={FornecedoresScreen} options={{ title: 'Comparar Fornecedores' }} />
      <Stack.Screen name="PrecosPlataforma" component={PrecosPlataformaScreen} options={{ title: 'Preços por Plataforma' }} />
      <Stack.Screen name="SimulacaoProduto" component={SimulacaoProdutoScreen} options={{ title: 'Simulação de Preço' }} />
      <Stack.Screen name="ListaCompras" component={ListaComprasScreen} options={{ title: 'Lista de Compras' }} />
      <Stack.Screen name="KitInicio" component={KitInicioScreen} options={{ title: 'Kit de Início' }} />
      <Stack.Screen name="Sobre" component={SobreScreen} options={{ title: 'Sobre o App' }} />
      <Stack.Screen name="ContaSeguranca" component={ContaSegurancaScreen} options={{ title: 'Conta e Segurança' }} />
      <Stack.Screen name="ExportPDF" component={ExportPDFScreen} options={{ title: 'Fichas Técnicas' }} />
      <Stack.Screen name="Suporte" component={SuporteScreen} options={{ title: 'Suporte' }} />
      <Stack.Screen name="EntradaEstoque" component={EntradaEstoqueScreen} options={{ title: 'Entrada de Estoque', presentation: 'transparentModal', headerShown: false }} />
      <Stack.Screen name="AjusteEstoque" component={AjusteEstoqueScreen} options={{ title: 'Ajuste de Estoque', presentation: 'transparentModal', headerShown: false }} />
      <Stack.Screen name="Notificacoes" component={NotificacoesScreen} options={{ title: 'Notificações' }} />
      <Stack.Screen name="ComparativoCanais" component={ComparativoCanaisScreen} options={{ title: 'Comparativo Canais' }} />
      <Stack.Screen name="Termos" component={TermosScreen} options={{ title: 'Termos de Uso' }} />
      <Stack.Screen name="Privacidade" component={PrivacidadeScreen} options={{ title: 'Política de Privacidade' }} />
      <Stack.Screen name="FluxoCaixaDRE" component={FluxoCaixaDREScreen} options={{ title: 'Fluxo de Caixa + DRE' }} />
    </Stack.Navigator>
    </StackWithBanner>
  );
}

const LAST_TAB_KEY = 'precificai_last_tab';
const LAST_MAIS_SCREEN_KEY = 'precificai_last_mais_screen';
// Ordem segue o fluxo de composição (audit P1-08): Insumos→Preparos→Embalagens→Produtos.
const VALID_TABS = ['Início', 'Insumos', 'Preparos', 'Embalagens', 'Produtos', 'Mais'];

function MainTabs({ route }) {
  const savedTab = route.params?.initialTab;
  const [finPendente, setFinPendente] = useState(false);
  const { isDesktop, width } = useResponsiveLayout();
  // Sessão 28 — em telas estreitas (≤360pt) "Ferramentas" e "Embalagens" truncavam.
  // Encolher fonte e padding mantém label legível sem clip.
  const isNarrow = !isDesktop && width <= 360;
  // Sessão 28.6 — densidade aplicada à tabBar mobile (compact=60h/9pt, comfortable=70h/11pt).
  // No desktop o tabBar é hidden (display:none), preservamos comportamento atual.
  const { isCompact: densityCompact, iconSize: tabIconSize } = useListDensity();
  const tabBarHeightMobile = densityCompact ? 60 : 70;
  const tabBarFontSize = isNarrow ? 9 : (densityCompact ? 9 : 11);
  const tabFontSize = tabBarFontSize;

  const checkFinanceiro = useCallback(() => {
    getFinanceiroStatus().then(s => setFinPendente(!s.completo)).catch(() => {});
  }, []);

  const tabNavigator = (
    <Tab.Navigator
      initialRouteName={savedTab && VALID_TABS.includes(savedTab) ? savedTab : 'Início'}
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused }) => (
          <TabIcon label={route.name} focused={focused} badge={route.name === 'Mais' && finPendente} baseSize={tabIconSize} />
        ),
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          ...(isDesktop ? { display: 'none' } : {}),
          height: Platform.OS === 'ios' ? (tabBarHeightMobile + 22) : tabBarHeightMobile,
          paddingBottom: Platform.OS === 'ios' ? 28 : (densityCompact ? 6 : 8),
          paddingTop: densityCompact ? 6 : 8,
          backgroundColor: colors.surface,
          borderTopWidth: 1, borderTopColor: colors.border + '80',
          ...Platform.select({
            web: { boxShadow: '0 -2px 12px rgba(0,77,71,0.06)' },
            default: { shadowColor: colors.shadow, shadowOffset: { width: 0, height: -2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 8 },
          }),
        },
        tabBarLabelStyle: { fontSize: tabFontSize, fontWeight: '600', fontFamily: fontFamily.semiBold, marginTop: 2 },
        tabBarItemStyle: { paddingHorizontal: isNarrow ? 0 : 2 },
        tabBarAllowFontScaling: false,
      })}
      screenListeners={({ navigation, route }) => ({
        state: (e) => {
          checkFinanceiro();
          // Save last active tab
          const state = navigation.getState();
          const tabRoute = state?.routes?.[state.index];
          const currentTab = tabRoute?.name;
          if (currentTab && VALID_TABS.includes(currentTab)) {
            AsyncStorage.setItem(LAST_TAB_KEY, currentTab).catch(() => {});
          }
          // Sessão 28.X — também persistimos o screen ativo dentro do MaisStack
          // para que refresh em /Configuracoes, /AtualizarPrecos etc. restaure
          // exatamente a tela onde o user estava. Sem isso o user caía sempre
          // em MaisMain (lista de Ferramentas), parecendo "tela que sumiu".
          if (currentTab === 'Mais' && tabRoute?.state) {
            const innerStack = tabRoute.state;
            const innerScreen = innerStack?.routes?.[innerStack.index]?.name;
            if (innerScreen && RESTORABLE_MAIS_SCREENS.has(innerScreen)) {
              AsyncStorage.setItem(LAST_MAIS_SCREEN_KEY, innerScreen).catch(() => {});
            }
          }
        },
        // Sessão 28.60 — fix: ao tocar na tab Mais (ou qualquer outra) quando
        // o stack interno tem alguma tela empurrada (FinanceiroMain, Ranking, etc.),
        // o usuário esperava voltar pra MaisMain. Antes o popToTop em setTimeout
        // não estava funcionando confiavelmente. Agora navegamos explicitamente
        // pra screen inicial do stack via { screen: initialRouteName }.
        tabPress: (e) => {
          const state = navigation.getState();
          const tab = state.routes.find(r => r.name === route.name);
          if (tab?.state && tab.state.index > 0) {
            e.preventDefault();
            const initialScreen = tab.state.routeNames && tab.state.routeNames[0];
            if (initialScreen) {
              navigation.navigate(route.name, { screen: initialScreen });
            } else {
              navigation.navigate(route.name);
            }
          }
        },
      })}
    >
      {/*
        Ordem das tabs reorganizada (audit P1-08):
        Reflete o fluxo de composição do mais simples (insumo cru) ao mais
        composto (produto vendável):
          Insumos → Preparos (combina insumos) → Embalagens (wrapper) → Produtos (final)
        Antes Embalagens vinha antes de Preparos, o que sugeria que se embala
        um preparo — confundia o modelo mental do usuário.
      */}
      <Tab.Screen name="Início" component={HomeStack} />
      <Tab.Screen name="Insumos" component={InsumosStack} />
      <Tab.Screen name="Preparos" component={PreparosStack} />
      {/* Sessão UX — "Embalagens" tem 10 chars e trunca em telas estreitas; encurta para "Embal." em mobile. */}
      <Tab.Screen name="Embalagens" component={EmbalagensStack} options={{ tabBarLabel: !isDesktop ? 'Embal.' : 'Embalagens' }} />
      <Tab.Screen name="Produtos" component={ProdutosStack} />
      {/* Sprint 1 Q3 — tabBarLabel "Ferramentas" sem renomear route name (quebraria persistência). */}
      {/* Sessão 28 — Em mobile volta para "Mais" para evitar truncamento de "Ferramentas". */}
      <Tab.Screen name="Mais" component={MaisStack} options={{ tabBarLabel: !isDesktop ? 'Mais' : 'Ferramentas' }} />
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
      {/* Sessão 28.8 — Landing institucional vive em projeto Vercel separado
          (`precificai-site` em precificaiapp.com). O app abre direto em Login. */}
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
      <AuthStack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <AuthStack.Screen name="ResetPassword" component={ResetPasswordScreen} />
    </AuthStack.Navigator>
  );
}

function AppContent() {
  const [initialRoute, setInitialRoute] = useState(null);
  const [savedTab, setSavedTab] = useState(null);
  // F1-J1-03: erro de resolução de rota (ex.: getSetupStatus falhou).
  // Quando setado, exibimos uma tela de erro com retry antes de navegar
  // para evitar deixar o usuário num app vazio sem feedback.
  const [routeError, setRouteError] = useState(null);
  // attempt count força re-execução do effect quando o usuário clica retry.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setRouteError(null);
    setInitialRoute(null);
    const timeout = setTimeout(() => {
      if (!cancelled) setInitialRoute('MainTabs');
    }, 5000);
    determineInitialRouteSafe().then(({ route, routeError: err }) => {
      if (cancelled) return;
      clearTimeout(timeout);
      // Se houve erro de DB/setup status, NÃO navega ainda — mostra retry.
      if (err) {
        setRouteError(err);
        return;
      }
      setInitialRoute(route);
    }).catch((err) => {
      if (cancelled) return;
      clearTimeout(timeout);
      // Falha catastrófica: log + tela de erro.
      console.error('[AppContent.determineRoute]', err);
      setRouteError(err);
    });
    // Load last active tab
    AsyncStorage.getItem(LAST_TAB_KEY).then(tab => {
      if (tab && VALID_TABS.includes(tab)) setSavedTab(tab);
    }).catch(() => {});
    // Sessão 28.X — restaurar screen interno do MaisStack para que refresh
    // em telas como /Configuracoes não caia em MaisMain. O valor é lido pelo
    // MaisStack via module-level var no momento do mount (initialRouteName).
    AsyncStorage.getItem(LAST_MAIS_SCREEN_KEY).then(screen => {
      if (screen && RESTORABLE_MAIS_SCREENS.has(screen)) {
        __initialMaisScreen = screen;
      }
    }).catch(() => {});
    return () => { cancelled = true; clearTimeout(timeout); };
  }, [attempt]);

  // F1-J1-03: tela de erro com retry. Substitui o "splash em branco" antigo
  // que aparecia quando getSetupStatus falhava silenciosamente.
  if (routeError) {
    return (
      <View style={{
        flex: 1, backgroundColor: colors.background,
        justifyContent: 'center', alignItems: 'center', padding: 24,
      }}>
        <Feather name="alert-circle" size={36} color={colors.warning || colors.primary} />
        <Text style={{
          marginTop: 12, fontSize: 16, color: colors.text,
          textAlign: 'center', fontFamily: fontFamily.semiBold,
        }}>
          Não foi possível carregar seus dados
        </Text>
        <Text style={{
          marginTop: 6, fontSize: 13, color: colors.textSecondary,
          textAlign: 'center', maxWidth: 320, lineHeight: 18,
        }}>
          Verifique sua conexão e tente novamente. Se o problema continuar, fale com o suporte.
        </Text>
        <TouchableOpacity
          onPress={() => setAttempt(a => a + 1)}
          activeOpacity={0.8}
          style={{
            marginTop: 20, backgroundColor: colors.primary,
            paddingVertical: 10, paddingHorizontal: 24, borderRadius: 8,
          }}
          accessibilityRole="button"
          accessibilityLabel="Tentar novamente"
        >
          <Text style={{ color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 14 }}>
            Tentar novamente
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!initialRoute) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  return (
    <RootStack.Navigator initialRouteName={initialRoute} screenOptions={{ headerShown: false }}>
      {initialRoute === 'WelcomeTour' && (
        <RootStack.Screen name="WelcomeTour" component={WelcomeTourScreen} />
      )}
      {(initialRoute === 'WelcomeTour' || initialRoute === 'ProfileSetup') && (
        <RootStack.Screen name="ProfileSetup" component={PerfilScreen} options={{
          ...screenOptions, headerShown: true, title: 'Perfil do Negócio',
        }} />
      )}
      {(initialRoute === 'WelcomeTour' || initialRoute === 'Onboarding' || initialRoute === 'ProfileSetup') && (
        <RootStack.Screen name="KitInicio" component={KitInicioScreen} options={{
          ...screenOptions, headerShown: true, title: 'Kit de Início',
        }} />
      )}
      {(initialRoute === 'WelcomeTour' || initialRoute === 'Onboarding' || initialRoute === 'ProfileSetup') && (
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{
          ...screenOptions, headerShown: true, title: 'Configuração Inicial',
        }} />
      )}
      <RootStack.Screen name="MainTabs" component={MainTabs} initialParams={{ initialTab: savedTab }} />
      {initialRoute === 'MainTabs' && (
        <RootStack.Screen name="Onboarding" component={OnboardingScreen} options={{
          ...screenOptions, headerShown: true, title: 'Configuração Inicial',
        }} />
      )}
    </RootStack.Navigator>
  );
}

const linking = {
  prefixes: ['https://app.precificaiapp.com', 'precificaiapp://'],
  config: {
    screens: {
      Register: 'register',
      Login: 'login',
      ForgotPassword: 'forgot-password',
      ResetPassword: 'reset-password',
    },
  },
};

export default function AppNavigator() {
  const { user, loading, passwordRecovery } = useAuth();

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  // Sessão 28.9 — APP-01: durante recovery de senha, força AuthNavigator
  // (que tem ResetPassword), mesmo que o user esteja "logado" via sessão de recovery.
  // Sem isso, o app cairia em rotas autenticadas e a tela de redefinir senha
  // nunca apareceria pro usuário que clicou no link do email.
  const isAuthRoutes = !user || passwordRecovery;

  return (
    <NavigationContainer linking={isAuthRoutes ? linking : undefined}>
      {isAuthRoutes ? <AuthNavigator /> : <AppContent />}
    </NavigationContainer>
  );
}
