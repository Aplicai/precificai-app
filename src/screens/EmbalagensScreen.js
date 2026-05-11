import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Platform, RefreshControl } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch } from '../utils/calculations';
import { subscribeDataChanged } from '../utils/dataSync';
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
import { formatTimeAgo } from '../utils/timeAgo';
// Sprint 2 S5 — checagem central de dependências antes de delete (audit P0-05).
import { contarDependencias, formatarMensagemDeps } from '../services/dependenciesService';
import ViewModeToggle from '../components/ViewModeToggle';
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
// Sessão Mobile-29 — bug fix: antes usava getTipoUnidade(), que retornava
// 'peso' (label "kg") como fallback para qualquer unidade não-mapeada
// ("Unidades", "Metros", "Rolos"). Resultado: TODA embalagem cadastrada
// em "Unidades" aparecia como "kg" na lista. Agora respeitamos o valor
// real cadastrado em item.unidade_medida e usamos 'un' como fallback
// quando vazio (NUNCA 'kg').
function getUnidadeInfo(unidade) {
  const raw = (unidade || '').toString().trim();
  if (!raw) return { label: 'un', color: colors.purple };
  const lower = raw.toLowerCase();
  // Mapas curtos pra unidades comuns do form de embalagem.
  if (lower.startsWith('unidad')) return { label: 'un', color: colors.purple };
  if (lower.startsWith('metro')) return { label: 'm', color: colors.accent };
  if (lower.startsWith('rolo')) return { label: 'rolo', color: colors.coral };
  if (lower === 'kg' || lower === 'quilograma' || lower === 'quilo') return { label: 'kg', color: colors.primary };
  if (lower === 'g' || lower === 'grama' || lower === 'gramas') return { label: 'g', color: colors.primary };
  if (lower === 'l' || lower === 'litro' || lower === 'litros') return { label: 'L', color: colors.accent };
  if (lower === 'ml') return { label: 'mL', color: colors.accent };
  // Para qualquer outra string, mostra os 4 primeiros chars do que foi cadastrado.
  return { label: raw.slice(0, 4), color: colors.purple };
}

export default function EmbalagensScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const isWeb = Platform.OS === 'web';
  const isFocused = useIsFocused();
  const [sections, setSections] = useState([]);
  const [totalEmbalagens, setTotalEmbalagens] = useState(0);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = usePersistedState('embalagens.filtroCategoria', null);
  const [loadError, setLoadError] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [novoIcone, setNovoIcone] = useState('tag');
  const [busca, setBusca] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const undoDelete = useUndoableDelete();
  const [sortBy, setSortBy] = usePersistedState('embalagens.sortBy', 'nome_asc');
  const [viewMode, setViewMode] = usePersistedState('embalagens.viewMode', 'list');
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

  function toggleDesktopSection(key) { setCollapsedDesktop(prev => ({...prev, [key]: !prev[key]})); }

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }

  // Sessão 28.46: lógica de redirect pro Produto/Preparo quando user voltou
  // de uma edição via modal. Extraída pra função pra rodar via useFocusEffect
  // E via focus listener (useFocusEffect flaky no web — Sessão 28.27/28.43).
  // Antes: ficava só dentro do useFocusEffect → user terminava de criar
  // embalagem e ficava em EmbalagensScreen ao invés de voltar pro produto.
  //
  // Sessão Mobile-29 — bug fix: clicar no tab Embalagens reabria o form que
  // estava sendo editado. Causa: flags stale (reopenEntityModalAfterEdit/
  // reopenPreparoFormAfterEdit) sobreviviam entre navegações. Agora só
  // executamos o redirect se o flag for explicitamente uma cascata recente
  // (existe `pendingAddType === 'embalagem'` OU `reopenNestedPreparo`).
  // Flags sem pendingAddType ou de cascata já concluída → ignoramos e limpamos.
  const checkReopenFlag = useCallback(async () => {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      // Sessão 28.50: também detecta retorno pro PreparoForm full-screen.
      // Caso user tenha clicado "Cadastrar nova embalagem" de DENTRO de um
      // PreparoFormScreen (não popup), volta pra ele com o id preservado.
      try {
        const rawPrep = await AsyncStorage.getItem('reopenPreparoFormAfterEdit');
        if (rawPrep) {
          const infoPrep = JSON.parse(rawPrep);
          // Só considera válido se for cascata recente E pendente (pendingAddType=embalagem).
          const isCascadaPendente = infoPrep?.pendingAddType === 'embalagem'
            && infoPrep?.ts && (Date.now() - infoPrep.ts) < 5 * 60 * 1000;
          if (isCascadaPendente) {
            await AsyncStorage.removeItem('reopenPreparoFormAfterEdit');
            navigation.navigate('Preparos', {
              screen: 'PreparoForm',
              params: infoPrep.preparoId ? { id: infoPrep.preparoId } : {},
            });
            return;
          }
          // Flag stale ou já consumida → limpa.
          await AsyncStorage.removeItem('reopenPreparoFormAfterEdit');
        }
      } catch {}

      const raw = await AsyncStorage.getItem('reopenEntityModalAfterEdit');
      if (!raw) return;
      const info = JSON.parse(raw);
      if (!info?.ts || (Date.now() - info.ts) > 5 * 60 * 1000) {
        await AsyncStorage.removeItem('reopenEntityModalAfterEdit');
        return;
      }
      // Só redireciona se ainda há cascata pendente (pendingAddType=embalagem
      // direto OU dentro de reopenNestedPreparo). Senão é flag stale → limpa.
      const cascataDireta = info?.pendingAddType === 'embalagem';
      const cascataNested = info?.reopenNestedPreparo?.pendingAddType === 'embalagem';
      if (!cascataDireta && !cascataNested) {
        await AsyncStorage.removeItem('reopenEntityModalAfterEdit');
        return;
      }
      if (info.mode === 'produto') navigation.navigate('Produtos', { screen: 'ProdutosList' });
      else if (info.mode === 'preparo') navigation.navigate('Preparos', { screen: 'PreparosMain' });
    } catch {}
  }, [navigation]);

  // Sessão 28.43/28.46: subscribe pra mudanças em embalagens (AtualizarPrecos)
  // + focus listener fallback (RN useFocusEffect flaky no web) + reopen flag check.
  useEffect(() => {
    const unsub = subscribeDataChanged((table) => {
      if (table === 'embalagens') loadData();
    });
    const unsubFocus = navigation.addListener('focus', () => {
      loadData();
      // Sessão 28.46: também checa flag aqui (web)
      checkReopenFlag();
    });
    let onVis;
    if (typeof document !== 'undefined' && document.addEventListener) {
      onVis = () => {
        if (!document.hidden) {
          loadData();
          checkReopenFlag();
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
  }, [navigation, checkReopenFlag]);

  useFocusEffect(useCallback(() => {
    loadData();
    checkReopenFlag();
    return () => setConfirmDelete(null);
  }, [filtroCategoria, busca, sortBy, checkReopenFlag]));

  async function loadData() {
    setLoading(true);
    setLoadError(false);
    try {
    const db = await getDatabase();
    const cats = await db.getAllAsync('SELECT * FROM categorias_embalagens ORDER BY nome');
    setCategorias(cats);

    // Monta mapa de cores fixo por ID
    const colorMap = {};
    cats.forEach((c, i) => { colorMap[c.id] = getCategoryColor(i); });
    colorMap['null'] = colors.disabled;
    setCatColorMap(colorMap);

    const orderClauses = {
      nome_asc: 'nome COLLATE NOCASE ASC',
      nome_desc: 'nome COLLATE NOCASE DESC',
      recentes: 'id DESC',
      preco_desc: 'preco_unitario DESC',
      preco_asc: 'preco_unitario ASC',
      modificados: 'updated_at DESC', // P3-I
      favoritos: 'nome COLLATE NOCASE ASC', // P3-H — re-sort em JS
    };
    const orderBy = orderClauses[sortBy] || orderClauses.nome_asc;
    let embalagens = await db.getAllAsync(`SELECT * FROM embalagens ORDER BY ${orderBy}`);
    if (sortBy === 'favoritos') {
      embalagens = [...embalagens].sort((a, b) => {
        const fa = a.favorito ? 1 : 0, fb = b.favorito ? 1 : 0;
        if (fa !== fb) return fb - fa;
        return String(a.nome || '').localeCompare(String(b.nome || ''));
      });
    }
    setTotalEmbalagens(embalagens.length);

    let embalagensFiltradas = embalagens;
    if (busca.trim()) {
      const termo = normalizeSearch(busca);
      embalagensFiltradas = embalagens.filter(m =>
        normalizeSearch(m.nome).includes(termo) ||
        (m.marca && normalizeSearch(m.marca).includes(termo))
      );
    }

    const grouped = {};
    const semCategoria = { id: null, nome: 'Sem categoria', icone: 'inbox' };

    cats.forEach(c => { grouped[c.id] = { ...c, data: [] }; });
    grouped['null'] = { ...semCategoria, data: [] };

    embalagensFiltradas.forEach(m => {
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
      console.error('[EmbalagensScreen.loadData]', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  async function duplicarEmbalagem(item) {
    try {
      const db = await getDatabase();
      const result = await db.runAsync(
        'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario, updated_at) VALUES (?,?,?,?,?,?,?,?)',
        [item.nome + ' (cópia)', item.marca, item.categoria_id, item.quantidade, item.unidade_medida, item.preco_embalagem, item.preco_unitario, new Date().toISOString()]
      );
      const newId = result?.lastInsertRowId;
      if (newId) {
        navigation.navigate('EmbalagemForm', { id: newId });
      } else {
        loadData();
      }
    } catch (e) {
      console.error('[EmbalagensScreen.duplicarEmbalagem]', e);
      Alert.alert('Erro', 'Não foi possível duplicar a embalagem.');
    }
  }

  async function solicitarExclusao(id, nome) {
    // Sprint 2 S5 — antes de excluir, mostra ao usuário em quantos produtos esta
    // embalagem aparece. Não bloqueia, mas evita órfãos silenciosos.
    let mensagemExtra = null;
    try {
      const db = await getDatabase();
      const deps = await contarDependencias(db, 'embalagem', id);
      if (deps.total > 0) {
        mensagemExtra = formatarMensagemDeps(deps, { acao: 'excluir', entidade: 'embalagem' });
      }
    } catch (e) {
      console.error('[EmbalagensScreen.solicitarExclusao.deps]', e);
    }
    setConfirmDelete({
      titulo: 'Excluir Embalagem',
      nome,
      mensagemExtra,
      onConfirm: async () => {
        setConfirmDelete(null);
        await undoDelete.requestDelete({
          id,
          message: `Embalagem "${nome}" excluída`,
          commit: async () => {
            const db = await getDatabase();
            await db.runAsync('DELETE FROM embalagens WHERE id = ?', [id]);
          },
          onCommitted: () => loadData(),
        });
      },
    });
  }

  async function solicitarExclusaoEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    // Sprint 2 S5 — soma dependências de todos os ids selecionados.
    let mensagemExtra = null;
    try {
      const db = await getDatabase();
      let totalRefs = 0;
      for (const id of ids) {
        const deps = await contarDependencias(db, 'embalagem', id);
        totalRefs += deps.total;
      }
      if (totalRefs > 0) {
        mensagemExtra = `${totalRefs} referência${totalRefs === 1 ? '' : 's'} ${totalRefs === 1 ? 'será afetada' : 'serão afetadas'} ao excluir essas embalagens (produtos perderão essa embalagem do cálculo de custo).`;
      }
    } catch (e) {
      console.error('[EmbalagensScreen.solicitarExclusaoEmMassa.deps]', e);
    }
    setConfirmDelete({
      titulo: ids.length === 1 ? 'Excluir Embalagem' : `Excluir ${ids.length} embalagens`,
      nome: ids.length === 1 ? null : `${ids.length} itens selecionados`,
      mensagemExtra,
      onConfirm: async () => {
        setConfirmDelete(null);
        await undoDelete.requestDelete({
          id: ids,
          message: ids.length === 1 ? '1 embalagem excluída' : `${ids.length} embalagens excluídas`,
          commit: async () => {
            const db = await getDatabase();
            const placeholders = ids.map(() => '?').join(',');
            await db.runAsync(`DELETE FROM embalagens WHERE id IN (${placeholders})`, ids);
          },
          onCommitted: () => loadData(),
        });
        bulk.clear();
      },
    });
  }

  function handleRowPress(item) {
    if (bulk.active) bulk.toggle(item.id);
    else navigation.navigate('EmbalagemForm', { id: item.id });
  }
  function handleRowLongPress(item) { bulk.enter(item.id); }

  async function moverEmMassa(catId) {
    const ids = Array.from(bulk.selectedIds);
    setShowMoveModal(false);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    await db.runAsync(
      `UPDATE embalagens SET categoria_id = ? WHERE id IN (${placeholders})`,
      [catId, ...ids]
    );
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'embalagem movida' : 'embalagens movidas'}`, icon: 'folder' });
    loadData();
  }

  async function duplicarEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT * FROM embalagens WHERE id IN (${placeholders})`, ids
    );
    await Promise.all(itens.map(item => db.runAsync(
      'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
      [item.nome + ' (cópia)', item.marca, item.categoria_id, item.quantidade, item.unidade_medida, item.preco_embalagem, item.preco_unitario]
    )));
    bulk.clear();
    setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'embalagem duplicada' : 'embalagens duplicadas'}`, icon: 'copy' });
    loadData();
  }

  async function reajustarEmMassa({ mode, value, sign }) {
    const ids = Array.from(bulk.selectedIds);
    setShowPriceModal(false);
    if (ids.length === 0 || !value) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(`SELECT * FROM embalagens WHERE id IN (${placeholders})`, ids);
    const factor = mode === 'percent' ? 1 + (sign * value) / 100 : null;
    await Promise.all(itens.map((item) => {
      const oldPreco = Number(item.preco_embalagem) || 0;
      let novoPreco = mode === 'percent' ? oldPreco * factor : oldPreco + sign * value;
      if (novoPreco < 0) novoPreco = 0;
      const qtd = Number(item.quantidade) || 0;
      // Sessão 28.44 — bug #10: se qtd<=0 (legado/corrompido), MANTÉM o
      // preco_unitario antigo em vez de zerar. Antes: zerava silenciosamente,
      // sobrescrevendo valor legítimo anterior.
      const oldUnit = Number(item.preco_unitario) || 0;
      const novoUnit = qtd > 0 ? novoPreco / qtd : oldUnit;
      return db.runAsync(
        'UPDATE embalagens SET preco_embalagem = ?, preco_unitario = ? WHERE id = ?',
        [novoPreco, novoUnit, item.id]
      );
    }));
    bulk.clear();
    const sigStr = sign === 1 ? '+' : '−';
    const valStr = mode === 'percent' ? `${value}%` : `R$ ${value.toFixed(2).replace('.', ',')}`;
    setInfoToast({
      message: `${ids.length} ${ids.length === 1 ? 'embalagem reajustada' : 'embalagens reajustadas'} (${sigStr}${valStr})`,
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
    const allFav = itens.every((i) => Number(i.favorito) === 1);
    const novoVal = allFav ? 0 : 1;
    await Promise.all(ids.map((id) =>
      db.runAsync('UPDATE embalagens SET favorito = ? WHERE id = ?', [novoVal, id])
    ));
    bulk.clear();
    setInfoToast({
      message: novoVal === 1
        ? `${ids.length} ${ids.length === 1 ? 'embalagem favoritada' : 'embalagens favoritadas'}`
        : `${ids.length} ${ids.length === 1 ? 'embalagem desfavoritada' : 'embalagens desfavoritadas'}`,
      icon: 'star',
    });
    loadData();
  }

  async function toggleFavoritoSingular(item) {
    if (!item) return;
    const db = await getDatabase();
    const novo = Number(item.favorito) === 1 ? 0 : 1;
    await db.runAsync('UPDATE embalagens SET favorito = ? WHERE id = ?', [novo, item.id]);
    setPreviewItem({ ...item, favorito: novo });
    loadData();
  }

  async function exportarCSVEmMassa() {
    const ids = Array.from(bulk.selectedIds);
    if (ids.length === 0) return;
    const db = await getDatabase();
    const placeholders = ids.map(() => '?').join(',');
    const itens = await db.getAllAsync(
      `SELECT e.*, c.nome AS categoria_nome FROM embalagens e LEFT JOIN categorias_embalagens c ON c.id = e.categoria_id WHERE e.id IN (${placeholders}) ORDER BY e.nome`,
      ids
    );
    const rows = itens.map((it) => ({
      nome: it.nome,
      marca: it.marca || '',
      categoria: it.categoria_nome || 'Sem categoria',
      unidade: it.unidade_medida,
      quantidade: it.quantidade,
      preco_embalagem: it.preco_embalagem,
      preco_unitario: it.preco_unitario,
    }));
    const ok = exportToCSV('embalagens.csv', rows, [
      { key: 'nome', label: 'Nome' },
      { key: 'marca', label: 'Marca' },
      { key: 'categoria', label: 'Categoria' },
      { key: 'unidade', label: 'Unidade' },
      { key: 'quantidade', label: 'Quantidade' },
      { key: 'preco_embalagem', label: 'Preço da embalagem (R$)' },
      { key: 'preco_unitario', label: 'Preço unitário (R$)' },
    ]);
    if (ok) {
      bulk.clear();
      setInfoToast({ message: `${ids.length} ${ids.length === 1 ? 'embalagem exportada' : 'embalagens exportadas'}`, icon: 'download' });
    }
  }

  async function adicionarCategoria() {
    if (!novaCategoria.trim()) return Alert.alert(t.alertAttention, t.validation.requiredCategoryName);
    const db = await getDatabase();
    await db.runAsync('INSERT INTO categorias_embalagens (nome, icone) VALUES (?, ?)', [novaCategoria.trim(), novoIcone]);
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
          // single bulk UPDATE em vez de loop N+1
          await db.runAsync('UPDATE embalagens SET categoria_id=NULL, updated_at=? WHERE categoria_id=?', [new Date().toISOString(), catId]);
          await db.runAsync('DELETE FROM categorias_embalagens WHERE id = ?', [catId]);
          if (filtroCategoria === catId) setFiltroCategoria(null);
          setConfirmDelete(null);
          setInfoToast?.({ message: 'Categoria removida', tone: 'info' });
          loadData();
        } catch (e) {
          console.error('[EmbalagensScreen.removerCategoria]', e);
          setConfirmDelete(null);
          Alert.alert('Erro', 'Não foi possível remover a categoria.');
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
  const avgUnit = visCount
    ? visibleItems.reduce((acc, it) => acc + (Number(it.preco_unitario) || 0), 0) / visCount
    : 0;
  const totalEmb = visibleItems.reduce((acc, it) => acc + (Number(it.preco_embalagem) || 0), 0);
  const statsList = visCount > 0 ? [
    { icon: 'package', label: 'Itens', value: String(visCount), color: colors.primary },
    { icon: 'tag', label: 'Médio/un.', value: formatCurrency(avgUnit), color: colors.accent || '#FFD37A' },
    { icon: 'shopping-cart', label: 'Total estoque', value: formatCurrency(totalEmb), color: colors.success || '#1a8a4f' },
  ] : [];

  return (
    <View style={styles.container}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>Não foi possível carregar as embalagens.</Text>
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
              compact
              options={[
                { key: 'favoritos', label: 'Favoritos primeiro', icon: 'star' },
                { key: 'nome_asc', label: 'Nome (A→Z)', icon: 'arrow-down' },
                { key: 'nome_desc', label: 'Nome (Z→A)', icon: 'arrow-up' },
                { key: 'recentes', label: 'Mais recentes', icon: 'clock' },
                { key: 'modificados', label: 'Editados recentemente', icon: 'edit-2' },
                { key: 'preco_desc', label: 'Preço (maior)', icon: 'trending-up' },
                { key: 'preco_asc', label: 'Preço (menor)', icon: 'trending-down' },
              ]}
            />
          </View>
          {/* Bug fix: toggle de grid escondido no mobile — grid mobile mostrava só chips de preço. */}
        </View>
      </View>

      {/* Botão Adicionar */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.primary + '30', borderStyle: 'dashed' }}
        onPress={() => navigation.navigate('EmbalagemForm', {})}
      >
        <Feather name="plus-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Nova Embalagem</Text>
      </TouchableOpacity>

      {/* Lista agrupada */}
      {isGrid ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 100 }}>
          <View style={styles.desktopContentWrap}>
            <View style={styles.desktopContentInner}>
              {loading ? (
                <Skeleton.List count={6} />
              ) : visibleSections.length === 0 ? (
                <EmptyState
                  icon={busca.trim() ? 'search' : 'package'}
                  title={busca.trim()
                    ? 'Nenhuma embalagem encontrada'
                    : 'Nenhuma embalagem cadastrada'}
                  description={busca.trim()
                    ? `Não encontramos resultados para "${busca}".`
                    : 'Passo 2 · Cadastre caixas, potes e sacos para incluí-los no custo final dos produtos.'}
                  ctaLabel={!busca.trim() ? 'Cadastrar embalagem' : undefined}
                  onPress={!busca.trim() ? () => navigation.navigate('EmbalagemForm', {}) : undefined}
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
                            <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }} {...(Platform.OS === 'web' ? { title: item.nome + (item.marca ? ' (' + item.marca + ')' : '') } : {})}>
                              {Number(item.favorito) === 1 && (
                                <Feather name="star" size={11} color={colors.yellow || '#FFC83A'} style={{ marginRight: 4 }} />
                              )}
                              <HighlightedText text={item.nome} query={busca} style={styles.gridCardName} numberOfLines={1} />
                              {item.marca ? <Text style={[styles.gridCardName, { color: colors.textSecondary, fontWeight: '400' }]} numberOfLines={1}> ({item.marca})</Text> : null}
                            </View>
                            <Text style={styles.gridCardPrice}>{formatCurrency(item.preco_unitario)}</Text>
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
                icon={busca.trim() ? 'search' : 'package'}
                title={busca.trim()
                  ? 'Nenhuma embalagem encontrada'
                  : 'Nenhuma embalagem cadastrada'}
                description={busca.trim()
                  ? `Não encontramos resultados para "${busca}".`
                  : 'Passo 2 · Cadastre caixas, potes e sacos para incluí-los no custo final dos produtos.'}
                ctaLabel={!busca.trim() ? 'Cadastrar embalagem' : undefined}
                onPress={!busca.trim() ? () => navigation.navigate('EmbalagemForm', {}) : undefined}
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
                    {/* Sessão Mobile-29 — chip de cor da categoria (badge sutil) */}
                    <View
                      style={[styles.catChip, { backgroundColor: catColor }]}
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    />
                    {Number(item.favorito) === 1 && (
                      <Feather name="star" size={11} color={colors.yellow || '#FFC83A'} />
                    )}
                    <HighlightedText text={item.nome} query={busca} style={[styles.rowNome, nameOverride, { flexShrink: 1 }]} numberOfLines={1} />
                  </View>
                  {item.marca ? (
                    <HighlightedText text={item.marca} query={busca} style={[styles.rowMarca, { fontSize: listItemSubtitleFontSize }]} numberOfLines={1} />
                  ) : null}
                </View>

                {/* Preço + unidade */}
                <View style={styles.rowRight}>
                  <Text style={styles.rowPreco}>{formatCurrency(item.preco_unitario)}</Text>
                  <View style={[styles.unidadeBadge, { backgroundColor: unidadeInfo.color + '12' }]}>
                    <Text style={[styles.unidadeText, { color: unidadeInfo.color }]}>{unidadeInfo.label}</Text>
                  </View>
                </View>

                {/* Duplicar + Excluir (escondidos no modo bulk) */}
                {!bulk.active && (
                  <>
                    <TouchableOpacity
                      onPress={() => duplicarEmbalagem(item)}
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
        <FAB onPress={() => navigation.navigate('EmbalagemForm', {})} label={isDesktop ? 'Nova Embalagem' : undefined} />
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
          { icon: 'star', label: (() => {
            const sel = visibleItems.filter((i) => bulk.isSelected(i.id));
            return sel.length > 0 && sel.every((i) => Number(i.favorito) === 1) ? 'Desfavoritar' : 'Favoritar';
          })(), onPress: favoritarEmMassa },
          { icon: 'trending-up', label: 'Reajustar', onPress: () => setShowPriceModal(true) },
          ...(isCsvExportSupported() ? [{ icon: 'download', label: 'CSV', onPress: exportarCSVEmMassa }] : []),
        ]}
      />

      <CategoryPickerModal
        visible={showMoveModal}
        title="Mover embalagens para..."
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        categorias={categorias}
        onSelect={moverEmMassa}
        onCancel={() => setShowMoveModal(false)}
      />

      <BulkPriceAdjustModal
        visible={showPriceModal}
        title="Reajustar preço de embalagens"
        subtitle={`${bulk.count} ${bulk.count === 1 ? 'item selecionado' : 'itens selecionados'}`}
        currentLabel="preços de embalagem"
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
        icon="package"
        iconColor={colors.primary}
        fields={previewItem ? [
          { label: 'Categoria', value: previewItem.categoria_nome || 'Sem categoria' },
          { label: 'Marca', value: previewItem.marca },
          { label: 'Unidade', value: previewItem.unidade_medida },
          { label: 'Quantidade', value: previewItem.quantidade },
          { label: 'Preço da embalagem', value: formatCurrency(previewItem.preco_embalagem) },
          { label: 'Preço unitário', value: formatCurrency(previewItem.preco_unitario), accent: true },
        ] : []}
        onEdit={() => {
          const id = previewItem?.id;
          setPreviewItem(null);
          bulk.clear();
          if (id) navigation.navigate('EmbalagemForm', { id });
        }}
        onClose={() => setPreviewItem(null)}
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
              placeholder="Ex: Caixas, Potes..."
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
        aviso={confirmDelete?.mensagemExtra}
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

  // Chip de cor da categoria — badge sutil pré-nome
  catChip: {
    width: 6, height: 6, borderRadius: 3,
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
