import React, { useState, useCallback, useMemo, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { Feather } from '@expo/vector-icons';
import Card from '../components/Card';
import InputField from '../components/InputField';
import SearchBar from '../components/SearchBar';
import InfoTooltip from '../components/InfoTooltip';
import Chip from '../components/Chip';
import EmptyState from '../components/EmptyState';
import InviabilidadeModal from '../components/InviabilidadeModal';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo, calcMargem, calcDespesasFixasPercentual } from '../utils/calculations';
// Sprint 2 S3 — fórmula canônica única em src/utils/deliveryPricing.js
import { calcPrecoBreakEven, calcResultadoDelivery, calcSugestaoDeliveryCompleta, compararDeliveryVsBalcao } from '../utils/deliveryPricing';
// APP-25: extrair imposto separado das demais variáveis (maquininha não entra no delivery)
import { extrairImpostoPercentual } from '../utils/deliveryAdapter';
import ComoCalculadoModal from '../components/ComoCalculadoModal';
import usePersistedState from '../hooks/usePersistedState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

// Numeric helpers (defesa contra NaN/Infinity em precificação)
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function parseInputNumber(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  const parsed = parseFloat(String(raw).replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

// Color cycling for avatars and category headers (matches MateriasPrimasScreen)
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

function roundUpTo50(value) {
  return Math.ceil(value * 2) / 2;
}

export default function DeliveryPrecosScreen() {
  const [plataformas, setPlataformas] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [combos, setCombos] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [searchText, setSearchText] = usePersistedState('deliveryPrecos.busca', '');
  const [expandedCats, setExpandedCats] = useState({});
  const [expandedItems, setExpandedItems] = useState({});
  const [customPrices, setCustomPrices] = usePersistedState('deliveryPrecos.customPrices', {});
  const [showLegend, setShowLegend] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [inviabilidadeInfo, setInviabilidadeInfo] = useState(null);
  // APP-25: contexto financeiro pra entrar na fórmula completa do delivery
  // (lucro delivery, custos fixos %, imposto %).
  const [contextoFinanceiro, setContextoFinanceiro] = useState({ lucroPerc: 0.15, fixoPerc: 0, impostoPerc: 0 });
  // APP-19/24b: modal de transparência
  const [comoCalculado, setComoCalculado] = useState(null); // { resultado, titulo } | null
  const isLoadingRef = useRef(false);
  const { isMobile } = useResponsiveLayout();

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadError(null);
    try {
      const db = await getDatabase();

    const [plats, cats, prods, allIngs, allPreps, allEmbs,
           embalagensList, preparosList, materiasList, adicionaisList,
           dProds, allDProdItens, combosList, allComboItens,
           cfgRows, fixasRows, varsRows, fatRows] = await Promise.all([
      db.getAllAsync('SELECT * FROM delivery_config WHERE ativo = 1 ORDER BY id'),
      db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      db.getAllAsync('SELECT id, nome, preco_unitario FROM embalagens ORDER BY nome'),
      db.getAllAsync('SELECT id, nome, custo_por_kg FROM preparos ORDER BY nome'),
      db.getAllAsync('SELECT id, nome, preco_por_kg, unidade_medida FROM materias_primas ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_adicionais ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_produtos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_produto_itens'),
      db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM delivery_combo_itens'),
      // APP-25: contexto financeiro pra fórmula completa
      db.getAllAsync('SELECT * FROM configuracao'),
      db.getAllAsync('SELECT valor FROM despesas_fixas'),
      db.getAllAsync('SELECT descricao, percentual FROM despesas_variaveis'),
      db.getAllAsync('SELECT valor FROM faturamento_mensal WHERE valor > 0'),
    ]);

    setPlataformas(plats);
    setCategorias(cats);

    // APP-25: monta contexto financeiro
    try {
      const cfg = cfgRows?.[0] || {};
      const totalFixas = (fixasRows || []).reduce((a, r) => a + (Number.isFinite(r.valor) ? r.valor : 0), 0);
      const fatMedio = (fatRows || []).length > 0
        ? (fatRows || []).reduce((a, r) => a + (Number.isFinite(r.valor) ? r.valor : 0), 0) / (fatRows || []).length
        : 0;
      const fixoPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
      // No delivery, lucro pode ser específico (APP-26). Por enquanto usa o do balcão como default.
      const lucroPerc = Number.isFinite(cfg.lucro_desejado_delivery) ? cfg.lucro_desejado_delivery
                      : Number.isFinite(cfg.lucro_desejado) ? cfg.lucro_desejado : 0.15;
      // Imposto: separado das demais variáveis (maquininha não entra no delivery — APP-25)
      const impostoPerc = extrairImpostoPercentual(varsRows || []);
      setContextoFinanceiro({ lucroPerc, fixoPerc, impostoPerc });
    } catch (e) {
      console.warn('[DeliveryPrecos.contextoFinanceiro] falha ao montar:', e);
    }

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

      result.push({
        id: p.id,
        nome: p.nome,
        precoVenda: p.preco_venda || 0,
        custoUnitario,
        categoria_id: p.categoria_id || null,
        tipo: 'produto',
      });
    }
    setProdutos(result);

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
          if (prep) custo += calcCustoPreparo(prep.custo_por_kg, item.quantidade, 'g');
        } else if (item.tipo === 'materia_prima') {
          const mp = materiasList.find(m => m.id === item.item_id);
          if (mp) custo += calcCustoIngrediente(mp.preco_por_kg, item.quantidade, mp.unidade_medida, 'g');
        } else if (item.tipo === 'adicional') {
          const add = adicionaisList.find(a => a.id === item.item_id);
          if (add) custo += add.custo * item.quantidade;
        }
      }
      dProdsWithCost.push({ ...dp, custo });
    }

    // Build combo items lookup
    const comboItensByCombo = {};
    (allComboItens || []).forEach(i => { (comboItensByCombo[i.combo_id] = comboItensByCombo[i.combo_id] || []).push(i); });

    const combosResult = [];
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
        } else if (item.tipo === 'materia_prima') {
          const mp = materiasList.find(m => m.id === item.item_id);
          if (mp) custo += calcCustoIngrediente(mp.preco_por_kg, item.quantidade, mp.unidade_medida, 'g');
        } else if (item.tipo === 'embalagem') {
          const emb = embalagensList.find(e => e.id === item.item_id);
          if (emb) custo += emb.preco_unitario * item.quantidade;
        } else if (item.tipo === 'preparo') {
          const prep = preparosList.find(p => p.id === item.item_id);
          if (prep) custo += calcCustoPreparo(prep.custo_por_kg, item.quantidade, 'g');
        } else if (item.tipo === 'adicional') {
          const add = adicionaisList.find(a => a.id === item.item_id);
          if (add) custo += add.custo * item.quantidade;
        }
      }
      combosResult.push({
        id: `combo-${combo.id}`,
        nome: combo.nome,
        precoVenda: safeNum(combo.preco_venda),
        custoUnitario: safeNum(custo),
        tipo: 'combo',
      });
    }
    setCombos(combosResult);
    } catch (e) {
      console.error('[DeliveryPrecosScreen.loadData]', e);
      setLoadError('Não conseguimos carregar os dados de precificação. Verifique sua conexão e tente novamente.');
    } finally {
      isLoadingRef.current = false;
    }
  }

  // APP-25: NOVO — preço sugerido delivery via fórmula completa (markup divisor)
  // que inclui Lucro%, Fixos%, Imposto%, Comissão%, Taxa pgto online%, Cupom R$, Frete subsidiado R$.
  // Substitui a antiga calcPrecoBreakEven que só calculava break-even (sem lucro nem custos fixos).
  // O segundo parâmetro agora é o CMV unitário, não o preço balcão.
  function calcDeliveryPriceFromCmv(cmv, plat) {
    if (safeNum(cmv) <= 0) return { preco: 0, validacao: { ok: false, nivel: 'ok', mensagem: '' } };
    return calcSugestaoDeliveryCompleta({ cmv, plat, contexto: contextoFinanceiro });
  }

  // Compat shim: telas que ainda passam (precoBalcao, plat) recebem a fórmula nova
  // usando o preço balcão como aproximação de CMV (legado para break-even).
  function calcDeliveryPrice(precoVenda, plat) {
    if (safeNum(precoVenda) <= 0) return 0;
    return calcPrecoBreakEven(precoVenda, plat);
  }

  function toggleCategory(catId) {
    setExpandedCats(prev => ({ ...prev, [catId]: !prev[catId] }));
  }

  function toggleItem(itemId) {
    setExpandedItems(prev => ({ ...prev, [itemId]: !prev[itemId] }));
  }

  function handleCustomPrice(itemId, platId, value) {
    setCustomPrices(prev => ({ ...prev, [`${itemId}-${platId}`]: value }));
  }

  function getEffectivePrice(itemId, platId, suggestedPrice) {
    const key = `${itemId}-${platId}`;
    const custom = customPrices[key];
    if (custom !== undefined && custom !== '') {
      const parsed = parseInputNumber(custom);
      if (parsed !== null && parsed >= 0) return parsed;
    }
    // suggestedPrice pode ser null (inviável) — preserva null
    return suggestedPrice;
  }

  const allItems = useMemo(() => [...produtos, ...combos], [produtos, combos]);

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) return allItems;
    const normalized = normalizeSearch(searchText.trim());
    return allItems.filter(p => normalizeSearch(p.nome).includes(normalized));
  }, [allItems, searchText]);

  const groupedProducts = useMemo(() => {
    const groups = {};
    const noCatKey = '__sem_categoria__';
    const comboKey = '__combos__';

    for (const item of filteredItems) {
      if (item.tipo === 'combo') {
        if (!groups[comboKey]) groups[comboKey] = [];
        groups[comboKey].push(item);
      } else {
        const key = item.categoria_id || noCatKey;
        if (!groups[key]) groups[key] = [];
        groups[key].push(item);
      }
    }

    const result = [];
    for (const cat of categorias) {
      if (groups[cat.id]) {
        result.push({ id: cat.id, nome: cat.nome, items: groups[cat.id] });
      }
    }
    if (groups[noCatKey]) {
      result.push({ id: noCatKey, nome: 'Sem categoria', items: groups[noCatKey] });
    }
    if (groups[comboKey]) {
      result.push({ id: comboKey, nome: 'Combos', items: groups[comboKey] });
    }

    return result;
  }, [filteredItems, categorias]);

  // Summary stats
  const summaryStats = useMemo(() => {
    if (plataformas.length === 0 || allItems.length === 0) return null;
    let totalLucro = 0;
    let countItems = 0;
    let negativos = 0;
    let inviaveis = 0;
    for (const item of allItems) {
      const precoVenda = safeNum(item.precoVenda);
      if (precoVenda <= 0) continue;
      const custoUn = safeNum(item.custoUnitario);
      for (const plat of plataformas) {
        const suggested = calcDeliveryPrice(precoVenda, plat);
        const price = getEffectivePrice(item.id, plat.id, suggested);
        // price pode ser null (inviável). Conta como inviável e pula soma.
        if (price === null || !Number.isFinite(price) || price <= 0) {
          inviaveis++;
          countItems++;
          negativos++;
          continue;
        }
        // Sessão 28.9 — Auditoria P0-03: usar fonte canônica calcResultadoDelivery
        // (antes essa tela tinha fórmula divergente — usava comissao_app como R$ quando é %).
        const r = calcResultadoDelivery({ precoVenda: price, custoUnit: custoUn, plat });
        if (Number.isFinite(r.lucro)) {
          totalLucro += r.lucro;
          if (r.lucro < 0) negativos++;
        }
        countItems++;
      }
    }
    return {
      lucroMedio: countItems > 0 ? totalLucro / countItems : 0,
      negativos,
      inviaveis,
      totalCombinacoes: countItems,
    };
  }, [allItems, plataformas, customPrices]);

  // Build a color map for categories (stable by index)
  const catColorMap = useMemo(() => {
    const map = {};
    categorias.forEach((c, i) => { map[c.id] = getCategoryColor(i); });
    map['__sem_categoria__'] = colors.disabled;
    map['__combos__'] = colors.purple;
    return map;
  }, [categorias]);

  function renderPlatformRow(item, plat) {
    const custoUn = safeNum(item.custoUnitario);
    const precoVenda = safeNum(item.precoVenda);
    // APP-25: usar fórmula completa (CMV + lucro + fixos + imposto + comissão + taxa pgto online + cupom + frete)
    const sugDelivery = calcDeliveryPriceFromCmv(custoUn, plat);
    const precoSugerido = sugDelivery?.preco > 0 ? sugDelivery.preco : null;
    // APP-27: validação automática delivery vs balcão
    const validacaoVsBalcao = precoSugerido && precoVenda > 0
      ? compararDeliveryVsBalcao(precoSugerido, precoVenda) : null;
    const precoDeliveryRaw = getEffectivePrice(item.id, plat.id, precoSugerido);
    const inviavelInicial = precoDeliveryRaw === null || !Number.isFinite(precoDeliveryRaw) || precoDeliveryRaw <= 0;
    const precoDelivery = inviavelInicial ? 0 : precoDeliveryRaw;
    // Sessão 28.9 — Auditoria P0-03: usar fonte canônica calcResultadoDelivery
    // (antes essa tela computava manualmente: taxa%, comissao_app como R$ - errado, desconto%)
    const r = calcResultadoDelivery({ precoVenda: precoDelivery, custoUnit: custoUn, plat });
    const taxaPct = safeNum(plat.taxa_plataforma);  // mantido para o badge "X%"
    const taxaPlatValor = r.valorComissao;
    const comissaoApp = 0; // legacy — já incluso em valorComissao
    const descontoPct = safeNum(plat.desconto_promocao);
    const descontoValor = r.valorDesconto;
    const lucro = Number.isFinite(r.lucro) ? r.lucro : 0;
    const margem = (!inviavelInicial && precoDelivery > 0) ? r.margem * 100 : 0;
    const inviavel = inviavelInicial || r.inviavel;
    const isPositive = !inviavel && lucro >= 0;
    const customKey = `${item.id}-${plat.id}`;

    return (
      <View key={plat.id} style={styles.platformRow}>
        <View style={styles.platHeader}>
          <Feather name="smartphone" size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
          <Text style={styles.platName}>{plat.plataforma}</Text>
          <Chip
            label={`${plat.taxa_plataforma}%`}
            tooltip={`Taxa da plataforma ${plat.plataforma}: ${plat.taxa_plataforma}%`}
            color={colors.accent}
            style={styles.platTaxaBadge}
            textStyle={styles.platTaxaText}
          />
        </View>

        {(inviavel || (!inviavel && lucro < 0)) && (
          <TouchableOpacity
            style={styles.inviavelBanner}
            onPress={() => setInviabilidadeInfo({
              itemNome: item.nome,
              plataformaNome: plat.plataforma,
              custoUnitario: custoUn,
              precoBalcao: precoVenda,
              taxaPct,
              comissaoApp,
              descontoPct,
              precoDelivery,
              lucro,
              inviavel,
            })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={inviavel
              ? `Preço inviável em ${plat.plataforma} — toque para ver detalhes e dicas`
              : `Venda com prejuízo em ${plat.plataforma} — toque para ver detalhes e dicas`}
          >
            <Feather name="alert-octagon" size={12} color={colors.error} style={{ marginRight: 4 }} />
            <Text style={styles.inviavelBannerText}>
              {inviavel
                ? 'Taxa cobre/excede o preço — toque para ver dicas'
                : `Prejuízo de ${formatCurrency(Math.abs(lucro))} — toque para ver dicas`}
            </Text>
            <Feather name="chevron-right" size={12} color={colors.error} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}

        {/* APP-27/27b: validação automática delivery vs balcão + viabilidade da fórmula */}
        {sugDelivery?.validacao && !sugDelivery.validacao.ok && (
          <View style={[styles.inviavelBanner, { backgroundColor: colors.error + '14' }]}>
            <Feather name="x-octagon" size={12} color={colors.error} style={{ marginRight: 4 }} />
            <Text style={styles.inviavelBannerText}>{sugDelivery.validacao.mensagem}</Text>
          </View>
        )}
        {validacaoVsBalcao && !validacaoVsBalcao.ok && (
          <View style={[styles.inviavelBanner, {
            backgroundColor: (validacaoVsBalcao.nivel === 'critico' ? colors.error : colors.warning) + '14',
          }]}>
            <Feather
              name={validacaoVsBalcao.nivel === 'critico' ? 'alert-octagon' : 'alert-triangle'}
              size={12}
              color={validacaoVsBalcao.nivel === 'critico' ? colors.error : colors.warning}
              style={{ marginRight: 4 }}
            />
            <Text style={[styles.inviavelBannerText, {
              color: validacaoVsBalcao.nivel === 'critico' ? colors.error : colors.warning,
            }]}>{validacaoVsBalcao.mensagem}</Text>
          </View>
        )}

        {isMobile ? (
          /* Sessão 28+ — mobile-web: layout empilhado para Sugerido / Input / Lucro+Margem */
          <View style={styles.priceStackMobile}>
            <TouchableOpacity
              style={styles.priceStackRow}
              activeOpacity={0.7}
              onPress={() => sugDelivery && setComoCalculado({ resultado: sugDelivery, titulo: `${item.nome} — ${plat.plataforma}` })}
              accessibilityRole="button"
              accessibilityLabel="Ver como o preço sugerido foi calculado"
            >
              <Text style={styles.priceStackLabel}>Sugerido <Feather name="info" size={11} color={colors.primary} />:</Text>
              <Text style={styles.priceStackValue}>
                {precoSugerido === null ? '—' : formatCurrency(precoSugerido)}
              </Text>
            </TouchableOpacity>
            <View style={styles.priceStackRow}>
              <Text style={styles.priceStackLabel}>Preço Delivery:</Text>
              <View style={{ flex: 1, marginLeft: 12, maxWidth: 140 }}>
                <InputField
                  value={
                    customPrices[customKey] !== undefined
                      ? String(customPrices[customKey])
                      : (precoSugerido !== null && Number.isFinite(precoSugerido))
                        ? String(precoSugerido.toFixed(2).replace('.', ','))
                        : ''
                  }
                  onChangeText={(val) => handleCustomPrice(item.id, plat.id, val)}
                  keyboardType="numeric"
                  placeholder="0,00"
                  style={styles.deliveryInput}
                  inputStyle={styles.deliveryInputField}
                  accessibilityLabel={`Preço delivery em ${plat.plataforma} para ${item.nome}`}
                />
              </View>
            </View>
            <View style={styles.priceStackRow}>
              <Text style={styles.priceStackLabel}>Lucro:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[styles.priceStackValue, { color: isPositive ? colors.success : colors.error }]}>
                  {inviavel ? '—' : formatCurrency(lucro)}
                </Text>
                <View style={[styles.margemChip, { backgroundColor: isPositive ? colors.success + '14' : colors.error + '14' }]}>
                  <Text style={[styles.margemChipText, { color: isPositive ? colors.success : colors.error }]}>
                    {inviavel ? '—' : `${margem.toFixed(1)}%`}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        ) : (
          <View style={styles.priceRow}>
            <View style={styles.priceCol}>
              <Text style={styles.priceLabel}>Sugerido</Text>
              <Text style={styles.priceValue}>
                {precoSugerido === null ? '—' : formatCurrency(precoSugerido)}
              </Text>
            </View>
            <View style={[styles.priceCol, { flex: 1.2 }]}>
              <Text style={styles.priceLabel}>Preço Delivery</Text>
              <InputField
                value={
                  customPrices[customKey] !== undefined
                    ? String(customPrices[customKey])
                    : (precoSugerido !== null && Number.isFinite(precoSugerido))
                      ? String(precoSugerido.toFixed(2).replace('.', ','))
                      : ''
                }
                onChangeText={(val) => handleCustomPrice(item.id, plat.id, val)}
                keyboardType="numeric"
                placeholder="0,00"
                style={styles.deliveryInput}
                inputStyle={styles.deliveryInputField}
                accessibilityLabel={`Preço delivery em ${plat.plataforma} para ${item.nome}`}
              />
            </View>
            <View style={[styles.priceCol, { alignItems: 'flex-end' }]}>
              <Text style={styles.priceLabel}>Lucro</Text>
              <Text style={[styles.lucroValue, { color: isPositive ? colors.success : colors.error }]}>
                {inviavel ? '—' : formatCurrency(lucro)}
              </Text>
              <View style={[styles.margemChip, { backgroundColor: isPositive ? colors.success + '14' : colors.error + '14' }]}>
                <Text style={[styles.margemChipText, { color: isPositive ? colors.success : colors.error }]}>
                  {inviavel ? '—' : `${margem.toFixed(1)}%`}
                </Text>
              </View>
            </View>
          </View>
        )}

        <View style={styles.breakdownRow}>
          <View style={styles.breakdownChip}>
            <Feather name="dollar-sign" size={8} color={colors.textSecondary} style={{ marginRight: 2 }} />
            <Text style={styles.breakdownChipText}>Custo {formatCurrency(item.custoUnitario)}</Text>
          </View>
          <View style={styles.breakdownChip}>
            <Feather name="percent" size={8} color={colors.textSecondary} style={{ marginRight: 2 }} />
            <Text style={styles.breakdownChipText}>Taxa {formatCurrency(taxaPlatValor)}</Text>
          </View>
          {comissaoApp > 0 && (
            <View style={styles.breakdownChip}>
              <Text style={styles.breakdownChipText}>Com. {formatCurrency(comissaoApp)}</Text>
            </View>
          )}
          {descontoValor > 0 && (
            <View style={styles.breakdownChip}>
              <Feather name="tag" size={8} color={colors.textSecondary} style={{ marginRight: 2 }} />
              <Text style={styles.breakdownChipText}>Desc. {formatCurrency(descontoValor)}</Text>
            </View>
          )}
        </View>
      </View>
    );
  }

  const hasItems = produtos.length > 0 || combos.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {loadError && (
        <View
          style={styles.errorBanner}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
        >
          <Feather name="alert-triangle" size={14} color={colors.error} style={{ marginRight: 6 }} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity
            onPress={loadData}
            style={styles.errorRetryBtn}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar novamente"
          >
            <Text style={styles.errorRetryText}>Tentar novamente</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Summary card */}
      {summaryStats && (
        <View style={styles.summaryRow}>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconCircle, { backgroundColor: (summaryStats.lucroMedio >= 0 ? colors.success : colors.error) + '14' }]}>
              <Feather name="trending-up" size={14} color={summaryStats.lucroMedio >= 0 ? colors.success : colors.error} />
            </View>
            <Text style={[styles.summaryValue, { color: summaryStats.lucroMedio >= 0 ? colors.success : colors.error }]}>
              {formatCurrency(summaryStats.lucroMedio)}
            </Text>
            <Text style={styles.summaryLabel}>Lucro medio</Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconCircle, { backgroundColor: (summaryStats.negativos > 0 ? colors.error : colors.success) + '14' }]}>
              <Feather name="alert-triangle" size={14} color={summaryStats.negativos > 0 ? colors.error : colors.success} />
            </View>
            <Text style={[styles.summaryValue, { color: summaryStats.negativos > 0 ? colors.error : colors.success }]}>
              {summaryStats.negativos}
            </Text>
            <Text style={styles.summaryLabel}>Com prejuízo</Text>
          </View>
          <View style={styles.summaryItem}>
            <View style={[styles.summaryIconCircle, { backgroundColor: colors.primary + '14' }]}>
              <Feather name="package" size={14} color={colors.primary} />
            </View>
            <Text style={styles.summaryValue}>{allItems.length}</Text>
            <Text style={styles.summaryLabel}>Itens</Text>
          </View>
        </View>
      )}

      <Card
        title="Precificação Delivery"
        headerRight={
          <InfoTooltip
            title="Preços de Delivery"
            text="Para cada produto ou combo, veja o preço sugerido em cada plataforma ativa. Clique na categoria para expandir, depois no item para ver os detalhes por plataforma."
            examples={[
              'Sugerido = Arredondar(Balcão / (1 - Taxa%))',
              'Lucro = Delivery - Custo - Taxa - Comissão - Desconto',
              'Verde = lucro positivo / Vermelho = prejuízo',
            ]}
          />
        }
      >
        {!hasItems ? (
          <EmptyState
            icon="dollar-sign"
            title="Sem itens para precificar"
            description="Cadastre produtos ou combos para ver a precificação delivery."
          />
        ) : plataformas.length === 0 ? (
          <EmptyState
            icon="smartphone"
            title="Nenhuma plataforma ativa"
            description="Ative pelo menos uma plataforma em Plataformas para ver os preços."
          />
        ) : (
          <>
            <SearchBar
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Buscar produto ou combo..."
            />

            {filteredItems.length === 0 ? (
              <Text style={styles.noResultsText}>
                Nenhum item encontrado para "{searchText}".
              </Text>
            ) : (
              groupedProducts.map((group, groupIndex) => {
                const catColor = catColorMap[group.id] || getCategoryColor(groupIndex);
                const isExpanded = expandedCats[group.id];
                const isCombo = group.id === '__combos__';

                return (
                  <View key={group.id} style={styles.categorySection}>
                    {/* Section header matching MateriasPrimasScreen style */}
                    <TouchableOpacity
                      style={styles.sectionHeader}
                      onPress={() => toggleCategory(group.id)}
                      activeOpacity={0.6}
                    >
                      <View style={[styles.sectionDot, { backgroundColor: catColor }]} />
                      {isCombo && (
                        <Feather name="gift" size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                      )}
                      <Text style={styles.sectionTitle}>{group.nome}</Text>
                      <Text style={styles.sectionCount}>{group.items.length}</Text>
                      <Feather
                        name={isExpanded ? 'chevron-down' : 'chevron-right'}
                        size={14}
                        color={colors.disabled}
                        style={{ marginLeft: 6 }}
                      />
                    </TouchableOpacity>

                    {/* Grouped card rows */}
                    {isExpanded && group.items.map((item, itemIndex) => {
                      const isItemExpanded = expandedItems[item.id];
                      const itemPreco = safeNum(item.precoVenda);
                      const itemCusto = safeNum(item.custoUnitario);
                      // Sessão 28.9 — Auditoria P0-02: usa calcMargem (margem bruta do produto, sem delivery)
                      const margem = calcMargem(itemPreco, itemCusto) * 100;
                      const isFirst = itemIndex === 0;
                      const isLast = itemIndex === group.items.length - 1;
                      const avatarColor = item.tipo === 'combo' ? colors.purple : catColor;
                      const inicial = (item.nome || '?').charAt(0).toUpperCase();

                      return (
                        <View key={item.id}>
                          <TouchableOpacity
                            style={[
                              styles.itemRow,
                              isFirst && styles.itemRowFirst,
                              (isLast && !isItemExpanded) && styles.itemRowLast,
                              !isLast && !isItemExpanded && styles.itemRowBorder,
                              isItemExpanded && styles.itemRowBorder,
                            ]}
                            onPress={() => toggleItem(item.id)}
                            activeOpacity={0.6}
                          >
                            {/* Colored initial avatar */}
                            <View style={[styles.avatar, { backgroundColor: avatarColor + '18' }]}>
                              <Text style={[styles.avatarText, { color: avatarColor }]}>{inicial}</Text>
                            </View>

                            {/* Info */}
                            <View style={styles.itemRowInfo}>
                              <Text style={styles.itemName} numberOfLines={1}>{item.nome}</Text>
                              <View style={styles.itemSubRow}>
                                <Text style={styles.itemSubtext}>
                                  Balcão: {formatCurrency(item.precoVenda)}
                                </Text>
                                <Text style={styles.itemSubSep}>|</Text>
                                <Text style={styles.itemSubtext}>
                                  CMV: {formatCurrency(item.custoUnitario)}
                                </Text>
                              </View>
                            </View>

                            {/* Badges */}
                            <View style={styles.itemBadgeArea}>
                              {item.tipo === 'combo' && (
                                <View style={styles.comboBadge}>
                                  <Feather name="gift" size={8} color={colors.textLight} style={{ marginRight: 2 }} />
                                  <Text style={styles.comboBadgeText}>combo</Text>
                                </View>
                              )}
                              <Chip
                                label={`${margem.toFixed(0)}%`}
                                tooltip={`Margem de lucro: ${margem.toFixed(1)}%`}
                                color={margem >= 30 ? colors.success : colors.warning}
                                style={styles.margemBadge}
                                textStyle={styles.margemBadgeText}
                                icon={(
                                  <Feather
                                    name={margem >= 30 ? 'trending-up' : 'trending-down'}
                                    size={9}
                                    color={margem >= 30 ? colors.success : colors.warning}
                                  />
                                )}
                              />
                            </View>

                            <Feather
                              name={isItemExpanded ? 'chevron-down' : 'chevron-right'}
                              size={14}
                              color={colors.disabled}
                              style={{ marginLeft: 4 }}
                            />
                          </TouchableOpacity>

                          {isItemExpanded && (
                            <View style={[
                              styles.itemDetails,
                              isLast && styles.itemDetailsLast,
                            ]}>
                              {plataformas.map((plat) => renderPlatformRow(item, plat))}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                );
              })
            )}
          </>
        )}
      </Card>

      {plataformas.length > 0 && hasItems && (
        <TouchableOpacity
          style={styles.legendToggle}
          onPress={() => setShowLegend(!showLegend)}
          activeOpacity={0.7}
        >
          <Feather
            name={showLegend ? 'chevron-down' : 'chevron-right'}
            size={13}
            color={colors.textSecondary}
            style={{ marginRight: 4 }}
          />
          <Text style={styles.legendToggleText}>Como funciona</Text>
        </TouchableOpacity>
      )}

      {showLegend && (
        <Card>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
            <Text style={styles.legendText}>Lucro positivo -- preço cobre todos os custos</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: colors.error }]} />
            <Text style={styles.legendText}>Prejuízo -- revise o preço ou os custos</Text>
          </View>
          <Text style={styles.legendFormula}>
            Sugerido = Arredondar(Balcão / (1 - Taxa%)){'\n'}
            Lucro = Delivery - Custo - Taxa - Comissão - Desconto
          </Text>
        </Card>
      )}

      <InviabilidadeModal
        visible={!!inviabilidadeInfo}
        info={inviabilidadeInfo}
        onClose={() => setInviabilidadeInfo(null)}
      />

      {/* APP-19/24b/25: tela de transparência do cálculo delivery */}
      <ComoCalculadoModal
        visible={!!comoCalculado}
        onClose={() => setComoCalculado(null)}
        modo="delivery"
        titulo={comoCalculado?.titulo}
        resultado={comoCalculado?.resultado}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },

  // Summary
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  summaryValue: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary + '10',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.xs,
  },
  emptyDesc: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: spacing.md,
  },
  noResultsText: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    paddingVertical: spacing.lg,
  },

  // Section header (matching MateriasPrimasScreen pattern)
  categorySection: { marginBottom: spacing.sm },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.md,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.textSecondary,
    flex: 1,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionCount: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.disabled,
  },

  // Item rows (grouped card style matching MateriasPrimasScreen)
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingVertical: 10,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.sm,
  },
  itemRowFirst: {
    borderTopLeftRadius: borderRadius.md,
    borderTopRightRadius: borderRadius.md,
  },
  itemRowLast: {
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: 2,
  },
  itemRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },

  // Avatar
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  avatarText: {
    fontSize: 15,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  // Item info
  itemRowInfo: {
    flex: 1,
    marginRight: spacing.xs,
  },
  itemName: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  itemSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  itemSubtext: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  itemSubSep: {
    fontSize: 11,
    color: colors.disabled,
    marginHorizontal: 4,
  },

  // Badges
  itemBadgeArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  comboBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.purple,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  comboBadgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bold,
    color: colors.textLight,
    fontWeight: '700',
  },
  margemBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  margemBadgeText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  // Expanded item details
  itemDetails: {
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  itemDetailsLast: {
    borderBottomLeftRadius: borderRadius.md,
    borderBottomRightRadius: borderRadius.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    marginBottom: 2,
  },

  // Platform rows
  platformRow: {
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  platHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  platName: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginRight: spacing.xs,
  },
  platTaxaBadge: {
    backgroundColor: colors.accent + '14',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  platTaxaText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.accent,
  },

  priceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  priceCol: { flex: 1, marginRight: spacing.sm },
  priceLabel: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  priceValue: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  deliveryInput: { marginBottom: 0 },
  deliveryInputField: { paddingVertical: spacing.xs, fontSize: fonts.small },
  lucroValue: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },
  margemChip: {
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
    alignSelf: 'flex-end',
  },
  margemChipText: {
    fontSize: 10,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  // Breakdown chips
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  breakdownChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  breakdownChipText: {
    fontSize: 10,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },

  // Legend
  legendToggle: {
    paddingVertical: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendToggleText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    fontWeight: '600',
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
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  legendFormula: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    fontStyle: 'italic',
    marginTop: spacing.sm,
    textAlign: 'center',
    backgroundColor: colors.inputBg,
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
  },

  // Error / inviability banners (P0 fix)
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: '#dc2626',
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  errorBannerText: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: '#991b1b',
  },
  errorRetryBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    backgroundColor: '#dc2626',
    borderRadius: borderRadius.sm,
    marginLeft: spacing.xs,
  },
  errorRetryText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.bold,
    color: '#ffffff',
    fontWeight: '700',
  },
  inviavelBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: spacing.xs,
  },
  inviavelBannerText: {
    flex: 1,
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: '#991b1b',
  },

  // ── Sessão 28+ — mobile-web stacked layout (substitui priceRow apertada em < 1024px) ──
  priceStackMobile: {
    marginVertical: spacing.xs,
  },
  priceStackRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    minHeight: 36,
  },
  priceStackLabel: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  priceStackValue: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
});
