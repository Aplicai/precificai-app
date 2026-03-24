import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch, Modal,
  ActivityIndicator, Platform,
} from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import Card from '../components/Card';
import InputField from '../components/InputField';
import SearchBar from '../components/SearchBar';
import EmptyState from '../components/EmptyState';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, converterParaBase, normalizeSearch } from '../utils/calculations';

const isWeb = Platform.OS === 'web';

// ── Tabs ─────────────────────────────────────────────────
const TABS = [
  { key: 'plataformas', label: 'Plataformas', icon: 'smartphone' },
  { key: 'cardapio',    label: 'Cardápio',    icon: 'book-open' },
  { key: 'combos',      label: 'Combos',      icon: 'layers' },
  { key: 'adicionais',  label: 'Adicionais',  icon: 'plus-circle' },
];

// ── Platform helpers ─────────────────────────────────────
const PLATFORM_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
];

const KNOWN_PLATFORMS = [
  { match: 'ifood',        icon: 'food',         iconSet: 'material', color: '#EA1D2C' },
  { match: 'rappi',        icon: 'zap',          iconSet: 'feather',  color: '#FF6B00' },
  { match: '99food',       icon: 'numeric-99',   iconSet: 'material', color: '#FFCC00' },
  { match: 'uber eats',    icon: 'car',          iconSet: 'material', color: '#06C167' },
  { match: 'ubereats',     icon: 'car',          iconSet: 'material', color: '#06C167' },
  { match: 'venda direta', icon: 'shopping-bag', iconSet: 'feather',  color: colors.primary },
];

const DEFAULT_PLATFORMS = [
  { plataforma: 'iFood',        taxa_plataforma: 27, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Rappi',        taxa_plataforma: 25, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: '99Food',       taxa_plataforma: 20, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Uber Eats',    taxa_plataforma: 30, taxa_entrega: 0, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
  { plataforma: 'Venda Direta', taxa_plataforma: 0,  taxa_entrega: 5, comissao_app: 0, desconto_promocao: 0, ativo: 1 },
];

function getPlatformStyle(name) {
  const normalized = (name || '').toLowerCase().trim();
  for (const p of KNOWN_PLATFORMS) {
    if (normalized.includes(p.match)) return { icon: p.icon, iconSet: p.iconSet, color: p.color };
  }
  return null;
}

function getPlatformColor(index) {
  return PLATFORM_COLORS[index % PLATFORM_COLORS.length];
}

// ── Combo type badges ────────────────────────────────────
function getTipoBadgeInfo(tipo) {
  if (tipo === 'materia_prima')    return { label: 'Insumo',    color: colors.primary, icon: 'shopping-bag' };
  if (tipo === 'preparo')          return { label: 'Preparo',   color: colors.accent,  icon: 'layers' };
  if (tipo === 'produto')          return { label: 'Produto',   color: colors.purple,  icon: 'package' };
  if (tipo === 'delivery_produto') return { label: 'Delivery',  color: colors.coral,   icon: 'truck' };
  if (tipo === 'embalagem')        return { label: 'Embalagem', color: colors.yellow,  icon: 'box' };
  if (tipo === 'adicional')        return { label: 'Adicional', color: colors.info,    icon: 'plus-circle' };
  return { label: tipo, color: colors.disabled, icon: 'circle' };
}

// Avatar color cycling
const AVATAR_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
];
function getAvatarColor(index) { return AVATAR_COLORS[index % AVATAR_COLORS.length]; }

function parseInputValue(text) {
  return parseFloat(String(text).replace(',', '.')) || 0;
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function DeliveryHubScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState('plataformas');
  const [loading, setLoading] = useState(true);
  const [confirmRemove, setConfirmRemove] = useState(null);

  // ── Plataformas state ──
  const [plataformas, setPlataformas] = useState([]);
  const [expandedPlatId, setExpandedPlatId] = useState(null);
  const [novaPlataforma, setNovaPlataforma] = useState('');

  // ── Cardápio state ──
  const [produtos, setProdutos] = useState([]);
  const [buscaProd, setBuscaProd] = useState('');

  // ── Combos state ──
  const [combos, setCombos] = useState([]);
  const [buscaCombo, setBuscaCombo] = useState('');
  const [showComboModal, setShowComboModal] = useState(false);
  const [editingCombo, setEditingCombo] = useState(null);
  const [novoCombo, setNovoCombo] = useState({ nome: '', preco_venda: '', itens: [] });
  const [buscaItemCombo, setBuscaItemCombo] = useState('');

  // Available items for combo picker
  const [allProdutos, setAllProdutos] = useState([]);
  const [deliveryProdutos, setDeliveryProdutos] = useState([]);
  const [allMaterias, setAllMaterias] = useState([]);
  const [allEmbalagens, setAllEmbalagens] = useState([]);
  const [allPreparos, setAllPreparos] = useState([]);
  const [allAdicionaisRef, setAllAdicionaisRef] = useState([]);

  // ── Adicionais state ──
  const [adicionais, setAdicionais] = useState([]);
  const [novoAdicional, setNovoAdicional] = useState({ nome: '', custo: '', preco_cobrado: '' });
  const [editingAddId, setEditingAddId] = useState(null);
  const [editAddValues, setEditAddValues] = useState({ nome: '', custo: '', preco_cobrado: '' });

  // ── Load data ──────────────────────────────────────────
  useFocusEffect(
    useCallback(() => {
      loadAllData();
      return () => {
        setConfirmRemove(null);
        setShowComboModal(false);
        setEditingCombo(null);
        setEditingAddId(null);
      };
    }, [])
  );

  async function loadAllData() {
    setLoading(true);
    try {
      const db = await getDatabase();

      const [plats, prods, allIngs, allPreps, allEmbs,
             preparosList, embalagensList, materiasList, adicionaisList,
             dProds, allDProdItens, combosList, allComboItens] = await Promise.all([
        db.getAllAsync('SELECT * FROM delivery_config ORDER BY id'),
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
        db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
        db.getAllAsync('SELECT * FROM delivery_combo_itens'),
      ]);

      // Seed platforms if empty
      let finalPlats = plats;
      if (plats.length === 0) {
        for (const p of DEFAULT_PLATFORMS) {
          await db.runAsync(
            'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
            [p.plataforma, p.taxa_plataforma, p.taxa_entrega, p.comissao_app, p.desconto_promocao, p.ativo]
          );
        }
        finalPlats = await db.getAllAsync('SELECT * FROM delivery_config ORDER BY id');
      }
      setPlataformas(finalPlats);

      // Build lookup maps for product costs
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
          if (i.unidade_medida === 'un') return a + i.quantidade_utilizada * i.preco_por_kg;
          const qtBase = converterParaBase(i.quantidade_utilizada, i.unidade_medida);
          return a + (qtBase / 1000) * i.preco_por_kg;
        }, 0);
        const prepsP = prepsByProd[p.id] || [];
        const custoPr = prepsP.reduce((a, pp) => {
          const qtBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g');
          return a + (qtBase / 1000) * pp.custo_por_kg;
        }, 0);
        const embsP = embsByProd[p.id] || [];
        const custoEmb = embsP.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);
        const custoTotal = custoIng + custoPr + custoEmb;
        const custoUnitario = custoTotal / (p.rendimento_unidades || 1);

        prodResults.push({
          id: p.id,
          nome: p.nome,
          precoVenda: p.preco_venda || 0,
          custoUnitario,
        });
      }
      setProdutos(prodResults);
      setAllProdutos(prodResults);

      // Delivery products with cost
      const dProdItensByDProd = {};
      (allDProdItens || []).forEach(i => { (dProdItensByDProd[i.delivery_produto_id] = dProdItensByDProd[i.delivery_produto_id] || []).push(i); });

      const dProdsWithCost = [];
      for (const dp of dProds) {
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
            if (prep) custo += (prep.custo_por_kg / 1000) * item.quantidade;
          } else if (item.tipo === 'materia_prima') {
            const mp = materiasList.find(m => m.id === item.item_id);
            if (mp) custo += (mp.preco_por_kg / 1000) * item.quantidade;
          } else if (item.tipo === 'adicional') {
            const add = adicionaisList.find(a => a.id === item.item_id);
            if (add) custo += add.custo * item.quantidade;
          }
        }
        dProdsWithCost.push({ ...dp, custo });
      }
      setDeliveryProdutos(dProdsWithCost);

      // Combos with cost
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
            const dp = dProdsWithCost.find(d => d.id === item.item_id);
            if (dp) custo += dp.custo * item.quantidade;
          } else if (item.tipo === 'materia_prima') {
            const mp = materiasList.find(m => m.id === item.item_id);
            if (mp) {
              if (mp.unidade_medida === 'un') custo += mp.preco_por_kg * item.quantidade;
              else custo += (mp.preco_por_kg / 1000) * item.quantidade;
            }
          } else if (item.tipo === 'embalagem') {
            const emb = embalagensList.find(e => e.id === item.item_id);
            if (emb) custo += emb.preco_unitario * item.quantidade;
          } else if (item.tipo === 'preparo') {
            const prep = preparosList.find(p => p.id === item.item_id);
            if (prep) custo += (prep.custo_por_kg / 1000) * item.quantidade;
          } else if (item.tipo === 'adicional') {
            const add = adicionaisList.find(a => a.id === item.item_id);
            if (add) custo += add.custo * item.quantidade;
          }
        }
        combosWithCost.push({ ...combo, itens, custo });
      }
      setCombos(combosWithCost);

      setAllMaterias(materiasList);
      setAllEmbalagens(embalagensList);
      setAllPreparos(preparosList);
      setAllAdicionaisRef(adicionaisList);
      setAdicionais(adicionaisList);
    } catch (e) {
      console.warn('DeliveryHub loadAllData error', e);
    } finally {
      setLoading(false);
    }
  }

  // ══════════════════════════════════════════════════════════
  // PLATAFORMAS ACTIONS
  // ══════════════════════════════════════════════════════════
  async function updatePlatform(id, field, value) {
    const db = await getDatabase();
    await db.runAsync(`UPDATE delivery_config SET ${field} = ? WHERE id = ?`, [value, id]);
    setPlataformas(prev => prev.map(p => (p.id === id ? { ...p, [field]: value } : p)));
  }

  async function togglePlatform(id, currentValue) {
    await updatePlatform(id, 'ativo', currentValue ? 0 : 1);
  }

  async function adicionarPlataforma() {
    if (!novaPlataforma.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?, ?, ?, ?, ?, ?)',
      [novaPlataforma.trim(), 0, 0, 0, 0, 1]
    );
    setNovaPlataforma('');
    loadAllData();
  }

  function removerPlataforma(id, nome) {
    setConfirmRemove({
      id, nome, tipo: 'plataforma',
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_config WHERE id = ?', [id]);
        if (expandedPlatId === id) setExpandedPlatId(null);
        setConfirmRemove(null);
        loadAllData();
      },
    });
  }

  // ══════════════════════════════════════════════════════════
  // CARDÁPIO ACTIONS (inline delivery price edit)
  // ══════════════════════════════════════════════════════════
  async function updateProdutoPrecoVenda(id, preco) {
    const db = await getDatabase();
    await db.runAsync('UPDATE produtos SET preco_venda = ? WHERE id = ?', [preco, id]);
    setProdutos(prev => prev.map(p => (p.id === id ? { ...p, precoVenda: preco } : p)));
  }

  async function copiarPrecosBalcao() {
    // Preço de venda is already precoVenda - nothing to copy from another field
    // This button simply refreshes
    loadAllData();
  }

  // ══════════════════════════════════════════════════════════
  // COMBOS ACTIONS
  // ══════════════════════════════════════════════════════════
  function getItemCusto(tipo, item) {
    if (tipo === 'produto') return item.custoUnitario || 0;
    if (tipo === 'delivery_produto') return item.custo || 0;
    if (tipo === 'materia_prima') {
      if (item.unidade_medida === 'un') return item.preco_por_kg || 0;
      return (item.preco_por_kg || 0) / 1000;
    }
    if (tipo === 'embalagem') return item.preco_unitario || 0;
    if (tipo === 'preparo') return (item.custo_por_kg || 0) / 1000;
    if (tipo === 'adicional') return item.custo || 0;
    return 0;
  }

  function abrirCriarCombo() {
    setEditingCombo(null);
    setNovoCombo({ nome: '', preco_venda: '', itens: [] });
    setBuscaItemCombo('');
    setShowComboModal(true);
  }

  function abrirEditarCombo(combo) {
    setEditingCombo(combo);
    const itensComNome = (combo.itens || []).map(item => {
      let nome = '', custoUnit = 0;
      if (item.tipo === 'produto') {
        const p = allProdutos.find(x => x.id === item.item_id);
        nome = p ? p.nome : 'Produto'; custoUnit = p ? p.custoUnitario : 0;
      } else if (item.tipo === 'delivery_produto') {
        const dp = deliveryProdutos.find(x => x.id === item.item_id);
        nome = dp ? dp.nome : 'Delivery'; custoUnit = dp ? dp.custo : 0;
      } else if (item.tipo === 'materia_prima') {
        const mp = allMaterias.find(x => x.id === item.item_id);
        nome = mp ? mp.nome : 'Insumo';
        custoUnit = mp ? (mp.unidade_medida === 'un' ? mp.preco_por_kg : mp.preco_por_kg / 1000) : 0;
      } else if (item.tipo === 'embalagem') {
        const e = allEmbalagens.find(x => x.id === item.item_id);
        nome = e ? e.nome : 'Embalagem'; custoUnit = e ? e.preco_unitario : 0;
      } else if (item.tipo === 'preparo') {
        const p = allPreparos.find(x => x.id === item.item_id);
        nome = p ? p.nome : 'Preparo'; custoUnit = p ? (p.custo_por_kg / 1000) : 0;
      } else if (item.tipo === 'adicional') {
        const a = allAdicionaisRef.find(x => x.id === item.item_id);
        nome = a ? a.nome : 'Adicional'; custoUnit = a ? a.custo : 0;
      }
      return { tipo: item.tipo, item_id: item.item_id, quantidade: item.quantidade, nome, custoUnit };
    });
    setNovoCombo({
      nome: combo.nome,
      preco_venda: String(combo.preco_venda || '').replace('.', ','),
      itens: itensComNome,
    });
    setBuscaItemCombo('');
    setShowComboModal(true);
  }

  function adicionarItemAoCombo(tipo, item) {
    const custoUnit = getItemCusto(tipo, item);
    setNovoCombo(prev => ({
      ...prev,
      itens: [...prev.itens, { tipo, item_id: item.id, quantidade: 1, nome: item.nome, custoUnit }],
    }));
  }

  function removerItemDoCombo(index) {
    setNovoCombo(prev => ({ ...prev, itens: prev.itens.filter((_, i) => i !== index) }));
  }

  function alterarQuantidadeItem(index, val) {
    setNovoCombo(prev => ({
      ...prev,
      itens: prev.itens.map((it, i) => i === index ? { ...it, quantidade: parseFloat(val) || 1 } : it),
    }));
  }

  async function salvarCombo() {
    if (!novoCombo.nome.trim() || novoCombo.itens.length === 0) return;
    const db = await getDatabase();

    if (editingCombo) {
      await db.runAsync('UPDATE delivery_combos SET nome = ?, preco_venda = ? WHERE id = ?',
        [novoCombo.nome.trim(), parseInputValue(novoCombo.preco_venda), editingCombo.id]);
      await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [editingCombo.id]);
      for (const item of novoCombo.itens) {
        await db.runAsync(
          'INSERT INTO delivery_combo_itens (combo_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
          [editingCombo.id, item.tipo, item.item_id, item.quantidade]
        );
      }
    } else {
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
    }
    setShowComboModal(false);
    setEditingCombo(null);
    setNovoCombo({ nome: '', preco_venda: '', itens: [] });
    loadAllData();
  }

  function removerCombo(id, nome) {
    setConfirmRemove({
      id, nome, tipo: 'combo',
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_combo_itens WHERE combo_id = ?', [id]);
        await db.runAsync('DELETE FROM delivery_combos WHERE id = ?', [id]);
        setConfirmRemove(null);
        loadAllData();
      },
    });
  }

  // ══════════════════════════════════════════════════════════
  // ADICIONAIS ACTIONS
  // ══════════════════════════════════════════════════════════
  async function adicionarAdicional() {
    if (!novoAdicional.nome.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_adicionais (nome, custo, preco_cobrado) VALUES (?, ?, ?)',
      [novoAdicional.nome.trim(), parseInputValue(novoAdicional.custo), parseInputValue(novoAdicional.preco_cobrado)]
    );
    setNovoAdicional({ nome: '', custo: '', preco_cobrado: '' });
    loadAllData();
  }

  function iniciarEdicaoAdd(add) {
    setEditingAddId(add.id);
    setEditAddValues({
      nome: add.nome,
      custo: add.custo > 0 ? String(add.custo).replace('.', ',') : '',
      preco_cobrado: add.preco_cobrado > 0 ? String(add.preco_cobrado).replace('.', ',') : '',
    });
  }

  async function salvarEdicaoAdd() {
    if (!editAddValues.nome.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE delivery_adicionais SET nome = ?, custo = ?, preco_cobrado = ? WHERE id = ?',
      [editAddValues.nome.trim(), parseInputValue(editAddValues.custo), parseInputValue(editAddValues.preco_cobrado), editingAddId]
    );
    setEditingAddId(null);
    setEditAddValues({ nome: '', custo: '', preco_cobrado: '' });
    loadAllData();
  }

  function removerAdicional(id, nome) {
    setConfirmRemove({
      id, nome, tipo: 'adicional',
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_adicionais WHERE id = ?', [id]);
        setConfirmRemove(null);
        setEditingAddId(null);
        loadAllData();
      },
    });
  }

  // ══════════════════════════════════════════════════════════
  // RENDER TAB: PLATAFORMAS
  // ══════════════════════════════════════════════════════════
  function renderPlataformas() {
    const ativas = plataformas.filter(p => p.ativo === 1).length;
    const inativas = plataformas.length - ativas;

    return (
      <>
        {/* Status chips */}
        <View style={styles.statusRow}>
          <View style={[styles.statusChip, { backgroundColor: colors.success + '15' }]}>
            <View style={[styles.statusDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.statusChipText, { color: colors.success }]}>{ativas} ativa{ativas !== 1 ? 's' : ''}</Text>
          </View>
          {inativas > 0 && (
            <View style={[styles.statusChip, { backgroundColor: colors.disabled + '30' }]}>
              <View style={[styles.statusDot, { backgroundColor: colors.disabled }]} />
              <Text style={[styles.statusChipText, { color: colors.textSecondary }]}>{inativas} inativa{inativas !== 1 ? 's' : ''}</Text>
            </View>
          )}
        </View>

        {plataformas.map((plat, index) => {
          const isExpanded = expandedPlatId === plat.id;
          const isActive = plat.ativo === 1;
          const platformStyle = getPlatformStyle(plat.plataforma);
          const avatarColor = platformStyle ? platformStyle.color : getPlatformColor(index);
          const inicial = (plat.plataforma || '?').charAt(0).toUpperCase();

          return (
            <View key={plat.id} style={[styles.platformItem, !isActive && styles.platformInactive]}>
              <TouchableOpacity
                style={styles.platformHeader}
                onPress={() => setExpandedPlatId(isExpanded ? null : plat.id)}
                activeOpacity={0.7}
              >
                <View style={styles.platformHeaderLeft}>
                  <View style={[styles.avatar, { backgroundColor: avatarColor + '18' }]}>
                    {platformStyle ? (
                      platformStyle.iconSet === 'material' ? (
                        <MaterialCommunityIcons name={platformStyle.icon} size={20} color={avatarColor} />
                      ) : (
                        <Feather name={platformStyle.icon} size={18} color={avatarColor} />
                      )
                    ) : (
                      <Text style={[styles.avatarText, { color: avatarColor }]}>{inicial}</Text>
                    )}
                  </View>
                  <View style={styles.platformInfo}>
                    <View style={styles.platformNameRow}>
                      <Text style={[styles.platformName, !isActive && { color: colors.disabled }]} numberOfLines={1}>
                        {plat.plataforma}
                      </Text>
                      {plat.taxa_plataforma > 0 && (
                        <View style={[styles.taxaBadge, !isActive && { backgroundColor: colors.disabled }]}>
                          <Text style={styles.taxaBadgeText}>{plat.taxa_plataforma}%</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.statusIndicatorRow}>
                      <View style={[styles.statusIndicatorDot, { backgroundColor: isActive ? colors.success : colors.disabled }]} />
                      <Text style={[styles.statusIndicatorText, { color: isActive ? colors.success : colors.disabled }]}>
                        {isActive ? 'Ativa' : 'Inativa'}
                      </Text>
                    </View>
                  </View>
                  <Feather
                    name={isExpanded ? 'chevron-down' : 'chevron-right'}
                    size={14}
                    color={colors.disabled}
                    style={{ marginRight: spacing.sm }}
                  />
                </View>
                <Switch
                  value={isActive}
                  onValueChange={() => togglePlatform(plat.id, plat.ativo)}
                  trackColor={{ false: colors.disabled, true: colors.primaryLight }}
                  thumbColor={isActive ? colors.primary : '#f4f3f4'}
                />
              </TouchableOpacity>

              {isExpanded && (
                <View style={styles.platformFields}>
                  <InputField
                    label="Taxa da Plataforma (%)"
                    value={plat.taxa_plataforma > 0 ? String(plat.taxa_plataforma) : ''}
                    onChangeText={(val) => updatePlatform(plat.id, 'taxa_plataforma', parseInputValue(val))}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                  <InputField
                    label="Taxa de Entrega (R$ por pedido)"
                    value={plat.taxa_entrega > 0 ? String(plat.taxa_entrega) : ''}
                    onChangeText={(val) => updatePlatform(plat.id, 'taxa_entrega', parseInputValue(val))}
                    keyboardType="numeric"
                    placeholder="0,00"
                  />
                  <InputField
                    label="Comissão do App (R$ por pedido)"
                    value={plat.comissao_app > 0 ? String(plat.comissao_app) : ''}
                    onChangeText={(val) => updatePlatform(plat.id, 'comissao_app', parseInputValue(val))}
                    keyboardType="numeric"
                    placeholder="0,00"
                  />
                  <InputField
                    label="Descontos e Promoções (%)"
                    value={plat.desconto_promocao > 0 ? String(plat.desconto_promocao) : ''}
                    onChangeText={(val) => updatePlatform(plat.id, 'desconto_promocao', parseInputValue(val))}
                    keyboardType="numeric"
                    placeholder="0"
                    style={{ marginBottom: spacing.xs }}
                  />
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removerPlataforma(plat.id, plat.plataforma)}
                    activeOpacity={0.6}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={13} color={colors.disabled} />
                    <Text style={styles.removeBtnText}>Remover</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}

        {/* Add new platform */}
        <View style={styles.addPlatRow}>
          <InputField
            style={{ flex: 1, marginRight: spacing.sm, marginBottom: 0 }}
            value={novaPlataforma}
            onChangeText={setNovaPlataforma}
            placeholder="Nome da plataforma"
          />
          <TouchableOpacity style={styles.addPlatBtn} onPress={adicionarPlataforma}>
            <Feather name="plus" size={20} color={colors.textLight} />
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER TAB: CARDÁPIO
  // ══════════════════════════════════════════════════════════
  function renderCardapio() {
    const termo = normalizeSearch(buscaProd.trim());
    const filtered = termo
      ? produtos.filter(p => normalizeSearch(p.nome).includes(termo))
      : produtos;

    return (
      <>
        <SearchBar value={buscaProd} onChangeText={setBuscaProd} placeholder="Buscar produto..." />

        {filtered.length === 0 ? (
          <EmptyState
            icon={buscaProd.trim() ? 'search' : 'package'}
            title={buscaProd.trim() ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'}
            description={buscaProd.trim()
              ? 'Tente buscar com outro termo.'
              : 'Cadastre produtos na tela de Produtos para vê-los aqui.'}
          />
        ) : (
          <Card>
            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, { flex: 1 }]}>Produto</Text>
              <Text style={[styles.tableHeaderText, { width: 80, textAlign: 'right' }]}>Custo</Text>
              <Text style={[styles.tableHeaderText, { width: 90, textAlign: 'right' }]}>Preço</Text>
              <Text style={[styles.tableHeaderText, { width: 50, textAlign: 'right' }]}>Margem</Text>
            </View>

            {filtered.map((prod, index) => {
              const margem = prod.precoVenda > 0
                ? ((prod.precoVenda - prod.custoUnitario) / prod.precoVenda) * 100
                : 0;
              const margemPositiva = margem >= 0;

              return (
                <View key={prod.id} style={[
                  styles.tableRow,
                  index < filtered.length - 1 && styles.tableRowBorder,
                ]}>
                  <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>{prod.nome}</Text>
                  <Text style={[styles.tableCellSecondary, { width: 80, textAlign: 'right' }]}>
                    {formatCurrency(prod.custoUnitario)}
                  </Text>
                  <View style={{ width: 90, alignItems: 'flex-end' }}>
                    <Text style={[styles.tableCellPrice, { color: colors.primary }]}>
                      {formatCurrency(prod.precoVenda)}
                    </Text>
                  </View>
                  <View style={{ width: 50, alignItems: 'flex-end' }}>
                    <View style={[styles.margemBadge, { backgroundColor: (margemPositiva ? colors.success : colors.error) + '12' }]}>
                      <Text style={[styles.margemBadgeText, { color: margemPositiva ? colors.success : colors.error }]}>
                        {margem.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </Card>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER TAB: COMBOS
  // ══════════════════════════════════════════════════════════
  function renderCombos() {
    const termo = normalizeSearch(buscaCombo.trim());
    const filtered = termo
      ? combos.filter(c => normalizeSearch(c.nome).includes(termo))
      : combos;

    return (
      <>
        <SearchBar value={buscaCombo} onChangeText={setBuscaCombo} placeholder="Buscar combo..." />

        {filtered.length === 0 ? (
          <EmptyState
            icon={buscaCombo.trim() ? 'search' : 'layers'}
            title={buscaCombo.trim() ? 'Nenhum combo encontrado' : 'Nenhum combo criado'}
            description={buscaCombo.trim()
              ? `Sem resultados para "${buscaCombo}".`
              : 'Monte combos agrupando seus produtos com preço especial.'}
            ctaLabel={!buscaCombo.trim() ? 'Criar primeiro combo' : undefined}
            onPress={!buscaCombo.trim() ? abrirCriarCombo : undefined}
          />
        ) : (
          <Card>
            {filtered.map((combo, index) => {
              const margem = combo.preco_venda > 0 ? ((combo.preco_venda - combo.custo) / combo.preco_venda) * 100 : 0;
              const margemPositiva = margem >= 0;
              const comboColor = getAvatarColor(index);
              const inicial = (combo.nome || '?').charAt(0).toUpperCase();
              const itemCount = combo.itens ? combo.itens.length : 0;

              return (
                <TouchableOpacity
                  key={combo.id}
                  style={[
                    styles.comboRow,
                    index < filtered.length - 1 && styles.tableRowBorder,
                  ]}
                  onPress={() => abrirEditarCombo(combo)}
                  activeOpacity={0.6}
                >
                  <View style={[styles.avatar, { backgroundColor: comboColor + '18' }]}>
                    <Text style={[styles.avatarText, { color: comboColor }]}>{inicial}</Text>
                  </View>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={styles.comboNome} numberOfLines={1}>{combo.nome}</Text>
                    <Text style={styles.comboMeta}>
                      {itemCount} {itemCount === 1 ? 'item' : 'itens'} · Custo: {formatCurrency(combo.custo)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                    <Text style={styles.comboPreco}>{formatCurrency(combo.preco_venda)}</Text>
                    <View style={[styles.margemBadge, { backgroundColor: (margemPositiva ? colors.success : colors.error) + '12' }]}>
                      <Text style={[styles.margemBadgeText, { color: margemPositiva ? colors.success : colors.error }]}>
                        {margem.toFixed(0)}%
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => removerCombo(combo.id, combo.nome)}
                    style={{ padding: 8 }}
                    hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                  >
                    <Feather name="trash-2" size={13} color={colors.disabled} />
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity style={styles.createBtn} onPress={abrirCriarCombo}>
              <Feather name="plus" size={14} color="#fff" style={{ marginRight: 4 }} />
              <Text style={styles.createBtnText}>Criar Combo</Text>
            </TouchableOpacity>
          </Card>
        )}
      </>
    );
  }

  // ══════════════════════════════════════════════════════════
  // RENDER TAB: ADICIONAIS
  // ══════════════════════════════════════════════════════════
  function renderAdicionais() {
    return (
      <Card>
        {adicionais.length === 0 ? (
          <EmptyState
            icon="plus-circle"
            title="Nenhum adicional cadastrado"
            description="Cadastre itens extras como sachês, molhos e talheres."
          />
        ) : (
          adicionais.map((add) => {
            const isEditing = editingAddId === add.id;
            const lucro = add.preco_cobrado - add.custo;
            const margem = add.preco_cobrado > 0 ? (lucro / add.preco_cobrado) * 100 : 0;

            if (isEditing) {
              return (
                <View key={add.id} style={styles.editAddRow}>
                  <InputField
                    value={editAddValues.nome}
                    onChangeText={(val) => setEditAddValues(prev => ({ ...prev, nome: val }))}
                    placeholder="Nome"
                    style={{ marginBottom: spacing.xs }}
                  />
                  <View style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
                    <InputField
                      placeholder="Custo (R$)"
                      value={editAddValues.custo}
                      onChangeText={(val) => setEditAddValues(prev => ({ ...prev, custo: val }))}
                      keyboardType="numeric"
                      style={{ flex: 1, marginRight: spacing.xs, marginBottom: 0 }}
                    />
                    <InputField
                      placeholder="Preço (R$)"
                      value={editAddValues.preco_cobrado}
                      onChangeText={(val) => setEditAddValues(prev => ({ ...prev, preco_cobrado: val }))}
                      keyboardType="numeric"
                      style={{ flex: 1, marginLeft: spacing.xs, marginBottom: 0 }}
                    />
                  </View>
                  <View style={styles.editAddActions}>
                    <TouchableOpacity onPress={() => removerAdicional(add.id, add.nome)} style={{ paddingVertical: spacing.xs, paddingHorizontal: spacing.sm }}>
                      <Text style={{ color: colors.error, fontSize: fonts.tiny, fontWeight: '600' }}>Remover</Text>
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row' }}>
                      <TouchableOpacity
                        onPress={() => { setEditingAddId(null); setEditAddValues({ nome: '', custo: '', preco_cobrado: '' }); }}
                        style={styles.editAddCancelBtn}
                      >
                        <Feather name="x" size={14} color={colors.text} />
                      </TouchableOpacity>
                      <TouchableOpacity onPress={salvarEdicaoAdd} style={styles.editAddSaveBtn}>
                        <Feather name="check" size={14} color={colors.textLight} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }

            return (
              <TouchableOpacity
                key={add.id}
                style={styles.addItemRow}
                onPress={() => iniciarEdicaoAdd(add)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.addItemName} numberOfLines={1}>{add.nome}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.addItemMeta}>Custo: {formatCurrency(add.custo)}</Text>
                    <Text style={styles.addItemMetaSep}> · </Text>
                    <Text style={styles.addItemMeta}>Preço: {formatCurrency(add.preco_cobrado)}</Text>
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end', marginRight: spacing.sm }}>
                  <Text style={[styles.addItemLucro, { color: lucro >= 0 ? colors.success : colors.error }]}>
                    {formatCurrency(lucro)}
                  </Text>
                  <Text style={{ fontSize: fonts.tiny, color: lucro >= 0 ? colors.success : colors.error }}>
                    {margem.toFixed(0)}%
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => removerAdicional(add.id, add.nome)}
                  style={{ padding: spacing.xs }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="trash-2" size={13} color={colors.disabled} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })
        )}

        {/* Add form */}
        <View style={styles.addAddForm}>
          <Text style={styles.addAddFormTitle}>Adicionar</Text>
          <InputField
            placeholder="Nome do adicional"
            value={novoAdicional.nome}
            onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, nome: val }))}
            style={{ marginBottom: spacing.xs }}
          />
          <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
            <InputField
              placeholder="Custo (R$)"
              value={novoAdicional.custo}
              onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, custo: val }))}
              keyboardType="numeric"
              style={{ flex: 1, marginRight: spacing.xs, marginBottom: 0 }}
            />
            <InputField
              placeholder="Preço cobrado (R$)"
              value={novoAdicional.preco_cobrado}
              onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, preco_cobrado: val }))}
              keyboardType="numeric"
              style={{ flex: 1, marginRight: spacing.xs, marginBottom: 0 }}
            />
            <TouchableOpacity style={styles.addPlatBtn} onPress={adicionarAdicional}>
              <Feather name="plus" size={20} color={colors.textLight} />
            </TouchableOpacity>
          </View>
        </View>
      </Card>
    );
  }

  // ══════════════════════════════════════════════════════════
  // COMBO MODAL
  // ══════════════════════════════════════════════════════════
  function renderComboModal() {
    const custoTotal = novoCombo.itens.reduce((acc, item) => acc + (item.custoUnit || 0) * item.quantidade, 0);
    const precoVendaModal = parseInputValue(novoCombo.preco_venda);
    const margemModal = precoVendaModal > 0 ? ((precoVendaModal - custoTotal) / precoVendaModal) * 100 : 0;
    const isEditingCombo = editingCombo !== null;

    const comboSections = [
      { key: 'produto',          label: 'Produtos',  items: allProdutos,      icon: 'package',      color: colors.purple },
      { key: 'delivery_produto', label: 'Delivery',   items: deliveryProdutos, icon: 'truck',        color: colors.coral },
      { key: 'embalagem',        label: 'Embalagens', items: allEmbalagens,    icon: 'box',          color: colors.yellow },
      { key: 'preparo',          label: 'Preparos',   items: allPreparos,      icon: 'layers',       color: colors.accent },
      { key: 'materia_prima',    label: 'Insumos',    items: allMaterias,      icon: 'shopping-bag', color: colors.primary },
      { key: 'adicional',        label: 'Adicionais', items: allAdicionaisRef, icon: 'plus-circle',  color: colors.info },
    ];

    return (
      <Modal visible={showComboModal && isFocused} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowComboModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.modalHeader}>
                <Feather name="layers" size={18} color={colors.primary} />
                <Text style={styles.modalTitle}>{isEditingCombo ? 'Editar Combo' : 'Criar Combo'}</Text>
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

              {/* Cost + margin summary */}
              {novoCombo.itens.length > 0 && (
                <View style={styles.comboSummary}>
                  <Text style={styles.comboSummaryText}>Custo: {formatCurrency(custoTotal)}</Text>
                  <Text style={styles.comboSummaryText}> · </Text>
                  <Text style={[styles.comboSummaryText, { color: margemModal >= 0 ? colors.success : colors.error, fontWeight: '700' }]}>
                    Margem: {margemModal.toFixed(0)}%
                  </Text>
                </View>
              )}

              {/* Items list */}
              <Text style={styles.modalSubtitle}>Itens do combo ({novoCombo.itens.length})</Text>
              {novoCombo.itens.length === 0 && (
                <Text style={styles.modalEmptyText}>Nenhum item adicionado.</Text>
              )}
              {novoCombo.itens.map((item, index) => {
                const badgeInfo = getTipoBadgeInfo(item.tipo);
                return (
                  <View key={index} style={styles.modalItem}>
                    <View style={[styles.modalItemIcon, { backgroundColor: badgeInfo.color + '12' }]}>
                      <Feather name={badgeInfo.icon} size={12} color={badgeInfo.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalItemName} numberOfLines={1}>{item.nome}</Text>
                      <View style={[styles.tipoBadge, { backgroundColor: badgeInfo.color + '12' }]}>
                        <Text style={[styles.tipoBadgeText, { color: badgeInfo.color }]}>{badgeInfo.label}</Text>
                      </View>
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
                      style={{ padding: 8 }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={13} color={colors.disabled} />
                    </TouchableOpacity>
                  </View>
                );
              })}

              {/* Add items search */}
              <Text style={[styles.modalSubtitle, { marginTop: spacing.md }]}>Adicionar Itens</Text>
              <SearchBar
                value={buscaItemCombo}
                onChangeText={setBuscaItemCombo}
                placeholder="Buscar produto, embalagem, preparo..."
              />

              {comboSections.map(section => {
                const termoItem = normalizeSearch(buscaItemCombo.trim());
                const sectionFiltered = section.items.filter(i =>
                  !termoItem || normalizeSearch(i.nome).includes(termoItem)
                );
                if (sectionFiltered.length === 0) return null;
                return (
                  <View key={section.key}>
                    <View style={styles.modalSectionHeader}>
                      <View style={[styles.modalSectionDot, { backgroundColor: section.color }]} />
                      <Feather name={section.icon} size={12} color={section.color} style={{ marginRight: 4 }} />
                      <Text style={[styles.modalCatLabel, { color: section.color }]}>{section.label}</Text>
                    </View>
                    <View style={styles.modalItemList}>
                      {sectionFiltered.slice(0, 10).map(item => (
                        <TouchableOpacity
                          key={`${section.key}-${item.id}`}
                          style={styles.modalAddItem}
                          onPress={() => adicionarItemAoCombo(section.key, item)}
                        >
                          <Feather name="plus" size={10} color={colors.primary} style={{ marginRight: 3 }} />
                          <Text style={styles.modalAddItemText} numberOfLines={1}>{item.nome}</Text>
                        </TouchableOpacity>
                      ))}
                      {sectionFiltered.length > 10 && (
                        <Text style={styles.modalMoreText}>+{sectionFiltered.length - 10} mais</Text>
                      )}
                    </View>
                  </View>
                );
              })}

              {/* Actions */}
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowComboModal(false)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarCombo}>
                  <Feather name="check" size={14} color="#fff" style={{ marginRight: 4 }} />
                  <Text style={styles.modalSaveText}>{isEditingCombo ? 'Atualizar' : 'Salvar'}</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  }

  // ══════════════════════════════════════════════════════════
  // MAIN RENDER
  // ══════════════════════════════════════════════════════════
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Tab bar */}
      <View style={[styles.headerBar, isDesktop && styles.headerBarDesktop]}>
        <View style={[styles.headerInner, isDesktop && styles.headerInnerDesktop]}>
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
                  onPress={() => setActiveTab(tab.key)}
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
        </View>
      </View>

      {/* Tab content */}
      <ScrollView
        style={styles.scrollArea}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
      >
        {activeTab === 'plataformas' && renderPlataformas()}
        {activeTab === 'cardapio' && renderCardapio()}
        {activeTab === 'combos' && renderCombos()}
        {activeTab === 'adicionais' && renderAdicionais()}
      </ScrollView>

      {/* Modals */}
      {renderComboModal()}

      <ConfirmDeleteModal
        visible={!!confirmRemove}
        isFocused={isFocused}
        titulo={
          confirmRemove?.tipo === 'plataforma' ? 'Remover Plataforma'
            : confirmRemove?.tipo === 'combo' ? 'Remover Combo'
            : 'Remover Adicional'
        }
        nome={confirmRemove?.nome}
        onConfirm={confirmRemove?.onConfirm}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remover"
      />
    </View>
  );
}

// ══════════════════════════════════════════════════════════
// STYLES
// ══════════════════════════════════════════════════════════
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // ── Header / Tabs ──
  headerBar: {
    backgroundColor: colors.surface,
    paddingTop: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerBarDesktop: {
    paddingHorizontal: 0,
  },
  headerInner: {},
  headerInnerDesktop: {
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xs,
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

  // ── Scroll area ──
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.md,
    paddingBottom: 40,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },

  // ── Plataformas ──
  statusRow: { flexDirection: 'row', marginBottom: spacing.md },
  statusChip: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    marginRight: spacing.sm,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusChipText: {
    fontSize: fonts.tiny, fontWeight: '600', fontFamily: fontFamily.semiBold,
  },
  platformItem: {
    borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md,
    marginBottom: spacing.sm, overflow: 'hidden', backgroundColor: colors.surface,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  platformInactive: { opacity: 0.6 },
  platformHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: spacing.sm + 2, paddingLeft: spacing.sm + 2, paddingRight: spacing.sm,
    backgroundColor: colors.inputBg,
  },
  platformHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm,
  },
  avatarText: { fontSize: 15, fontFamily: fontFamily.bold, fontWeight: '700' },
  platformInfo: { flex: 1, marginRight: spacing.xs },
  platformNameRow: { flexDirection: 'row', alignItems: 'center' },
  platformName: {
    fontSize: fonts.regular, fontWeight: '600', color: colors.text, fontFamily: fontFamily.semiBold,
  },
  taxaBadge: {
    backgroundColor: colors.primary, borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, marginLeft: spacing.xs, overflow: 'hidden',
  },
  taxaBadgeText: { fontSize: 10, color: colors.textLight, fontWeight: '700', fontFamily: fontFamily.bold },
  statusIndicatorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  statusIndicatorDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
  statusIndicatorText: { fontSize: 10, fontFamily: fontFamily.medium, fontWeight: '500' },
  platformFields: {
    padding: spacing.sm + 2, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: '#FFFFFF',
  },
  removeBtn: {
    alignSelf: 'flex-end', flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm, gap: 5,
  },
  removeBtnText: {
    color: colors.disabled, fontSize: fonts.small, fontWeight: '600', fontFamily: fontFamily.semiBold,
  },
  addPlatRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.sm },
  addPlatBtn: {
    backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20,
    justifyContent: 'center', alignItems: 'center',
  },

  // ── Cardápio (table) ──
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  tableHeaderText: {
    fontSize: 10, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
  },
  tableRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  tableCell: {
    fontSize: 13, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text,
  },
  tableCellSecondary: {
    fontSize: 12, fontFamily: fontFamily.regular, color: colors.textSecondary,
  },
  tableCellPrice: {
    fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  margemBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: 6, marginTop: 2,
  },
  margemBadgeText: {
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // ── Combos ──
  comboRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingLeft: spacing.sm + 2, paddingRight: 4,
  },
  comboNome: {
    fontSize: 14, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text,
  },
  comboMeta: {
    fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 1,
  },
  comboPreco: {
    fontSize: 14, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primary,
  },
  createBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, alignItems: 'center', marginTop: spacing.md,
    flexDirection: 'row', justifyContent: 'center',
  },
  createBtnText: {
    color: colors.textLight, fontFamily: fontFamily.bold, fontWeight: '700', fontSize: fonts.small,
  },

  // ── Adicionais ──
  addItemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  addItemName: { fontSize: fonts.small, fontWeight: '600', color: colors.text, marginBottom: 2 },
  addItemMeta: { fontSize: fonts.tiny, color: colors.textSecondary },
  addItemMetaSep: { fontSize: fonts.tiny, color: colors.disabled },
  addItemLucro: { fontSize: fonts.small, fontWeight: '700' },
  editAddRow: {
    backgroundColor: '#FFFDE7', borderWidth: 1, borderColor: '#FFF176',
    borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: 1,
  },
  editAddActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editAddCancelBtn: {
    backgroundColor: colors.border, borderRadius: borderRadius.sm,
    width: 34, height: 34, justifyContent: 'center', alignItems: 'center', marginRight: spacing.xs,
  },
  editAddSaveBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    width: 34, height: 34, justifyContent: 'center', alignItems: 'center',
  },
  addAddForm: {
    marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm,
  },
  addAddFormTitle: {
    fontSize: fonts.small, fontWeight: '700', color: colors.text, marginBottom: spacing.xs,
  },

  // ── Combo Modal ──
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
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text,
  },
  modalSubtitle: {
    fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs,
  },
  modalEmptyText: {
    textAlign: 'center', color: colors.textSecondary,
    fontSize: fonts.small, fontFamily: fontFamily.regular, paddingVertical: spacing.sm,
  },
  comboSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xs, marginBottom: spacing.xs,
  },
  comboSummaryText: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.textSecondary,
  },
  modalItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs + 2,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  modalItemIcon: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: 'center', justifyContent: 'center', marginRight: spacing.xs + 2,
  },
  modalItemName: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold,
    fontWeight: '600', color: colors.text, marginBottom: 1,
  },
  modalItemCusto: {
    fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, marginRight: spacing.xs,
  },
  tipoBadge: {
    paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4,
    alignSelf: 'flex-start', overflow: 'hidden',
  },
  tipoBadgeText: {
    fontSize: 9, fontFamily: fontFamily.bold, fontWeight: '700',
  },

  // Modal add items
  modalSectionHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: 2,
  },
  modalSectionDot: { width: 6, height: 6, borderRadius: 3, marginRight: 4 },
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
    fontSize: fonts.tiny, fontFamily: fontFamily.semiBold, color: colors.primary, fontWeight: '600',
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
    borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.textSecondary, fontFamily: fontFamily.semiBold, fontWeight: '600', fontSize: fonts.regular,
  },
  modalSaveBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: {
    color: colors.textLight, fontFamily: fontFamily.bold, fontWeight: '700', fontSize: fonts.regular,
  },
});
