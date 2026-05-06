import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch,
  ActivityIndicator, Platform, TextInput, Alert, Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { Feather } from '@expo/vector-icons';
import InputField from '../components/InputField';
import EmptyState from '../components/EmptyState';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import InfoTooltip from '../components/InfoTooltip';
import Loader from '../components/Loader';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import SearchBar from '../components/SearchBar';
import { formatCurrency, converterParaBase, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcMargem, calcDespesasFixasPercentual } from '../utils/calculations';
// Sprint 2 S3 — fonte única da verdade para precificação delivery (substitui fórmula inline duplicada).
import { calcResultadoDelivery, sugerirPrecoDelivery, calcSugestaoDeliveryCompleta } from '../utils/deliveryPricing';
// Sessão 28.12 (D-22b): adapter pra extrair imposto% das despesas variáveis
import { extrairImpostoPercentual } from '../utils/deliveryAdapter';
// D-24: simulador em lote renderiza inline dentro do hub
import SimuladorLoteScreen from './SimuladorLoteScreen';

const isWeb = Platform.OS === 'web';

// Whitelist de campos numéricos editáveis em delivery_config (defesa contra SQL injection no UPDATE dinâmico)
const PLAT_NUMERIC_FIELDS = Object.freeze([
  'taxa_plataforma', 'taxa_entrega', 'comissao_app', 'desconto_promocao', 'embalagem_extra',
]);

function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const TABS = [
  { key: 'plataformas', label: 'Plataformas', icon: 'smartphone' },
  // Sessão 28.16: tab "Simulador de Preço" REMOVIDA — toque na célula da Visão Geral
  // pra ver detalhes da simulação (modal "Como calculado")
  { key: 'lote', label: 'Visão Geral', icon: 'grid' },
];

const KNOWN_PLATFORMS = [
  { nome: 'iFood', cor: '#EA1D2C', icon: 'smartphone' },
  { nome: 'Rappi', cor: '#FF6B00', icon: 'zap' },
  { nome: 'Uber Eats', cor: '#06C167', icon: 'truck' },
  { nome: '99Food', cor: '#FFCC00', icon: 'package' },
  { nome: 'Venda Direta', cor: colors.primary, icon: 'shopping-bag' },
];

export default function DeliveryHubScreen({ navigation }) {
  const { isDesktop, isMobile } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState('plataformas');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const isLoadingRef = useRef(false);

  // Plataformas state
  const [plataformas, setPlataformas] = useState([]);
  const [editingPlat, setEditingPlat] = useState(null);
  const [newPlatNome, setNewPlatNome] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);

  // Simulador state
  const [produtos, setProdutos] = useState([]);
  const [combos, setCombos] = useState([]);
  const [selectedProd, setSelectedProd] = useState(null);
  const [selectedPlat, setSelectedPlat] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [buscaProd, setBuscaProd] = useState('');
  const [precoCustom, setPrecoCustom] = usePersistedState('deliveryHub.precoMinimo', '');
  const [expandedPlats, setExpandedPlats] = useState({});
  const [margemDesejada, setMargemDesejada] = usePersistedState('deliveryHub.margemDesejada', '30');
  // Sessão 28.12 (D-22b): contexto financeiro — usa MESMA fórmula do balcão (lucro + custos fixos + variáveis + impostos)
  const [contextoFin, setContextoFin] = useState({ lucroPerc: 0.15, fixoPerc: 0, variavelPerc: 0, impostoPerc: 0, fatMedio: 0 });
  // Sessão 28.20: popup de cadastro de preços por plataforma (substitui tela dedicada)
  const [precosPopupPlat, setPrecosPopupPlat] = useState(null); // { id, nome }
  const [precosProdutos, setPrecosProdutos] = useState([]); // produtos pra mostrar no popup
  const [precosMap, setPrecosMap] = useState({}); // { produtoId: precoStr }
  const [precosLoading, setPrecosLoading] = useState(false);
  const precosSaveTimers = useRef({});

  useFocusEffect(useCallback(() => { loadData(); }, []));

  // Sessão 28.20: carrega produtos + preços salvos quando popup abre
  useEffect(() => {
    if (!precosPopupPlat) return;
    let cancelled = false;
    (async () => {
      setPrecosLoading(true);
      try {
        const db = await getDatabase();
        const [prods, ppds] = await Promise.all([
          db.getAllAsync('SELECT id, nome, preco_venda FROM produtos ORDER BY nome'),
          db.getAllAsync('SELECT produto_id, preco_venda FROM produto_preco_delivery WHERE plataforma_id = ?', [precosPopupPlat.id]).catch(() => []),
        ]);
        if (cancelled) return;
        setPrecosProdutos(prods || []);
        const map = {};
        (ppds || []).forEach(r => {
          const v = Number(r.preco_venda);
          if (Number.isFinite(v) && v > 0) map[r.produto_id] = String(v.toFixed(2)).replace('.', ',');
        });
        setPrecosMap(map);
      } catch (e) {
        console.warn('[DeliveryHub.precosPopup.load]', e?.message || e);
      } finally {
        if (!cancelled) setPrecosLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [precosPopupPlat?.id]);

  async function salvarPrecoDelivery(produtoId, valorStr) {
    if (!precosPopupPlat) return;
    const num = parseFloat(String(valorStr).replace(',', '.'));
    try {
      const db = await getDatabase();
      if (Number.isFinite(num) && num > 0) {
        const res = await db.runAsync(
          'UPDATE produto_preco_delivery SET preco_venda = ?, updated_at = NOW() WHERE produto_id = ? AND plataforma_id = ?',
          [num, produtoId, precosPopupPlat.id]
        );
        if (!res?.changes) {
          await db.runAsync(
            'INSERT INTO produto_preco_delivery (produto_id, plataforma_id, preco_venda) VALUES (?,?,?)',
            [produtoId, precosPopupPlat.id, num]
          );
        }
      } else {
        await db.runAsync('DELETE FROM produto_preco_delivery WHERE produto_id = ? AND plataforma_id = ?', [produtoId, precosPopupPlat.id]);
      }
    } catch (e) { console.warn('[DeliveryHub.precosPopup.save]', e?.message || e); }
  }

  function handlePrecoChange(produtoId, valor) {
    setPrecosMap(prev => ({ ...prev, [produtoId]: valor }));
    if (precosSaveTimers.current[produtoId]) clearTimeout(precosSaveTimers.current[produtoId]);
    precosSaveTimers.current[produtoId] = setTimeout(() => salvarPrecoDelivery(produtoId, valor), 800);
  }

  async function loadData() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
    const db = await getDatabase();
    const [plats, prods, allIngs, allPreps, allEmbs, comboRows, comboItensRows, cfgRows, fixasRows, varsRows, fatRows] = await Promise.all([
      db.getAllAsync('SELECT * FROM delivery_config ORDER BY id'),
      db.getAllAsync('SELECT * FROM produtos WHERE preco_venda > 0 ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_combo_itens'),
      // Sessão 28.12 (D-22b): contexto financeiro — mesma fonte usada no balcão
      db.getAllAsync('SELECT * FROM configuracao'),
      db.getAllAsync('SELECT valor FROM despesas_fixas'),
      db.getAllAsync('SELECT descricao, percentual FROM despesas_variaveis'),
      db.getAllAsync('SELECT valor FROM faturamento_mensal WHERE valor > 0'),
    ]);

    setPlataformas(plats);

    // D-22b: monta contexto financeiro pra simulador delivery (lucro + custos fixos + variáveis + imposto)
    try {
      const cfg = (cfgRows && cfgRows[0]) || {};
      const totalFixas = (fixasRows || []).reduce((a, r) => a + safeNum(r.valor), 0);
      const fatMedio = (fatRows || []).length > 0
        ? (fatRows || []).reduce((a, r) => a + safeNum(r.valor), 0) / (fatRows || []).length : 0;
      const fixoPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
      const lucroPerc = Number.isFinite(cfg.lucro_desejado_delivery) ? cfg.lucro_desejado_delivery
                      : Number.isFinite(cfg.lucro_desejado) ? cfg.lucro_desejado : 0.15;
      const impostoPerc = extrairImpostoPercentual(varsRows || []);
      const variavelPerc = (varsRows || []).reduce((a, d) => a + (Number.isFinite(d.percentual) ? d.percentual : 0), 0);
      setContextoFin({ lucroPerc, fixoPerc, variavelPerc, impostoPerc, fatMedio });
    } catch (e) {
      console.warn('[DeliveryHubScreen.contextoFin]', e?.message || e);
    }

    // Build product cost data
    const ingsByProd = {};
    allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
    const prepsByProd = {};
    allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
    const embsByProd = {};
    allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

    const prodData = prods.map(p => {
      const ings = ingsByProd[p.id] || [];
      const preps = prepsByProd[p.id] || [];
      const embs = embsByProd[p.id] || [];
      const custoIng = ings.reduce((a, ing) => a + calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada, ing.unidade_medida, ing.unidade_medida || 'g'), 0);
      const custoPr = preps.reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
      const custoEmb = embs.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);
      const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
      // Sessão 28.9 — Auditoria P0-02: usar calcMargem (bruta — delivery view não considera despesas operacionais)
      const margem = calcMargem(p.preco_venda, custoUnit);
      return { ...p, custoUnit, margem };
    });
    setProdutos(prodData);

    // Build combo cost data using product cost lookup
    const prodCostMap = {};
    prodData.forEach(p => { prodCostMap[p.id] = p.custoUnit; });
    const itensByCombo = {};
    comboItensRows.forEach(ci => { (itensByCombo[ci.combo_id] = itensByCombo[ci.combo_id] || []).push(ci); });

    const comboData = (comboRows || []).filter(c => c.preco_venda > 0).map(c => {
      const itens = itensByCombo[c.id] || [];
      const custoUnit = itens.reduce((a, item) => a + (prodCostMap[item.item_id] || 0) * (item.quantidade || 1), 0);
      const margem = calcMargem(c.preco_venda, custoUnit);
      return { ...c, custoUnit, margem, isCombo: true };
    });
    setCombos(comboData);
    } catch (e) {
      console.error('[DeliveryHubScreen.loadData]', e);
      setLoadError('Não foi possível carregar dados do delivery. Toque para tentar novamente.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }

  // ── Plataformas functions ──
  async function togglePlataforma(plat) {
    try {
      const db = await getDatabase();
      const newAtivo = plat.ativo ? 0 : 1;
      await db.runAsync('UPDATE delivery_config SET ativo = ? WHERE id = ?', [newAtivo, plat.id]);
      setPlataformas(prev => prev.map(p => p.id === plat.id ? { ...p, ativo: newAtivo } : p));
    } catch (e) {
      console.error('[DeliveryHubScreen.togglePlataforma]', e);
      setSaveError('Não foi possível ativar/desativar essa plataforma.');
      setTimeout(() => setSaveError(null), 4000);
    }
  }

  async function savePlatField(platId, field, value) {
    // Validação de field name (defesa contra SQL injection no UPDATE dinâmico)
    if (!PLAT_NUMERIC_FIELDS.includes(field)) {
      console.error('[DeliveryHubScreen.savePlatField] campo não permitido:', field);
      return;
    }
    const parsed = parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setSaveError('Digite um valor numérico válido (0 ou maior).');
      setTimeout(() => setSaveError(null), 4000);
      return;
    }
    try {
      const db = await getDatabase();
      await db.runAsync(`UPDATE delivery_config SET ${field} = ? WHERE id = ?`, [parsed, platId]);
      setPlataformas(prev => prev.map(p => p.id === platId ? { ...p, [field]: parsed } : p));
    } catch (e) {
      console.error('[DeliveryHubScreen.savePlatField]', field, e);
      setSaveError('Não foi possível salvar essa alteração. Tente novamente.');
      setTimeout(() => setSaveError(null), 4000);
    }
  }

  async function addPlataforma() {
    if (!newPlatNome.trim()) return;
    try {
      const db = await getDatabase();
      await db.runAsync(
        'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?,?,?,?,?,?)',
        [newPlatNome.trim(), 0, 0, 0, 0, 1]
      );
      setNewPlatNome('');
      loadData();
    } catch (e) {
      console.error('[DeliveryHubScreen.addPlataforma]', e);
      setSaveError('Não foi possível adicionar a plataforma.');
      setTimeout(() => setSaveError(null), 4000);
    }
  }

  async function deletePlataforma(id) {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM delivery_config WHERE id = ?', [id]);
      setDeleteModal(null);
      loadData();
    } catch (e) {
      console.error('[DeliveryHubScreen.deletePlataforma]', e);
      setSaveError('Não foi possível remover a plataforma.');
      setTimeout(() => setSaveError(null), 4000);
    }
  }

  // ── Simulador functions ──
  function simularPreco() {
    if (!selectedProd || !selectedPlat) return;
    const isComboSel = typeof selectedProd === 'string' && selectedProd.startsWith('combo_');
    const prod = isComboSel
      ? combos.find(c => 'combo_' + c.id === selectedProd)
      : produtos.find(p => p.id === selectedProd);
    const plat = plataformas.find(p => p.id === selectedPlat);
    if (!prod || !plat) return;

    // Sprint 2 S3 — delegado à fórmula canônica em src/utils/deliveryPricing.
    // Mantém os mesmos campos no setSimResult para preservar o render existente.
    const precoBalcao = prod.preco_venda;
    const custoUnit = prod.custoUnit;
    const margemBalcao = precoBalcao > 0 ? (precoBalcao - custoUnit) / precoBalcao : 0;

    const r = calcResultadoDelivery({ precoVenda: precoBalcao, custoUnit, plat });
    const comissaoPct = r.comissaoPct;
    const descontoPct = r.descontoPct;
    const cupomR$ = r.cupomR$;
    const taxaEntregaR$ = r.taxaEntregaR$;
    const valorDesconto = r.valorDesconto;
    const precoComDesconto = r.precoComDesconto;
    const precoAposCupom = r.precoAposCupom;
    const baseComissao = r.baseComissao;
    const valorComissao = r.valorComissao;
    const receitaLiqDelivery = r.receitaLiq;
    const lucroDelivery = r.lucro;
    const margemDelivery = precoBalcao > 0 ? lucroDelivery / precoBalcao : 0;

    const margemAlvoRaw = parseFloat(margemDesejada);
    const margemAlvo = (Number.isFinite(margemAlvoRaw) ? margemAlvoRaw : 30) / 100;
    const sug = sugerirPrecoDelivery({ custoUnit, plat, margemAlvo, arredondar: false });
    const precoSugerido = sug.precoSugerido;
    const precoMinimo = sug.precoMinimo;
    const divisorMin = (1 - descontoPct) * (1 - comissaoPct);

    // D-22b (sessão 28.12): preço sugerido COMPLETO usa MARGEM DO FINANCEIRO
    const sugCompleta = calcSugestaoDeliveryCompleta({
      cmv: custoUnit,
      plat,
      contexto: contextoFin,
    });

    // Sessão 28.16: SEGUNDA simulação — mantém a margem ATUAL do produto (do balcão)
    // Override do contexto financeiro substituindo lucroPerc pela margem real do produto
    const sugMantemMargem = (margemBalcao > 0 && precoBalcao > 0) ? calcSugestaoDeliveryCompleta({
      cmv: custoUnit,
      plat,
      contexto: { ...contextoFin, lucroPerc: margemBalcao },
    }) : null;

    setSimResult({
      prodNome: isComboSel ? prod.nome + ' (Combo)' : prod.nome,
      platNome: plat.plataforma,
      precoBalcao,
      custoUnit,
      comissaoPct: comissaoPct * 100,
      descontoPct: descontoPct * 100,
      cupomReais: cupomR$,
      taxaEntrega: taxaEntregaR$,
      margemBalcao,
      receitaLiqDelivery,
      lucroDelivery,
      margemDelivery,
      margemAlvo,
      precoSugerido: (Number.isFinite(precoSugerido) && precoSugerido > 0) ? precoSugerido : null,
      precoMinimo: (Number.isFinite(precoMinimo) && precoMinimo > 0) ? precoMinimo : null,
      inviavelPorTaxas: !(Number.isFinite(divisorMin) && divisorMin > 0),
      // Intermediate values for breakdown display
      valorDesconto,
      precoComDesconto,
      precoAposCupom,
      baseComissao,
      valorComissao,
      // Store raw values for recalculation with custom price
      _comissaoPct: comissaoPct,
      _descontoPct: descontoPct,
      _cupomReais: cupomR$,
      _taxaEntrega: taxaEntregaR$,
      // D-22b: sugestão completa (mesma fórmula balcão + extras delivery)
      sugCompleta,
      // Sessão 28.16: sugestão mantendo a margem atual do produto
      sugMantemMargem,
      contextoFin,
    });
    setPrecoCustom('');
  }

  function calcCustom() {
    if (!simResult) return null;
    const preco = parseFloat(String(precoCustom).replace(',', '.'));
    if (!Number.isFinite(preco) || preco <= 0) return null;
    // Sessão 28.9 — Auditoria P0-03: usar fonte canônica calcResultadoDelivery.
    // Reconstrói o `plat` shape pra alimentar a função (simResult guarda decimais já normalizados).
    const platLike = {
      taxa_plataforma: simResult._comissaoPct * 100,
      desconto_promocao: simResult._descontoPct * 100,
      embalagem_extra: simResult._cupomReais || 0,
      taxa_entrega: simResult._taxaEntrega || 0,
    };
    const r = calcResultadoDelivery({ precoVenda: preco, custoUnit: simResult.custoUnit, plat: platLike });
    return {
      preco, recLiq: r.receitaLiq, lucro: r.lucro, margem: r.margem,
      valorComissao: r.valorComissao, valorDesconto: r.valorDesconto,
      precoComDesconto: r.precoComDesconto, precoAposCupom: r.precoAposCupom,
      taxaEntrega: r.taxaEntregaR$,
    };
  }

  function getPlatColor(nome) {
    const found = KNOWN_PLATFORMS.find(p => nome.toLowerCase().includes(p.nome.toLowerCase()));
    return found?.cor || colors.primary;
  }

  // ── Render ──
  if (loading) {
    return (
      <View style={styles.container}>
        <Loader message="Calculando margens de delivery..." />
      </View>
    );
  }

  const ativas = plataformas.filter(p => p.ativo);

  return (
    <View style={styles.container}>
      {/* Sessão 25: pageShell centraliza TODO conteúdo no web (alinhado com
          Home/Simulador/Financeiro). Sem isso o conteúdo ficava colado à
          esquerda e destoava do resto do app. */}
      <View style={styles.pageShell}>
      {/* Page Header */}
      <View style={styles.pageHeader}>
        <View style={styles.pageHeaderIcon}>
          <Feather name="truck" size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageHeaderTitle}>Delivery</Text>
          <Text style={styles.pageHeaderSubtitle}>Gerencie produtos, plataformas e combos para iFood, Rappi e outros</Text>
        </View>
      </View>

      {/* Sessão 25: heroInfoCard removido — redundante com o subtítulo do
          pageHeader e o infoCard contextual de cada tab abaixo. */}

      {/* Tabs */}
      <View style={styles.tabsRow}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tab, isActive && styles.tabActive]}
              onPress={() => {
                setActiveTab(tab.key);
                if (tab.key === 'simulador' || tab.key === 'visaogeral') {
                  loadData();
                  setSimResult(null);
                }
              }}
              activeOpacity={0.7}
            >
              <Feather name={tab.icon} size={14} color={isActive ? colors.primary : colors.textSecondary} />
              <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Sessão 25: pageShell já cuida da centralização — ScrollView agora
          só preocupa com padding/paddingBottom interno. */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>

        {activeTab === 'plataformas' && (
          <>
            {/* Info */}
            <View style={styles.infoCard}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Cadastre as plataformas de delivery e suas taxas. O simulador usará esses dados para calcular o preço ideal.
              </Text>
            </View>

            {/* Active count */}
            <Text style={styles.countText}>{ativas.length} plataforma{ativas.length !== 1 ? 's' : ''} ativa{ativas.length !== 1 ? 's' : ''}</Text>

            {/* Plataformas list */}
            {plataformas.map(plat => {
              const isExpanded = editingPlat === plat.id;
              const cor = getPlatColor(plat.plataforma);
              return (
                <View key={plat.id} style={styles.platCard}>
                  <TouchableOpacity
                    style={styles.platHeader}
                    onPress={() => setEditingPlat(isExpanded ? null : plat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.platDot, { backgroundColor: cor }]} />
                    <Text style={styles.platName}>{plat.plataforma}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Switch
                        value={!!plat.ativo}
                        onValueChange={() => togglePlataforma(plat)}
                        trackColor={{ false: colors.border, true: colors.success + '50' }}
                        thumbColor={plat.ativo ? colors.success : colors.disabled}
                        accessibilityRole="switch"
                        accessibilityLabel={`${plat.ativo ? 'Desativar' : 'Ativar'} plataforma ${plat.plataforma}`}
                        accessibilityState={{ checked: !!plat.ativo }}
                      />
                      <Text style={[styles.platStatus, { color: plat.ativo ? colors.success : colors.disabled }]}>
                        {plat.ativo ? 'Ativa' : 'Inativa'}
                      </Text>
                      <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.platBody}>
                      <View style={styles.platFieldsRow}>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Comissão (%)</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.comissao_app || plat.taxa_plataforma || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'comissao_app', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Taxa entrega (R$)</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.taxa_entrega || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'taxa_entrega', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Desconto promo (%)</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.desconto_promocao || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'desconto_promocao', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Cupom em R$</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.embalagem_extra || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'embalagem_extra', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                      </View>
                      {/* Sessão 28.20: botão MAIS VISÍVEL — abre POPUP em vez de tela dedicada */}
                      <TouchableOpacity
                        style={{
                          backgroundColor: colors.primary, paddingVertical: 14, paddingHorizontal: spacing.md,
                          borderRadius: borderRadius.md, marginTop: spacing.sm, marginBottom: spacing.xs,
                          flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                        }}
                        onPress={() => setPrecosPopupPlat({ id: plat.id, nome: plat.plataforma })}
                        activeOpacity={0.85}
                      >
                        <Feather name="dollar-sign" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular }}>
                          💰 Cadastrar meus preços de venda nesta plataforma
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => setDeleteModal(plat)}
                      >
                        <Feather name="trash-2" size={14} color={colors.error} />
                        <Text style={styles.deleteBtnText}>Remover plataforma</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add platform */}
            <View style={styles.addPlatCard}>
              <Text style={styles.addPlatTitle}>Adicionar plataforma</Text>
              <View style={styles.addPlatRow}>
                <TextInput
                  style={[styles.platInput, { flex: 1 }]}
                  value={newPlatNome}
                  onChangeText={setNewPlatNome}
                  placeholder="Ex: iFood, Rappi..."
                  placeholderTextColor={colors.disabled}
                />
                <TouchableOpacity style={styles.addBtn} onPress={addPlataforma}>
                  <Feather name="plus" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {/* Quick add suggestions */}
              {plataformas.length < 3 && (
                <View style={styles.suggestRow}>
                  {KNOWN_PLATFORMS.filter(kp => !plataformas.some(p => p.plataforma.toLowerCase() === kp.nome.toLowerCase())).slice(0, 4).map(kp => (
                    <TouchableOpacity
                      key={kp.nome}
                      style={styles.suggestChip}
                      onPress={() => setNewPlatNome(kp.nome)}
                    >
                      <View style={[styles.suggestDot, { backgroundColor: kp.cor }]} />
                      <Text style={styles.suggestText}>{kp.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {/* D-24: simulador em lote inline (sem trocar de tela) */}
        {activeTab === 'lote' && (
          <SimuladorLoteScreen />
        )}

        {activeTab === 'simulador' && (
          <>
            {/* Info */}
            <View style={styles.infoCard}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Selecione um produto e uma plataforma para descobrir quanto cobrar no delivery mantendo sua margem de lucro.
              </Text>
            </View>

            {ativas.length === 0 ? (
              <EmptyState
                icon="smartphone"
                title="Nenhuma plataforma ativa"
                description="Cadastre e ative pelo menos uma plataforma na aba Plataformas para usar o simulador."
              />
            ) : produtos.length === 0 && combos.length === 0 ? (
              <EmptyState
                icon="tag"
                title="Nenhum produto cadastrado"
                description="Cadastre produtos com preço de venda para simular preços de delivery."
              />
            ) : (
              <>
                {/* Select product */}
                <Text style={styles.simLabel}>Selecione o produto</Text>
                <SearchBar value={buscaProd} onChangeText={(text) => { setBuscaProd(text); if (!text.trim()) { /* keep selected */ } }} placeholder="Buscar..." />
                {selectedProd && !buscaProd.trim() ? (
                  <TouchableOpacity
                    style={[styles.chip, styles.chipActive, { alignSelf: 'flex-start', marginBottom: spacing.sm }]}
                    onPress={() => { setSelectedProd(null); setSimResult(null); }}
                  >
                    <Text style={[styles.chipText, styles.chipTextActive]} numberOfLines={1}>
                      {(() => { const found = produtos.find(p => p.id === selectedProd); if (found) return found.nome; const fc = combos.find(c => 'combo_' + c.id === selectedProd); return fc ? fc.nome + ' (Combo)' : ''; })()}
                    </Text>
                    <Feather name="x" size={12} color="#fff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ) : buscaProd.trim() ? (
                  <View style={[styles.chipRow, { marginBottom: spacing.sm }]}>
                    {[...produtos.filter(p => normalizeSearch(p.nome).includes(normalizeSearch(buscaProd))).map(p => ({ ...p, _key: p.id, _label: p.nome })),
                      ...combos.filter(c => normalizeSearch(c.nome).includes(normalizeSearch(buscaProd))).map(c => ({ ...c, _key: 'combo_' + c.id, _label: c.nome + ' (Combo)' })),
                    ].map(item => (
                      <TouchableOpacity
                        key={item._key}
                        style={[styles.chip, selectedProd === item._key && styles.chipActive]}
                        onPress={() => { setSelectedProd(item._key); setBuscaProd(''); setSimResult(null); }}
                      >
                        {item.isCombo && <Feather name="layers" size={12} color={selectedProd === item._key ? '#fff' : colors.textSecondary} style={{ marginRight: 2 }} />}
                        <Text style={[styles.chipText, selectedProd === item._key && styles.chipTextActive]} numberOfLines={1}>{item._label}</Text>
                        <Text style={[styles.chipPrice, selectedProd === item._key && { color: '#fff' }]}>{formatCurrency(item.preco_venda)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {/* Select platform */}
                <Text style={[styles.simLabel, { marginTop: spacing.md }]}>Selecione a plataforma</Text>
                <View style={styles.chipRow}>
                  {ativas.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, selectedPlat === p.id && styles.chipActive]}
                      onPress={() => { setSelectedPlat(p.id); setSimResult(null); }}
                    >
                      <View style={[styles.suggestDot, { backgroundColor: getPlatColor(p.plataforma) }]} />
                      <Text style={[styles.chipText, selectedPlat === p.id && styles.chipTextActive]}>{p.plataforma}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Simulate button */}
                <TouchableOpacity
                  style={[styles.simBtn, (!selectedProd || !selectedPlat) && { opacity: 0.5 }]}
                  onPress={simularPreco}
                  disabled={!selectedProd || !selectedPlat}
                  accessibilityRole="button"
                  accessibilityLabel="Simular preço delivery"
                >
                  <Feather name="play" size={16} color="#fff" />
                  <Text style={styles.simBtnText}>Simular preço</Text>
                </TouchableOpacity>

                {/* Results */}
                {simResult && (
                  <View style={isDesktop ? { flexDirection: 'row', gap: 20 } : undefined}>
                  {/* Left column: analysis */}
                  <View style={isDesktop ? { flex: 3 } : undefined}>
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>{simResult.prodNome} no {simResult.platNome}</Text>

                    {/* Sessão 28.16: tooltip de estratégia */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginBottom: spacing.md, gap: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B' }}>
                      <Feather name="info" size={14} color="#92400E" style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 }}>
                        <Text style={{ fontFamily: fontFamily.bold }}>Estratégia: </Text>
                        nem todo produto precisa ter lucro alto no delivery. Itens com alta visibilidade (fotos atrativas, posição de destaque) podem ter margem menor pra atrair pedido. Avalie a precificação como ESTRATÉGIA DO NEGÓCIO COMO UM TODO, não item por item.
                      </Text>
                    </View>

                    {/* Sessão 28.16: bloco "Composição no Delivery" REMOVIDO (usuário pediu — confuso)
                        e bloco "Comparison se vender a R$X" REMOVIDO. Agora só o preço sugerido. */}

                    {/* Sessão 28.16: preço sugerido COM A SUA MARGEM DO FINANCEIRO (não a do balcão) */}
                    <View style={styles.suggestedCard}>
                      <Text style={styles.suggestedTitle}>Preço sugerido (sua margem de lucro do financeiro)</Text>
                      <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 15 }}>
                        Usa a margem de lucro definida nas Configurações Financeiras + TODOS os custos do seu negócio (CMV + custos fixos + variáveis + imposto + comissão + taxa pgto + cupom + frete).
                      </Text>
                      {simResult.sugCompleta?.validacao?.ok && Number.isFinite(simResult.sugCompleta?.preco) && simResult.sugCompleta.preco > 0 ? (
                        <>
                          <View style={[styles.suggestedRow, { borderTopWidth: 0, alignItems: 'center' }]}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.suggestedLabel}>Pra atingir {((contextoFin.lucroPerc || 0) * 100).toFixed(1)}% de lucro</Text>
                              <Text style={styles.suggestedSub}>Cobre todos os custos + a margem que você definiu</Text>
                            </View>
                            <Text style={[styles.suggestedPrice, { color: colors.success, fontSize: 20 }]}>
                              {formatCurrency(simResult.sugCompleta.preco)}
                            </Text>
                          </View>
                          {/* Composição completa */}
                          <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, marginTop: 8 }}>
                            <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 6 }}>
                              Composição do preço sugerido:
                            </Text>
                            {[
                              { label: 'CMV (insumos + embalagem)', value: simResult.sugCompleta.cmv },
                              { label: `Lucro desejado (${((contextoFin.lucroPerc || 0) * 100).toFixed(1)}%)`, value: simResult.sugCompleta.preco * (contextoFin.lucroPerc || 0) },
                              { label: `Custos fixos (${((contextoFin.fixoPerc || 0) * 100).toFixed(1)}% do faturamento)`, value: simResult.sugCompleta.preco * (contextoFin.fixoPerc || 0) },
                              { label: `Imposto (${((contextoFin.impostoPerc || 0) * 100).toFixed(1)}%)`, value: simResult.sugCompleta.preco * (contextoFin.impostoPerc || 0) },
                              { label: `Comissão plataforma (${simResult.comissaoPct.toFixed(1)}%)`, value: simResult.sugCompleta.preco * (simResult.comissaoPct / 100) },
                              ...(simResult.cupomReais > 0 ? [{ label: 'Cupom recorrente', value: simResult.cupomReais }] : []),
                              ...(simResult.taxaEntrega > 0 ? [{ label: 'Frete subsidiado', value: simResult.taxaEntrega }] : []),
                            ].map((row, i) => (
                              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                                <Text style={{ fontSize: 11, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{row.label}</Text>
                                <Text style={{ fontSize: 11, color: colors.text, fontFamily: fontFamily.medium }}>{formatCurrency(row.value)}</Text>
                              </View>
                            ))}
                          </View>
                          {/* Sessão 28.16: SEGUNDA simulação — mantém margem atual do produto */}
                          {simResult.sugMantemMargem?.validacao?.ok && Number.isFinite(simResult.sugMantemMargem?.preco) && simResult.sugMantemMargem.preco > 0 && (
                            <View style={{ marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border }}>
                              <View style={[styles.suggestedRow, { borderTopWidth: 0, alignItems: 'center', paddingHorizontal: 0 }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={[styles.suggestedLabel, { fontSize: 13 }]}>Pra MANTER a margem atual do produto</Text>
                                  <Text style={styles.suggestedSub}>
                                    Margem atual no balcão: {(simResult.margemBalcao * 100).toFixed(1)}%
                                    {simResult.margemBalcao !== (contextoFin.lucroPerc || 0) && ' (diferente da margem do financeiro)'}
                                  </Text>
                                </View>
                                <Text style={[styles.suggestedPrice, { color: colors.primary, fontSize: 18 }]}>
                                  {formatCurrency(simResult.sugMantemMargem.preco)}
                                </Text>
                              </View>
                            </View>
                          )}
                        </>
                      ) : (
                        <View style={{ padding: 10, backgroundColor: colors.error + '15', borderRadius: 8 }}>
                          <Text style={{ fontSize: 12, color: colors.error, fontFamily: fontFamily.medium }}>
                            ⚠️ Custos somam mais de 100% do preço — impossível cobrar mantendo lucro. Reduza comissão, cupom ou custos fixos.
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                  </View>

                  {/* Right column: custom price calculator */}
                  <View style={isDesktop ? { flex: 2, position: 'sticky', top: 80, alignSelf: 'flex-start' } : undefined}>
                    <View style={[styles.breakdownCard, { borderWidth: 2, borderColor: colors.primary + '30', marginTop: isDesktop ? 0 : spacing.md }]}>
                      <Text style={styles.breakdownTitle}>Quanto quero cobrar na plataforma?</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: fontFamily.regular }}>
                        Digite o preço que pretende cobrar e veja a composição real
                      </Text>
                      {(() => {
                        // Validação inline: aceita vazio (sem erro) ou número finito >= 0.
                        const trimmed = String(precoCustom).trim();
                        const parsedPreco = parseFloat(trimmed.replace(',', '.'));
                        const precoCustomInvalid = trimmed.length > 0 && (!Number.isFinite(parsedPreco) || parsedPreco < 0);
                        return (
                          <>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                              <Text style={{ fontSize: 15, fontFamily: fontFamily.bold, color: colors.text }}>R$</Text>
                              <TextInput
                                style={[
                                  styles.platInput,
                                  { flex: 1, fontSize: 18, fontFamily: fontFamily.bold, textAlign: 'center' },
                                  precoCustomInvalid && { borderColor: colors.error },
                                ]}
                                value={precoCustom}
                                onChangeText={setPrecoCustom}
                                keyboardType="numeric"
                                placeholder={simResult.precoSugerido ? simResult.precoSugerido.toFixed(2) : '0,00'}
                                placeholderTextColor={colors.disabled}
                                accessibilityLabel="Preço mínimo do produto em reais"
                              />
                            </View>
                            {precoCustomInvalid && (
                              <Text style={{ fontSize: 11, color: colors.error, marginTop: 4, fontFamily: fontFamily.medium }}>
                                Digite um valor numérico válido (0 ou maior).
                              </Text>
                            )}
                          </>
                        );
                      })()}
                      {(() => {
                        const custom = calcCustom();
                        if (!custom) return null;
                        // Sessão 28.13: composição completa igual ao "Preço sugerido"
                        // Lucro Líquido = Preço - (CMV + custos fixos + variáveis + impostos + comissão + cupom + frete)
                        const valLucroDesej = custom.preco * (contextoFin.lucroPerc || 0);
                        const valFixos = custom.preco * (contextoFin.fixoPerc || 0);
                        const valImposto = custom.preco * (contextoFin.impostoPerc || 0);
                        const valComissao = custom.preco * (simResult.comissaoPct / 100);
                        const totalGastos = simResult.custoUnit + valFixos + valImposto + valComissao + (simResult.cupomReais || 0) + (simResult.taxaEntrega || 0);
                        const lucroLiquidoReais = custom.preco - totalGastos;
                        const lucroLiquidoPerc = custom.preco > 0 ? (lucroLiquidoReais / custom.preco) : 0;
                        return (
                          <View style={{ marginTop: spacing.md }}>
                            <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 6 }}>
                              Composição com este preço:
                            </Text>
                            {[
                              { label: 'Preço cobrado na plataforma', value: custom.preco, bold: true, color: colors.text },
                              { label: 'CMV (insumos + embalagem)', value: -simResult.custoUnit, color: colors.error },
                              { label: `Custos fixos (${((contextoFin.fixoPerc || 0) * 100).toFixed(1)}% do faturamento)`, value: -valFixos, color: colors.error },
                              { label: `Imposto (${((contextoFin.impostoPerc || 0) * 100).toFixed(1)}%)`, value: -valImposto, color: colors.error },
                              { label: `Comissão plataforma (${simResult.comissaoPct.toFixed(1)}%)`, value: -valComissao, color: colors.error },
                              ...(simResult.cupomReais > 0 ? [{ label: 'Cupom recorrente', value: -simResult.cupomReais, color: colors.error }] : []),
                              ...(simResult.taxaEntrega > 0 ? [{ label: 'Frete subsidiado', value: -simResult.taxaEntrega, color: colors.error }] : []),
                            ].map((row, i) => (
                              <View key={i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 }}>
                                <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1, fontFamily: row.bold ? fontFamily.bold : fontFamily.regular }} numberOfLines={1}>{row.label}</Text>
                                <Text style={{ fontSize: 12, fontFamily: row.bold ? fontFamily.bold : fontFamily.medium, color: row.color || colors.text }}>
                                  {row.value < 0 ? '-' : ''}{formatCurrency(Math.abs(row.value))}
                                </Text>
                              </View>
                            ))}
                            {/* Lucro líquido em destaque */}
                            <View style={{ borderTopWidth: 1.5, borderTopColor: colors.border, marginTop: 8, paddingTop: 10 }}>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                                <Text style={{ fontSize: 13, fontFamily: fontFamily.bold, color: colors.text }}>Lucro líquido /un</Text>
                                <Text style={{ fontSize: 18, fontFamily: fontFamily.bold, color: lucroLiquidoReais >= 0 ? colors.success : colors.error }}>
                                  {formatCurrency(lucroLiquidoReais)}
                                </Text>
                              </View>
                              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                                <Text style={{ fontSize: 12, color: colors.textSecondary }}>Margem líquida</Text>
                                <Text style={{ fontSize: 14, fontFamily: fontFamily.bold, color: lucroLiquidoPerc >= 0.10 ? colors.success : lucroLiquidoPerc >= 0 ? colors.warning : colors.error }}>
                                  {(lucroLiquidoPerc * 100).toFixed(1)}%
                                </Text>
                              </View>
                              {lucroLiquidoReais < 0 && (
                                <Text style={{ fontSize: 11, color: colors.error, marginTop: 6, fontStyle: 'italic' }}>
                                  ⚠️ Você teria PREJUÍZO cobrando este valor. Aumente o preço ou reduza custos.
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* Sessão 28.12: tab "visaogeral" foi mesclada com "lote" — código antigo desativado */}
        {false && activeTab === 'visaogeral' && (
          <>
            <View style={styles.infoCard}>
              <Feather name="grid" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Visão geral de todos os seus produtos em cada plataforma ativa, com preço sugerido e impacto na margem.
              </Text>
            </View>

            {ativas.length === 0 ? (
              <EmptyState icon="smartphone" title="Nenhuma plataforma ativa" description="Ative pelo menos uma plataforma para ver a visão geral." />
            ) : (
              ativas.map(plat => {
                const comissao = (plat.comissao_app || plat.taxa_plataforma || 0) / 100;
                const descPct = (plat.desconto_promocao || 0) / 100;
                const cupom = plat.embalagem_extra || 0;
                const taxaEnt = plat.taxa_entrega || 0;
                const fixos = cupom + taxaEnt;
                const cor = getPlatColor(plat.plataforma);

                const isExpanded = expandedPlats[plat.id];

                return (
                  <View key={plat.id} style={styles.overviewCard}>
                    <TouchableOpacity
                      style={styles.overviewHeader}
                      onPress={() => setExpandedPlats(prev => ({ ...prev, [plat.id]: !prev[plat.id] }))}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.platDot, { backgroundColor: cor }]} />
                      <Text style={styles.overviewPlatName}>{plat.plataforma}</Text>
                      <Text style={styles.overviewPlatTax}>Comissão: {(comissao * 100).toFixed(0)}%</Text>
                      <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>

                    {isExpanded && <>
                    {/* Sessão 28+ — Table header só em desktop; mobile usa cards */}
                    {!isMobile && (
                      <View style={styles.overviewTableHeader}>
                        <Text style={[styles.overviewTh, { flex: 2 }]}>Produto</Text>
                        <Text style={[styles.overviewTh, { flex: 1, textAlign: 'center' }]}>Balcão</Text>
                        <Text style={[styles.overviewTh, { flex: 1, textAlign: 'center' }]}>Sugerido</Text>
                        <Text style={[styles.overviewTh, { flex: 1, textAlign: 'center' }]}>Margem</Text>
                      </View>
                    )}

                    {[...produtos.map(p => ({ ...p, _key: 'prod_' + p.id, _label: p.nome })),
                      ...combos.map(c => ({ ...c, _key: 'combo_' + c.id, _label: c.nome + ' (Combo)' })),
                    ].map((prod, idx) => {
                      // Sessão 28.9 — Auditoria P0-03: usar fonte canônica calcResultadoDelivery + sugerirPrecoDelivery
                      const platLikeVG = {
                        taxa_plataforma: comissao * 100,
                        desconto_promocao: descPct * 100,
                        embalagem_extra: cupom,
                        taxa_entrega: taxaEnt,
                      };
                      const rVG = calcResultadoDelivery({ precoVenda: prod.preco_venda, custoUnit: prod.custoUnit, plat: platLikeVG });
                      const lucro = rVG.lucro;
                      const margemDel = rVG.margem;
                      const margemAlvoVG = (parseFloat(margemDesejada) || 30) / 100;
                      const sugVG = sugerirPrecoDelivery({ custoUnit: prod.custoUnit, plat: platLikeVG, margemAlvo: margemAlvoVG, arredondar: false });
                      const precoSug = sugVG.inviavel ? 0 : (sugVG.precoSugerido || 0);

                      const margemColor = margemDel < 0.05 ? colors.error : margemDel < 0.15 ? colors.warning : colors.success;

                      // Sessão 28+ — mobile-web: card empilhado em vez de linha de tabela
                      if (isMobile) {
                        return (
                          <View
                            key={prod._key}
                            style={[styles.overviewCardMobile, { borderLeftColor: margemColor }]}
                            accessibilityLabel={`${prod._label}, balcão ${formatCurrency(prod.preco_venda)}, sugerido ${precoSug > 0 ? formatCurrency(precoSug) : 'indisponível'}, margem ${(margemDel * 100).toFixed(1)}%`}
                          >
                            <View style={styles.overviewCardHeader}>
                              {prod.isCombo && <Feather name="layers" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />}
                              <Text style={styles.overviewCardTitle} numberOfLines={2}>{prod._label}</Text>
                            </View>
                            <View style={styles.overviewCardRow}>
                              <Text style={styles.overviewCardLabel}>Balcão:</Text>
                              <Text style={styles.overviewCardValue}>{formatCurrency(prod.preco_venda)}</Text>
                            </View>
                            <View style={styles.overviewCardRow}>
                              <Text style={styles.overviewCardLabel}>Sugerido:</Text>
                              <Text style={[styles.overviewCardValue, { color: colors.primary }]}>
                                {precoSug > 0 ? formatCurrency(precoSug) : '—'}
                              </Text>
                            </View>
                            <View style={styles.overviewCardRow}>
                              <Text style={styles.overviewCardLabel}>Margem:</Text>
                              <Text style={[styles.overviewCardValue, { color: margemColor }]}>
                                {(margemDel * 100).toFixed(1)}%
                              </Text>
                            </View>
                          </View>
                        );
                      }

                      return (
                        <View key={prod._key} style={[styles.overviewRow, idx % 2 === 0 && { backgroundColor: colors.inputBg }]}>
                          <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {prod.isCombo && <Feather name="layers" size={12} color={colors.textSecondary} />}
                            <Text style={[styles.overviewTd]} numberOfLines={1}>{prod._label}</Text>
                          </View>
                          <Text style={[styles.overviewTd, { flex: 1, textAlign: 'center' }]}>{formatCurrency(prod.preco_venda)}</Text>
                          <Text style={[styles.overviewTd, { flex: 1, textAlign: 'center', color: colors.primary, fontFamily: fontFamily.semiBold }]}>
                            {precoSug > 0 ? formatCurrency(precoSug) : '—'}
                          </Text>
                          <Text style={[styles.overviewTd, { flex: 1, textAlign: 'center', color: margemColor, fontFamily: fontFamily.semiBold }]}>
                            {(margemDel * 100).toFixed(1)}%
                          </Text>
                        </View>
                      );
                    })}
                    </>}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>
      </View>{/* /pageShell */}

      {/* Delete modal */}
      <ConfirmDeleteModal
        visible={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={() => deleteModal && deletePlataforma(deleteModal.id)}
        itemName={deleteModal?.plataforma || ''}
      />

      {/* Sessão 28.20: Popup de cadastro de preços de venda por plataforma */}
      <Modal visible={!!precosPopupPlat} transparent animationType="fade" onRequestClose={() => setPrecosPopupPlat(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 12, width: '100%', maxWidth: 600, maxHeight: '85%', overflow: 'hidden' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text }}>
                  💰 Preços de venda — {precosPopupPlat?.nome}
                </Text>
                <Text style={{ fontSize: fonts.small, color: colors.textSecondary, marginTop: 2 }}>
                  Quanto você cobra de cada produto nesta plataforma. Salvo automático.
                </Text>
              </View>
              <TouchableOpacity onPress={() => setPrecosPopupPlat(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            {precosLoading ? (
              <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Text style={{ color: colors.textSecondary }}>Carregando...</Text>
              </View>
            ) : precosProdutos.length === 0 ? (
              <View style={{ padding: spacing.lg, alignItems: 'center' }}>
                <Feather name="package" size={32} color={colors.disabled} />
                <Text style={{ color: colors.textSecondary, marginTop: 8 }}>Sem produtos cadastrados.</Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 480 }}>
                <View style={{ padding: spacing.md, gap: 8 }}>
                  {precosProdutos.map(p => (
                    <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: fonts.regular, color: colors.text }} numberOfLines={1}>{p.nome}</Text>
                        <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                          Balcão: {(typeof p.preco_venda === 'number' ? p.preco_venda : 0).toFixed(2).replace('.', ',')}
                        </Text>
                      </View>
                      <Text style={{ fontSize: fonts.small, color: colors.text, fontFamily: fontFamily.bold }}>R$</Text>
                      <TextInput
                        style={{
                          width: 90, borderWidth: 1, borderColor: colors.border, borderRadius: 6,
                          paddingHorizontal: 8, paddingVertical: 6, fontSize: fonts.regular,
                          color: colors.text, backgroundColor: '#fff', textAlign: 'right',
                        }}
                        placeholder="0,00"
                        placeholderTextColor={colors.disabled}
                        keyboardType="numeric"
                        value={precosMap[p.id] || ''}
                        onChangeText={(v) => handlePrecoChange(p.id, v)}
                      />
                    </View>
                  ))}
                </View>
              </ScrollView>
            )}
            <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
              <TouchableOpacity
                style={{ backgroundColor: colors.primary, paddingVertical: 12, borderRadius: 8, alignItems: 'center' }}
                onPress={() => setPrecosPopupPlat(null)}
                activeOpacity={0.85}
              >
                <Text style={{ color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular }}>Fechar</Text>
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
  // Sessão 25: shell centralizado — alinha com Home/Simulador/Financeiro.
  pageShell: {
    flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center',
  },
  content: { padding: spacing.md, paddingBottom: 60 },

  // Page Header
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pageHeaderIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  pageHeaderTitle: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  pageHeaderSubtitle: { fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },

  // Hero info card (above tabs)
  heroInfoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.primary + '08',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    padding: spacing.md, marginTop: spacing.sm, marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  heroInfoText: { flex: 1, fontSize: fonts.small, color: colors.text, fontFamily: fontFamily.regular, lineHeight: 18 },

  // Tabs (underline style)
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', flexDirection: 'row', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    justifyContent: 'center',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  tabTextActive: { color: colors.primary },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 18 },

  // Count
  countText: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: spacing.sm },

  // Platform card
  platCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  platHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md,
  },
  platDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  platName: { flex: 1, fontSize: fonts.body, fontFamily: fontFamily.semiBold, color: colors.text },
  platStatus: { fontSize: 11, fontFamily: fontFamily.medium },
  platBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  platFieldsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  platField: { flex: 1, minWidth: 120 },
  platFieldLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: 4 },
  platInput: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    padding: 10, fontSize: fonts.body, fontFamily: fontFamily.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border, height: 40,
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
  deleteBtnText: { fontSize: 12, color: colors.error, fontFamily: fontFamily.medium },

  // Add platform
  addPlatCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addPlatTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  addPlatRow: { flexDirection: 'row', gap: spacing.sm },
  addBtn: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
  },
  suggestDot: { width: 8, height: 8, borderRadius: 4 },
  suggestText: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium },

  // Simulator
  simLabel: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.xs },
  chipScroll: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: borderRadius.sm, backgroundColor: colors.inputBg,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  chipTextActive: { color: '#fff' },
  chipPrice: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: 12, marginTop: spacing.md, marginBottom: spacing.md,
  },
  simBtnText: { color: '#fff', fontSize: fonts.body, fontFamily: fontFamily.semiBold },

  // Results
  resultCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  resultTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.md },
  compareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.md,
  },
  compareCol: { flex: 1, alignItems: 'center' },
  compareLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, textAlign: 'center', marginBottom: 4 },
  compareValue: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.text },
  compareSub: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },

  breakdownCard: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  breakdownTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  breakdownLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular },
  breakdownValue: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text },

  suggestedCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  suggestedTitle: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4 },
  suggestedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  suggestedLabel: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  suggestedSub: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },
  suggestedPrice: { fontSize: 20, fontFamily: fontFamily.bold },

  // Overview (Visão Geral)
  overviewCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.md, overflow: 'hidden',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  overviewHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  overviewPlatName: { flex: 1, fontSize: 15, fontFamily: fontFamily.bold, color: colors.text },
  overviewPlatTax: { fontSize: 12, fontFamily: fontFamily.medium, color: colors.textSecondary },
  overviewTableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  overviewTh: { fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.textSecondary, textTransform: 'uppercase' },
  overviewRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.md },
  overviewTd: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.text },

  // ── Sessão 28+ — mobile-web cards (substitui overviewRow apertada em < 1024px) ──
  overviewCardMobile: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    minHeight: 44,
  },
  overviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  overviewCardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  overviewCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 24,
  },
  overviewCardLabel: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  overviewCardValue: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
});
