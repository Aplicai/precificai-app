import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Image, Platform, TextInput, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius, typography, numeric, radius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcLucroLiquido, calcMargemLiquida, calcCMVPercentual } from '../utils/calculations';
import { calcSobraMes } from '../utils/breakeven';
import { getFinanceiroStatus } from '../utils/financeiroStatus';
import { getSetupStatus, soFaltamEtapasOpcionais } from '../utils/setupStatus';
import InfoTooltip from '../components/InfoTooltip';
import Loader from '../components/Loader';
import MobileOnboardingOverlay from '../components/MobileOnboardingOverlay';
import OnboardingChecklist from '../components/OnboardingChecklist';
import HomeInstallBanner from '../components/HomeInstallBanner';
import PrecosZeradosBanner from '../components/PrecosZeradosBanner';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { useAuth } from '../contexts/AuthContext';
import useFeatureFlag from '../hooks/useFeatureFlag';
import useListDensity from '../hooks/useListDensity';

const GAP = spacing.sm;

// Chaves AsyncStorage para metas configuráveis no Home (não estão no schema
// SQLite porque são preferências de UI, não regra de negócio compartilhada).
// Margem também espelha em `configuracao.lucro_desejado` (regra de negócio).
const PREF_CMV_META = '@pref:cmv_meta_pct';
const PREF_MARGEM_META = '@pref:margem_meta_pct';

// Range válido para metas — evita valores impossíveis (>100%) ou inúteis (<5%)
// que quebrariam fórmulas downstream (ex: pontoEquilibrio = totalFixas / (1 - cmv - var)
// com cmv > 1 dá denominador negativo).
const META_MIN = 5;
const META_MAX = 95;

function clampMeta(v) {
  const n = parseFloat(v);
  if (!isFinite(n)) return null;
  if (n < META_MIN) return String(META_MIN);
  if (n > META_MAX) return String(META_MAX);
  return String(Math.round(n));
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export default function HomeScreen({ navigation }) {
  const { isDesktop, isMobile, width } = useResponsiveLayout();
  // Sessão polish — KPIs estouravam em 320pt por causa de minWidth: 150.
  // ≤360pt: 1 coluna (100%); demais mobile: 2 colunas (48%); desktop usa kpiCardDesktop.
  const kpiCardWidth = width <= 360 ? '100%' : '48%';
  // Sessão 28.6 — densidade aplicada em cards e títulos da Home
  const { isCompact, cardPadding, sectionGap } = useListDensity();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState({
    totalInsumos: 0, totalEmbalagens: 0, totalPreparos: 0, totalProdutos: 0,
    margemMedia: 0, custoTotal: 0, impactoDelivery: 0, resultadoFinanceiro: 0, sobraSoFixas: true,
    produtosMargBaixa: [], produtosSemPreco: [],
    cmvPercent: 0, pontoEquilibrio: 0, fatMedio: 0,
    insights: [], featuredInsight: null,
    // APP-43 — vendas por canal (vem da configuracao)
    vendasMesBalcao: 0, vendasMesDelivery: 0,
    // APP-44 — modo compacto dos gráficos (default ON)
  });
  // APP-42 — filtro do painel: 'geral' | 'balcao' | 'delivery'
  // Sessão 28.48: state canalView removido — user pediu só visão Geral.
  // APP-44 — modo compacto pra gráficos / "ver detalhe"
  const [graficosExpandidos, setGraficosExpandidos] = useState(false);
  const [alertas, setAlertas] = useState([]);
  const [finStatus, setFinStatus] = useState(null);
  const [setupStatus, setSetupStatus] = useState(null);
  const [showNotif, setShowNotif] = useState(false);
  const [showCmvMeta, setShowCmvMeta] = useState(false);
  const [cmvMetaValue, setCmvMetaValue] = useState('35');
  const [showMargemMeta, setShowMargemMeta] = useState(false);
  const [margemMetaValue, setMargemMetaValue] = useState('15');
  const [loadError, setLoadError] = useState(null);
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  // Sessão 26 — flags escondem etapas/CTAs de Delivery e BCG até user habilitar
  const [usaDelivery] = useFeatureFlag('usa_delivery');
  const [analiseAvancada] = useFeatureFlag('modo_avancado_analise');

  // Hidrata metas persistidas (P1: antes o "Aplicar" do CMV era no-op).
  useEffect(() => {
    (async () => {
      try {
        const [cmv, marg] = await Promise.all([
          AsyncStorage.getItem(PREF_CMV_META),
          AsyncStorage.getItem(PREF_MARGEM_META),
        ]);
        if (cmv) setCmvMetaValue(cmv);
        if (marg) setMargemMetaValue(marg);
      } catch {}
    })();
  }, []);

  useFocusEffect(useCallback(() => { loadAll(); }, []));

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadAll(); } finally { setRefreshing(false); }
  }

  async function loadAll() {
    setLoadError(null);
    try {
      const db = await getDatabase();

      // Load ALL data in a single parallel batch.
      // Audit perf: contadores usam COUNT(*) (head request) em vez de baixar a
      // tabela inteira só p/ `.length` — com 2.400 insumos isso era MBs por load.
      const [insumosN, embsN, prepsN, prodsR, delProdsN, combosN, fixas, variaveis, fat, allProdIngs, allProdEmbs, allProdPreps, configs] = await Promise.all([
        db.getFirstAsync('SELECT COUNT(*) as n FROM materias_primas').then(r => r?.n || 0),
        db.getFirstAsync('SELECT COUNT(*) as n FROM embalagens').then(r => r?.n || 0),
        db.getFirstAsync('SELECT COUNT(*) as n FROM preparos').then(r => r?.n || 0),
        db.getAllAsync('SELECT * FROM produtos'),
        db.getFirstAsync('SELECT COUNT(*) as n FROM delivery_produtos').then(r => r?.n || 0),
        db.getFirstAsync('SELECT COUNT(*) as n FROM delivery_combos').then(r => r?.n || 0),
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
          { key: 'fixas', label: 'Custos do mês', done: fixasOk },
          { key: 'variaveis', label: 'Custos por venda', done: variaveisOk },
          { key: 'lucro', label: 'Margem de lucro', done: lucroOk },
        ],
        concluidas: finConcluidas, total: 4, completo: finCompleto, progresso: finConcluidas / 4,
      };
      setFinStatus(status);

      const deliveryOk = delProdsN > 0 || combosN > 0;
      const setupEtapas = [
        { key: 'financeiro', label: 'Financeiro', icon: 'dollar-sign', desc: 'Configure markup, despesas e margem de lucro', done: finCompleto, obrigatoria: true, tab: 'Financeiro', progresso: finConcluidas / 4 },
        { key: 'insumos', label: 'Ingredientes', icon: 'shopping-bag', desc: 'Cadastre seus ingredientes', done: insumosN > 0, tab: 'Insumos', count: insumosN },
        // UX audit 09/09 (Fase B, item 16): `opcional: true` = não segura o
        // banner "Configuração do app" sozinha (ver soFaltamEtapasOpcionais).
        { key: 'embalagens', label: 'Embalagens', icon: 'package', desc: 'Cadastre embalagens', done: embsN > 0, opcional: true, tab: 'Embalagens', count: embsN },
        { key: 'preparos', label: 'Receitas base', icon: 'layers', desc: 'Cadastre receitas base', done: prepsN > 0, opcional: true, tab: 'Preparos', count: prepsN },
        { key: 'produtos', label: 'Produtos', icon: 'box', desc: 'Monte fichas técnicas', done: prodsR.length > 0, tab: 'Produtos', count: prodsR.length },
        // Sessão 26 — etapa de Delivery só aparece se user marcou que faz delivery
        ...(usaDelivery ? [{ key: 'delivery', label: 'Delivery', icon: 'truck', desc: 'Configure delivery', done: deliveryOk, opcional: true, tab: 'Delivery', count: delProdsN + combosN }] : []),
      ];
      const setupConcluidas = setupEtapas.filter(e => e.done).length;
      const setup = {
        etapas: setupEtapas, concluidas: setupConcluidas, total: setupEtapas.length,
        completo: setupConcluidas === setupEtapas.length, progresso: setupConcluidas / setupEtapas.length,
        proximaEtapa: setupEtapas.find(e => !e.done) || null, financeiroCompleto: finCompleto,
        soFaltamOpcionais: soFaltamEtapasOpcionais(setupEtapas),
      };
      setSetupStatus(setup);

      const totalInsumos = insumosN;
      const totalEmbalagens = embsN;
      const totalPreparos = prepsN;
      const totalProdutos = prodsR.length;
      const impactoDelivery = delProdsN + combosN;

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

        if (p.preco_venda > 0) {
          // AUDITORIA QA: só produtos COM preço entram no CMV Médio. Antes
          // somaCustos somava TODOS os produtos mas somaPrecos só os com preço,
          // então produtos a R$0 (típico do Kit) inflavam o CMV (ex.: 244%).
          somaCustos += custoUnit;
          somaPrecos += p.preco_venda;
          // Sessão 28.9 — Auditoria P0-02: usar funções centrais (calcLucroLiquido, calcMargemLiquida)
          const despFixasVal = p.preco_venda * dfPerc;
          const despVarVal = p.preco_venda * totalVar;
          const margem = calcMargemLiquida(p.preco_venda, custoUnit, despFixasVal, despVarVal);
          somaMargens += margem;
          prodsComPreco++;
          if (margem < 0.10) produtosMargBaixa.push({ id: p.id, nome: p.nome, margem });
        } else {
          produtosSemPreco.push(p.nome);
        }
      }

      const margemMedia = prodsComPreco > 0 ? somaMargens / prodsComPreco : 0;
      const cmvPercent = calcCMVPercentual(somaCustos, somaPrecos);
      const denominador = 1 - cmvPercent - totalVar;
      const pontoEquilibrio = denominador > 0 ? totalFixas / denominador : 0;
      // Audit 09/09 [B10]: "Sobra do mês" descontava só as fixas e podia dizer
      // "Receita cobre custos" ao lado de "Falta R$ …" no card do PE. Agora
      // desconta também CMV médio e variáveis (mesma base do pontoEquilibrio);
      // sem produto com preço cai pra faturamento − fixas e o card avisa.
      const { sobra: resultadoFinanceiro, soFixas: sobraSoFixas } = calcSobraMes({
        faturamento: fatMedio, fixas: totalFixas, variaveisPerc: totalVar, cmvPerc: cmvPercent, temProdutos: prodsComPreco > 0,
      });

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
          texto: 'Revise seus custos do mês',
          descricao: 'Início do mês: verifique se houve alteração no aluguel, contas ou outros custos mensais.',
          acao: 'Financeiro',
        });
      }
      if (!status.completo) pendencias.push({ tipo: 'error', texto: 'Configure o Financeiro para cálculos precisos', descricao: 'Preencha margem, faturamento e custos', acao: 'Financeiro' });
      // M1-Estoque: alerta de estoque baixo/zerado.
      // Reintroduzido condicionalmente na Fase B3 (atrás de flag.modo_avancado_estoque).
      // Quando a flag estiver ativa, os alertas levarão à tab Insumos com saldo expandido.
      if (produtosSemPreco.length > 0) pendencias.push({ tipo: 'warning', texto: `${produtosSemPreco.length} produto(s) sem preço de venda`, descricao: 'Defina os preços para calcular margens', acao: 'Produtos' });
      // Sessão 26 — pendência de delivery só faz sentido se user marcou que faz delivery
      if (usaDelivery && impactoDelivery === 0 && totalProdutos > 0) pendencias.push({ tipo: 'info', texto: 'Delivery ainda não configurado', descricao: 'Configure plataformas e preços de delivery', acao: 'Delivery' });
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
          descricao: 'Ver todos os produtos com margem baixa',
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

        // Priority: 1 = critical (color coral/red, push for action), 2 = warning, 3 = positive/info
        // UX audit 09/09 (Fase B, item 11): copy curta (1 linha, sem parênteses).
        // O "como calculo" vai pro `hint` (tooltip no card), não pro texto.
        const hintMargem = { title: 'Como calculamos', text: 'Sobra por venda = preço menos ingredientes, embalagem, custos do mês e taxas por venda. É a margem real, não a de balcão.' };
        if (worstProd && worstMargem < 0) {
          insights.push({ priority: 1, icon: 'alert-triangle', color: colors.error, title: 'Você paga pra vender', text: `${worstProd.nome} · prejuízo de ${formatPercent(Math.abs(worstMargem))} por venda`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: worstProd.id, label: 'Ajustar preço' } });
        } else if (worstProd && worstMargem < 0.10) {
          insights.push({ priority: 1, icon: 'alert-triangle', color: colors.coral, title: 'Sobra quase nada', text: `${worstProd.nome} · sobra só ${formatPercent(worstMargem)} por venda`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: worstProd.id, label: 'Ajustar preço' } });
        } else if (worstProd && worstMargem < 0.15) {
          insights.push({ priority: 2, icon: 'alert-triangle', color: colors.coral, title: 'Sobra pouco', text: `${worstProd.nome} · sobra ${formatPercent(worstMargem)}, ideal é mais de 15%`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: worstProd.id, label: 'Ver produto' } });
        }
        // Audit P1 (Fase 2 - Fix #5): TODO insight precisa de action navegável.
        if (bestProd) insights.push({ priority: 3, icon: 'award', color: colors.success, title: 'Produto campeão', text: `${bestProd.nome} · sobra ${formatPercent(bestMargem)} por venda`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: bestProd.id, label: 'Ver produto' } });
        insights.push({ priority: 3, icon: 'pie-chart', color: colors.accent, title: 'Carteira saudável', text: `${healthyCount} de ${prodsComPreco} produtos com sobra acima de 15%`, action: { tab: 'Produtos', label: 'Ver produtos' } });
      }
      if (produtosSemPreco.length > 0) {
        const nSem = produtosSemPreco.length;
        insights.push({ priority: 1, icon: 'tag', color: colors.warning, title: nSem === 1 ? '1 produto sem preço' : `${nSem} produtos sem preço`, text: 'Defina o preço pra ver quanto sobra por venda', action: { tab: 'Produtos', label: 'Definir preços' } });
      }
      if (pontoEquilibrio > 0 && fatMedio > 0 && fatMedio < pontoEquilibrio) {
        insights.push({ priority: 1, icon: 'target', color: colors.coral, title: 'Faturamento abaixo do mínimo', text: `Faltam ${formatCurrency(pontoEquilibrio - fatMedio)} por mês pra pagar as contas`, hint: { title: 'Mínimo pra pagar as contas', text: `Você precisa faturar ${formatCurrency(pontoEquilibrio / 30)} por dia. Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas.` }, action: { tab: 'Financeiro', label: 'Abrir financeiro' } });
      } else if (pontoEquilibrio > 0) {
        insights.push({ priority: 3, icon: 'target', color: colors.purple, title: 'Mínimo pra pagar as contas', text: `${formatCurrency(pontoEquilibrio / 30)} por dia`, hint: { title: 'Mínimo pra pagar as contas', text: 'Faturamento mínimo pra cobrir os custos do mês. Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas.' }, action: { tab: 'Financeiro', label: 'Ver financeiro' } });
      }
      if (cmvPercent > 0.35) {
        insights.push({ priority: 2, icon: 'trending-up', color: colors.coral, title: 'Ingredientes pesando no preço', text: `Custo em ${formatPercent(cmvPercent)} · setor fica entre 30% e 35%`, action: { tab: 'Insumos', label: 'Revisar ingredientes' } });
      }

      // Sort by priority (1 = most critical first)
      insights.sort((a, b) => (a.priority || 3) - (b.priority || 3));
      const featuredInsight = insights[0] || null;

      // APP-43 — busca volumes por canal
      let vendasMesBalcao = 0, vendasMesDelivery = 0;
      try {
        const cfgRow = await db.getFirstAsync('SELECT vendas_mes_balcao, vendas_mes_delivery FROM configuracao LIMIT 1');
        vendasMesBalcao = Number(cfgRow?.vendas_mes_balcao) || 0;
        vendasMesDelivery = Number(cfgRow?.vendas_mes_delivery) || 0;
      } catch (_) { /* coluna pode não existir em build antigo */ }
      setD({ totalInsumos, totalEmbalagens, totalPreparos, totalProdutos, margemMedia, custoTotal: somaCustos, impactoDelivery, resultadoFinanceiro, sobraSoFixas, produtosMargBaixa: uniqueProds, produtosSemPreco, cmvPercent, pontoEquilibrio, fatMedio, insights, featuredInsight, vendasMesBalcao, vendasMesDelivery });
      setAlertas(pendencias);
    } catch (e) {
      // Antes: catch silencioso → usuário via tudo zerado sem entender por quê.
      // Agora: banner vermelho com mensagem + botão "Tentar de novo".
      const msg = (e && e.message) ? e.message : 'Falha ao carregar indicadores.';
      setLoadError(msg);
      if (typeof console !== 'undefined' && console.error) console.error('[HomeScreen.loadAll]', e);
    }
    setLoading(false);
  }

  function nav(tab) {
    if (tab === 'Configuracoes') { navigation.navigate('Configuracoes'); return; }
    if (tab === 'MargemBaixa') { navigation.navigate('MargemBaixa'); return; }
    if (tab === 'ProdutoFormHome') {
      // AUDITORIA UX: unifica os 2 fluxos de criar produto — abre o MESMO
      // EntityCreateModal da lista de Produtos (antes ia pra tela cheia
      // ProdutoFormScreen, gerando inconsistência de experiência).
      navigation.getParent()?.navigate('Produtos', { screen: 'ProdutosList', params: { openNovoProduto: true } });
      return;
    }
    if (tab === 'Onboarding') { navigation.getParent()?.navigate('Onboarding'); return; }
    const ferramentasScreens = ['Financeiro', 'BCG', 'Delivery', 'AtualizarPrecos', 'ListaCompras'];
    const screenMap = { 'Financeiro': 'FinanceiroMain', 'BCG': 'MatrizBCG', 'Delivery': 'DeliveryHub', 'AtualizarPrecos': 'AtualizarPrecos', 'ListaCompras': 'ListaCompras' };
    if (ferramentasScreens.includes(tab)) {
      navigation.getParent()?.navigate('Mais', { screen: screenMap[tab] });
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
  // UX audit 09/09 (Fase B, item 16): banner "Configuração do app" só quando
  // falta etapa de núcleo. Só opcionais (Delivery, Preparos, Embalagens)
  // pendentes = sem banner, senão ele nunca chega a 100% pra quem não usa delivery.
  const emSetup = setupStatus && !setupStatus.completo && !setupStatus.soFaltamOpcionais;
  // UX audit 09/09 (Fase B, item 5): só UMA lista de passos por vez. Quando o
  // bloco "Como começar a precificar" (com contagens) está visível, o
  // OnboardingChecklist não renderiza — eram dois checklists quase iguais empilhados.
  const mostrarComoComecar = (d.totalProdutos === 0 || d.totalInsumos === 0) && !loading;
  // UX walkthrough: o insight em destaque (banner) NÃO repete em "Análises Rápidas"
  // ("Produto campeão" aparecia duas vezes na mesma tela).
  const featuredShown = !!(d.featuredInsight && !pendente && !baseIncompleta);
  const insightsLista = featuredShown
    ? (d.insights || []).filter(i => i !== d.featuredInsight)
    : (d.insights || []);

  // Status
  let StatusIcon, statusColor, statusText, statusBg, statusOnPress;
  if (pendente) {
    StatusIcon = () => <Feather name="settings" size={20} color="#fff" />;
    statusColor = colors.coral; statusText = 'Configuração pendente'; statusBg = colors.coral;
    statusOnPress = () => nav('Financeiro');
  } else if (baseIncompleta) {
    StatusIcon = () => <Feather name="clipboard" size={20} color="#fff" />;
    statusColor = colors.yellow; statusText = 'Base incompleta'; statusBg = colors.yellow;
    // Leva pro que realmente falta: só produtos faltando → Produtos.
    statusOnPress = () => nav(d.totalInsumos === 0 ? 'Insumos' : 'Produtos');
  } else if (d.produtosMargBaixa.length > 0) {
    StatusIcon = () => <Feather name="alert-triangle" size={20} color="#fff" />;
    statusColor = colors.coral;
    statusText = `${d.produtosMargBaixa.length} produto${d.produtosMargBaixa.length > 1 ? 's' : ''} com margem baixa`;
    statusBg = colors.coral;
    // Navigate to dedicated MargemBaixa screen within HomeStack
    statusOnPress = () => navToMargemBaixa();
  } else if (d.produtosSemPreco.length > 0) {
    // AUDITORIA QA: operação não é "saudável" enquanto houver produtos sem preço
    // (não dá pra saber a margem deles). Antes caía direto no else "saudável".
    StatusIcon = () => <Feather name="tag" size={20} color="#fff" />;
    statusColor = colors.yellow;
    statusText = `${d.produtosSemPreco.length} produto${d.produtosSemPreco.length > 1 ? 's' : ''} sem preço`;
    statusBg = colors.yellow;
    statusOnPress = () => nav('Produtos');
  } else {
    StatusIcon = () => <Feather name="check-circle" size={20} color="#fff" />;
    statusColor = colors.success; statusText = 'Operação saudável'; statusBg = colors.success;
    statusOnPress = null;
  }

  // CTA
  let ctaLabel = null, ctaAction = null;
  if (pendente) { ctaLabel = 'Configurar Financeiro'; ctaAction = 'Financeiro'; }
  else if (d.totalInsumos === 0) { ctaLabel = 'Cadastrar Ingredientes'; ctaAction = 'Insumos'; }
  // UX audit 09/09 (Fase B, item 6): vazio com exemplo concreto.
  else if (d.totalProdutos === 0) { ctaLabel = 'Monte seu primeiro produto — ex.: Bolo de cenoura'; ctaAction = 'Produtos'; }

  // Quick actions
  const acoes = [];
  if (pendente) acoes.push({ label: 'Financeiro', icon: 'dollar-sign', set: 'feather', tab: 'Financeiro' });
  if (d.totalInsumos === 0) acoes.push({ label: 'Cadastrar Ingrediente', icon: 'food-apple-outline', set: 'material', tab: 'Insumos' });
  if (d.totalEmbalagens === 0 && acoes.length < 4) acoes.push({ label: 'Cadastrar Embalagem', icon: 'package', set: 'feather', tab: 'Embalagens' });
  if (d.totalPreparos === 0 && acoes.length < 4) acoes.push({ label: 'Nova Receita base', icon: 'pot-steam-outline', set: 'material', tab: 'Preparos' });
  if (d.totalProdutos === 0 && acoes.length < 4) acoes.push({ label: 'Novo Produto', icon: 'box', set: 'feather', tab: 'ProdutoFormHome' });
  if (usaDelivery && d.impactoDelivery === 0 && d.totalProdutos > 0 && acoes.length < 4) acoes.push({ label: 'Configurar Delivery', icon: 'moped-outline', set: 'material', tab: 'Delivery' });
  // Defaults proativos. Ordem reflete frequência de uso:
  // 1) Atualizar preços (alta) → 2) Novo produto (média) →
  // 3) Engenharia do cardápio (análise, atrás da flag) → 4) Delivery (atrás da flag).
  // Estoque foi removido daqui — vira ação inline na lista de Insumos quando
  // flag.modo_avancado_estoque estiver ativa (Fase B3).
  const defaults = [
    { label: 'Atualizar Preços', icon: 'refresh-cw', set: 'feather', tab: 'AtualizarPrecos' },
    { label: 'Novo Produto', icon: 'box', set: 'feather', tab: 'ProdutoFormHome' },
    // Sprint 1 Q4 — "Ranking de Produtos" (linguagem clara para usuário leigo).
    ...(analiseAvancada ? [{ label: 'Ranking de Produtos', icon: 'bar-chart-2', set: 'feather', tab: 'BCG' }] : []),
    ...(usaDelivery ? [{ label: 'Delivery', icon: 'moped-outline', set: 'material', tab: 'Delivery' }] : []),
    { label: 'Lista de Compras', icon: 'shopping-cart', set: 'feather', tab: 'ListaCompras' }, // CORE — Sessão 26
  ];
  for (const def of defaults) {
    if (acoes.length >= 4) break;
    if (!acoes.find(a => a.tab === def.tab)) acoes.push(def);
  }

  // Base cards
  const baseCards = [
    // UX audit 09/09: contadores na cor da marca (cor só quando tem significado).
    { label: 'Ingredientes', value: d.totalInsumos, icon: 'food-apple-outline', set: 'material', color: colors.primary, tab: 'Insumos' },
    { label: 'Embalagens', value: d.totalEmbalagens, icon: 'package', set: 'feather', color: colors.primary, tab: 'Embalagens' },
    { label: 'Receitas base', value: d.totalPreparos, icon: 'pot-steam-outline', set: 'material', color: colors.primary, tab: 'Preparos' },
    { label: 'Produtos', value: d.totalProdutos, icon: 'box', set: 'feather', color: colors.primary, tab: 'Produtos' },
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
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Image source={require('../../assets/images/logo-header-white.png')} style={{ width: 150, height: 34 }} resizeMode="contain" />
            </View>
            <View style={{ width: 36 }} />
          </View>
        )}
        <Loader message="Calculando seus indicadores..." />
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

      <View style={{ alignItems: 'center', flex: 1 }}>
        <Image
          source={require('../../assets/images/logo-header-white.png')}
          style={{ width: 150, height: 34 }}
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

    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[styles.content, isMobile && styles.contentMobile]}
      refreshControl={Platform.OS !== 'web' ? (
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={colors.primary} colors={[colors.primary]} />
      ) : undefined}
    >

      {/* UX audit 09/09: aviso de preços estimados vive aqui (abaixo do header),
          só em Início e Insumos — antes era global e ficava acima do header. */}
      <PrecosZeradosBanner />

      {/* HomeInstallBanner: movido pra depois de "Ações Rápidas" (UX walkthrough —
          no desktop ocupava o slot mais nobre, acima da saudação). */}

      {/* Mobile-only onboarding overlay — explica a ordem correta de uso
          (Financeiro → Insumos → Preparos → Embalagens → Produtos → Análise).
          O componente decide internamente quando aparecer (flag dismiss +
          contador de aberturas) e filtra mobile via useResponsiveLayout. */}
      <MobileOnboardingOverlay navigation={navigation} />

      {/* UX audit 09/09: removidos MobileDesktopHint ("use no computador") e o
          2º banner de instalação. A Home mobile chegava a 5 avisos antes do
          conteúdo; agora: 1 de onboarding + 1 de instalação, ambos dispensáveis. */}

      {/* Greeting */}
      <View style={[styles.greetingRow, isMobile && styles.greetingRowMobile]}>
        <Text style={[styles.greetingText, isMobile && styles.greetingTextMobile]}>{getGreeting()}</Text>
        {/* UX audit 09/09 (Fase B, item 9): subtítulo só quando informa algo.
            "Veja como está sua precificação" era eco do título — removido. */}
        {(pendente || d.totalProdutos === 0) && (
          <Text style={styles.greetingDesc}>
            {pendente ? 'Complete a configuração para começar' : 'Cadastre seus primeiros produtos'}
          </Text>
        )}
      </View>

      {/* Banner de erro do loadAll — antes era catch silencioso, agora superficie
          a falha pra o usuário poder reagir (P1 da auditoria HomeScreen). */}
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginTop: 1 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorBannerTitle}>Não conseguimos atualizar seus indicadores</Text>
            <Text style={styles.errorBannerDesc} numberOfLines={3}>{loadError}</Text>
          </View>
          <TouchableOpacity onPress={() => loadAll()} style={styles.errorBannerBtn} activeOpacity={0.7}>
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Checklist guiado de onboarding (não-bloqueante). Orienta a ordem
          ideal Financeiro → Insumos → Preparos → Produtos. Some sozinho
          quando os 4 passos estão completos, ou se o usuário ocultar.
          Reusa os dados já carregados por loadAll (zero queries extras).
          Não renderiza junto com "Como começar a precificar" (item 5 da auditoria). */}
      {!loading && !mostrarComoComecar && (
        <OnboardingChecklist
          financeiroCompleto={!!(finStatus && finStatus.completo)}
          totalInsumos={d.totalInsumos}
          totalPreparos={d.totalPreparos}
          totalProdutos={d.totalProdutos}
          onNavigate={nav}
        />
      )}

      {/* Kit de Início banner — prominent for new users with no data */}
      {d.totalInsumos === 0 && d.totalProdutos === 0 && !loading && (
        <TouchableOpacity
          style={[styles.setupBanner, { backgroundColor: colors.primary + '08', borderColor: colors.primary + '30' }]}
          activeOpacity={0.7}
          onPress={() => navigation.getParent()?.navigate('Mais', { screen: 'KitInicio', params: { setup: false } })}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.setupIconCircle, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="gift" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.setupBannerTitle, { fontSize: fonts.medium }]}>Comece com o Kit de Início</Text>
              <Text style={styles.setupBannerDetail}>
                Escolha seu segmento e receba ingredientes prontos para começar a precificar em minutos
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={colors.primary} />
          </View>
        </TouchableOpacity>
      )}

      {/* Step-by-step guide for new users */}
      {mostrarComoComecar && (
        <View style={styles.setupBanner}>
          <Text style={[styles.setupBannerTitle, { fontSize: fonts.medium, marginBottom: spacing.md }]}>
            Como começar a precificar
          </Text>
          {[
            { step: 1, label: 'Cadastre seus ingredientes', desc: 'Tudo que você compra para produzir', icon: 'package', tab: 'Insumos', done: d.totalInsumos > 0, count: d.totalInsumos },
            { step: 2, label: 'Cadastre suas embalagens', desc: 'Caixas, potes, sacos, etc', icon: 'box', tab: 'Embalagens', done: d.totalEmbalagens > 0, count: d.totalEmbalagens },
            { step: 3, label: 'Crie suas receitas base', desc: 'Receitas base com ingredientes', icon: 'layers', tab: 'Preparos', done: d.totalPreparos > 0, count: d.totalPreparos, optional: true },
            { step: 4, label: 'Monte seus produtos', desc: 'Combine tudo e defina preços', icon: 'shopping-bag', tab: 'Produtos', done: d.totalProdutos > 0, count: d.totalProdutos },
          ].map((s, i) => {
            const isNext = !s.done && (i === 0 || [d.totalInsumos > 0, d.totalEmbalagens > 0, d.totalPreparos > 0 || true, d.totalProdutos > 0][i - 1]);
            return (
              <TouchableOpacity
                key={s.step}
                style={[styles.stepItem, isNext && styles.stepItemActive]}
                activeOpacity={0.7}
                onPress={() => navigation.getParent()?.navigate(s.tab)}
                accessibilityRole="button"
                accessibilityLabel={`Passo ${s.step}: ${s.label}${s.done ? ` — ${s.count} cadastrado${s.count !== 1 ? 's' : ''}` : ''}`}
              >
                <View style={[styles.stepNumber, s.done && styles.stepNumberDone, isNext && styles.stepNumberActive]}>
                  {s.done ? <Feather name="check" size={14} color="#fff" /> : <Text style={[styles.stepNumberText, isNext && { color: '#fff' }]}>{s.step}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={[styles.stepLabel, s.done && styles.stepLabelDone]}>{s.label}</Text>
                    {s.optional && <Text style={{ fontSize: fonts.tiny, color: colors.disabled }}>(opcional)</Text>}
                  </View>
                  <Text style={styles.stepDesc}>{s.done ? `${s.count} cadastrado${s.count !== 1 ? 's' : ''}` : s.desc}</Text>
                </View>
                {isNext && <Feather name="arrow-right" size={16} color={colors.primary} />}
                {s.done && <Feather name="check-circle" size={16} color={colors.success} />}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* Setup progress banner */}
      {/* Não empilha com o checklist "Como começar" (mesma informação). */}
      {emSetup && setupStatus && !mostrarComoComecar && (
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
        style={[styles.statusCard, isMobile && styles.statusCardMobile]}
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
            {/* UX walkthrough: copy reflete SÓ o que falta (antes dizia "ingredientes
                e produtos" mesmo com 94 ingredientes cadastrados). */}
            {!pendente && baseIncompleta && (
              <Text style={styles.statusDetail}>
                {d.totalInsumos === 0 && d.totalProdutos === 0
                  ? 'Cadastre ingredientes e produtos para começar'
                  : d.totalInsumos === 0
                    ? 'Cadastre ingredientes para começar'
                    : 'Monte seu primeiro produto'}
              </Text>
            )}
            {!pendente && !baseIncompleta && d.produtosMargBaixa.length > 0 && (
              <Text style={styles.statusDetail}>Ver produtos afetados</Text>
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

      {/* Featured Insight Banner (audit P1-12) — destaca o insight mais acionável
          do momento (margem negativa, produtos sem preço, CMV alto, etc.).
          Aparece logo após o status para que o usuário veja o problema/destaque
          antes de explorar os KPIs e a base de cadastro. */}
      {featuredShown && (
        <TouchableOpacity
          style={[styles.featuredInsight, { borderLeftColor: d.featuredInsight.color, backgroundColor: d.featuredInsight.color + '0C' }, isMobile && styles.featuredInsightMobile]}
          activeOpacity={d.featuredInsight.action ? 0.7 : 1}
          accessibilityRole={d.featuredInsight.action ? 'button' : undefined}
          accessibilityLabel={`${d.featuredInsight.title}. ${d.featuredInsight.text}`}
          onPress={() => {
            const a = d.featuredInsight.action;
            if (!a) return;
            if (a.id) navToProduto(a.id);
            else nav(a.tab);
          }}
        >
          <View style={[styles.featuredInsightIcon, { backgroundColor: d.featuredInsight.color + '22' }]}>
            <Feather name={d.featuredInsight.icon} size={18} color={d.featuredInsight.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.featuredInsightTitle}>{d.featuredInsight.title}</Text>
              {d.featuredInsight.hint && <InfoTooltip {...d.featuredInsight.hint} />}
            </View>
            <Text style={styles.featuredInsightText}>{d.featuredInsight.text}</Text>
            {d.featuredInsight.action && (
              <Text style={[styles.featuredInsightCta, { color: d.featuredInsight.color }]}>
                {d.featuredInsight.action.label} →
              </Text>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* Sessão 28.48: toggle "Geral / Balcão / Delivery" removido — user pediu
          só visão Geral. canalView fixo em 'geral'. */}

      {/* KPIs - Saúde da Precificação */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {/* UX audit 09/09 (Fase B, item 10): sem "?" no título da seção; a
            regra 30-30-30-10 foi pro tooltip do card de ingredientes (CMV). */}
        <Text style={styles.sectionTitle}>Saúde da Precificação</Text>
      </View>
      <View style={[styles.kpiRow, isDesktop && styles.kpiRowDesktop, isMobile && styles.kpiRowMobile]}>
        {(() => {
          // Sessão 28.44 — bug #9: usa Number.isFinite ao invés de `||` pra
          // distinguir "valor 0 válido" (user desligou o benchmark) de "input
          // inválido" (string vazia, NaN, etc). Antes: meta=0 caía pra default.
          const cmvParsed = parseFloat(cmvMetaValue);
          const cmvTarget = Number.isFinite(cmvParsed) ? cmvParsed / 100 : 0.35;
          const cmvBench = d.cmvPercent < cmvTarget ? 'green' : d.cmvPercent <= (cmvTarget + 0.05) ? 'yellow' : 'red';
          const resBench = d.resultadoFinanceiro > 0
            ? (d.fatMedio > 0 && d.resultadoFinanceiro / d.fatMedio < 0.10 ? 'yellow' : 'green')
            : 'red';
          const margParsed = parseFloat(margemMetaValue);
          const margTarget = Number.isFinite(margParsed) ? margParsed / 100 : 0.15;
          const margBench = d.margemMedia >= margTarget ? 'green' : d.margemMedia >= (margTarget - 0.10) ? 'yellow' : 'red';
          const benchColors = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };
          // UX walkthrough: sem produto cadastrado, CMV e "sobra por venda" não
          // existem — "0,00%" com barra verde/vermelha enganava. Mostra "—" sem barra.
          const semProdutos = d.totalProdutos === 0;
          const SEM_PRODUTOS_META = 'Cadastre um produto pra ver';
          return [
          // UX audit 09/09 (Fase B, item 10): rótulos em português de balcão;
          // tooltip fica só onde há fórmula. `caption` = termo técnico pequeno.
          { label: 'Custo dos ingredientes', caption: '(CMV)', value: semProdutos ? '—' : formatPercent(d.cmvPercent), icon: 'tag', color: semProdutos ? colors.disabled : colors.primary,
            tip: { title: 'Custo dos ingredientes (CMV)', text: 'Quanto do preço de venda vai pra ingredientes e embalagem. Toque no card pra mudar a meta.', examples: ['Regra 30-30-30-10: ingredientes 30%, mão de obra 30%, despesas 30%, lucro 10%', 'Restaurantes: 28-35%', 'Pizzarias: 25-32%', 'Confeitarias: 20-30%', 'Fast food: 25-35%', `Sua meta: < ${cmvMetaValue}%`] },
            meta: semProdutos ? SEM_PRODUTOS_META : `Atual: ${formatPercent(d.cmvPercent)} · Meta: < ${cmvMetaValue}%`, bench: (pendente || semProdutos) ? null : cmvBench, onPress: () => setShowCmvMeta(true) },
          { label: 'Sobra do mês', value: pendente ? '--' : formatCurrency(d.resultadoFinanceiro), icon: 'dollar-sign', color: pendente ? colors.disabled : (d.resultadoFinanceiro >= 0 ? colors.success : colors.error),
            // Audit 09/09 [B10]: conta agora desconta CMV e taxas por venda — coerente com "Mínimo pra pagar as contas".
            tip: { title: 'Sobra do mês', text: 'Faturamento médio do mês menos os custos do mês, os ingredientes e as taxas por venda. Pra mudar, ajuste faturamento ou custos no Financeiro.', examples: ['Conta: faturamento − custos do mês − faturamento × (taxas por venda % + ingredientes %)', 'Sem produtos com preço: só desconta os custos do mês', 'Positivo: as vendas pagam todas as contas', 'Negativo: falta dinheiro depois de pagar tudo'] },
            meta: d.sobraSoFixas ? 'Sem produtos: só custos fixos' : (d.resultadoFinanceiro >= 0 ? 'Receita cobre custos' : 'Receita abaixo dos custos'), bench: pendente ? null : resBench },
          { label: 'Mínimo pra pagar as contas', value: pendente ? '--' : formatCurrency(d.pontoEquilibrio), icon: 'target', color: pendente ? colors.disabled : colors.primary,
            tip: { title: 'Mínimo pra pagar as contas', text: 'Quanto você precisa faturar no mês só pra cobrir os custos. Pra mudar, ajuste custos e meta de ingredientes no Financeiro.', examples: ['Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas', 'Compare com seu faturamento médio'] },
            meta: !pendente && d.fatMedio > 0 && d.pontoEquilibrio > 0
              ? (d.fatMedio >= d.pontoEquilibrio ? `Faturamento ${formatPercent(d.fatMedio / d.pontoEquilibrio - 1)} acima` : `Falta ${formatCurrency(d.pontoEquilibrio - d.fatMedio)}`)
              : 'Configure o financeiro', bench: !pendente && d.fatMedio > 0 && d.pontoEquilibrio > 0
              ? (d.fatMedio >= d.pontoEquilibrio * 1.2 ? 'green' : d.fatMedio >= d.pontoEquilibrio ? 'yellow' : 'red') : null },
          { label: 'Quanto sobra por venda', value: pendente ? '--' : semProdutos ? '—' : formatPercent(d.margemMedia), icon: 'trending-up', color: (pendente || semProdutos) ? colors.disabled : (d.margemMedia >= parseFloat(margemMetaValue)/100 ? colors.success : colors.coral),
            tip: { title: 'Quanto sobra por venda', text: 'Média do que sobra de cada venda depois de pagar ingredientes, custos do mês e taxas por venda. Toque no card pra mudar a meta.', examples: ['Conta: preço menos ingredientes, custos do mês e taxas, dividido pelo preço', 'Acima de 15%: saudável', '5-15%: atenção', `Meta atual: > ${margemMetaValue}%`] },
            meta: semProdutos ? SEM_PRODUTOS_META : d.margemMedia >= parseFloat(margemMetaValue)/100 ? `Meta: > ${margemMetaValue}%  ✓` : `Meta: > ${margemMetaValue}%`, bench: (pendente || semProdutos) ? null : margBench, onPress: () => setShowMargemMeta(true) },
        ].map(k => {
          const Wrapper = k.onPress ? TouchableOpacity : View;
          // a11y: cards tocáveis viram "button" com rótulo completo (label + valor + meta).
          const a11yLabel = `${k.label}: ${k.value}${k.meta ? `. ${k.meta}` : ''}`;
          const wrapperProps = k.onPress
            ? { activeOpacity: 0.7, onPress: k.onPress, accessibilityRole: 'button', accessibilityLabel: a11yLabel }
            : { accessibilityLabel: a11yLabel };
          return (
            <Wrapper key={k.label} style={[styles.kpiCard, { padding: cardPadding, minHeight: isCompact ? 80 : 96 }, !isDesktop && { width: kpiCardWidth, minWidth: undefined }, isDesktop && styles.kpiCardDesktop, isMobile && styles.kpiCardMobile]} {...wrapperProps}>
              {/* Refinamento visual 09/09: sem círculo de ícone colorido — label
                  12 px acima do valor, cor só no número e na barra de benchmark. */}
              <View style={styles.kpiHeader}>
                {/* caption "(CMV)" fica no tooltip: inline estourava as 2 linhas do card. */}
                <Text style={styles.kpiLabel} numberOfLines={2}>{k.label}</Text>
                {k.tip && <InfoTooltip {...k.tip} />}
              </View>
              <Text style={[styles.kpiValue, numeric, { color: k.color }]} numberOfLines={1} adjustsFontSizeToFit>{k.value}</Text>
              {k.meta && <Text style={styles.kpiMeta} numberOfLines={1}>{k.meta}</Text>}
              {k.bench && <View style={[styles.kpiBenchBar, { backgroundColor: benchColors[k.bench] }]} />}
            </Wrapper>
          );
        });
        })()}
      </View>

      {/* Resumo rápido inline */}
      <View style={[styles.resumoRow, isMobile && styles.resumoRowMobile]}>
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

      {/* Ações Rápidas — refinamento visual 09/09: 4 botões secundários (borda,
          sem fundo colorido) em linha no desktop, grade 2x2 no mobile. */}
      <Text style={styles.sectionTitle}>Ações Rápidas</Text>
      <View style={[styles.acoesRow, isMobile && styles.acoesRowMobile]}>
        {acoes.map((a) => (
          <TouchableOpacity key={a.label} style={[styles.acaoBtn, isMobile && styles.acaoBtnMobile]} activeOpacity={0.7} onPress={() => nav(a.tab)}>
            {a.set === 'material' ? (
              <MaterialCommunityIcons name={a.icon} size={16} color={colors.primary} />
            ) : (
              <Feather name={a.icon} size={16} color={colors.primary} />
            )}
            <Text style={styles.acaoLabel} numberOfLines={1}>{a.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Insights — lista completa de análises rápidas (P1-12: o featured banner
          já mostra o mais urgente acima; aqui o usuário vê todos os outros).
          Audit P1 (Fase 2 - Fix #5): cards agora são clicáveis e levam ao
          contexto correto (produto específico, financeiro, insumos, etc.). */}
      {/* Banner de instalação PWA — abaixo do conteúdo principal (não compete
          com saudação/status). Mobile e desktop compartilham este JSX. */}
      <HomeInstallBanner />

      {insightsLista.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Análises Rápidas</Text>
          {insightsLista.map((insight, i) => {
            const a = insight.action;
            const Wrapper = a ? TouchableOpacity : View;
            const wrapperProps = a
              ? {
                  activeOpacity: 0.7,
                  onPress: () => {
                    if (a.id) navToProduto(a.id);
                    else nav(a.tab);
                  },
                  accessibilityRole: 'button',
                  accessibilityLabel: insight.title || insight.text,
                }
              : {};
            return (
              <Wrapper key={i} style={[styles.insightCard, { borderLeftColor: insight.color }]} {...wrapperProps}>
                <Feather name={insight.icon} size={16} color={insight.color} style={{ marginTop: 2 }} />
                <View style={{ flex: 1 }}>
                  {insight.title && (
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={styles.insightTitle}>{insight.title}</Text>
                      {insight.hint && <InfoTooltip {...insight.hint} />}
                    </View>
                  )}
                  <Text style={styles.insightText}>{insight.text}</Text>
                  {a && (
                    <Text style={[styles.insightCta, { color: insight.color }]}>
                      {a.label} →
                    </Text>
                  )}
                </View>
                {a && <Feather name="chevron-right" size={14} color={colors.disabled} />}
              </Wrapper>
            );
          })}
        </>
      )}

      <View style={{ height: 20 }} />
    </ScrollView>

    {/* Notification Panel Modal — Sessão 28.16: layout responsivo (centered modal no desktop, bottom sheet no mobile) */}
    <Modal visible={showNotif} transparent animationType="fade">
      <View style={Platform.OS === 'web' ? styles.notifOverlayWeb : styles.notifOverlay}>
        <TouchableOpacity style={styles.notifBackdrop} activeOpacity={1} onPress={() => setShowNotif(false)} />
        <View style={Platform.OS === 'web' ? styles.notifPanelWeb : styles.notifPanel}>
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
                    <Text style={styles.notifItemTitle} numberOfLines={2}>{a.texto}</Text>
                    {a.descricao && <Text style={styles.notifItemDesc} numberOfLines={3}>{a.descricao}</Text>}
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
            <TouchableOpacity onPress={async () => {
              // P1 fix: antes só fechava o modal sem salvar. Agora valida range
              // (5-95%) e persiste em AsyncStorage para sobreviver ao reload.
              const safe = clampMeta(cmvMetaValue);
              if (safe == null) { setShowCmvMeta(false); return; }
              setCmvMetaValue(safe);
              try { await AsyncStorage.setItem(PREF_CMV_META, safe); } catch {}
              setShowCmvMeta(false);
            }} style={{ paddingVertical: 8, paddingHorizontal: 24, backgroundColor: colors.primary, borderRadius: borderRadius.md }}>
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
              // P2 fix: clamp para 5-95% antes de tocar em DB e AsyncStorage —
              // 150% ou negativo quebrava cálculo de pontoEquilibrio downstream.
              const safe = clampMeta(margemMetaValue);
              if (safe == null) { setShowMargemMeta(false); return; }
              setMargemMetaValue(safe);
              const val = parseFloat(safe) / 100;
              try {
                const db = await getDatabase();
                if (val > 0) await db.runAsync('UPDATE configuracao SET lucro_desejado = ? WHERE id > 0', [val]);
              } catch (e) {
                if (typeof console !== 'undefined' && console.error) console.error('[HomeScreen.saveMargemMeta]', e);
              }
              try { await AsyncStorage.setItem(PREF_MARGEM_META, safe); } catch {}
              setShowMargemMeta(false);
              loadAll();
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
  // Sessão 28 — paddingBottom 40→100 garante último card visível acima do BottomTab
  content: { padding: spacing.md, paddingBottom: 100, maxWidth: 960, alignSelf: 'center', width: '100%' },
  // Sessão 29 — Home mobile mais compacta: padding lateral reduzido (sm).
  contentMobile: { padding: spacing.sm, paddingBottom: 100 },

  // Sessão 29 — overrides mobile (apenas spacing). Áreas de toque ≥ 44pt preservadas.
  greetingRowMobile: { marginBottom: spacing.sm },
  greetingTextMobile: { fontSize: 18 },
  statusCardMobile: { padding: spacing.sm + 2, marginBottom: spacing.sm + 2 },
  kpiRowMobile: { gap: 6, marginBottom: spacing.sm + 2 },
  kpiCardMobile: { padding: spacing.sm + 2 },
  resumoRowMobile: { paddingVertical: spacing.sm, marginBottom: spacing.sm + 2 },
  acoesRowMobile: { marginBottom: spacing.sm + 2 },
  // Reduz altura da row mantendo área de toque mínima de 44pt (sm + 4 + ~24 do conteúdo ≈ 44).
  acaoBtnMobile: { paddingVertical: spacing.sm + 2 },
  featuredInsightMobile: { padding: spacing.sm + 2, marginBottom: spacing.sm + 2 },

  // APP-42 — segmented control filtro canal
  canalToggleRow: {
    flexDirection: 'row', gap: 6,
    backgroundColor: colors.surface,
    padding: 4, borderRadius: 22,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  canalTogglePill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 18,
  },
  canalTogglePillActive: { backgroundColor: colors.primary },
  canalTogglePillText: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.semiBold },
  canalTogglePillTextActive: { color: '#fff' },

  // Greeting
  greetingRow: { marginBottom: spacing.md },
  greetingText: { fontSize: typography.title, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  greetingDesc: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  // Error banner — usado quando loadAll() falha. Cor coral/error + retry inline.
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    backgroundColor: colors.error + '10', borderColor: colors.error + '40', borderWidth: 1,
    borderRadius: borderRadius.md, padding: spacing.sm + 2, marginBottom: spacing.md,
  },
  errorBannerTitle: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.error },
  errorBannerDesc: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  errorBannerBtn: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
  },
  errorBannerBtnText: { color: '#fff', fontSize: fonts.tiny, fontFamily: fontFamily.semiBold },

  // Custom header
  customHeader: {
    backgroundColor: colors.primary,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.md, paddingBottom: 10,
    minHeight: 56,
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
  bellBadgeText: { fontSize: 10, fontWeight: '700', color: '#fff' },

  // Setup banner
  setupBanner: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.md,
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

  // Step-by-step guide
  stepItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm + 2, borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  stepItemActive: {
    backgroundColor: colors.primary + '06', marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md, borderRadius: borderRadius.sm,
    borderBottomWidth: 0,
  },
  stepNumber: {
    width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  stepNumberDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNumberActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNumberText: { fontSize: fonts.small, fontWeight: '700', color: colors.textSecondary },
  stepLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.text, fontFamily: fontFamily.semiBold },
  stepLabelDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  stepDesc: { fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 1 },

  // Status — refinamento visual 09/09: sem sombra, borda 1px (regra: sombra só em modal/FAB).
  statusCard: {
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, marginBottom: spacing.lg,
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
  ctaBtnText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: '#fff', flexShrink: 1, textAlign: 'center' },

  // KPIs — refinamento visual 09/09: título de seção vem do token único
  // (13/600 uppercase, tracking 0.6, 8px abaixo) em vez da escala por densidade.
  sectionTitle: {
    fontSize: typography.section, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6,
    marginBottom: 8, marginTop: spacing.xs,
  },
  kpiRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginBottom: spacing.md,
  },
  kpiRowDesktop: {
    gap: 16,
  },
  // Refinamento visual 09/09: sem sombra; borda 1px + raio 10 (mesmo tratamento dos cards de lista).
  kpiCard: {
    width: '48.5%', minWidth: 150,
    backgroundColor: colors.surface, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
    minHeight: 96,
  },
  kpiCardDesktop: {
    width: undefined, flex: 1, minWidth: 200,
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  kpiLabel: { flex: 1, fontSize: typography.caption, fontFamily: fontFamily.medium, color: colors.textSecondary },
  kpiCaption: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.disabled },
  kpiValue: { fontSize: typography.value, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  kpiMeta: { fontSize: typography.caption, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 6 },
  kpiBenchBar: { height: 4, borderRadius: 2, marginTop: 10 },
  benchmarkRef: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.sm, marginTop: -4 },

  // Resumo — "tira de contadores": 4 números, sem borda de card (regra: cor só com significado).
  resumoRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingVertical: spacing.md, marginBottom: spacing.lg,
  },
  resumoItem: { alignItems: 'center', flex: 1 },
  resumoValue: { fontSize: typography.value, fontFamily: fontFamily.semiBold, fontWeight: '600', ...numeric },
  resumoLabel: { fontSize: typography.caption, fontFamily: fontFamily.medium, color: colors.textSecondary, marginTop: 2 },

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
    backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border,
    padding: spacing.md, alignItems: 'center', marginBottom: spacing.md,
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

  // Ações rápidas — botões secundários em linha (desktop) / grade 2x2 (mobile).
  acoesRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  acoesRowMobile: {
    gap: spacing.sm,
  },
  acaoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingHorizontal: spacing.sm, paddingVertical: spacing.sm + 4, minHeight: 44,
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    backgroundColor: colors.surface,
    flexGrow: 1, flexBasis: '23%', minWidth: 150,
  },
  acaoBtnMobile: {
    flexBasis: '47%', minWidth: 0,
  },
  acaoLabel: { fontSize: typography.body, fontFamily: fontFamily.medium, color: colors.text, textAlign: 'center' },

  // Insights
  insightCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 10,
    padding: 12, backgroundColor: colors.surface, borderRadius: 10,
    marginBottom: 6, borderLeftWidth: 3,
  },
  insightTitle: {
    fontSize: 13, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text, marginBottom: 2, lineHeight: 18,
  },
  insightText: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 17 },
  // Audit P1 (Fase 2 - Fix #5): CTA inline em insights navegáveis.
  insightCta: {
    fontSize: 12, fontFamily: fontFamily.semiBold, fontWeight: '600',
    marginTop: 4,
  },

  // Featured Insight Banner (P1-12) — destaque visual no topo da Home
  featuredInsight: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm,
    padding: spacing.md, borderRadius: borderRadius.md,
    borderLeftWidth: 4, marginBottom: spacing.md,
  },
  featuredInsightIcon: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  featuredInsightTitle: {
    fontSize: fonts.medium, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: 3,
  },
  featuredInsightText: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, lineHeight: 18,
  },
  featuredInsightCta: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600',
    marginTop: 6,
  },

  // Notification panel — mobile (bottom sheet)
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
  // Sessão 28.16: web/desktop — modal centralizado com largura limitada (não mais barra full-width feia)
  notifOverlayWeb: {
    flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20,
  },
  notifPanelWeb: {
    backgroundColor: colors.surface, borderRadius: 16,
    width: '100%', maxWidth: 480, maxHeight: '80%',
    paddingBottom: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18, shadowRadius: 24, elevation: 14,
    overflow: 'hidden',
    position: 'absolute', top: '10%', alignSelf: 'center',
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
