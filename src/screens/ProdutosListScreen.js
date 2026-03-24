import React, { useState, useCallback } from 'react';
import { View, Text, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import FinanceiroPendenteBanner from '../components/FinanceiroPendenteBanner';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, calcDespesasFixasPercentual, converterParaBase, normalizeSearch } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';

// Cores para categorias
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function getHealthColor(margem) {
  if (margem < 0) return colors.disabled; // no price set
  if (margem >= 0.15) return colors.success;
  if (margem >= 0.05) return colors.warning;
  return colors.error;
}

export default function ProdutosListScreen({ navigation }) {
  const isFocused = useIsFocused();
  const [sections, setSections] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [filtroCategoria, setFiltroCategoria] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [novaCategoria, setNovaCategoria] = useState('');
  const [busca, setBusca] = useState('');
  const [config, setConfig] = useState({ despFixasPerc: 0, despVarPerc: 0 });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [totalProdutos, setTotalProdutos] = useState(0);
  // Mapa de cores por categoria ID
  const [catColorMap, setCatColorMap] = useState({});
  // Seções recolhidas
  const [collapsedSections, setCollapsedSections] = useState({});
  const [loading, setLoading] = useState(true);

  useFocusEffect(useCallback(() => {
    loadData();
    return () => setConfirmDelete(null);
  }, [filtroCategoria, busca]));

  async function loadData() {
    setLoading(true);
    const db = await getDatabase();

    const [fixas, variaveis, fat, cats, prods, allIngs, allPreps, allEmbs] = await Promise.all([
      db.getAllAsync('SELECT * FROM despesas_fixas'),
      db.getAllAsync('SELECT * FROM despesas_variaveis'),
      db.getAllAsync('SELECT * FROM faturamento_mensal'),
      db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
    ]);

    const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
    const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
    const mesesComFat = fat.filter(f => f.valor > 0);
    const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
    const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
    setConfig({ despFixasPerc: dfPerc, despVarPerc: totalVar });

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
        const qtBase = converterParaBase(i.quantidade_utilizada, i.unidade_medida);
        if (i.unidade_medida === 'un') return a + i.quantidade_utilizada * i.preco_por_kg;
        return a + (qtBase / 1000) * i.preco_por_kg;
      }, 0);

      const preps = prepsByProd[p.id] || [];
      const custoPr = preps.reduce((a, pp) => {
        const qtBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g');
        return a + (qtBase / 1000) * pp.custo_por_kg;
      }, 0);

      const embs = embsByProd[p.id] || [];
      const custoEmb = embs.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);

      const custoTotal = custoIng + custoPr + custoEmb;
      const custoUn = custoTotal / (p.rendimento_unidades || 1);
      const precoVenda = p.preco_venda || 0;
      const despFixasVal = precoVenda * dfPerc;
      const despVarVal = precoVenda * totalVar;
      const lucro = precoVenda - custoUn - despFixasVal - despVarVal;
      const cmv = precoVenda > 0 ? custoUn / precoVenda : 0;

      const margem = precoVenda > 0 ? lucro / precoVenda : -1; // -1 = no price set
      result.push({ ...p, custoTotal: custoUn, precoVenda, lucro, cmv, despFixasVal, despVarVal, margem });
    }

    setTotalProdutos(result.length);

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
    setLoading(false);
  }

  function solicitarExclusao(id, nome) {
    setConfirmDelete({
      titulo: 'Excluir Produto',
      nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM produto_ingredientes WHERE produto_id = ?', [id]);
        await db.runAsync('DELETE FROM produto_preparos WHERE produto_id = ?', [id]);
        await db.runAsync('DELETE FROM produto_embalagens WHERE produto_id = ?', [id]);
        await db.runAsync('DELETE FROM produtos WHERE id = ?', [id]);
        setConfirmDelete(null);
        loadData();
      },
    });
  }

  async function adicionarCategoria() {
    if (!novaCategoria.trim()) return Alert.alert('Erro', 'Informe o nome da categoria');
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
    const ings = await db.getAllAsync('SELECT * FROM produto_ingredientes WHERE produto_id = ?', [produto.id]);
    for (const ing of ings) {
      await db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)', [newId, ing.materia_prima_id, ing.quantidade_utilizada]);
    }
    const preps = await db.getAllAsync('SELECT * FROM produto_preparos WHERE produto_id = ?', [produto.id]);
    for (const pr of preps) {
      await db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)', [newId, pr.preparo_id, pr.quantidade_utilizada]);
    }
    const embs = await db.getAllAsync('SELECT * FROM produto_embalagens WHERE produto_id = ?', [produto.id]);
    for (const em of embs) {
      await db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)', [newId, em.embalagem_id, em.quantidade_utilizada]);
    }
    navigation.navigate('ProdutoForm', { id: newId });
  }

  function removerCategoria(catId) {
    const cat = categorias.find(c => c.id === catId);
    setConfirmDelete({
      titulo: 'Remover Categoria',
      nome: cat ? cat.nome : 'esta categoria',
      onConfirm: async () => {
        const db = await getDatabase();
        const items = await db.getAllAsync('SELECT * FROM produtos WHERE categoria_id = ?', [catId]);
        for (const item of items) {
          await db.runAsync('UPDATE produtos SET categoria_id=? WHERE id=?', [null, item.id]);
        }
        await db.runAsync('DELETE FROM categorias_produtos WHERE id = ?', [catId]);
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
            <Feather name="plus" size={14} color={colors.primary} />
          </TouchableOpacity>
        </ScrollView>
        <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar produto..." />
      </View>

      <FinanceiroPendenteBanner />

      {/* Combos bar */}
      <TouchableOpacity style={styles.combosBar} onPress={() => navigation.navigate('CombosScreen')} activeOpacity={0.7}>
        <View style={styles.combosBarIcon}>
          <Feather name="layers" size={16} color={colors.purple} />
        </View>
        <View style={styles.combosBarInfo}>
          <Text style={styles.combosBarTitle}>Combos</Text>
          <Text style={styles.combosBarSub}>Monte combos com seus produtos</Text>
        </View>
        <Feather name="chevron-right" size={16} color={colors.disabled} />
      </TouchableOpacity>

      {/* Lista agrupada */}
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
              <Text style={{ marginTop: 12, color: colors.textSecondary, fontSize: 13 }}>Carregando produtos...</Text>
            </View>
          ) : (
            <EmptyState
              icon={busca.trim() ? 'search' : 'box'}
              title={busca.trim() ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
              description={busca.trim()
                ? `Não encontramos resultados para "${busca}".`
                : 'Crie sua primeira ficha técnica com ingredientes, preparos e embalagens.'}
              ctaLabel={!busca.trim() ? 'Criar Produto' : undefined}
              onPress={!busca.trim() ? () => navigation.navigate('ProdutoForm', {}) : undefined}
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

          return (
            <TouchableOpacity
              style={[
                styles.row,
                isFirst && styles.rowFirst,
                isLast && styles.rowLast,
                !isLast && styles.rowBorder,
              ]}
              onPress={() => navigation.navigate('ProdutoForm', { id: item.id })}
              activeOpacity={0.6}
            >
              {/* Avatar com inicial */}
              <View style={[styles.avatar, { backgroundColor: catColor + '18' }]}>
                <Text style={[styles.avatarText, { color: catColor }]}>{inicial}</Text>
              </View>

              {/* Info */}
              <View style={styles.rowInfo}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={[styles.healthDot, { backgroundColor: getHealthColor(item.margem) }]} />
                  <Text style={styles.rowNome} numberOfLines={1}>{item.nome}</Text>
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

              {/* Duplicar */}
              <TouchableOpacity
                onPress={() => duplicarProduto(item)}
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

      <FAB onPress={() => navigation.navigate('ProdutoForm', {})} />

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

  // Health dot
  healthDot: {
    width: 8, height: 8, borderRadius: 4, marginRight: 6,
  },

  // Info
  rowInfo: {
    flex: 1, marginRight: spacing.sm,
  },
  rowNome: {
    fontSize: 14, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text,
  },
  itemMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 1 },
  itemMetaText: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary },
  itemMetaSep: { fontSize: 11, color: colors.disabled, marginHorizontal: 4 },

  // Lucro
  rowRight: {
    alignItems: 'flex-end', marginRight: 2,
  },
  itemLucro: { fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700' },
  itemLucroLabel: { fontSize: 9, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.textSecondary, textTransform: 'uppercase' },

  // Duplicar
  copyBtn: {
    padding: 8,
  },
  // Excluir
  deleteBtn: {
    padding: 8,
  },

  // Combos bar (top)
  combosBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.purple + '0D',
    borderBottomWidth: 1, borderBottomColor: colors.purple + '25',
    paddingVertical: 8, paddingHorizontal: spacing.md,
  },
  combosBarIcon: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: colors.purple + '18',
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  combosBarInfo: { flex: 1 },
  combosBarTitle: { fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.purple },
  combosBarSub: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.purple, opacity: 0.65 },

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
