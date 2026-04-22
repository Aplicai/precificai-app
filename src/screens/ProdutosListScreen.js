import React, { useState, useCallback } from 'react';
import { View, Text, SectionList, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, Modal, ActivityIndicator, Platform } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import FinanceiroPendenteBanner from '../components/FinanceiroPendenteBanner';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, calcDespesasFixasPercentual, converterParaBase, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
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
  const [totalProdutos, setTotalProdutos] = useState(0);
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

  const isWeb = Platform.OS === 'web';

  function renderDesktopGrid() {
    if (!isDesktop || sections.length === 0) return null;
    return (
      <View style={{ marginTop: spacing.xs }}>
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
                  style={[styles.gridCard, { backgroundColor: getHealthBgColor(item.margem, config.margemMeta), borderLeftWidth: 3, borderLeftColor: getHealthBorderColor(item.margem, config.margemMeta) }, isWeb && { cursor: 'pointer' }]}
                  activeOpacity={0.7}
                  onPress={() => navigation.navigate('ProdutoForm', { id: item.id })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                    <Text style={styles.gridCardName} numberOfLines={1} {...(Platform.OS === 'web' ? { title: item.nome } : {})}>{item.nome}</Text>
                  </View>
                  <Text style={styles.gridCardPrice}>
                    {formatCurrency(item.precoVenda)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>)}
          </View>
        ))}
      </View>
    );
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
        {/* Legenda do semáforo de lucro */}
        {(() => {
          const metaPct = Math.round(config.margemMeta * 100);
          const limiteInf = Math.max(0, metaPct - 10);
          return (
            <View style={styles.legendRow}>
              <View style={[styles.legendSwatch, { backgroundColor: colors.success + '12', borderLeftWidth: 3, borderLeftColor: colors.success + '50' }]} />
              <Text style={styles.legendText}>Lucro ≥{metaPct}%</Text>
              <View style={[styles.legendSwatch, { backgroundColor: YELLOW + '18', borderLeftWidth: 3, borderLeftColor: YELLOW + '60' }]} />
              <Text style={styles.legendText}>Lucro {limiteInf}-{metaPct}%</Text>
              <View style={[styles.legendSwatch, { backgroundColor: colors.error + '12', borderLeftWidth: 3, borderLeftColor: colors.error + '50' }]} />
              <Text style={styles.legendText}>Lucro &lt;{limiteInf}%</Text>
              <View style={[styles.legendSwatch, { backgroundColor: colors.disabled + '0C', borderLeftWidth: 3, borderLeftColor: colors.disabled + '40' }]} />
              <Text style={styles.legendText}>Sem preço</Text>
            </View>
          );
        })()}
      </View>

      <FinanceiroPendenteBanner />

      {/* Botão Adicionar */}
      <TouchableOpacity
        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary + '10', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14, marginHorizontal: 16, marginTop: 8, marginBottom: 4, borderWidth: 1, borderColor: colors.primary + '30', borderStyle: 'dashed' }}
        onPress={() => navigation.navigate('ProdutoForm', { categoriaId: filtroCategoria })}
      >
        <Feather name="plus-circle" size={18} color={colors.primary} style={{ marginRight: 8 }} />
        <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 14 }}>Novo Produto</Text>
      </TouchableOpacity>

      {/* Content */}
      {isDesktop ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.desktopContentWrap}>
            <View style={styles.desktopContentInner}>
              {sections.length === 0 ? (
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
                    onPress={!busca.trim() ? () => navigation.navigate('ProdutoForm', { categoriaId: filtroCategoria }) : undefined}
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
          sections={sections.map(s => ({
            ...s,
            data: collapsedSections[s.catId] ? [] : s.data,
          }))}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          stickySectionHeadersEnabled={false}
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
                onPress={!busca.trim() ? () => navigation.navigate('ProdutoForm', { categoriaId: filtroCategoria }) : undefined}
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
                  { backgroundColor: getHealthBgColor(item.margem, config.margemMeta), borderLeftWidth: 3, borderLeftColor: getHealthBorderColor(item.margem, config.margemMeta) },
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
                  accessibilityRole="button"
                  accessibilityLabel="Duplicar produto"
                  {...(Platform.OS === 'web' ? { title: 'Duplicar produto' } : {})}
                >
                  <Feather name="copy" size={13} color={colors.disabled} />
                </TouchableOpacity>

                {/* Excluir */}
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
              </TouchableOpacity>
            );
          }}
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      <FAB onPress={() => navigation.navigate('ProdutoForm', { categoriaId: filtroCategoria })} label={isDesktop ? 'Novo Produto' : undefined} />

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

  // Legenda semáforo
  legendRow: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: spacing.md, paddingTop: 6, paddingBottom: 2,
  },
  legendSwatch: { width: 20, height: 14, borderRadius: 3 },
  legendText: { fontSize: 11, color: colors.text, fontFamily: fontFamily.medium, fontWeight: '500', marginRight: 10 },

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
