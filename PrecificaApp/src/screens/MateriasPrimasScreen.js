import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Platform } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, getTipoUnidade, normalizeSearch } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

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

  function toggleDesktopSection(key) { setCollapsedDesktop(prev => ({...prev, [key]: !prev[key]})); }

  useFocusEffect(useCallback(() => {
    loadData();
    return () => setConfirmDelete(null);
  }, [filtroCategoria, busca]));

  async function loadData() {
    setLoading(true);
    const db = await getDatabase();
    const cats = await db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome');
    setCategorias(cats);

    // Monta mapa de cores fixo por ID
    const colorMap = {};
    cats.forEach((c, i) => { colorMap[c.id] = getCategoryColor(i); });
    colorMap['null'] = colors.disabled;
    setCatColorMap(colorMap);

    const materias = await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome');
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
    setLoading(false);
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

  function solicitarExclusao(id, nome) {
    setConfirmDelete({
      titulo: 'Excluir Insumo',
      nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM materias_primas WHERE id = ?', [id]);
        setConfirmDelete(null);
        loadData();
      },
    });
  }

  async function adicionarCategoria() {
    if (!novaCategoria.trim()) return Alert.alert('Erro', 'Informe o nome da categoria');
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
        const db = await getDatabase();
        const items = await db.getAllAsync('SELECT * FROM materias_primas WHERE categoria_id = ?', [catId]);
        for (const item of items) {
          await db.runAsync('UPDATE materias_primas SET categoria_id=? WHERE id=?', [null, item.id]);
        }
        await db.runAsync('DELETE FROM categorias_insumos WHERE id = ?', [catId]);
        if (filtroCategoria === catId) setFiltroCategoria(null);
        setConfirmDelete(null);
        loadData();
      },
    });
  }

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
        <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar por nome ou marca..." />
      </View>

      {/* Botão Adicionar */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.primary + '30', borderStyle: 'dashed' }}
        onPress={() => navigation.navigate('MateriaPrimaForm', {})}
      >
        <Feather name="plus-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Novo Insumo</Text>
      </TouchableOpacity>

      {/* Lista agrupada */}
      {isDesktop ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.desktopContentWrap}>
            <View style={styles.desktopContentInner}>
              {loading ? (
                <View style={{ padding: 40, alignItems: 'center' }}>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 13 }}>Carregando insumos...</Text>
                </View>
              ) : sections.length === 0 ? (
                <EmptyState
                  icon={busca.trim() ? 'search' : 'shopping-bag'}
                  title={busca.trim() ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
                  description={busca.trim()
                    ? `Não encontramos resultados para "${busca}".`
                    : 'Cadastre seus insumos para calcular o custo real das suas receitas.'}
                  ctaLabel={!busca.trim() ? 'Cadastrar primeiro insumo' : undefined}
                  onPress={!busca.trim() ? () => navigation.navigate('MateriaPrimaForm', {}) : undefined}
                />
              ) : (
                <View style={styles.desktopGrid}>
                  {sections.map((section, catIdx) => (
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
                        {section.data.map((item) => (
                          <TouchableOpacity
                            key={item.id}
                            style={[styles.gridCard, isWeb && { cursor: 'pointer' }]}
                            activeOpacity={0.7}
                            onPress={() => navigation.navigate('MateriaPrimaForm', { id: item.id })}
                          >
                            <Text style={styles.gridCardName} numberOfLines={1} {...(Platform.OS === 'web' ? { title: item.nome + (item.marca ? ' (' + item.marca + ')' : '') } : {})}>{item.nome}{item.marca ? <Text style={{ color: colors.textSecondary, fontWeight: '400' }}> ({item.marca})</Text> : null}</Text>
                            <Text style={styles.gridCardPrice}>{formatCurrency(item.preco_por_kg)}</Text>
                          </TouchableOpacity>
                        ))}
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
          sections={sections.map(s => ({
            ...s,
            data: collapsedSections[s.catId] ? [] : s.data,
          }))}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
          ListEmptyComponent={
            loading ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 13 }}>Carregando insumos...</Text>
              </View>
            ) : (
              <EmptyState
                icon={busca.trim() ? 'search' : 'shopping-bag'}
                title={busca.trim() ? 'Nenhum insumo encontrado' : 'Nenhum insumo cadastrado'}
                description={busca.trim()
                  ? `Não encontramos resultados para "${busca}".`
                  : 'Cadastre seus insumos para calcular o custo real das suas receitas.'}
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

            return (
              <TouchableOpacity
                style={[
                  styles.row,
                  isFirst && styles.rowFirst,
                  isLast && styles.rowLast,
                  !isLast && styles.rowBorder,
                ]}
                onPress={() => navigation.navigate('MateriaPrimaForm', { id: item.id })}
                activeOpacity={0.6}
              >
                {/* Avatar com inicial */}
                <View style={[styles.avatar, { backgroundColor: catColor + '18' }]}>
                  <Text style={[styles.avatarText, { color: catColor }]}>{inicial}</Text>
                </View>

                {/* Info */}
                <View style={styles.rowInfo}>
                  <Text style={styles.rowNome} numberOfLines={1}>{item.nome}</Text>
                  {item.marca ? (
                    <Text style={styles.rowMarca} numberOfLines={1}>{item.marca}</Text>
                  ) : null}
                </View>

                {/* Preço + unidade */}
                <View style={styles.rowRight}>
                  <Text style={styles.rowPreco}>{formatCurrency(item.preco_por_kg)}</Text>
                  <View style={[styles.unidadeBadge, { backgroundColor: unidadeInfo.color + '12' }]}>
                    <Text style={[styles.unidadeText, { color: unidadeInfo.color }]}>{unidadeInfo.label}</Text>
                  </View>
                </View>

                {/* Duplicar */}
                <TouchableOpacity
                  onPress={() => duplicarInsumo(item)}
                  style={styles.copyBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <Feather name="copy" size={13} color={colors.disabled} />
                </TouchableOpacity>

                {/* Excluir */}
                <TouchableOpacity
                  onPress={() => solicitarExclusao(item.id, item.nome)}
                  style={styles.deleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={13} color={colors.disabled} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      <FAB onPress={() => navigation.navigate('MateriaPrimaForm', {})} />

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
        onConfirm={confirmDelete?.onConfirm}
        onCancel={() => setConfirmDelete(null)}
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
    marginTop: spacing.md, marginBottom: 6,
    paddingHorizontal: 2,
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
