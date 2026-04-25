import React, { useState, useCallback, useMemo, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import EmptyState from '../components/EmptyState';
import SearchBar from '../components/SearchBar';
import InfoTooltip from '../components/InfoTooltip';
import FinanceiroPendenteBanner from '../components/FinanceiroPendenteBanner';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  formatCurrency,
  normalizeSearch,
  getDivisorRendimento,
  calcCustoIngrediente,
  calcCustoPreparo,
} from '../utils/calculations';
import usePersistedState from '../hooks/usePersistedState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
// Sprint 2 S3 — fórmula canônica única em src/utils/deliveryPricing.
import { calcPrecoBreakEven, calcResultadoDelivery } from '../utils/deliveryPricing';

// Defesa contra NaN/Infinity em precificação. Retorna 0 quando não-finito.
function parseNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

export default function ComparativoCanaisScreen() {
  const [plataformas, setPlataformas] = useState([]);
  const [items, setItems] = useState([]); // produtos + combos com custo unitário
  const [searchText, setSearchText] = usePersistedState('comparativoCanais.busca', '');
  const [expandedItems, setExpandedItems] = useState({});
  const [loadError, setLoadError] = useState(null);
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

      const [plats, prods, allIngs, allPreps, allEmbs,
             embalagensList, preparosList, materiasList, adicionaisList,
             dProds, allDProdItens, combosList, allComboItens] = await Promise.all([
        db.getAllAsync('SELECT * FROM delivery_config WHERE ativo = 1 ORDER BY id'),
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
      ]);

      setPlataformas(plats || []);

      // Mapas auxiliares
      const ingsByProd = {};
      (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      const produtosComCusto = [];
      for (const p of (prods || [])) {
        const ings = ingsByProd[p.id] || [];
        const custoIng = ings.reduce((a, i) =>
          a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);

        const preps = prepsByProd[p.id] || [];
        const custoPr = preps.reduce((a, pp) =>
          a + calcCustoPreparo(pp.custo_por_kg, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);

        const embs = embsByProd[p.id] || [];
        const custoEmb = embs.reduce((a, e) => a + e.preco_unitario * e.quantidade_utilizada, 0);

        const custoTotal = custoIng + custoPr + custoEmb;
        const custoUnitario = custoTotal / getDivisorRendimento(p);

        produtosComCusto.push({
          id: `prod-${p.id}`,
          nome: p.nome,
          precoVenda: parseNum(p.preco_venda),
          custoUnitario: parseNum(custoUnitario),
          tipo: 'produto',
        });
      }

      // Custo dos delivery_produtos (componentes de combos)
      const dProdItensByDProd = {};
      (allDProdItens || []).forEach(i => { (dProdItensByDProd[i.delivery_produto_id] = dProdItensByDProd[i.delivery_produto_id] || []).push(i); });

      const dProdsWithCost = [];
      for (const dp of (dProds || [])) {
        const itens = dProdItensByDProd[dp.id] || [];
        let custo = 0;
        for (const item of itens) {
          if (item.tipo === 'produto') {
            const prod = produtosComCusto.find(p => p.id === `prod-${item.item_id}`);
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

      // Combos
      const comboItensByCombo = {};
      (allComboItens || []).forEach(i => { (comboItensByCombo[i.combo_id] = comboItensByCombo[i.combo_id] || []).push(i); });

      const combosResult = [];
      for (const combo of (combosList || [])) {
        const itens = comboItensByCombo[combo.id] || [];
        let custo = 0;
        for (const item of itens) {
          if (item.tipo === 'produto') {
            const prod = produtosComCusto.find(p => p.id === `prod-${item.item_id}`);
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
          precoVenda: parseNum(combo.preco_venda),
          custoUnitario: parseNum(custo),
          tipo: 'combo',
        });
      }

      setItems([...produtosComCusto, ...combosResult]);
    } catch (e) {
      console.error('[Comparativo.loadData]', e);
      setLoadError('Não conseguimos carregar o comparativo. Verifique sua conexão e tente novamente.');
    } finally {
      isLoadingRef.current = false;
    }
  }

  function toggleItem(id) {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  }

  // Calcula linhas (canais) por item: balcão + cada plataforma ativa.
  // Retorna { canais, melhorIdx, piorIdx, temPrejuizo }.
  function buildCanais(item) {
    const custo = parseNum(item.custoUnitario);
    const precoBalcao = parseNum(item.precoVenda);

    const canais = [];

    // Balcão
    const lucroBalcao = precoBalcao > 0 ? precoBalcao - custo : 0;
    const margemBalcao = precoBalcao > 0 ? (lucroBalcao / precoBalcao) * 100 : 0;
    canais.push({
      key: 'balcao',
      nome: 'Balcão',
      icon: 'shopping-bag',
      preco: precoBalcao,
      lucro: lucroBalcao,
      margem: margemBalcao,
      inviavel: precoBalcao <= 0,
    });

    // Cada plataforma ativa — Sprint 2 S3: usa cálculo canônico (corrige bug onde
    // comissao_app era subtraído como R$, mas no schema é %).
    for (const plat of plataformas) {
      const precoSugerido = calcPrecoBreakEven(precoBalcao, plat);
      const inviavelPreco = precoSugerido === null || precoSugerido <= 0;
      const preco = inviavelPreco ? 0 : precoSugerido;
      const r = calcResultadoDelivery({ precoVenda: preco, custoUnit: custo, plat });
      const inviavel = inviavelPreco || r.inviavel;
      const taxaValor = r.valorComissao;
      const desc = r.valorDesconto;
      const lucro = inviavel ? 0 : r.lucro;
      const margem = (!inviavel && preco > 0) ? r.margem * 100 : 0;

      canais.push({
        key: `plat-${plat.id}`,
        nome: plat.plataforma,
        icon: 'smartphone',
        preco,
        lucro,
        margem,
        inviavel,
      });
    }

    // Melhor / pior margem (ignora inviáveis)
    let melhorIdx = -1;
    let piorIdx = -1;
    let melhorMargem = -Infinity;
    let piorMargem = Infinity;
    canais.forEach((c, i) => {
      if (c.inviavel) return;
      if (c.margem > melhorMargem) { melhorMargem = c.margem; melhorIdx = i; }
      if (c.margem < piorMargem) { piorMargem = c.margem; piorIdx = i; }
    });

    const temPrejuizo = canais.some(c => !c.inviavel && c.lucro < 0);

    return { canais, melhorIdx, piorIdx, temPrejuizo };
  }

  const filteredItems = useMemo(() => {
    if (!searchText.trim()) return items;
    const normalized = normalizeSearch(searchText.trim());
    return items.filter(it => normalizeSearch(it.nome).includes(normalized));
  }, [items, searchText]);

  const hasItems = items.length > 0;
  const hasPlats = plataformas.length > 0;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <FinanceiroPendenteBanner />

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

      <Card
        title="Comparativo Canal vs Delivery"
        headerRight={
          <InfoTooltip
            title="Comparativo de canais"
            text="Para cada produto/combo, veja a margem em Balcão e em cada plataforma de delivery ativa. O badge verde marca o canal de maior margem; o vermelho, o de menor."
            examples={[
              'Balcão: Lucro = Preço - Custo',
              'Delivery: Lucro = Preço - Custo - Taxa - Comissão - Desconto',
            ]}
          />
        }
      >
        {!hasItems ? (
          <EmptyState
            icon="dollar-sign"
            title="Sem itens para comparar"
            description="Cadastre produtos ou combos para ver o comparativo de canais."
          />
        ) : !hasPlats ? (
          <EmptyState
            icon="smartphone"
            title="Nenhuma plataforma ativa"
            description="Ative pelo menos uma plataforma em Delivery > Plataformas para comparar com o balcão."
          />
        ) : (
          <>
            <SearchBar
              value={searchText}
              onChangeText={setSearchText}
              placeholder="Buscar produto ou combo..."
            />

            {filteredItems.length === 0 ? (
              <Text style={styles.noResults}>Nenhum item encontrado para "{searchText}".</Text>
            ) : (
              filteredItems.map((item) => {
                const { canais, melhorIdx, piorIdx, temPrejuizo } = buildCanais(item);
                const expanded = !!expandedItems[item.id];
                const inicial = (item.nome || '?').charAt(0).toUpperCase();
                const avatarColor = item.tipo === 'combo' ? colors.purple : colors.primary;

                return (
                  <View key={item.id} style={styles.itemBlock}>
                    <TouchableOpacity
                      style={styles.itemHeader}
                      onPress={() => toggleItem(item.id)}
                      activeOpacity={0.6}
                      accessibilityRole="button"
                      accessibilityLabel={`${item.nome}, toque para ${expanded ? 'recolher' : 'expandir'} comparativo`}
                    >
                      <View style={[styles.avatar, { backgroundColor: avatarColor + '18' }]}>
                        <Text style={[styles.avatarText, { color: avatarColor }]}>{inicial}</Text>
                      </View>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName} numberOfLines={1}>{item.nome}</Text>
                        <Text style={styles.itemSub}>
                          {item.tipo === 'combo' ? 'Combo' : 'Produto'} • CMV {formatCurrency(item.custoUnitario)}
                        </Text>
                      </View>
                      {temPrejuizo && (
                        <View style={styles.alertDot} accessibilityLabel="Algum canal está com prejuízo">
                          <Feather name="alert-triangle" size={12} color={colors.error} />
                        </View>
                      )}
                      <Feather
                        name={expanded ? 'chevron-down' : 'chevron-right'}
                        size={18}
                        color={colors.disabled}
                      />
                    </TouchableOpacity>

                    {expanded && (
                      <View style={styles.canaisBox}>
                        {temPrejuizo && (
                          <View
                            style={styles.prejuizoBanner}
                            accessibilityRole="alert"
                          >
                            <Feather name="alert-octagon" size={12} color={colors.error} style={{ marginRight: 4 }} />
                            <Text style={styles.prejuizoText}>
                              Há canal com prejuízo — revise preço ou custos.
                            </Text>
                          </View>
                        )}

                        {!isMobile && (
                          <View
                            style={styles.canalRowHeader}
                            accessibilityRole="header"
                          >
                            <Text style={[styles.canalCol, styles.headerCol, { flex: 1.4 }]}>Canal</Text>
                            <Text style={[styles.canalCol, styles.headerCol]}>Preço</Text>
                            <Text style={[styles.canalCol, styles.headerCol]}>Lucro</Text>
                            <Text style={[styles.canalCol, styles.headerCol]}>Margem</Text>
                          </View>
                        )}

                        {canais.map((c, idx) => {
                          const isMelhor = idx === melhorIdx && melhorIdx !== piorIdx;
                          const isPior = idx === piorIdx && melhorIdx !== piorIdx;
                          const negativo = !c.inviavel && c.lucro < 0;
                          const lucroColor = c.inviavel ? colors.disabled : (negativo ? colors.error : colors.success);

                          // Sessão 28+ — em mobile-web, cada canal vira card empilhado
                          if (isMobile) {
                            const cardBorder = isMelhor ? colors.success : isPior ? colors.error : colors.border;
                            return (
                              <View
                                key={c.key}
                                style={[styles.canalCard, { borderLeftColor: cardBorder }]}
                                accessibilityLabel={`${c.nome}, preço ${c.inviavel ? 'indisponível' : formatCurrency(c.preco)}, lucro ${c.inviavel ? 'indisponível' : formatCurrency(c.lucro)}, margem ${c.inviavel ? 'indisponível' : c.margem.toFixed(1) + '%'}`}
                              >
                                <View style={styles.canalCardHeader}>
                                  <Feather name={c.icon} size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
                                  <Text style={styles.canalCardTitle} numberOfLines={1}>{c.nome}</Text>
                                  {isMelhor && (
                                    <View
                                      style={[styles.badge, { backgroundColor: colors.success + '18' }]}
                                      accessibilityLabel={`Melhor margem: ${c.nome}`}
                                    >
                                      <Feather name="trending-up" size={10} color={colors.success} />
                                      <Text style={[styles.badgeText, { color: colors.success, fontSize: 10 }]}>melhor</Text>
                                    </View>
                                  )}
                                  {isPior && (
                                    <View
                                      style={[styles.badge, { backgroundColor: colors.error + '18' }]}
                                      accessibilityLabel={`Pior margem: ${c.nome}`}
                                    >
                                      <Feather name="trending-down" size={10} color={colors.error} />
                                      <Text style={[styles.badgeText, { color: colors.error, fontSize: 10 }]}>pior</Text>
                                    </View>
                                  )}
                                </View>
                                <View style={styles.canalCardRow}>
                                  <Text style={styles.canalCardLabel}>Preço:</Text>
                                  <Text style={styles.canalCardValue}>
                                    {c.inviavel ? '—' : formatCurrency(c.preco)}
                                  </Text>
                                </View>
                                <View style={styles.canalCardRow}>
                                  <Text style={styles.canalCardLabel}>Lucro:</Text>
                                  <Text style={[styles.canalCardValue, { color: lucroColor }]}>
                                    {c.inviavel ? '—' : formatCurrency(c.lucro)}
                                  </Text>
                                </View>
                                <View style={styles.canalCardRow}>
                                  <Text style={styles.canalCardLabel}>Margem:</Text>
                                  <Text style={[styles.canalCardValue, { color: lucroColor }]}>
                                    {c.inviavel ? '—' : `${c.margem.toFixed(1)}%`}
                                  </Text>
                                </View>
                              </View>
                            );
                          }

                          return (
                            <View key={c.key} style={styles.canalRow}>
                              <View style={[styles.canalCol, { flex: 1.4, flexDirection: 'row', alignItems: 'center' }]}>
                                <Feather name={c.icon} size={12} color={colors.textSecondary} style={{ marginRight: 4 }} />
                                <Text style={styles.canalNome} numberOfLines={1}>{c.nome}</Text>
                                {isMelhor && (
                                  <View
                                    style={[styles.badge, { backgroundColor: colors.success + '18' }]}
                                    accessibilityLabel={`Melhor margem: ${c.nome}`}
                                  >
                                    <Feather name="trending-up" size={9} color={colors.success} />
                                    <Text style={[styles.badgeText, { color: colors.success }]}>melhor</Text>
                                  </View>
                                )}
                                {isPior && (
                                  <View
                                    style={[styles.badge, { backgroundColor: colors.error + '18' }]}
                                    accessibilityLabel={`Pior margem: ${c.nome}`}
                                  >
                                    <Feather name="trending-down" size={9} color={colors.error} />
                                    <Text style={[styles.badgeText, { color: colors.error }]}>pior</Text>
                                  </View>
                                )}
                              </View>
                              <Text style={[styles.canalCol, styles.canalValue]}>
                                {c.inviavel ? '—' : formatCurrency(c.preco)}
                              </Text>
                              <Text style={[styles.canalCol, styles.canalValue, { color: lucroColor }]}>
                                {c.inviavel ? '—' : formatCurrency(c.lucro)}
                              </Text>
                              <Text style={[styles.canalCol, styles.canalValue, { color: lucroColor }]}>
                                {c.inviavel ? '—' : `${c.margem.toFixed(1)}%`}
                              </Text>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </>
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },

  noResults: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    paddingVertical: spacing.lg,
  },

  itemBlock: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  itemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 2,
  },
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
  itemInfo: { flex: 1 },
  itemName: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  itemSub: {
    fontSize: 11,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },
  alertDot: {
    marginRight: spacing.xs,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: colors.error + '14',
    alignItems: 'center', justifyContent: 'center',
  },

  canaisBox: {
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  prejuizoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginVertical: spacing.xs,
  },
  prejuizoText: {
    flex: 1,
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: '#991b1b',
  },
  canalRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  canalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border + '60',
  },
  canalCol: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    textAlign: 'right',
  },
  headerCol: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  canalNome: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginRight: 4,
  },
  canalValue: {
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    marginLeft: 4,
    gap: 2,
  },
  badgeText: {
    fontSize: 9,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    textTransform: 'uppercase',
  },

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

  // ── Sessão 28+ — mobile-web cards (substitui canalRow apertada em < 1024px) ──
  canalCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    minHeight: 44,
  },
  canalCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  canalCardTitle: {
    flex: 1,
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  canalCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 24,
  },
  canalCardLabel: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  canalCardValue: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
});
