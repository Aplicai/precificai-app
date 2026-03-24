import React, { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, StyleSheet, TextInput, TouchableOpacity, Modal, Keyboard, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch } from '../utils/calculations';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

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
  const [busca, setBusca] = useState('');

  // Modal state
  const [editModal, setEditModal] = useState(null); // { item, value }
  const [recentSaved, setRecentSaved] = useState({}); // { id: true }
  const inputRef = useRef(null);

  useFocusEffect(useCallback(() => {
    loadData();
  }, [activeTab, busca]));

  async function loadData() {
    const db = await getDatabase();
    let rows = [];

    if (activeTab === 'insumos') {
      rows = await db.getAllAsync('SELECT id, nome, valor_pago FROM materias_primas ORDER BY nome');
      rows = rows.map(r => ({ ...r, priceField: 'valor_pago', price: r.valor_pago }));
    } else if (activeTab === 'embalagens') {
      rows = await db.getAllAsync('SELECT id, nome, preco_embalagem FROM embalagens ORDER BY nome');
      rows = rows.map(r => ({ ...r, priceField: 'preco_embalagem', price: r.preco_embalagem }));
    } else if (activeTab === 'produtos') {
      rows = await db.getAllAsync('SELECT id, nome, preco_venda FROM produtos ORDER BY nome');
      rows = rows.map(r => ({ ...r, priceField: 'preco_venda', price: r.preco_venda }));
    } else if (activeTab === 'combos') {
      rows = await db.getAllAsync('SELECT id, nome, preco_venda FROM delivery_combos ORDER BY nome');
      rows = rows.map(r => ({ ...r, priceField: 'preco_venda', price: r.preco_venda }));
    }

    if (busca.trim()) {
      const termo = normalizeSearch(busca);
      rows = rows.filter(r => normalizeSearch(r.nome).includes(termo));
    }

    setItems(rows);
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
    setTimeout(() => inputRef.current?.focus(), 100);
  }

  async function confirmSave() {
    if (!editModal) return;
    const { item, value } = editModal;
    const numericValue = parseFloat(value.replace(',', '.')) || 0;
    const db = await getDatabase();
    const table = getTableName();

    if (activeTab === 'insumos') {
      const row = await db.getFirstAsync('SELECT * FROM materias_primas WHERE id = ?', [item.id]);
      if (row) {
        const qtdLiquida = row.quantidade_liquida || row.quantidade_bruta || 1;
        const precoPorKg = qtdLiquida > 0 ? numericValue / qtdLiquida : 0;
        await db.runAsync('UPDATE materias_primas SET valor_pago = ?, preco_por_kg = ? WHERE id = ?', [numericValue, precoPorKg, item.id]);
      }
    } else {
      await db.runAsync(`UPDATE ${table} SET ${item.priceField} = ? WHERE id = ?`, [numericValue, item.id]);
      if (activeTab === 'embalagens') {
        const row = await db.getFirstAsync('SELECT * FROM embalagens WHERE id = ?', [item.id]);
        if (row && row.quantidade > 0) {
          await db.runAsync('UPDATE embalagens SET preco_unitario = ? WHERE id = ?', [numericValue / row.quantidade, item.id]);
        }
      }
    }

    // Update local state
    setItems(prev => prev.map(i => i.id === item.id ? { ...i, price: numericValue } : i));
    setRecentSaved(prev => ({ ...prev, [item.id]: true }));
    setTimeout(() => setRecentSaved(prev => { const n = { ...prev }; delete n[item.id]; return n; }), 2000);
    setEditModal(null);
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
            {item.nome}
          </Text>
          <View style={styles.rowRight}>
            {isSaved && (
              <View style={styles.savedBadge}>
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

  // For desktop 2-column layout
  function renderDesktopGrid() {
    if (!isDesktop || items.length === 0) return null;

    return (
      <View style={styles.desktopGrid}>
        {/* Table header */}
        <View style={styles.tableHeader}>
          <Text style={styles.tableHeaderText}>Nome</Text>
          <Text style={[styles.tableHeaderText, styles.tableHeaderPrice]}>{getPriceLabel()}</Text>
          <View style={{ width: 36 }} />
        </View>
        {/* Table rows */}
        {items.map((item, index) => {
          const isSaved = recentSaved[item.id];
          return (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.tableRow,
                index % 2 === 0 && styles.tableRowEven,
                isWeb && { cursor: 'pointer' },
              ]}
              activeOpacity={0.7}
              onPress={() => openEditModal(item)}
            >
              <Text style={styles.tableCellName} numberOfLines={2}>{item.nome}</Text>
              <View style={styles.tableCellPriceWrap}>
                {isSaved && (
                  <View style={styles.savedBadgeInline}>
                    <Feather name="check" size={11} color={colors.success} />
                  </View>
                )}
                <Text style={[styles.tableCellPrice, isSaved && { color: colors.success }]}>
                  {formatCurrency(item.price || 0)}
                </Text>
              </View>
              <View style={styles.tableCellAction}>
                <Feather name="edit-2" size={13} color={colors.primaryLight} />
              </View>
            </TouchableOpacity>
          );
        })}
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

      {/* Item count */}
      {items.length > 0 && (
        <View style={[styles.countBar, isDesktop && styles.countBarDesktop]}>
          <Text style={styles.countText}>
            {items.length} {items.length === 1 ? 'item' : 'itens'}
          </Text>
        </View>
      )}

      {/* Content */}
      {isDesktop ? (
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
                  setEditModal(prev => prev ? { ...prev, value: clean } : null);
                }}
                keyboardType="numeric"
                selectTextOnFocus
                autoFocus
                onSubmitEditing={confirmSave}
              />
            </View>

            {editModal?.item?.price > 0 && (
              <Text style={styles.modalOldPrice}>
                Preço atual: {formatCurrency(editModal.item.price)}
              </Text>
            )}

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
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },

  // ── Tabs ──
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: 4,
    marginBottom: 0,
  },
  tabsRowDesktop: {
    gap: 8,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  tabDesktop: {
    flex: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
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
    maxWidth: 360,
  },

  // ── Count bar ──
  countBar: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  countBarDesktop: {
    maxWidth: 960,
    alignSelf: 'center',
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
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
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
    alignItems: 'center',
  },
  desktopContentInner: {
    maxWidth: 960,
    width: '100%',
    flex: 1,
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
  },
  desktopGrid: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
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
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
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
    backgroundColor: colors.inputBg,
    borderWidth: 1.5,
    borderColor: colors.primary + '40',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  modalPrefix: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  modalInput: {
    flex: 1,
    fontSize: fonts.xlarge,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    paddingVertical: spacing.md,
    textAlign: 'left',
  },
  modalOldPrice: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
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
