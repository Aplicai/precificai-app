import React, { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, ScrollView, StyleSheet, TextInput, TouchableOpacity, Modal, Keyboard, Platform, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';

// Audit P1: helper defensivo p/ números vindos de DB ou input manual.
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

const TABS = [
  { key: 'insumos', label: 'Insumos', icon: 'package' },
  { key: 'embalagens', label: 'Embalagens', icon: 'box' },
  { key: 'produtos', label: 'Produtos', icon: 'tag' },
  { key: 'combos', label: 'Combos', icon: 'layers' },
];

export default function AtualizarPrecosScreen() {
  const { isDesktop } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState('insumos');
  const [items, setItems] = useState([]);
  // Audit P1: persistir busca entre navegações (padrão da casa).
  const [busca, setBusca] = usePersistedState('atualizarPrecos.busca', '');
  // Audit P0: estados de loading/erro (era silent + sem feedback).
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);

  // Modal state
  const [editModal, setEditModal] = useState(null); // { item, value }
  const [editError, setEditError] = useState(null); // P1: feedback inline no modal
  const [recentSaved, setRecentSaved] = useState({}); // { id: true }
  const [collapsedDesktop, setCollapsedDesktop] = useState({});
  const inputRef = useRef(null);
  // P0: guard contra race condition em loadData concorrente
  const isLoadingRef = useRef(false);

  function toggleDesktopSection(key) { setCollapsedDesktop(prev => ({...prev, [key]: !prev[key]})); }

  useFocusEffect(useCallback(() => {
    loadData();
  }, [activeTab, busca]));

  async function loadData() {
    if (isLoadingRef.current) return; // P0: evita corridas
    isLoadingRef.current = true;
    setLoading(true);
    setLoadError(null);
    try {
      const db = await getDatabase();
      let rows = [];

      if (activeTab === 'insumos') {
        rows = await db.getAllAsync('SELECT id, nome, marca, valor_pago, categoria_id FROM materias_primas ORDER BY nome');
        const cats = await db.getAllAsync('SELECT id, nome FROM categorias_insumos');
        const catMap = Object.fromEntries(cats.map(c => [c.id, c.nome]));
        rows = rows.map(r => ({ ...r, displayName: r.marca ? `${r.nome} (${r.marca})` : r.nome, priceField: 'valor_pago', price: safeNum(r.valor_pago), categoria: catMap[r.categoria_id] || 'Sem categoria' }));
      } else if (activeTab === 'embalagens') {
        rows = await db.getAllAsync('SELECT id, nome, marca, preco_embalagem, categoria_id FROM embalagens ORDER BY nome');
        const cats = await db.getAllAsync('SELECT id, nome FROM categorias_embalagens');
        const catMap = Object.fromEntries(cats.map(c => [c.id, c.nome]));
        rows = rows.map(r => ({ ...r, displayName: r.marca ? `${r.nome} (${r.marca})` : r.nome, priceField: 'preco_embalagem', price: safeNum(r.preco_embalagem), categoria: catMap[r.categoria_id] || 'Sem categoria' }));
      } else if (activeTab === 'produtos') {
        rows = await db.getAllAsync('SELECT id, nome, preco_venda, categoria_id FROM produtos ORDER BY nome');
        const cats = await db.getAllAsync('SELECT id, nome FROM categorias_produtos');
        const catMap = Object.fromEntries(cats.map(c => [c.id, c.nome]));
        rows = rows.map(r => ({ ...r, priceField: 'preco_venda', price: safeNum(r.preco_venda), categoria: catMap[r.categoria_id] || 'Sem categoria' }));
      } else if (activeTab === 'combos') {
        rows = await db.getAllAsync('SELECT id, nome, preco_venda FROM delivery_combos ORDER BY nome');
        rows = rows.map(r => ({ ...r, priceField: 'preco_venda', price: safeNum(r.preco_venda), categoria: 'Combos' }));
      }

      if (busca.trim()) {
        const termo = normalizeSearch(busca);
        rows = rows.filter(r => normalizeSearch(r.displayName || r.nome).includes(termo));
      }

      setItems(rows);
    } catch (err) {
      // Audit P0: era silent — agora loga e mostra banner.
      console.error('[AtualizarPrecos.loadData]', err);
      setLoadError('Não foi possível carregar os preços. Tente novamente.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }

  function getTableName() {
    if (activeTab === 'insumos') return 'materias_primas';
    if (activeTab === 'embalagens') return 'embalagens';
    if (activeTab === 'produtos') return 'produtos';
    if (activeTab === 'combos') return 'delivery_combos';
    return '';
  }

  function getPriceLabel() {
    if (activeTab === 'insumos') return 'Valor Pago';
    if (activeTab === 'embalagens') return 'Preço Embalagem';
    return 'Preço de Venda';
  }

  function openEditModal(item) {
    const formatted = item.price ? Number(item.price).toFixed(2).replace('.', ',') : '0,00';
    setEditModal({ item, value: formatted });
    setEditError(null);
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function confirmSave() {
    if (!editModal) return;
    const { item, value } = editModal;
    // Audit P1: validar input antes de gravar — antes "abc" virava 0 silent.
    const parsed = parseFloat(String(value).replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setEditError('Digite um valor numérico válido (use vírgula para decimais).');
      return;
    }
    const numericValue = parsed;
    try {
      const db = await getDatabase();
      const table = getTableName();

      if (activeTab === 'insumos') {
        const row = await db.getFirstAsync('SELECT * FROM materias_primas WHERE id = ?', [item.id]);
        if (row) {
          // Audit P1: safeNum + division-by-zero guard reforçado.
          const qtdLiquida = safeNum(row.quantidade_liquida) || safeNum(row.quantidade_bruta) || 1;
          const precoPorKg = qtdLiquida > 0 ? safeNum(numericValue / qtdLiquida) : 0;
          await db.runAsync('UPDATE materias_primas SET valor_pago = ?, preco_por_kg = ? WHERE id = ?', [numericValue, precoPorKg, item.id]);
        }
      } else {
        await db.runAsync(`UPDATE ${table} SET ${item.priceField} = ? WHERE id = ?`, [numericValue, item.id]);
        if (activeTab === 'embalagens') {
          const row = await db.getFirstAsync('SELECT * FROM embalagens WHERE id = ?', [item.id]);
          const qtd = safeNum(row?.quantidade);
          if (row && qtd > 0) {
            await db.runAsync('UPDATE embalagens SET preco_unitario = ? WHERE id = ?', [safeNum(numericValue / qtd), item.id]);
          }
        }
      }

      // Update local state
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, price: numericValue } : i));
      setRecentSaved(prev => ({ ...prev, [item.id]: true }));
      setTimeout(() => setRecentSaved(prev => { const n = { ...prev }; delete n[item.id]; return n; }), 2000);
      setEditModal(null);
      setEditError(null);
    } catch (err) {
      // Audit P0: salvar silent fazia o usuário pensar que gravou e perder dados.
      console.error('[AtualizarPrecos.confirmSave]', err);
      setEditError('Falha ao salvar. Verifique sua conexão e tente novamente.');
      setSaveError('Não foi possível salvar o preço. Tente novamente.');
      setTimeout(() => setSaveError(null), 3500);
    }
  }

  const isWeb = Platform.OS === 'web';

  function renderItem({ item, index }) {
    const isSaved = recentSaved[item.id];

    return (
      <TouchableOpacity
        style={[
          styles.row,
          isDesktop && styles.rowDesktop,
          index === 0 && !isDesktop && styles.rowFirst,
          index === items.length - 1 && !isDesktop && styles.rowLast,
          index < items.length - 1 && !isDesktop && styles.rowBorder,
          isWeb && { cursor: 'pointer' },
        ]}
        activeOpacity={0.7}
        onPress={() => openEditModal(item)}
      >
        <View style={styles.rowInner}>
          <Text style={[styles.rowNome, isDesktop && styles.rowNomeDesktop]} numberOfLines={2}>
            {item.displayName || item.nome}
          </Text>
          <View style={styles.rowRight}>
            {isSaved && (
              <View
                style={styles.savedBadge}
                accessibilityRole="text"
                accessibilityLabel={`Preço de ${item.displayName || item.nome} salvo com sucesso`}
                accessibilityLiveRegion="polite"
              >
                <Feather name="check" size={12} color={colors.success} />
                <Text style={styles.savedText}>Salvo</Text>
              </View>
            )}
            <Text style={[styles.priceText, isDesktop && styles.priceTextDesktop, isSaved && { color: colors.success }]}>
              {formatCurrency(item.price || 0)}
            </Text>
            <View style={[styles.editIcon, isWeb && { cursor: 'pointer' }]}>
              <Feather name="edit-2" size={13} color={colors.primary} />
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // For desktop multi-column grid layout
  function renderDesktopGrid() {
    if (!isDesktop || items.length === 0) return null;

    return (
      <View style={styles.desktopGrid}>
        {(() => {
          const grouped = {};
          items.forEach(item => {
            const cat = item.categoria || 'Sem categoria';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(item);
          });
          return Object.entries(grouped).map(([cat, catItems], catIdx) => (
            <View key={cat} style={{ marginBottom: spacing.md }}>
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6, marginTop: catIdx > 0 ? 16 : 0 }}
                onPress={() => toggleDesktopSection(cat)}
              >
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[catIdx % CATEGORY_COLORS.length] }} />
                <Text style={styles.gridCatTitle}>{cat}</Text>
                <Text style={{ fontSize: 12, color: colors.textSecondary }}>({catItems.length})</Text>
                <Feather name={collapsedDesktop[cat] ? 'chevron-right' : 'chevron-down'} size={14} color={colors.disabled} />
              </TouchableOpacity>
              {!collapsedDesktop[cat] && (<View style={styles.gridContainer}>
                {catItems.map((item) => {
                  const isSaved = recentSaved[item.id];
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.gridCard, isSaved && { borderColor: colors.success + '40', backgroundColor: colors.success + '04' }, isWeb && { cursor: 'pointer' }]}
                      activeOpacity={0.7}
                      onPress={() => openEditModal(item)}
                    >
                      <Text style={styles.gridCardName} numberOfLines={1}>{item.displayName || item.nome}</Text>
                      <Text style={[styles.gridCardPrice, isSaved && { color: colors.success }]}>
                        {formatCurrency(item.price || 0)}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>)}
            </View>
          ));
        })()}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header with tabs and search */}
      <View style={[styles.headerBar, isDesktop && styles.headerBarDesktop]}>
        <View style={[styles.headerInner, isDesktop && styles.headerInnerDesktop]}>
          {/* Tabs */}
          <View style={[styles.tabsRow, isDesktop && styles.tabsRowDesktop]}>
            {TABS.map(tab => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  style={[
                    styles.tab,
                    isDesktop && styles.tabDesktop,
                    isActive && styles.tabActive,
                    isActive && isDesktop && styles.tabActiveDesktop,
                    isWeb && { cursor: 'pointer' },
                  ]}
                  onPress={() => { setActiveTab(tab.key); setBusca(''); }}
                  activeOpacity={0.7}
                >
                  {isDesktop && (
                    <Feather
                      name={tab.icon}
                      size={14}
                      color={isActive ? colors.primary : colors.textSecondary}
                      style={{ marginRight: 6 }}
                    />
                  )}
                  <Text style={[
                    styles.tabText,
                    isDesktop && styles.tabTextDesktop,
                    isActive && styles.tabTextActive,
                    isActive && isDesktop && styles.tabTextActiveDesktop,
                  ]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Search */}
          <View style={isDesktop ? styles.searchWrapDesktop : styles.searchWrapMobile}>
            <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar por nome..." />
          </View>
        </View>
      </View>

      {/* Audit P0: banners de erro */}
      {loadError ? (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={loadData}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar preços novamente"
        >
          <Feather name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </TouchableOpacity>
      ) : null}
      {saveError ? (
        <View style={styles.errorBanner} accessibilityRole="alert">
          <Feather name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{saveError}</Text>
        </View>
      ) : null}

      {/* Item count */}
      {items.length > 0 && (
        <View style={[styles.countBar, isDesktop && styles.countBarDesktop]}>
          <Text style={styles.countText}>
            {items.length} {items.length === 1 ? 'item' : 'itens'}
          </Text>
        </View>
      )}

      {/* Audit P0: loading indicator (era tela em branco) */}
      {loading && items.length === 0 && !loadError ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Carregando preços...</Text>
        </View>
      ) : null}

      {/* Content */}
      {isDesktop ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.desktopContentWrap}>
            <View style={styles.desktopContentInner}>
              {items.length === 0 ? (
                <EmptyState
                  icon={busca.trim() ? 'search' : 'dollar-sign'}
                  title={busca.trim() ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}
                  description={busca.trim()
                    ? `Nenhum resultado para "${busca}".`
                    : `Cadastre itens na aba de ${activeTab} para atualizar preços aqui.`}
                />
              ) : (
                renderDesktopGrid()
              )}
            </View>
          </View>
        </ScrollView>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <EmptyState
              icon={busca.trim() ? 'search' : 'dollar-sign'}
              title={busca.trim() ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}
              description={busca.trim()
                ? `Nenhum resultado para "${busca}".`
                : `Cadastre itens na aba de ${activeTab} para atualizar preços aqui.`}
            />
          }
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      {/* Edit Price Modal */}
      <Modal visible={!!editModal} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModal(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, isDesktop && styles.modalContentDesktop]} onPress={Keyboard.dismiss}>
            <Text style={styles.modalTitle}>Atualizar Preço</Text>
            <Text style={styles.modalItemName} numberOfLines={2}>{editModal?.item?.nome}</Text>
            <Text style={styles.modalPriceLabel}>{getPriceLabel()}</Text>

            <View style={styles.modalInputRow}>
              <Text style={styles.modalPrefix}>R$</Text>
              <TextInput
                ref={inputRef}
                style={styles.modalInput}
                value={editModal?.value || ''}
                onChangeText={(text) => {
                  const clean = text.replace(/[^0-9.,]/g, '');
                  // Limpa erro ao usuário corrigir entrada.
                  if (editError) setEditError(null);
                  setEditModal(prev => prev ? { ...prev, value: clean } : null);
                }}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
                onSubmitEditing={confirmSave}
                accessibilityLabel="Novo preço"
              />
            </View>

            {/* Audit P1: feedback inline de validação no modal */}
            {editError ? (
              <Text style={styles.modalErrorText}>{editError}</Text>
            ) : null}

            {editModal?.item?.price > 0 && (
              <Text style={styles.modalOldPrice}>
                Preço atual: {formatCurrency(editModal.item.price)}
              </Text>
            )}

            {/* Audit P1 (Fase 2 - Fix #4): preview de delta antes de salvar */}
            {(() => {
              const novoPreco = safeNum(String(editModal?.value || '0').replace(',', '.'));
              const oldPreco = safeNum(editModal?.item?.price);
              if (!(novoPreco > 0) || !(oldPreco > 0)) return null;
              const delta = novoPreco - oldPreco;
              const deltaPerc = oldPreco > 0 ? (delta / oldPreco) * 100 : 0;
              if (Math.abs(delta) < 0.005) return null;
              const isUp = delta > 0;
              const isDramatic = Math.abs(deltaPerc) >= 30;
              const cor = isDramatic ? '#dc2626' : (isUp ? '#16a34a' : '#dc2626');
              const sinal = isUp ? '+' : '−';
              const valorAbs = Math.abs(delta);
              const percAbs = Math.abs(deltaPerc);
              return (
                <View style={styles.modalDeltaBox}>
                  <View style={styles.modalDeltaRow}>
                    <Text style={styles.modalDeltaLabel}>Variação:</Text>
                    <Text style={[styles.modalDeltaValue, { color: cor }]}>
                      {sinal}{formatCurrency(valorAbs)} ({sinal}{percAbs.toFixed(1)}%)
                    </Text>
                  </View>
                  <Text style={styles.modalDeltaTransition}>
                    {formatCurrency(oldPreco)} → {formatCurrency(novoPreco)}
                  </Text>
                  {isDramatic ? (
                    <Text style={styles.modalDeltaWarning}>
                      ⚠️ Variação significativa — confira antes de salvar.
                    </Text>
                  ) : null}
                </View>
              );
            })()}

            <View style={styles.modalButtons}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModal(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={confirmSave}>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.modalSaveText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },

  // Audit P0: banners de erro + loading
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
  },
  errorBannerText: { color: '#dc2626', fontSize: fonts.small, flex: 1, fontFamily: fontFamily.regular },
  loadingBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: spacing.lg, gap: 8,
  },
  loadingText: { fontSize: fonts.small, color: colors.textSecondary, fontFamily: fontFamily.regular },
  // Audit P1: erro inline no modal de edição
  modalErrorText: {
    fontSize: fonts.tiny, color: '#dc2626', fontFamily: fontFamily.medium,
    textAlign: 'center', marginBottom: spacing.sm,
  },

  // ── Header ──
  headerBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: 0,
  },
  headerBarDesktop: {
    paddingTop: spacing.sm,
    paddingBottom: 0,
  },
  headerInner: {},
  headerInnerDesktop: {
    maxWidth: 1200,
    width: '100%',
  },

  // ── Tabs ──
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: 6,
    marginBottom: 0,
    flexWrap: 'wrap',
  },
  tabsRowDesktop: {
    gap: 0,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: 'nowrap',
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  tabDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    marginBottom: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabActiveDesktop: {
    backgroundColor: 'transparent',
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextDesktop: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  tabTextActiveDesktop: {
    color: colors.primary,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  // ── Search ──
  searchWrapMobile: {
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  searchWrapDesktop: {
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    maxWidth: 500,
  },

  // ── Count bar ──
  countBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  countBarDesktop: {
    maxWidth: 1200,
    width: '100%',
  },
  countText: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },

  // ── Mobile list ──
  list: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
    paddingBottom: 80,
  },
  row: {
    backgroundColor: colors.surface,
    paddingVertical: 11,
    paddingHorizontal: spacing.md,
  },
  rowDesktop: {
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: 2,
  },
  rowInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowFirst: {
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
  },
  rowLast: {
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  rowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowNome: {
    fontSize: 13,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  rowNomeDesktop: {
    fontSize: 14,
  },
  rowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  priceText: {
    fontSize: 13,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
  },
  priceTextDesktop: {
    fontSize: 14,
  },
  editIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '0A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: colors.success + '12',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  savedText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.success,
  },

  // ── Desktop table layout ──
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
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBg,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tableHeaderText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    flex: 1,
  },
  tableHeaderPrice: {
    flex: 0,
    width: 120,
    textAlign: 'right',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    minHeight: 44,
  },
  tableRowEven: {
    backgroundColor: colors.inputBg + '80',
  },
  tableCellName: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    color: colors.text,
    marginRight: spacing.md,
  },
  tableCellPriceWrap: {
    width: 120,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4,
  },
  tableCellPrice: {
    fontSize: 14,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    textAlign: 'right',
  },
  savedBadgeInline: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.success + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableCellAction: {
    width: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    width: '100%',
    maxWidth: 340,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalContentDesktop: {
    maxWidth: 400,
    padding: spacing.xl,
  },
  modalTitle: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  modalItemName: {
    fontSize: fonts.body,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.primary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  modalPriceLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  modalInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.primary + '30',
    marginBottom: spacing.sm,
    paddingBottom: 4,
  },
  modalPrefix: {
    fontSize: 20,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    marginRight: 6,
  },
  modalInput: {
    flex: 1,
    fontSize: 22,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    paddingVertical: 8,
    textAlign: 'left',
    outlineStyle: 'none',
    borderWidth: 0,
  },
  modalOldPrice: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  // Audit P1 (Fase 2 - Fix #4): preview de delta no modal de edição
  modalDeltaBox: {
    backgroundColor: '#f9fafb',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalDeltaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalDeltaLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  modalDeltaValue: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  modalDeltaTransition: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  modalDeltaWarning: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: '#dc2626',
    textAlign: 'center',
    marginTop: 6,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  modalSaveBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  modalSaveText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: '#fff',
  },
});
