import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, FlatList, ScrollView, StyleSheet, TouchableOpacity, Modal, Alert, Platform, TextInput } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import FAB from '../components/FAB';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import InputField from '../components/InputField';
import SaveStatus from '../components/SaveStatus';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';

// ─── Numeric helpers (audit P0 — defesa contra NaN/Infinity) ─────────────
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function parseInputNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim().replace(',', '.');
  if (str === '') return null;
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

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
  const [busca, setBusca] = usePersistedState('deliveryCombos.busca', '');
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Audit P0: error states + race-guard
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const isLoadingRef = useRef(false);
  const saveErrorTimerRef = useRef(null);

  function showSaveError(msg) {
    setSaveError(msg);
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 4000);
  }

  // Modal state
  const [showComboModal, setShowComboModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null); // null = creating, object = editing
  const [novoCombo, setNovoCombo] = useState({ nome: '', preco_venda: '', itens: [] });
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [buscaItem, setBuscaItem] = useState('');
  // Sessão 28.8 — filtro por tipo no modal de adicionar item
  const [filtroTipoItem, setFiltroTipoItem] = useState(null);

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
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadError(null);
    try {
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
    } catch (e) {
      console.error('[DeliveryCombosScreen.loadData]', e);
      setLoadError('Não foi possível carregar os combos. Tente novamente.');
    } finally {
      isLoadingRef.current = false;
    }
  }

  function parseInputValue(text) {
    const n = parseInputNumber(text);
    return n !== null && n >= 0 ? n : 0;
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
      console.error('[DeliveryCombosScreen.autoSave]', e);
      setSaveStatus(null);
      showSaveError('Falha ao salvar combo. Tente novamente.');
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
      console.error('[DeliveryCombosScreen.autoSaveImmediate]', e);
      setSaveStatus(null);
      showSaveError('Falha ao salvar combo. Tente novamente.');
    }
  }

  // Save for NEW combos only
  async function salvarNovo() {
    if (!novoCombo.nome.trim() || novoCombo.itens.length === 0) return;
    try {
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
    } catch (e) {
      console.error('[DeliveryCombosScreen.salvarNovo]', e);
      showSaveError('Falha ao criar combo. Tente novamente.');
    }
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
    try {
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
    } catch (e) {
      console.error('[DeliveryCombosScreen.handleDeleteAndExit]', e);
      showSaveError('Falha ao excluir combo. Tente novamente.');
    }
  }

  async function duplicarCombo(combo) {
    try {
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
    } catch (e) {
      console.error('[DeliveryCombosScreen.duplicarCombo]', e);
      showSaveError('Falha ao duplicar combo. Tente novamente.');
    }
  }

  function removerCombo(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        try {
          const db = await getDatabase();
          await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [id]);
          await db.runAsync('DELETE FROM delivery_combos WHERE id = ?', [id]);
          setConfirmRemove(null);
          loadData();
        } catch (e) {
          console.error('[DeliveryCombosScreen.removerCombo]', e);
          setConfirmRemove(null);
          showSaveError('Falha ao remover combo. Tente novamente.');
        }
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
    const parsed = parseInputNumber(val);
    const valid = parsed !== null && parsed > 0 ? parsed : 1;
    setNovoCombo(prev => {
      const updated = {
        ...prev,
        itens: prev.itens.map((it, i) => i === index ? { ...it, quantidade: valid } : it),
      };
      if (editingComboRef.current && loaded) {
        autoSaveImmediate(updated);
      }
      return updated;
    });
  }

  function calcSomaItens() {
    return novoCombo.itens.reduce((acc, item) => acc + safeNum(item.custoUnit) * safeNum(item.quantidade), 0);
  }

  const custoTotal = calcSomaItens();
  const precoVendaModal = parseInputValue(novoCombo.preco_venda);
  const margemModal = precoVendaModal > 0 ? ((precoVendaModal - custoTotal) / precoVendaModal) * 100 : 0;
  const isEditing = editingCombo !== null;

  // Breakdown by type
  const custoProdutos = novoCombo.itens.filter(i => i.tipo === 'produto' || i.tipo === 'delivery_produto').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const custoInsumos = novoCombo.itens.filter(i => i.tipo === 'materia_prima').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const custoPreparosCombo = novoCombo.itens.filter(i => i.tipo === 'preparo').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const custoEmbalagensCombo = novoCombo.itens.filter(i => i.tipo === 'embalagem').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const lucroCombo = precoVendaModal - custoTotal;
  const margemDesejada = 0.35; // 35% default
  const precoSugerido = custoTotal > 0 ? custoTotal / (1 - margemDesejada) : 0;

  // ─── RENDER ───────────────────────────────────────────────

  function renderComboCard({ item: combo, index }) {
    const precoV = safeNum(combo.preco_venda);
    const custoC = safeNum(combo.custo);
    const lucro = precoV - custoC;
    const margem = precoV > 0 ? ((precoV - custoC) / precoV) * 100 : 0;
    const margemColor = margem >= 25 ? colors.success : margem >= 15 ? colors.accent : colors.error;
    const comboColor = getComboColor(index);
    const itens = combo.itens || [];
    const itemCount = itens.length;
    // Sessão 28.8 — breakdown por tipo pra subtitle informativo
    const counts = { produto: 0, preparo: 0, materia_prima: 0, embalagem: 0 };
    itens.forEach(it => { if (counts[it.tipo] !== undefined) counts[it.tipo]++; });
    const subtitleParts = [];
    if (counts.produto) subtitleParts.push(`${counts.produto} ${counts.produto === 1 ? 'produto' : 'produtos'}`);
    if (counts.preparo) subtitleParts.push(`${counts.preparo} ${counts.preparo === 1 ? 'preparo' : 'preparos'}`);
    if (counts.materia_prima) subtitleParts.push(`${counts.materia_prima} ${counts.materia_prima === 1 ? 'insumo' : 'insumos'}`);
    if (counts.embalagem) subtitleParts.push(`${counts.embalagem} ${counts.embalagem === 1 ? 'embalagem' : 'embalagens'}`);
    const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Combo vazio';

    return (
      <TouchableOpacity
        style={styles.comboCardV2}
        onPress={() => abrirEditarCombo(combo)}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`Editar combo ${combo.nome}`}
      >
        {/* Header: ícone + nome + delete */}
        <View style={styles.comboCardV2Header}>
          <View style={[styles.comboCardV2Icon, { backgroundColor: comboColor + '18', borderColor: comboColor + '40' }]}>
            <Feather name="layers" size={16} color={comboColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.comboCardV2Nome} numberOfLines={1}>{combo.nome || '(sem nome)'}</Text>
            <Text style={styles.comboCardV2Subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <TouchableOpacity
            onPress={() => removerCombo(combo.id, combo.nome)}
            style={styles.comboCardV2DeleteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Remover combo ${combo.nome}`}
          >
            <Feather name="trash-2" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        {/* Métricas em grid 2x2 */}
        <View style={styles.comboCardV2Metrics}>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>CMV</Text>
            <Text style={styles.comboCardV2MetricValue}>{formatCurrency(custoC)}</Text>
          </View>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>Preço</Text>
            <Text style={[styles.comboCardV2MetricValue, { fontWeight: '700' }]}>{formatCurrency(precoV)}</Text>
          </View>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>Lucro/un</Text>
            <Text style={[styles.comboCardV2MetricValue, { color: lucro >= 0 ? colors.success : colors.error }]}>{formatCurrency(lucro)}</Text>
          </View>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>Margem</Text>
            <View style={[styles.comboCardV2Badge, { backgroundColor: margemColor + '15' }]}>
              <Text style={[styles.comboCardV2BadgeText, { color: margemColor }]}>
                {precoV > 0 ? `${margem.toFixed(1)}%` : '—'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  function renderDesktopGridCard({ item: combo, index }) {
    const precoV = safeNum(combo.preco_venda);
    const custoC = safeNum(combo.custo);
    const lucro = precoV - custoC;
    const margem = precoV > 0 ? ((precoV - custoC) / precoV) * 100 : 0;
    const margemColor = margem >= 25 ? colors.success : margem >= 15 ? colors.accent : colors.error;
    const comboColor = getComboColor(index);
    const itens = combo.itens || [];
    const itemCount = itens.length;
    const counts = { produto: 0, preparo: 0, materia_prima: 0, embalagem: 0 };
    itens.forEach(it => { if (counts[it.tipo] !== undefined) counts[it.tipo]++; });
    const subtitleParts = [];
    if (counts.produto) subtitleParts.push(`${counts.produto} produto${counts.produto > 1 ? 's' : ''}`);
    if (counts.preparo) subtitleParts.push(`${counts.preparo} preparo${counts.preparo > 1 ? 's' : ''}`);
    if (counts.materia_prima) subtitleParts.push(`${counts.materia_prima} insumo${counts.materia_prima > 1 ? 's' : ''}`);
    if (counts.embalagem) subtitleParts.push(`${counts.embalagem} ${counts.embalagem > 1 ? 'embalagens' : 'embalagem'}`);
    const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : 'Combo vazio';

    return (
      <TouchableOpacity
        style={[styles.comboCardV2, styles.comboCardV2Desktop]}
        onPress={() => abrirEditarCombo(combo)}
        activeOpacity={0.6}
        accessibilityRole="button"
        accessibilityLabel={`Editar combo ${combo.nome}`}
      >
        <View style={styles.comboCardV2Header}>
          <View style={[styles.comboCardV2Icon, { backgroundColor: comboColor + '18', borderColor: comboColor + '40' }]}>
            <Feather name="layers" size={16} color={comboColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.comboCardV2Nome} numberOfLines={1}>{combo.nome || '(sem nome)'}</Text>
            <Text style={styles.comboCardV2Subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
          <TouchableOpacity
            onPress={() => removerCombo(combo.id, combo.nome)}
            style={styles.comboCardV2DeleteBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel={`Remover combo ${combo.nome}`}
          >
            <Feather name="trash-2" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
        <View style={styles.comboCardV2Metrics}>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>CMV</Text>
            <Text style={styles.comboCardV2MetricValue}>{formatCurrency(custoC)}</Text>
          </View>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>Preço</Text>
            <Text style={[styles.comboCardV2MetricValue, { fontWeight: '700' }]}>{formatCurrency(precoV)}</Text>
          </View>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>Lucro/un</Text>
            <Text style={[styles.comboCardV2MetricValue, { color: lucro >= 0 ? colors.success : colors.error }]}>{formatCurrency(lucro)}</Text>
          </View>
          <View style={styles.comboCardV2Metric}>
            <Text style={styles.comboCardV2MetricLabel}>Margem</Text>
            <View style={[styles.comboCardV2Badge, { backgroundColor: margemColor + '15' }]}>
              <Text style={[styles.comboCardV2BadgeText, { color: margemColor }]}>
                {precoV > 0 ? `${margem.toFixed(1)}%` : '—'}
              </Text>
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  }

  // Sessão 28.8 — totais para o header (KPIs rápidos)
  const totalCombos = combos.length;
  const totalLucroPotencial = combos.reduce((acc, c) => {
    const lp = safeNum(c.preco_venda) - safeNum(c.custo);
    return acc + (lp > 0 ? lp : 0);
  }, 0);

  return (
    <View style={styles.container}>
      {/* Sessão 28.8 — Header refinado: título + KPIs + search */}
      <View style={[styles.screenHeader, isDesktop && { maxWidth: 1200, alignSelf: 'center', width: '100%' }]}>
        <View style={styles.screenHeaderTop}>
          <View style={styles.screenHeaderIconCircle}>
            <Feather name="layers" size={isDesktop ? 22 : 18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.screenHeaderTitle}>Combos / Kits</Text>
            <Text style={styles.screenHeaderSubtitle} numberOfLines={1}>
              {totalCombos === 0
                ? 'Pacotes de produtos vendidos juntos'
                : `${totalCombos} ${totalCombos === 1 ? 'combo cadastrado' : 'combos cadastrados'}${totalLucroPotencial > 0 ? ` · ${formatCurrency(totalLucroPotencial)} de lucro potencial/un` : ''}`}
            </Text>
          </View>
        </View>
        <View style={styles.screenHeaderSearch}>
          <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar combo..." />
        </View>
      </View>

      {/* Audit P0: error banners */}
      {loadError && (
        <View
          style={styles.errorBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity
            onPress={loadData}
            style={styles.errorRetryBtn}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar combos novamente"
          >
            <Text style={styles.errorRetryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}
      {saveError && (
        <View
          style={styles.errorBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Text style={styles.errorBannerText}>{saveError}</Text>
        </View>
      )}

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
              {/* Sessão 28.8 — Modal header com ícone, título e X claro */}
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderIcon}>
                  <Feather name="layers" size={18} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {isEditing ? (novoCombo.nome || 'Editar combo') : 'Novo combo'}
                  </Text>
                  {isEditing && <SaveStatus status={saveStatus} variant="badge" />}
                </View>
                <TouchableOpacity
                  style={styles.modalHeaderCloseBtn}
                  onPress={handleCloseModal}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Fechar"
                >
                  <Feather name="x" size={18} color={colors.textSecondary} />
                </TouchableOpacity>
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

              {/* Resumo de Custos — Sessão 24: REORDENADO para vir ANTES da lista de itens
                  conforme feedback do usuário. Aparece sempre que houver itens. */}
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

              <Text style={styles.modalSubtitle}>Itens do combo</Text>
              {novoCombo.itens.length === 0 && (
                <EmptyState
                  compact
                  icon="package"
                  title="Combo vazio"
                  description="Adicione produtos abaixo para montar este combo."
                />
              )}
              {novoCombo.itens.map((item, index) => {
                const badgeInfo = getTipoBadgeInfo(item.tipo);
                const custoUnit = safeNum(item.custoUnit);
                const qtd = safeNum(item.quantidade) || 1;
                const totalItem = custoUnit * qtd;
                return (
                  <View key={index} style={styles.modalItemV2}>
                    {/* Linha 1 — badge tipo + nome + lixeira */}
                    <View style={styles.modalItemV2Header}>
                      <View style={[styles.tipoBadgeV2, { backgroundColor: badgeInfo.color + '15' }]}>
                        <Text style={[styles.tipoBadgeV2Text, { color: badgeInfo.color }]}>{badgeInfo.label}</Text>
                      </View>
                      <Text style={styles.modalItemV2Name} numberOfLines={1}>{item.nome}</Text>
                      <TouchableOpacity
                        onPress={() => removerItemDoCombo(index)}
                        style={styles.modalItemV2DeleteBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Remover ${item.nome}`}
                      >
                        <Feather name="trash-2" size={15} color={colors.textSecondary} />
                      </TouchableOpacity>
                    </View>
                    {/* Linha 2 — stepper + custo */}
                    <View style={styles.modalItemV2Footer}>
                      <View style={styles.stepperV2}>
                        <TouchableOpacity
                          style={styles.stepperV2Btn}
                          onPress={() => alterarQuantidadeItem(index, String(Math.max(1, qtd - 1)))}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityRole="button"
                          accessibilityLabel="Diminuir quantidade"
                        >
                          <Feather name="minus" size={14} color={colors.text} />
                        </TouchableOpacity>
                        <TextInput
                          value={String(item.quantidade)}
                          onChangeText={(val) => alterarQuantidadeItem(index, val)}
                          keyboardType="numeric"
                          style={styles.stepperV2Input}
                          accessibilityLabel="Quantidade"
                        />
                        <TouchableOpacity
                          style={styles.stepperV2Btn}
                          onPress={() => alterarQuantidadeItem(index, String(qtd + 1))}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                          accessibilityRole="button"
                          accessibilityLabel="Aumentar quantidade"
                        >
                          <Feather name="plus" size={14} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.modalItemV2CustoTotal}>{formatCurrency(totalItem)}</Text>
                        {qtd > 1 && (
                          <Text style={styles.modalItemV2CustoUnit}>{formatCurrency(custoUnit)} × {qtd}</Text>
                        )}
                      </View>
                    </View>
                  </View>
                );
              })}

              <Text style={styles.modalSubtitle}>Adicionar itens</Text>

              <SearchBar
                value={buscaItem}
                onChangeText={setBuscaItem}
                placeholder="Buscar..."
                inset="modal"
              />

              {/* Sessão 28.8 — chips de filtro por tipo (touch targets WCAG 36pt) */}
              <View style={styles.tipoFilterRow}>
                {[
                  { key: 'todos', label: 'Tudo', icon: 'grid' },
                  { key: 'produto', label: 'Produtos', icon: 'tag' },
                  { key: 'preparo', label: 'Preparos', icon: 'pot-steam-outline', material: true },
                  { key: 'materia_prima', label: 'Insumos', icon: 'shopping-bag' },
                  { key: 'embalagem', label: 'Embalagens', icon: 'package' },
                ].map(opt => {
                  const isActive = (filtroTipoItem || 'todos') === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      style={[styles.tipoFilterChip, isActive && styles.tipoFilterChipActive]}
                      onPress={() => setFiltroTipoItem(opt.key === 'todos' ? null : opt.key)}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={opt.label}
                    >
                      {opt.material ? (
                        <MaterialCommunityIcons name={opt.icon} size={12} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                      ) : (
                        <Feather name={opt.icon} size={12} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                      )}
                      <Text style={[styles.tipoFilterChipText, isActive && styles.tipoFilterChipTextActive]}>{opt.label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {(() => {
                const termo = buscaItem.trim().toLowerCase();
                const tipoOn = (t) => !filtroTipoItem || filtroTipoItem === t;
                const filteredProdutos = tipoOn('produto') ? allProdutos.filter(p => !termo || p.nome.toLowerCase().includes(termo)) : [];
                const filteredMaterias = tipoOn('materia_prima') ? allMaterias.filter(m => !termo || m.nome.toLowerCase().includes(termo)) : [];
                const filteredEmbalagens = tipoOn('embalagem') ? allEmbalagens.filter(e => !termo || e.nome.toLowerCase().includes(termo)) : [];
                const filteredPreparos = tipoOn('preparo') ? allPreparos.filter(p => !termo || p.nome.toLowerCase().includes(termo)) : [];

                const renderRow = (item, key, tipo, custoFn) => {
                  const badgeInfo = getTipoBadgeInfo(tipo);
                  const custo = custoFn ? custoFn(item) : 0;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={styles.modalAddItemV2}
                      onPress={() => adicionarItemAoCombo(tipo, item)}
                      activeOpacity={0.65}
                      accessibilityRole="button"
                      accessibilityLabel={`Adicionar ${item.nome}`}
                    >
                      <View style={[styles.modalAddItemV2Badge, { backgroundColor: badgeInfo.color + '15' }]}>
                        <Text style={[styles.modalAddItemV2BadgeText, { color: badgeInfo.color }]}>{badgeInfo.label}</Text>
                      </View>
                      <Text style={styles.modalAddItemV2Name} numberOfLines={1}>{item.nome}</Text>
                      {custo > 0 && (
                        <Text style={styles.modalAddItemV2Custo}>{formatCurrency(custo)}</Text>
                      )}
                      <View style={styles.modalAddItemV2PlusBtn}>
                        <Feather name="plus" size={14} color={colors.primary} />
                      </View>
                    </TouchableOpacity>
                  );
                };

                const total = filteredProdutos.length + filteredMaterias.length + filteredEmbalagens.length + filteredPreparos.length;

                if (total === 0) {
                  return (
                    <Text style={styles.modalEmptyResults}>
                      {termo ? `Nenhum resultado para "${buscaItem}"` : 'Nenhum item disponível para adicionar'}
                    </Text>
                  );
                }

                return (
                  <>
                    {filteredProdutos.length > 0 && (
                      <View style={styles.modalCatBlock}>
                        <Text style={styles.modalCatLabel}>Produtos · {filteredProdutos.length}</Text>
                        {filteredProdutos.map(p => renderRow(p, `prod-${p.id}`, 'produto', (x) => safeNum(x.preco_venda)))}
                      </View>
                    )}
                    {filteredPreparos.length > 0 && (
                      <View style={styles.modalCatBlock}>
                        <Text style={styles.modalCatLabel}>Preparos · {filteredPreparos.length}</Text>
                        {filteredPreparos.map(pr => renderRow(pr, `prep-${pr.id}`, 'preparo', (x) => safeNum(x.custo_total)))}
                      </View>
                    )}
                    {filteredMaterias.length > 0 && (
                      <View style={styles.modalCatBlock}>
                        <Text style={styles.modalCatLabel}>Insumos · {filteredMaterias.length}</Text>
                        {filteredMaterias.map(m => renderRow(m, `mp-${m.id}`, 'materia_prima', (x) => safeNum(x.preco_por_kg)))}
                      </View>
                    )}
                    {filteredEmbalagens.length > 0 && (
                      <View style={styles.modalCatBlock}>
                        <Text style={styles.modalCatLabel}>Embalagens · {filteredEmbalagens.length}</Text>
                        {filteredEmbalagens.map(e => renderRow(e, `emb-${e.id}`, 'embalagem', (x) => safeNum(x.preco_unitario)))}
                      </View>
                    )}
                  </>
                );
              })()}

              {/* Sessão 28.8 — Footer sticky-like com hierarquia clara */}
              {isEditing ? (
                <View style={styles.editModalFooter}>
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
                      accessibilityRole="button"
                      accessibilityLabel="Duplicar combo"
                    >
                      <Feather name="copy" size={14} color={colors.textSecondary} />
                      <Text style={styles.duplicarBtnText}>Duplicar combo</Text>
                    </TouchableOpacity>
                  )}
                  <View style={styles.editModalFooterRow}>
                    <TouchableOpacity
                      style={styles.modalCloseBtnFull}
                      onPress={handleCloseModal}
                      accessibilityRole="button"
                      accessibilityLabel="Fechar sem salvar"
                    >
                      <Text style={styles.modalCloseText}>Fechar</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.saveBackBtn}
                      onPress={async () => {
                        try { await autoSaveImmediate(); } catch(e) { console.error('[DeliveryCombosScreen.saveBackBtn]', e); }
                        handleCloseModal();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Salvar e voltar"
                    >
                      <Feather name="check" size={16} color="#fff" />
                      <Text style={styles.saveBackBtnText}>Salvar e voltar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={styles.modalActions}>
                  <TouchableOpacity
                    style={styles.modalCancelBtn}
                    onPress={() => { setShowComboModal(false); setEditingCombo(null); }}
                    accessibilityRole="button"
                    accessibilityLabel="Cancelar"
                  >
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.modalSaveBtn}
                    onPress={salvarNovo}
                    accessibilityRole="button"
                    accessibilityLabel="Salvar combo"
                  >
                    <Feather name="check" size={14} color="#fff" />
                    <Text style={styles.modalSaveText}>Salvar combo</Text>
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

  // Audit P0: error banners
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.xs,
    borderRadius: 4,
  },
  errorBannerText: {
    flex: 1,
    color: '#991b1b',
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
  },
  errorRetryBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: '#dc2626', borderRadius: 4, marginLeft: spacing.xs,
  },
  errorRetryText: {
    color: '#fff', fontSize: fonts.tiny, fontWeight: '700',
    fontFamily: fontFamily.bold,
  },

  // Header (legacy)
  headerBar: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.xs,
    paddingBottom: spacing.xs,
  },
  // Sessão 28.8 — Header refinado da tela
  screenHeader: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  screenHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  screenHeaderIconCircle: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.primary + '30',
  },
  screenHeaderTitle: {
    fontSize: fonts.medium,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    lineHeight: 20,
  },
  screenHeaderSubtitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 14,
    marginTop: 1,
  },
  screenHeaderSearch: {
    paddingHorizontal: 4,
  },

  // List
  list: { padding: spacing.md, paddingBottom: 80 },

  // Combo row (MateriasPrimas pattern)
  // Sessão 28.8 — Cards de combo V2 (informativos com 4 métricas)
  comboCardV2: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  // Override aplicado inline no desktop pelo renderDesktopGridCard
  comboCardV2Desktop: {
    minWidth: 280,
    flexBasis: 320,
    flexGrow: 1,
    flexShrink: 1,
    marginHorizontal: 0,
    marginBottom: 0,
  },
  comboCardV2Header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  comboCardV2Icon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  comboCardV2Nome: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 2,
  },
  comboCardV2Subtitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 14,
  },
  comboCardV2DeleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  comboCardV2Metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  comboCardV2Metric: {
    flex: 1,
    minWidth: '22%',
    paddingVertical: 2,
  },
  comboCardV2MetricLabel: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  comboCardV2MetricValue: {
    fontSize: 13,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
  },
  comboCardV2Badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  comboCardV2BadgeText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  // Item dentro do modal (item do combo) V2 — stepper, melhor hierarquia
  modalItemV2: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  modalItemV2Header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalItemV2Name: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  modalItemV2DeleteBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalItemV2Footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modalItemV2CustoTotal: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  modalItemV2CustoUnit: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  // Stepper [- N +]
  stepperV2: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  stepperV2Btn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperV2Input: {
    width: 44,
    height: 32,
    textAlign: 'center',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    paddingVertical: 0,
  },
  // Badge de tipo V2 (mais visível)
  tipoBadgeV2: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  tipoBadgeV2Text: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  // Filtro tipo (chips) no modal
  tipoFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 6,
    marginBottom: spacing.sm,
  },
  tipoFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 30,
  },
  tipoFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tipoFilterChipText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  tipoFilterChipTextActive: {
    color: '#fff',
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  // Categoria block (Produtos / Preparos / etc)
  modalCatBlock: {
    marginTop: spacing.sm,
  },
  // Linha de adicionar item V2 (touch target adequado, badge tipo, custo)
  modalAddItemV2: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 44,
  },
  modalAddItemV2Badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  modalAddItemV2BadgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  modalAddItemV2Name: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  modalAddItemV2Custo: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  modalAddItemV2PlusBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalEmptyResults: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
    fontStyle: 'italic',
  },
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

  // Sessão 28.8 — Modal refinado: full-screen mobile, centrado desktop
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#fff',
    width: '100%',
    maxHeight: '90%',
    maxWidth: 720,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    paddingBottom: 0,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xs,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    marginBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalHeaderIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  modalHeaderCloseBtn: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },
  modalTitle: {
    fontSize: fonts.medium, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: fonts.small, fontWeight: '700', fontFamily: fontFamily.bold,
    color: colors.text,
    marginTop: spacing.md, marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    marginTop: spacing.md, gap: spacing.sm,
    paddingTop: spacing.md, paddingHorizontal: spacing.xs, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  modalCancelBtn: {
    flex: 1, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalCancelText: {
    color: colors.textSecondary, fontFamily: fontFamily.semiBold,
    fontWeight: '600', fontSize: fonts.small,
  },
  modalSaveBtn: {
    flex: 2, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, flexDirection: 'row', gap: 6,
    alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  modalSaveText: {
    color: colors.textLight, fontFamily: fontFamily.bold,
    fontWeight: '700', fontSize: fonts.small,
  },
  modalCloseBtnFull: {
    flex: 1, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  modalCloseText: {
    color: colors.textSecondary, fontFamily: fontFamily.semiBold,
    fontWeight: '600', fontSize: fonts.small,
  },

  // Sessão 28.8 — Edit modal footer com hierarquia clara
  editModalFooter: {
    paddingTop: spacing.md, paddingHorizontal: spacing.xs, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
  },
  editModalFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
    minHeight: 44, flex: 1, gap: 4,
  },
  duplicarBtnText: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.textSecondary,
  },
  saveBackBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    minHeight: 44, flex: 2,
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
  // Sessão 28.8 — grid responsivo desktop (2-3 cards por linha)
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    justifyContent: 'flex-start',
    paddingHorizontal: spacing.md,
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
