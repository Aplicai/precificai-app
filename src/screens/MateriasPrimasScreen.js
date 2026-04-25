import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
// Sprint 4 F1 — FABMenu expõe "Lançar compra" / "Ajustar saldo" quando
// modo_avancado_estoque on; antes estavam escondidos dentro dos cards a 15px.
import FABMenu from '../components/FABMenu';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, getTipoUnidade, normalizeSearch } from '../utils/calculations';
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
import useFeatureFlag from '../hooks/useFeatureFlag';
import { statusEstoque } from '../services/estoque';
import BulkPriceAdjustModal from '../components/BulkPriceAdjustModal';
import ListStatsStrip from '../components/ListStatsStrip';
import { exportToCSV, isCsvExportSupported } from '../utils/exportCsv';
import ItemPreviewModal from '../components/ItemPreviewModal';
import ViewModeToggle from '../components/ViewModeToggle';
import { formatTimeAgo } from '../utils/timeAgo';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useUndoableDelete from '../hooks/useUndoableDelete';
import useBulkSelection from '../hooks/useBulkSelection';
import { t } from '../i18n/pt-BR';

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

function getUnidadeLabel(unidade) {
  const tipo = getTipoUnidade(unidade);
  return tipo === 'peso' ? '/kg' : tipo === 'volume' ? '/L' : '/un';
}

// Cascade-warning: lista produtos e preparos que usam o(s) insumo(s).
// Retorna { produtos: [{id,nome}], preparos: [{id,nome}], total } ou null se nada.
async function getInsumoDependencies(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return null;
  try {
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const produtos = await db.getAllAsync(
      `SELECT DISTINCT p.id, p.nome FROM produtos p
       INNER JOIN produto_ingredientes pi ON pi.produto_id = p.id
       WHERE pi.materia_prima_id IN (${placeholders})
       ORDER BY p.nome ASC`,
      ids
    );
    const preparos = await db.getAllAsync(
      `SELECT DISTINCT p.id, p.nome FROM preparos p
       INNER JOIN preparo_ingredientes pi ON pi.preparo_id = p.id
       WHERE pi.materia_prima_id IN (${placeholders})
       ORDER BY p.nome ASC`,
      ids
    );
    const total = (produtos?.length || 0) + (preparos?.length || 0);
    if (total === 0) return null;
    return { produtos: produtos || [], preparos: preparos || [], total };
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('[MateriasPrimasScreen.getInsumoDependencies]', e);
    return null;
  }
}

function buildCascadeAviso(deps) {
  if (!deps || deps.total === 0) return null;
  const linhas = [];
  if (deps.produtos.length > 0) {
    const nomes = deps.produtos.slice(0, 3).map(p => `• ${p.nome}`).join('\n');
    const extra = deps.produtos.length > 3 ? `\n+${deps.produtos.length - 3} outros` : '';
    linhas.push(`${deps.produtos.length} ${deps.produtos.length === 1 ? 'produto usa' : 'produtos usam'} este insumo:\n${nomes}${extra}`);
  }
  if (deps.preparos.length > 0) {
    const nomes = deps.preparos.slice(0, 3).map(p => `• ${p.nome}`).join('\n');
    const extra = deps.preparos.length > 3 ? `\n+${deps.preparos.length - 3} outros` : '';
    linhas.push(`${deps.preparos.length} ${deps.preparos.length === 1 ? 'preparo usa' : 'preparos usam'} este insumo:\n${nomes}${extra}`);
  }
  return `⚠️ ${linhas.join('\n\n')}\n\nO ingrediente será removido deles. Custo e preço sugerido podem ficar desatualizados.`;
}

export default function MateriasPrimasScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const isWeb = Platform.OS === 'web';
  const isFocused = useIsFocused();
  const [sections, setSections] = useState([]);
  const [totalInsumos, setTotalInsumos] = useState(0);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoIcone, setNovoIcone] = useState('tag');
  const [busca, setBusca] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Mapa de cores por categoria ID
  const [catColorMap, setCatColorMap] = useState({});
  // Seções recolhidas
  const [collapsedSections, setCollapsedSections] = useState({});
  // Desktop grid seções recolhidas
  const [collapsedDesktop, setCollapsedDesktop] = useState({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState(null);
  // Soft-delete via UndoToast (P1-11)
  const undoDelete = useUndoableDelete();
  // Ordenação (P1-22)
  const [sortBy, setSortBy] = usePersistedState('insumos.sortBy', 'nome_asc');
  const [viewMode, setViewMode] = usePersistedState('insumos.viewMode', 'list');
  const isGrid = isDesktop || viewMode === 'grid';
  // Densidade global (P3-G)
  const { rowOverride, nameOverride, avatarSize } = useListDensity();
  // Sessão 26 — Estoque absorvido em Insumos atrás do flag (default OFF)
  const [estoqueOn] = useFeatureFlag('modo_avancado_estoque');
  // Seleção múltipla (P1-21)
  const bulk = useBulkSelection();
  // Mover em massa (P2-B)
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [previewItem, setPreviewItem] = useState(null);
  const [infoToast, setInfoToast] = useState(null);

  function toggleDesktopSection(key) { setCollapsedDesktop(prev => ({...prev, [key]: !prev[key]})); }

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }

  useFocusEffect(useCallback(() => {
    loadData();
    return () => setConfirmDelete(null);
  }, [filtroCategoria, busca, sortBy]));

  async function loadData() {
    setLoading(true);
    setLoadError(null);
    try {
      const db = await getDatabase();
      const cats = await db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome');
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
        preco_desc: 'preco_por_kg DESC',
        preco_asc: 'preco_por_kg ASC',
        modificados: 'updated_at DESC', // P3-I
        favoritos: 'nome COLLATE NOCASE ASC', // P3-H — busca por nome, sort final em JS
      };
      const orderBy = orderClauses[sortBy] || orderClauses.nome_asc;
      let materias = await db.getAllAsync(`SELECT * FROM materias_primas ORDER BY ${orderBy}`);
      // P3-H: re-sort em JS para colocar favoritos no topo (parser SQL não suporta multi-col ORDER BY)
      if (sortBy === 'favoritos') {
        materias = [...materias].sort((a, b) => {
          const fa = a.favorito ? 1 : 0, fb = b.favorito ? 1 : 0;
          if (fa !== fb) return fb - fa;
          return String(a.nome || '').localeCompare(String(b.nome || ''));
        });
      }
      setTotalInsumos(materias.length);

      let materiasFiltradas = materias;
      if (busca.trim()) {
        const termo = normalizeSearch(busca);
        materiasFiltradas = materias.filter(m =>
          normalizeSearch(m.nome).includes(termo) ||
          (m.marca && normalizeSearch(m.marca).includes(termo))
        );
      }

      const grouped = {};
      const semCategoria = { id: null, nome: 'Sem categoria', icone: 'inbox' };

      cats.forEach(c => { grouped[c.id] = { ...c, data: [] }; });
      grouped['null'] = { ...semCategoria, data: [] };

      materiasFiltradas.forEach(m => {
        const catId = m.categoria_id || 'null';
        if (grouped[catId]) {
          grouped[catId].data.push(m);
        } else {
          grouped['null'].data.push(m);
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
      const msg = (e && e.message) ? e.message : 'Falha ao carregar insumos.';
      setLoadError(msg);
      if (typeof console !== 'undefined' && console.error) console.error('[MateriasPrimasScreen.loadData]', e);
    } finally {
      setLoading(false);
    }
  }

  async function duplicarInsumo(item) {
    const db = await getDatabase();
    const result = await db.runAsync(
      'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
      [item.nome + ' (cópia)', item.marca, item.categoria_id, item.quantidade_bruta, item.quantidade_liquida, item.fator_correcao, item.unidade_medida, item.valor_pago, item.preco_por_kg]
    );
    // Navigate to the new item instead of full reload
    const newId = result?.lastInsertRowId;
    if (newId) {
      navigation.navigate('MateriaPrimaForm', { id: newId });
    } else {
      loadData();
    }
  }

  async function solicitarExclusao(id, nome) {
    const deps = await getInsumoDependencies([id]);
    const aviso = buildCascadeAviso(deps);
    setConfirmDelete({
      titulo: 'Excluir Insumo',
      nome,
      aviso,
      onConfirm: async () => {
        setConfirmDelete(null);
        // Soft-delete: esconde imediatamente, oferece desfazer por 5s (P1-11)
        await undoDelete.requestDelete({
          id,
          message: `Insumo "${nome}" excluído`,
          commit: async () => {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM materias_primas WHERE id = ?', [id]);
          },
          onCommitted: () => loadData(),
        });
      },
    });
  }

  // Exclusão em massa (P1-21)
  async function solicitarExclusaoEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const deps = await getInsumoDependencies(ids);
    const aviso = buildCascadeAviso(deps);
    setConfirmDelete({
      titulo: ids.length === 1 ? 'Excluir Insumo' : `Excluir ${ids.length} insumos`,
      nome: ids.length === 1 ? null : `${ids.length} itens selecionados`,
      aviso,
      onConfirm: async () => {
        setConfirmDelete(null);
        // Hook já adiciona todos os ids ao hiddenIds (suporta array)
        await undoDelete.requestDelete({
          id: ids,
          message: ids.length === 1 ? '1 insumo excluído' : `${ids.length} insumos excluídos`,
          commit: async () => {
            const db = await getDatabase();
            const placeholders = ids.map(() => '?').join(',');
            await db.runAsync(`DELETE FROM materias_primas WHERE id IN (${placeholders})`, ids);
          },
          onCommitted: () => loadData(),
        });
        bulk.clear();
      },
    });
  }

  // Handlers de tap/long-press considerando modo bulk (P1-21)
  function handleRowPress(item) {
    if (bulk.active) {
      bulk.toggle(item.id);
    } else {
      navigation.navigate('MateriaPrimaForm', { id: item.id });
    }
  }
  function handleRowLongPress(item) {
    bulk.enter(item.id);
  }

  async function moverEmMassa(catId) {
    const ids = Array.from(bulk.selectedIds);
    setShowMoveModal(false);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE materias_primas SET categoria_id = ? WHERE id IN (${placeholders})`,
      [catId, ...ids]
    );
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'insumo movido' : 'insumos movidos'}`, icon: 'folder' });
    loadData();
  }

  async function duplicarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT * FROM materias_primas WHERE id IN (${placeholders})`, ids
    );
    await Promise.all(itens.map(item => db.runAsync(
      'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
      [item.nome + ' (cópia)', item.marca, item.categoria_id, item.quantidade_bruta, item.quantidade_liquida, item.fator_correcao, item.unidade_medida, item.valor_pago, item.preco_por_kg]
    )));
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'insumo duplicado' : 'insumos duplicados'}`, icon: 'copy' });
    loadData();
  }

  async function reajustarEmMassa({ mode, value, sign }) {
    const ids = Array.from(bulk.selectedIds);
    setShowPriceModal(false);
    if (ids.length === 0 || !value) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(`SELECT * FROM materias_primas WHERE id IN (${placeholders})`, ids);
    const factor = mode === 'percent' ? 1 + (sign * value) / 100 : null;
    await Promise.all(itens.map((item) => {
      const oldValor = Number(item.valor_pago) || 0;
      let novoValor = mode === 'percent' ? oldValor * factor : oldValor + sign * value;
      if (novoValor < 0) novoValor = 0;
      const qtdLiq = Number(item.quantidade_liquida) || 1;
      const novoPrecoKg = qtdLiq > 0 ? novoValor / qtdLiq : 0;
      return db.runAsync(
        'UPDATE materias_primas SET valor_pago = ?, preco_por_kg = ? WHERE id = ?',
        [novoValor, novoPrecoKg, item.id]
      );
    }));
    bulk.clear();
    const sigStr = sign === 1 ? '+' : '−';
    const valStr = mode === 'percent' ? `${value}%` : `R$ ${value.toFixed(2).replace('.', ',')}`;
    setInfoToast({
      message: `${ids.length} ${ids.length === 1 ? 'insumo reajustado' : 'insumos reajustados'} (${sigStr}${valStr})`,
      icon: 'trending-up',
    });
    loadData();
  }

  // P3-H Favoritar/Desfavoritar em massa
  async function favoritarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const itens = visibleItems.filter((i) => bulk.isSelected(i.id));
    // Se TODOS os selecionados já são favoritos, desfavorita; senão, favorita todos
    const allFav = itens.every((i) => Number(i.favorito) === 1);
    const novoVal = allFav ? 0 : 1;
    await Promise.all(ids.map((id) =>
      db.runAsync('UPDATE materias_primas SET favorito = ? WHERE id = ?', [novoVal, id])
    ));
    bulk.clear();
    setInfoToast({
      message: novoVal === 1
        ? `${ids.length} ${ids.length === 1 ? 'insumo favoritado' : 'insumos favoritados'}`
        : `${ids.length} ${ids.length === 1 ? 'insumo desfavoritado' : 'insumos desfavoritados'}`,
      icon: 'star',
    });
    loadData();
  }

  async function toggleFavoritoSingular(item) {
    if (!item) return;
    const db = await getDatabase();
    const novo = Number(item.favorito) === 1 ? 0 : 1;
    await db.runAsync('UPDATE materias_primas SET favorito = ? WHERE id = ?', [novo, item.id]);
    setPreviewItem({ ...item, favorito: novo });
    loadData();
  }

  async function exportarCSVEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT m.*, c.nome AS categoria_nome FROM materias_primas m LEFT JOIN categorias_insumos c ON c.id = m.categoria_id WHERE m.id IN (${placeholders}) ORDER BY m.nome`,
      ids
    );
    const rows = itens.map((it) => ({
      nome: it.nome,
      marca: it.marca || '',
      categoria: it.categoria_nome || 'Sem categoria',
      unidade: it.unidade_medida,
      quantidade_liquida: it.quantidade_liquida,
      valor_pago: it.valor_pago,
      preco_por_kg: it.preco_por_kg,
    }));
    const ok = exportToCSV('insumos.csv', rows, [
      { key: 'nome', label: 'Nome' },
      { key: 'marca', label: 'Marca' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'quantidade_liquida', label: 'Quantidade líquida' },
      { key: 'valor_pago', label: 'Valor pago (R$)' },
      { key: 'preco_por_kg', label: 'Preço por kg/L (R$)' },
    ]);
    if (ok) {
      bulk.clear();
      setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'insumo exportado' : 'insumos exportados'}`, icon: 'download' });
    }
  }

  async function adicionarCategoria() {
    if (!novaCategoria.trim()) return Alert.alert(t.alertAttention, t.validation.requiredCategoryName);
    const db = await getDatabase();
    await db.runAsync('INSERT INTO categorias_insumos (nome, icone) VALUES (?, ?)', [novaCategoria.trim(), novoIcone]);
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
        try {
          const db = await getDatabase();
          // P2: single bulk UPDATE em vez de loop N+1
          await db.runAsync('UPDATE materias_primas SET categoria_id = NULL WHERE categoria_id = ?', [catId]);
          await db.runAsync('DELETE FROM categorias_insumos WHERE id = ?', [catId]);
          if (filtroCategoria === catId) setFiltroCategoria(null);
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('[MateriasPrimasScreen.removerCategoria]', e);
          setInfoToast({ message: 'Não foi possível remover a categoria.', icon: 'alert-triangle' });
        } finally {
          setConfirmDelete(null);
          loadData();
        }
      },
    });
  }

  // Filtra linhas em janela de undo (P1-11)
  const visibleSections = sections
    .map((s) => ({ ...s, data: s.data.filter((it) => !undoDelete.hiddenIds.has(it.id)) }))
    .filter((s) => s.data.length > 0 || filtroCategoria === s.catId);

  // P3-B Stats summary
  const visibleItems = visibleSections.flatMap((s) => s.data);
  const visCount = visibleItems.length;
  const avgKg = visCount
    ? visibleItems.reduce((acc, it) => acc + (Number(it.preco_por_kg) || 0), 0) / visCount
    : 0;
  const totalPago = visibleItems.reduce((acc, it) => acc + (Number(it.valor_pago) || 0), 0);
  const statsList = visCount > 0 ? [
    { icon: 'box', label: 'Insumos', value: String(visCount), color: colors.primary },
    { icon: 'tag', label: 'Médio/kg', value: formatCurrency(avgKg), color: colors.accent || '#FFD37A' },
    { icon: 'shopping-cart', label: 'Total compras', value: formatCurrency(totalPago), color: colors.success || '#1a8a4f' },
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
            <Feather name="plus" size={12} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
        <View style={styles.searchSortRow}>
          <View style={{ flex: 1 }}>
            <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar por nome ou marca..." />
          </View>
          <View style={styles.sortMenuWrap}>
            <SortMenu
              value={sortBy}
              onChange={setSortBy}
              options={[
                { key: 'favoritos', label: 'Favoritos primeiro', icon: 'star' },
                { key: 'nome_asc', label: 'Nome (A→Z)', icon: 'arrow-down' },
                { key: 'nome_desc', label: 'Nome (Z→A)', icon: 'arrow-up' },
                { key: 'recentes', label: 'Mais recentes', icon: 'clock' },
                { key: 'modificados', label: 'Editados recentemente', icon: 'edit-2' },
                { key: 'preco_desc', label: 'Maior preço/kg', icon: 'trending-up' },
                { key: 'preco_asc', label: 'Menor preço/kg', icon: 'trending-down' },
              ]}
            />
          </View>
          {!isDesktop && (
            <View style={{ marginLeft: 6 }}>
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
            </View>
          )}
        </View>
      </View>

      {/* Banner de erro de carregamento (P1) */}
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error || '#c0392b'} style={{ marginRight: 8, marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <Text style={styles.errorBannerTitle}>Não conseguimos carregar seus insumos</Text>
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
        onPress={() => navigation.navigate('MateriaPrimaForm', {})}
      >
        <Feather name="plus-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Novo Insumo</Text>
      </TouchableOpacity>

      {/* Lista agrupada */}
      {isGrid ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.desktopContentWrap}>
            <View style={styles.desktopContentInner}>
              {loading ? (
                <Skeleton.List count={6} />
              ) : sections.length === 0 ? (
                <EmptyState
                  icon={busca.trim() ? 'search' : 'shopping-bag'}
                  title={busca.trim() ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
                  description={busca.trim()
                    ? `Não encontramos resultados para "${busca}".`
                    : 'Passo 1 · Comece por aqui! Cadastre ingredientes e matérias-primas — eles são a base de toda precificação.'}
                  ctaLabel={!busca.trim() ? 'Cadastrar primeiro insumo' : undefined}
                  onPress={!busca.trim() ? () => navigation.navigate('MateriaPrimaForm', {}) : undefined}
                />
              ) : (
                <View style={styles.desktopGrid}>
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
                            style={[
                              styles.gridCard,
                              isWeb && { cursor: 'pointer' },
                              selected && styles.rowSelected,
                              selected && { borderColor: colors.primary },
                            ]}
                            activeOpacity={0.7}
                            onPress={() => handleRowPress(item)}
                            onLongPress={() => handleRowLongPress(item)}
                            delayLongPress={300}
                          >
                            {bulk.active && (
                              <View style={[styles.checkbox, selected && styles.checkboxChecked, { marginRight: 8, marginLeft: 0 }]}>
                                {selected && <Feather name="check" size={12} color="#fff" />}
                              </View>
                            )}
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }} {...(Platform.OS === 'web' ? { title: item.nome + (item.marca ? ' (' + item.marca + ')' : '') } : {})}>
                              {Number(item.favorito) === 1 && (
                                <Feather name="star" size={11} color={colors.yellow || '#FFC83A'} style={{ marginRight: 4 }} />
                              )}
                              <HighlightedText text={item.nome} query={busca} style={styles.gridCardName} numberOfLines={1} />
                              {item.marca ? <Text style={[styles.gridCardName, { color: colors.textSecondary, fontWeight: '400' }]} numberOfLines={1}> ({item.marca})</Text> : null}
                            </View>
                            <Text style={styles.gridCardPrice}>{formatCurrency(item.preco_por_kg)}</Text>
                          </TouchableOpacity>
                          );
                        })}
                      </View>)}
                    </View>
                  ))}
                </View>
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
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.primary}
              colors={[colors.primary]}
            />
          }
          ListEmptyComponent={
            loading ? (
              <Skeleton.List count={6} />
            ) : (
              <EmptyState
                icon={busca.trim() ? 'search' : 'shopping-bag'}
                title={busca.trim() ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
                description={busca.trim()
                  ? `Não encontramos resultados para "${busca}".`
                  : 'Passo 1 · Comece por aqui! Cadastre ingredientes e matérias-primas — eles são a base de toda precificação.'}
                ctaLabel={!busca.trim() ? 'Cadastrar primeiro insumo' : undefined}
                onPress={!busca.trim() ? () => navigation.navigate('MateriaPrimaForm', {}) : undefined}
              />
            )
          }
          renderSectionHeader={({ section }) => {
            const isCollapsed = collapsedSections[section.catId];
            return (
              <TouchableOpacity
                style={styles.sectionHeader}
                onPress={() => setCollapsedSections(prev => ({ ...prev, [section.catId]: !prev[section.catId] }))}
                activeOpacity={0.6}
              >
                <View style={[styles.sectionDot, { backgroundColor: section.catColor }]} />
                <Text style={styles.sectionTitle}>{section.title}</Text>
                <Text style={styles.sectionCount}>{section.totalCount}</Text>
                {section.catId !== null && section.catId !== 'null' && (
                  <TouchableOpacity
                    onPress={(e) => { e.stopPropagation(); removerCategoria(section.catId); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 6, padding: 4 }}
                  >
                    <Feather name="trash-2" size={12} color={colors.disabled} />
                  </TouchableOpacity>
                )}
                <Feather
                  name={isCollapsed ? 'chevron-right' : 'chevron-down'}
                  size={14}
                  color={colors.disabled}
                  style={{ marginLeft: 4 }}
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
                ]}
                onPress={() => handleRowPress(item)}
                onLongPress={() => handleRowLongPress(item)}
                delayLongPress={300}
                activeOpacity={0.6}
              >
                {/* Checkbox em modo bulk OU Avatar */}
                {bulk.active ? (
                  <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
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
                    <HighlightedText text={item.nome} query={busca} style={[styles.rowNome, nameOverride, { flexShrink: 1 }]} numberOfLines={1} />
                  </View>
                  {item.marca ? (
                    <HighlightedText text={item.marca} query={busca} style={styles.rowMarca} numberOfLines={1} />
                  ) : null}
                  {estoqueOn ? (() => {
                    const st = statusEstoque(item);
                    const stColor = st === 'zerado' ? (colors.red || '#E74C3C') : st === 'baixo' ? (colors.coral || '#F39C12') : (colors.success || '#27AE60');
                    const q = Number(item.quantidade_estoque) || 0;
                    return (
                      <View style={styles.estoqueLine}>
                        <View style={[styles.estoqueDot, { backgroundColor: stColor }]} />
                        <Text style={[styles.estoqueText, { color: stColor }]} numberOfLines={1}>
                          {q.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {String(item.unidade_medida || '').trim() || ''}
                        </Text>
                      </View>
                    );
                  })() : null}
                </View>

                {/* Preço + unidade */}
                <View style={styles.rowRight}>
                  <Text style={styles.rowPreco}>{formatCurrency(item.preco_por_kg)}</Text>
                  <View style={[styles.unidadeBadge, { backgroundColor: unidadeInfo.color + '12' }]}>
                    <Text style={[styles.unidadeText, { color: unidadeInfo.color }]}>{unidadeInfo.label}</Text>
                  </View>
                </View>

                {/* Estoque: Entrada/Ajuste (atrás do flag, oculto em modo bulk) */}
                {estoqueOn && !bulk.active && (
                  <>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('EntradaEstoque', { entidadeTipo: 'materia_prima', entidadeId: item.id, returnTo: { tab: 'Insumos', screen: 'MateriasPrimas' } })}
                      style={styles.estoqueBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      accessibilityLabel="Dar entrada"
                    >
                      <Feather name="plus-circle" size={15} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => navigation.navigate('AjusteEstoque', { entidadeTipo: 'materia_prima', entidadeId: item.id, returnTo: { tab: 'Insumos', screen: 'MateriasPrimas' } })}
                      style={styles.estoqueBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                      accessibilityLabel="Ajustar saldo"
                    >
                      <Feather name="sliders" size={14} color={colors.accent} />
                    </TouchableOpacity>
                  </>
                )}

                {/* Duplicar (oculto em modo bulk) */}
                {!bulk.active && (
                <TouchableOpacity
                  onPress={() => duplicarInsumo(item)}
                  style={styles.copyBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <Feather name="copy" size={13} color={colors.disabled} />
                </TouchableOpacity>
                )}

                {/* Excluir (oculto em modo bulk) */}
                {!bulk.active && (
                <TouchableOpacity
                  onPress={() => solicitarExclusao(item.id, item.nome)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={13} color={colors.disabled} />
                </TouchableOpacity>
                )}
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      {/* Sprint 4 F1 — Quando modo_avancado_estoque on, FAB vira menu com
          atalhos descobríveis para Lançar Compra e Ajustar Saldo (antes
          escondidos a 15px dentro de cada card). Quando off, FAB simples. */}
      {!bulk.active && (
        estoqueOn ? (
          <FABMenu
            primary={{
              label: 'Novo Insumo',
              icon: 'plus',
              onPress: () => navigation.navigate('MateriaPrimaForm', {}),
            }}
            actions={[
              {
                key: 'compra',
                label: 'Lançar compra',
                icon: 'shopping-bag',
                onPress: () => navigation.navigate('EntradaEstoque', { returnTo: { tab: 'Insumos', screen: 'MateriasPrimas' } }),
              },
              {
                key: 'ajuste',
                label: 'Ajustar saldo',
                icon: 'sliders',
                onPress: () => navigation.navigate('AjusteEstoque', { returnTo: { tab: 'Insumos', screen: 'MateriasPrimas' } }),
              },
            ]}
          />
        ) : (
          <FAB onPress={() => navigation.navigate('MateriaPrimaForm', {})} label={isDesktop ? 'Novo Insumo' : undefined} />
        )
      )}

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
              placeholder="Ex: Laticínios, Temperos..."
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

      {/* Barra de ações em massa (P1-21) */}
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
          { icon: 'star', label: (() => {
            const sel = visibleItems.filter((i) => bulk.isSelected(i.id));
            return sel.length > 0 && sel.every((i) => Number(i.favorito) === 1) ? 'Desfavoritar' : 'Favoritar';
          })(), onPress: favoritarEmMassa },
          { icon: 'trending-up', label: 'Reajustar', onPress: () => setShowPriceModal(true) },
          ...(isCsvExportSupported() ? [{ icon: 'download', label: 'CSV', onPress: exportarCSVEmMassa }] : []),
        ]}
      />

      {/* Modal de mover em massa (P2-B) */}
      <CategoryPickerModal
        visible={showMoveModal}
        title="Mover insumos para..."
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        categorias={categorias}
        onSelect={moverEmMassa}
        onCancel={() => setShowMoveModal(false)}
      />

      <BulkPriceAdjustModal
        visible={showPriceModal}
        title="Reajustar valor de compra"
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        currentLabel="valores pagos"
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
        subtitle={previewItem?.marca || (previewItem?.categoria_nome || 'Sem categoria')}
        meta={previewItem?.updated_at ? `Editado ${formatTimeAgo(previewItem.updated_at)}` : null}
        favorito={previewItem ? Number(previewItem.favorito) : 0}
        onToggleFavorite={previewItem ? () => toggleFavoritoSingular(previewItem) : undefined}
        icon="shopping-bag"
        iconColor={colors.primary}
        fields={previewItem ? [
          { label: 'Categoria', value: previewItem.categoria_nome || 'Sem categoria' },
          { label: 'Marca', value: previewItem.marca },
          { label: 'Unidade', value: previewItem.unidade_medida },
          { label: 'Quantidade líquida', value: previewItem.quantidade_liquida },
          { label: 'Valor pago', value: formatCurrency(previewItem.valor_pago) },
          { label: 'Preço por kg/L', value: formatCurrency(previewItem.preco_por_kg), accent: true },
        ] : []}
        onEdit={() => {
          const id = previewItem?.id;
          setPreviewItem(null);
          bulk.clear();
          if (id) navigation.navigate('MateriaPrimaForm', { id });
        }}
        onClose={() => setPreviewItem(null)}
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
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.primary + '10', borderWidth: 1,
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

  // Avatar
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 15, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Bulk selection (P1-21)
  checkbox: {
    width: 22, height: 22, borderRadius: 6,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm + 8,
    marginLeft: 6,
  },
  checkboxChecked: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  rowSelected: {
    backgroundColor: colors.primary + '0E',
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
    fontSize: 11, fontFamily: fontFamily.regular,
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
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Duplicar
  copyBtn: {
    padding: 6,
  },
  // Excluir
  deleteBtn: {
    padding: 8,
  },

  // Estoque (Sessão 26 — atrás do flag modo_avancado_estoque)
  estoqueLine: {
    flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 4,
  },
  estoqueDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  estoqueText: {
    fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  estoqueBtn: {
    paddingHorizontal: 4, paddingVertical: 6,
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
  desktopGrid: {
    marginTop: spacing.xs,
  },
  gridCatTitle: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
