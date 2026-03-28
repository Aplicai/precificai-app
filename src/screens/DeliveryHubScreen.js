import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Switch,
  ActivityIndicator, Platform, TextInput, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { Feather } from '@expo/vector-icons';
import InputField from '../components/InputField';
import EmptyState from '../components/EmptyState';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import InfoTooltip from '../components/InfoTooltip';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import SearchBar from '../components/SearchBar';
import { formatCurrency, converterParaBase, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';

const isWeb = Platform.OS === 'web';

const TABS = [
  { key: 'plataformas', label: 'Plataformas', icon: 'smartphone' },
  { key: 'simulador', label: 'Simulador de Preço', icon: 'trending-up' },
  { key: 'visaogeral', label: 'Visão Geral', icon: 'grid' },
];

const KNOWN_PLATFORMS = [
  { nome: 'iFood', cor: '#EA1D2C', icon: 'smartphone' },
  { nome: 'Rappi', cor: '#FF6B00', icon: 'zap' },
  { nome: 'Uber Eats', cor: '#06C167', icon: 'truck' },
  { nome: '99Food', cor: '#FFCC00', icon: 'package' },
  { nome: 'Venda Direta', cor: colors.primary, icon: 'shopping-bag' },
];

export default function DeliveryHubScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState('plataformas');
  const [loading, setLoading] = useState(true);

  // Plataformas state
  const [plataformas, setPlataformas] = useState([]);
  const [editingPlat, setEditingPlat] = useState(null);
  const [newPlatNome, setNewPlatNome] = useState('');
  const [deleteModal, setDeleteModal] = useState(null);

  // Simulador state
  const [produtos, setProdutos] = useState([]);
  const [combos, setCombos] = useState([]);
  const [selectedProd, setSelectedProd] = useState(null);
  const [selectedPlat, setSelectedPlat] = useState(null);
  const [simResult, setSimResult] = useState(null);
  const [buscaProd, setBuscaProd] = useState('');
  const [precoCustom, setPrecoCustom] = useState('');
  const [expandedPlats, setExpandedPlats] = useState({});
  const [margemDesejada, setMargemDesejada] = useState('30');

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    setLoading(true);
    const db = await getDatabase();
    const [plats, prods, allIngs, allPreps, allEmbs, comboRows, comboItensRows] = await Promise.all([
      db.getAllAsync('SELECT * FROM delivery_config ORDER BY id'),
      db.getAllAsync('SELECT * FROM produtos WHERE preco_venda > 0 ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_combo_itens'),
    ]);

    setPlataformas(plats);

    // Build product cost data
    const ingsByProd = {};
    allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
    const prepsByProd = {};
    allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
    const embsByProd = {};
    allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

    const prodData = prods.map(p => {
      const ings = ingsByProd[p.id] || [];
      const preps = prepsByProd[p.id] || [];
      const embs = embsByProd[p.id] || [];
      const custoIng = ings.reduce((a, ing) => a + calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada, ing.unidade_medida, ing.unidade_medida || 'g'), 0);
      const custoPr = preps.reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
      const custoEmb = embs.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);
      const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
      const margem = p.preco_venda > 0 ? (p.preco_venda - custoUnit) / p.preco_venda : 0;
      return { ...p, custoUnit, margem };
    });
    setProdutos(prodData);

    // Build combo cost data using product cost lookup
    const prodCostMap = {};
    prodData.forEach(p => { prodCostMap[p.id] = p.custoUnit; });
    const itensByCombo = {};
    comboItensRows.forEach(ci => { (itensByCombo[ci.combo_id] = itensByCombo[ci.combo_id] || []).push(ci); });

    const comboData = (comboRows || []).filter(c => c.preco_venda > 0).map(c => {
      const itens = itensByCombo[c.id] || [];
      const custoUnit = itens.reduce((a, item) => a + (prodCostMap[item.item_id] || 0) * (item.quantidade || 1), 0);
      const margem = c.preco_venda > 0 ? (c.preco_venda - custoUnit) / c.preco_venda : 0;
      return { ...c, custoUnit, margem, isCombo: true };
    });
    setCombos(comboData);
    setLoading(false);
  }

  // ── Plataformas functions ──
  async function togglePlataforma(plat) {
    const db = await getDatabase();
    const newAtivo = plat.ativo ? 0 : 1;
    await db.runAsync('UPDATE delivery_config SET ativo = ? WHERE id = ?', [newAtivo, plat.id]);
    setPlataformas(prev => prev.map(p => p.id === plat.id ? { ...p, ativo: newAtivo } : p));
  }

  async function savePlatField(platId, field, value) {
    const db = await getDatabase();
    const numVal = parseFloat(String(value).replace(',', '.')) || 0;
    await db.runAsync(`UPDATE delivery_config SET ${field} = ? WHERE id = ?`, [numVal, platId]);
    setPlataformas(prev => prev.map(p => p.id === platId ? { ...p, [field]: numVal } : p));
  }

  async function addPlataforma() {
    if (!newPlatNome.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_config (plataforma, taxa_plataforma, taxa_entrega, comissao_app, desconto_promocao, ativo) VALUES (?,?,?,?,?,?)',
      [newPlatNome.trim(), 0, 0, 0, 0, 1]
    );
    setNewPlatNome('');
    loadData();
  }

  async function deletePlataforma(id) {
    const db = await getDatabase();
    await db.runAsync('DELETE FROM delivery_config WHERE id = ?', [id]);
    setDeleteModal(null);
    loadData();
  }

  // ── Simulador functions ──
  function simularPreco() {
    if (!selectedProd || !selectedPlat) return;
    const isComboSel = typeof selectedProd === 'string' && selectedProd.startsWith('combo_');
    const prod = isComboSel
      ? combos.find(c => 'combo_' + c.id === selectedProd)
      : produtos.find(p => p.id === selectedProd);
    const plat = plataformas.find(p => p.id === selectedPlat);
    if (!prod || !plat) return;

    const comissaoPct = (plat.comissao_app || plat.taxa_plataforma || 0) / 100;
    const taxaEntregaR$ = plat.taxa_entrega || 0;
    const descontoPct = (plat.desconto_promocao || 0) / 100;
    const cupomR$ = plat.embalagem_extra || 0;

    const precoBalcao = prod.preco_venda;
    const custoUnit = prod.custoUnit;
    const margemBalcao = precoBalcao > 0 ? (precoBalcao - custoUnit) / precoBalcao : 0;

    // Ordem correta dos descontos no delivery:
    // 1. Desconto promo (%) - aplicado sobre o preço do produto
    const precoComDesconto = precoBalcao * (1 - descontoPct);
    const valorDesconto = precoBalcao * descontoPct;
    // 2. Cupom (R$) - abatido do valor após desconto
    const precoAposCupom = precoComDesconto - cupomR$;
    // 3. Comissão (%) - calculada sobre (preço após cupom + frete)
    const baseComissao = precoAposCupom + taxaEntregaR$;
    const valorComissao = baseComissao * comissaoPct;
    // 4. O restaurante recebe: preço após cupom - comissão - taxa de entrega
    const receitaLiqDelivery = precoAposCupom - valorComissao - taxaEntregaR$;
    const lucroDelivery = receitaLiqDelivery - custoUnit;
    const margemDelivery = precoBalcao > 0 ? lucroDelivery / precoBalcao : 0;

    // Preço sugerido para atingir a margem desejada
    // receitaLiq = (P*(1-d) - c)*(1 - com) - f
    // lucro = receitaLiq - custo = P * margemAlvo
    // P * ((1-d)*(1-com) - margemAlvo) = c*(1-com) + f + custo
    const margemAlvo = (parseFloat(margemDesejada) || 30) / 100;
    const numerador = cupomR$ * (1 - comissaoPct) + taxaEntregaR$ + custoUnit;
    const divisor = (1 - descontoPct) * (1 - comissaoPct) - margemAlvo;
    const precoSugerido = divisor > 0 ? numerador / divisor : 0;

    // Preço mínimo (lucro = 0 => receitaLiq = custo)
    const divisorMin = (1 - descontoPct) * (1 - comissaoPct);
    const precoMinimo = divisorMin > 0 ? (custoUnit + cupomR$ * (1 - comissaoPct) + taxaEntregaR$) / divisorMin : 0;

    setSimResult({
      prodNome: isComboSel ? prod.nome + ' (Combo)' : prod.nome,
      platNome: plat.plataforma,
      precoBalcao,
      custoUnit,
      comissaoPct: comissaoPct * 100,
      descontoPct: descontoPct * 100,
      cupomReais: cupomR$,
      taxaEntrega: taxaEntregaR$,
      margemBalcao,
      receitaLiqDelivery,
      lucroDelivery,
      margemDelivery,
      margemAlvo,
      precoSugerido: precoSugerido > 0 ? precoSugerido : null,
      precoMinimo,
      // Intermediate values for breakdown display
      valorDesconto,
      precoComDesconto,
      precoAposCupom,
      baseComissao,
      valorComissao,
      // Store raw values for recalculation with custom price
      _comissaoPct: comissaoPct,
      _descontoPct: descontoPct,
      _cupomReais: cupomR$,
      _taxaEntrega: taxaEntregaR$,
    });
    setPrecoCustom('');
  }

  function calcCustom() {
    if (!simResult) return null;
    const preco = parseFloat(precoCustom.replace(',', '.'));
    if (!preco || preco <= 0) return null;
    // Mesma lógica corrigida do simulador principal:
    // 1. Desconto promo (%) sobre o preço
    const valorDesconto = preco * simResult._descontoPct;
    const precoComDesconto = preco * (1 - simResult._descontoPct);
    // 2. Cupom (R$)
    const cupom = simResult._cupomReais || 0;
    const precoAposCupom = precoComDesconto - cupom;
    // 3. Comissão (%) sobre (preço após cupom + frete)
    const taxa = simResult._taxaEntrega || 0;
    const baseComissao = precoAposCupom + taxa;
    const valorComissao = baseComissao * simResult._comissaoPct;
    // 4. Receita líquida = preço após cupom - comissão - taxa de entrega
    const recLiq = precoAposCupom - valorComissao - taxa;
    const lucro = recLiq - simResult.custoUnit;
    const margem = preco > 0 ? lucro / preco : 0;
    return { preco, recLiq, lucro, margem, valorComissao, valorDesconto, precoComDesconto, precoAposCupom, taxaEntrega: taxa };
  }

  function getPlatColor(nome) {
    const found = KNOWN_PLATFORMS.find(p => nome.toLowerCase().includes(p.nome.toLowerCase()));
    return found?.cor || colors.primary;
  }

  // ── Render ──
  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, color: colors.textSecondary }}>Carregando...</Text>
      </View>
    );
  }

  const ativas = plataformas.filter(p => p.ativo);

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <View style={styles.tabsRow}>
          {TABS.map(tab => {
            const isActive = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[styles.tab, isActive && styles.tabActive]}
                onPress={() => {
                  setActiveTab(tab.key);
                  if (tab.key === 'simulador' || tab.key === 'visaogeral') {
                    loadData();
                    setSimResult(null);
                  }
                }}
                activeOpacity={0.7}
              >
                <Feather name={tab.icon} size={14} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 6 }} />
                <Text style={[styles.tabText, isActive && styles.tabTextActive]}>{tab.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={[styles.content, isDesktop && { maxWidth: 1000, alignSelf: 'flex-start', width: '100%', paddingLeft: spacing.lg }]}>

        {activeTab === 'plataformas' && (
          <>
            {/* Info */}
            <View style={styles.infoCard}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Cadastre as plataformas de delivery e suas taxas. O simulador usará esses dados para calcular o preço ideal.
              </Text>
            </View>

            {/* Active count */}
            <Text style={styles.countText}>{ativas.length} plataforma{ativas.length !== 1 ? 's' : ''} ativa{ativas.length !== 1 ? 's' : ''}</Text>

            {/* Plataformas list */}
            {plataformas.map(plat => {
              const isExpanded = editingPlat === plat.id;
              const cor = getPlatColor(plat.plataforma);
              return (
                <View key={plat.id} style={styles.platCard}>
                  <TouchableOpacity
                    style={styles.platHeader}
                    onPress={() => setEditingPlat(isExpanded ? null : plat.id)}
                    activeOpacity={0.7}
                  >
                    <View style={[styles.platDot, { backgroundColor: cor }]} />
                    <Text style={styles.platName}>{plat.plataforma}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Switch
                        value={!!plat.ativo}
                        onValueChange={() => togglePlataforma(plat)}
                        trackColor={{ false: colors.border, true: colors.success + '50' }}
                        thumbColor={plat.ativo ? colors.success : colors.disabled}
                      />
                      <Text style={[styles.platStatus, { color: plat.ativo ? colors.success : colors.disabled }]}>
                        {plat.ativo ? 'Ativa' : 'Inativa'}
                      </Text>
                      <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.platBody}>
                      <View style={styles.platFieldsRow}>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Comissão (%)</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.comissao_app || plat.taxa_plataforma || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'comissao_app', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Taxa entrega (R$)</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.taxa_entrega || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'taxa_entrega', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Desconto promo (%)</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.desconto_promocao || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'desconto_promocao', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                        <View style={styles.platField}>
                          <Text style={styles.platFieldLabel}>Cupom em R$</Text>
                          <TextInput
                            style={styles.platInput}
                            defaultValue={String(plat.embalagem_extra || 0)}
                            keyboardType="numeric"
                            onBlur={(e) => savePlatField(plat.id, 'embalagem_extra', e.nativeEvent.text)}
                            placeholder="0"
                            placeholderTextColor={colors.disabled}
                          />
                        </View>
                      </View>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => setDeleteModal(plat)}
                      >
                        <Feather name="trash-2" size={14} color={colors.error} />
                        <Text style={styles.deleteBtnText}>Remover plataforma</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            })}

            {/* Add platform */}
            <View style={styles.addPlatCard}>
              <Text style={styles.addPlatTitle}>Adicionar plataforma</Text>
              <View style={styles.addPlatRow}>
                <TextInput
                  style={[styles.platInput, { flex: 1 }]}
                  value={newPlatNome}
                  onChangeText={setNewPlatNome}
                  placeholder="Ex: iFood, Rappi..."
                  placeholderTextColor={colors.disabled}
                />
                <TouchableOpacity style={styles.addBtn} onPress={addPlataforma}>
                  <Feather name="plus" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
              {/* Quick add suggestions */}
              {plataformas.length < 3 && (
                <View style={styles.suggestRow}>
                  {KNOWN_PLATFORMS.filter(kp => !plataformas.some(p => p.plataforma.toLowerCase() === kp.nome.toLowerCase())).slice(0, 4).map(kp => (
                    <TouchableOpacity
                      key={kp.nome}
                      style={styles.suggestChip}
                      onPress={() => setNewPlatNome(kp.nome)}
                    >
                      <View style={[styles.suggestDot, { backgroundColor: kp.cor }]} />
                      <Text style={styles.suggestText}>{kp.nome}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </>
        )}

        {activeTab === 'simulador' && (
          <>
            {/* Info */}
            <View style={styles.infoCard}>
              <Feather name="info" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Selecione um produto e uma plataforma para descobrir quanto cobrar no delivery mantendo sua margem de lucro.
              </Text>
            </View>

            {ativas.length === 0 ? (
              <EmptyState
                icon="smartphone"
                title="Nenhuma plataforma ativa"
                description="Cadastre e ative pelo menos uma plataforma na aba Plataformas para usar o simulador."
              />
            ) : produtos.length === 0 && combos.length === 0 ? (
              <EmptyState
                icon="tag"
                title="Nenhum produto cadastrado"
                description="Cadastre produtos com preço de venda para simular preços de delivery."
              />
            ) : (
              <>
                {/* Select product */}
                <Text style={styles.simLabel}>Selecione o produto</Text>
                <SearchBar value={buscaProd} onChangeText={(text) => { setBuscaProd(text); if (!text.trim()) { /* keep selected */ } }} placeholder="Buscar produto ou combo..." />
                {selectedProd && !buscaProd.trim() ? (
                  <TouchableOpacity
                    style={[styles.chip, styles.chipActive, { alignSelf: 'flex-start', marginBottom: spacing.sm }]}
                    onPress={() => { setSelectedProd(null); setSimResult(null); }}
                  >
                    <Text style={[styles.chipText, styles.chipTextActive]} numberOfLines={1}>
                      {(() => { const found = produtos.find(p => p.id === selectedProd); if (found) return found.nome; const fc = combos.find(c => 'combo_' + c.id === selectedProd); return fc ? fc.nome + ' (Combo)' : ''; })()}
                    </Text>
                    <Feather name="x" size={12} color="#fff" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                ) : buscaProd.trim() ? (
                  <View style={[styles.chipRow, { marginBottom: spacing.sm }]}>
                    {[...produtos.filter(p => normalizeSearch(p.nome).includes(normalizeSearch(buscaProd))).map(p => ({ ...p, _key: p.id, _label: p.nome })),
                      ...combos.filter(c => normalizeSearch(c.nome).includes(normalizeSearch(buscaProd))).map(c => ({ ...c, _key: 'combo_' + c.id, _label: c.nome + ' (Combo)' })),
                    ].map(item => (
                      <TouchableOpacity
                        key={item._key}
                        style={[styles.chip, selectedProd === item._key && styles.chipActive]}
                        onPress={() => { setSelectedProd(item._key); setBuscaProd(''); setSimResult(null); }}
                      >
                        {item.isCombo && <Feather name="layers" size={12} color={selectedProd === item._key ? '#fff' : colors.textSecondary} style={{ marginRight: 2 }} />}
                        <Text style={[styles.chipText, selectedProd === item._key && styles.chipTextActive]} numberOfLines={1}>{item._label}</Text>
                        <Text style={[styles.chipPrice, selectedProd === item._key && { color: '#fff' }]}>{formatCurrency(item.preco_venda)}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}

                {/* Select platform */}
                <Text style={[styles.simLabel, { marginTop: spacing.md }]}>Selecione a plataforma</Text>
                <View style={styles.chipRow}>
                  {ativas.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={[styles.chip, selectedPlat === p.id && styles.chipActive]}
                      onPress={() => { setSelectedPlat(p.id); setSimResult(null); }}
                    >
                      <View style={[styles.suggestDot, { backgroundColor: getPlatColor(p.plataforma) }]} />
                      <Text style={[styles.chipText, selectedPlat === p.id && styles.chipTextActive]}>{p.plataforma}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Simulate button */}
                <TouchableOpacity
                  style={[styles.simBtn, (!selectedProd || !selectedPlat) && { opacity: 0.5 }]}
                  onPress={simularPreco}
                  disabled={!selectedProd || !selectedPlat}
                >
                  <Feather name="play" size={16} color="#fff" />
                  <Text style={styles.simBtnText}>Simular preço</Text>
                </TouchableOpacity>

                {/* Results */}
                {simResult && (
                  <View style={isDesktop ? { flexDirection: 'row', gap: 20 } : undefined}>
                  {/* Left column: analysis */}
                  <View style={isDesktop ? { flex: 3 } : undefined}>
                  <View style={styles.resultCard}>
                    <Text style={styles.resultTitle}>{simResult.prodNome} no {simResult.platNome}</Text>

                    {/* Comparison */}
                    <View style={styles.compareRow}>
                      <View style={styles.compareCol}>
                        <Text style={styles.compareLabel}>Preço Balcão</Text>
                        <Text style={styles.compareValue}>{formatCurrency(simResult.precoBalcao)}</Text>
                        <Text style={styles.compareSub}>Margem: {(simResult.margemBalcao * 100).toFixed(1)}%</Text>
                      </View>
                      <Feather name="arrow-right" size={20} color={colors.disabled} />
                      <View style={styles.compareCol}>
                        <Text style={styles.compareLabel}>Se vender a {formatCurrency(simResult.precoBalcao)}</Text>
                        <Text style={[styles.compareValue, { color: simResult.margemDelivery < 0.05 ? colors.error : simResult.margemDelivery < 0.15 ? colors.warning : colors.success }]}>
                          Margem: {(simResult.margemDelivery * 100).toFixed(1)}%
                        </Text>
                        <Text style={styles.compareSub}>Lucro: {formatCurrency(simResult.lucroDelivery)}/un</Text>
                      </View>
                    </View>

                    {/* Breakdown */}
                    <View style={styles.breakdownCard}>
                      <Text style={styles.breakdownTitle}>Composição no Delivery</Text>
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Preço no delivery</Text>
                        <Text style={styles.breakdownValue}>{formatCurrency(simResult.precoBalcao)}</Text>
                      </View>
                      {simResult.descontoPct > 0 && (
                        <View style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>1. Desconto promo ({simResult.descontoPct.toFixed(1)}%)</Text>
                          <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.valorDesconto)}</Text>
                        </View>
                      )}
                      {simResult.cupomReais > 0 && (
                        <View style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>2. Cupom (R$)</Text>
                          <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.cupomReais)}</Text>
                        </View>
                      )}
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>3. Comissão ({simResult.comissaoPct.toFixed(1)}% s/ {formatCurrency(simResult.baseComissao)})</Text>
                        <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.valorComissao)}</Text>
                      </View>
                      {simResult.taxaEntrega > 0 && (
                        <View style={styles.breakdownRow}>
                          <Text style={styles.breakdownLabel}>4. Taxa de entrega</Text>
                          <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.taxaEntrega)}</Text>
                        </View>
                      )}
                      <View style={styles.breakdownRow}>
                        <Text style={styles.breakdownLabel}>Custo do produto (CMV)</Text>
                        <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.custoUnit)}</Text>
                      </View>
                      <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
                        <Text style={[styles.breakdownLabel, { fontFamily: fontFamily.bold }]}>Receita líquida</Text>
                        <Text style={[styles.breakdownValue, { fontFamily: fontFamily.bold }]}>{formatCurrency(simResult.receitaLiqDelivery)}</Text>
                      </View>
                    </View>

                    {/* Suggested prices */}
                    <View style={styles.suggestedCard}>
                      <Text style={styles.suggestedTitle}>Preços sugeridos</Text>
                      {/* Margin input */}
                      <View style={[styles.suggestedRow, { borderTopWidth: 0 }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.suggestedLabel}>Margem desejada</Text>
                          <Text style={styles.suggestedSub}>Ajuste para recalcular o preço sugerido</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <TextInput
                            style={[styles.platInput, { width: 60, textAlign: 'center', fontSize: 16, fontFamily: fontFamily.bold }]}
                            value={margemDesejada}
                            onChangeText={(v) => { setMargemDesejada(v.replace(/[^0-9.,]/g, '')); }}
                            onBlur={() => { simularPreco(); }}
                            keyboardType="numeric"
                            selectTextOnFocus
                          />
                          <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: colors.text }}>%</Text>
                        </View>
                      </View>
                      {simResult.precoSugerido && (
                        <View style={styles.suggestedRow}>
                          <View>
                            <Text style={styles.suggestedLabel}>Para atingir {(simResult.margemAlvo * 100).toFixed(0)}% de margem</Text>
                            <Text style={styles.suggestedSub}>Preço ideal no delivery</Text>
                          </View>
                          <Text style={[styles.suggestedPrice, { color: colors.success }]}>{formatCurrency(simResult.precoSugerido)}</Text>
                        </View>
                      )}
                      <View style={styles.suggestedRow}>
                        <View>
                          <Text style={styles.suggestedLabel}>Preço mínimo (sem lucro)</Text>
                          <Text style={styles.suggestedSub}>Apenas cobre os custos</Text>
                        </View>
                        <Text style={[styles.suggestedPrice, { color: colors.error }]}>{formatCurrency(simResult.precoMinimo)}</Text>
                      </View>
                    </View>
                  </View>
                  </View>

                  {/* Right column: custom price calculator */}
                  <View style={isDesktop ? { flex: 2, position: 'sticky', top: 80, alignSelf: 'flex-start' } : undefined}>
                    <View style={[styles.breakdownCard, { borderWidth: 2, borderColor: colors.primary + '30', marginTop: isDesktop ? 0 : spacing.md }]}>
                      <Text style={styles.breakdownTitle}>Quanto quero cobrar na plataforma?</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm, fontFamily: fontFamily.regular }}>
                        Digite o preço que pretende cobrar e veja a composição real
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                        <Text style={{ fontSize: 15, fontFamily: fontFamily.bold, color: colors.text }}>R$</Text>
                        <TextInput
                          style={[styles.platInput, { flex: 1, fontSize: 18, fontFamily: fontFamily.bold, textAlign: 'center' }]}
                          value={precoCustom}
                          onChangeText={setPrecoCustom}
                          keyboardType="numeric"
                          placeholder={simResult.precoSugerido ? simResult.precoSugerido.toFixed(2) : '0,00'}
                          placeholderTextColor={colors.disabled}
                        />
                      </View>
                      {(() => {
                        const custom = calcCustom();
                        if (!custom) return null;
                        return (
                          <View style={{ marginTop: spacing.md }}>
                            <View style={styles.breakdownRow}>
                              <Text style={styles.breakdownLabel}>Preço na plataforma</Text>
                              <Text style={[styles.breakdownValue, { fontFamily: fontFamily.bold }]}>{formatCurrency(custom.preco)}</Text>
                            </View>
                            <View style={styles.breakdownRow}>
                              <Text style={styles.breakdownLabel}>Comissão ({simResult.comissaoPct.toFixed(1)}%)</Text>
                              <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(custom.preco * simResult.comissaoPct / 100)}</Text>
                            </View>
                            {simResult.descontoPct > 0 && (
                              <View style={styles.breakdownRow}>
                                <Text style={styles.breakdownLabel}>Desconto ({simResult.descontoPct.toFixed(1)}%)</Text>
                                <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(custom.preco * simResult.descontoPct / 100)}</Text>
                              </View>
                            )}
                            {simResult.cupomReais > 0 && (
                              <View style={styles.breakdownRow}>
                                <Text style={styles.breakdownLabel}>Cupom</Text>
                                <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.cupomReais)}</Text>
                              </View>
                            )}
                            {simResult.taxaEntrega > 0 && (
                              <View style={styles.breakdownRow}>
                                <Text style={styles.breakdownLabel}>Taxa de entrega</Text>
                                <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.taxaEntrega)}</Text>
                              </View>
                            )}
                            <View style={styles.breakdownRow}>
                              <Text style={styles.breakdownLabel}>CMV do produto</Text>
                              <Text style={[styles.breakdownValue, { color: colors.error }]}>-{formatCurrency(simResult.custoUnit)}</Text>
                            </View>
                            <View style={[styles.breakdownRow, { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 4 }]}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={[styles.breakdownLabel, { fontFamily: fontFamily.bold }]}>Lucro Bruto /un</Text>
                                <InfoTooltip
                                  title="Lucro Bruto por Unidade"
                                  text="É o valor que sobra após descontar comissões, taxas e custo do produto. Ainda não inclui despesas fixas do negócio (aluguel, energia, funcionários) nem impostos."
                                />
                              </View>
                              <Text style={[styles.breakdownValue, { fontFamily: fontFamily.bold, color: custom.lucro >= 0 ? colors.success : colors.error }]}>{formatCurrency(custom.lucro)}</Text>
                            </View>
                            <View style={styles.breakdownRow}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                                <Text style={[styles.breakdownLabel, { fontFamily: fontFamily.bold }]}>Margem</Text>
                                <InfoTooltip
                                  title="Margem no Delivery"
                                  text="Percentual de lucro bruto sobre o preço cobrado na plataforma, após descontar CMV, comissão, cupom e taxa de entrega. Não inclui despesas fixas do negócio."
                                  examples={['Acima de 15%: saudável', '5-15%: atenção', 'Abaixo de 5%: revise o preço']}
                                />
                              </View>
                              <Text style={[styles.breakdownValue, { fontFamily: fontFamily.bold, fontSize: 18, color: custom.margem >= 0.15 ? colors.success : custom.margem >= 0.05 ? colors.warning : colors.error }]}>
                                {(custom.margem * 100).toFixed(1)}%
                              </Text>
                            </View>
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {activeTab === 'visaogeral' && (
          <>
            <View style={styles.infoCard}>
              <Feather name="grid" size={16} color={colors.primary} />
              <Text style={styles.infoText}>
                Visão geral de todos os seus produtos em cada plataforma ativa, com preço sugerido e impacto na margem.
              </Text>
            </View>

            {ativas.length === 0 ? (
              <EmptyState icon="smartphone" title="Nenhuma plataforma ativa" description="Ative pelo menos uma plataforma para ver a visão geral." />
            ) : (
              ativas.map(plat => {
                const comissao = (plat.comissao_app || plat.taxa_plataforma || 0) / 100;
                const descPct = (plat.desconto_promocao || 0) / 100;
                const cupom = plat.embalagem_extra || 0;
                const taxaEnt = plat.taxa_entrega || 0;
                const fixos = cupom + taxaEnt;
                const cor = getPlatColor(plat.plataforma);

                const isExpanded = expandedPlats[plat.id];

                return (
                  <View key={plat.id} style={styles.overviewCard}>
                    <TouchableOpacity
                      style={styles.overviewHeader}
                      onPress={() => setExpandedPlats(prev => ({ ...prev, [plat.id]: !prev[plat.id] }))}
                      activeOpacity={0.7}
                    >
                      <View style={[styles.platDot, { backgroundColor: cor }]} />
                      <Text style={styles.overviewPlatName}>{plat.plataforma}</Text>
                      <Text style={styles.overviewPlatTax}>Comissão: {(comissao * 100).toFixed(0)}%</Text>
                      <Feather name={isExpanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSecondary} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>

                    {isExpanded && <>
                    {/* Table header */}
                    <View style={styles.overviewTableHeader}>
                      <Text style={[styles.overviewTh, { flex: 2 }]}>Produto</Text>
                      <Text style={[styles.overviewTh, { flex: 1, textAlign: 'center' }]}>Balcão</Text>
                      <Text style={[styles.overviewTh, { flex: 1, textAlign: 'center' }]}>Sugerido</Text>
                      <Text style={[styles.overviewTh, { flex: 1, textAlign: 'center' }]}>Margem</Text>
                    </View>

                    {[...produtos.map(p => ({ ...p, _key: 'prod_' + p.id, _label: p.nome })),
                      ...combos.map(c => ({ ...c, _key: 'combo_' + c.id, _label: c.nome + ' (Combo)' })),
                    ].map((prod, idx) => {
                      // Fórmula corrigida: desconto -> cupom -> comissão sobre (valor após cupom + frete) -> taxa entrega
                      const precoComDesc = prod.preco_venda * (1 - descPct);
                      const precoAposCupom = precoComDesc - cupom;
                      const baseComissaoVG = precoAposCupom + taxaEnt;
                      const valorComissao = baseComissaoVG * comissao;
                      const recLiq = precoAposCupom - valorComissao - taxaEnt;
                      const lucro = recLiq - prod.custoUnit;
                      const margemDel = prod.preco_venda > 0 ? lucro / prod.preco_venda : 0;
                      const margemAlvoVG = (parseFloat(margemDesejada) || 30) / 100;
                      const numSug = cupom * (1 - comissao) + taxaEnt + prod.custoUnit;
                      const divisor = (1 - descPct) * (1 - comissao) - margemAlvoVG;
                      const precoSug = divisor > 0 ? numSug / divisor : 0;

                      return (
                        <View key={prod._key} style={[styles.overviewRow, idx % 2 === 0 && { backgroundColor: colors.inputBg }]}>
                          <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                            {prod.isCombo && <Feather name="layers" size={12} color={colors.textSecondary} />}
                            <Text style={[styles.overviewTd]} numberOfLines={1}>{prod._label}</Text>
                          </View>
                          <Text style={[styles.overviewTd, { flex: 1, textAlign: 'center' }]}>{formatCurrency(prod.preco_venda)}</Text>
                          <Text style={[styles.overviewTd, { flex: 1, textAlign: 'center', color: colors.primary, fontFamily: fontFamily.semiBold }]}>
                            {precoSug > 0 ? formatCurrency(precoSug) : '—'}
                          </Text>
                          <Text style={[styles.overviewTd, { flex: 1, textAlign: 'center', color: margemDel < 0.05 ? colors.error : margemDel < 0.15 ? colors.warning : colors.success, fontFamily: fontFamily.semiBold }]}>
                            {(margemDel * 100).toFixed(1)}%
                          </Text>
                        </View>
                      );
                    })}
                    </>}
                  </View>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      {/* Delete modal */}
      <ConfirmDeleteModal
        visible={!!deleteModal}
        onClose={() => setDeleteModal(null)}
        onConfirm={() => deleteModal && deletePlataforma(deleteModal.id)}
        itemName={deleteModal?.plataforma || ''}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 60 },

  // Tabs
  tabsContainer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  tabsRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  tab: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
  },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  tabTextActive: { color: '#fff' },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 18 },

  // Count
  countText: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: spacing.sm },

  // Platform card
  platCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  platHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md,
  },
  platDot: { width: 10, height: 10, borderRadius: 5, marginRight: spacing.sm },
  platName: { flex: 1, fontSize: fonts.body, fontFamily: fontFamily.semiBold, color: colors.text },
  platStatus: { fontSize: 11, fontFamily: fontFamily.medium },
  platBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  platFieldsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  platField: { flex: 1, minWidth: 120 },
  platFieldLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: 4 },
  platInput: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    padding: 10, fontSize: fonts.body, fontFamily: fontFamily.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border, height: 40,
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
  deleteBtnText: { fontSize: 12, color: colors.error, fontFamily: fontFamily.medium },

  // Add platform
  addPlatCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addPlatTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  addPlatRow: { flexDirection: 'row', gap: spacing.sm },
  addBtn: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
  },
  suggestDot: { width: 8, height: 8, borderRadius: 4 },
  suggestText: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium },

  // Simulator
  simLabel: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.xs },
  chipScroll: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: borderRadius.sm, backgroundColor: colors.inputBg,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  chipTextActive: { color: '#fff' },
  chipPrice: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: 12, marginTop: spacing.md, marginBottom: spacing.md,
  },
  simBtnText: { color: '#fff', fontSize: fonts.body, fontFamily: fontFamily.semiBold },

  // Results
  resultCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  resultTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.md },
  compareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.md,
  },
  compareCol: { flex: 1, alignItems: 'center' },
  compareLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, textAlign: 'center', marginBottom: 4 },
  compareValue: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.text },
  compareSub: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },

  breakdownCard: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  breakdownTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  breakdownLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular },
  breakdownValue: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text },

  suggestedCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
  },
  suggestedTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, padding: spacing.md, paddingBottom: spacing.xs },
  suggestedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border,
  },
  suggestedLabel: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  suggestedSub: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },
  suggestedPrice: { fontSize: 20, fontFamily: fontFamily.bold },

  // Overview (Visão Geral)
  overviewCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.md, overflow: 'hidden',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  overviewHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  overviewPlatName: { flex: 1, fontSize: 15, fontFamily: fontFamily.bold, color: colors.text },
  overviewPlatTax: { fontSize: 12, fontFamily: fontFamily.medium, color: colors.textSecondary },
  overviewTableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  overviewTh: { fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.textSecondary, textTransform: 'uppercase' },
  overviewRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.md },
  overviewTd: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.text },
});
