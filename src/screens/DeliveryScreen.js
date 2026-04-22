import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Switch, Modal } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import InputField from '../components/InputField';
import InfoTooltip from '../components/InfoTooltip';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { formatCurrency, converterParaBase, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';

const DEFAULT_PLATFORMS = [
  { plataforma: 'iFood', taxa_plataforma: 27, taxa_entrega: 0, embalagem_extra: 0, ativo: 1 },
  { plataforma: 'Rappi', taxa_plataforma: 25, taxa_entrega: 0, embalagem_extra: 0, ativo: 1 },
  { plataforma: '99Food', taxa_plataforma: 20, taxa_entrega: 0, embalagem_extra: 0, ativo: 1 },
  { plataforma: 'Uber Eats', taxa_plataforma: 30, taxa_entrega: 0, embalagem_extra: 0, ativo: 1 },
  { plataforma: 'Venda Direta', taxa_plataforma: 0, taxa_entrega: 5, embalagem_extra: 0, ativo: 1 },
];

function roundUpTo50(value) {
  return Math.ceil(value * 2) / 2;
}

export default function DeliveryScreen() {
  const isFocused = useIsFocused();
  const [plataformas, setPlataformas] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [produtos, setProdutos] = useState([]);
  const [novaPlataforma, setNovaPlataforma] = useState('');
  const [confirmRemove, setConfirmRemove] = useState(null);

  // Adicionais
  const [adicionais, setAdicionais] = useState([]);
  const [novoAdicional, setNovoAdicional] = useState({ nome: '', custo: '', preco_cobrado: '' });

  // Produtos Delivery
  const [deliveryProdutos, setDeliveryProdutos] = useState([]);
  const [showProdutoModal, setShowProdutoModal] = useState(false);
  const [novoProdutoDelivery, setNovoProdutoDelivery] = useState({ nome: '', preco_venda: '', itens: [] });
  const [allProdutos, setAllProdutos] = useState([]);
  const [allPreparos, setAllPreparos] = useState([]);
  const [allEmbalagens, setAllEmbalagens] = useState([]);
  const [allMaterias, setAllMaterias] = useState([]);

  // Combos
  const [combos, setCombos] = useState([]);
  const [showComboModal, setShowComboModal] = useState(false);
  const [novoCombo, setNovoCombo] = useState({ nome: '', preco_venda: '', itens: [] });

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => setConfirmRemove(null);
    }, [])
  );

  async function loadData() {
    const db = await getDatabase();

    // Load or seed platforms
    let plats = await db.getAllAsync('SELECT * FROM delivery_config ORDER BY id');
    if (plats.length === 0) {
      for (const p of DEFAULT_PLATFORMS) {
        await db.runAsync(
          'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, embalagem_extra, ativo) VALUES (?, ?, ?, ?, ?)',
          [p.plataforma, p.taxa_plataforma, p.taxa_entrega, p.embalagem_extra, p.ativo]
        );
      }
      plats = await db.getAllAsync('SELECT * FROM delivery_config ORDER BY id');
    }
    setPlataformas(plats);

    // Load products with costs + all related data in parallel
    const [prods, allIngs, allPreps, allEmbs, preparosList, embalagensList, materiasList,
           adds, dProds, allDProdItens, combosList, allComboItens] = await Promise.all([
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

    // Build lookup maps
    const ingsByProd = {};
    (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
    const prepsByProd = {};
    (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
    const embsByProd = {};
    (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

    const result = [];
    for (const p of prods) {
      const ings = ingsByProd[p.id] || [];
      const custoIng = ings.reduce((a, i) => a + calcCustoIngrediente(i.preco_por_kg || 0, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);

      const preps = prepsByProd[p.id] || [];
      const custoPr = preps.reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);

      const embs = embsByProd[p.id] || [];
      const custoEmb = embs.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);

      const custoTotal = custoIng + custoPr + custoEmb;
      const custoUnitario = custoTotal / getDivisorRendimento(p);

      result.push({
        id: p.id,
        nome: p.nome,
        precoVenda: p.preco_venda || 0,
        custoUnitario,
      });
    }

    setProdutos(result);
    setAllProdutos(result);
    setAllPreparos(preparosList);
    setAllEmbalagens(embalagensList);
    setAllMaterias(materiasList);
    setAdicionais(adds);

    // Build delivery product items lookup
    const dProdItensByDProd = {};
    (allDProdItens || []).forEach(i => { (dProdItensByDProd[i.delivery_produto_id] = dProdItensByDProd[i.delivery_produto_id] || []).push(i); });

    const dProdsWithCost = [];
    for (const dp of dProds) {
      const itens = dProdItensByDProd[dp.id] || [];
      let custo = 0;
      for (const item of itens) {
        if (item.tipo === 'produto') {
          const prod = result.find(p => p.id === item.item_id);
          if (prod) custo += prod.custoUnitario * item.quantidade;
        } else if (item.tipo === 'embalagem') {
          const emb = embalagensList.find(e => e.id === item.item_id);
          if (emb) custo += emb.preco_unitario * item.quantidade;
        } else if (item.tipo === 'preparo') {
          const prep = preparosList.find(p => p.id === item.item_id);
          if (prep) custo += calcCustoPreparo(prep.custo_por_kg || 0, item.quantidade, 'g');
        } else if (item.tipo === 'materia_prima') {
          const mp = materiasList.find(m => m.id === item.item_id);
          if (mp) custo += calcCustoIngrediente(mp.preco_por_kg || 0, item.quantidade, mp.unidade_medida, mp.unidade_medida || 'g');
        }
      }
      dProdsWithCost.push({ ...dp, itens, custo });
    }
    setDeliveryProdutos(dProdsWithCost);

    // Build combo items lookup
    const comboItensByCombo = {};
    (allComboItens || []).forEach(i => { (comboItensByCombo[i.combo_id] = comboItensByCombo[i.combo_id] || []).push(i); });

    const combosWithCost = [];
    for (const combo of combosList) {
      const itens = comboItensByCombo[combo.id] || [];
      let custo = 0;
      for (const item of itens) {
        if (item.tipo === 'produto') {
          const prod = result.find(p => p.id === item.item_id);
          if (prod) custo += prod.custoUnitario * item.quantidade;
        } else if (item.tipo === 'delivery_produto') {
          const dp = dProdsWithCost.find(d => d.id === item.item_id);
          if (dp) custo += dp.custo * item.quantidade;
        }
      }
      combosWithCost.push({ ...combo, itens, custo });
    }
    setCombos(combosWithCost);
  }

  async function updatePlatform(id, field, value) {
    const db = await getDatabase();
    await db.runAsync(`UPDATE delivery_config SET ${field} = ? WHERE id = ?`, [value, id]);
    setPlataformas(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  }

  async function togglePlatform(id, currentValue) {
    const newValue = currentValue ? 0 : 1;
    await updatePlatform(id, 'ativo', newValue);
  }

  async function adicionarPlataforma() {
    if (!novaPlataforma.trim()) {
      return Alert.alert('Erro', 'Informe o nome da plataforma');
    }
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, embalagem_extra, ativo) VALUES (?, ?, ?, ?, ?)',
      [novaPlataforma.trim(), 0, 0, 0, 1]
    );
    setNovaPlataforma('');
    loadData();
  }

  function removerPlataforma(id, nome) {
    setConfirmRemove({
      id,
      nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_config WHERE id = ?', [id]);
        if (expandedId === id) setExpandedId(null);
        setConfirmRemove(null);
        loadData();
      },
    });
  }

  function calcDeliveryPrice(precoVenda, taxaPlataforma, embalagemExtra) {
    if (taxaPlataforma >= 100) return precoVenda + embalagemExtra;
    const precoSugerido = precoVenda / (1 - taxaPlataforma / 100);
    return roundUpTo50(precoSugerido) + embalagemExtra;
  }

  function parseInputValue(text) {
    return parseFloat(text.replace(',', '.')) || 0;
  }

  // === ADICIONAIS ===
  async function adicionarAdicional() {
    if (!novoAdicional.nome.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_adicionais (nome, custo, preco_cobrado) VALUES (?, ?, ?)',
      [novoAdicional.nome.trim(), parseInputValue(novoAdicional.custo), parseInputValue(novoAdicional.preco_cobrado)]
    );
    setNovoAdicional({ nome: '', custo: '', preco_cobrado: '' });
    loadData();
  }

  function removerAdicional(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_adicionais WHERE id = ?', [id]);
        setConfirmRemove(null);
        loadData();
      },
    });
  }

  // === PRODUTOS DELIVERY ===
  async function salvarProdutoDelivery() {
    if (!novoProdutoDelivery.nome.trim() || novoProdutoDelivery.itens.length === 0) return;
    const db = await getDatabase();
    const res = await db.runAsync(
      'INSERT INTO delivery_produtos (nome, preco_venda) VALUES (?, ?)',
      [novoProdutoDelivery.nome.trim(), parseInputValue(novoProdutoDelivery.preco_venda)]
    );
    const dpId = res.lastInsertRowId;
    for (const item of novoProdutoDelivery.itens) {
      await db.runAsync(
        'INSERT INTO delivery_produto_itens (delivery_produto_id, tipo, item_id, quantidade) VALUES (?, ?, ?, ?)',
        [dpId, item.tipo, item.item_id, item.quantidade]
      );
    }
    setShowProdutoModal(false);
    setNovoProdutoDelivery({ nome: '', preco_venda: '', itens: [] });
    loadData();
  }

  function removerProdutoDelivery(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_produtos WHERE id = ?', [id]);
        setConfirmRemove(null);
        loadData();
      },
    });
  }

  function adicionarItemAoProduto(tipo, item) {
    const nome = item.nome;
    const newItem = { tipo, item_id: item.id, quantidade: 1, nome };
    setNovoProdutoDelivery(prev => ({ ...prev, itens: [...prev.itens, newItem] }));
  }

  function removerItemDoProduto(index) {
    setNovoProdutoDelivery(prev => ({
      ...prev,
      itens: prev.itens.filter((_, i) => i !== index),
    }));
  }

  function atualizarQtdItemProduto(index, qtd) {
    setNovoProdutoDelivery(prev => ({
      ...prev,
      itens: prev.itens.map((item, i) => i === index ? { ...item, quantidade: parseFloat(qtd) || 1 } : item),
    }));
  }

  // === COMBOS ===
  async function salvarCombo() {
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
    setNovoCombo({ nome: '', preco_venda: '', itens: [] });
    loadData();
  }

  function removerCombo(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_combos WHERE id = ?', [id]);
        setConfirmRemove(null);
        loadData();
      },
    });
  }

  function adicionarItemAoCombo(tipo, item) {
    const newItem = { tipo, item_id: item.id, quantidade: 1, nome: item.nome };
    setNovoCombo(prev => ({ ...prev, itens: [...prev.itens, newItem] }));
  }

  const plataformasAtivas = plataformas.filter(p => p.ativo === 1);

  return (
    <>
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* === CONFIGURAR PLATAFORMAS === */}
      <Card
        title="Configurar Plataformas"
        headerRight={
          <InfoTooltip
            title="Delivery e Plataformas"
            text="Configure as taxas de cada plataforma de delivery. O sistema calcula automaticamente o preço sugerido para manter sua margem de lucro ao vender por delivery."
            examples={[
              'Taxa da plataforma: % cobrado sobre cada venda',
              'Taxa de entrega: valor fixo por pedido (entrega própria)',
              'Embalagem extra: custo adicional por unidade para delivery',
              'Preço sugerido = preço balcão / (1 - taxa%) arredondado',
            ]}
          />
        }
      >
        {plataformas.map((plat) => (
          <View key={plat.id} style={styles.platformItem}>
            {/* Header row */}
            <TouchableOpacity
              style={styles.platformHeader}
              onPress={() => setExpandedId(expandedId === plat.id ? null : plat.id)}
              activeOpacity={0.7}
            >
              <View style={styles.platformHeaderLeft}>
                <Text style={styles.platformChevron}>
                  {expandedId === plat.id ? '▼' : '▶'}
                </Text>
                <Text style={styles.platformName}>{plat.plataforma}</Text>
                {plat.taxa_plataforma > 0 && (
                  <Text style={styles.platformBadge}>{plat.taxa_plataforma}%</Text>
                )}
              </View>
              <Switch
                value={plat.ativo === 1}
                onValueChange={() => togglePlatform(plat.id, plat.ativo)}
                trackColor={{ false: colors.disabled, true: colors.primaryLight }}
                thumbColor={plat.ativo ? colors.primary : '#f4f3f4'}
              />
            </TouchableOpacity>

            {/* Expanded fields */}
            {expandedId === plat.id && (
              <View style={styles.platformFields}>
                <InputField
                  label="Taxa da Plataforma"
                  value={plat.taxa_plataforma > 0 ? String(plat.taxa_plataforma) : ''}
                  onChangeText={(val) => updatePlatform(plat.id, 'taxa_plataforma', parseInputValue(val))}
                  keyboardType="numeric"
                  suffix="%"
                  placeholder="0"
                />
                <InputField
                  label="Taxa de Entrega (fixo por pedido)"
                  value={plat.taxa_entrega > 0 ? String(plat.taxa_entrega) : ''}
                  onChangeText={(val) => updatePlatform(plat.id, 'taxa_entrega', parseInputValue(val))}
                  keyboardType="numeric"
                  suffix="R$"
                  placeholder="0,00"
                />
                <InputField
                  label="Embalagem Extra (por unidade)"
                  value={plat.embalagem_extra > 0 ? String(plat.embalagem_extra) : ''}
                  onChangeText={(val) => updatePlatform(plat.id, 'embalagem_extra', parseInputValue(val))}
                  keyboardType="numeric"
                  suffix="R$"
                  placeholder="0,00"
                  style={{ marginBottom: spacing.xs }}
                />
                <TouchableOpacity
                  style={styles.removeBtn}
                  onPress={(e) => {
                    if (e && e.stopPropagation) e.stopPropagation();
                    removerPlataforma(plat.id, plat.plataforma);
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.removeBtnText}>🗑️ Remover plataforma</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        ))}

        {/* Add platform */}
        <View style={styles.addRow}>
          <InputField
            style={{ flex: 1, marginRight: spacing.sm, marginBottom: 0 }}
            value={novaPlataforma}
            onChangeText={setNovaPlataforma}
            placeholder="Nome da plataforma"
          />
          <TouchableOpacity style={styles.addBtn} onPress={adicionarPlataforma}>
            <Text style={styles.addBtnText}>+</Text>
          </TouchableOpacity>
        </View>
      </Card>

      {/* === PRECIFICACAO PARA DELIVERY === */}
      <Card
        title="Precificação para Delivery"
        headerRight={
          <InfoTooltip
            title="Preços de Delivery"
            text="Para cada plataforma ativa, o sistema calcula o preço sugerido para delivery considerando a taxa cobrada, embalagem extra e taxa de entrega. O objetivo é manter sua margem de lucro."
            examples={[
              'Preço Sugerido = Preço Balcão / (1 - Taxa%)',
              'Arredondado para cima ao R$ 0,50 mais próximo',
              'Verde = lucro positivo / Vermelho = prejuízo',
            ]}
          />
        }
      >
        {produtos.length === 0 ? (
          <Text style={styles.emptyText}>
            Cadastre produtos para ver a precificação de delivery.
          </Text>
        ) : plataformasAtivas.length === 0 ? (
          <Text style={styles.emptyText}>
            Ative pelo menos uma plataforma acima.
          </Text>
        ) : (
          plataformasAtivas.map((plat) => (
            <View key={plat.id} style={styles.platformSection}>
              <View style={styles.platformSectionHeader}>
                <Text style={styles.platformSectionTitle}>{plat.plataforma}</Text>
                <Text style={styles.platformSectionBadge}>
                  {plat.taxa_plataforma > 0 ? `${plat.taxa_plataforma}%` : 'Sem taxa'}
                </Text>
              </View>

              {/* Table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 1.2 }]}>Produto</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8, textAlign: 'right' }]}>Balcão</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8, textAlign: 'right' }]}>Delivery</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Lucro</Text>
              </View>

              {/* Product rows */}
              {produtos.map((prod, index) => {
                const precoDelivery = calcDeliveryPrice(
                  prod.precoVenda,
                  plat.taxa_plataforma,
                  plat.embalagem_extra
                );
                const taxaPlatValor = precoDelivery * (plat.taxa_plataforma / 100);
                const custoDelivery = prod.custoUnitario + plat.embalagem_extra;
                const lucro = precoDelivery - custoDelivery - taxaPlatValor;
                const isPositive = lucro >= 0;

                return (
                  <View
                    key={prod.id}
                    style={[
                      styles.tableRow,
                      { backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F5F5F5' },
                    ]}
                  >
                    <Text style={[styles.tableCell, { flex: 1.2 }]} numberOfLines={1}>
                      {prod.nome}
                    </Text>
                    <Text style={[styles.tableCellValue, { flex: 0.8, textAlign: 'right' }]}>
                      {formatCurrency(prod.precoVenda)}
                    </Text>
                    <Text style={[styles.tableCellDelivery, { flex: 0.8, textAlign: 'right' }]}>
                      {formatCurrency(precoDelivery)}
                    </Text>
                    <Text
                      style={[
                        styles.tableCellLucro,
                        { flex: 0.7, textAlign: 'right', color: isPositive ? colors.success : colors.error },
                      ]}
                    >
                      {formatCurrency(lucro)}
                    </Text>
                  </View>
                );
              })}

              {/* Platform summary */}
              {plat.taxa_entrega > 0 && (
                <Text style={styles.platformNote}>
                  + Taxa entrega: {formatCurrency(plat.taxa_entrega)} por pedido
                </Text>
              )}
            </View>
          ))
        )}
      </Card>

      {/* === PRODUTOS DELIVERY === */}
      <Card
        title="Produtos Delivery"
        headerRight={
          <InfoTooltip
            title="Produtos Delivery"
            text="Crie produtos exclusivos para delivery combinando produtos existentes com embalagens, preparos ou insumos extras."
            examples={[
              'Ex: Bolo Delivery = Bolo + Caixa + Gelo seco',
              'Reutilize produtos já cadastrados com ficha técnica',
              'Adicione embalagens e extras específicos para delivery',
            ]}
          />
        }
      >
        {deliveryProdutos.length > 0 && (
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Produto</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Custo</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Preço</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: 'center' }]}>Ações</Text>
          </View>
        )}
        {deliveryProdutos.map((dp, index) => (
          <View key={dp.id} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F5F5F5' }]}>
            <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>{dp.nome}</Text>
            <Text style={[styles.tableCellValue, { flex: 0.7, textAlign: 'right' }]}>{formatCurrency(dp.custo)}</Text>
            <Text style={[styles.tableCellDelivery, { flex: 0.7, textAlign: 'right' }]}>{formatCurrency(dp.preco_venda)}</Text>
            <TouchableOpacity style={{ flex: 0.5, alignItems: 'center' }} onPress={() => removerProdutoDelivery(dp.id, dp.nome)}>
              <Text style={{ color: colors.error, fontSize: fonts.regular }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {deliveryProdutos.length === 0 && (
          <Text style={styles.emptyText}>Crie produtos exclusivos para iFood, Rappi e outros — com preços e custos próprios.</Text>
        )}
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => { setNovoProdutoDelivery({ nome: '', preco_venda: '', itens: [] }); setShowProdutoModal(true); }}
        >
          <Text style={styles.createBtnText}>+ Criar Produto Delivery</Text>
        </TouchableOpacity>
      </Card>

      {/* === COMBOS === */}
      <Card
        title="Combos"
        headerRight={
          <InfoTooltip
            title="Combos Delivery"
            text="Agrupe produtos e produtos delivery em combos com preço especial."
            examples={[
              'Ex: Combo Festa = 1 Bolo + 30 Brigadeiros',
              'Defina o preço do combo e veja a margem',
              'Use produtos normais ou produtos delivery',
            ]}
          />
        }
      >
        {combos.length > 0 && (
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Combo</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Custo</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Preço</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: 'center' }]}>Ações</Text>
          </View>
        )}
        {combos.map((combo, index) => (
          <View key={combo.id} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F5F5F5' }]}>
            <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>{combo.nome}</Text>
            <Text style={[styles.tableCellValue, { flex: 0.7, textAlign: 'right' }]}>{formatCurrency(combo.custo)}</Text>
            <Text style={[styles.tableCellDelivery, { flex: 0.7, textAlign: 'right' }]}>{formatCurrency(combo.preco_venda)}</Text>
            <TouchableOpacity style={{ flex: 0.5, alignItems: 'center' }} onPress={() => removerCombo(combo.id, combo.nome)}>
              <Text style={{ color: colors.error, fontSize: fonts.regular }}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}
        {combos.length === 0 && (
          <Text style={styles.emptyText}>Combine produtos em pacotes promocionais e veja a margem real do combo.</Text>
        )}
        <TouchableOpacity
          style={styles.createBtn}
          onPress={() => { setNovoCombo({ nome: '', preco_venda: '', itens: [] }); setShowComboModal(true); }}
        >
          <Text style={styles.createBtnText}>+ Criar Combo</Text>
        </TouchableOpacity>
      </Card>

      {/* === ADICIONAIS === */}
      <Card
        title="Adicionais por Pedido"
        headerRight={
          <InfoTooltip
            title="Adicionais"
            text="Itens extras que podem ser adicionados a pedidos de delivery, como sachês, molhos, etc."
            examples={[
              'Ketchup, mostarda, maionese',
              'Sachês de sal, pimenta',
              'Talheres descartáveis',
            ]}
          />
        }
      >
        {adicionais.length > 0 && (
          <View style={styles.tableHeader}>
            <Text style={[styles.tableHeaderText, { flex: 1.5 }]}>Adicional</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Custo</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.7, textAlign: 'right' }]}>Preço</Text>
            <Text style={[styles.tableHeaderText, { flex: 0.5, textAlign: 'center' }]}>Ações</Text>
          </View>
        )}
        {adicionais.map((add, index) => {
          const lucroAdd = add.preco_cobrado - add.custo;
          return (
            <View key={add.id} style={[styles.tableRow, { backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#F5F5F5' }]}>
              <Text style={[styles.tableCell, { flex: 1.5 }]} numberOfLines={1}>{add.nome}</Text>
              <Text style={[styles.tableCellValue, { flex: 0.7, textAlign: 'right' }]}>{formatCurrency(add.custo)}</Text>
              <Text style={[styles.tableCellDelivery, { flex: 0.7, textAlign: 'right', color: lucroAdd >= 0 ? colors.success : colors.error }]}>
                {formatCurrency(add.preco_cobrado)}
              </Text>
              <TouchableOpacity style={{ flex: 0.5, alignItems: 'center' }} onPress={() => removerAdicional(add.id, add.nome)}>
                <Text style={{ color: colors.error, fontSize: fonts.regular }}>✕</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={styles.addAdicionalForm}>
          <InputField
            placeholder="Nome do adicional"
            value={novoAdicional.nome}
            onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, nome: val }))}
            style={{ marginBottom: spacing.xs }}
          />
          <View style={{ flexDirection: 'row' }}>
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
              style={{ flex: 1, marginLeft: spacing.xs, marginBottom: 0 }}
            />
            <TouchableOpacity style={[styles.addBtn, { marginLeft: spacing.sm }]} onPress={adicionarAdicional}>
              <Text style={styles.addBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Card>

      {/* Legend */}
      {plataformasAtivas.length > 0 && produtos.length > 0 && (
        <Card>
          <Text style={styles.legendTitle}>Como funciona</Text>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Lucro positivo - preço cobre todos os custos</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
            <Text style={styles.legendText}>Prejuízo - revise o preço ou os custos</Text>
          </View>
          <Text style={styles.legendFormula}>
            Preço Delivery = Preço Balcão / (1 - Taxa%) + Embalagem Extra
          </Text>
        </Card>
      )}
    </ScrollView>

      <ConfirmDeleteModal
        visible={!!confirmRemove}
        isFocused={isFocused}
        titulo={confirmRemove?.titulo || 'Confirmar Exclusão'}
        nome={confirmRemove?.nome}
        onConfirm={confirmRemove?.onConfirm}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remover"
      />

      {/* Modal Criar Produto Delivery */}
      <Modal visible={showProdutoModal && isFocused} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowProdutoModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <ScrollView>
              <Text style={styles.modalTitle}>Criar Produto Delivery</Text>
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
              />

              <Text style={styles.modalSubtitle}>Itens adicionados</Text>
              {novoProdutoDelivery.itens.length === 0 && (
                <Text style={[styles.emptyText, { paddingVertical: spacing.sm }]}>Nenhum item adicionado.</Text>
              )}
              {novoProdutoDelivery.itens.map((item, index) => (
                <View key={index} style={styles.modalItem}>
                  <Text style={styles.modalItemName} numberOfLines={1}>{item.nome}</Text>
                  <Text style={styles.modalItemTipo}>{item.tipo}</Text>
                  <InputField
                    value={String(item.quantidade)}
                    onChangeText={(val) => atualizarQtdItemProduto(index, val)}
                    keyboardType="numeric"
                    style={{ width: 60, marginBottom: 0 }}
                    inputStyle={{ textAlign: 'center', padding: 4, fontSize: fonts.tiny }}
                  />
                  <TouchableOpacity onPress={() => removerItemDoProduto(index)} style={{ marginLeft: spacing.xs }}>
                    <Text style={{ color: colors.error, fontSize: fonts.regular }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.modalSubtitle}>Adicionar itens</Text>

              {allProdutos.length > 0 && (
                <>
                  <Text style={styles.modalCatLabel}>📦 Produtos</Text>
                  <View style={styles.modalItemList}>
                    {allProdutos.map(p => (
                      <TouchableOpacity key={`prod-${p.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoProduto('produto', p)}>
                        <Text style={styles.modalAddItemText} numberOfLines={1}>+ {p.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {allEmbalagens.length > 0 && (
                <>
                  <Text style={styles.modalCatLabel}>📋 Embalagens</Text>
                  <View style={styles.modalItemList}>
                    {allEmbalagens.map(e => (
                      <TouchableOpacity key={`emb-${e.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoProduto('embalagem', e)}>
                        <Text style={styles.modalAddItemText} numberOfLines={1}>+ {e.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {allPreparos.length > 0 && (
                <>
                  <Text style={styles.modalCatLabel}>🍳 Preparos</Text>
                  <View style={styles.modalItemList}>
                    {allPreparos.map(p => (
                      <TouchableOpacity key={`prep-${p.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoProduto('preparo', p)}>
                        <Text style={styles.modalAddItemText} numberOfLines={1}>+ {p.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {allMaterias.length > 0 && (
                <>
                  <Text style={styles.modalCatLabel}>🥕 Matérias-primas</Text>
                  <View style={styles.modalItemList}>
                    {allMaterias.map(m => (
                      <TouchableOpacity key={`mp-${m.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoProduto('materia_prima', m)}>
                        <Text style={styles.modalAddItemText} numberOfLines={1}>+ {m.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowProdutoModal(false)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarProdutoDelivery}>
                  <Text style={styles.modalSaveText}>Salvar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Criar Combo */}
      <Modal visible={showComboModal && isFocused} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowComboModal(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <ScrollView>
              <Text style={styles.modalTitle}>Criar Combo</Text>
              <InputField
                label="Nome do combo"
                value={novoCombo.nome}
                onChangeText={(val) => setNovoCombo(prev => ({ ...prev, nome: val }))}
                placeholder="Ex: Combo Festa"
              />
              <InputField
                label="Preço do combo (R$)"
                value={novoCombo.preco_venda}
                onChangeText={(val) => setNovoCombo(prev => ({ ...prev, preco_venda: val }))}
                keyboardType="numeric"
                placeholder="0,00"
              />

              <Text style={styles.modalSubtitle}>Itens do combo</Text>
              {novoCombo.itens.length === 0 && (
                <Text style={[styles.emptyText, { paddingVertical: spacing.sm }]}>Nenhum item adicionado.</Text>
              )}
              {novoCombo.itens.map((item, index) => (
                <View key={index} style={styles.modalItem}>
                  <Text style={styles.modalItemName} numberOfLines={1}>{item.nome}</Text>
                  <Text style={styles.modalItemTipo}>{item.tipo === 'delivery_produto' ? 'delivery' : 'produto'}</Text>
                  <InputField
                    value={String(item.quantidade)}
                    onChangeText={(val) => setNovoCombo(prev => ({
                      ...prev,
                      itens: prev.itens.map((it, i) => i === index ? { ...it, quantidade: parseFloat(val) || 1 } : it),
                    }))}
                    keyboardType="numeric"
                    style={{ width: 60, marginBottom: 0 }}
                    inputStyle={{ textAlign: 'center', padding: 4, fontSize: fonts.tiny }}
                  />
                  <TouchableOpacity onPress={() => setNovoCombo(prev => ({ ...prev, itens: prev.itens.filter((_, i) => i !== index) }))} style={{ marginLeft: spacing.xs }}>
                    <Text style={{ color: colors.error, fontSize: fonts.regular }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <Text style={styles.modalSubtitle}>Adicionar itens</Text>

              {allProdutos.length > 0 && (
                <>
                  <Text style={styles.modalCatLabel}>📦 Produtos</Text>
                  <View style={styles.modalItemList}>
                    {allProdutos.map(p => (
                      <TouchableOpacity key={`prod-${p.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoCombo('produto', p)}>
                        <Text style={styles.modalAddItemText} numberOfLines={1}>+ {p.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              {deliveryProdutos.length > 0 && (
                <>
                  <Text style={styles.modalCatLabel}>🛵 Produtos Delivery</Text>
                  <View style={styles.modalItemList}>
                    {deliveryProdutos.map(dp => (
                      <TouchableOpacity key={`dp-${dp.id}`} style={styles.modalAddItem} onPress={() => adicionarItemAoCombo('delivery_produto', dp)}>
                        <Text style={styles.modalAddItemText} numberOfLines={1}>+ {dp.nome}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowComboModal(false)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarCombo}>
                  <Text style={styles.modalSaveText}>Salvar</Text>
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
  content: { padding: spacing.md, paddingBottom: 40 },

  // Platform config
  platformItem: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  platformHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.sm + 2,
    backgroundColor: colors.inputBg,
  },
  platformHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  platformChevron: {
    fontSize: 10,
    color: colors.textSecondary,
    marginRight: spacing.sm,
  },
  platformName: {
    fontSize: fonts.regular,
    fontWeight: '600',
    color: colors.text,
  },
  platformBadge: {
    fontSize: fonts.tiny,
    color: colors.textLight,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: spacing.sm,
    overflow: 'hidden',
    fontWeight: '600',
  },
  platformFields: {
    padding: spacing.sm + 2,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#FFFFFF',
  },
  removeBtn: {
    alignSelf: 'flex-end',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  removeBtnText: {
    color: colors.error,
    fontSize: fonts.small,
    fontWeight: '600',
  },

  // Add platform
  addRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.xs,
  },
  addBtn: {
    backgroundColor: colors.primary,
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: {
    color: colors.textLight,
    fontSize: 22,
    fontWeight: '300',
  },

  // Delivery pricing section per platform
  platformSection: {
    marginBottom: spacing.lg,
  },
  platformSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  platformSectionTitle: {
    fontSize: fonts.medium,
    fontWeight: '700',
    color: colors.primary,
  },
  platformSectionBadge: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    marginLeft: spacing.sm,
    fontStyle: 'italic',
  },

  // Table
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderTopLeftRadius: borderRadius.sm,
    borderTopRightRadius: borderRadius.sm,
    alignItems: 'center',
  },
  tableHeaderText: {
    color: colors.textLight,
    fontWeight: '700',
    fontSize: fonts.tiny,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderLeftColor: colors.border,
    borderRightColor: colors.border,
  },
  tableCell: {
    fontSize: fonts.tiny,
    color: colors.text,
  },
  tableCellValue: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
  },
  tableCellDelivery: {
    fontSize: fonts.tiny,
    fontWeight: '700',
    color: colors.primary,
  },
  tableCellLucro: {
    fontSize: fonts.tiny,
    fontWeight: '700',
  },
  platformNote: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.xs,
    textAlign: 'right',
  },

  // Empty state
  emptyText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontSize: fonts.regular,
    paddingVertical: spacing.lg,
  },

  // Legend
  legendTitle: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
  },
  legendText: {
    fontSize: fonts.small,
    color: colors.textSecondary,
  },
  legendFormula: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    textAlign: 'center',
    backgroundColor: colors.inputBg,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },

  // Create button
  createBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  createBtnText: {
    color: colors.textLight,
    fontWeight: '700',
    fontSize: fonts.small,
  },

  // Adicional form
  addAdicionalForm: {
    marginTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },

  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalContent: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    width: '100%',
    maxHeight: '85%',
    maxWidth: 500,
  },
  modalTitle: {
    fontSize: fonts.large,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.md,
  },
  modalSubtitle: {
    fontSize: fonts.small,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  modalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalItemName: {
    flex: 1,
    fontSize: fonts.small,
    color: colors.text,
  },
  modalItemTipo: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    backgroundColor: colors.inputBg,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: spacing.xs,
    overflow: 'hidden',
  },
  modalCatLabel: {
    fontSize: fonts.small,
    fontWeight: '600',
    color: colors.primary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  modalItemList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  modalAddItem: {
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    marginRight: spacing.xs,
    marginBottom: spacing.xs,
  },
  modalAddItemText: {
    fontSize: fonts.tiny,
    color: colors.primary,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
  },
  modalCancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
  },
  modalCancelText: {
    color: colors.textSecondary,
    fontWeight: '600',
  },
  modalSaveBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.sm,
  },
  modalSaveText: {
    color: colors.textLight,
    fontWeight: '700',
  },
});
