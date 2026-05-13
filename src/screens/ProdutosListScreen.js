import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, Platform, RefreshControl } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, calcDespesasFixasPercentual, converterParaBase, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcLucroLiquido, calcMargemLiquida, calcCMVPercentual } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import UndoToast from '../components/UndoToast';
import SortMenu from '../components/SortMenu';
import BulkActionBar from '../components/BulkActionBar';
import CategoryPickerModal from '../components/CategoryPickerModal';
import InfoToast from '../components/InfoToast';
import HighlightedText from '../components/HighlightedText';
import usePersistedState from '../hooks/usePersistedState';
import useListDensity from '../hooks/useListDensity';
import BulkPriceAdjustModal from '../components/BulkPriceAdjustModal';
import ListStatsStrip from '../components/ListStatsStrip';
import { exportToCSV, isCsvExportSupported } from '../utils/exportCsv';
import ItemPreviewModal from '../components/ItemPreviewModal';
import EntityCreateModal from '../components/EntityCreateModal';
import { formatTimeAgo } from '../utils/timeAgo';
import ViewModeToggle from '../components/ViewModeToggle';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useBulkSelection from '../hooks/useBulkSelection';
// Sprint 2 S5 — checagem central de dependências antes de delete (audit P0-05).
// Para produtos, o blocker crítico é "vendas registradas" — aviso de soft-delete recomendado.
import { contarDependencias, formatarMensagemDeps } from '../services/dependenciesService';
import { t } from '../i18n/pt-BR';
import { subscribeDataChanged } from '../utils/dataSync';

// Cores para categorias
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

const YELLOW = '#E6A800';

function getHealthColor(margem, meta = 0.15) {
  if (margem === -1) return colors.disabled;
  if (margem >= meta) return colors.success;
  if (margem >= meta - 0.10) return YELLOW;
  return colors.error;
}

function getHealthBgColor(margem, meta = 0.15) {
  if (margem === -1) return colors.disabled + '0C';
  if (margem >= meta) return colors.success + '12';
  if (margem >= meta - 0.10) return YELLOW + '18';
  return colors.error + '12';
}

function getHealthBorderColor(margem, meta = 0.15) {
  if (margem === -1) return colors.disabled + '40';
  if (margem >= meta) return colors.success + '50';
  if (margem >= meta - 0.10) return YELLOW + '60';
  return colors.error + '50';
}

// Classifica a margem do produto em uma das faixas do filtro de lucro.
// Mesmas thresholds do semáforo visual: acima da meta (verde), faixa amarela
// (meta-10 a meta), abaixo (vermelho) e -1 (sem preço cadastrado).
function getMargemClass(margem, meta = 0.15) {
  if (margem === -1) return 'sem_preco';
  if (margem >= meta) return 'acima';
  if (margem >= meta - 0.10) return 'medio';
  return 'abaixo';
}

export default function ProdutosListScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const [sections, setSections] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [config, setConfig] = useState({ despFixasPerc: 0, despVarPerc: 0, margemMeta: 0.15 });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const undoDelete = useUndoableDelete();
  const [sortBy, setSortBy] = usePersistedState('produtos.sortBy', 'nome_asc');
  const [viewMode, setViewMode] = usePersistedState('produtos.viewMode', 'list');
  // Sessão 28.x — filtro por faixa de lucro clicável. Valores: null | 'acima' | 'medio' | 'abaixo' | 'sem_preco'.
  // Persiste entre navegações pela mesma chave usada pra sortBy/viewMode.
  const [filtroLucro, setFiltroLucro] = usePersistedState('produtos.filtroLucro', null);
  // Bug fix: no mobile o grid renderiza apenas chips com preço (sem nome). Força lista no mobile.
  const isGrid = isDesktop;
  const { rowOverride, nameOverride, avatarSize, isCompact, rowMinHeight, titleFontSize, listItemSubtitleFontSize } = useListDensity();
  const bulk = useBulkSelection();
  const [totalProdutos, setTotalProdutos] = useState(0);
  // Mapa de cores por categoria ID
  const [catColorMap, setCatColorMap] = useState({});
  // Seções recolhidas
  const [collapsedSections, setCollapsedSections] = useState({});
  // Desktop grid seções recolhidas
  const [collapsedDesktop, setCollapsedDesktop] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [infoToast, setInfoToast] = useState(null);
  // Sessão 28.9 — modal popup pra Novo / Editar Produto (substitui navegação à tela cheia)
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  function abrirCriacao() { setEditingId(null); setShowCreateModal(true); }
  function abrirEdicao(id) { setEditingId(id); setShowCreateModal(true); }

  function toggleDesktopSection(key) { setCollapsedDesktop(prev => ({...prev, [key]: !prev[key]})); }

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadData(true); } finally { setRefreshing(false); }
  }

  // Sessão 28.54 — throttle: useFocusEffect + focus listener + visibilitychange
  // estavam chamando loadData 3x sequenciais a cada focus (12 queries × 3 = 36
  // queries em milissegundos). Throttle 500ms reduz a apenas 1 carga.
  const lastLoadRef = useRef(0);
  const loadDataThrottled = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastLoadRef.current < 500) return;
    lastLoadRef.current = now;
    return loadData();
  }, []);

  // Sessão 28.46: extraído pra rodar via useFocusEffect E via focus listener
  // (useFocusEffect flaky no web). Antes user voltava de criar embalagem/insumo
  // dentro do modal e a aba ficava na list (Embalagens/Insumos) ao invés de
  // reabrir o modal aqui.
  const checkReopenAndOpen = useCallback(async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const raw = await AsyncStorage.getItem('reopenEntityModalAfterEdit');
      if (!raw) return;
      const info = JSON.parse(raw);
      await AsyncStorage.removeItem('reopenEntityModalAfterEdit');
      if (info?.mode !== 'produto') return;
      if (!info?.ts || (Date.now() - info.ts) > 5 * 60 * 1000) return;
      if (info.draft) {
        try { await AsyncStorage.setItem('entityDraftToRestore', JSON.stringify({ mode: 'produto', editId: info.editId || null, draft: info.draft, ts: Date.now() })); } catch {}
      }
      // Sessão 28.52: cascata 3 níveis — se vem com reopenNestedPreparo,
      // guarda em key separada pra EntityCreateModal abrir o nested ao montar.
      if (info.reopenNestedPreparo) {
        try { await AsyncStorage.setItem('reopenNestedPreparoOnMount', JSON.stringify({ ...info.reopenNestedPreparo, ts: Date.now() })); } catch {}
      }
      setEditingId(info.editId || null);
      setShowCreateModal(true);
    } catch {}
  }, []);

  // Sessão 28.46: focus listener fallback + dataSync subscribe + visibilitychange
  // Sessão 28.54: usar loadDataThrottled (skip se carregou nos últimos 500ms)
  useEffect(() => {
    const unsub = subscribeDataChanged((table) => {
      if (table === 'produtos') loadDataThrottled();
    });
    const unsubFocus = navigation.addListener('focus', () => {
      loadDataThrottled();
      checkReopenAndOpen();
    });
    let onVis;
    if (typeof document !== 'undefined' && document.addEventListener) {
      onVis = () => {
        if (!document.hidden) {
          loadDataThrottled();
          checkReopenAndOpen();
        }
      };
      document.addEventListener('visibilitychange', onVis);
    }
    return () => {
      unsub();
      unsubFocus();
      if (onVis && typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVis);
      }
    };
  }, [navigation, checkReopenAndOpen, loadDataThrottled]);

  useFocusEffect(useCallback(() => {
    loadDataThrottled();
    checkReopenAndOpen();
    // Sessão 28.17: deep-link de outras telas (Relatório etc) que querem abrir
    // a edição do produto direto no modal — uso o param `openProductEdit`.
    try {
      const navState = navigation.getState && navigation.getState();
      const route = navState?.routes?.[navState.index];
      const productEditId = route?.params?.openProductEdit;
      if (productEditId) {
        setEditingId(productEditId);
        setShowCreateModal(true);
        // Limpa o param pra não reabrir em focos futuros
        navigation.setParams({ openProductEdit: undefined });
      }
    } catch {}
    return () => setConfirmDelete(null);
  }, [filtroCategoria, busca, sortBy, navigation, checkReopenAndOpen, loadDataThrottled]));

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
    const db = await getDatabase();

    const [fixas, variaveis, fat, cats, prods, rawProdIngs, rawMPs, rawProdPreps, rawPreparos, rawProdEmbs, rawEmbalagens, configRows] = await Promise.all([
      db.getAllAsync('SELECT * FROM despesas_fixas'),
      db.getAllAsync('SELECT * FROM despesas_variaveis'),
      db.getAllAsync('SELECT * FROM faturamento_mensal'),
      db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM produto_ingredientes'),
      db.getAllAsync('SELECT * FROM materias_primas'),
      db.getAllAsync('SELECT * FROM produto_preparos'),
      db.getAllAsync('SELECT * FROM preparos'),
      db.getAllAsync('SELECT * FROM produto_embalagens'),
      db.getAllAsync('SELECT * FROM embalagens'),
      db.getAllAsync('SELECT lucro_desejado FROM configuracao LIMIT 1'),
    ]);

    // Build lookup maps for JOINs in JS
    const mpMap = {};
    (rawMPs || []).forEach(mp => { mpMap[mp.id] = mp; });
    const prepMap = {};
    (rawPreparos || []).forEach(pr => { prepMap[pr.id] = pr; });
    const embMap = {};
    (rawEmbalagens || []).forEach(em => { embMap[em.id] = em; });

    const allIngs = (rawProdIngs || []).map(pi => {
      const mp = mpMap[pi.materia_prima_id] || {};
      return { produto_id: pi.produto_id, quantidade_utilizada: pi.quantidade_utilizada, preco_por_kg: mp.preco_por_kg || 0, unidade_medida: mp.unidade_medida || 'g' };
    });
    const allPreps = (rawProdPreps || []).map(pp => {
      const pr = prepMap[pp.preparo_id] || {};
      return { produto_id: pp.produto_id, quantidade_utilizada: pp.quantidade_utilizada, custo_por_kg: pr.custo_por_kg || 0, unidade_medida: pr.unidade_medida || 'g' };
    });
    const allEmbs = (rawProdEmbs || []).map(pe => {
      const em = embMap[pe.embalagem_id] || {};
      return { produto_id: pe.produto_id, quantidade_utilizada: pe.quantidade_utilizada, preco_unitario: em.preco_unitario || 0 };
    });

    const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
    const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
    const mesesComFat = fat.filter(f => f.valor > 0);
    const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
    const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
    const margemMeta = (configRows && configRows.length > 0 && configRows[0].lucro_desejado) ? configRows[0].lucro_desejado : 0.15;
    setConfig({ despFixasPerc: dfPerc, despVarPerc: totalVar, margemMeta });

    setCategorias(cats);

    // Monta mapa de cores fixo por ID
    const colorMap = {};
    cats.forEach((c, i) => { colorMap[c.id] = getCategoryColor(i); });
    colorMap['null'] = colors.disabled;
    setCatColorMap(colorMap);

    // Build lookup maps for O(1) access
    const ingsByProd = {};
    (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
    const prepsByProd = {};
    (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
    const embsByProd = {};
    (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

    let prodsFiltrados = prods;
    if (busca.trim()) {
      const termo = normalizeSearch(busca);
      prodsFiltrados = prods.filter(p => normalizeSearch(p.nome).includes(termo));
    }

    const result = [];
    for (const p of prodsFiltrados) {
      const ings = ingsByProd[p.id] || [];
      const custoIng = ings.reduce((a, i) => {
        return a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida);
      }, 0);

      const preps = prepsByProd[p.id] || [];
      const custoPr = preps.reduce((a, pp) => {
        return a + calcCustoPreparo(pp.custo_por_kg, pp.quantidade_utilizada, pp.unidade_medida || 'g');
      }, 0);

      const embs = embsByProd[p.id] || [];
      const custoEmb = embs.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);

      const custoTotal = custoIng + custoPr + custoEmb;
      const custoUn = custoTotal / getDivisorRendimento(p);
      const precoVenda = p.preco_venda || 0;
      // Sessão 28.9 — Auditoria P0-02: usar funções centrais
      const despFixasVal = precoVenda * dfPerc;
      const despVarVal = precoVenda * totalVar;
      const lucro = calcLucroLiquido(precoVenda, custoUn, despFixasVal, despVarVal);
      const cmv = calcCMVPercentual(custoUn, precoVenda);
      // -1 = sentinel "sem preço" (calcMargemLiquida retornaria 0, mas a UI distingue)
      const margem = precoVenda > 0 ? calcMargemLiquida(precoVenda, custoUn, despFixasVal, despVarVal) : -1;
      result.push({ ...p, custoTotal: custoUn, precoVenda, lucro, cmv, despFixasVal, despVarVal, margem });
    }

    setTotalProdutos(result.length);

    // Aplicar ordenação P1-22
    const cmpStr = (a, b) => (a || '').localeCompare(b || '', 'pt-BR', { sensitivity: 'base' });
    const sortFns = {
      nome_asc: (a, b) => cmpStr(a.nome, b.nome),
      nome_desc: (a, b) => cmpStr(b.nome, a.nome),
      recentes: (a, b) => (b.id || 0) - (a.id || 0),
      modificados: (a, b) => {
        // P3-I — updated_at DESC (mais recentes primeiro). Strings ISO comparam corretamente
        const au = a.updated_at || '';
        const bu = b.updated_at || '';
        if (au === bu) return cmpStr(a.nome, b.nome);
        return bu.localeCompare(au);
      },
      favoritos: (a, b) => {
        // P3-H — favoritos primeiro, depois nome ASC
        const fa = a.favorito ? 1 : 0, fb = b.favorito ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return cmpStr(a.nome, b.nome);
      },
      preco_desc: (a, b) => (b.precoVenda || 0) - (a.precoVenda || 0),
      preco_asc: (a, b) => (a.precoVenda || 0) - (b.precoVenda || 0),
      lucro_desc: (a, b) => (b.lucro || 0) - (a.lucro || 0),
      margem_asc: (a, b) => {
        // Margem -1 (sem preço) vai para o fim
        const am = a.margem === -1 ? Infinity : a.margem;
        const bm = b.margem === -1 ? Infinity : b.margem;
        return am - bm;
      },
    };
    const sortFn = sortFns[sortBy] || sortFns.nome_asc;
    result.sort(sortFn);

    const grouped = {};
    const semCategoria = { id: null, nome: 'Sem categoria' };

    cats.forEach(c => { grouped[c.id] = { ...c, data: [] }; });
    grouped['null'] = { ...semCategoria, data: [] };

    result.forEach(p => {
      const catId = p.categoria_id || 'null';
      if (grouped[catId]) {
        grouped[catId].data.push(p);
      } else {
        grouped['null'].data.push(p);
      }
    });

    let secs = Object.values(grouped)
      .filter(g => g.data.length > 0 || filtroCategoria === g.id)
      .sort((a, b) => {
        if (a.id === null) return 1;
        if (b.id === null) return -1;
        return a.nome.localeCompare(b.nome);
      })
      .map((g) => ({
        title: g.nome,
        catId: g.id,
        catColor: colorMap[g.id] || colors.disabled,
        data: g.data,
        totalCount: g.data.length,
      }));

    if (filtroCategoria !== null) {
      secs = secs.filter(s => s.catId === filtroCategoria);
    }

    setSections(secs);
    } catch (e) {
      const msg = (e && e.message) ? e.message : 'Falha ao carregar produtos.';
      setLoadError(msg);
      if (typeof console !== 'undefined' && console.error) console.error('[ProdutosListScreen.loadData]', e);
    } finally {
      setLoading(false);
    }
  }

  async function solicitarExclusao(id, nome) {
    // Sprint 2 S5 — antes de excluir, mostra ao usuário em quantas vendas/configs delivery
    // o produto aparece. Com vendas registradas, recomenda-se soft-delete (preserva histórico).
    let mensagemExtra = null;
    try {
      const db = await getDatabase();
      const deps = await contarDependencias(db, 'produto', id);
      if (deps.total > 0) {
        mensagemExtra = formatarMensagemDeps(deps, { acao: 'excluir', entidade: 'produto' });
      }
    } catch (e) {
      console.error('[ProdutosListScreen.solicitarExclusao.deps]', e);
    }
    setConfirmDelete({
      titulo: 'Excluir Produto',
      nome,
      aviso: mensagemExtra,
      onConfirm: async () => {
        setConfirmDelete(null);
        await undoDelete.requestDelete({
          id,
          message: `Produto "${nome}" excluído`,
          commit: async () => {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM produto_ingredientes WHERE produto_id = ?', [id]);
            await db.runAsync('DELETE FROM produto_preparos WHERE produto_id = ?', [id]);
            await db.runAsync('DELETE FROM produto_embalagens WHERE produto_id = ?', [id]);
            await db.runAsync('DELETE FROM produtos WHERE id = ?', [id]);
          },
          onCommitted: () => loadData(),
        });
      },
    });
  }

  async function solicitarExclusaoEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    let mensagemExtra = null;
    try {
      const db = await getDatabase();
      let totalRefs = 0;
      let comVendas = 0;
      for (const id of ids) {
        const deps = await contarDependencias(db, 'produto', id);
        totalRefs += deps.total;
        if (deps.temBloqueio) comVendas++;
      }
      if (totalRefs > 0) {
        const partes = [`${totalRefs} referência${totalRefs === 1 ? '' : 's'} ${totalRefs === 1 ? 'será afetada' : 'serão afetadas'} ao excluir esses produtos.`];
        if (comVendas > 0) partes.push(`${comVendas} produto${comVendas === 1 ? '' : 's'} possui${comVendas === 1 ? '' : 'em'} vendas registradas — relatórios históricos perderão referência ao nome.`);
        mensagemExtra = partes.join('\n\n');
      }
    } catch (e) {
      console.error('[ProdutosListScreen.solicitarExclusaoEmMassa.deps]', e);
    }
    setConfirmDelete({
      titulo: ids.length === 1 ? 'Excluir Produto' : `Excluir ${ids.length} produtos`,
      nome: ids.length === 1 ? null : `${ids.length} itens selecionados`,
      aviso: mensagemExtra,
      onConfirm: async () => {
        setConfirmDelete(null);
        await undoDelete.requestDelete({
          id: ids,
          message: ids.length === 1 ? '1 produto excluído' : `${ids.length} produtos excluídos`,
          commit: async () => {
            const db = await getDatabase();
            const placeholders = ids.map(() => '?').join(',');
            // Cascade delete from join tables first, then main entity
            await db.runAsync(`DELETE FROM produto_ingredientes WHERE produto_id IN (${placeholders})`, ids);
            await db.runAsync(`DELETE FROM produto_preparos WHERE produto_id IN (${placeholders})`, ids);
            await db.runAsync(`DELETE FROM produto_embalagens WHERE produto_id IN (${placeholders})`, ids);
            await db.runAsync(`DELETE FROM produtos WHERE id IN (${placeholders})`, ids);
          },
          onCommitted: () => loadData(),
        });
        bulk.clear();
      },
    });
  }

  function handleRowPress(item) {
    if (bulk.active) bulk.toggle(item.id);
    else abrirEdicao(item.id);
  }
  function handleRowLongPress(item) { bulk.enter(item.id); }

  async function moverEmMassa(catId) {
    const ids = Array.from(bulk.selectedIds);
    setShowMoveModal(false);
    if (ids.length === 0) return;
    try {
      const db = await getDatabase();
      const placeholders = ids.map(() => '?').join(',');
      await db.runAsync(
        `UPDATE produtos SET categoria_id = ? WHERE id IN (${placeholders})`,
        [catId, ...ids]
      );
      bulk.clear();
      setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'produto movido' : 'produtos movidos'}`, icon: 'folder' });
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[ProdutosListScreen.moverEmMassa]', e);
      setInfoToast({ message: 'Não foi possível mover os produtos.', icon: 'alert-triangle' });
    } finally {
      loadData();
    }
  }

  async function duplicarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT * FROM produtos WHERE id IN (${placeholders})`, ids
    );
    for (const produto of itens) {
      const result = await db.runAsync(
        'INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades, preco_venda, margem_lucro_produto) VALUES (?,?,?,?,?,?,?)',
        [produto.nome + ' (cópia)', produto.categoria_id, produto.rendimento_total, produto.unidade_rendimento, produto.rendimento_unidades, produto.preco_venda, produto.margem_lucro_produto]
      );
      const newId = result?.lastInsertRowId;
      if (!newId) continue;
      const [ings, preps, embs] = await Promise.all([
        db.getAllAsync('SELECT * FROM produto_ingredientes WHERE produto_id = ?', [produto.id]),
        db.getAllAsync('SELECT * FROM produto_preparos WHERE produto_id = ?', [produto.id]),
        db.getAllAsync('SELECT * FROM produto_embalagens WHERE produto_id = ?', [produto.id]),
      ]);
      await Promise.all([
        ...ings.map(ing => db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)', [newId, ing.materia_prima_id, ing.quantidade_utilizada])),
        ...preps.map(pr => db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)', [newId, pr.preparo_id, pr.quantidade_utilizada])),
        ...embs.map(em => db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)', [newId, em.embalagem_id, em.quantidade_utilizada])),
      ]);
    }
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'produto duplicado' : 'produtos duplicados'}`, icon: 'copy' });
    loadData();
  }

  async function reajustarEmMassa({ mode, value, sign }) {
    const ids = Array.from(bulk.selectedIds);
    setShowPriceModal(false);
    if (ids.length === 0 || !value) return;
    try {
      const db = await getDatabase();
      const placeholders = ids.map(() => '?').join(',');
      const itens = await db.getAllAsync(`SELECT * FROM produtos WHERE id IN (${placeholders})`, ids);
      const factor = mode === 'percent' ? 1 + (sign * value) / 100 : null;
      // P1: tracking de produtos que ficariam com margem negativa (preço abaixo do CMV)
      // — não bloqueia, mas avisa; o usuário pode estar fazendo promoção consciente.
      let abaixoDoCusto = 0;
      // Map de custo total por id (já calculado no loadData via visibleItems)
      const custoMap = {};
      visibleItems.forEach((it) => { custoMap[it.id] = Number(it.custoTotal) || 0; });
      await Promise.all(itens.map((item) => {
        const oldPreco = Number(item.preco_venda) || 0;
        let novoPreco = mode === 'percent' ? oldPreco * factor : oldPreco + sign * value;
        if (novoPreco < 0) novoPreco = 0;
        const cmv = custoMap[item.id] || 0;
        if (cmv > 0 && novoPreco > 0 && novoPreco < cmv) abaixoDoCusto++;
        return db.runAsync(
          'UPDATE produtos SET preco_venda = ? WHERE id = ?',
          [novoPreco, item.id]
        );
      }));
      bulk.clear();
      const sigStr = sign === 1 ? '+' : '−';
      const valStr = mode === 'percent' ? `${value}%` : `R$ ${value.toFixed(2).replace('.', ',')}`;
      if (abaixoDoCusto > 0) {
        setInfoToast({
          message: `${ids.length} reajustado (${sigStr}${valStr}) — ${abaixoDoCusto} ficou abaixo do custo`,
          icon: 'alert-triangle',
        });
      } else {
        setInfoToast({
          message: `${ids.length} ${ids.length === 1 ? 'produto reajustado' : 'produtos reajustados'} (${sigStr}${valStr})`,
          icon: 'trending-up',
        });
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[ProdutosListScreen.reajustarEmMassa]', e);
      setInfoToast({ message: 'Não foi possível reajustar os preços.', icon: 'alert-triangle' });
    } finally {
      loadData();
    }
  }

  async function favoritarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const itens = visibleItems.filter((i) => bulk.isSelected(i.id));
    const allFav = itens.every((i) => Number(i.favorito) === 1);
    const novoVal = allFav ? 0 : 1;
    const db = await getDatabase();
    await Promise.all(ids.map((id) =>
      db.runAsync('UPDATE produtos SET favorito = ? WHERE id = ?', [novoVal, id])
    ));
    bulk.clear();
    setInfoToast({
      message: novoVal === 1
        ? `${ids.length} ${ids.length === 1 ? 'produto favoritado' : 'produtos favoritados'}`
        : `${ids.length} ${ids.length === 1 ? 'produto desfavoritado' : 'produtos desfavoritados'}`,
      icon: 'star',
    });
    loadData();
  }

  async function toggleFavoritoSingular(item) {
    const novo = Number(item.favorito) === 1 ? 0 : 1;
    const db = await getDatabase();
    await db.runAsync('UPDATE produtos SET favorito = ? WHERE id = ?', [novo, item.id]);
    setPreviewItem({ ...item, favorito: novo });
    loadData();
  }

  async function exportarCSVEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const idSet = new Set(ids);
    const itens = visibleItems.filter((it) => idSet.has(it.id));
    if (itens.length === 0) return;
    const rows = itens.map((it) => ({
      nome: it.nome,
      categoria: (it.categoria_nome || it.categoria || 'Sem categoria'),
      preco_venda: it.preco_venda,
      cmv: it.custoTotal,
      margem_percent: typeof it.margem === 'number' ? Number((it.margem * 100).toFixed(2)) : '',
      lucro_unidade: typeof it.lucro === 'number' ? it.lucro : '',
    }));
    const ok = exportToCSV('produtos.csv', rows, [
      { key: 'nome', label: 'Nome' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'preco_venda', label: 'Preço de venda (R$)' },
      { key: 'cmv', label: 'CMV (R$)' },
      { key: 'margem_percent', label: 'Margem (%)' },
      { key: 'lucro_unidade', label: 'Lucro por unidade (R$)' },
    ]);
    if (ok) {
      bulk.clear();
      setInfoToast({ message: `${itens.length} ${itens.length === 1 ? 'produto exportado' : 'produtos exportados'}`, icon: 'download' });
    }
  }

  async function adicionarCategoria() {
    if (!novaCategoria.trim()) return Alert.alert(t.alertAttention, t.validation.requiredCategoryName);
    const db = await getDatabase();
    await db.runAsync('INSERT INTO categorias_produtos (nome, icone) VALUES (?, ?)', [novaCategoria.trim(), 'tag']);
    setNovaCategoria('');
    setModalVisible(false);
    loadData();
  }

  async function duplicarProduto(produto) {
    const db = await getDatabase();
    const result = await db.runAsync(
      'INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades, preco_venda, margem_lucro_produto) VALUES (?,?,?,?,?,?,?)',
      [produto.nome + ' (cópia)', produto.categoria_id, produto.rendimento_total, produto.unidade_rendimento, produto.rendimento_unidades, produto.preco_venda, produto.margem_lucro_produto]
    );
    const newId = result?.lastInsertRowId;
    if (!newId) return;
    // Load all related data in parallel
    const [ings, preps, embs] = await Promise.all([
      db.getAllAsync('SELECT * FROM produto_ingredientes WHERE produto_id = ?', [produto.id]),
      db.getAllAsync('SELECT * FROM produto_preparos WHERE produto_id = ?', [produto.id]),
      db.getAllAsync('SELECT * FROM produto_embalagens WHERE produto_id = ?', [produto.id]),
    ]);
    // Insert all related data in parallel
    await Promise.all([
      ...ings.map(ing => db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)', [newId, ing.materia_prima_id, ing.quantidade_utilizada])),
      ...preps.map(pr => db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)', [newId, pr.preparo_id, pr.quantidade_utilizada])),
      ...embs.map(em => db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)', [newId, em.embalagem_id, em.quantidade_utilizada])),
    ]);
    abrirEdicao(newId);
  }

  function removerCategoria(catId) {
    const cat = categorias.find(c => c.id === catId);
    setConfirmDelete({
      titulo: 'Remover Categoria',
      nome: cat ? cat.nome : 'esta categoria',
      onConfirm: async () => {
        try {
          const db = await getDatabase();
          // P2: single bulk UPDATE em vez de loop N+1
          await db.runAsync('UPDATE produtos SET categoria_id = NULL WHERE categoria_id = ?', [catId]);
          await db.runAsync('DELETE FROM categorias_produtos WHERE id = ?', [catId]);
          if (filtroCategoria === catId) setFiltroCategoria(null);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('[ProdutosListScreen.removerCategoria]', e);
          setInfoToast({ message: 'Não foi possível remover a categoria.', icon: 'alert-triangle' });
        } finally {
          setConfirmDelete(null);
          loadData();
        }
      },
    });
  }

  const isWeb = Platform.OS === 'web';

  function renderDesktopGrid() {
    if (!isDesktop || visibleSections.length === 0) return null;
    return (
      <View style={{ marginTop: spacing.xs }}>
        {visibleSections.map((section, catIdx) => (
          <View key={section.catId} style={{ marginBottom: spacing.md }}>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: catIdx > 0 ? 16 : 0 }}
              onPress={() => toggleDesktopSection(section.title)}
            >
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: section.catColor }} />
              <Text style={styles.gridCatTitle}>{section.title}</Text>
              <Text style={{ fontSize: 12, color: colors.textSecondary }}>({section.totalCount})</Text>
              <Feather name={collapsedDesktop[section.title] ? 'chevron-right' : 'chevron-down'} size={14} color={colors.disabled} />
            </TouchableOpacity>
            {!collapsedDesktop[section.title] && (<View style={styles.gridContainer}>
              {section.data.map((item) => {
                const selected = bulk.isSelected(item.id);
                return (
                <TouchableOpacity
                  key={item.id}
                  style={[styles.gridCard, { backgroundColor: getHealthBgColor(item.margem, config.margemMeta), borderLeftWidth: 3, borderLeftColor: getHealthBorderColor(item.margem, config.margemMeta) }, isWeb && { cursor: 'pointer' }, selected && styles.rowSelected]}
                  activeOpacity={0.7}
                  onPress={() => handleRowPress(item)}
                  onLongPress={() => handleRowLongPress(item)}
                >
                  {bulk.active && (
                    <View style={[styles.checkbox, selected && styles.checkboxChecked, { marginRight: 8 }]}>
                      {selected && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    {Number(item.favorito) === 1 && (
                      <Feather name="star" size={11} color={colors.yellow || '#FFC83A'} style={{ marginRight: 4 }} />
                    )}
                    <HighlightedText text={item.nome} query={busca} style={styles.gridCardName} numberOfLines={1} />
                  </View>
                  <Text style={styles.gridCardPrice}>
                    {formatCurrency(item.precoVenda)}
                  </Text>
                </TouchableOpacity>
                );
              })}
            </View>)}
          </View>
        ))}
      </View>
    );
  }

  // Filtra linhas em janela de undo (P1-11) e por faixa de lucro (filtroLucro).
  const visibleSections = sections
    .map((s) => ({
      ...s,
      data: s.data.filter((it) => {
        if (undoDelete.hiddenIds.has(it.id)) return false;
        if (filtroLucro && getMargemClass(it.margem, config.margemMeta) !== filtroLucro) return false;
        return true;
      }),
    }))
    .filter((s) => s.data.length > 0 || filtroCategoria === s.catId);

  // P3-B Stats summary
  const visibleItems = visibleSections.flatMap((s) => s.data);
  const visCount = visibleItems.length;
  const totalLucro = visibleItems.reduce((acc, it) => acc + (Number(it.lucro) || 0), 0);
  const margens = visibleItems
    .map((it) => Number(it.margemPercent))
    .filter((n) => !isNaN(n) && isFinite(n));
  const avgMargin = margens.length ? margens.reduce((a, b) => a + b, 0) / margens.length : 0;
  const statsList = visCount > 0 ? [
    { icon: 'shopping-bag', label: 'Produtos', value: String(visCount), color: colors.primary },
    { icon: 'percent', label: 'Margem média', value: `${avgMargin.toFixed(1)}%`, color: colors.accent || '#FFD37A' },
    { icon: 'trending-up', label: 'Lucro/un. total', value: formatCurrency(totalLucro), color: colors.success || '#1a8a4f' },
  ] : [];

  return (
    <View style={styles.container}>
      {/* Filtros + busca */}
      <View style={styles.headerBar}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filtrosList}
          nestedScrollEnabled
        >
          {[{ id: null, nome: 'Todos' }, ...categorias].map((item, index) => {
            const isActive = filtroCategoria === item.id;
            const chipColor = item.id === null ? colors.primary : getCategoryColor(index - 1);
            return (
              <TouchableOpacity
                key={String(item.id)}
                style={[styles.filtroChip, isActive && { backgroundColor: chipColor, borderColor: chipColor }]}
                onPress={() => setFiltroCategoria(item.id === filtroCategoria ? null : item.id)}
                onLongPress={() => item.id !== null ? removerCategoria(item.id) : null}
              >
                {item.id === null ? (
                  <Feather name="list" size={11} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 3 }} />
                ) : (
                  <View style={[styles.chipDot, { backgroundColor: isActive ? '#fff' : chipColor }]} />
                )}
                <Text style={[styles.filtroTexto, isActive && styles.filtroTextoAtivo]} numberOfLines={1}>
                  {item.nome}
                </Text>
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity style={styles.addCatBtn} onPress={() => setModalVisible(true)}>
            <Feather name="plus" size={14} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
        <View style={[styles.searchSortRow, !isDesktop && styles.searchSortRowMobile]}>
          <View style={!isDesktop ? { width: '100%' } : { flex: 1 }}>
            <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar..." />
          </View>
          <View style={[styles.sortMenuWrap, !isDesktop && styles.sortMenuWrapMobile]}>
            <SortMenu
              value={sortBy}
              onChange={setSortBy}
              compact
              options={[
                { key: 'favoritos', label: 'Favoritos primeiro', icon: 'star' },
                { key: 'nome_asc', label: 'Nome (A→Z)', icon: 'arrow-down' },
                { key: 'nome_desc', label: 'Nome (Z→A)', icon: 'arrow-up' },
                { key: 'recentes', label: 'Mais recentes', icon: 'clock' },
                { key: 'modificados', label: 'Editados recentemente', icon: 'edit-2' },
                { key: 'preco_desc', label: 'Preço (maior)', icon: 'trending-up' },
                { key: 'preco_asc', label: 'Preço (menor)', icon: 'trending-down' },
                { key: 'lucro_desc', label: 'Maior lucro', icon: 'award' },
                { key: 'margem_asc', label: 'Menor margem', icon: 'alert-triangle' },
              ]}
            />
          </View>
          {/* Bug fix: toggle de grid escondido no mobile — grid mobile mostrava só chips de preço. */}
        </View>
        {/* Chips clicáveis de filtro por faixa de lucro (substituem a legenda passiva).
            Toggle: tocar no chip ativo limpa o filtro. "Todos" também limpa. */}
        {(() => {
          const metaPct = Math.round(config.margemMeta * 100);
          const limiteInf = Math.max(0, metaPct - 10);
          const items = [
            { key: 'acima', label: `Lucro ≥${metaPct}%`, bg: colors.success + '12', border: colors.success + '50', active: colors.success },
            { key: 'medio', label: `Lucro ${limiteInf}-${metaPct}%`, bg: YELLOW + '18', border: YELLOW + '60', active: YELLOW },
            { key: 'abaixo', label: `Lucro <${limiteInf}%`, bg: colors.error + '12', border: colors.error + '50', active: colors.error },
            { key: 'sem_preco', label: 'Sem preço', bg: colors.disabled + '0C', border: colors.disabled + '40', active: colors.disabled },
          ];
          return (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.lucroFiltroRow}
              nestedScrollEnabled
            >
              <TouchableOpacity
                key="todos"
                onPress={() => setFiltroLucro(null)}
                accessibilityRole="button"
                accessibilityLabel="Mostrar todos os produtos"
                style={[
                  styles.lucroChip,
                  filtroLucro === null && { backgroundColor: colors.primary + '15', borderColor: colors.primary, borderWidth: 1.5 },
                ]}
              >
                {filtroLucro === null && (
                  <Feather name="check" size={11} color={colors.primary} style={{ marginRight: 4 }} />
                )}
                <Text style={[styles.lucroChipText, filtroLucro === null && { color: colors.primary, fontWeight: '700' }]}>
                  Todos
                </Text>
              </TouchableOpacity>
              {items.map((it) => {
                const isActive = filtroLucro === it.key;
                return (
                  <TouchableOpacity
                    key={it.key}
                    onPress={() => setFiltroLucro(isActive ? null : it.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isActive }}
                    accessibilityLabel={`Filtrar por ${it.label}${isActive ? ' (ativo, toque para limpar)' : ''}`}
                    style={[
                      styles.lucroChip,
                      { backgroundColor: it.bg, borderLeftWidth: 3, borderLeftColor: it.border },
                      isActive && { borderWidth: 1.5, borderColor: it.active, backgroundColor: it.active + '22' },
                    ]}
                  >
                    {isActive && (
                      <Feather name="check" size={11} color={it.active} style={{ marginRight: 4 }} />
                    )}
                    <Text style={[styles.lucroChipText, isActive && { color: it.active, fontWeight: '700' }]}>
                      {it.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          );
        })()}
      </View>


      {/* Banner de erro de carregamento (P1) */}
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error || '#c0392b'} style={{ marginRight: 8, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorBannerTitle}>Não conseguimos carregar seus produtos</Text>
            <Text style={styles.errorBannerDesc} numberOfLines={3}>{loadError}</Text>
          </View>
          <TouchableOpacity onPress={() => loadData()} style={styles.errorBannerBtn}>
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Botão Adicionar */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.primary + '30', borderStyle: 'dashed' }}
        onPress={() => abrirCriacao()}
      >
        <Feather name="plus-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Novo Produto</Text>
      </TouchableOpacity>

      {/* Content */}
      {isGrid ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.desktopContentWrap}>
            <View style={styles.desktopContentInner}>
              {visibleSections.length === 0 ? (
                loading ? (
                  <Skeleton.List count={6} />
                ) : (
                  <EmptyState
                    icon={busca.trim() ? 'search' : 'box'}
                    title={busca.trim() ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                    description={busca.trim()
                      ? `Não encontramos resultados para "${busca}".`
                      : 'Último passo · Monte a ficha técnica completa combinando insumos, preparos e embalagens.'}
                    ctaLabel={!busca.trim() ? 'Criar Produto' : undefined}
                    onPress={!busca.trim() ? () => abrirCriacao() : undefined}
                  />
                )
              ) : (
                renderDesktopGrid()
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        <SectionList
          sections={visibleSections.map(s => ({
            ...s,
            data: collapsedSections[s.catId] ? [] : s.data,
          }))}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={true}
          ListHeaderComponent={statsList.length > 0 ? <ListStatsStrip stats={statsList} /> : null}
          refreshControl={
            Platform.OS !== 'web' ? (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.primary}
                colors={[colors.primary]}
              />
            ) : undefined
          }
          ListEmptyComponent={
            loading ? (
              <Skeleton.List count={6} />
            ) : (
              <EmptyState
                icon={busca.trim() ? 'search' : 'box'}
                title={busca.trim() ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
                description={busca.trim()
                  ? `Não encontramos resultados para "${busca}".`
                  : 'Crie sua primeira ficha técnica com ingredientes, preparos e embalagens.'}
                ctaLabel={!busca.trim() ? 'Criar Produto' : undefined}
                onPress={!busca.trim() ? () => abrirCriacao() : undefined}
              />
            )
          }
          renderSectionHeader={({ section }) => {
            const isCollapsed = collapsedSections[section.catId];
            return (
              <TouchableOpacity
                style={[styles.sectionHeader, isCompact && { paddingTop: 8, paddingBottom: 4 }]}
                onPress={() => setCollapsedSections(prev => ({ ...prev, [section.catId]: !prev[section.catId] }))}
                activeOpacity={0.6}
              >
                <View style={[styles.sectionDot, { backgroundColor: section.catColor }]} />
                <Text style={[styles.sectionTitle, { fontSize: isCompact ? 11 : titleFontSize }]}>{section.title}</Text>
                <Text style={styles.sectionCount}>{section.totalCount}</Text>
                <Feather
                  name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                  size={14}
                  color={colors.disabled}
                  style={{ marginLeft: 6 }}
                />
              </TouchableOpacity>
            );
          }}
          renderItem={({ item, index, section }) => {
            const isFirst = index === 0;
            const isLast = index === section.data.length - 1;
            const catColor = catColorMap[item.categoria_id] || catColorMap['null'] || colors.disabled;
            const inicial = (item.nome || '?').charAt(0).toUpperCase();
            const selected = bulk.isSelected(item.id);

            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  { backgroundColor: getHealthBgColor(item.margem, config.margemMeta), borderLeftWidth: 3, borderLeftColor: getHealthBorderColor(item.margem, config.margemMeta) },
                  isFirst && styles.rowFirst,
                  isLast && styles.rowLast,
                  !isLast && styles.rowBorder,
                  selected && styles.rowSelected,
                  rowOverride,
                  { minHeight: rowMinHeight },
                ]}
                onPress={() => handleRowPress(item)}
                onLongPress={() => handleRowLongPress(item)}
                activeOpacity={0.6}
              >
                {/* Avatar com inicial OU checkbox no modo bulk */}
                {bulk.active ? (
                  <View style={[styles.checkbox, selected && styles.checkboxChecked, { marginRight: spacing.sm }]}>
                    {selected && <Feather name="check" size={14} color="#fff" />}
                  </View>
                ) : (
                  <View style={[styles.avatar, { backgroundColor: catColor + '18', width: avatarSize, height: avatarSize, borderRadius: avatarSize / 2 }]}>
                    <Text style={[styles.avatarText, { color: catColor }]}>{inicial}</Text>
                  </View>
                )}

                {/* Info */}
                <View style={styles.rowInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    {Number(item.favorito) === 1 && (
                      <Feather name="star" size={11} color={colors.yellow || '#FFC83A'} />
                    )}
                    <HighlightedText text={item.nome} query={busca} style={[styles.rowNome, nameOverride]} numberOfLines={1} />
                  </View>
                  <View style={styles.itemMeta}>
                    <Text style={styles.itemMetaText}>CMV {formatCurrency(item.custoTotal)}</Text>
                    <Text style={styles.itemMetaSep}>•</Text>
                    <Text style={styles.itemMetaText}>Venda {formatCurrency(item.precoVenda)}</Text>
                  </View>
                </View>

                {/* Lucro */}
                <View style={styles.rowRight}>
                  <Text style={[styles.itemLucro, { color: item.lucro >= 0 ? colors.success : colors.error }]}>
                    {formatCurrency(item.lucro)}
                  </Text>
                  <Text style={styles.itemLucroLabel}>lucro</Text>
                </View>

                {/* Duplicar + Excluir (escondidos no modo bulk) */}
                {!bulk.active && (
                  <>
                    <TouchableOpacity
                      onPress={() => duplicarProduto(item)}
                      style={styles.copyBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Duplicar produto"
                      {...(Platform.OS === 'web' ? { title: 'Duplicar produto' } : {})}
                    >
                      <Feather name="copy" size={13} color={colors.disabled} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => solicitarExclusao(item.id, item.nome)}
                      style={styles.deleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel="Excluir produto"
                      {...(Platform.OS === 'web' ? { title: 'Excluir produto' } : {})}
                    >
                      <Feather name="trash-2" size={13} color={colors.disabled} />
                    </TouchableOpacity>
                  </>
                )}
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      {!bulk.active && (
        <FAB onPress={() => abrirCriacao()} label={isDesktop ? 'Novo Produto' : undefined} />
      )}

      <BulkActionBar
        visible={bulk.active}
        count={bulk.count}
        totalVisible={visibleSections.reduce((acc, s) => acc + s.data.length, 0)}
        onSelectAll={() => bulk.selectAll(visibleSections.flatMap((s) => s.data.map((d) => d.id)))}
        onCancel={bulk.clear}
        onDelete={solicitarExclusaoEmMassa}
        actions={[
          ...(bulk.count === 1 ? [{ icon: 'eye', label: 'Visualizar', onPress: () => {
            const onlyId = Array.from(bulk.selectedIds)[0];
            const item = visibleItems.find((i) => i.id === onlyId);
            if (item) setPreviewItem(item);
          } }] : []),
          { icon: 'folder', label: 'Mover', onPress: () => setShowMoveModal(true) },
          { icon: 'copy', label: 'Duplicar', onPress: duplicarEmMassa },
          {
            icon: 'star',
            label: (() => {
              const sel = visibleItems.filter((i) => bulk.isSelected(i.id));
              const allFav = sel.length > 0 && sel.every((i) => Number(i.favorito) === 1);
              return allFav ? 'Desfavoritar' : 'Favoritar';
            })(),
            onPress: favoritarEmMassa,
          },
          { icon: 'trending-up', label: 'Reajustar', onPress: () => setShowPriceModal(true) },
          ...(isCsvExportSupported() ? [{ icon: 'download', label: 'CSV', onPress: exportarCSVEmMassa }] : []),
        ]}
      />

      <CategoryPickerModal
        visible={showMoveModal}
        title="Mover produtos para..."
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        categorias={categorias}
        onSelect={moverEmMassa}
        onCancel={() => setShowMoveModal(false)}
      />

      <BulkPriceAdjustModal
        visible={showPriceModal}
        title="Reajustar preço de venda"
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        currentLabel="preços de venda"
        onConfirm={reajustarEmMassa}
        onCancel={() => setShowPriceModal(false)}
      />

      <InfoToast
        visible={!!infoToast}
        message={infoToast?.message}
        icon={infoToast?.icon}
        onDismiss={() => setInfoToast(null)}
      />

      <ItemPreviewModal
        visible={!!previewItem}
        title={previewItem?.nome}
        subtitle={previewItem?.categoria_nome || previewItem?.categoria || 'Sem categoria'}
        icon="box"
        iconColor={colors.success}
        meta={previewItem?.updated_at ? `Editado ${formatTimeAgo(previewItem.updated_at)}` : null}
        favorito={previewItem ? Number(previewItem.favorito) : 0}
        onToggleFavorite={previewItem ? () => toggleFavoritoSingular(previewItem) : undefined}
        fields={previewItem ? [
          { label: 'Categoria', value: previewItem.categoria_nome || previewItem.categoria || 'Sem categoria' },
          { label: 'Preço de venda', value: formatCurrency(previewItem.preco_venda) },
          { label: 'CMV', value: formatCurrency(previewItem.custoTotal) },
          { label: 'Lucro/un.', value: formatCurrency(previewItem.lucro) },
          { label: 'Margem', value: typeof previewItem.margem === 'number' ? formatPercent(previewItem.margem) : '—', accent: true },
        ] : []}
        onEdit={() => {
          const id = previewItem?.id;
          setPreviewItem(null);
          bulk.clear();
          if (id) abrirEdicao(id);
        }}
        onClose={() => setPreviewItem(null)}
      />

      {/* Sessão 28.9 — Modal popup pra Novo / Editar Produto */}
      <EntityCreateModal
        visible={showCreateModal}
        mode="produto"
        editId={editingId}
        defaultCategoriaId={filtroCategoria}
        onClose={() => { setShowCreateModal(false); setEditingId(null); }}
        onSaved={() => loadData()}
      />

      {/* Modal nova categoria */}
      <Modal visible={modalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <View style={styles.modalHeader}>
              <Feather name="folder-plus" size={18} color={colors.primary} />
              <Text style={styles.modalTitle}>Nova Categoria</Text>
            </View>

            <Text style={styles.modalLabel}>Nome da categoria</Text>
            <TextInput
              style={styles.modalInput}
              value={novaCategoria}
              onChangeText={setNovaCategoria}
              placeholder="Ex: Bolos, Salgados..."
              placeholderTextColor={colors.disabled}
              autoFocus
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={adicionarCategoria}>
                <Feather name="check" size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.modalSaveText}>Adicionar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ConfirmDeleteModal
        visible={!!confirmDelete}
        isFocused={isFocused}
        titulo={confirmDelete?.titulo}
        nome={confirmDelete?.nome}
        aviso={confirmDelete?.aviso}
        onConfirm={confirmDelete?.onConfirm}
        onCancel={() => setConfirmDelete(null)}
      />

      <UndoToast
        visible={!!undoDelete.pending}
        message={undoDelete.pending?.message}
        onUndo={undoDelete.undo}
        onTimeout={undoDelete.onTimeout}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Banner de erro de carregamento (P1)
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: (colors.error || '#c0392b') + '12',
    borderWidth: 1,
    borderColor: (colors.error || '#c0392b') + '40',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
  },
  errorBannerTitle: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    color: colors.error || '#c0392b',
    marginBottom: 2,
  },
  errorBannerDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  errorBannerBtn: {
    backgroundColor: colors.error || '#c0392b',
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    marginLeft: spacing.sm,
    alignSelf: 'center',
  },
  errorBannerBtnText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
  },

  // Header
  headerBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },

  // Filtros
  filtrosList: { paddingHorizontal: spacing.md, gap: 2 },
  searchSortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingRight: spacing.md,
  },
  searchSortRowMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 0,
    paddingRight: 0,
  },
  sortMenuWrap: {
    paddingTop: spacing.xs,
  },
  sortMenuWrapMobile: {
    paddingTop: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  filtroChip: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm + 2, paddingVertical: 5,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginRight: 2,
  },
  chipDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4,
  },
  filtroTexto: {
    fontSize: 11, fontWeight: '600', color: colors.text, maxWidth: 90,
    fontFamily: fontFamily.semiBold,
  },
  filtroTextoAtivo: { color: '#fff' },
  addCatBtn: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary + '10', borderWidth: 1.5,
    borderColor: colors.primary, borderStyle: 'dashed',
    justifyContent: 'center', alignItems: 'center', marginLeft: 4,
  },

  // Lista
  list: { padding: spacing.md, paddingBottom: 80 },

  // Seção header
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: spacing.md, paddingBottom: 6,
    paddingHorizontal: 2,
    backgroundColor: colors.background,
  },
  sectionDot: {
    width: 8, height: 8, borderRadius: 4, marginRight: 6,
  },
  sectionTitle: {
    fontSize: 12, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.textSecondary, flex: 1, textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 11, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.disabled,
  },

  // Rows agrupados
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingLeft: spacing.sm + 2, paddingRight: 4,
  },
  rowFirst: {
    borderTopLeftRadius: borderRadius.md, borderTopRightRadius: borderRadius.md,
  },
  rowLast: {
    borderBottomLeftRadius: borderRadius.md, borderBottomRightRadius: borderRadius.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
    marginBottom: 2,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  // Legenda semáforo (mantida por compat, mas hoje a UI usa chips clicáveis abaixo).
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingTop: 6, paddingBottom: 2,
  },
  legendSwatch: { width: 20, height: 14, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.text, fontFamily: fontFamily.medium, fontWeight: '500', marginRight: 10 },

  // Chips clicáveis de filtro por faixa de lucro (substituem a legenda passiva).
  lucroFiltroRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: 6, paddingBottom: 4, gap: 6,
  },
  lucroChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 14, borderWidth: 1, borderColor: 'transparent',
    backgroundColor: colors.surface || '#f5f5f5',
  },
  lucroChipText: {
    fontSize: 11, color: colors.text,
    fontFamily: fontFamily.medium, fontWeight: '500',
  },

  // Checkbox bulk
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rowSelected: {
    backgroundColor: colors.primary + '0E',
  },

  // Avatar
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 15, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Info
  rowInfo: {
    flex: 1, marginRight: spacing.sm,
  },
  rowNome: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text,
  },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  itemMetaText: { fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary },
  itemMetaSep: { fontSize: 12, color: colors.disabled, marginHorizontal: 4 },

  // Lucro
  rowRight: {
    alignItems: 'flex-end', marginRight: 2,
  },
  itemLucro: { fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700' },
  itemLucroLabel: { fontSize: 11, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },

  // Duplicar
  copyBtn: {
    padding: 8,
  },
  // Excluir
  deleteBtn: {
    padding: 8,
  },

  // Desktop grid
  desktopContentWrap: {
    flex: 1,
  },
  desktopContentInner: {
    maxWidth: 1200,
    width: '100%',
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    justifyContent: 'flex-start',
  },
  gridCard: {
    position: 'relative',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    width: '23.5%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gridCardName: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  gridCardPrice: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    flexShrink: 0,
  },
  gridCatHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  gridCatTitle: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },


  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 400,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },
  modalLabel: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm,
  },
  modalInput: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 4, fontSize: fonts.regular,
    color: colors.text, fontFamily: fontFamily.regular,
  },
  modalActions: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginTop: spacing.lg, gap: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.textSecondary, fontFamily: fontFamily.semiBold,
    fontWeight: '600', fontSize: fonts.regular,
  },
  modalSaveBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: {
    color: colors.textLight, fontFamily: fontFamily.bold,
    fontWeight: '700', fontSize: fonts.regular,
  },
});
