import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, FlatList, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import SearchBar from '../components/SearchBar';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, getTipoUnidade, normalizeSearch } from '../utils/calculations';
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
import ListStatsStrip from '../components/ListStatsStrip';
import BulkPriceAdjustModal from '../components/BulkPriceAdjustModal';
import { exportToCSV, isCsvExportSupported } from '../utils/exportCsv';
import ItemPreviewModal from '../components/ItemPreviewModal';
import EntityCreateModal from '../components/EntityCreateModal';
import { formatTimeAgo } from '../utils/timeAgo';
import ViewModeToggle from '../components/ViewModeToggle';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useBulkSelection from '../hooks/useBulkSelection';
import { t } from '../i18n/pt-BR';
// Sprint 2 S5 — checagem central de dependências antes de delete (audit P0-05).
import { contarDependencias, formatarMensagemDeps } from '../services/dependenciesService';

// Cores para categorias
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

// Cor da badge de unidade
function getUnidadeInfo(unidade) {
  const tipo = getTipoUnidade(unidade);
  if (tipo === 'peso') return { label: 'kg', color: colors.primary };
  if (tipo === 'volume') return { label: 'L', color: colors.accent };
  return { label: 'un', color: colors.purple };
}

function formatRendimento(valor, unidade) {
  const tipo = getTipoUnidade(unidade);
  if (tipo === 'peso') {
    if (valor >= 1000) return `${(valor / 1000).toFixed(valor % 1000 === 0 ? 0 : 1)} kg`;
    return `${valor} g`;
  }
  if (tipo === 'volume') {
    if (valor >= 1000) return `${(valor / 1000).toFixed(valor % 1000 === 0 ? 0 : 1)} L`;
    return `${valor} mL`;
  }
  return `${valor} ${valor === 1 ? 'unidade' : 'unidades'}`;
}

export default function PreparosScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const [sections, setSections] = useState([]);
  const [totalPreparos, setTotalPreparos] = useState(0);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = usePersistedState('preparos.filtroCategoria', null);
  const [loadError, setLoadError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoIcone, setNovoIcone] = useState('tag');
  const [busca, setBusca] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const undoDelete = useUndoableDelete();
  const [sortBy, setSortBy] = usePersistedState('preparos.sortBy', 'nome_asc');
  const [viewMode, setViewMode] = usePersistedState('preparos.viewMode', 'list');
  // Bug fix: no mobile o grid renderiza apenas chips com preço (sem nome). Força lista no mobile.
  const isGrid = isDesktop;
  const { rowOverride, nameOverride, avatarSize, isCompact, rowMinHeight, titleFontSize, listItemSubtitleFontSize } = useListDensity();
  const bulk = useBulkSelection();
  // Mapa de cores por categoria ID
  const [catColorMap, setCatColorMap] = useState({});
  // Seções recolhidas
  const [collapsedSections, setCollapsedSections] = useState({});
  // Desktop grid seções recolhidas
  const [collapsedDesktop, setCollapsedDesktop] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [infoToast, setInfoToast] = useState(null);
  // Sessão 28.9 — modal popup pra Novo / Editar Preparo
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  function abrirCriacao() { setEditingId(null); setShowCreateModal(true); }
  function abrirEdicao(id) { setEditingId(id); setShowCreateModal(true); }

  function toggleDesktopSection(key) { setCollapsedDesktop(prev => ({...prev, [key]: !prev[key]})); }

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }

  useFocusEffect(useCallback(() => {
    loadData();
    // Sessão 28.14: se voltou de uma edição feita PELO modal de preparo, reabre o modal automaticamente
    (async () => {
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const raw = await AsyncStorage.getItem('reopenEntityModalAfterEdit');
        if (!raw) return;
        const info = JSON.parse(raw);
        await AsyncStorage.removeItem('reopenEntityModalAfterEdit');
        if (info?.mode !== 'preparo') return;
        if (!info?.ts || (Date.now() - info.ts) > 5 * 60 * 1000) return;
        setEditingId(info.editId || null);
        setShowCreateModal(true);
      } catch {}
    })();
    // Sessão 28.21: deep-link pra abrir edição direto do EntityCreateModal (vindo do produto)
    try {
      const navState = navigation.getState && navigation.getState();
      const route = navState?.routes?.[navState.index];
      const preparoEditId = route?.params?.openPreparoEdit;
      if (preparoEditId) {
        setEditingId(preparoEditId);
        setShowCreateModal(true);
        navigation.setParams({ openPreparoEdit: undefined });
      }
    } catch {}
    return () => setConfirmDelete(null);
  }, [filtroCategoria, busca, sortBy, navigation]));

  async function loadData() {
    setLoading(true);
    setLoadError(false);
    try {
    const db = await getDatabase();
    const cats = await db.getAllAsync('SELECT * FROM categorias_preparos ORDER BY nome');
    setCategorias(cats);

    // Monta mapa de cores fixo por ID
    const colorMap = {};
    cats.forEach((c, i) => { colorMap[c.id] = getCategoryColor(i); });
    colorMap['null'] = colors.disabled;
    setCatColorMap(colorMap);

    // Ordenação dinâmica via sortBy (P1-22 + P3-H/I)
    const orderClauses = {
      nome_asc: 'nome COLLATE NOCASE ASC',
      nome_desc: 'nome COLLATE NOCASE DESC',
      recentes: 'id DESC',
      modificados: 'updated_at DESC', // P3-I
      favoritos: 'nome COLLATE NOCASE ASC', // P3-H — re-sort em JS
    };
    const orderBy = orderClauses[sortBy] || orderClauses.nome_asc;
    let preparos = await db.getAllAsync(`SELECT * FROM preparos ORDER BY ${orderBy}`);
    if (sortBy === 'favoritos') {
      preparos = [...preparos].sort((a, b) => {
        const fa = a.favorito ? 1 : 0, fb = b.favorito ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return String(a.nome || '').localeCompare(String(b.nome || ''));
      });
    }
    setTotalPreparos(preparos.length);

    let preparosFiltrados = preparos;
    if (busca.trim()) {
      const termo = normalizeSearch(busca);
      preparosFiltrados = preparos.filter(p => normalizeSearch(p.nome).includes(termo));
    }

    const grouped = {};
    const semCategoria = { id: null, nome: 'Sem categoria', icone: 'inbox' };

    cats.forEach(c => { grouped[c.id] = { ...c, data: [] }; });
    grouped['null'] = { ...semCategoria, data: [] };

    preparosFiltrados.forEach(p => {
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
      console.error('[PreparosScreen.loadData]', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function duplicarPreparo(item) {
    try {
      const db = await getDatabase();
      const result = await db.runAsync(
        'INSERT INTO preparos (nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg, updated_at) VALUES (?,?,?,?,?,?,?)',
        [item.nome + ' (cópia)', item.categoria_id, item.rendimento_total, item.unidade_medida, item.custo_total, item.custo_por_kg, new Date().toISOString()]
      );
      const newId = result?.lastInsertRowId;
      if (newId) {
        // Copy ingredients in single bulk INSERT
        const ings = await db.getAllAsync('SELECT * FROM preparo_ingredientes WHERE preparo_id = ?', [item.id]);
        if (ings.length > 0) {
          const placeholders = ings.map(() => '(?,?,?,?)').join(',');
          const params = [];
          for (const ing of ings) {
            params.push(newId, ing.materia_prima_id, ing.quantidade_utilizada, ing.custo);
          }
          await db.runAsync(
            `INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES ${placeholders}`,
            params
          );
        }
        abrirEdicao(newId);
      } else {
        loadData();
      }
    } catch (e) {
      console.error('[PreparosScreen.duplicarPreparo]', e);
      Alert.alert('Erro', 'Não foi possível duplicar o preparo.');
    }
  }

  async function solicitarExclusao(id, nome) {
    // Sprint 2 S5 — antes de excluir, conta produtos/sub-preparos que usam este preparo.
    let mensagemExtra = null;
    try {
      const db = await getDatabase();
      const deps = await contarDependencias(db, 'preparo', id);
      if (deps.total > 0) {
        mensagemExtra = formatarMensagemDeps(deps, { acao: 'excluir', entidade: 'preparo' });
      }
    } catch (e) {
      console.error('[PreparosScreen.solicitarExclusao.deps]', e);
    }
    setConfirmDelete({
      titulo: 'Excluir Preparo',
      nome,
      aviso: mensagemExtra,
      onConfirm: async () => {
        setConfirmDelete(null);
        await undoDelete.requestDelete({
          id,
          message: `Preparo "${nome}" excluído`,
          commit: async () => {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM preparos WHERE id = ?', [id]);
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
      for (const id of ids) {
        const deps = await contarDependencias(db, 'preparo', id);
        totalRefs += deps.total;
      }
      if (totalRefs > 0) {
        mensagemExtra = `${totalRefs} referência${totalRefs === 1 ? '' : 's'} ${totalRefs === 1 ? 'será afetada' : 'serão afetadas'} (produtos perderão o preparo do CMV).`;
      }
    } catch (e) {
      console.error('[PreparosScreen.solicitarExclusaoEmMassa.deps]', e);
    }
    setConfirmDelete({
      titulo: ids.length === 1 ? 'Excluir Preparo' : `Excluir ${ids.length} preparos`,
      nome: ids.length === 1 ? null : `${ids.length} itens selecionados`,
      aviso: mensagemExtra,
      onConfirm: async () => {
        setConfirmDelete(null);
        await undoDelete.requestDelete({
          id: ids,
          message: ids.length === 1 ? '1 preparo excluído' : `${ids.length} preparos excluídos`,
          commit: async () => {
            const db = await getDatabase();
            const placeholders = ids.map(() => '?').join(',');
            await db.runAsync(`DELETE FROM preparos WHERE id IN (${placeholders})`, ids);
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
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE preparos SET categoria_id = ? WHERE id IN (${placeholders})`,
      [catId, ...ids]
    );
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'preparo movido' : 'preparos movidos'}`, icon: 'folder' });
    loadData();
  }

  async function duplicarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT * FROM preparos WHERE id IN (${placeholders})`, ids
    );
    for (const item of itens) {
      const result = await db.runAsync(
        'INSERT INTO preparos (nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg) VALUES (?,?,?,?,?,?)',
        [item.nome + ' (cópia)', item.categoria_id, item.rendimento_total, item.unidade_medida, item.custo_total, item.custo_por_kg]
      );
      const newId = result?.lastInsertRowId;
      if (newId) {
        const ings = await db.getAllAsync('SELECT * FROM preparo_ingredientes WHERE preparo_id = ?', [item.id]);
        await Promise.all(ings.map(ing => db.runAsync(
          'INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES (?,?,?,?)',
          [newId, ing.materia_prima_id, ing.quantidade_utilizada, ing.custo]
        )));
      }
    }
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'preparo duplicado' : 'preparos duplicados'}`, icon: 'copy' });
    loadData();
  }

  async function reajustarEmMassa({ mode, value, sign }) {
    const ids = Array.from(bulk.selectedIds);
    setShowPriceModal(false);
    if (ids.length === 0 || !value) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(`SELECT * FROM preparos WHERE id IN (${placeholders})`, ids);
    const factor = mode === 'percent' ? 1 + (sign * value) / 100 : null;
    // Preparos: aplica delta direto em custo_total (override manual). Recalcula custo_por_kg
    // baseado em rendimento_total. ATENÇÃO: editar e salvar o preparo recalcula custo
    // a partir dos ingredientes, sobrescrevendo este reajuste.
    await Promise.all(itens.map((item) => {
      const oldCusto = Number(item.custo_total) || 0;
      let novoCusto = mode === 'percent' ? oldCusto * factor : oldCusto + sign * value;
      if (novoCusto < 0) novoCusto = 0;
      const rend = Number(item.rendimento_total) || 1;
      const novoCustoKg = rend > 0 ? novoCusto / rend : 0;
      return db.runAsync(
        'UPDATE preparos SET custo_total = ?, custo_por_kg = ? WHERE id = ?',
        [novoCusto, novoCustoKg, item.id]
      );
    }));
    bulk.clear();
    const sigStr = sign === 1 ? '+' : '−';
    const valStr = mode === 'percent' ? `${value}%` : `R$ ${value.toFixed(2).replace('.', ',')}`;
    setInfoToast({
      message: `${ids.length} ${ids.length === 1 ? 'preparo reajustado' : 'preparos reajustados'} (${sigStr}${valStr})`,
      icon: 'trending-up',
    });
    loadData();
  }

  async function favoritarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const itens = visibleItems.filter((i) => bulk.isSelected(i.id));
    const allFav = itens.every((i) => Number(i.favorito) === 1);
    const novoVal = allFav ? 0 : 1;
    const db = await getDatabase();
    await Promise.all(ids.map((id) =>
      db.runAsync('UPDATE preparos SET favorito = ? WHERE id = ?', [novoVal, id])
    ));
    bulk.clear();
    setInfoToast({
      message: novoVal === 1
        ? `${ids.length} ${ids.length === 1 ? 'preparo favoritado' : 'preparos favoritados'}`
        : `${ids.length} ${ids.length === 1 ? 'preparo desfavoritado' : 'preparos desfavoritados'}`,
      icon: 'star',
    });
    loadData();
  }

  async function toggleFavoritoSingular(item) {
    const novo = Number(item.favorito) === 1 ? 0 : 1;
    const db = await getDatabase();
    await db.runAsync('UPDATE preparos SET favorito = ? WHERE id = ?', [novo, item.id]);
    setPreviewItem({ ...item, favorito: novo });
    loadData();
  }

  async function exportarCSVEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT p.*, c.nome AS categoria_nome FROM preparos p LEFT JOIN categorias_preparos c ON c.id = p.categoria_id WHERE p.id IN (${placeholders}) ORDER BY p.nome`,
      ids
    );
    const rows = itens.map((it) => ({
      nome: it.nome,
      categoria: it.categoria_nome || 'Sem categoria',
      unidade: it.unidade_medida,
      rendimento_total: it.rendimento_total,
      custo_total: it.custo_total,
      custo_por_kg: it.custo_por_kg,
    }));
    const ok = exportToCSV('preparos.csv', rows, [
      { key: 'nome', label: 'Nome' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'rendimento_total', label: 'Rendimento total' },
      { key: 'custo_total', label: 'Custo total (R$)' },
      { key: 'custo_por_kg', label: 'Custo por kg/L (R$)' },
    ]);
    if (ok) {
      bulk.clear();
      setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'preparo exportado' : 'preparos exportados'}`, icon: 'download' });
    }
  }

  async function adicionarCategoria() {
    if (!novaCategoria.trim()) return Alert.alert(t.alertAttention, t.validation.requiredCategoryName);
    const db = await getDatabase();
    await db.runAsync('INSERT INTO categorias_preparos (nome, icone) VALUES (?, ?)', [novaCategoria.trim(), novoIcone]);
    setNovaCategoria('');
    setNovoIcone('tag');
    setModalVisible(false);
    loadData();
  }

  function removerCategoria(catId) {
    const cat = categorias.find(c => c.id === catId);
    setConfirmDelete({
      titulo: 'Remover Categoria',
      nome: cat ? cat.nome : 'esta categoria',
      onConfirm: async () => {
        const db = await getDatabase();
        const preparos = await db.getAllAsync('SELECT * FROM preparos WHERE categoria_id = ?', [catId]);
        for (const p of preparos) {
          await db.runAsync('UPDATE preparos SET categoria_id=? WHERE id=?', [null, p.id]);
        }
        await db.runAsync('DELETE FROM categorias_preparos WHERE id = ?', [catId]);
        if (filtroCategoria === catId) setFiltroCategoria(null);
        setConfirmDelete(null);
        loadData();
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
                  style={[styles.gridCard, isWeb && { cursor: 'pointer' }, selected && styles.rowSelected]}
                  activeOpacity={0.7}
                  onPress={() => handleRowPress(item)}
                  onLongPress={() => handleRowLongPress(item)}
                >
                  {bulk.active && (
                    <View style={[styles.checkbox, selected && styles.checkboxChecked, { marginRight: 8 }]}>
                      {selected && <Feather name="check" size={12} color="#fff" />}
                    </View>
                  )}
                  {Number(item.favorito) === 1 && (
                    <Feather name="star" size={11} color={colors.yellow || '#FFC83A'} style={{ marginRight: 4 }} />
                  )}
                  <HighlightedText text={item.nome} query={busca} style={styles.gridCardName} numberOfLines={1} />
                  <Text style={styles.gridCardPrice}>
                    Rende {formatRendimento(item.rendimento_total, item.unidade_medida)}
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

  // Filtra linhas em janela de undo (P1-11) — memoizado para evitar map+filter a cada render.
  const visibleSections = useMemo(() => sections
    .map((s) => ({ ...s, data: s.data.filter((it) => !undoDelete.hiddenIds.has(it.id)) }))
    .filter((s) => s.data.length > 0 || filtroCategoria === s.catId),
    [sections, undoDelete.hiddenIds, filtroCategoria]);

  // P3-B Stats summary — flatMap + reduces só recomputam quando visibleSections muda.
  const visibleItems = useMemo(() => visibleSections.flatMap((s) => s.data), [visibleSections]);

  const statsList = useMemo(() => {
    const visCount = visibleItems.length;
    if (visCount === 0) return [];
    const avgKg = visibleItems.reduce((acc, it) => acc + (Number(it.custo_por_kg) || 0), 0) / visCount;
    const totalCusto = visibleItems.reduce((acc, it) => acc + (Number(it.custo_total) || 0), 0);
    return [
      { icon: 'layers', label: 'Preparos', value: String(visCount), color: colors.primary },
      { icon: 'tag', label: 'Médio/kg', value: formatCurrency(avgKg), color: colors.accent || '#FFD37A' },
      { icon: 'shopping-cart', label: 'Custo total', value: formatCurrency(totalCusto), color: colors.success || '#1a8a4f' },
    ];
  }, [visibleItems]);

  return (
    <View style={styles.container}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>Não foi possível carregar os preparos.</Text>
          <TouchableOpacity onPress={loadData} style={styles.errorBannerBtn} activeOpacity={0.7}>
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}
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
              options={[
                { key: 'favoritos', label: 'Favoritos primeiro', icon: 'star' },
                { key: 'nome_asc', label: 'Nome (A→Z)', icon: 'arrow-down' },
                { key: 'nome_desc', label: 'Nome (Z→A)', icon: 'arrow-up' },
                { key: 'recentes', label: 'Mais recentes', icon: 'clock' },
                { key: 'modificados', label: 'Editados recentemente', icon: 'edit-2' },
              ]}
            />
          </View>
          {/* Bug fix: toggle de grid escondido no mobile — grid mobile mostrava só chips de preço. */}
        </View>
      </View>

      {/* Botão Adicionar */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.primary + '30', borderStyle: 'dashed' }}
        onPress={() => abrirCriacao()}
      >
        <Feather name="plus-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Novo Preparo</Text>
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
                    icon={busca.trim() ? 'search' : 'layers'}
                    title={busca.trim() ? 'Nenhum preparo encontrado' : 'Nenhum preparo cadastrado'}
                    description={busca.trim()
                      ? `Não encontramos resultados para "${busca}".`
                      : 'Passo 3 · Crie receitas base combinando seus insumos. Cadastre insumos primeiro se ainda não fez.'}
                    ctaLabel={!busca.trim() ? 'Cadastrar preparo' : undefined}
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
                icon={busca.trim() ? 'search' : 'layers'}
                title={busca.trim()
                  ? 'Nenhum preparo encontrado'
                  : 'Nenhum preparo cadastrado'}
                description={busca.trim()
                  ? `Não encontramos resultados para "${busca}".`
                  : 'Passo 3 · Crie receitas base combinando seus insumos. Cadastre insumos primeiro se ainda não fez.'}
                ctaLabel={!busca.trim() ? 'Cadastrar preparo' : undefined}
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
            const unidadeInfo = getUnidadeInfo(item.unidade_medida);
            const selected = bulk.isSelected(item.id);

            return (
              <TouchableOpacity
                style={[
                  styles.row,
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
                  <Text style={[styles.rowMarca, { fontSize: listItemSubtitleFontSize }]} numberOfLines={1}>
                    Rende {formatRendimento(item.rendimento_total, item.unidade_medida)}
                  </Text>
                </View>

                {/* Preço + unidade */}
                <View style={styles.rowRight}>
                  <Text style={styles.rowPreco}>{formatCurrency(item.custo_total)}</Text>
                  <View style={[styles.unidadeBadge, { backgroundColor: unidadeInfo.color + '12' }]}>
                    <Text style={[styles.unidadeText, { color: unidadeInfo.color }]}>{unidadeInfo.label}</Text>
                  </View>
                </View>

                {/* Duplicar + Excluir (escondidos no modo bulk) */}
                {!bulk.active && (
                  <>
                    <TouchableOpacity
                      onPress={() => duplicarPreparo(item)}
                      style={styles.copyBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    >
                      <Feather name="copy" size={13} color={colors.disabled} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => solicitarExclusao(item.id, item.nome)}
                      style={styles.deleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
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
        <FAB onPress={() => abrirCriacao()} label={isDesktop ? 'Novo Preparo' : undefined} />
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
        title="Mover preparos para..."
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        categorias={categorias}
        onSelect={moverEmMassa}
        onCancel={() => setShowMoveModal(false)}
      />

      <BulkPriceAdjustModal
        visible={showPriceModal}
        title="Reajustar custo de preparo"
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'} · custo será sobrescrito`}
        currentLabel="custos de preparo"
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
        subtitle={previewItem?.categoria_nome || 'Sem categoria'}
        icon="layers"
        iconColor={colors.accent}
        meta={previewItem?.updated_at ? `Editado ${formatTimeAgo(previewItem.updated_at)}` : null}
        favorito={previewItem ? Number(previewItem.favorito) : 0}
        onToggleFavorite={previewItem ? () => toggleFavoritoSingular(previewItem) : undefined}
        fields={previewItem ? [
          { label: 'Categoria', value: previewItem.categoria_nome || 'Sem categoria' },
          { label: 'Unidade', value: previewItem.unidade_medida },
          { label: 'Rendimento', value: formatRendimento(previewItem.rendimento_total, previewItem.unidade_medida) },
          { label: 'Custo total', value: formatCurrency(previewItem.custo_total) },
          { label: 'Custo por kg/L', value: formatCurrency(previewItem.custo_por_kg), accent: true },
        ] : []}
        onEdit={() => {
          const id = previewItem?.id;
          setPreviewItem(null);
          bulk.clear();
          if (id) abrirEdicao(id);
        }}
        onClose={() => setPreviewItem(null)}
      />

      {/* Sessão 28.9 — Modal popup pra Novo / Editar Preparo */}
      <EntityCreateModal
        visible={showCreateModal}
        mode="preparo"
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
              placeholder="Ex: Recheios, Caldas..."
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
  sortMenuWrapMobile: {
    paddingTop: 0,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
  sortMenuWrap: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
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
    backgroundColor: colors.surface,
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
  rowMarca: {
    fontSize: 12, fontFamily: fontFamily.regular,
    color: colors.textSecondary, marginTop: 1,
  },

  // Preço + unidade
  rowRight: {
    alignItems: 'flex-end', marginRight: 2,
  },
  rowPreco: {
    fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.primary,
  },
  unidadeBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, marginTop: 2,
  },
  unidadeText: {
    fontSize: 11, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Duplicar
  copyBtn: {
    padding: 6,
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
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fee2e2', borderLeftWidth: 3, borderLeftColor: colors.error,
    padding: spacing.sm + 2, marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  errorBannerText: {
    flex: 1, color: colors.error, fontFamily: fontFamily.semiBold,
    fontWeight: '600', fontSize: fonts.small,
  },
  errorBannerBtn: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: 6,
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
  },
  errorBannerBtnText: {
    color: '#fff', fontFamily: fontFamily.bold, fontWeight: '700', fontSize: fonts.small,
  },
});
