import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal, Image, Platform, TextInput, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius, typography, numeric, radius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcLucroLiquido, calcMargemLiquida, calcCMVPercentual, parseDecimalBR, formatNumberBR } from '../utils/calculations';
import { calcSobraMes } from '../utils/breakeven';
import { getFinanceiroStatus, montarStatusFinanceiro, textoPendenciaFinanceiro, publicarStatusFinanceiro, assinarStatusFinanceiro } from '../utils/financeiroStatus';
import { liberarAvisoInstalar } from '../utils/avisoInstalar';
import { etapaEscada, mostrarInicioSimples, mostrarEscadaNoPainel, CHAVE_PAINEL_ESCOLHIDO, META_ESCADA, LINK_APP } from '../utils/escadaPrecos';
import { ehIPhone } from '../utils/navegadorInterno';
import { resolverMargemMeta, isMargemBaixa, classificarMargem } from '../utils/margemMeta';
import { avaliarIndicadores, indicadorEmAlerta, CMV_META_PADRAO } from '../utils/painelSaude';
import { sincronizarCustosPreparos } from '../services/cascadeRecalc';
import { getSetupStatus, soFaltamEtapasOpcionais } from '../utils/setupStatus';
import { rowsOrThrow, countOrThrow } from '../database/dbResult';
import InfoTooltip from '../components/InfoTooltip';
import Loader from '../components/Loader';
import MobileOnboardingOverlay from '../components/MobileOnboardingOverlay';
import TutorialHomeCard from '../components/TutorialHomeCard';
import OnboardingChecklist from '../components/OnboardingChecklist';
import HomeInstallBanner from '../components/HomeInstallBanner';
import PrecosZeradosBanner from '../components/PrecosZeradosBanner';
import PlanoVencendoBanner from '../components/PlanoVencendoBanner';
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

// Meta em % como texto do campo: "15" ou "17,5" (uma casa, vírgula).
function textoMeta(pct) {
  const n = Math.round(Number(pct) * 10) / 10;
  return Number.isInteger(n) ? String(n) : formatNumberBR(n, 1);
}

function clampMeta(v) {
  const n = parseDecimalBR(v);
  if (!isFinite(n)) return null;
  if (n < META_MIN) return String(META_MIN);
  if (n > META_MAX) return String(META_MAX);
  return textoMeta(n);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** 0.2 → "20%", 0.175 → "17,5%" (metas, sem os ",00" do formatPercent). */
function pctMeta(frac) {
  const v = Math.round((Number(frac) || 0) * 1000) / 10;
  return `${String(v).replace('.', ',')}%`;
}

/** Resumo das etapas de configuração (banner "Configuração do app"). */
function montarSetup(etapas) {
  const concluidas = etapas.filter(e => e.done).length;
  return {
    etapas, concluidas, total: etapas.length,
    completo: concluidas === etapas.length, progresso: concluidas / etapas.length,
    proximaEtapa: etapas.find(e => !e.done) || null,
    financeiroCompleto: !!etapas.find(e => e.key === 'financeiro')?.done,
    soFaltamOpcionais: soFaltamEtapasOpcionais(etapas),
  };
}

const PASSOS_COMECO = ['Ingrediente', 'Produto', 'Preço'];

/** Próximo passo da conta nova: 0 ingrediente, 1 produto, 2 preço. */
function passoDoComeco(d) {
  if (d.totalInsumos === 0) return 0;
  if (d.totalProdutos === 0) return 1;
  return 2;
}

/** Celular de verdade: app nativo ou navegador de iPhone/Android em tela estreita. */
function ehCelular(isMobile) {
  if (Platform.OS !== 'web') return true;
  let ua = '';
  try { ua = (typeof navigator !== 'undefined' && navigator.userAgent) || ''; } catch (_) {}
  return isMobile && (ehIPhone(ua) || /Android/i.test(ua));
}

/** "1 de 3": um degrau por preço, o último é a tabela de preços. */
function DegrausEscada({ feitos, meta }) {
  return (
    <View style={inicioStyles.passos}>
      {Array.from({ length: meta }, (_, i) => {
        const feito = i < feitos;
        const atual = i === feitos;
        const nome = i === meta - 1 ? 'Tabela' : `${i + 1}º preço`;
        return (
          <View key={nome} style={[inicioStyles.passo, feito && inicioStyles.passoFeito, atual && inicioStyles.passoAtual]}>
            {feito ? <Feather name="check" size={13} color="#fff" style={{ marginRight: 4 }} /> : null}
            <Text style={[inicioStyles.passoTexto, (feito || atual) && { color: atual ? colors.primary : '#fff' }]}>{nome}</Text>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Escada dos 3 preços (17/10/2026): com 1 ou 2 produtos com preço, a Home
 * simples mostra os preços feitos e UM botão para o próximo Preço rápido.
 * No 3º, a tabela de preços para o WhatsApp (src/utils/escadaPrecos.js).
 */
function EscadaSimples({ nomeNegocio, produtos, onProximo, onPainel, celular }) {
  const { feitos, meta } = etapaEscada(produtos.length);
  const faltam = meta - feitos;
  return (
    <View style={inicioStyles.caixa}>
      <Text style={inicioStyles.ola}>{nomeNegocio ? `Olá, ${nomeNegocio}!` : 'Olá!'}</Text>
      <Text style={inicioStyles.sub}>
        {faltam === 1 ? 'Falta 1 preço para sua tabela de preços.' : `Faltam ${faltam} preços para sua tabela de preços.`}
      </Text>
      <DegrausEscada feitos={feitos} meta={meta} />
      <Text style={inicioStyles.contagem}>{feitos} de {meta}</Text>
      <View style={[inicioStyles.cartao, { marginBottom: spacing.sm + 4 }]}>
        {produtos.map((p, i) => (
          <View key={p.id} style={[inicioStyles.linha, i > 0 && inicioStyles.linhaBorda]}>
            <Feather name="check-circle" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={inicioStyles.linhaNome} numberOfLines={2}>{p.nome}</Text>
            <Text style={inicioStyles.linhaPreco}>{formatCurrency(p.preco)}</Text>
          </View>
        ))}
      </View>
      <View style={inicioStyles.cartao}>
        <Text style={inicioStyles.cartaoTitulo}>Calcule o próximo produto</Text>
        <Text style={inicioStyles.cartaoTexto}>Seus números do mês já estão salvos. Com {meta} produtos com preço, você ganha uma tabela de preços pronta para enviar no WhatsApp.</Text>
        <TouchableOpacity style={inicioStyles.botao} onPress={onProximo} activeOpacity={0.8} accessibilityRole="button">
          <Text style={inicioStyles.botaoTexto}>Calcular o próximo produto (15 s)</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
      <TouchableOpacity style={inicioStyles.video} onPress={onPainel} accessibilityRole="button">
        <Text style={inicioStyles.videoTexto}>Ver painel completo</Text>
      </TouchableOpacity>
      {celular ? (
        <View style={inicioStyles.dica}>
          <Feather name="monitor" size={14} color={colors.textSecondary} style={{ marginRight: 6, marginTop: 2 }} />
          <Text style={inicioStyles.dicaTexto}>Dica: no computador o app é mais completo. Entre com o mesmo e-mail em {LINK_APP.replace('https://', '')}.</Text>
        </View>
      ) : null}
    </View>
  );
}

/** Escolheu o painel com 1 ou 2 preços: a escada num card no topo. */
function CartaoEscada({ feitos, meta, onProximo }) {
  return (
    <View style={inicioStyles.cartaoPainel}>
      <Text style={inicioStyles.cartaoTitulo}>Sua tabela de preços: {feitos} de {meta}</Text>
      <DegrausEscada feitos={feitos} meta={meta} />
      <TouchableOpacity style={inicioStyles.botao} onPress={onProximo} activeOpacity={0.8} accessibilityRole="button">
        <Text style={inicioStyles.botaoTexto}>Calcular o próximo produto (15 s)</Text>
        <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </View>
  );
}

function InicioSimples({ nomeNegocio, d, onAcao, onVideo, onPrecoRapido }) {
  const passo = passoDoComeco(d);
  const produto = d.primeiroSemPreco?.nome;
  const conteudo = [
    {
      // Quem chega aqui pulou o Preço rápido: oferecer o MESMO cálculo como
      // passo principal parecia que o "Pular" não tinha funcionado (16/10).
      titulo: 'Cadastre seu primeiro ingrediente',
      texto: 'Do jeito que você compra: "Comprei 5 kg de farinha por R$ 25". O app calcula o preço por kg.',
      botao: 'Cadastrar ingrediente',
    },
    {
      titulo: 'Monte seu primeiro produto',
      texto: 'Escolha os ingredientes da receita e diga quanto ela rende. O custo aparece na hora.',
      botao: 'Montar produto',
    },
    {
      titulo: produto ? `Coloque o preço do ${produto}` : 'Coloque o preço do seu produto',
      texto: 'O app sugere um preço com base no custo dos ingredientes. Confira se eles estão com o valor que você paga.',
      botao: 'Colocar o preço',
    },
  ][passo];
  return (
    <View style={inicioStyles.caixa}>
      <Text style={inicioStyles.ola}>{nomeNegocio ? `Olá, ${nomeNegocio}!` : 'Olá!'}</Text>
      <Text style={inicioStyles.sub}>Vamos ao seu primeiro preço.</Text>
      <View style={inicioStyles.passos}>
        {PASSOS_COMECO.map((nome, i) => {
          const feito = i < passo;
          const atual = i === passo;
          return (
            <View key={nome} style={[inicioStyles.passo, feito && inicioStyles.passoFeito, atual && inicioStyles.passoAtual]}>
              {feito ? <Feather name="check" size={13} color="#fff" style={{ marginRight: 4 }} /> : null}
              <Text style={[inicioStyles.passoTexto, (feito || atual) && { color: atual ? colors.primary : '#fff' }]}>{i + 1}. {nome}</Text>
            </View>
          );
        })}
      </View>
      <View style={inicioStyles.cartao}>
        <Text style={inicioStyles.cartaoTitulo}>{conteudo.titulo}</Text>
        <Text style={inicioStyles.cartaoTexto}>{conteudo.texto}</Text>
        <TouchableOpacity style={inicioStyles.botao} onPress={() => onAcao(passo)} activeOpacity={0.8} accessibilityRole="button">
          <Text style={inicioStyles.botaoTexto}>{conteudo.botao}</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
      {passo === 0 ? (
        <TouchableOpacity style={inicioStyles.video} onPress={onPrecoRapido} accessibilityRole="button">
          <Feather name="zap" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={inicioStyles.videoTexto}>Ou calcule um preço rápido em 30 segundos</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity style={inicioStyles.video} onPress={onVideo} accessibilityRole="button">
        <Feather name="play-circle" size={16} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={inicioStyles.videoTexto}>Ver o vídeo de 1 minuto</Text>
      </TouchableOpacity>
    </View>
  );
}

const inicioStyles = StyleSheet.create({
  caixa: { maxWidth: 560, width: '100%', alignSelf: 'center', paddingTop: spacing.md },
  ola: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.bold, color: colors.text },
  sub: { fontSize: fonts.regular, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2, marginBottom: spacing.md },
  passos: { flexDirection: 'row', gap: spacing.xs + 2, marginBottom: spacing.md },
  passo: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 8, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  passoFeito: { backgroundColor: colors.success, borderColor: colors.success },
  passoAtual: { borderColor: colors.primary, borderWidth: 2, backgroundColor: colors.surface },
  passoTexto: { fontSize: fonts.tiny + 1, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  cartao: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md },
  cartaoTitulo: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.xs },
  cartaoTexto: { fontSize: fonts.small + 1, lineHeight: 21, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.md },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 50 },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
  video: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md },
  videoTexto: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
  contagem: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.textSecondary, marginTop: -spacing.sm, marginBottom: spacing.sm },
  linha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  linhaBorda: { borderTopWidth: 1, borderTopColor: colors.border },
  linhaNome: { flex: 1, fontSize: fonts.regular, fontFamily: fontFamily.medium, color: colors.text, marginRight: spacing.sm },
  linhaPreco: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary },
  dica: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: spacing.xs, marginTop: spacing.xs },
  dicaTexto: { flex: 1, fontSize: fonts.tiny + 1, lineHeight: 18, fontFamily: fontFamily.regular, color: colors.textSecondary },
  cartaoPainel: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
});

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
    produtosMargBaixa: [], produtosSemPreco: [], prodsComPreco: 0, produtosComPreco: [],
    // Meta de margem = lucro_desejado do Financeiro (src/utils/margemMeta.js).
    margemMeta: resolverMargemMeta(null),
    cmvPercent: 0, pontoEquilibrio: 0, fatMedio: 0,
    insights: [],
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
  const showMargemMetaRef = useRef(false);
  showMargemMetaRef.current = showMargemMeta;
  const loadSeqRef = useRef(0);
  const [margemMetaValue, setMargemMetaValue] = useState('15');
  const [loadError, setLoadError] = useState(null);
  // Escada dos 3 preços: tocou em "Ver painel completo" antes do 3º preço.
  const [escolheuPainel, setEscolheuPainel] = useState(false);
  const insets = useSafeAreaInsets();
  const [refreshing, setRefreshing] = useState(false);
  // Sessão 26 — flags escondem etapas/CTAs de Delivery e BCG até user habilitar
  const [usaDelivery] = useFeatureFlag('usa_delivery');
  const [analiseAvancada] = useFeatureFlag('modo_avancado_analise');

  // Hidrata a meta de CMV persistida (P1: antes o "Aplicar" do CMV era no-op).
  // A meta de margem NÃO vem mais daqui: a fonte é `configuracao.lucro_desejado`
  // (loadAll). O AsyncStorage dela podia ficar em 15% com o Financeiro em 20%.
  useEffect(() => {
    (async () => {
      try {
        const cmv = await AsyncStorage.getItem(PREF_CMV_META);
        if (cmv) setCmvMetaValue(cmv);
      } catch {}
    })();
  }, []);

  // Status do Financeiro salvo em outra tela chega aqui na hora: antes a Home
  // mostrava o card antigo "Configuração pendente" por alguns segundos, até o
  // loadAll (pesado) terminar.
  useEffect(() => assinarStatusFinanceiro((s) => {
    setFinStatus(s);
    setSetupStatus(prev => (prev ? montarSetup(prev.etapas.map(e => (
      e.key === 'financeiro' ? { ...e, done: !!s.completo, progresso: s.progresso } : e
    ))) : prev));
  }), []);

  // Receitas base: Home, Delivery, Ranking, simuladores e relatórios leem o
  // custo GRAVADO em `preparos`. Uma vez por montagem, em segundo plano,
  // regrava os que divergem dos preços atuais e recarrega se algo mudou.
  const syncPreparosFeitoRef = useRef(false);

  useFocusEffect(useCallback(() => {
    // 4 COUNTs rápidos: publica o status (assinatura acima) antes do loadAll.
    getFinanceiroStatus().catch(() => {});
    loadAll();
    if (!syncPreparosFeitoRef.current) {
      syncPreparosFeitoRef.current = true;
      (async () => {
        const custos = await sincronizarCustosPreparos(await getDatabase());
        if (custos && custos.alterados > 0) loadAll();
      })().catch(() => { /* custo gravado continua valendo */ });
    }
  }, []));

  // Nome do negócio para a saudação da Home simples (início).
  const [nomeNegocio, setNomeNegocio] = useState('');
  useFocusEffect(useCallback(() => {
    let vivo = true;
    (async () => {
      try {
        const db = await getDatabase();
        const rows = await db.getAllAsync('SELECT nome_negocio FROM perfil LIMIT 1');
        if (vivo && Array.isArray(rows)) setNomeNegocio((rows[0]?.nome_negocio || '').trim());
      } catch (_) { /* saudação genérica */ }
    })();
    return () => { vivo = false; };
  }, []));

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadAll(); } finally { setRefreshing(false); }
  }

  async function loadAll() {
    // Foco + recarga pós-sincronização podem rodar juntos: só o load mais
    // novo aplica resultado (um load antigo terminando depois traria custos velhos).
    const seq = ++loadSeqRef.current;
    setLoadError(null);
    try {
      const db = await getDatabase();

      // Load ALL data in a single parallel batch.
      // Audit perf: contadores usam COUNT(*) (head request) em vez de baixar a
      // tabela inteira só p/ `.length` — com 2.400 insumos isso era MBs por load.
      const [insumosN, embsN, prepsN, prodsR, delProdsN, combosN, fixas, variaveis, fat, allProdIngs, allProdEmbs, allProdPreps, configs] = await Promise.all([
        countOrThrow(db, 'SELECT COUNT(*) as n FROM materias_primas'),
        countOrThrow(db, 'SELECT COUNT(*) as n FROM embalagens'),
        countOrThrow(db, 'SELECT COUNT(*) as n FROM preparos'),
        db.getAllAsync('SELECT * FROM produtos'),
        countOrThrow(db, 'SELECT COUNT(*) as n FROM delivery_produtos'),
        countOrThrow(db, 'SELECT COUNT(*) as n FROM delivery_combos'),
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT * FROM configuracao'),
      ]);
      // Falha de leitura vira erro (banner "Tentar de novo"), nunca "conta vazia".
      [prodsR, fixas, variaveis, fat, allProdIngs, allProdEmbs, allProdPreps, configs].forEach(rowsOrThrow);
      // Compute financeiro + setup status inline (avoid separate queries)
      const config = configs?.[0];
      const lucroOk = config != null && config.lucro_desejado > 0;
      const faturamentoOk = fat.filter(f => f.valor > 0).length >= 1;
      const fixasOk = fixas.length > 0;
      const variaveisOk = variaveis.length > 0;
      // Regra única (financeiroStatus.js): completo = margem + faturamento +
      // custos do mês + custos por venda (todos obrigatórios desde 14/10/2026).
      const status = montarStatusFinanceiro({ lucroOk, faturamentoOk, fixasOk, variaveisOk });
      const finCompleto = status.completo;
      setFinStatus(status);
      publicarStatusFinanceiro(status); // mantém o banner global em dia

      const deliveryOk = delProdsN > 0 || combosN > 0;
      const setupEtapas = [
        { key: 'financeiro', label: 'Financeiro', icon: 'dollar-sign', desc: 'Margem, quanto vende por mês e seus custos', done: finCompleto, obrigatoria: true, tab: 'Financeiro', progresso: status.progresso },
        { key: 'insumos', label: 'Ingredientes', icon: 'shopping-bag', desc: 'Cadastre seus ingredientes', done: insumosN > 0, tab: 'Insumos', count: insumosN },
        // UX audit 09/09 (Fase B, item 16): `opcional: true` = não segura o
        // banner "Configuração do app" sozinha (ver soFaltamEtapasOpcionais).
        { key: 'embalagens', label: 'Embalagens', icon: 'package', desc: 'Cadastre embalagens', done: embsN > 0, opcional: true, tab: 'Embalagens', count: embsN },
        { key: 'preparos', label: 'Receitas base', icon: 'layers', desc: 'Cadastre receitas base', done: prepsN > 0, opcional: true, tab: 'Preparos', count: prepsN },
        { key: 'produtos', label: 'Produtos', icon: 'box', desc: 'Monte fichas técnicas', done: prodsR.length > 0, tab: 'Produtos', count: prodsR.length },
        // Sessão 26 — etapa de Delivery só aparece se user marcou que faz delivery
        ...(usaDelivery ? [{ key: 'delivery', label: 'Delivery', icon: 'truck', desc: 'Configure delivery', done: deliveryOk, opcional: true, tab: 'Delivery', count: delProdsN + combosN }] : []),
      ];
      setSetupStatus(montarSetup(setupEtapas));

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
      // Meta única de margem (src/utils/margemMeta.js): "margem baixa", "Carteira
      // saudável" e o card "Quanto sobra por venda" usam o mesmo corte.
      const margemMeta = resolverMargemMeta(config?.lucro_desejado);
      const metaTxt = pctMeta(margemMeta);

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
      const produtosComPreco = [];
      let primeiroSemPreco = null;

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
          produtosComPreco.push({ id: p.id, nome: p.nome, preco: p.preco_venda });
          if (isMargemBaixa(margem, margemMeta)) produtosMargBaixa.push({ id: p.id, nome: p.nome, margem });
        } else {
          produtosSemPreco.push(p.nome);
          if (!primeiroSemPreco) primeiroSemPreco = { id: p.id, nome: p.nome };
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
      // Qualquer etapa do Financeiro pendente (custos inclusive) vira aviso,
      // dizendo exatamente o que falta.
      if (!status.completo) {
        pendencias.push({
          tipo: 'info',
          texto: 'Complete o Financeiro para o preço sugerido ficar certo',
          descricao: textoPendenciaFinanceiro(status),
          acao: 'Financeiro',
        });
      }
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
            : `Margem ${formatPercent(p.margem)}. Abaixo da sua meta (${metaTxt}). Considere ajustar o preço.`,
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
          if (!isMargemBaixa(marg, margemMeta)) healthyCount++;
        }

        // Priority: 1 = critical (color coral/red, push for action), 2 = warning, 3 = positive/info
        // UX audit 09/09 (Fase B, item 11): copy curta (1 linha, sem parênteses).
        // O "como calculo" vai pro `hint` (tooltip no card), não pro texto.
        const hintMargem = { title: 'Como calculamos', text: 'Sobra por venda = preço menos ingredientes, embalagem, custos do mês e taxas por venda. É a margem real, não a de balcão.' };
        if (worstProd && worstMargem < 0) {
          insights.push({ key: 'pior_produto', priority: 1, icon: 'alert-triangle', color: colors.error, title: 'Você paga pra vender', text: `${worstProd.nome} · prejuízo de ${formatPercent(Math.abs(worstMargem))} por venda`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: worstProd.id, label: 'Ajustar preço' } });
        } else if (worstProd && classificarMargem(worstMargem, margemMeta) === 'abaixo') {
          insights.push({ key: 'pior_produto', priority: 1, icon: 'alert-triangle', color: colors.coral, title: 'Sobra quase nada', text: `${worstProd.nome} · sobra só ${formatPercent(worstMargem)} por venda`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: worstProd.id, label: 'Ajustar preço' } });
        } else if (worstProd && isMargemBaixa(worstMargem, margemMeta)) {
          insights.push({ key: 'pior_produto', priority: 2, icon: 'alert-triangle', color: colors.coral, title: 'Sobra pouco', text: `${worstProd.nome} · sobra ${formatPercent(worstMargem)}, sua meta é ${metaTxt}`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: worstProd.id, label: 'Ver produto' } });
        }
        // Audit P1 (Fase 2 - Fix #5): TODO insight precisa de action navegável.
        if (bestProd) insights.push({ key: 'campeao', priority: 3, icon: 'award', color: colors.success, title: 'Produto campeão', text: `${bestProd.nome} · sobra ${formatPercent(bestMargem)} por venda`, hint: hintMargem, action: { tab: 'ProdutoFormHome', id: bestProd.id, label: 'Ver produto' } });
        insights.push({ key: 'carteira', priority: 3, icon: 'pie-chart', color: colors.accent, title: 'Carteira saudável', text: `${healthyCount} de ${prodsComPreco} produtos com sobra de ${metaTxt} ou mais`, action: { tab: 'Produtos', label: 'Ver produtos' } });
      }
      if (produtosSemPreco.length > 0) {
        const nSem = produtosSemPreco.length;
        insights.push({ key: 'sem_preco', priority: 1, icon: 'tag', color: colors.warning, title: nSem === 1 ? '1 produto sem preço' : `${nSem} produtos sem preço`, text: 'Defina o preço pra ver quanto sobra por venda', action: { tab: 'Produtos', label: 'Definir preços' } });
      }
      // Sem produto com preço o CMV fica de fora e o "mínimo" sai baixo demais.
      if (prodsComPreco > 0 && pontoEquilibrio > 0 && fatMedio > 0 && fatMedio < pontoEquilibrio) {
        insights.push({ key: 'minimo', priority: 1, icon: 'target', color: colors.coral, title: 'Faturamento abaixo do mínimo', text: `Faltam ${formatCurrency(pontoEquilibrio - fatMedio)} por mês pra pagar as contas`, hint: { title: 'Mínimo pra pagar as contas', text: `Você precisa faturar ${formatCurrency(pontoEquilibrio / 30)} por dia. Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas.` }, action: { tab: 'Financeiro', label: 'Abrir financeiro' } });
      } else if (prodsComPreco > 0 && pontoEquilibrio > 0) {
        insights.push({ key: 'minimo', priority: 3, icon: 'target', color: colors.purple, title: 'Mínimo pra pagar as contas', text: `${formatCurrency(pontoEquilibrio / 30)} por dia`, hint: { title: 'Mínimo pra pagar as contas', text: 'Faturamento mínimo pra cobrir os custos do mês. Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas.' }, action: { tab: 'Financeiro', label: 'Ver financeiro' } });
      }
      // "Ingredientes pesando no preço" é montado no render, a partir da MESMA
      // cor do card de CMV (meta editável no card; ver painelSaude.js).

      // APP-43 — busca volumes por canal
      let vendasMesBalcao = 0, vendasMesDelivery = 0;
      try {
        const cfgRow = await db.getFirstAsync('SELECT vendas_mes_balcao, vendas_mes_delivery FROM configuracao LIMIT 1');
        vendasMesBalcao = Number(cfgRow?.vendas_mes_balcao) || 0;
        vendasMesDelivery = Number(cfgRow?.vendas_mes_delivery) || 0;
      } catch (_) { /* coluna pode não existir em build antigo */ }
      let painelEscolhido = false;
      try { painelEscolhido = (await AsyncStorage.getItem(CHAVE_PAINEL_ESCOLHIDO)) === 'true'; } catch (_) {}
      if (seq !== loadSeqRef.current) return;
      // O aviso "Instale o app" é liberado na tabela de preços (3º preço).
      // Contas que já tinham 3 ou mais antes da escada não passam por ela.
      if (prodsComPreco >= META_ESCADA) liberarAvisoInstalar();
      setEscolheuPainel(painelEscolhido);
      produtosComPreco.sort((a, b) => a.id - b.id);
      setD({ totalInsumos, totalEmbalagens, totalPreparos, totalProdutos, margemMedia, custoTotal: somaCustos, impactoDelivery, resultadoFinanceiro, sobraSoFixas, produtosMargBaixa: uniqueProds, produtosSemPreco, primeiroSemPreco, prodsComPreco, produtosComPreco, margemMeta, cmvPercent, pontoEquilibrio, fatMedio, insights, vendasMesBalcao, vendasMesDelivery });
      // Não sobrescreve o que a pessoa está digitando no modal da meta.
      if (!showMargemMetaRef.current) setMargemMetaValue(textoMeta(margemMeta * 100));
      setAlertas(pendencias);
    } catch (e) {
      // Antes: catch silencioso → usuário via tudo zerado sem entender por quê.
      // Agora: banner vermelho com mensagem + botão "Tentar de novo".
      if (seq !== loadSeqRef.current) return;
      const msg = (e && e.message) ? e.message : 'Falha ao carregar indicadores.';
      setLoadError(msg);
      if (typeof console !== 'undefined' && console.error) console.error('[HomeScreen.loadAll]', e);
    }
    if (seq === loadSeqRef.current) setLoading(false);
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
    if (tab === 'NovoIngrediente') { navigation.getParent()?.navigate('Insumos', { screen: 'MateriaPrimaForm' }); return; }
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
  // Primeiro preço antes do Financeiro (15/10/2026): de 43 cadastros, 1 chegou
  // a um produto com preço; quem era mandado ao Financeiro primeiro preenchia
  // números e saía sem ver resultado. Enquanto nenhum produto tem preço, o
  // passo principal é o produto; o Financeiro vem depois ("deixe o preço mais
  // certo"). Com erro de carga, mantém a ordem antiga.
  const semPrimeiroPreco = !loading && !loadError
    && (d.totalProdutos === 0 || d.produtosSemPreco.length >= d.totalProdutos);
  const financeiroNaFrente = pendente && !semPrimeiroPreco;
  // Escada dos 3 preços (17/10/2026): Home simples até 3 produtos com preço,
  // a menos que a pessoa tenha escolhido o painel (aí a escada vira card).
  const escadaArgs = { dadosOk: !loading && !loadError, prodsComPreco: d.prodsComPreco, escolheuPainel };
  const modoComeco = mostrarInicioSimples(escadaArgs);
  const escadaNoPainel = mostrarEscadaNoPainel(escadaArgs);
  const celular = ehCelular(isMobile);
  const irProximoPreco = () => navigation.navigate('PrecoRapido', { proximo: true });
  const escolherPainel = () => {
    setEscolheuPainel(true);
    AsyncStorage.setItem(CHAVE_PAINEL_ESCOLHIDO, 'true').catch(() => {});
  };
  // UX audit 09/09 (Fase B, item 16): banner "Configuração do app" só quando
  // falta etapa de núcleo. Só opcionais (Delivery, Preparos, Embalagens)
  // pendentes = sem banner, senão ele nunca chega a 100% pra quem não usa delivery.
  const emSetup = setupStatus && !setupStatus.completo && !setupStatus.soFaltamOpcionais;
  // UX audit 09/09 (Fase B, item 5): só UMA lista de passos por vez. Quando o
  // bloco "Como começar a precificar" (com contagens) está visível, o
  // OnboardingChecklist não renderiza — eram dois checklists quase iguais empilhados.
  // Com erro de carga os totais ficam em 0 por falta de dados, não por conta
  // nova: nenhum estado de "comece aqui" é mostrado enquanto houver loadError.
  const dadosOk = !loading && !loadError;
  const mostrarComoComecar = (d.totalProdutos === 0 || d.totalInsumos === 0) && dadosOk;
  // Saúde da Precificação: cards, veredito e insights leem as MESMAS cores
  // (src/utils/painelSaude.js). Antes dava "Operação saudável" com o CMV vermelho.
  const cmvParsed = parseDecimalBR(cmvMetaValue);
  const cmvMeta = Number.isFinite(cmvParsed) && cmvParsed > 0 ? cmvParsed / 100 : CMV_META_PADRAO;
  const ind = avaliarIndicadores({
    pendente: !!pendente, prodsComPreco: d.prodsComPreco, custoComPreco: d.custoTotal,
    cmvPercent: d.cmvPercent, cmvMeta, margemMedia: d.margemMedia, margemMeta: d.margemMeta,
    sobraMes: d.resultadoFinanceiro, fatMedio: d.fatMedio, pontoEquilibrio: d.pontoEquilibrio,
  });
  const alertaIndicador = indicadorEmAlerta(ind);

  // Status (o que aparece aqui não se repete como insight logo abaixo)
  let StatusIcon, statusColor, statusText, statusBg, statusOnPress, statusKey;
  if (financeiroNaFrente) {
    statusKey = 'financeiro';
    StatusIcon = () => <Feather name="settings" size={20} color="#fff" />;
    statusColor = colors.coral; statusText = 'Configuração pendente'; statusBg = colors.coral;
    statusOnPress = () => nav('Financeiro');
  } else if (baseIncompleta) {
    statusKey = 'base';
    StatusIcon = () => <Feather name="clipboard" size={20} color="#fff" />;
    statusColor = colors.yellow; statusText = 'Base incompleta'; statusBg = colors.yellow;
    // Leva pro que realmente falta: só produtos faltando → Produtos.
    statusOnPress = () => nav(d.totalInsumos === 0 ? 'Insumos' : 'Produtos');
  } else if (d.produtosMargBaixa.length > 0) {
    statusKey = 'margem_baixa';
    StatusIcon = () => <Feather name="alert-triangle" size={20} color="#fff" />;
    statusColor = colors.coral;
    statusText = `${d.produtosMargBaixa.length} produto${d.produtosMargBaixa.length > 1 ? 's' : ''} com margem baixa`;
    statusBg = colors.coral;
    // Navigate to dedicated MargemBaixa screen within HomeStack
    statusOnPress = () => navToMargemBaixa();
  } else if (d.produtosSemPreco.length > 0) {
    statusKey = 'sem_preco';
    // AUDITORIA QA: operação não é "saudável" enquanto houver produtos sem preço
    // (não dá pra saber a margem deles). Antes caía direto no else "saudável".
    StatusIcon = () => <Feather name="tag" size={20} color="#fff" />;
    statusColor = colors.yellow;
    statusText = `${d.produtosSemPreco.length} produto${d.produtosSemPreco.length > 1 ? 's' : ''} sem preço`;
    statusBg = colors.yellow;
    statusOnPress = () => nav('Produtos');
  } else if (alertaIndicador) {
    // Algum card de "Saúde da Precificação" está vermelho: nunca "saudável".
    const ALERTAS = {
      sobra: { texto: 'Receita abaixo dos custos', tab: 'Financeiro', icon: 'trending-down' },
      minimo: { texto: 'Faturamento abaixo do mínimo', tab: 'Financeiro', icon: 'target' },
      cmv: { texto: 'Ingredientes pesando no preço', tab: 'Insumos', icon: 'trending-up' },
      margem: { texto: 'Sobra pouco por venda', tab: 'MargemBaixa', icon: 'alert-triangle' },
    };
    const a = ALERTAS[alertaIndicador];
    statusKey = alertaIndicador;
    StatusIcon = () => <Feather name={a.icon} size={20} color="#fff" />;
    statusColor = colors.coral; statusText = a.texto; statusBg = colors.coral;
    statusOnPress = () => nav(a.tab);
  } else {
    statusKey = 'ok';
    StatusIcon = () => <Feather name="check-circle" size={20} color="#fff" />;
    statusColor = colors.success; statusText = 'Operação saudável'; statusBg = colors.success;
    statusOnPress = null;
  }

  // Insights: o de CMV nasce da mesma cor do card (meta editável no card).
  const cmvInsight = ind.cmv === 'red'
    ? { key: 'cmv', priority: 2, icon: 'trending-up', color: colors.coral, title: 'Ingredientes pesando no preço', text: `Custo em ${formatPercent(d.cmvPercent)} · sua meta é até ${pctMeta(cmvMeta)}`, action: { tab: 'Insumos', label: 'Revisar ingredientes' } }
    : null;
  // Com o Financeiro pendente as análises ficam travadas ("Análises
  // indisponíveis"): nada de "Análises Rápidas" calculadas sem os custos.
  // Sobra negativa e faturamento abaixo do mínimo são o mesmo recado.
  const chavesDoStatus = statusKey === 'sobra' ? ['sobra', 'minimo'] : [statusKey];
  const insightsTodos = pendente ? [] : [...(d.insights || []), cmvInsight]
    .filter(Boolean)
    .filter(i => !chavesDoStatus.includes(i.key)) // "5 produtos sem preço" aparecia 2x
    .sort((a, b) => (a.priority || 3) - (b.priority || 3));
  const featuredInsight = insightsTodos[0] || null;
  // UX walkthrough: o insight em destaque (banner) NÃO repete em "Análises Rápidas"
  // ("Produto campeão" aparecia duas vezes na mesma tela).
  const featuredShown = !!(featuredInsight && !pendente && !baseIncompleta);
  const insightsLista = featuredShown ? insightsTodos.slice(1) : insightsTodos;

  // CTA
  let ctaLabel = null, ctaAction = null;
  if (financeiroNaFrente) { ctaLabel = 'Configurar Financeiro'; ctaAction = 'Financeiro'; }
  else if (d.totalInsumos === 0) { ctaLabel = 'Cadastre seu primeiro ingrediente'; ctaAction = 'NovoIngrediente'; }
  // UX audit 09/09 (Fase B, item 6): vazio com exemplo concreto.
  else if (d.totalProdutos === 0) { ctaLabel = 'Monte seu primeiro produto, ex.: Bolo de cenoura'; ctaAction = 'Produtos'; }
  else if (semPrimeiroPreco) { ctaLabel = 'Coloque o preço do seu primeiro produto'; ctaAction = 'Produtos'; }
  else if (pendente) { ctaLabel = 'Deixe seu preço mais certo: configure o Financeiro'; ctaAction = 'Financeiro'; }

  // Quick actions
  const acoes = [];
  if (financeiroNaFrente) acoes.push({ label: 'Financeiro', icon: 'dollar-sign', set: 'feather', tab: 'Financeiro' });
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
    ...(analiseAvancada ? [{ label: 'Ranking de Produtos', icon: 'award', set: 'feather', tab: 'BCG' }] : []),
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
      <PlanoVencendoBanner />

      {/* Home simples até o primeiro produto com preço (16/10/2026): no celular
          a conta nova via 10 blocos, 3 levando ao mesmo lugar e 4 números
          vazios. Agora: saudação, 3 passos e UM próximo passo. Com 1 ou 2
          preços, a escada dos 3 preços (17/10/2026); depois, a Home completa. */}
      {modoComeco && d.prodsComPreco > 0 ? (
        <EscadaSimples
          nomeNegocio={nomeNegocio}
          produtos={d.produtosComPreco}
          onProximo={irProximoPreco}
          onPainel={escolherPainel}
          celular={celular}
        />
      ) : modoComeco ? (
        <InicioSimples
          nomeNegocio={nomeNegocio}
          d={d}
          onAcao={(passo) => {
            if (passo === 0) nav('NovoIngrediente');
            else if (passo === 1) nav('ProdutoFormHome');
            else if (d.primeiroSemPreco) navigation.getParent()?.navigate('Produtos', { screen: 'ProdutosList', params: { openProductEdit: d.primeiroSemPreco.id } });
            else nav('Produtos');
          }}
          onVideo={() => navigation.navigate('ComoFunciona')}
          onPrecoRapido={() => navigation.navigate('PrecoRapido')}
        />
      ) : (<>
      {escadaNoPainel ? (
        <CartaoEscada {...etapaEscada(d.prodsComPreco)} onProximo={irProximoPreco} />
      ) : null}
      <PrecosZeradosBanner />

      {/* HomeInstallBanner: movido pra depois de "Ações Rápidas" (UX walkthrough —
          no desktop ocupava o slot mais nobre, acima da saudação). */}

      {/* Mobile-only onboarding overlay — explica a ordem correta de uso
          (Financeiro → Insumos → Preparos → Embalagens → Produtos → Análise).
          O componente decide internamente quando aparecer (flag dismiss +
          contador de aberturas) e filtra mobile via useResponsiveLayout. */}
      {/* Sem produto ainda: o vídeo de primeiros passos ocupa o lugar do
          "Por onde começar?" (mesmo papel, agora mostrando em vez de listar). */}
      {/* Só decide depois de carregar, senão um pisca no lugar do outro. */}
      {!dadosOk ? null : d.totalProdutos === 0
        ? <TutorialHomeCard />
        : <MobileOnboardingOverlay navigation={navigation} />}

      {/* UX audit 09/09: removidos MobileDesktopHint ("use no computador") e o
          2º banner de instalação. A Home mobile chegava a 5 avisos antes do
          conteúdo; agora: 1 de onboarding + 1 de instalação, ambos dispensáveis. */}

      {/* Greeting */}
      <View style={[styles.greetingRow, isMobile && styles.greetingRowMobile]}>
        <Text style={[styles.greetingText, isMobile && styles.greetingTextMobile]}>{getGreeting()}</Text>
        {/* UX audit 09/09 (Fase B, item 9): subtítulo só quando informa algo.
            "Veja como está sua precificação" era eco do título — removido. */}
        {!loadError && (pendente || d.totalProdutos === 0) && (
          <Text style={styles.greetingDesc}>
            {financeiroNaFrente ? 'Complete a configuração para começar' : semPrimeiroPreco ? 'Monte o preço do seu primeiro produto' : 'Cadastre seus primeiros produtos'}
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
      {/* Financeiro pendente: o card de status abaixo é o ÚNICO aviso (antes
          checklist, "Configuração do app", status e a faixa global empilhavam
          4 avisos com contagens diferentes). */}
      {dadosOk && !mostrarComoComecar && !financeiroNaFrente && (
        <OnboardingChecklist
          financeiroCompleto={!!(finStatus && finStatus.completo)}
          totalInsumos={d.totalInsumos}
          totalPreparos={d.totalPreparos}
          totalProdutos={d.totalProdutos}
          onNavigate={nav}
        />
      )}

      {/* Conta vazia: o primeiro passo é UM ingrediente (16/10/2026). Antes
          oferecia o Kit de Início (~90 ingredientes sem preço), que continua
          em Configurações para quem quiser. */}
      {d.totalInsumos === 0 && d.totalProdutos === 0 && dadosOk && (
        <TouchableOpacity
          style={[styles.setupBanner, { backgroundColor: colors.primary + '08', borderColor: colors.primary + '30' }]}
          activeOpacity={0.7}
          onPress={() => nav('NovoIngrediente')}
          accessibilityRole="button"
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.setupIconCircle, { backgroundColor: colors.primary + '20' }]}>
              <Feather name="shopping-bag" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.setupBannerTitle, { fontSize: fonts.medium }]}>Cadastre seu primeiro ingrediente</Text>
              <Text style={styles.setupBannerDetail}>
                Do jeito que você compra: "Comprei 5 kg de farinha por R$ 25". O app calcula o resto.
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
      {emSetup && setupStatus && dadosOk && !mostrarComoComecar && !financeiroNaFrente && (
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
              <Feather name="info" size={12} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.setupFinAlertText}>
                Complete o Financeiro (margem, quanto vende por mês e seus custos) para o preço sugerido ficar certo
              </Text>
            </View>
          )}
        </TouchableOpacity>
      )}

      {/* Status card — só com dados carregados (nada de card velho piscando). */}
      {dadosOk && (
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
            {/* Mesmo texto do aviso global ("Falta: ..."), da mesma fonte. */}
            {financeiroNaFrente && finStatus && (
              <Text style={styles.statusDetail}>{textoPendenciaFinanceiro(finStatus)}</Text>
            )}
            {/* UX walkthrough: copy reflete SÓ o que falta (antes dizia "ingredientes
                e produtos" mesmo com 94 ingredientes cadastrados). */}
            {!financeiroNaFrente && baseIncompleta && (
              <Text style={styles.statusDetail}>
                {d.totalInsumos === 0 && d.totalProdutos === 0
                  ? 'Cadastre ingredientes e produtos para começar'
                  : d.totalInsumos === 0
                    ? 'Cadastre ingredientes para começar'
                    : 'Monte seu primeiro produto'}
              </Text>
            )}
            {statusKey === 'margem_baixa' && (
              <Text style={styles.statusDetail}>Abaixo da sua meta de {pctMeta(d.margemMeta)} · ver produtos</Text>
            )}
          </View>
          {statusOnPress && <Feather name="chevron-right" size={18} color={colors.disabled} />}
        </View>
        {financeiroNaFrente && finStatus && (
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
      )}

      {/* Featured Insight Banner (audit P1-12) — destaca o insight mais acionável
          do momento (margem negativa, produtos sem preço, CMV alto, etc.).
          Aparece logo após o status para que o usuário veja o problema/destaque
          antes de explorar os KPIs e a base de cadastro. */}
      {featuredShown && (
        <TouchableOpacity
          style={[styles.featuredInsight, { borderLeftColor: featuredInsight.color, backgroundColor: featuredInsight.color + '0C' }, isMobile && styles.featuredInsightMobile]}
          activeOpacity={featuredInsight.action ? 0.7 : 1}
          accessibilityRole={featuredInsight.action ? 'button' : undefined}
          accessibilityLabel={`${featuredInsight.title}. ${featuredInsight.text}`}
          onPress={() => {
            const a = featuredInsight.action;
            if (!a) return;
            if (a.id) navToProduto(a.id);
            else nav(a.tab);
          }}
        >
          <View style={[styles.featuredInsightIcon, { backgroundColor: featuredInsight.color + '22' }]}>
            <Feather name={featuredInsight.icon} size={18} color={featuredInsight.color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={styles.featuredInsightTitle}>{featuredInsight.title}</Text>
              {featuredInsight.hint && <InfoTooltip {...featuredInsight.hint} />}
            </View>
            <Text style={styles.featuredInsightText}>{featuredInsight.text}</Text>
            {featuredInsight.action && (
              <Text style={[styles.featuredInsightCta, { color: featuredInsight.color }]}>
                {featuredInsight.action.label} →
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
          // Cores dos cards = `ind` (painelSaude.js), as mesmas do veredito acima.
          const benchColors = { green: '#22C55E', yellow: '#F59E0B', red: '#EF4444' };
          // UX walkthrough: sem produto COM PREÇO, CMV, sobra por venda e mínimo
          // não existem: "0,00%" e "276% acima" (mínimo sem os ingredientes)
          // enganavam. Mostra "--" sem barra e diz o que falta.
          const semPreco = !(d.prodsComPreco > 0);
          const semCusto = !semPreco && !(d.custoTotal > 0);
          const SEM_PRECO_META = d.totalProdutos === 0 ? 'Cadastre um produto pra ver' : 'Coloque o preço dos produtos';
          const PENDENTE_META = 'Complete o Financeiro';
          const metaMargemTxt = pctMeta(d.margemMeta);
          const cmvMetaTxt = pctMeta(cmvMeta);
          return [
          // UX audit 09/09 (Fase B, item 10): rótulos em português de balcão;
          // tooltip fica só onde há fórmula. `caption` = termo técnico pequeno.
          { label: 'Custo dos ingredientes', caption: '(CMV)', value: (semPreco || semCusto) ? '--' : formatPercent(d.cmvPercent), icon: 'tag', color: (semPreco || semCusto) ? colors.disabled : colors.primary,
            tip: { title: 'Custo dos ingredientes (CMV)', text: 'Quanto do preço de venda vai pra ingredientes e embalagem. Toque no card pra mudar a meta.', examples: ['Regra 30-30-30-10: ingredientes 30%, mão de obra 30%, despesas 30%, lucro 10%', 'Restaurantes: 28-35%', 'Pizzarias: 25-32%', 'Confeitarias: 20-30%', 'Fast food: 25-35%', `Sua meta: até ${cmvMetaTxt}`] },
            meta: semPreco ? SEM_PRECO_META : semCusto ? 'Ingredientes sem preço' : `Atual: ${formatPercent(d.cmvPercent)} · Meta: até ${cmvMetaTxt}`, bench: pendente ? null : ind.cmv, onPress: () => setShowCmvMeta(true) },
          { label: 'Sobra do mês', value: pendente ? '--' : formatCurrency(d.resultadoFinanceiro), icon: 'dollar-sign', color: pendente ? colors.disabled : (d.resultadoFinanceiro >= 0 ? colors.success : colors.error),
            // Audit 09/09 [B10]: conta agora desconta CMV e taxas por venda — coerente com "Mínimo pra pagar as contas".
            tip: { title: 'Sobra do mês', text: 'Faturamento médio do mês menos os custos do mês, os ingredientes e as taxas por venda. Pra mudar, ajuste faturamento ou custos no Financeiro.', examples: ['Conta: faturamento − custos do mês − faturamento × (taxas por venda % + ingredientes %)', 'Sem produtos com preço: só desconta os custos do mês', 'Positivo: as vendas pagam todas as contas', 'Negativo: falta dinheiro depois de pagar tudo'] },
            meta: pendente ? PENDENTE_META
              : d.sobraSoFixas ? (d.totalProdutos > 0 ? 'Produtos sem preço: só custos fixos' : 'Sem produtos: só custos fixos')
              : (d.resultadoFinanceiro >= 0 ? 'Receita cobre custos' : 'Receita abaixo dos custos'),
            bench: ind.sobra },
          { label: 'Mínimo pra pagar as contas', value: (pendente || semPreco) ? '--' : formatCurrency(d.pontoEquilibrio), icon: 'target', color: (pendente || semPreco) ? colors.disabled : colors.primary,
            tip: { title: 'Mínimo pra pagar as contas', text: 'Quanto você precisa faturar no mês só pra cobrir os custos. Pra mudar, ajuste custos e meta de ingredientes no Financeiro.', examples: ['Conta: custos do mês divididos pelo que sobra de cada venda depois dos ingredientes e taxas', 'Compare com seu faturamento médio'] },
            // Antes: "Faturamento 276,40% acima" (faturamento ÷ mínimo − 1). Agora
            // a diferença em reais, simétrica ao "Falta R$ …".
            meta: pendente ? PENDENTE_META
              : semPreco ? SEM_PRECO_META
              : d.fatMedio > 0 && d.pontoEquilibrio > 0
                ? (d.fatMedio >= d.pontoEquilibrio ? `Folga de ${formatCurrency(d.fatMedio - d.pontoEquilibrio)}` : `Falta ${formatCurrency(d.pontoEquilibrio - d.fatMedio)}`)
                : 'Configure o financeiro',
            bench: ind.minimo },
          { label: 'Quanto sobra por venda', value: (pendente || semPreco) ? '--' : formatPercent(d.margemMedia), icon: 'trending-up', color: (pendente || semPreco) ? colors.disabled : (ind.margem === 'green' ? colors.success : colors.coral),
            tip: { title: 'Quanto sobra por venda', text: 'Média do que sobra de cada venda depois de pagar ingredientes, custos do mês e taxas por venda. A meta é a margem de lucro do Financeiro; toque no card pra mudar.', examples: ['Conta: preço menos ingredientes, custos do mês e taxas, dividido pelo preço', `A partir de ${metaMargemTxt}: na meta`, `Até 10 pontos abaixo: atenção`, `Meta atual: ${metaMargemTxt}`] },
            meta: pendente ? PENDENTE_META : semPreco ? SEM_PRECO_META : ind.margem === 'green' ? `Meta: ${metaMargemTxt} ✓` : `Meta: ${metaMargemTxt}`, bench: ind.margem, onPress: () => setShowMargemMeta(true) },
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

      </>)}

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
            <TouchableOpacity onPress={() => { setMargemMetaValue(textoMeta(d.margemMeta * 100)); setShowMargemMeta(false); }} style={{ paddingVertical: 8, paddingHorizontal: 24, backgroundColor: colors.background, borderRadius: borderRadius.md }}>
              <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.semiBold, fontSize: 14 }}>Fechar</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={async () => {
              // P2 fix: clamp para 5-95% antes de tocar em DB e AsyncStorage —
              // 150% ou negativo quebrava cálculo de pontoEquilibrio downstream.
              const safe = clampMeta(margemMetaValue);
              if (safe == null) { setShowMargemMeta(false); return; }
              setMargemMetaValue(safe);
              const val = parseDecimalBR(safe) / 100;
              // Sem mudança: não regrava (evita trocar 17,5% por 18% ao só abrir e salvar).
              const mudou = !(Math.abs(val - (Number(d.margemMeta) || 0)) < 0.0005);
              try {
                const db = await getDatabase();
                if (val > 0 && mudou) await db.runAsync('UPDATE configuracao SET lucro_desejado = ? WHERE id > 0', [val]);
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
  setupFinAlertText: { fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.primary, flex: 1 },

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
