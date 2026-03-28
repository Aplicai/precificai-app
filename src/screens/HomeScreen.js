import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions, ActivityIndicator, Modal, Animated, Image, Platform, StatusBar, TextInput } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import { getFinanceiroStatus } from '../utils/financeiroStatus';
import { getSetupStatus } from '../utils/setupStatus';
import InfoTooltip from '../components/InfoTooltip';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { useAuth } from '../contexts/AuthContext';

const GAP = spacing.sm;

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState({
    totalInsumos: 0, totalEmbalagens: 0, totalPreparos: 0, totalProdutos: 0,
    margemMedia: 0, custoTotal: 0, impactoDelivery: 0, resultadoFinanceiro: 0,
    produtosMargBaixa: [], produtosSemPreco: [],
    cmvPercent: 0, pontoEquilibrio: 0, fatMedio: 0,
    insights: [],
  });
  const [alertas, setAlertas] = useState([]);
  const [finStatus, setFinStatus] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [showNotif, setShowNotif] = useState(false);
  const [showCmvMeta, setShowCmvMeta] = useState(false);
  const [cmvMetaValue, setCmvMetaValue] = useState('35');
  const [showMargemMeta, setShowMargemMeta] = useState(false);
  const [margemMetaValue, setMargemMetaValue] = useState('15');
  const insets = useSafeAreaInsets();

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  async function loadAll() {
    try {
      const db = await getDatabase();

      // Load ALL data in a single parallel batch
      const [insumosR, embsR, prepsR, prodsR, delProdsR, combosR, fixas, variaveis, fat, allProdIngs, allProdEmbs, allProdPreps, configs] = await Promise.all([
        db.getAllAsync('SELECT * FROM materias_primas'),
        db.getAllAsync('SELECT * FROM embalagens'),
        db.getAllAsync('SELECT * FROM preparos'),
        db.getAllAsync('SELECT * FROM produtos'),
        db.getAllAsync('SELECT * FROM delivery_produtos'),
        db.getAllAsync('SELECT * FROM delivery_combos'),
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT * FROM configuracao'),
      ]);
      // Compute financeiro + setup status inline (avoid separate queries)
      const config = configs?.[0];
      const lucroOk = config != null && config.lucro_desejado > 0;
      const faturamentoOk = fat.filter(f => f.valor > 0).length >= 1;
      const fixasOk = fixas.length > 0;
      const variaveisOk = variaveis.length > 0;
      const finCompleto = lucroOk && faturamentoOk && fixasOk && variaveisOk;
      const finConcluidas = [lucroOk, faturamentoOk, fixasOk, variaveisOk].filter(Boolean).length;

      const status = {
        etapas: [
          { key: 'faturamento', label: 'Faturamento mensal', done: faturamentoOk },
          { key: 'fixas', label: 'Despesas fixas', done: fixasOk },
          { key: 'variaveis', label: 'Despesas variáveis', done: variaveisOk },
          { key: 'lucro', label: 'Margem de lucro', done: lucroOk },
        ],
        concluidas: finConcluidas, total: 4, completo: finCompleto, progresso: finConcluidas / 4,
      };
      setFinStatus(status);

      const deliveryOk = delProdsR.length > 0 || combosR.length > 0;
      const setupEtapas = [
        { key: 'financeiro', label: 'Financeiro', icon: 'dollar-sign', desc: 'Configure markup, despesas e margem de lucro', done: finCompleto, obrigatoria: true, tab: 'Financeiro', progresso: finConcluidas / 4 },
        { key: 'insumos', label: 'Insumos', icon: 'shopping-bag', desc: 'Cadastre suas matérias-primas', done: insumosR.length > 0, tab: 'Insumos', count: insumosR.length },
        { key: 'embalagens', label: 'Embalagens', icon: 'package', desc: 'Cadastre embalagens', done: embsR.length > 0, tab: 'Embalagens', count: embsR.length },
        { key: 'preparos', label: 'Preparos', icon: 'layers', desc: 'Cadastre receitas base', done: prepsR.length > 0, tab: 'Preparos', count: prepsR.length },
        { key: 'produtos', label: 'Produtos', icon: 'box', desc: 'Monte fichas técnicas', done: prodsR.length > 0, tab: 'Produtos', count: prodsR.length },
        { key: 'delivery', label: 'Delivery', icon: 'truck', desc: 'Configure delivery', done: deliveryOk, tab: 'Delivery', count: delProdsR.length + combosR.length },
      ];
      const setupConcluidas = setupEtapas.filter(e => e.done).length;
      const setup = {
        etapas: setupEtapas, concluidas: setupConcluidas, total: setupEtapas.length,
        completo: setupConcluidas === setupEtapas.length, progresso: setupConcluidas / setupEtapas.length,
        proximaEtapa: setupEtapas.find(e => !e.done) || null, financeiroCompleto: finCompleto,
      };
      setSetupStatus(setup);

      const totalInsumos = insumosR.length;
      const totalEmbalagens = embsR.length;
      const totalPreparos = prepsR.length;
      const totalProdutos = prodsR.length;
      const impactoDelivery = delProdsR.length + combosR.length;

      const totalFixas = fixas.reduce((a, x) => a + (x.valor || 0), 0);
      const totalVar = variaveis.reduce((a, x) => a + (x.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
      const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);

      // Build lookup maps for O(1) access
      const ingsByProd = {};
      allProdIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const embsByProd = {};
      allProdEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });
      const prepsByProd = {};
      allProdPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });

      let somaMargens = 0, somaCustos = 0, somaPrecos = 0, prodsComPreco = 0;
      const produtosMargBaixa = [];
      const produtosSemPreco = [];

      for (const p of prodsR) {
        const ings = ingsByProd[p.id] || [];
        const custoIng = ings.reduce((a, i) => {
          return a + calcCustoIngrediente(i.preco_por_kg || 0, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida);
        }, 0);
        const embs = embsByProd[p.id] || [];
        const custoEmb = embs.reduce((a, e) => a + (e.preco_unitario || 0) * e.quantidade_utilizada, 0);
        const prepsQ = prepsByProd[p.id] || [];
        const custoPr = prepsQ.reduce((a, pp) => {
          return a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g');
        }, 0);

        const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
        somaCustos += custoUnit;

        if (p.preco_venda > 0) {
          somaPrecos += p.preco_venda;
          const despFixasVal = p.preco_venda * dfPerc;
          const despVarVal = p.preco_venda * totalVar;
          const lucro = p.preco_venda - custoUnit - despFixasVal - despVarVal;
          const margem = lucro / p.preco_venda;
          somaMargens += margem;
          prodsComPreco++;
          if (margem < 0.10) produtosMargBaixa.push({ id: p.id, nome: p.nome, margem });
        } else {
          produtosSemPreco.push(p.nome);
        }
      }

      const margemMedia = prodsComPreco > 0 ? somaMargens / prodsComPreco : 0;
      const cmvPercent = somaPrecos > 0 ? somaCustos / somaPrecos : 0;
      const denominador = 1 - cmvPercent - totalVar;
      const pontoEquilibrio = denominador > 0 ? totalFixas / denominador : 0;
      const resultadoFinanceiro = fatMedio - totalFixas;

      // Deduplicate products by name, keep worst margin
      const uniqueProds = [];
      const seenNames = new Set();
      produtosMargBaixa.sort((a, b) => a.margem - b.margem).forEach(p => {
        if (!seenNames.has(p.nome)) { seenNames.add(p.nome); uniqueProds.push(p); }
      });

      // Check monthly billing reminder (first 7 days of month)
      const hoje = new Date();
      const diaDoMes = hoje.getDate();
      const mesAnterior = hoje.getMonth(); // 0-indexed, so this is the previous month (Jan=0)
      const MESES = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
      const mesAnteriorIdx = mesAnterior === 0 ? 11 : mesAnterior - 1;
      const mesAnteriorNome = MESES[mesAnteriorIdx];
      const fatMesAnterior = fat.find(f => f.mes === mesAnteriorNome);
      const faturamentoMesAnteriorVazio = !fatMesAnterior || !fatMesAnterior.valor || fatMesAnterior.valor <= 0;
      const mostrarLembreteMensal = diaDoMes <= 7 && faturamentoMesAnteriorVazio && finCompleto;

      // Build unified pendências list
      const pendencias = [];
      if (mostrarLembreteMensal) {
        pendencias.push({
          tipo: 'warning',
          texto: `Atualize o faturamento de ${mesAnteriorNome}`,
          descricao: `Novo mês! Informe quanto faturou em ${mesAnteriorNome} para manter seus cálculos precisos.`,
          acao: 'Financeiro',
        });
      }
      // Monthly reminder for fixed costs review (day 1-3 of month)
      if (diaDoMes <= 3 && finCompleto && fixas.length > 0) {
        pendencias.push({
          tipo: 'info',
          texto: 'Revise suas despesas fixas',
          descricao: 'Início do mês: verifique se houve alteração no aluguel, contas ou outros custos fixos.',
          acao: 'Financeiro',
        });
      }
      if (!status.completo) pendencias.push({ tipo: 'error', texto: 'Configure o Financeiro para cálculos precisos', descricao: 'Preencha margem, faturamento e despesas', acao: 'Financeiro' });
      if (produtosSemPreco.length > 0) pendencias.push({ tipo: 'warning', texto: `${produtosSemPreco.length} produto(s) sem preço de venda`, descricao: 'Defina os preços para calcular margens', acao: 'Produtos' });
      if (impactoDelivery === 0 && totalProdutos > 0) pendencias.push({ tipo: 'info', texto: 'Delivery ainda não configurado', descricao: 'Configure plataformas e preços de delivery', acao: 'Delivery' });
      // Add top 5 products with worst margin
      const top5 = uniqueProds.slice(0, 5);
      top5.forEach(p => {
        const isNeg = p.margem < 0;
        pendencias.push({
          tipo: isNeg ? 'error' : 'warning',
          texto: p.nome,
          descricao: isNeg
            ? `Margem ${formatPercent(p.margem)}. Preço não cobre custos + despesas. Aumente o preço ou reduza custos.`
            : `Margem ${formatPercent(p.margem)}. Abaixo do ideal (10%). Considere ajustar o preço.`,
          produtoId: p.id,
        });
      });
      if (uniqueProds.length > 5) {
        pendencias.push({
          tipo: 'warning',
          texto: `Mais ${uniqueProds.length - 5} produtos com margem baixa`,
          descricao: 'Toque para ver todos os produtos',
          acao: 'MargemBaixa',
        });
      }

      // Generate insights using already-loaded data (ZERO additional queries)
      const insights = [];
      if (prodsComPreco > 0) {
        // Compute margin per product using cached lookup maps
        let bestProd = null, bestMargem = -Infinity;
        let worstProd = null, worstMargem = Infinity;
        let healthyCount = 0;

        for (const p of prodsR) {
          if (p.preco_venda <= 0) continue;
          const pIngs = ingsByProd[p.id] || [];
          const pCustoIng = pIngs.reduce((a, i) => {
            return a + calcCustoIngrediente(i.preco_por_kg || 0, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida);
          }, 0);
          const pCustoEmb = (embsByProd[p.id] || []).reduce((a, e) => a + (e.preco_unitario || 0) * e.quantidade_utilizada, 0);
          const pCustoPr = (prepsByProd[p.id] || []).reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
          const custoU = (pCustoIng + pCustoPr + pCustoEmb) / getDivisorRendimento(p);
          const marg = (p.preco_venda - custoU - p.preco_venda * dfPerc - p.preco_venda * totalVar) / p.preco_venda;
          if (marg > bestMargem) { bestMargem = marg; bestProd = p; }
          if (marg < worstMargem) { worstMargem = marg; worstProd = p; }
          if (marg >= 0.15) healthyCount++;
        }

        if (bestProd) insights.push({ icon: 'award', color: colors.success, text: `Seu produto mais lucrativo é o ${bestProd.nome} com margem de ${formatPercent(bestMargem)}` });
        if (worstProd && worstMargem < 0.15) insights.push({ icon: 'alert-triangle', color: colors.coral, text: `Atenção: ${worstProd.nome} tem margem de apenas ${formatPercent(worstMargem)}. Considere aumentar o preço.` });
        insights.push({ icon: 'pie-chart', color: colors.accent, text: `${healthyCount} de ${prodsComPreco} produtos estão com margem saudável (>15%)` });
      }
      if (pontoEquilibrio > 0) {
        insights.push({ icon: 'target', color: colors.purple, text: `Você precisa faturar ${formatCurrency(pontoEquilibrio / 30)} por dia para cobrir seus custos` });
      }
      if (cmvPercent > 0.35) {
        insights.push({ icon: 'trending-up', color: colors.coral, text: `Seu CMV está em ${formatPercent(cmvPercent)}, acima da média do setor (30-35%)` });
      }

      setD({ totalInsumos, totalEmbalagens, totalPreparos, totalProdutos, margemMedia, custoTotal: somaCustos, impactoDelivery, resultadoFinanceiro, produtosMargBaixa: uniqueProds, produtosSemPreco, cmvPercent, pontoEquilibrio, fatMedio, insights });
      setAlertas(pendencias);
    } catch (e) { /* error handled silently */ }
    setLoading(false);
  }

  function nav(tab) {
    if (tab === 'Configuracoes') { navigation.navigate('Configuracoes'); return; }
    if (tab === 'MargemBaixa') { navigation.navigate('MargemBaixa'); return; }
    if (tab === 'ProdutoFormHome') { navigation.navigate('ProdutoFormHome'); return; }
    if (tab === 'Onboarding') { navigation.getParent()?.navigate('Onboarding'); return; }
    const ferramentasScreens = ['Financeiro', 'BCG', 'Delivery', 'AtualizarPrecos'];
    const screenMap = { 'Financeiro': 'FinanceiroMain', 'BCG': 'MatrizBCG', 'Delivery': 'DeliveryHub', 'AtualizarPrecos': 'AtualizarPrecos' };
    if (ferramentasScreens.includes(tab)) {
      navigation.getParent()?.navigate('Ferramentas', { screen: screenMap[tab] });
      return;
    }
    navigation.getParent()?.navigate(tab);
  }

  function navToProduto(produtoId) {
    // Navigate within HomeStack so back returns to Home
    navigation.navigate('ProdutoFormHome', { id: produtoId });
  }

  function navToMargemBaixa() {
    navigation.navigate('MargemBaixa');
  }

  const pendente = finStatus && !finStatus.completo;
  const baseIncompleta = d.totalInsumos === 0 || d.totalProdutos === 0;
  const emSetup = setupStatus && !setupStatus.completo;

  // Status
  let StatusIcon, statusColor, statusText, statusBg, statusOnPress;
  if (pendente) {
    StatusIcon = () => <Feather name="settings" size={20} color="#fff" />;
    statusColor = colors.coral; statusText = 'Configuração pendente'; statusBg = colors.coral;
    statusOnPress = () => nav('Financeiro');
  } else if (baseIncompleta) {
    StatusIcon = () => <Feather name="clipboard" size={20} color="#fff" />;
    statusColor = colors.yellow; statusText = 'Base incompleta'; statusBg = colors.yellow;
    statusOnPress = () => nav('Insumos');
  } else if (d.produtosMargBaixa.length > 0) {
    StatusIcon = () => <Feather name="alert-triangle" size={20} color="#fff" />;
    statusColor = colors.coral;
    statusText = `${d.produtosMargBaixa.length} produto${d.produtosMargBaixa.length > 1 ? 's' : ''} com margem baixa`;
    statusBg = colors.coral;
    // Navigate to dedicated MargemBaixa screen within HomeStack
    statusOnPress = () => navToMargemBaixa();
  } else {
    StatusIcon = () => <Feather name="check-circle" size={20} color="#fff" />;
    statusColor = colors.success; statusText = 'Operação saudável'; statusBg = colors.success;
    statusOnPress = null;
  }

  // CTA
  let ctaLabel = null, ctaAction = null;
  if (pendente) { ctaLabel = 'Configurar Financeiro'; ctaAction = 'Financeiro'; }
  else if (d.totalInsumos === 0) { ctaLabel = 'Cadastrar Insumos'; ctaAction = 'Insumos'; }
  else if (d.totalProdutos === 0) { ctaLabel = 'Criar Primeiro Produto'; ctaAction = 'Produtos'; }

  // Quick actions
  const acoes = [];
  if (pendente) acoes.push({ label: 'Financeiro', icon: 'dollar-sign', set: 'feather', tab: 'Financeiro' });
  if (d.totalInsumos === 0) acoes.push({ label: 'Cadastrar Insumo', icon: 'food-apple-outline', set: 'material', tab: 'Insumos' });
  if (d.totalEmbalagens === 0 && acoes.length < 4) acoes.push({ label: 'Cadastrar Embalagem', icon: 'package', set: 'feather', tab: 'Embalagens' });
  if (d.totalPreparos === 0 && acoes.length < 4) acoes.push({ label: 'Novo Preparo', icon: 'pot-steam-outline', set: 'material', tab: 'Preparos' });
  if (d.totalProdutos === 0 && acoes.length < 4) acoes.push({ label: 'Novo Produto', icon: 'box', set: 'feather', tab: 'ProdutoFormHome' });
  if (d.impactoDelivery === 0 && d.totalProdutos > 0 && acoes.length < 4) acoes.push({ label: 'Configurar Delivery', icon: 'moped-outline', set: 'material', tab: 'Delivery' });
  const defaults = [
    { label: 'Atualizar Preços', icon: 'refresh-cw', set: 'feather', tab: 'AtualizarPrecos' },
    { label: 'Novo Produto', icon: 'box', set: 'feather', tab: 'ProdutoFormHome' },
    { label: 'Engenharia de Cardápio', icon: 'bar-chart-2', set: 'feather', tab: 'BCG' },
    { label: 'Delivery', icon: 'moped-outline', set: 'material', tab: 'Delivery' },
  ];
  for (const def of defaults) {
    if (acoes.length >= 4) break;
    if (!acoes.find(a => a.tab === def.tab)) acoes.push(def);
  }

  // Base cards
  const baseCards = [
    { label: 'Insumos', value: d.totalInsumos, icon: 'food-apple-outline', set: 'material', color: colors.success, tab: 'Insumos' },
    { label: 'Embalagens', value: d.totalEmbalagens, icon: 'package', set: 'feather', color: colors.accent, tab: 'Embalagens' },
    { label: 'Preparos', value: d.totalPreparos, icon: 'pot-steam-outline', set: 'material', color: colors.coral, tab: 'Preparos' },
    { label: 'Produtos', value: d.totalProdutos, icon: 'box', set: 'feather', color: colors.purple, tab: 'Produtos' },
  ];

  // Alert icons
  const alertIcon = (tipo) => {
    if (tipo === 'error') return { name: 'alert-circle', color: colors.error };
    if (tipo === 'warning') return { name: 'alert-triangle', color: colors.coral };
    return { name: 'info', color: colors.accent };
  };

  if (loading) {
    return (
      <View style={styles.container}>
        {!isDesktop && (
          <View style={[styles.customHeader, { paddingTop: insets.top + 8 }]}>
            <View style={{ width: 36 }} />
            <Image source={require('../../assets/images/logo-header-white.png')} style={{ width: 130, height: 28 }} resizeMode="contain" />
            <View style={{ width: 36 }} />
          </View>
        )}
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: spacing.lg }}>
          <View style={{ width: 200, height: 4, backgroundColor: colors.border, borderRadius: 2, overflow: 'hidden' }}>
            <Animated.View style={{
              height: 4, backgroundColor: colors.primary, borderRadius: 2,
              width: '60%',
            }} />
          </View>
          <Text style={{ marginTop: 12, fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.medium }}>Carregando dados...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
    {/* Custom header - hidden on desktop (WebHeader handles it) */}
    {!isDesktop && (
    <View style={[styles.customHeader, { paddingTop: insets.top + 8 }]}>
      <TouchableOpacity onPress={() => navigation.navigate('Perfil')} style={styles.headerIconBtn} activeOpacity={0.7}>
        <Feather name="user" size={20} color="#fff" />
      </TouchableOpacity>

      <View style={{ alignItems: 'center' }}>
        <Image
          source={require('../../assets/images/logo-header-white.png')}
          style={{ width: 120, height: 26 }}
          resizeMode="contain"
        />
      </View>

      {alertas.length > 0 ? (
        <TouchableOpacity onPress={() => setShowNotif(true)} style={styles.headerIconBtn} activeOpacity={0.7}>
          <Feather name="bell" size={20} color="#fff" />
          <View style={styles.bellBadge}>
            <Text style={styles.bellBadgeText}>{alertas.length > 9 ? '9+' : alertas.length}</Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={{ width: 36 }} />
      )}
    </View>
    )}

    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

      {/* Greeting */}
      <View style={styles.greetingRow}>
        <Text style={styles.greetingText}>{getGreeting()} 👋</Text>
        <Text style={styles.greetingDesc}>
          {pendente ? 'Complete a configuração para começar' : d.totalProdutos === 0 ? 'Cadastre seus primeiros produtos' : 'Veja como está sua precificação'}
        </Text>
      </View>

      {/* Setup progress banner */}
      {emSetup && setupStatus && (
        <TouchableOpacity style={styles.setupBanner} activeOpacity={0.7} onPress={() => nav('Onboarding')}>
          <View style={styles.setupBannerTop}>
            <View style={styles.setupBannerLeft}>
              <View style={styles.setupIconCircle}>
                <Feather name="zap" size={16} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.setupBannerTitle}>Configuração do app</Text>
                <Text style={styles.setupBannerDetail}>
                  {setupStatus.concluidas} de {setupStatus.total} etapas
                  {setupStatus.proximaEtapa ? ` · Próxima: ${setupStatus.proximaEtapa.label}` : ''}
                </Text>
              </View>
            </View>
            <Text style={styles.setupBannerPct}>{Math.round(setupStatus.progresso * 100)}%</Text>
          </View>
          <View style={styles.setupBarBg}>
            <View style={[styles.setupBarFill, { width: `${setupStatus.progresso * 100}%` }]} />
          </View>
          {!setupStatus.financeiroCompleto && (
            <View style={styles.setupFinAlert}>
              <Feather name="alert-triangle" size={12} color="#E65100" style={{ marginRight: 6 }} />
              <Text style={styles.setupFinAlertText}>
                Complete o Financeiro para ativar cálculos de preço e margem
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Status card */}
      <TouchableOpacity
        style={styles.statusCard}
        activeOpacity={statusOnPress ? 0.7 : 1}
        onPress={statusOnPress || undefined}
      >
        <View style={styles.statusRow}>
          <View style={[styles.statusIconCircle, { backgroundColor: statusBg }]}>
            <StatusIcon />
          </View>
          <View style={styles.statusBody}>
            <Text style={styles.statusText}>{statusText}</Text>
            {pendente && finStatus && (
              <Text style={styles.statusDetail}>{finStatus.concluidas} de {finStatus.total} etapas do Financeiro</Text>
            )}
            {!pendente && baseIncompleta && (
              <Text style={styles.statusDetail}>Cadastre insumos e produtos para começar</Text>
            )}
            {!pendente && !baseIncompleta && d.produtosMargBaixa.length > 0 && (
              <Text style={styles.statusDetail}>Toque para ver os produtos</Text>
            )}
          </View>
          {statusOnPress && <Feather name="chevron-right" size={18} color={colors.disabled} />}
        </View>
        {pendente && finStatus && (
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${finStatus.progresso * 100}%`, backgroundColor: statusColor }]} />
          </View>
        )}
        {ctaLabel && (
          <TouchableOpacity style={[styles.ctaBtn, { backgroundColor: statusColor }]} activeOpacity={0.7} onPress={() => nav(ctaAction)}>
            <Text style={styles.ctaBtnText}>{ctaLabel}</Text>
            <Feather name="arrow-right" size={16} color="#fff" style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        )}
      </TouchableOpacity>

      {/* KPIs - Saúde da Precificação */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={styles.sectionTitle}>Saúde da Precificação</Text>
        <InfoTooltip
          title="Regra 30-30-30-10"
          text="Referência do setor de alimentação para composição saudável do preço de venda."
          examples={['CMV: até 30%', 'Mão de obra: até 30%', 'Despesas: até 30%', 'Lucro: mínimo 10%']}
        />
      </View>
      <View style={[styles.kpiRow, isDesktop && styles.kpiRowDesktop]}>
        {(() => {
          const cmvTarget = parseFloat(cmvMetaValue) / 100 || 0.35;
          const cmvBench = d.cmvPercent < cmvTarget ? 'green' : d.cmvPercent <= (cmvTarget + 0.05) ? 'yellow' : 'red';
          const resBench = d.resultadoFinanceiro > 0
            ? (d.fatMedio > 0 && d.resultadoFinanceiro / d.fatMedio < 0.10 ? 'yellow' : 'green')
            : 'red';
          const margTarget = parseFloat(margemMetaValue) / 100 || 0.15;
          const margBench = d.margemMedia >= margTarget ? 'green' : d.margemMedia >= (margTarget * 0.33) ? 'yellow' : 'red';
          const benchColors = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };
          return [
          { label: 'CMV Médio', value: formatPercent(d.cmvPercent), icon: 'tag', color: colors.accent,
            tip: { title: 'CMV Médio', text: 'Custo de Mercadoria Vendida em % do preço de venda. Toque para alterar a meta.', examples: ['Referência do setor alimentício:', 'Restaurantes: 28-35%', 'Pizzarias: 25-32%', 'Confeitarias: 20-30%', 'Fast food: 25-35%', `Sua meta: < ${cmvMetaValue}%`] },
            meta: `Atual: ${formatPercent(d.cmvPercent)} · Meta: < ${cmvMetaValue}%`, bench: pendente ? null : cmvBench, onPress: () => setShowCmvMeta(true) },
          { label: 'Resultado Operacional', value: pendente ? '--' : formatCurrency(d.resultadoFinanceiro), icon: 'dollar-sign', color: pendente ? colors.disabled : (d.resultadoFinanceiro >= 0 ? colors.success : colors.error),
            tip: { title: 'Resultado Operacional', text: 'Faturamento médio mensal menos as despesas fixas. Mostra o resultado da operação antes dos custos variáveis.', examples: ['Fórmula: Faturamento − Despesas Fixas', 'Positivo: receita cobre despesas fixas', 'Negativo: despesas fixas maiores que o faturamento'] },
            meta: d.resultadoFinanceiro >= 0 ? 'Receita cobre despesas' : 'Receita abaixo das despesas', bench: pendente ? null : resBench },
          { label: 'Ponto de Equilíbrio', value: pendente ? '--' : formatCurrency(d.pontoEquilibrio), icon: 'target', color: pendente ? colors.disabled : colors.purple,
            tip: { title: 'Ponto de Equilíbrio', text: 'Faturamento mensal mínimo para cobrir todos os custos (fixos, variáveis e CMV). É a meta mínima de faturamento — abaixo disso, há prejuízo.', examples: ['Fórmula: Custos Fixos / (1 - CMV% - Desp. Variáveis%)', 'Compare com seu faturamento médio'] },
            meta: !pendente && d.fatMedio > 0 && d.pontoEquilibrio > 0
              ? (d.fatMedio >= d.pontoEquilibrio ? `Faturamento ${formatPercent(d.fatMedio / d.pontoEquilibrio - 1)} acima` : `Falta ${formatCurrency(d.pontoEquilibrio - d.fatMedio)}`)
              : 'Configure o financeiro', bench: !pendente && d.fatMedio > 0 && d.pontoEquilibrio > 0
              ? (d.fatMedio >= d.pontoEquilibrio * 1.2 ? 'green' : d.fatMedio >= d.pontoEquilibrio ? 'yellow' : 'red') : null },
          { label: 'Margem Líquida', value: pendente ? '--' : formatPercent(d.margemMedia), icon: 'trending-up', color: pendente ? colors.disabled : (d.margemMedia >= parseFloat(margemMetaValue)/100 ? colors.success : colors.coral),
            tip: { title: 'Margem Líquida Média', text: 'Margem de lucro média já descontando CMV, despesas fixas e variáveis. Toque para alterar a meta.', examples: ['Acima de 15%: saudável', '5-15%: atenção', `Meta atual: > ${margemMetaValue}%`] },
            meta: d.margemMedia >= parseFloat(margemMetaValue)/100 ? `Meta: > ${margemMetaValue}%  ✓` : `Meta: > ${margemMetaValue}%`, bench: pendente ? null : margBench, onPress: () => setShowMargemMeta(true) },
        ].map(k => {
          const Wrapper = k.onPress ? TouchableOpacity : View;
          const wrapperProps = k.onPress ? { activeOpacity: 0.7, onPress: k.onPress } : {};
          return (
            <Wrapper key={k.label} style={[styles.kpiCard, isDesktop && styles.kpiCardDesktop]} {...wrapperProps}>
              <View style={styles.kpiHeader}>
                <View style={[styles.kpiIconCircle, { backgroundColor: k.color + '15' }]}>
                  <Feather name={k.icon} size={14} color={k.color} />
                </View>
                <Text style={styles.kpiLabel} numberOfLines={2}>{k.label}</Text>
                {k.tip && <InfoTooltip {...k.tip} />}
              </View>
              <Text style={[styles.kpiValue, { color: k.color }]} numberOfLines={1} adjustsFontSizeToFit>{k.value}</Text>
              {k.meta && <Text style={styles.kpiMeta} numberOfLines={1}>{k.meta}</Text>}
              {k.bench && <View style={[styles.kpiBenchBar, { backgroundColor: benchColors[k.bench] }]} />}
            </Wrapper>
          );
        });
        })()}
      </View>

      {/* Resumo rápido inline */}
      <View style={styles.resumoRow}>
        {baseCards.map(k => (
          <TouchableOpacity key={k.label} style={styles.resumoItem} activeOpacity={0.7} onPress={() => nav(k.tab)}>
            <Text style={[styles.resumoValue, { color: k.value > 0 ? k.color : colors.disabled }]}>{k.value}</Text>
            <Text style={styles.resumoLabel}>{k.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Análises locked */}
      {pendente && (
        <>
          <Text style={styles.sectionTitle}>Análises</Text>
          <View style={styles.analysisLocked}>
            <View style={styles.lockedIconCircle}>
              <Feather name="lock" size={24} color={colors.textSecondary} />
            </View>
            <Text style={styles.analysisLockedTitle}>Análises indisponíveis</Text>
            <Text style={styles.analysisLockedDesc}>
              Complete o Financeiro para liberar as análises de margem, custo e rentabilidade dos seus produtos.
            </Text>
            <TouchableOpacity style={styles.analysisLockedCta} onPress={() => nav('Financeiro')} activeOpacity={0.7}>
              <Text style={styles.analysisLockedCtaText}>Configurar Financeiro</Text>
              <Feather name="arrow-right" size={16} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </>
      )}

      {/* Ações Rápidas */}
      <Text style={styles.sectionTitle}>Ações Rápidas</Text>
      <View style={styles.acoesRow}>
        {acoes.map((a) => (
          <TouchableOpacity key={a.label} style={styles.acaoBtn} activeOpacity={0.7} onPress={() => nav(a.tab)}>
            <View style={styles.acaoIconCircle}>
              {a.set === 'material' ? (
                <MaterialCommunityIcons name={a.icon} size={18} color={colors.primary} />
              ) : (
                <Feather name={a.icon} size={18} color={colors.primary} />
              )}
            </View>
            <Text style={styles.acaoLabel} numberOfLines={1}>{a.label}</Text>
            <Feather name="chevron-right" size={14} color={colors.disabled} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Insights */}
      {d.insights?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Análises Rápidas</Text>
          {d.insights.map((insight, i) => (
            <View key={i} style={[styles.insightCard, { borderLeftColor: insight.color }]}>
              <Feather name={insight.icon} size={16} color={insight.color} />
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))}
        </>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>

    {/* Notification Panel Modal */}
    <Modal visible={showNotif} transparent animationType="slide">
      <View style={styles.notifOverlay}>
        <TouchableOpacity style={styles.notifBackdrop} activeOpacity={1} onPress={() => setShowNotif(false)} />
        <View style={styles.notifPanel}>
          <View style={styles.notifHandle} />
          <View style={styles.notifHeader}>
            <View style={styles.notifHeaderLeft}>
              <Feather name="bell" size={18} color={colors.primary} />
              <Text style={styles.notifTitle}>Pendências</Text>
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>{alertas.length}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowNotif(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.notifList} showsVerticalScrollIndicator={false}>
            {alertas.map((a, i) => {
              const ai = alertIcon(a.tipo);
              const hasAction = a.acao || a.produtoId;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.notifItem, i < alertas.length - 1 && styles.notifItemBorder]}
                  activeOpacity={hasAction ? 0.6 : 1}
                  onPress={() => {
                    setShowNotif(false);
                    setTimeout(() => {
                      if (a.produtoId) navToProduto(a.produtoId);
                      else if (a.acao) nav(a.acao);
                    }, 300);
                  }}
                >
                  <View style={[styles.notifIcon, { backgroundColor: ai.color + '12' }]}>
                    <Feather name={ai.name} size={14} color={ai.color} />
                  </View>
                  <View style={styles.notifBody}>
                    <Text style={styles.notifItemTitle} numberOfLines={1}>{a.texto}</Text>
                    {a.descricao && <Text style={styles.notifItemDesc} numberOfLines={2}>{a.descricao}</Text>}
                  </View>
                  {hasAction && <Feather name="chevron-right" size={14} color={colors.disabled} />}
                </TouchableOpacity>
              );
            })}
            {alertas.length === 0 && (
              <View style={styles.notifEmpty}>
                <Feather name="check-circle" size={32} color={colors.success} />
                <Text style={styles.notifEmptyText}>Nenhuma pendência</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>

    {/* CMV Meta Modal */}
    <Modal visible={showCmvMeta} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', maxWidth: 340, width: '90%', borderRadius: borderRadius.lg, padding: spacing.lg }}>
          <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm }}>Meta de CMV</Text>
          <Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 }}>
            Defina o percentual máximo de CMV sobre o preço de venda. O padrão do setor é 30-35%.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, height: 44 }}>
              <Text style={{ fontSize: 15, fontFamily: fontFamily.bold, color: colors.text }}>Meta: </Text>
              <TextInput
                value={cmvMetaValue}
                onChangeText={setCmvMetaValue}
                keyboardType="numeric"
                style={{ flex: 1, fontSize: 18, fontFamily: fontFamily.bold, color: colors.primary, textAlign: 'center' }}
                maxLength={4}
              />
              <Text style={{ fontSize: 15, fontFamily: fontFamily.bold, color: colors.text }}>%</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
            {['25', '30', '35', '40'].map(v => (
              <TouchableOpacity key={v} onPress={() => setCmvMetaValue(v)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: cmvMetaValue === v ? colors.primary : colors.background }}>
                <Text style={{ fontSize: 13, fontFamily: fontFamily.semiBold, color: cmvMetaValue === v ? '#fff' : colors.text }}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginTop: spacing.md }}>
            <TouchableOpacity onPress={() => setShowCmvMeta(false)} style={{ paddingVertical: 8, paddingHorizontal: 24, backgroundColor: colors.background, borderRadius: borderRadius.md }}>
              <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.semiBold, fontSize: 14 }}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCmvMeta(false)} style={{ paddingVertical: 8, paddingHorizontal: 24, backgroundColor: colors.primary, borderRadius: borderRadius.md }}>
              <Text style={{ color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 14 }}>Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>

    {/* Margem Meta Modal */}
    <Modal visible={showMargemMeta} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', maxWidth: 340, width: '90%', borderRadius: borderRadius.lg, padding: spacing.lg }}>
          <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm }}>Meta de Lucro</Text>
          <Text style={{ fontSize: 13, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.md, lineHeight: 18 }}>
            Defina a margem de lucro mínima desejada. Ao salvar, atualiza também o Financeiro.
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.background, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm, height: 44, marginBottom: spacing.md }}>
            <Text style={{ fontSize: 15, fontFamily: fontFamily.bold, color: colors.text }}>Meta: </Text>
            <TextInput
              value={margemMetaValue}
              onChangeText={setMargemMetaValue}
              keyboardType="numeric"
              style={{ flex: 1, fontSize: 18, fontFamily: fontFamily.bold, color: colors.success, textAlign: 'center' }}
              maxLength={4}
            />
            <Text style={{ fontSize: 15, fontFamily: fontFamily.bold, color: colors.text }}>%</Text>
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, marginBottom: spacing.md }}>
            {['10', '15', '20', '25'].map(v => (
              <TouchableOpacity key={v} onPress={() => setMargemMetaValue(v)}
                style={{ paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, backgroundColor: margemMetaValue === v ? colors.success : colors.background }}>
                <Text style={{ fontSize: 13, fontFamily: fontFamily.semiBold, color: margemMetaValue === v ? '#fff' : colors.text }}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.sm }}>
            <TouchableOpacity onPress={() => setShowMargemMeta(false)} style={{ paddingVertical: 8, paddingHorizontal: 24, backgroundColor: colors.background, borderRadius: borderRadius.md }}>
              <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.semiBold, fontSize: 14 }}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={async () => {
              try {
                const db = await getDatabase();
                const val = parseFloat(margemMetaValue) / 100;
                if (val > 0) await db.runAsync('UPDATE configuracao SET lucro_desejado = ? WHERE id > 0', [val]);
              } catch (e) {}
              setShowMargemMeta(false);
            }} style={{ paddingVertical: 8, paddingHorizontal: 24, backgroundColor: colors.success, borderRadius: borderRadius.md }}>
              <Text style={{ color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 14 }}>Salvar e Aplicar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40, maxWidth: 960, alignSelf: 'center', width: '100%' },

  // Greeting
  greetingRow: { marginBottom: spacing.md },
  greetingText: { fontSize: 20, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  greetingDesc: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  // Custom header
  customHeader: {
    backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: 12,
  },
  headerIconBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  bellBadge: {
    position: 'absolute', top: 0, right: -2,
    backgroundColor: colors.error, borderRadius: 8,
    minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: colors.primary,
  },
  bellBadgeText: { fontSize: 9, fontWeight: '700', color: '#fff' },

  // Setup banner
  setupBanner: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    borderWidth: 1, borderColor: colors.primary + '20',
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 2,
  },
  setupBannerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  setupBannerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  setupIconCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  setupBannerTitle: { fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  setupBannerDetail: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary },
  setupBannerPct: { fontSize: fonts.large, fontFamily: fontFamily.extraBold, fontWeight: '800', color: colors.primary },
  setupBarBg: { height: 6, backgroundColor: colors.primary + '12', borderRadius: 3, overflow: 'hidden' },
  setupBarFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  setupFinAlert: {
    marginTop: spacing.sm, backgroundColor: colors.coral + '10', borderRadius: borderRadius.sm,
    padding: spacing.sm, flexDirection: 'row', alignItems: 'center',
  },
  setupFinAlertText: { fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.coral, flex: 1 },

  // Status
  statusCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  statusIconCircle: {
    width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  statusBody: { flex: 1 },
  statusText: { fontSize: fonts.body, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  statusDetail: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  progressBarBg: {
    height: 4, backgroundColor: colors.border, borderRadius: 2, marginTop: spacing.sm, overflow: 'hidden',
  },
  progressBarFill: { height: 4, borderRadius: 2 },
  ctaBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm, borderRadius: borderRadius.md, marginTop: spacing.sm,
  },
  ctaBtnText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: '#fff' },

  // KPIs
  sectionTitle: {
    fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm, marginTop: spacing.xs,
  },
  kpiRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: spacing.md,
  },
  kpiRowDesktop: {
    gap: 16,
  },
  kpiCard: {
    width: '48.5%', minWidth: 150,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md + 4,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  kpiCardDesktop: {
    width: undefined, flex: 1, minWidth: 200,
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm + 2 },
  kpiIconCircle: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginRight: 8,
  },
  kpiLabel: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.textSecondary },
  kpiValue: { fontSize: 22, fontFamily: fontFamily.bold, fontWeight: '700' },
  kpiMeta: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 6 },
  kpiBenchBar: { height: 5, borderRadius: 2.5, marginTop: 10 },
  benchmarkRef: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: -4 },

  // Resumo
  resumoRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    paddingVertical: spacing.md, marginBottom: spacing.lg,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  resumoItem: { alignItems: 'center', flex: 1 },
  resumoValue: { fontSize: fonts.xlarge, fontFamily: fontFamily.bold, fontWeight: '700' },
  resumoLabel: { fontSize: 10, fontFamily: fontFamily.medium, color: colors.textSecondary, marginTop: 2 },

  // Alertas / Pendências
  alertsCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden',
    marginBottom: spacing.lg,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  alertRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
  },
  alertRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.border },
  alertIconCircle: {
    width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  alertBody: { flex: 1, marginRight: spacing.xs },
  alertText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  alertDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  // Analysis locked
  analysisLocked: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg,
    alignItems: 'center', marginBottom: spacing.lg,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  lockedIconCircle: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: colors.border + '40',
    alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm,
  },
  analysisLockedTitle: { fontSize: fonts.body, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginBottom: 4 },
  analysisLockedDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, textAlign: 'center', lineHeight: 18 },
  analysisLockedCta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, paddingVertical: spacing.sm, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, marginTop: spacing.md,
  },
  analysisLockedCtaText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: '#fff' },

  // Ações rápidas
  acoesRow: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg, overflow: 'hidden',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 6, elevation: 1,
  },
  acaoBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 4,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  acaoIconCircle: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '10',
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  acaoLabel: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },

  // Insights
  insightCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, backgroundColor: colors.surface, borderRadius: 10,
    marginBottom: 6, borderLeftWidth: 3,
  },
  insightText: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text, flex: 1, lineHeight: 18 },

  // Notification panel
  notifOverlay: {
    flex: 1, justifyContent: 'flex-end',
  },
  notifBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
  },
  notifPanel: {
    backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    maxHeight: '70%', paddingBottom: 20,
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 10,
  },
  notifHandle: {
    width: 36, height: 4, borderRadius: 2, backgroundColor: colors.border,
    alignSelf: 'center', marginTop: 10, marginBottom: 6,
  },
  notifHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  notifHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  notifTitle: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  notifBadge: {
    backgroundColor: colors.error, borderRadius: 10,
    minWidth: 20, height: 20, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
  },
  notifBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },
  notifList: { paddingHorizontal: spacing.md },
  notifItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 4,
  },
  notifItemBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  notifIcon: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  notifBody: { flex: 1, marginRight: spacing.xs },
  notifItemTitle: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  notifItemDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2, lineHeight: 15 },
  notifEmpty: { alignItems: 'center', paddingVertical: 40 },
  notifEmptyText: { fontSize: fonts.body, fontFamily: fontFamily.medium, color: colors.textSecondary, marginTop: spacing.sm },
});
