import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, Platform } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import InputField from '../components/InputField';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

// Color cycling for combo avatars
const COMBO_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getComboColor(index) {
  return COMBO_COLORS[index % COMBO_COLORS.length];
}

// Type badge colors
function getTipoBadgeInfo(tipo) {
  if (tipo === 'materia_prima') return { label: 'insumo', color: colors.primary };
  if (tipo === 'preparo') return { label: 'preparo', color: colors.accent };
  if (tipo === 'produto' || tipo === 'delivery_produto') return { label: 'produto', color: colors.purple };
  if (tipo === 'embalagem') return { label: 'embalagem', color: colors.yellow };
  return { label: tipo, color: colors.disabled };
}

export default function DeliveryCombosScreen() {
  const isFocused = useIsFocused();
  const { isDesktop } = useResponsiveLayout();
  const [combos, setCombos] = useState([]);
  const [busca, setBusca] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Modal state
  const [showComboModal, setShowComboModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null); // null = creating, object = editing
  const [novoCombo, setNovoCombo] = useState({ nome: '', preco_venda: '', itens: [] });
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');

  // Auto-save state (edit mode)
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const novoComboRef = useRef(novoCombo);
  novoComboRef.current = novoCombo;
  const editingComboRef = useRef(editingCombo);
  editingComboRef.current = editingCombo;

  // Available items for picker
  const [allProdutos, setAllProdutos] = useState([]);
  const [allDeliveryProdutos, setAllDeliveryProdutos] = useState([]);
  const [allMaterias, setAllMaterias] = useState([]);
  const [allEmbalagens, setAllEmbalagens] = useState([]);
  const [allPreparos, setAllPreparos] = useState([]);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => { setConfirmRemove(null); setShowComboModal(false); setEditingCombo(null); setLoaded(false); };
    }, [])
  );

  // Auto-save: debounce 600ms after form changes (edit mode only)
  useEffect(() => {
    if (!editingComboRef.current || !loaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveStatus(null);
    saveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [novoCombo.nome, novoCombo.preco_venda, loaded]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function loadData() {
    const db = await getDatabase();

    const [prods, allIngs, allPreps, allEmbs, embalagensList, preparosList, materiasList,
           combosList, allComboItens, dProds, allDProdItens] = await Promise.all([
      db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      db.getAllAsync('SELECT id, nome, preco_unitario FROM embalagens ORDER BY nome'),
      db.getAllAsync('SELECT id, nome, custo_por_kg FROM preparos ORDER BY nome'),
      db.getAllAsync('SELECT id, nome, preco_por_kg, unidade_medida FROM materias_primas ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_combo_itens'),
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
    setAllMaterias(materiasList);
    setAllEmbalagens(embalagensList);
    setAllPreparos(preparosList);

    // Build delivery product costs (delivery_produtos is a separate table)
    const dProdItensByDProd = {};
    (allDProdItens || []).forEach(i => { (dProdItensByDProd[i.delivery_produto_id] = dProdItensByDProd[i.delivery_produto_id] || []).push(i); });

    const deliveryProdResults = [];
    for (const dp of (dProds || [])) {
      const itens = dProdItensByDProd[dp.id] || [];
      let custo = 0;
      for (const item of itens) {
        if (item.tipo === 'produto') {
          const prod = prodResults.find(p => p.id === item.item_id);
          if (prod) custo += prod.custoUnitario * item.quantidade;
        } else if (item.tipo === 'embalagem') {
          const emb = embalagensList.find(e => e.id === item.item_id);
          if (emb) custo += emb.preco_unitario * item.quantidade;
        } else if (item.tipo === 'preparo') {
          const prep = preparosList.find(p => p.id === item.item_id);
          if (prep) custo += calcCustoPreparo(prep.custo_por_kg, item.quantidade, 'g');
        } else if (item.tipo === 'materia_prima') {
          const mp = materiasList.find(m => m.id === item.item_id);
          if (mp) custo += calcCustoIngrediente(mp.preco_por_kg, item.quantidade, mp.unidade_medida, 'g');
        }
      }
      deliveryProdResults.push({ id: dp.id, nome: dp.nome, precoVenda: dp.preco_venda || 0, custoUnitario: custo });
    }
    setAllDeliveryProdutos(deliveryProdResults);

    // Build combo items lookup
    const comboItensByCombo = {};
    (allComboItens || []).forEach(i => { (comboItensByCombo[i.combo_id] = comboItensByCombo[i.combo_id] || []).push(i); });

    const combosWithCost = [];
    for (const combo of combosList) {
      const itens = comboItensByCombo[combo.id] || [];
      let custo = 0;
      for (const item of itens) {
        if (item.tipo === 'produto') {
          const prod = prodResults.find(p => p.id === item.item_id);
          if (prod) custo += prod.custoUnitario * item.quantidade;
        } else if (item.tipo === 'delivery_produto') {
          const dp = deliveryProdResults.find(p => p.id === item.item_id);
          if (dp) custo += dp.custoUnitario * item.quantidade;
        } else if (item.tipo === 'materia_prima') {
          const mp = materiasList.find(m => m.id === item.item_id);
          if (mp) custo += calcCustoIngrediente(mp.preco_por_kg, item.quantidade, mp.unidade_medida, 'g');
        } else if (item.tipo === 'embalagem') {
          const emb = embalagensList.find(e => e.id === item.item_id);
          if (emb) custo += emb.preco_unitario * item.quantidade;
        } else if (item.tipo === 'preparo') {
          const prep = preparosList.find(p => p.id === item.item_id);
          if (prep) custo += calcCustoPreparo(prep.custo_por_kg, item.quantidade, 'g');
        }
      }
      combosWithCost.push({ ...combo, itens, custo });
    }
    setCombos(combosWithCost);
  }

  function parseInputValue(text) {
    return parseFloat(text.replace(',', '.')) || 0;
  }

  // Filtered combos for search
  const combosFiltrados = busca.trim()
    ? combos.filter(c => normalizeSearch(c.nome).includes(normalizeSearch(busca)))
    : combos;

  // Open modal for creating
  function abrirCriarCombo() {
    setEditingCombo(null);
    setNovoCombo({ nome: '', preco_venda: '', itens: [] });
    setBuscaItem('');
    setShowIncompleteModal(false);
    setSaveStatus(null);
    setLoaded(false);
    setShowComboModal(true);
  }

  // Open modal for editing
  function abrirEditarCombo(combo) {
    setEditingCombo(combo);
    const itensComNome = combo.itens.map(item => {
      let nome = '';
      let custoUnit = 0;
      if (item.tipo === 'produto') {
        const p = allProdutos.find(x => x.id === item.item_id);
        nome = p ? p.nome : 'Produto';
        custoUnit = p ? p.custoUnitario : 0;
      } else if (item.tipo === 'delivery_produto') {
        const dp = allDeliveryProdutos.find(x => x.id === item.item_id);
        nome = dp ? dp.nome : 'Produto Delivery';
        custoUnit = dp ? dp.custoUnitario : 0;
      } else if (item.tipo === 'materia_prima') {
        const mp = allMaterias.find(x => x.id === item.item_id);
        nome = mp ? mp.nome : 'Insumo';
        custoUnit = mp ? calcCustoIngrediente(mp.preco_por_kg, 1, mp.unidade_medida, 'g') : 0;
      } else if (item.tipo === 'embalagem') {
        const e = allEmbalagens.find(x => x.id === item.item_id);
        nome = e ? e.nome : 'Embalagem';
        custoUnit = e ? e.preco_unitario : 0;
      } else if (item.tipo === 'preparo') {
        const p = allPreparos.find(x => x.id === item.item_id);
        nome = p ? p.nome : 'Preparo';
        custoUnit = p ? calcCustoPreparo(p.custo_por_kg, 1, 'g') : 0;
      }
      return { tipo: item.tipo, item_id: item.item_id, quantidade: item.quantidade, nome, custoUnit };
    });
    setNovoCombo({
      nome: combo.nome,
      preco_venda: String(combo.preco_venda || '').replace('.', ','),
      itens: itensComNome,
    });
    setBuscaItem('');
    setShowIncompleteModal(false);
    setSaveStatus(null);
    setShowComboModal(true);
    // Mark as loaded after a small delay to prevent immediate auto-save
    setTimeout(() => setLoaded(true), 150);
  }

  // Auto-save for edit mode (name/price changes via debounce)
  async function autoSave() {
    const combo = editingComboRef.current;
    const data = novoComboRef.current;
    if (!combo) return;
    if (!data.nome.trim()) return; // don't save without name

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE delivery_combos SET nome = ?, preco_venda = ? WHERE id = ?',
        [data.nome.trim(), parseInputValue(data.preco_venda), combo.id]
      );
      // Delete and reinsert items
      await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [combo.id]);
      for (const item of data.itens) {
        await db.runAsync(
          'INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
          [combo.id, item.tipo, item.item_id, item.quantidade]
        );
      }
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus(null);
    }
  }

  // Immediate save for item add/remove/quantity changes (edit mode)
  // Accepts optional override data to avoid race conditions with state updates
  async function autoSaveImmediate(overrideData) {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    const combo = editingComboRef.current;
    const data = overrideData || novoComboRef.current;
    if (!combo || !loaded) return;
    if (!data.nome.trim()) return;

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE delivery_combos SET nome = ?, preco_venda = ? WHERE id = ?',
        [data.nome.trim(), parseInputValue(data.preco_venda), combo.id]
      );
      await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [combo.id]);
      for (const item of data.itens) {
        await db.runAsync(
          'INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
          [combo.id, item.tipo, item.item_id, item.quantidade]
        );
      }
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus(null);
    }
  }

  // Save for NEW combos only
  async function salvarNovo() {
    if (!novoCombo.nome.trim() || novoCombo.itens.length === 0) return;
    const db = await getDatabase();

    const res = await db.runAsync(
      'INSERT INTO delivery_combos (nome, preco_venda) VALUES (?, ?)',
      [novoCombo.nome.trim(), parseInputValue(novoCombo.preco_venda)]
    );
    const comboId = res.lastInsertRowId;
    for (const item of novoCombo.itens) {
      await db.runAsync(
        'INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
        [comboId, item.tipo, item.item_id, item.quantidade]
      );
    }

    setShowComboModal(false);
    setEditingCombo(null);
    setNovoCombo({ nome: '', preco_venda: '', itens: [] });
    setLoaded(false);
    loadData();
  }

  // Handle closing modal with validation
  function handleCloseModal() {
    const isEditing = editingCombo !== null;

    if (isEditing) {
      // Edit mode: check if name is empty (incomplete)
      if (!novoCombo.nome.trim()) {
        setShowIncompleteModal(true);
        return;
      }
      // All good, just close and reload
      setShowComboModal(false);
      setEditingCombo(null);
      setNovoCombo({ nome: '', preco_venda: '', itens: [] });
      setLoaded(false);
      loadData();
    } else {
      // Create mode: if has data, warn; if empty, just close
      if (novoCombo.nome.trim() || novoCombo.itens.length > 0) {
        // Check if name is empty but has items (incomplete)
        if (!novoCombo.nome.trim()) {
          setShowIncompleteModal(true);
          return;
        }
        // Has name, just close (unsaved new combo)
        setShowComboModal(false);
        setEditingCombo(null);
        setNovoCombo({ nome: '', preco_venda: '', itens: [] });
      } else {
        setShowComboModal(false);
        setEditingCombo(null);
      }
    }
  }

  // Incomplete modal actions
  function handleContinueEditing() {
    setShowIncompleteModal(false);
  }

  async function handleDeleteAndExit() {
    setShowIncompleteModal(false);
    const isEditing = editingCombo !== null;
    if (isEditing && editingCombo.id) {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [editingCombo.id]);
      await db.runAsync('DELETE FROM delivery_combos WHERE id = ?', [editingCombo.id]);
    }
    setShowComboModal(false);
    setEditingCombo(null);
    setNovoCombo({ nome: '', preco_venda: '', itens: [] });
    setLoaded(false);
    loadData();
  }

  async function duplicarCombo(combo) {
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO delivery_combos (nome, preco_venda) VALUES (?,?)', [combo.nome + ' (cópia)', combo.preco_venda]);
    const newId = result?.lastInsertRowId;
    if (newId) {
      const itens = await db.getAllAsync('SELECT * FROM delivery_combo_itens WHERE combo_id = ?', [combo.id]);
      await Promise.all(itens.map(item =>
        db.runAsync('INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?,?,?,?)', [newId, item.tipo, item.item_id, item.quantidade])
      ));
    }
    loadData();
  }

  function removerCombo(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [id]);
        await db.runAsync('DELETE FROM delivery_combos WHERE id = ?', [id]);
        setConfirmRemove(null);
        loadData();
      },
    });
  }

  function getItemCusto(tipo, item) {
    if (tipo === 'produto' || tipo === 'delivery_produto') return item.custoUnitario || 0;
    if (tipo === 'materia_prima') return calcCustoIngrediente(item.preco_por_kg || 0, 1, item.unidade_medida, 'g');
    if (tipo === 'embalagem') return item.preco_unitario || 0;
    if (tipo === 'preparo') return calcCustoPreparo(item.custo_por_kg || 0, 1, 'g');
    return 0;
  }

  function adicionarItemAoCombo(tipo, item) {
    const custoUnit = getItemCusto(tipo, item);
    const newItem = { tipo, item_id: item.id, quantidade: 1, nome: item.nome, custoUnit };
    setNovoCombo(prev => {
      const updated = { ...prev, itens: [...prev.itens, newItem] };
      // Auto-save imediato com dados atualizados (modo edição)
      if (editingComboRef.current && loaded) {
        autoSaveImmediate(updated);
      }
      return updated;
    });
  }

  function removerItemDoCombo(index) {
    setNovoCombo(prev => {
      const updated = { ...prev, itens: prev.itens.filter((_, i) => i !== index) };
      if (editingComboRef.current && loaded) {
        autoSaveImmediate(updated);
      }
      return updated;
    });
  }

  function alterarQuantidadeItem(index, val) {
    setNovoCombo(prev => {
      const updated = {
        ...prev,
        itens: prev.itens.map((it, i) => i === index ? { ...it, quantidade: parseFloat(val) || 1 } : it),
      };
      if (editingComboRef.current && loaded) {
        autoSaveImmediate(updated);
      }
      return updated;
    });
  }

  function calcSomaItens() {
    return novoCombo.itens.reduce((acc, item) => acc + (item.custoUnit || 0) * item.quantidade, 0);
  }

  const custoTotal = calcSomaItens();
  const precoVendaModal = parseInputValue(novoCombo.preco_venda);
  const margemModal = precoVendaModal > 0 ? ((precoVendaModal - custoTotal) / precoVendaModal) * 100 : 0;
  const isEditing = editingCombo !== null;

  // Breakdown by type
  const custoProdutos = novoCombo.itens.filter(i => i.tipo === 'produto' || i.tipo === 'delivery_produto').reduce((a, i) => a + (i.custoUnit || 0) * i.quantidade, 0);
  const custoInsumos = novoCombo.itens.filter(i => i.tipo === 'materia_prima').reduce((a, i) => a + (i.custoUnit || 0) * i.quantidade, 0);
  const custoPreparosCombo = novoCombo.itens.filter(i => i.tipo === 'preparo').reduce((a, i) => a + (i.custoUnit || 0) * i.quantidade, 0);
  const custoEmbalagensCombo = novoCombo.itens.filter(i => i.tipo === 'embalagem').reduce((a, i) => a + (i.custoUnit || 0) * i.quantidade, 0);
  const lucroCombo = precoVendaModal - custoTotal;
  const margemDesejada = 0.35; // 35% default
  const precoSugerido = custoTotal > 0 ? custoTotal / (1 - margemDesejada) : 0;

  // ─── RENDER ───────────────────────────────────────────────

  function renderComboCard({ item: combo, index }) {
    const margem = combo.preco_venda > 0 ? ((combo.preco_venda - combo.custo) / combo.preco_venda) * 100 : 0;
    const margemColor = margem >= 25 ? colors.success : margem >= 15 ? colors.accent : colors.error;
    const comboColor = getComboColor(index);
    const inicial = (combo.nome || '?').charAt(0).toUpperCase();
    const itemCount = combo.itens ? combo.itens.length : 0;

    return (
      <TouchableOpacity
        style={styles.row}
        onPress={() => abrirEditarCombo(combo)}
        activeOpacity={0.6}
      >
        {/* Avatar */}
        <View style={[styles.avatar, { backgroundColor: comboColor + '18' }]}>
          <Text style={[styles.avatarText, { color: comboColor }]}>{inicial}</Text>
        </View>

        {/* Info */}
        <View style={styles.rowInfo}>
          <Text style={styles.rowNome} numberOfLines={2}>{combo.nome}</Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {itemCount} {itemCount === 1 ? 'item' : 'itens'}
          </Text>
        </View>

        {/* Price + margin badge */}
        <View style={styles.rowRight}>
          <Text style={styles.rowPreco}>{formatCurrency(combo.preco_venda)}</Text>
          <View style={[styles.margemBadge, { backgroundColor: margemColor + '12' }]}>
            <Text style={[styles.margemBadgeText, { color: margemColor }]}>
              {margem.toFixed(1)}%
            </Text>
          </View>
        </View>

        {/* Delete */}
        <TouchableOpacity
          onPress={() => removerCombo(combo.id, combo.nome)}
          style={styles.deleteBtn}
          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
        >
          <Feather name="trash-2" size={13} color={colors.disabled} />
        </TouchableOpacity>
      </TouchableOpacity>
    );
  }

  function renderDesktopGridCard({ item: combo, index }) {
    const margem = combo.preco_venda > 0 ? ((combo.preco_venda - combo.custo) / combo.preco_venda) * 100 : 0;
    const margemColor = margem >= 25 ? colors.success : margem >= 15 ? colors.accent : colors.error;
    const comboColor = getComboColor(index);
    const inicial = (combo.nome || '?').charAt(0).toUpperCase();
    const itemCount = combo.itens ? combo.itens.length : 0;

    return (
      <TouchableOpacity
        style={styles.gridCard}
        onPress={() => abrirEditarCombo(combo)}
        activeOpacity={0.6}
      >
        <View style={styles.gridCardTop}>
          <View style={[styles.gridAvatar, { backgroundColor: comboColor + '18' }]}>
            <Text style={[styles.gridAvatarText, { color: comboColor }]}>{inicial}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
            <TouchableOpacity
              onPress={() => removerCombo(combo.id, combo.nome)}
              style={styles.gridDeleteBtn}
              hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
            >
              <Feather name="trash-2" size={12} color={colors.disabled} />
            </TouchableOpacity>
          </View>
        </View>
        <Text style={styles.gridNome} numberOfLines={2}>{combo.nome}</Text>
        <Text style={styles.gridSubtitle}>{itemCount} {itemCount === 1 ? 'item' : 'itens'}</Text>
        <View style={styles.gridBottom}>
          <Text style={styles.gridPreco}>{formatCurrency(combo.preco_venda)}</Text>
          <View style={[styles.margemBadge, { backgroundColor: margemColor + '12' }]}>
            <Text style={[styles.margemBadgeText, { color: margemColor }]}>
              {margem.toFixed(1)}%
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Search header */}
      <View style={[styles.headerBar, isDesktop && { maxWidth: 1200, alignSelf: 'center', width: '100%' }]}>
        <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar combo..." />
      </View>

      {/* Combo list */}
      {isDesktop ? (
        <ScrollView contentContainerStyle={[styles.list, { maxWidth: 1200, alignSelf: 'center', width: '100%' }]}>
          {combosFiltrados.length === 0 ? (
            <EmptyState
              icon={busca.trim() ? 'search' : 'layers'}
              title={busca.trim() ? 'Nenhum combo encontrado' : 'Nenhum combo criado'}
              description={busca.trim()
                ? `Não encontramos resultados para "${busca}".`
                : 'Monte combos agrupando seus produtos com preço especial.'}
              ctaLabel={!busca.trim() ? 'Criar primeiro combo' : undefined}
              onPress={!busca.trim() ? abrirCriarCombo : undefined}
            />
          ) : (
            <View style={styles.gridContainer}>
              {combosFiltrados.map((combo, index) => (
                <React.Fragment key={combo.id}>
                  {renderDesktopGridCard({ item: combo, index })}
                </React.Fragment>
              ))}
            </View>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      ) : (
        <FlatList
          data={combosFiltrados}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderComboCard}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <EmptyState
              icon={busca.trim() ? 'search' : 'layers'}
              title={busca.trim() ? 'Nenhum combo encontrado' : 'Nenhum combo criado'}
              description={busca.trim()
                ? `Não encontramos resultados para "${busca}".`
                : 'Monte combos agrupando seus produtos com preço especial.'}
              ctaLabel={!busca.trim() ? 'Criar primeiro combo' : undefined}
              onPress={!busca.trim() ? abrirCriarCombo : undefined}
            />
          }
          ListFooterComponent={<View style={{ height: 20 }} />}
        />
      )}

      {/* FAB */}
      <FAB onPress={abrirCriarCombo} label={isDesktop ? 'Novo Combo' : undefined} />

      {/* Delete confirmation */}
      <ConfirmDeleteModal
        visible={!!confirmRemove}
        isFocused={isFocused}
        titulo="Remover Combo"
        nome={confirmRemove?.nome}
        onConfirm={confirmRemove?.onConfirm}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remover"
      />

      {/* Create / Edit modal */}
      <Modal visible={showComboModal && isFocused} transparent animationType="fade">
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCloseModal}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Feather name="package" size={18} color={colors.primary} />
                <Text style={styles.modalTitle}>{isEditing ? 'Editar Combo' : 'Criar Combo'}</Text>
                {/* Auto-save status indicator for edit mode */}
                {isEditing && saveStatus && (
                  <View style={styles.autoSaveInline}>
                    {saveStatus === 'saving' ? (
                      <>
                        <Feather name="loader" size={11} color={colors.textSecondary} />
                        <Text style={styles.autoSaveInlineText}>Salvando...</Text>
                      </>
                    ) : (
                      <>
                        <Feather name="check-circle" size={11} color={colors.success} />
                        <Text style={[styles.autoSaveInlineText, { color: colors.success }]}>Salvo</Text>
                      </>
                    )}
                  </View>
                )}
              </View>

              <InputField
                label="Nome do combo"
                value={novoCombo.nome}
                onChangeText={(val) => setNovoCombo(prev => ({ ...prev, nome: val }))}
                placeholder="Ex: Combo Festa"
              />

              <InputField
                label="Preço de venda (R$)"
                value={novoCombo.preco_venda}
                onChangeText={(val) => setNovoCombo(prev => ({ ...prev, preco_venda: val }))}
                keyboardType="numeric"
                placeholder="0,00"
              />

              <Text style={styles.modalSubtitle}>Itens do combo</Text>
              {novoCombo.itens.length === 0 && (
                <Text style={styles.emptyItemsText}>Nenhum item adicionado.</Text>
              )}
              {novoCombo.itens.map((item, index) => {
                const badgeInfo = getTipoBadgeInfo(item.tipo);
                const itemInicial = (item.nome || '?').charAt(0).toUpperCase();
                const itemColor = getComboColor(index);
                return (
                  <View key={index} style={styles.modalItem}>
                    <View style={[styles.modalItemAvatar, { backgroundColor: itemColor + '18' }]}>
                      <Text style={[styles.modalItemAvatarText, { color: itemColor }]}>{itemInicial}</Text>
                    </View>
                    <Text style={styles.modalItemName}>{item.nome}</Text>
                    <View style={[styles.tipoBadge, { backgroundColor: badgeInfo.color + '12' }]}>
                      <Text style={[styles.tipoBadgeText, { color: badgeInfo.color }]}>{badgeInfo.label}</Text>
                    </View>
                    <Text style={styles.modalItemCusto}>{formatCurrency((item.custoUnit || 0) * item.quantidade)}</Text>
                    <InputField
                      value={String(item.quantidade)}
                      onChangeText={(val) => alterarQuantidadeItem(index, val)}
                      keyboardType="numeric"
                      style={{ width: 55, marginBottom: 0 }}
                      inputStyle={{ textAlign: 'center', padding: 4, fontSize: fonts.tiny }}
                    />
                    <TouchableOpacity
                      onPress={() => removerItemDoCombo(index)}
                      style={styles.deleteBtn}
                      hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={13} color={colors.disabled} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Resumo de Custos - full cost report */}
              {novoCombo.itens.length > 0 && (
                <View style={styles.comboResumo}>
                  <View style={styles.comboResumoHeader}>
                    <Feather name="dollar-sign" size={14} color={colors.primary} />
                    <Text style={styles.comboResumoTitle}>Resumo de Custos</Text>
                  </View>
                  <View style={styles.comboResumoGrid}>
                    <View style={styles.comboResumoCell}>
                      <Text style={styles.comboResumoCellLabel}>CMV Unit.</Text>
                      <Text style={styles.comboResumoCellValue}>{formatCurrency(custoTotal)}</Text>
                    </View>
                    <View style={styles.comboResumoCell}>
                      <Text style={styles.comboResumoCellLabel}>Sugerido</Text>
                      <Text style={[styles.comboResumoCellValue, { color: colors.textSecondary }]}>{formatCurrency(precoSugerido)}</Text>
                    </View>
                    <View style={styles.comboResumoCell}>
                      <Text style={styles.comboResumoCellLabel}>Lucro</Text>
                      <Text style={[styles.comboResumoCellValue, { color: lucroCombo >= 0 ? colors.primary : colors.error }]}>{formatCurrency(lucroCombo)}</Text>
                    </View>
                    <View style={styles.comboResumoCell}>
                      <Text style={styles.comboResumoCellLabel}>Margem</Text>
                      <Text style={[styles.comboResumoCellValue, {
                        color: margemModal >= 25 ? colors.success : margemModal >= 15 ? colors.accent : colors.error
                      }]}>
                        {precoVendaModal > 0 ? `${margemModal.toFixed(1)}%` : '\u2014'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.comboResumoBreakdown}>
                    {custoProdutos > 0 && <Text style={styles.comboResumoBreakdownItem}>Produtos {formatCurrency(custoProdutos)}</Text>}
                    {custoProdutos > 0 && custoInsumos > 0 && <Text style={styles.comboResumoBreakdownSep}>{'\u00B7'}</Text>}
                    {custoInsumos > 0 && <Text style={styles.comboResumoBreakdownItem}>Insumos {formatCurrency(custoInsumos)}</Text>}
                    {(custoProdutos > 0 || custoInsumos > 0) && custoPreparosCombo > 0 && <Text style={styles.comboResumoBreakdownSep}>{'\u00B7'}</Text>}
                    {custoPreparosCombo > 0 && <Text style={styles.comboResumoBreakdownItem}>Preparos {formatCurrency(custoPreparosCombo)}</Text>}
                    {(custoProdutos > 0 || custoInsumos > 0 || custoPreparosCombo > 0) && custoEmbalagensCombo > 0 && <Text style={styles.comboResumoBreakdownSep}>{'\u00B7'}</Text>}
                    {custoEmbalagensCombo > 0 && <Text style={styles.comboResumoBreakdownItem}>Emb. {formatCurrency(custoEmbalagensCombo)}</Text>}
                  </View>
                </View>
              )}

              <Text style={styles.modalSubtitle}>Adicionar itens</Text>

              <InputField
                value={buscaItem}
                onChangeText={setBuscaItem}
                placeholder="Buscar item..."
                style={{ marginBottom: spacing.xs }}
              />

              {(() => {
                const termo = buscaItem.trim().toLowerCase();
                const filteredProdutos = allProdutos.filter(p => !termo || p.nome.toLowerCase().includes(termo));
                const filteredMaterias = allMaterias.filter(m => !termo || m.nome.toLowerCase().includes(termo));
                const filteredEmbalagens = allEmbalagens.filter(e => !termo || e.nome.toLowerCase().includes(termo));
                const filteredPreparos = allPreparos.filter(p => !termo || p.nome.toLowerCase().includes(termo));
                return (
                  <>
                    {filteredProdutos.length > 0 && (
                      <>
                        <Text style={styles.modalCatLabel}>Produtos</Text>
                        <View style={styles.modalItemList}>
                          {filteredProdutos.map(p => (
                            <TouchableOpacity key={`prod-${p.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoCombo('produto', p)}>
                              <Feather name="plus" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.modalAddItemText}>{p.nome}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    {filteredMaterias.length > 0 && (
                      <>
                        <Text style={styles.modalCatLabel}>Insumos</Text>
                        <View style={styles.modalItemList}>
                          {filteredMaterias.map(m => (
                            <TouchableOpacity key={`mp-${m.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoCombo('materia_prima', m)}>
                              <Feather name="plus" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.modalAddItemText}>{m.nome}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    {filteredEmbalagens.length > 0 && (
                      <>
                        <Text style={styles.modalCatLabel}>Embalagens</Text>
                        <View style={styles.modalItemList}>
                          {filteredEmbalagens.map(e => (
                            <TouchableOpacity key={`emb-${e.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoCombo('embalagem', e)}>
                              <Feather name="plus" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.modalAddItemText}>{e.nome}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                    {filteredPreparos.length > 0 && (
                      <>
                        <Text style={styles.modalCatLabel}>Preparos</Text>
                        <View style={styles.modalItemList}>
                          {filteredPreparos.map(pr => (
                            <TouchableOpacity key={`prep-${pr.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoCombo('preparo', pr)}>
                              <Feather name="plus" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                              <Text style={styles.modalAddItemText}>{pr.nome}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </>
                    )}

                  </>
                );
              })()}

              {/* Modal actions: show Salvar only for NEW combos; edit mode uses auto-save */}
              {isEditing ? (
                <View style={styles.editModalFooter}>
                  {saveStatus && (
                    <View style={styles.autoSaveBar}>
                      {saveStatus === 'saving' ? (
                        <>
                          <Feather name="loader" size={13} color={colors.textSecondary} />
                          <Text style={styles.autoSaveText}>Salvando...</Text>
                        </>
                      ) : (
                        <>
                          <Feather name="check-circle" size={13} color={colors.success} />
                          <Text style={[styles.autoSaveText, { color: colors.success }]}>Salvo</Text>
                        </>
                      )}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm }}>
                    {novoCombo.nome.trim() !== '' && (
                      <TouchableOpacity
                        style={styles.duplicarBtn}
                        onPress={async () => {
                          await duplicarCombo(editingCombo);
                          setShowComboModal(false);
                          setEditingCombo(null);
                          setNovoCombo({ nome: '', preco_venda: '', itens: [] });
                          setLoaded(false);
                        }}
                      >
                        <Feather name="copy" size={13} color={colors.primary} style={{ marginRight: 5 }} />
                        <Text style={styles.duplicarBtnText}>Duplicar</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity style={styles.modalCloseBtnFull} onPress={handleCloseModal}>
                      <Text style={styles.modalCloseText}>Fechar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.saveBackBtn} onPress={async () => { try { await autoSaveImmediate(); } catch(e) {} handleCloseModal(); }}>
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.saveBackBtnText}>Salvar e voltar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setShowComboModal(false); setEditingCombo(null); }}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarNovo}>
                    <Feather name="check" size={14} color="#fff" style={{ marginRight: 4 }} />
                    <Text style={styles.modalSaveText}>Salvar</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal de campos incompletos */}
      <Modal visible={showIncompleteModal} transparent animationType="fade">
        <View style={styles.incompleteOverlay}>
          <View style={styles.incompleteModal}>
            <View style={styles.incompleteIconCircle}>
              <Feather name="alert-circle" size={28} color={colors.error} />
            </View>
            <Text style={styles.incompleteTitle}>Campos obrigatórios</Text>
            <Text style={styles.incompleteDesc}>
              O nome do combo é obrigatório. Deseja continuar editando ou excluir este combo?
            </Text>
            <TouchableOpacity style={styles.incompleteBtnEdit} onPress={handleContinueEditing} activeOpacity={0.7}>
              <Feather name="edit-2" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnEditText}>Continuar editando</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.incompleteBtnDelete} onPress={handleDeleteAndExit} activeOpacity={0.7}>
              <Feather name="trash-2" size={15} color={colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnDeleteText}>Excluir combo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  // List
  list: { padding: spacing.md, paddingBottom: 80 },

  // Combo row (MateriasPrimas pattern)
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 10, paddingLeft: spacing.sm + 2, paddingRight: 4,
    borderRadius: borderRadius.md,
    marginBottom: spacing.xs,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
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
  rowSubtitle: {
    fontSize: 11, fontFamily: fontFamily.regular,
    color: colors.textSecondary, marginTop: 1,
  },

  // Price + margin
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
  margemBadgeText: {
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Delete
  deleteBtn: {
    padding: 8,
  },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxHeight: '85%', maxWidth: 500,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap',
  },
  modalTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: fonts.small, fontWeight: '700', fontFamily: fontFamily.bold,
    color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  emptyItemsText: {
    textAlign: 'center', color: colors.textSecondary, fontSize: fonts.regular,
    fontFamily: fontFamily.regular, paddingVertical: spacing.sm,
  },

  // Auto-save inline indicator
  autoSaveInline: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    marginLeft: spacing.xs,
  },
  autoSaveInlineText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium, fontWeight: '500',
    color: colors.textSecondary,
  },

  // Modal item row
  modalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  modalItemAvatar: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 6,
  },
  modalItemAvatarText: {
    fontSize: 11, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  modalItemName: {
    flex: 1, fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.text,
  },
  modalItemCusto: {
    fontSize: fonts.tiny, fontFamily: fontFamily.semiBold, color: colors.textSecondary,
    marginRight: spacing.xs, minWidth: 60, textAlign: 'right',
  },

  // Result chips (cost summary)
  resultBar: {
    flexDirection: 'row', gap: spacing.xs,
    marginTop: spacing.sm,
  },
  resultChip: {
    flex: 1, borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm,
    alignItems: 'center',
  },
  resultChipLabel: {
    fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary,
    marginBottom: 1,
  },
  resultChipValue: {
    fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Type badge
  tipoBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
  },
  tipoBadgeText: {
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Item picker
  modalCatLabel: {
    fontSize: fonts.small, fontWeight: '600', fontFamily: fontFamily.semiBold,
    color: colors.primary, marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  modalItemList: { flexDirection: 'row', flexWrap: 'wrap' },
  modalAddItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    marginRight: spacing.xs, marginBottom: spacing.xs,
  },
  modalAddItemText: { fontSize: fonts.tiny, color: colors.primary, fontWeight: '600', fontFamily: fontFamily.semiBold },

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
  modalCloseBtnFull: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseText: {
    color: colors.textSecondary, fontFamily: fontFamily.semiBold,
    fontWeight: '600', fontSize: fonts.regular,
  },

  // Edit modal footer (padrão da plataforma)
  editModalFooter: {
    marginTop: spacing.lg, alignItems: 'center',
  },
  autoSaveBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 4, marginBottom: spacing.sm,
  },
  autoSaveText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary,
  },
  duplicarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.primary + '30',
    borderRadius: borderRadius.sm, paddingVertical: 8, paddingHorizontal: 14,
  },
  duplicarBtnText: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.primary,
  },
  saveBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: borderRadius.md,
  },
  saveBackBtnText: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: '#fff',
  },

  // Incomplete modal
  incompleteOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.sm,
  },
  incompleteModal: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 340,
    alignItems: 'center',
  },
  incompleteIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.error + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  incompleteTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.xs, textAlign: 'center',
  },
  incompleteDesc: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: spacing.lg,
  },
  incompleteBtnEdit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, width: '100%', marginBottom: spacing.sm,
  },
  incompleteBtnEditText: {
    color: '#fff', fontFamily: fontFamily.bold, fontWeight: '700',
    fontSize: fonts.regular,
  },
  incompleteBtnDelete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.error + '40',
    borderRadius: borderRadius.sm, paddingVertical: spacing.sm + 2, width: '100%',
  },
  incompleteBtnDeleteText: {
    color: colors.error, fontFamily: fontFamily.semiBold, fontWeight: '600',
    fontSize: fonts.regular,
  },

  // Desktop grid
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'flex-start',
  },
  gridCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    width: 'calc(25% - 6px)',
    minWidth: 180,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  gridCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  gridAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  gridAvatarText: {
    fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  gridDeleteBtn: {
    padding: 6,
  },
  gridNome: {
    fontSize: 13, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text, marginBottom: 2,
  },
  gridSubtitle: {
    fontSize: 10, fontFamily: fontFamily.regular,
    color: colors.textSecondary, marginBottom: spacing.xs,
  },
  gridBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 'auto',
  },
  gridPreco: {
    fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.primary,
  },

  // Combo Resumo de Custos (full cost report card)
  comboResumo: {
    backgroundColor: colors.primary + '06',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '20',
    padding: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
  comboResumoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  comboResumoTitle: {
    fontSize: fonts.regular,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.bold,
  },
  comboResumoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  comboResumoCell: {
    width: '50%',
    paddingVertical: spacing.xs,
  },
  comboResumoCellLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    fontWeight: '600',
    marginBottom: 2,
  },
  comboResumoCellValue: {
    fontSize: fonts.large,
    fontWeight: '700',
    color: colors.text,
    fontFamily: fontFamily.bold,
  },
  comboResumoBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.primary + '15',
    gap: 4,
  },
  comboResumoBreakdownItem: {
    fontSize: 10,
    color: colors.textSecondary,
  },
  comboResumoBreakdownSep: {
    fontSize: 10,
    color: colors.disabled,
  },
});
