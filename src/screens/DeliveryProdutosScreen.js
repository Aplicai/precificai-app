import React, { useState, useCallback, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Modal } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import InputField from '../components/InputField';
import InfoTooltip from '../components/InfoTooltip';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import { Feather } from '@expo/vector-icons';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcMargem, safeNum } from '../utils/calculations';

function parseInputNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

// Color palette for product avatars
const AVATAR_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getAvatarColor(index) {
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

// Badge info by item type
const TIPO_BADGE = {
  produto:       { label: 'Produto',   color: colors.purple,  icon: 'package' },
  embalagem:     { label: 'Embalagem', color: colors.coral,   icon: 'box' },
  preparo:       { label: 'Preparo',   color: colors.accent,  icon: 'layers' },
  materia_prima: { label: 'Insumo',    color: colors.primary, icon: 'shopping-bag' },
  adicional:     { label: 'Adicional', color: colors.yellow,  icon: 'plus-circle' },
};

function getTipoBadge(tipo) {
  return TIPO_BADGE[tipo] || { label: tipo, color: colors.disabled, icon: 'circle' };
}

// Section config for modal "add items"
const SECTION_CONFIG = {
  produto:       { icon: 'package',      color: colors.purple },
  embalagem:     { icon: 'box',          color: colors.coral },
  preparo:       { icon: 'layers',       color: colors.accent },
  materia_prima: { icon: 'shopping-bag', color: colors.primary },
  adicional:     { icon: 'plus-circle',  color: colors.yellow },
};

export default function DeliveryProdutosScreen() {
  const { isDesktop } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const [deliveryProdutos, setDeliveryProdutos] = useState([]);
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [editingProdutoId, setEditingProdutoId] = useState(null);
  const [novoProdutoDelivery, setNovoProdutoDelivery] = useState({ nome: '', preco_venda: '', itens: [] });
  const [confirmRemove, setConfirmRemove] = useState(null);

  const [buscaItem, setBuscaItem] = usePersistedState('deliveryProdutos.buscaItem', '');

  const [allProdutos, setAllProdutos] = useState([]);
  const [allPreparos, setAllPreparos] = useState([]);
  const [allEmbalagens, setAllEmbalagens] = useState([]);
  const [allMaterias, setAllMaterias] = useState([]);
  const [allAdicionais, setAllAdicionais] = useState([]);

  // Error/feedback state (P1 fix)
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const isLoadingRef = useRef(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => { setConfirmRemove(null); setShowProdutoModal(false); };
    }, [])
  );

  function showSaveError(msg) {
    setSaveError(msg);
    setTimeout(() => setSaveError(null), 4000);
  }

  async function loadData() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadError(null);
    try {
      const db = await getDatabase();

    const [prods, allIngs, allPreps, allEmbs, preparosList, embalagensList, materiasList,
           adicionaisList, dProds, allDProdItens] = await Promise.all([
      db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      db.getAllAsync('SELECT id, nome, custo_por_kg FROM preparos ORDER BY nome'),
      db.getAllAsync('SELECT id, nome, preco_unitario FROM embalagens ORDER BY nome'),
      db.getAllAsync('SELECT id, nome, preco_por_kg, unidade_medida FROM materias_primas ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_adicionais ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_produtos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_produto_itens'),
    ]);

    // Build lookup maps
    const ingsByProd = {};
    (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
    const prepsByProd = {};
    (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
    const embsByProd = {};
    (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

    const prodResults = [];
    for (const p of prods) {
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
      const custoUnitario = custoTotal / getDivisorRendimento(p);
      prodResults.push({ id: p.id, nome: p.nome, precoVenda: p.preco_venda || 0, custoUnitario });
    }
    setAllProdutos(prodResults);
    setAllPreparos(preparosList);
    setAllEmbalagens(embalagensList);
    setAllMaterias(materiasList);
    setAllAdicionais(adicionaisList);

    // Build delivery product items lookup
    const dProdItensByDProd = {};
    (allDProdItens || []).forEach(i => { (dProdItensByDProd[i.delivery_produto_id] = dProdItensByDProd[i.delivery_produto_id] || []).push(i); });

    const dProdsWithCost = [];
    for (const dp of dProds) {
      const itens = dProdItensByDProd[dp.id] || [];
      let custo = 0;
      const itensNamed = [];
      for (const item of itens) {
        let nome = '';
        if (item.tipo === 'produto') {
          const prod = prodResults.find(p => p.id === item.item_id);
          if (prod) { custo += prod.custoUnitario * item.quantidade; nome = prod.nome; }
        } else if (item.tipo === 'embalagem') {
          const emb = embalagensList.find(e => e.id === item.item_id);
          if (emb) { custo += emb.preco_unitario * item.quantidade; nome = emb.nome; }
        } else if (item.tipo === 'preparo') {
          const prep = preparosList.find(p => p.id === item.item_id);
          if (prep) { custo += calcCustoPreparo(prep.custo_por_kg, item.quantidade, 'g'); nome = prep.nome; }
        } else if (item.tipo === 'materia_prima') {
          const mp = materiasList.find(m => m.id === item.item_id);
          if (mp) { custo += calcCustoIngrediente(mp.preco_por_kg, item.quantidade, mp.unidade_medida, 'g'); nome = mp.nome; }
        } else if (item.tipo === 'adicional') {
          const add = adicionaisList.find(a => a.id === item.item_id);
          if (add) { custo += add.custo * item.quantidade; nome = add.nome; }
        }
        itensNamed.push({ ...item, nome });
      }
      dProdsWithCost.push({ ...dp, itens: itensNamed, custo: safeNum(custo) });
    }
    setDeliveryProdutos(dProdsWithCost);
    } catch (e) {
      console.error('[DeliveryProdutosScreen.loadData]', e);
      setLoadError('Não conseguimos carregar os produtos delivery. Verifique sua conexão e tente novamente.');
    } finally {
      isLoadingRef.current = false;
    }
  }

  function parseInputValue(text) {
    const parsed = parseInputNumber(text);
    return parsed === null ? 0 : parsed;
  }

  function abrirModalCriar() {
    setEditingProdutoId(null);
    setNovoProdutoDelivery({ nome: '', preco_venda: '', itens: [] });
    setBuscaItem('');
    setShowProdutoModal(true);
  }

  function abrirModalEditar(dp) {
    setEditingProdutoId(dp.id);
    setNovoProdutoDelivery({
      nome: dp.nome,
      preco_venda: dp.preco_venda > 0 ? String(dp.preco_venda).replace('.', ',') : '',
      itens: dp.itens.map(item => ({ tipo: item.tipo, item_id: item.item_id, quantidade: item.quantidade, nome: item.nome })),
    });
    setBuscaItem('');
    setShowProdutoModal(true);
  }

  async function salvarProdutoDelivery() {
    const nome = novoProdutoDelivery.nome.trim();
    if (!nome) {
      showSaveError('Informe o nome do produto.');
      return;
    }
    if (novoProdutoDelivery.itens.length === 0) {
      showSaveError('Adicione pelo menos um item ao produto.');
      return;
    }
    try {
      const db = await getDatabase();
      const precoVenda = parseInputValue(novoProdutoDelivery.preco_venda);

      if (editingProdutoId) {
        await db.runAsync('UPDATE delivery_produtos SET nome = ?, preco_venda = ? WHERE id = ?',
          [nome, precoVenda, editingProdutoId]);
        await db.runAsync('DELETE FROM delivery_produto_itens WHERE delivery_produto_id = ?', [editingProdutoId]);
        for (const item of novoProdutoDelivery.itens) {
          await db.runAsync(
            'INSERT INTO delivery_produto_itens (delivery_produto_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
            [editingProdutoId, item.tipo, item.item_id, safeNum(item.quantidade) || 1]
          );
        }
      } else {
        const res = await db.runAsync(
          'INSERT INTO delivery_produtos (nome, preco_venda) VALUES (?, ?)',
          [nome, precoVenda]
        );
        const dpId = res.lastInsertRowId;
        for (const item of novoProdutoDelivery.itens) {
          await db.runAsync(
            'INSERT INTO delivery_produto_itens (delivery_produto_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
            [dpId, item.tipo, item.item_id, safeNum(item.quantidade) || 1]
          );
        }
      }
      setShowProdutoModal(false);
      setNovoProdutoDelivery({ nome: '', preco_venda: '', itens: [] });
      setEditingProdutoId(null);
      loadData();
    } catch (e) {
      console.error('[DeliveryProdutosScreen.salvarProdutoDelivery]', e);
      showSaveError('Não foi possível salvar o produto delivery. Tente novamente.');
    }
  }

  function removerProdutoDelivery(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        try {
          const db = await getDatabase();
          await db.runAsync('DELETE FROM delivery_produto_itens WHERE delivery_produto_id = ?', [id]);
          await db.runAsync('DELETE FROM delivery_produtos WHERE id = ?', [id]);
          setConfirmRemove(null);
          loadData();
        } catch (e) {
          console.error('[DeliveryProdutosScreen.removerProdutoDelivery]', e);
          setConfirmRemove(null);
          showSaveError('Não foi possível remover o produto. Tente novamente.');
        }
      },
    });
  }

  function adicionarItemAoProduto(tipo, item) {
    setNovoProdutoDelivery(prev => ({ ...prev, itens: [...prev.itens, { tipo, item_id: item.id, quantidade: 1, nome: item.nome }] }));
  }

  function removerItemDoProduto(index) {
    setNovoProdutoDelivery(prev => ({ ...prev, itens: prev.itens.filter((_, i) => i !== index) }));
  }

  function atualizarQtdItemProduto(index, qtd) {
    const parsed = parseInputNumber(qtd);
    const valid = parsed !== null && parsed > 0 ? parsed : 1;
    setNovoProdutoDelivery(prev => ({
      ...prev,
      itens: prev.itens.map((item, i) => i === index ? { ...item, quantidade: valid } : item),
    }));
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {(loadError || saveError) && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Feather name="alert-triangle" size={14} color={colors.error} style={{ marginRight: 6 }} />
            <Text style={styles.errorBannerText}>{loadError || saveError}</Text>
            {loadError && (
              <TouchableOpacity
                onPress={loadData}
                style={styles.errorRetryBtn}
                accessibilityRole="button"
                accessibilityLabel="Tentar carregar novamente"
              >
                <Text style={styles.errorRetryText}>Tentar novamente</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <Card
          title="Produtos Delivery"
          headerRight={
            <InfoTooltip
              title="Produtos Delivery"
              text="Crie produtos exclusivos para delivery combinando produtos existentes com embalagens, preparos ou insumos extras."
              examples={[
                'Ex: Bolo Delivery = Bolo + Caixa + Gelo seco',
                'Reutilize produtos já cadastrados',
                'Adicione embalagens e extras para delivery',
              ]}
            />
          }
        >
          {deliveryProdutos.length === 0 ? (
            <EmptyState
              icon="truck"
              title="Nenhum produto delivery"
              description="Crie produtos exclusivos para delivery combinando itens existentes com embalagens e extras."
              ctaLabel="Criar Produto Delivery"
              onPress={abrirModalCriar}
            />
          ) : (
            <>
              {deliveryProdutos.map((dp, dpIndex) => {
                const precoVenda = safeNum(dp.preco_venda);
                const custo = safeNum(dp.custo);
                // Sessão 28.9 — Auditoria P0-02: usar calcMargem (delivery view bruta).
                // Multiplicado por 100 porque calcMargem retorna decimal e UI espera %.
                const lucro = precoVenda - custo;
                const margem = calcMargem(precoVenda, custo) * 100;
                const avatarColor = getAvatarColor(dpIndex);
                const inicial = (dp.nome || '?').charAt(0).toUpperCase();

                return (
                  <TouchableOpacity
                    key={dp.id}
                    style={[
                      styles.row,
                      dpIndex === 0 && styles.rowFirst,
                      dpIndex === deliveryProdutos.length - 1 && styles.rowLast,
                      dpIndex < deliveryProdutos.length - 1 && styles.rowBorder,
                    ]}
                    onPress={() => abrirModalEditar(dp)}
                    activeOpacity={0.6}
                  >
                    {/* Avatar with initial */}
                    <View style={[styles.avatar, { backgroundColor: avatarColor + '18' }]}>
                      <Text style={[styles.avatarText, { color: avatarColor }]}>{inicial}</Text>
                    </View>

                    {/* Info */}
                    <View style={styles.rowInfo}>
                      <Text style={styles.rowNome} numberOfLines={1}>{dp.nome}</Text>
                      <View style={styles.rowMeta}>
                        <Text style={styles.rowMetaText}>Custo: {formatCurrency(custo)}</Text>
                        <Text style={styles.rowMetaSep}> · </Text>
                        <Text style={styles.rowMetaText}>{dp.itens.length} {dp.itens.length === 1 ? 'item' : 'itens'}</Text>
                      </View>
                    </View>

                    {/* Price + margin */}
                    <View style={styles.rowRight}>
                      <Text style={styles.rowPreco}>{formatCurrency(precoVenda)}</Text>
                      <View
                        style={[styles.margemBadge, { backgroundColor: (lucro >= 0 ? colors.success : colors.error) + '12' }]}
                        accessibilityLabel={precoVenda > 0
                          ? `Margem ${margem.toFixed(1)}%`
                          : 'Sem preço de venda definido'}
                      >
                        <Text style={[styles.margemText, { color: lucro >= 0 ? colors.success : colors.error }]}>
                          {precoVenda > 0 ? `${margem.toFixed(0)}%` : '—'}
                        </Text>
                      </View>
                    </View>

                    {/* Delete */}
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => removerProdutoDelivery(dp.id, dp.nome)}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                      accessibilityRole="button"
                      accessibilityLabel={`Remover produto delivery ${dp.nome}`}
                    >
                      <Feather name="trash-2" size={13} color={colors.disabled} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity style={styles.createBtn} onPress={abrirModalCriar}>
                <Feather name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />
                <Text style={styles.createBtnText}>Criar Produto Delivery</Text>
              </TouchableOpacity>
            </>
          )}
        </Card>
      </ScrollView>

      <ConfirmDeleteModal
        visible={!!confirmRemove}
        isFocused={isFocused}
        titulo="Remover Produto Delivery"
        nome={confirmRemove?.nome}
        onConfirm={confirmRemove?.onConfirm}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remover"
      />

      <Modal visible={showProdutoModal && isFocused} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProdutoModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Feather name="truck" size={18} color={colors.primary} />
                <Text style={styles.modalTitle}>
                  {editingProdutoId ? 'Editar Produto Delivery' : 'Criar Produto Delivery'}
                </Text>
              </View>

              {/* Info block */}
              <Card title="Informações">
                <InputField
                  label="Nome do produto"
                  value={novoProdutoDelivery.nome}
                  onChangeText={(val) => setNovoProdutoDelivery(prev => ({ ...prev, nome: val }))}
                  placeholder="Ex: Bolo de Chocolate Delivery"
                />
                <InputField
                  label="Preço de venda (R$)"
                  value={novoProdutoDelivery.preco_venda}
                  onChangeText={(val) => setNovoProdutoDelivery(prev => ({ ...prev, preco_venda: val }))}
                  keyboardType="numeric"
                  placeholder="0,00"
                  style={{ marginBottom: 0 }}
                />
              </Card>

              {/* Items added block */}
              <Card title={`Itens (${novoProdutoDelivery.itens.length})`}>
                {novoProdutoDelivery.itens.length === 0 ? (
                  <EmptyState
                    compact
                    icon="package"
                    title="Nenhum item ainda"
                    description="Busque e adicione produtos abaixo para compor este item de delivery."
                  />
                ) : (
                  novoProdutoDelivery.itens.map((item, index) => {
                    const badge = getTipoBadge(item.tipo);
                    return (
                      <View key={index} style={[
                        styles.modalItem,
                        index === novoProdutoDelivery.itens.length - 1 && { borderBottomWidth: 0 },
                      ]}>
                        {/* Item type icon */}
                        <View style={[styles.modalItemIcon, { backgroundColor: badge.color + '12' }]}>
                          <Feather name={badge.icon} size={12} color={badge.color} />
                        </View>
                        <View style={styles.modalItemInfo}>
                          <Text style={styles.modalItemName} numberOfLines={1}>{item.nome}</Text>
                          <View style={[styles.tipoBadge, { backgroundColor: badge.color + '12' }]}>
                            <Text style={[styles.tipoBadgeText, { color: badge.color }]}>{badge.label}</Text>
                          </View>
                        </View>
                        <InputField
                          value={String(item.quantidade)}
                          onChangeText={(val) => atualizarQtdItemProduto(index, val)}
                          keyboardType="numeric"
                          style={{ width: 60, marginBottom: 0 }}
                          inputStyle={{ textAlign: 'center', padding: 4, fontSize: fonts.tiny }}
                        />
                        <TouchableOpacity
                          onPress={() => removerItemDoProduto(index)}
                          style={styles.modalItemDeleteBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Feather name="trash-2" size={13} color={colors.disabled} />
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </Card>

              {/* Add items block */}
              <Card title="Adicionar Itens">
                <SearchBar
                  value={buscaItem}
                  onChangeText={setBuscaItem}
                  placeholder="Buscar produto, embalagem, preparo..."
                />

                {(() => {
                  const termo = normalizeSearch(buscaItem.trim());
                  const sections = [
                    { key: 'produto', label: 'Produtos', items: allProdutos },
                    { key: 'embalagem', label: 'Embalagens', items: allEmbalagens },
                    { key: 'preparo', label: 'Preparos', items: allPreparos },
                    { key: 'materia_prima', label: 'Insumos', items: allMaterias },
                    { key: 'adicional', label: 'Adicionais', items: allAdicionais },
                  ];

                  return sections.map(section => {
                    const filtered = section.items.filter(i => !termo || normalizeSearch(i.nome).includes(termo));
                    if (filtered.length === 0) return null;
                    const cfg = SECTION_CONFIG[section.key];
                    return (
                      <View key={section.key}>
                        <View style={styles.modalSectionHeader}>
                          <View style={[styles.modalSectionDot, { backgroundColor: cfg.color }]} />
                          <Feather name={cfg.icon} size={12} color={cfg.color} style={{ marginRight: 4 }} />
                          <Text style={[styles.modalCatLabel, { color: cfg.color }]}>{section.label}</Text>
                        </View>
                        <View style={styles.modalItemList}>
                          {filtered.slice(0, 10).map(item => (
                            <TouchableOpacity
                              key={`${section.key}-${item.id}`}
                              style={styles.modalAddItem}
                              onPress={() => adicionarItemAoProduto(section.key, item)}
                            >
                              <Feather name="plus" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.modalAddItemText} numberOfLines={1}>{item.nome}</Text>
                            </TouchableOpacity>
                          ))}
                          {filtered.length > 10 && (
                            <Text style={styles.modalMoreText}>+{filtered.length - 10} mais</Text>
                          )}
                        </View>
                      </View>
                    );
                  });
                })()}
              </Card>

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowProdutoModal(false)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarProdutoDelivery}>
                  <Feather name="check" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.modalSaveText}>{editingProdutoId ? 'Atualizar' : 'Salvar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100, maxWidth: 960, alignSelf: 'center', width: '100%' },

  // Rows (matching MateriasPrimasScreen pattern)
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
    fontSize: 14, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text,
  },
  rowMeta: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 1,
  },
  rowMetaText: {
    fontSize: 11, fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  rowMetaSep: {
    fontSize: 11, color: colors.disabled,
  },

  // Price + margin badge
  rowRight: {
    alignItems: 'flex-end', marginRight: 2,
  },
  rowPreco: {
    fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.primary,
  },
  margemBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, marginTop: 2,
  },
  margemText: {
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Delete
  deleteBtn: {
    padding: 8,
  },

  // Create button
  createBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, alignItems: 'center', marginTop: spacing.md,
    flexDirection: 'row', justifyContent: 'center',
  },
  createBtnText: {
    color: colors.textLight, fontFamily: fontFamily.bold,
    fontWeight: '700', fontSize: fonts.small,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.background, borderRadius: borderRadius.lg,
    padding: spacing.md, width: '100%', maxHeight: '90%', maxWidth: 600,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold,
    fontWeight: '700', color: colors.text,
  },
  modalEmptyText: {
    textAlign: 'center', color: colors.textSecondary,
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    paddingVertical: spacing.sm,
  },

  // Modal items
  modalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  modalItemIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs + 2,
  },
  modalItemInfo: { flex: 1 },
  modalItemName: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold,
    fontWeight: '600', color: colors.text, marginBottom: 1,
  },
  tipoBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
    alignSelf: 'flex-start', overflow: 'hidden',
  },
  tipoBadgeText: {
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  modalItemDeleteBtn: {
    marginLeft: spacing.xs, padding: spacing.xs,
  },

  // Modal add items - section header
  modalSectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.sm, marginBottom: spacing.xs,
    paddingHorizontal: 2,
  },
  modalSectionDot: {
    width: 6, height: 6, borderRadius: 3, marginRight: 4,
  },
  modalCatLabel: {
    fontSize: 11, fontFamily: fontFamily.bold, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  modalItemList: { flexDirection: 'row', flexWrap: 'wrap' },
  modalAddItem: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    marginRight: spacing.xs, marginBottom: spacing.xs,
    flexDirection: 'row', alignItems: 'center',
  },
  modalAddItemText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.semiBold,
    color: colors.primary, fontWeight: '600',
  },
  modalMoreText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.regular,
    color: colors.textSecondary, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
  },

  // Modal actions
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

  // Error banner (P1 fix)
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    padding: spacing.sm, borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small,
    fontFamily: fontFamily.regular, color: '#991b1b',
  },
  errorRetryBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: '#dc2626', borderRadius: borderRadius.sm,
    marginLeft: spacing.xs,
  },
  errorRetryText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.bold,
    color: '#ffffff', fontWeight: '700',
  },
});
