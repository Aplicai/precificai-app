import React, { useState, useCallback, useRef, useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import InfoTooltip from '../components/InfoTooltip';
import BCGQuadranteModal from '../components/BCGQuadranteModal';
import Loader from '../components/Loader';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';

// Safe number helper: evita NaN/Infinity vazando para cálculos financeiros.
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

// Classification config (audit P1-07): nomes afetivos em vez de jargão BCG.
// Chaves mantidas em português gastronômico para compatibilidade com dados
// salvos; LABELS exibidos seguem a linguagem do audit (mina de ouro, aposta...).
const CLASSIFICATIONS = {
  'Estrela': {
    icon: 'star', label: 'Estrelas', emoji: '\u2B50',
    bg: '#FFF8E1', border: '#FFD700', color: '#D4A017',
    desc: 'Vendem muito E dão lucro alto. São seus campeões — mantenha sempre disponíveis e destaque no cardápio.',
    acao: 'Promover e manter',
    short: 'Estrela',
  },
  'Cavalo de Batalha': {
    icon: 'trending-up', label: 'Mina de Ouro', emoji: '\uD83D\uDCB0',
    bg: '#E8F5E9', border: '#4CAF50', color: '#388E3C',
    desc: 'Vendem muito mas a margem está apertada. Renegocie ingredientes ou suba o preço aos poucos — uma alta de 5% pode dobrar o lucro.',
    acao: 'Otimizar custos',
    short: 'Mina',
  },
  'Quebra-Cabeça': {
    icon: 'help-circle', label: 'Apostas', emoji: '\uD83C\uDFB2',
    bg: '#E3F2FD', border: '#2196F3', color: '#1565C0',
    desc: 'Margem alta mas vendem pouco. Vale divulgar mais, fazer combo ou colocar em destaque — o potencial está aí.',
    acao: 'Divulgar mais',
    short: 'Aposta',
  },
  'Abacaxi': {
    icon: 'alert-triangle', label: 'Repensar', emoji: '\uD83C\uDF4D',
    bg: '#FFEBEE', border: '#F44336', color: '#C62828',
    desc: 'Vendem pouco e dão pouco lucro. Hora de decidir: reformular a receita, subir o preço ou tirar do cardápio.',
    acao: 'Reformular ou retirar',
    short: 'Repensar',
  },
};

const CLASSIFICATION_ORDER = ['Estrela', 'Cavalo de Batalha', 'Quebra-Cabeça', 'Abacaxi'];

// Mapeia a chave interna de classificação (PT gastronômico) para a chave aceita
// pelo BCGQuadranteModal (semântica BCG). Isso desacopla o domínio (nomes
// afetivos exibidos ao usuário) da pedagogia BCG do modal.
//   Estrela          → alta margem + alta vendagem      → 'estrela'
//   Cavalo de Batalha→ baixa margem + alta vendagem     → 'interrogacao'
//   Quebra-Cabeça    → alta margem + baixa vendagem     → 'vaca'
//   Abacaxi          → baixa margem + baixa vendagem    → 'abacaxi'
const CLASSIFICATION_TO_QUADRANTE = {
  'Estrela': 'estrela',
  'Cavalo de Batalha': 'interrogacao',
  'Quebra-Cabeça': 'vaca',
  'Abacaxi': 'abacaxi',
};

function getMarginColor(margin) {
  if (margin >= 40) return colors.success;
  if (margin >= 20) return '#D4A017';
  return colors.error;
}

export default function MatrizBCGScreen({ navigation }) {
  const [produtos, setProdutos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [vendasMap, setVendasMap] = useState({});
  const [prevVendasMap, setPrevVendasMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [showVendas, setShowVendas] = useState(false);
  const [needsUpdate, setNeedsUpdate] = useState(false);
  const [filterClass, setFilterClass] = usePersistedState('bcg.filterClass', null);
  const [sortBy, setSortBy] = usePersistedState('bcg.sortBy', 'classificacao');
  const [sortDir, setSortDir] = usePersistedState('bcg.sortDir', 'asc');
  const [searchText, setSearchText] = useState('');
  const [quadranteModal, setQuadranteModal] = useState(null); // chave do BCGQuadranteModal ou null
  const { isDesktop, isMobile } = useResponsiveLayout();
  const saveTimer = useRef(null);

  // Date strings memoizados — não mudam durante a sessão e são usados em queries/labels.
  // Deps vazias: calculados uma única vez (dia mudar no meio de uma sessão é edge case aceitável).
  const { currentMonth, monthName, prevMonthStr, prevMonthName } = useMemo(() => {
    const now = new Date();
    const prev = new Date();
    prev.setMonth(prev.getMonth() - 1);
    return {
      currentMonth: now.toISOString().slice(0, 7),
      monthName: now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
      prevMonthStr: prev.toISOString().slice(0, 7),
      prevMonthName: prev.toLocaleDateString('pt-BR', { month: 'long' }),
    };
  }, []);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function saveVenda(prodId, qty) {
    const db = await getDatabase();
    // Sessão 28.47 — bug #5: combos têm prodId negativo (sentinel) e não
    // podem ir pra `vendas` (FK constraint produtos.id). Roteamos pra tabela
    // dedicada `vendas_combos`. Antes: INSERT silenciosamente falhava por FK.
    if (prodId < 0) {
      const comboId = -prodId;
      await db.runAsync('DELETE FROM vendas_combos WHERE combo_id = ? AND data = ?', [comboId, currentMonth]);
      if (qty > 0) {
        try {
          await db.runAsync('INSERT INTO vendas_combos (combo_id, data, quantidade) VALUES (?,?,?)', [comboId, currentMonth, qty]);
        } catch (e) { console.warn('[BCG.saveVenda.combo]', e); }
      }
    } else {
      await db.runAsync('DELETE FROM vendas WHERE produto_id = ? AND data = ?', [prodId, currentMonth]);
      if (qty > 0) {
        await db.runAsync('INSERT INTO vendas (produto_id, data, quantidade) VALUES (?,?,?)', [prodId, currentMonth, qty]);
      }
    }
    // Sessão 28.27 BUG FIX: NÃO reclassifica enquanto o user está em modo "Vendas".
    // Antes (28.17): salvava → loadData() rodava → matriz re-renderizava → form
    // colapsava → user tinha que clicar em "Vendas" de novo a cada produto.
    // Agora: persiste a venda, mas só reclassifica DEPOIS que o user fecha
    // o modo Vendas (handleSairVendas). O state local (vendasMap) já reflete
    // a digitação imediata, então UX continua responsiva.
    if (!showVendas) {
      try { await loadData(); } catch {}
    }
  }

  function handleVendaChange(prodId, value) {
    // Sessão 28.27: aceita "5", "5,5", "5.5" — parseInt antigo descartava decimais
    const cleaned = String(value).replace(',', '.').replace(/[^0-9.]/g, '');
    const qty = parseInt(cleaned) || 0;
    setVendasMap(prev => ({ ...prev, [prodId]: qty }));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveVenda(prodId, qty), 800);
  }

  // Sessão 28.27: chamado quando user sai do modo Vendas → faz a reclassificação
  // pendente UMA vez (em vez de a cada venda).
  async function handleSairVendas() {
    setShowVendas(false);
    // Garante que último timer pendente seja flushado
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    try { await loadData(); } catch {}
  }

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const db = await getDatabase();
      const [prods, allIngs, allPreps, allEmbs, vendas, prevVendas, cats, comboRows, comboItensRows, vendasCombos, prevVendasCombos] = await Promise.all([
        db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        // Sessão 28.44 — security: placeholder ao invés de interpolar string em SQL
        db.getAllAsync('SELECT * FROM vendas WHERE data = ?', [currentMonth]),
        db.getAllAsync('SELECT * FROM vendas WHERE data = ?', [prevMonthStr]),
        db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome'),
        db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
        db.getAllAsync('SELECT * FROM delivery_combo_itens'),
        // Sessão 28.47 — bug #5: vendas de combos vêm de tabela dedicada
        db.getAllAsync('SELECT * FROM vendas_combos WHERE data = ?', [currentMonth]).catch(() => []),
        db.getAllAsync('SELECT * FROM vendas_combos WHERE data = ?', [prevMonthStr]).catch(() => []),
      ]);
      setCategorias(cats || []);

      const ingsByProd = {}, prepsByProd = {}, embsByProd = {};
      (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      const vMap = {};
      (vendas || []).forEach(v => { vMap[v.produto_id] = safeNum(v.quantidade); });
      // Sessão 28.47 — bug #5: combos têm key negativa (-combo_id) no vMap
      (vendasCombos || []).forEach(v => { vMap[-v.combo_id] = safeNum(v.quantidade); });
      setVendasMap(vMap);

      const pvMap = {};
      (prevVendas || []).forEach(v => { pvMap[v.produto_id] = safeNum(v.quantidade); });
      (prevVendasCombos || []).forEach(v => { pvMap[-v.combo_id] = safeNum(v.quantidade); });
      setPrevVendasMap(pvMap);

      const hasCurrentMonth = vendas && vendas.length > 0;
      setNeedsUpdate(!hasCurrentMonth);
      setShowVendas(!hasCurrentMonth);

      const result = [];
      for (const p of prods) {
        const ings = ingsByProd[p.id] || [];
        const custoIng = ings.reduce((a, i) => a + safeNum(calcCustoIngrediente(safeNum(i.preco_por_kg), i.quantidade_utilizada, i.unidade_medida, i.unidade_medida)), 0);
        const preps = prepsByProd[p.id] || [];
        const custoPr = preps.reduce((a, pp) => a + safeNum(calcCustoPreparo(safeNum(pp.custo_por_kg), pp.quantidade_utilizada, pp.unidade_medida || 'g')), 0);
        const embs = embsByProd[p.id] || [];
        const custoEmb = embs.reduce((a, e) => a + safeNum(e.preco_unitario) * safeNum(e.quantidade_utilizada), 0);
        const divisor = getDivisorRendimento(p);
        const custoUnitario = divisor > 0 ? safeNum((custoIng + custoPr + custoEmb) / divisor) : 0;
        const precoVenda = safeNum(p.preco_venda);
        const margemPerc = precoVenda > 0 ? safeNum(((precoVenda - custoUnitario) / precoVenda) * 100) : 0;
        const qtdVendida = safeNum(vMap[p.id]);
        // Sessão 28.47 — bug #6: classificação BCG usa vendas do MÊS ANTERIOR
        // (mais estável; mês corrente está incompleto).
        const qtdVendidaRanking = safeNum(pvMap[p.id]);
        result.push({ ...p, custoUnitario, margemPerc, precoVenda, qtdVendida, qtdVendidaRanking, isCombo: false });
      }

      // Add combos
      const prodCostMap = {};
      result.forEach(p => { prodCostMap[p.id] = p.custoUnitario; });
      const itensByCombo = {};
      (comboItensRows || []).forEach(ci => { (itensByCombo[ci.combo_id] = itensByCombo[ci.combo_id] || []).push(ci); });

      for (const c of (comboRows || [])) {
        const precoVenda = safeNum(c.preco_venda);
        if (precoVenda <= 0) continue;
        const itens = itensByCombo[c.id] || [];
        const custoUnitario = itens.reduce((a, item) => a + safeNum(prodCostMap[item.item_id]) * safeNum(item.quantidade || 1), 0);
        const margemPerc = precoVenda > 0 ? safeNum(((precoVenda - custoUnitario) / precoVenda) * 100) : 0;
        // Use negative ID for combo vendas to avoid collision with product IDs
        const comboVendaKey = -c.id;
        const qtdVendida = safeNum(vMap[comboVendaKey]);
        const qtdVendidaRanking = safeNum(pvMap[comboVendaKey]);
        result.push({
          ...c, id: comboVendaKey, nome: c.nome + ' (Combo)', custoUnitario, margemPerc,
          precoVenda, qtdVendida, qtdVendidaRanking, isCombo: true, comboId: c.id,
        });
      }

      // Classify using median
      // Sessão 28.25 BUG FIX: produto SEM venda no mês NÃO pode virar Estrela/Cavalo de Batalha.
      // Antes: mediana de vendas podia ser 0 quando ninguém cadastrou venda → todos viravam
      // "altaVenda" pelo `>= 0` → produtos zerados eram classificados como Estrela.
      // Agora: só entram na mediana produtos COM venda > 0; produtos com venda zero
      // recebem classificação base por margem (Quebra-Cabeça se margem alta, Abacaxi se baixa).
      const validItems = result.filter(p => p.precoVenda > 0);
      if (validItems.length < 2) {
        setProdutos(result.map(p => ({ ...p, classificacao: 'Quebra-Cabeça' })));
        return;
      }
      const sorted = (arr) => [...arr].sort((a, b) => a - b);
      const median = (arr) => { const s = sorted(arr); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
      // Sessão 28.47 — bug #6: classificação usa qtdVendidaRanking (mês anterior).
      const itensComVenda = validItems.filter(p => p.qtdVendidaRanking > 0);
      const medianaVendas = itensComVenda.length > 0 ? median(itensComVenda.map(p => p.qtdVendidaRanking)) : 0;
      const medianaMargem = median(validItems.map(p => p.margemPerc));

      const classified = result.map(p => {
        const altaMargem = p.margemPerc >= medianaMargem;
        // Produto sem venda no mês anterior NUNCA é "alta venda".
        const altaVenda = p.qtdVendidaRanking > 0 && p.qtdVendidaRanking >= medianaVendas;
        let classificacao;
        if (altaMargem && altaVenda) classificacao = 'Estrela';
        else if (!altaMargem && altaVenda) classificacao = 'Cavalo de Batalha';
        else if (altaMargem && !altaVenda) classificacao = 'Quebra-Cabeça';
        else classificacao = 'Abacaxi';
        return { ...p, classificacao };
      });

      setProdutos(classified);
    } catch (e) {
      console.error('[MatrizBCG.loadData]', e);
      setLoadError('Não foi possível carregar a análise. Verifique seus dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function navigateToProduto(item) {
    if (item.isCombo) {
      // Combos: navega para o Delivery Hub (que tem acesso aos combos)
      navigation.navigate('DeliveryHub');
    } else if (item.id > 0) {
      navigation.navigate('BCGProdutoForm', { id: item.id });
    }
  }

  // Gera explicação didática para leigos
  function getExplicacaoItem(item) {
    const margem = item.margemPerc;
    const vendas = item.qtdVendida;
    const cls = item.classificacao;

    if (cls === 'Estrela') {
      return `Margem de ${margem.toFixed(0)}% é alta e vende bem (${vendas} un/mês). Continue investindo nele!`;
    } else if (cls === 'Cavalo de Batalha') {
      return `Vende bem (${vendas} un/mês), mas a margem de ${margem.toFixed(0)}% é baixa. Tente reduzir custos ou aumentar o preço.`;
    } else if (cls === 'Quebra-Cabeça') {
      return `Margem de ${margem.toFixed(0)}% é boa, mas vende pouco (${vendas} un/mês). Divulgue mais ou crie combos com ele.`;
    } else {
      return `Margem baixa (${margem.toFixed(0)}%) e poucas vendas (${vendas} un/mês). Considere reformular, aumentar o preço ou retirar do cardápio.`;
    }
  }

  // Sort & filter logic
  const sortedProducts = useMemo(() => {
    let filtered = produtos.filter(p => p.precoVenda > 0);
    if (filterClass) {
      filtered = filtered.filter(p => p.classificacao === filterClass);
    }
    if (searchText.trim()) {
      const term = searchText.toLowerCase().trim();
      filtered = filtered.filter(p => p.nome.toLowerCase().includes(term));
    }
    const classOrder = { 'Estrela': 0, 'Cavalo de Batalha': 1, 'Quebra-Cabeça': 2, 'Abacaxi': 3 };
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'nome') cmp = a.nome.localeCompare(b.nome);
      else if (sortBy === 'margem') cmp = a.margemPerc - b.margemPerc;
      else if (sortBy === 'vendas') cmp = a.qtdVendida - b.qtdVendida;
      else if (sortBy === 'classificacao') cmp = (classOrder[a.classificacao] || 0) - (classOrder[b.classificacao] || 0);
      return sortDir === 'desc' ? -cmp : cmp;
    });
    return filtered;
  }, [produtos, searchText, sortBy, sortDir, filterClass]);

  function handleSort(col) {
    if (sortBy === col) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(col);
      setSortDir(col === 'nome' || col === 'classificacao' ? 'asc' : 'desc');
    }
  }

  // Count by classification
  const counts = useMemo(() => {
    const c = { 'Estrela': 0, 'Cavalo de Batalha': 0, 'Quebra-Cabeça': 0, 'Abacaxi': 0 };
    produtos.filter(p => p.precoVenda > 0).forEach(p => { if (c[p.classificacao] !== undefined) c[p.classificacao]++; });
    return c;
  }, [produtos]);

  const vendasProducts = useMemo(() => produtos.filter(p => p.precoVenda > 0), [produtos]);

  const CATEGORY_DOT_COLORS = ['#004d47', '#E67E22', '#8E44AD', '#2980B9', '#27AE60', '#C0392B', '#F39C12', '#1ABC9C'];

  const vendasByCategory = useMemo(() => {
    const prods = produtos.filter(p => p.precoVenda > 0);
    const catMap = {};
    categorias.forEach(c => { catMap[c.id] = c.nome; });

    const groups = {};
    prods.forEach(p => {
      const catName = p.isCombo ? 'Combos Delivery' : (catMap[p.categoria_id] || 'Sem categoria');
      if (!groups[catName]) groups[catName] = [];
      groups[catName].push(p);
    });

    // Sort category names, but put "Sem categoria" last and "Combos Delivery" before it
    const sortedKeys = Object.keys(groups).sort((a, b) => {
      if (a === 'Sem categoria') return 1;
      if (b === 'Sem categoria') return -1;
      if (a === 'Combos Delivery') return 1;
      if (b === 'Combos Delivery') return -1;
      return a.localeCompare(b);
    });

    return sortedKeys.map((catName, idx) => ({
      catName,
      color: CATEGORY_DOT_COLORS[idx % CATEGORY_DOT_COLORS.length],
      products: groups[catName],
    }));
  }, [produtos, categorias]);

  function renderSortIcon(col) {
    if (sortBy !== col) return null;
    return <Feather name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'} size={12} color={colors.primary} style={{ marginLeft: 2 }} />;
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1200, alignSelf: 'center', width: '100%' }]}>

      {loadError ? (
        <View style={styles.errorBanner}>
          <Feather name="alert-octagon" size={16} color={colors.error} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity style={styles.errorBannerBtn} onPress={loadData} activeOpacity={0.7}>
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Step 1: Header */}
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {/* Sprint 1 Q4 — "Ranking de Produtos" no header (linguagem clara). */}
          <Text style={styles.title}>Ranking de Produtos</Text>
          <InfoTooltip
            title="Como funciona?"
            text="Classifica cada produto pela margem de contribuição × popularidade (vendas do MÊS ANTERIOR — mais estável que o mês corrente, que ainda não fechou). A mediana divide os produtos em 4 quadrantes (também conhecido como Engenharia do Cardápio)."
          />
        </View>
        <Text style={styles.subtitle}>Classificação baseada nas vendas do mês anterior (mais estável que o mês corrente). Você ainda registra as vendas do mês atual abaixo.</Text>
      </View>

      {/* Sales CTA - always visible when not editing */}
      {!showVendas && !loading && (
        <TouchableOpacity
          style={{
            backgroundColor: needsUpdate ? colors.warning + '15' : colors.primary + '08',
            borderWidth: 1.5,
            borderColor: needsUpdate ? colors.warning : colors.primary + '30',
            borderRadius: borderRadius.lg,
            padding: spacing.md,
            marginBottom: spacing.md,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing.sm,
          }}
          activeOpacity={0.7}
          onPress={() => setShowVendas(true)}
        >
          <View style={{
            width: 40, height: 40, borderRadius: 20,
            backgroundColor: needsUpdate ? colors.warning + '20' : colors.primary + '15',
            alignItems: 'center', justifyContent: 'center',
          }}>
            <Feather name={needsUpdate ? "alert-circle" : "bar-chart"} size={18} color={needsUpdate ? colors.warning : colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 14, fontFamily: fontFamily.bold, color: colors.text }}>
              {needsUpdate ? `Atualize as vendas de ${monthName}` : `Vendas de ${monthName}`}
            </Text>
            <Text style={{ fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 }}>
              {needsUpdate
                ? 'Informe a quantidade vendida de cada produto para gerar a análise'
                : 'Clique para editar as quantidades vendidas no mês'}
            </Text>
          </View>
          <Feather name="chevron-right" size={18} color={needsUpdate ? colors.warning : colors.primary} />
        </TouchableOpacity>
      )}

      {/* Step 2: Sales input (collapsible) */}
      {showVendas && !loading && (
        <View style={styles.vendasSection}>
          <View style={styles.vendasHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.vendasTitle}>Vendas do mês</Text>
              <Text style={styles.vendasMonthLabel}>{monthName}</Text>
            </View>
            <TouchableOpacity
              onPress={handleSairVendas}
              style={styles.collapseBtn}
              activeOpacity={0.7}
            >
              <Feather name="chevron-up" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Product cards grouped by category in 3 columns on desktop */}
          {vendasByCategory.map((group) => (
            <View key={group.catName} style={{ marginBottom: spacing.md }}>
              {/* Category header with colored dot */}
              <View style={styles.vendasCatHeader}>
                <View style={[styles.vendasCatDot, { backgroundColor: group.color }]} />
                <Text style={styles.vendasCatName}>{group.catName}</Text>
                <Text style={styles.vendasCatCount}>{group.products.length}</Text>
              </View>

              {/* Products grid: 3 columns on desktop, 1 on mobile */}
              <View style={[styles.vendasGrid, isDesktop && styles.vendasGridDesktop]}>
                {group.products.map((p) => {
                  const prevQty = prevVendasMap[p.id] || 0;
                  return (
                    <View key={p.id} style={[styles.vendasCard, isDesktop && styles.vendasCardDesktop]}>
                      <Text style={styles.vendasCardName} numberOfLines={1}>{p.nome}</Text>
                      {prevQty > 0 && (
                        <Text style={styles.vendasCardPrev}>
                          {prevMonthName.charAt(0).toUpperCase() + prevMonthName.slice(1)}: {prevQty}
                        </Text>
                      )}
                      <View style={styles.vendasCardInputRow}>
                        <TextInput
                          style={[styles.vendaInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                          value={String(vendasMap[p.id] || '')}
                          onChangeText={(v) => handleVendaChange(p.id, v)}
                          keyboardType="numeric"
                          placeholder={prevQty > 0 ? String(prevQty) : '0'}
                          placeholderTextColor={colors.disabled}
                        />
                        <Text style={styles.vendasCardUnit}>un</Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}

          <TouchableOpacity
            style={styles.updateBtn}
            activeOpacity={0.7}
            onPress={handleSairVendas}
          >
            <Feather name="refresh-cw" size={14} color="#fff" />
            <Text style={styles.updateBtnText}>Atualizar análise</Text>
          </TouchableOpacity>
        </View>
      )}

      {loading ? (
        <View style={styles.emptyState}>
          <Loader message="Classificando seu cardápio..." />
        </View>
      ) : produtos.length === 0 ? (
        <View style={styles.emptyState}>
          <Feather name="bar-chart-2" size={48} color={colors.disabled} />
          <Text style={styles.emptyTitle}>Sem dados para análise</Text>
          <Text style={styles.emptyDesc}>Cadastre produtos com preço de venda para ver a classificação</Text>
        </View>
      ) : (
        <>
          {/* Step 3: Summary badges */}
          <View style={styles.summaryRow}>
            {CLASSIFICATION_ORDER.map(key => {
              const cfg = CLASSIFICATIONS[key];
              const isActive = filterClass === key;
              return (
                <TouchableOpacity
                  key={key}
                  style={[styles.summaryBadge, { backgroundColor: cfg.bg, borderColor: isActive ? cfg.color : cfg.border, borderWidth: isActive ? 2 : 1 }]}
                  activeOpacity={0.7}
                  onPress={() => setFilterClass(isActive ? null : key)}
                  accessibilityRole="button"
                  accessibilityLabel={`${cfg.label}: ${counts[key]} produtos. ${isActive ? 'Filtro ativo, toque para limpar' : 'Toque para filtrar'}`}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Feather name={cfg.icon} size={12} color={cfg.color} />
                    <Text style={styles.summaryEmoji}>{cfg.emoji}</Text>
                  </View>
                  <Text style={[styles.summaryCount, { color: cfg.color }]}>{counts[key]}</Text>
                  <Text style={[styles.summaryLabel, { color: cfg.color }]}>{cfg.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Edit vendas toggle moved to header */}

          {/* Step 4: Product table */}
          <View style={styles.tableCard}>
            <Text style={styles.tableTitle}>Classificação dos Produtos</Text>

            {/* Search bar */}
            <View style={styles.searchRow}>
              <Feather name="search" size={14} color={colors.textSecondary} />
              <TextInput
                style={[styles.searchInput, Platform.OS === 'web' && { outlineStyle: 'none' }]}
                placeholder="Buscar produto..."
                placeholderTextColor={colors.disabled}
                value={searchText}
                onChangeText={setSearchText}
              />
              {searchText.length > 0 && (
                <TouchableOpacity onPress={() => setSearchText('')} activeOpacity={0.7}>
                  <Feather name="x" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Sort selector — mobile vê dropdown-style; desktop usa table header */}
            {isMobile ? (
              <View style={styles.mobileSortRow}>
                <Text style={styles.mobileSortLabel}>Ordenar:</Text>
                {[
                  { key: 'classificacao', label: 'Classe' },
                  { key: 'margem', label: 'Margem' },
                  { key: 'vendas', label: 'Vendas' },
                  { key: 'nome', label: 'Nome' },
                ].map(opt => {
                  const active = sortBy === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.mobileSortChip, active && styles.mobileSortChipActive]}
                      onPress={() => handleSort(opt.key)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel={`Ordenar por ${opt.label}${active ? ` (${sortDir === 'asc' ? 'crescente' : 'decrescente'})` : ''}`}
                    >
                      <Text style={[styles.mobileSortChipText, active && styles.mobileSortChipTextActive]}>
                        {opt.label}
                      </Text>
                      {active && (
                        <Feather
                          name={sortDir === 'asc' ? 'chevron-up' : 'chevron-down'}
                          size={12}
                          color="#fff"
                          style={{ marginLeft: 2 }}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.tableHeaderRow}>
                <TouchableOpacity style={[styles.tableHeaderCell, { flex: 2 }]} onPress={() => handleSort('nome')} activeOpacity={0.7}>
                  <Text style={styles.tableHeaderText}>Produto</Text>
                  {renderSortIcon('nome')}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tableHeaderCell, { flex: 1, justifyContent: 'center' }]} onPress={() => handleSort('margem')} activeOpacity={0.7}>
                  <Text style={styles.tableHeaderText}>Margem</Text>
                  {renderSortIcon('margem')}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tableHeaderCell, { flex: 1, justifyContent: 'center' }]} onPress={() => handleSort('vendas')} activeOpacity={0.7}>
                  <Text style={styles.tableHeaderText}>Vendas</Text>
                  {renderSortIcon('vendas')}
                </TouchableOpacity>
                <TouchableOpacity style={[styles.tableHeaderCell, { flex: 1.3, justifyContent: 'center' }]} onPress={() => handleSort('classificacao')} activeOpacity={0.7}>
                  <Text style={styles.tableHeaderText}>Classe</Text>
                  {renderSortIcon('classificacao')}
                </TouchableOpacity>
              </View>
            )}

            {/* Rows / Cards */}
            {sortedProducts.length === 0 ? (
              <View style={styles.noResultsRow}>
                <Text style={styles.noResultsText}>Nenhum produto encontrado</Text>
              </View>
            ) : isMobile ? (
              /* Sessão 28+ — mobile-web: cada produto vira card empilhado em vez de linha de tabela apertada */
              <View style={styles.cardList}>
                {sortedProducts.map((p) => {
                  const cfg = CLASSIFICATIONS[p.classificacao] || CLASSIFICATIONS['Abacaxi'];
                  const marginColor = getMarginColor(p.margemPerc);
                  return (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.card, { borderLeftColor: cfg.border }]}
                      activeOpacity={0.7}
                      onPress={() => navigateToProduto(p)}
                      accessibilityRole="button"
                      accessibilityLabel={`${p.nome}, ${cfg.label}, margem ${p.margemPerc.toFixed(0)}%, ${p.qtdVendida} vendas no mês`}
                    >
                      <View style={styles.cardHeader}>
                        <Text style={styles.cardTitle} numberOfLines={2}>{p.nome}</Text>
                        {p.isCombo && (
                          <View style={{ backgroundColor: colors.accent + '20', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, marginLeft: 6 }}>
                            <Text style={{ fontSize: 10, fontFamily: fontFamily.semiBold, color: colors.accent }}>KIT</Text>
                          </View>
                        )}
                      </View>

                      <View style={styles.cardBadgeRow}>
                        <View
                          style={[styles.classBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                          accessibilityLabel={`Classificação: ${cfg.label}`}
                        >
                          <Feather name={cfg.icon} size={12} color={cfg.color} />
                          <Text style={[styles.classBadgeText, { color: cfg.color, fontSize: 12 }]} numberOfLines={1}>
                            {cfg.label}
                          </Text>
                        </View>
                        <View style={[styles.marginBadge, { backgroundColor: marginColor + '18' }]}>
                          <Text style={[styles.marginText, { color: marginColor, fontSize: 14 }]}>
                            {p.margemPerc.toFixed(0)}% margem
                          </Text>
                        </View>
                      </View>

                      <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>Preço:</Text>
                        <Text style={styles.cardValue}>{formatCurrency(p.precoVenda)}</Text>
                      </View>
                      <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>Vendas no mês:</Text>
                        <Text style={styles.cardValue}>{p.qtdVendida} un</Text>
                      </View>
                      <View style={styles.cardRow}>
                        <Text style={styles.cardLabel}>Ação sugerida:</Text>
                        <Text style={[styles.cardValue, { color: cfg.color }]}>{cfg.acao}</Text>
                      </View>

                      <View style={[styles.explicacaoRow, { borderLeftColor: cfg.border, marginTop: 8 }]}>
                        <Feather name="info" size={12} color={cfg.color} />
                        <Text style={[styles.explicacaoText, { color: cfg.color, fontSize: 12 }]}>{getExplicacaoItem(p)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              sortedProducts.map((p, idx) => {
                const cfg = CLASSIFICATIONS[p.classificacao] || CLASSIFICATIONS['Abacaxi'];
                const marginColor = getMarginColor(p.margemPerc);
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.tableRowContainer, idx < sortedProducts.length - 1 && styles.tableRowBorder]}
                    activeOpacity={0.6}
                    onPress={() => navigateToProduto(p)}
                  >
                    {/* Data row */}
                    <View style={styles.tableRow}>
                      {/* Product name + price */}
                      <View style={[styles.tableCell, { flex: 2 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={styles.prodName} numberOfLines={1}>{p.nome}</Text>
                          {p.isCombo && (
                            <View style={{ backgroundColor: colors.accent + '20', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 }}>
                              <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: colors.accent }}>KIT</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.prodPrice}>{formatCurrency(p.precoVenda)}</Text>
                      </View>

                      {/* Margin */}
                      <View style={[styles.tableCell, { flex: 1, alignItems: 'center' }]}>
                        <View style={[styles.marginBadge, { backgroundColor: marginColor + '18' }]}>
                          <Text style={[styles.marginText, { color: marginColor }]}>
                            {p.margemPerc.toFixed(0)}%
                          </Text>
                        </View>
                      </View>

                      {/* Sales */}
                      <View style={[styles.tableCell, { flex: 1, alignItems: 'center' }]}>
                        <Text style={styles.salesText}>{p.qtdVendida}</Text>
                        <Text style={styles.salesUnit}>un/mês</Text>
                      </View>

                      {/* Classification badge */}
                      <View style={[styles.tableCell, { flex: 1.3, alignItems: 'center' }]}>
                        <View
                          style={[styles.classBadge, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                          accessibilityLabel={`Classificação: ${cfg.label}`}
                        >
                          <Feather name={cfg.icon} size={11} color={cfg.color} />
                          <Text style={[styles.classBadgeText, { color: cfg.color }]} numberOfLines={1}>
                            {cfg.short}
                          </Text>
                        </View>
                        <Text style={[styles.acaoSuggestion, { color: cfg.color }]}>{cfg.acao}</Text>
                      </View>
                    </View>

                    {/* Explicação didática para leigos */}
                    <View style={[styles.explicacaoRow, { borderLeftColor: cfg.border }]}>
                      <Feather name="info" size={11} color={cfg.color} />
                      <Text style={[styles.explicacaoText, { color: cfg.color }]}>{getExplicacaoItem(p)}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </View>

          {/* Step 5: Quadrant descriptions (2x2 matrix layout) */}
          <Text style={styles.sectionTitle}>Entenda as categorias</Text>
          <View style={{ marginBottom: spacing.md }}>
            {/* Axis labels */}
            <View style={{ flexDirection: 'row', marginBottom: 4 }}>
              <View style={{ width: 20 }} />
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontFamily: fontFamily.medium, color: colors.textSecondary }}>← Baixa lucratividade | Alta lucratividade →</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row' }}>
              {/* Y axis label */}
              <View style={{ width: 20, justifyContent: 'center', alignItems: 'center' }}>
                <Text style={{ fontSize: 10, fontFamily: fontFamily.medium, color: colors.textSecondary, transform: [{ rotate: '-90deg' }], width: 100, textAlign: 'center' }}>Popularidade →</Text>
              </View>
              {/* 2x2 grid */}
              <View style={{ flex: 1 }}>
                {/* Top row: alta popularidade */}
                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                  {['Cavalo de Batalha', 'Estrela'].map(key => {
                    const cfg = CLASSIFICATIONS[key];
                    const quadKey = CLASSIFICATION_TO_QUADRANTE[key];
                    return (
                      <View key={key} style={{ flex: 1, backgroundColor: cfg.bg, borderRadius: borderRadius.md, borderWidth: 1, borderColor: cfg.border + '40', padding: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <Text style={{ fontSize: 14 }}>{cfg.emoji}</Text>
                          <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: cfg.color, flex: 1 }}>{cfg.label}</Text>
                          <View style={{ backgroundColor: cfg.color + '20', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, color: cfg.color }}>{counts[key]}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setQuadranteModal(quadKey)}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Saiba mais sobre quadrante ${cfg.label}`}
                            style={{ padding: 2 }}
                          >
                            <Feather name="help-circle" size={14} color={cfg.color} />
                          </TouchableOpacity>
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 14 }}>{cfg.desc}</Text>
                        <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: cfg.color, marginTop: 4 }}>→ {cfg.acao}</Text>
                      </View>
                    );
                  })}
                </View>
                {/* Bottom row: baixa popularidade */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  {['Abacaxi', 'Quebra-Cabeça'].map(key => {
                    const cfg = CLASSIFICATIONS[key];
                    const quadKey = CLASSIFICATION_TO_QUADRANTE[key];
                    return (
                      <View key={key} style={{ flex: 1, backgroundColor: cfg.bg, borderRadius: borderRadius.md, borderWidth: 1, borderColor: cfg.border + '40', padding: spacing.sm }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                          <Text style={{ fontSize: 14 }}>{cfg.emoji}</Text>
                          <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: cfg.color, flex: 1 }}>{cfg.label}</Text>
                          <View style={{ backgroundColor: cfg.color + '20', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 }}>
                            <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, color: cfg.color }}>{counts[key]}</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => setQuadranteModal(quadKey)}
                            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Saiba mais sobre quadrante ${cfg.label}`}
                            style={{ padding: 2 }}
                          >
                            <Feather name="help-circle" size={14} color={cfg.color} />
                          </TouchableOpacity>
                        </View>
                        <Text style={{ fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 14 }}>{cfg.desc}</Text>
                        <Text style={{ fontSize: 9, fontFamily: fontFamily.semiBold, color: cfg.color, marginTop: 4 }}>→ {cfg.acao}</Text>
                      </View>
                    );
                  })}
                </View>
              </View>
            </View>
          </View>

        </>
      )}
      <View style={{ height: 40 }} />

      <BCGQuadranteModal
        visible={quadranteModal !== null}
        quadrante={quadranteModal}
        onClose={() => setQuadranteModal(null)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerLeft: { flex: 1, marginRight: spacing.sm },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  subtitle: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 4, lineHeight: 20 },

  // Update banner
  updateBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.warning + '12', borderWidth: 1, borderColor: colors.warning + '40',
    borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: spacing.md,
  },
  updateBannerText: { flex: 1, fontSize: 12, fontFamily: fontFamily.medium, color: colors.warning },

  // Vendas section
  vendasSection: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  vendasHeaderRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  vendasTitle: { fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  vendasMonthLabel: { fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },
  collapseBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  vendasCatHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: spacing.sm, paddingBottom: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  vendasCatDot: {
    width: 10, height: 10, borderRadius: 5,
  },
  vendasCatName: {
    fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, flex: 1,
  },
  vendasCatCount: {
    fontSize: 11, fontFamily: fontFamily.medium, color: colors.textSecondary,
    backgroundColor: colors.background, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1,
  },
  vendasGrid: {
    flexDirection: 'column', gap: spacing.xs,
  },
  vendasGridDesktop: {
    flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm,
  },
  vendasCard: {
    backgroundColor: colors.background, borderRadius: borderRadius.md,
    padding: spacing.sm, borderWidth: 1, borderColor: colors.border + '60',
  },
  vendasCardDesktop: {
    width: '32%',
  },
  vendasCardName: {
    fontSize: 13, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text,
    marginBottom: 4,
  },
  vendasCardPrev: {
    fontSize: 10, fontFamily: fontFamily.regular, color: colors.disabled,
    marginBottom: 4,
  },
  vendasCardInputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  vendasCardUnit: {
    fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary,
  },
  vendasTableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: colors.border,
    marginBottom: 2,
  },
  vendasColHeader: {
    fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  vendaRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
  },
  vendaRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '60' },
  vendaName: {
    flex: 1, fontSize: 13, fontFamily: fontFamily.medium, color: colors.text,
  },
  vendaPrevQty: {
    width: 70, textAlign: 'center',
    fontSize: 12, fontFamily: fontFamily.regular, color: colors.disabled,
  },
  vendaInputWrap: { width: 80, alignItems: 'center' },
  vendaInput: {
    width: 64, height: 34, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, textAlign: 'center',
    fontSize: 14, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text,
    backgroundColor: colors.inputBg, paddingHorizontal: 4,
  },
  updateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 12, marginTop: spacing.md,
  },
  updateBtnText: { fontSize: 14, fontFamily: fontFamily.semiBold, fontWeight: '600', color: '#fff' },

  // Edit vendas link
  editVendasBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    marginBottom: spacing.md, paddingVertical: 4,
  },
  editVendasText: { fontSize: 12, fontFamily: fontFamily.medium, color: colors.primary },

  // Empty
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { fontSize: fonts.body, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginTop: spacing.md },
  emptyDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },

  // Summary badges
  summaryRow: {
    flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm,
  },
  summaryBadge: {
    flex: 1, alignItems: 'center', borderRadius: borderRadius.md, borderWidth: 1.5,
    paddingVertical: spacing.sm, paddingHorizontal: 4,
  },
  summaryEmoji: { fontSize: 16 },
  summaryCount: { fontSize: fonts.xlarge || 22, fontFamily: fontFamily.bold, fontWeight: '700', marginTop: 2 },
  summaryLabel: { fontSize: 9, fontFamily: fontFamily.semiBold, fontWeight: '600', textAlign: 'center', marginTop: 1 },

  // Product table card
  tableCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  tableTitle: { fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text, marginBottom: spacing.sm },

  // Search
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm, paddingVertical: Platform.OS === 'ios' ? 10 : 0,
    marginBottom: spacing.sm, borderWidth: 1, borderColor: colors.border + '60',
  },
  searchInput: {
    flex: 1, fontSize: 13, fontFamily: fontFamily.regular, color: colors.text,
    paddingVertical: 8,
  },

  // Table header
  tableHeaderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingBottom: 8, borderBottomWidth: 1.5, borderBottomColor: colors.border,
    paddingHorizontal: 4,
  },
  tableHeaderCell: {
    flexDirection: 'row', alignItems: 'center',
  },
  tableHeaderText: {
    // Sessão 28 — 11→12 para legibilidade mobile (WCAG)
    fontSize: 12, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.3,
  },

  // Table row
  tableRowContainer: {
    paddingVertical: 14, paddingHorizontal: 4, // Sessão 28 — 12→14 (touch target ~48pt)
    minHeight: 48,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
  },
  tableRowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border + '50' },
  tableCell: { justifyContent: 'center' },
  noResultsRow: { paddingVertical: 24, alignItems: 'center' },
  noResultsText: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.disabled },

  // Sessão 28 — bump fontSize para mobile readability
  prodName: { fontSize: 14, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  prodPrice: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 },

  marginBadge: {
    borderRadius: borderRadius.sm, paddingHorizontal: 8, paddingVertical: 3,
  },
  marginText: { fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700' },

  salesText: { fontSize: 13, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  salesUnit: { fontSize: 9, fontFamily: fontFamily.regular, color: colors.disabled, marginTop: 1 },

  classBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderRadius: borderRadius.sm, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 3,
  },
  classBadgeEmoji: { fontSize: 11 },
  classBadgeText: { fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  acaoSuggestion: { fontSize: 9, fontFamily: fontFamily.regular, marginTop: 3 },

  // Explicação didática por item
  explicacaoRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 5,
    backgroundColor: colors.surface, borderLeftWidth: 2,
    borderRadius: 4, paddingVertical: 5, paddingHorizontal: 8,
    marginTop: 6, width: '100%',
  },
  explicacaoText: {
    fontSize: 10, fontFamily: fontFamily.regular, lineHeight: 14, flex: 1,
  },

  // Section title
  sectionTitle: {
    fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.sm, marginTop: spacing.xs,
  },

  // Quadrant mini cards
  quadrantRow: {
    marginBottom: spacing.md,
  },
  quadrantRowDesktop: {
    flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap',
  },
  quadrantMiniCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.sm + 2, marginBottom: spacing.xs,
    borderLeftWidth: 3,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  quadrantMiniHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4,
  },
  quadrantMiniEmoji: { fontSize: 14 },
  quadrantMiniTitle: { fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700', flex: 1 },
  quadrantMiniCount: {
    borderRadius: 10, paddingHorizontal: 8, paddingVertical: 1,
  },
  quadrantMiniCountText: { fontSize: 11, fontFamily: fontFamily.bold, fontWeight: '700' },
  quadrantMiniDesc: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 16 },

  // Error banner (audit P0 — feedback de carga)
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: '#fee2e2', borderLeftWidth: 3, borderLeftColor: colors.error,
    borderRadius: borderRadius.md, padding: spacing.sm, marginBottom: spacing.md,
  },
  errorBannerText: {
    flex: 1, fontSize: 12, fontFamily: fontFamily.medium, color: colors.error,
  },
  errorBannerBtn: {
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  errorBannerBtnText: {
    fontSize: 11, fontFamily: fontFamily.semiBold, color: '#fff',
  },

  // ── Sessão 28+ — mobile-web cards (substitui tabela apertada em < 1024px) ──
  cardList: {
    marginTop: spacing.sm,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    minHeight: 44,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  cardBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: spacing.sm,
    alignItems: 'center',
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 24,
  },
  cardLabel: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  cardValue: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  mobileSortRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
    marginBottom: spacing.sm,
    marginTop: spacing.sm,
  },
  mobileSortLabel: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    marginRight: 4,
  },
  mobileSortChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 36,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg || colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  mobileSortChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mobileSortChipText: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  mobileSortChipTextActive: {
    color: '#fff',
  },

});
