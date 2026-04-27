import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, converterParaBase } from '../utils/calculations';
import EmptyState from '../components/EmptyState';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import usePersistedState from '../hooks/usePersistedState';
import useListDensity from '../hooks/useListDensity';

// Audit P1: helper defensivo para qualquer número vindo de DB.
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

const CATEGORY_COLORS = [
  '#004d47', '#265bb0', '#e3b842', '#e3704d', '#6a4fb0',
  '#2d9a8c', '#c4532d', '#8b6cc1', '#d4a843', '#3d7ab5',
  '#5c8a4f', '#b84c65',
];

function normalizeStr(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export default function ListaComprasScreen({ navigation }) {
  const { isDesktop, isMobile } = useResponsiveLayout();
  const { isCompact, rowMinHeight, titleFontSize, listItemSubtitleFontSize, cardPadding } = useListDensity();
  const bottomOffset = isMobile ? 86 : 16; // BottomTab clearance on mobile
  const [produtos, setProdutos] = useState([]);
  const [quantidades, setQuantidades] = useState({});
  const [lista, setLista] = useState(null);
  const [loading, setLoading] = useState(true);
  const [gerando, setGerando] = useState(false);
  // Audit P1: persistir busca entre navegações (padrão da casa).
  const [busca, setBusca] = usePersistedState('listaCompras.busca', '');
  // Audit P0: estados de erro (loadProdutos + gerarLista eram silent).
  const [loadError, setLoadError] = useState(null);
  const [gerarError, setGerarError] = useState(null);

  useFocusEffect(useCallback(() => {
    loadProdutos();
    return () => { setLista(null); };
  }, []));

  async function loadProdutos() {
    setLoading(true);
    setLoadError(null);
    try {
      const db = await getDatabase();
      const [rawProds, cats, comboRows, comboItensRows] = await Promise.all([
        db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
        db.getAllAsync('SELECT * FROM categorias_produtos'),
        db.getAllAsync('SELECT * FROM delivery_combos ORDER BY nome'),
        db.getAllAsync('SELECT * FROM delivery_combo_itens'),
      ]);
      const catMap = {};
      (cats || []).forEach(c => { catMap[c.id] = c.nome; });

      // Build combo items lookup
      const itensByCombo = {};
      (comboItensRows || []).forEach(ci => { (itensByCombo[ci.combo_id] = itensByCombo[ci.combo_id] || []).push(ci); });

      const prods = rawProds.map(p => ({ ...p, categoria_nome: catMap[p.categoria_id] || null, isCombo: false }))
        .sort((a, b) => (a.categoria_nome || 'zzz').localeCompare(b.categoria_nome || 'zzz') || a.nome.localeCompare(b.nome));

      // Add combos as items with categoria_nome "Combos Delivery"
      const comboItems = (comboRows || []).filter(c => safeNum(c.preco_venda) > 0).map(c => ({
        ...c,
        id: 'combo_' + c.id,
        comboId: c.id,
        nome: c.nome,
        categoria_nome: 'Combos Delivery',
        isCombo: true,
        comboItens: itensByCombo[c.id] || [],
      }));

      const allItems = [...prods, ...comboItems];
      setProdutos(allItems);
      const qtds = {};
      allItems.forEach(p => { qtds[p.id] = '0'; });
      setQuantidades(qtds);
    } catch (err) {
      // Audit P0: era silent — agora loga e mostra banner.
      console.error('[ListaCompras.loadProdutos]', err);
      setLoadError('Não foi possível carregar a lista de produtos. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  function setQtd(prodId, val) {
    setQuantidades(prev => ({ ...prev, [prodId]: val }));
  }

  async function gerarLista() {
    setGerando(true);
    setGerarError(null);
    try {
      const db = await getDatabase();

      // Load simple queries without JOINs (Supabase wrapper handles simple SELECTs better)
      const [allProdIngs, allProdPreps, allPreparos, allPrepIngs, allMPs, allCats] = await Promise.all([
        db.getAllAsync('SELECT * FROM produto_ingredientes'),
        db.getAllAsync('SELECT * FROM produto_preparos'),
        db.getAllAsync('SELECT * FROM preparos'),
        db.getAllAsync('SELECT * FROM preparo_ingredientes'),
        db.getAllAsync('SELECT * FROM materias_primas'),
        db.getAllAsync('SELECT * FROM categorias_insumos'),
      ]);

      // Build preparo lookup for rendimento
      const preparoMap = {};
      allPreparos.forEach(p => { preparoMap[p.id] = p; });

      // Build category lookup
      const catMap = {};
      allCats.forEach(c => { catMap[c.id] = c.nome; });

      // Build lookup maps
      const mpMap = {};
      allMPs.forEach(mp => { mpMap[mp.id] = { ...mp, categoria: catMap[mp.categoria_id] || 'Sem categoria' }; });

      const prodIngsByProd = {};
      allProdIngs.forEach(i => { (prodIngsByProd[i.produto_id] = prodIngsByProd[i.produto_id] || []).push(i); });

      const prodPrepsByProd = {};
      allProdPreps.forEach(p => { (prodPrepsByProd[p.produto_id] = prodPrepsByProd[p.produto_id] || []).push(p); });

      const prepIngsByPrep = {};
      allPrepIngs.forEach(i => { (prepIngsByPrep[i.preparo_id] = prepIngsByPrep[i.preparo_id] || []).push(i); });

      const consolidado = {}; // keyed by mp_id

      function addToConsolidado(mpId, qtGramas) {
        const mp = mpMap[mpId];
        if (!mp) return;
        if (!consolidado[mpId]) {
          consolidado[mpId] = {
            mp_id: mpId,
            nome: mp.nome,
            categoria: mp.categoria || 'Sem categoria',
            unidade_medida: mp.unidade_medida || 'Grama(s)',
            // Audit P1: safeNum protege contra NaN em estimativas.
            valor_pago: safeNum(mp.valor_pago),
            quantidade_bruta: safeNum(mp.quantidade_bruta) || 1,
            quantidade_liquida: safeNum(mp.quantidade_liquida) || 1,
            totalGramas: 0,
          };
        }
        consolidado[mpId].totalGramas += safeNum(qtGramas);
      }

      // Helper to add a product's ingredients to consolidado
      function addProdutoIngredientes(prodId, multiplicador) {
        const prodRow = allProdsRaw.find(p => p.id === prodId);
        if (!prodRow) return;
        const rendUnidades = prodRow.rendimento_unidades || 1;

        // Ingredientes diretos do produto
        const ings = prodIngsByProd[prodId] || [];
        for (const ing of ings) {
          const mp = mpMap[ing.materia_prima_id];
          if (!mp) continue;
          const qtPorUnidade = ing.quantidade_utilizada / rendUnidades;
          const qtTotal = qtPorUnidade * multiplicador;
          const qtGramas = converterParaBase(qtTotal, mp.unidade_medida || 'g');
          addToConsolidado(ing.materia_prima_id, qtGramas);
        }

        // Preparos do produto → ingredientes do preparo
        const preps = prodPrepsByProd[prodId] || [];
        for (const prep of preps) {
          const prepIngs = prepIngsByPrep[prep.preparo_id] || [];
          const preparoInfo = preparoMap[prep.preparo_id];
          const rendPrep = preparoInfo?.rendimento_total || 1;
          const qtPrepPorUnidade = prep.quantidade_utilizada / rendUnidades;
          const qtPrepTotal = qtPrepPorUnidade * multiplicador;
          const proporcao = qtPrepTotal / rendPrep;

          for (const pi of prepIngs) {
            const mp = mpMap[pi.materia_prima_id];
            if (!mp) continue;
            const qtIngPrep = pi.quantidade_utilizada * proporcao;
            const qtGramas = converterParaBase(qtIngPrep, mp.unidade_medida || 'g');
            addToConsolidado(pi.materia_prima_id, qtGramas);
          }
        }
      }

      // Load raw products for combo ingredient lookup
      const allProdsRaw = await db.getAllAsync('SELECT id, rendimento_unidades FROM produtos');

      // Load all embalagens for combo embalagem items (embalagens are not matérias-primas)
      const allEmbalagens = await db.getAllAsync('SELECT * FROM embalagens');
      const embMap = {};
      allEmbalagens.forEach(e => { embMap[e.id] = e; });

      for (const prod of produtos) {
        const unidades = parseInt(quantidades[prod.id]) || 0;
        if (unidades <= 0) continue;

        if (prod.isCombo) {
          // Combo: break down into component items based on tipo
          const comboItens = prod.comboItens || [];
          for (const item of comboItens) {
            const qty = (item.quantidade || 1) * unidades;
            if (item.tipo === 'produto') {
              // produto → resolve its ingredients recursively
              addProdutoIngredientes(item.item_id, qty);
            } else if (item.tipo === 'materia_prima') {
              // Direct matéria-prima reference
              const mp = mpMap[item.item_id];
              if (mp) {
                const qtGramas = converterParaBase(qty, mp.unidade_medida || 'g');
                addToConsolidado(item.item_id, qtGramas);
              }
            } else if (item.tipo === 'preparo') {
              // Preparo → resolve its ingredients
              const prepIngs = prepIngsByPrep[item.item_id] || [];
              const preparoInfo = preparoMap[item.item_id];
              const rendPrep = preparoInfo?.rendimento_total || 1;
              const proporcao = qty / rendPrep;
              for (const pi of prepIngs) {
                const mp = mpMap[pi.materia_prima_id];
                if (!mp) continue;
                const qtIngPrep = pi.quantidade_utilizada * proporcao;
                const qtGramas = converterParaBase(qtIngPrep, mp.unidade_medida || 'g');
                addToConsolidado(pi.materia_prima_id, qtGramas);
              }
            }
            // Note: tipo === 'embalagem' items are packaging, not raw ingredients for shopping list
          }
        } else {
          addProdutoIngredientes(prod.id, unidades);
        }
      }

      // Converter para unidades de compra e calcular custo
      const items = Object.values(consolidado).map(item => {
        const isUnidade = item.unidade_medida.toLowerCase().includes('unidade');
        let displayQty, displayUnit;

        if (isUnidade) {
          displayQty = Math.ceil(item.totalGramas); // totalGramas = total units for unit items
          displayUnit = 'un';
        } else {
          // totalGramas is in grams
          if (item.totalGramas >= 1000) {
            const isVolume = item.unidade_medida.toLowerCase().includes('litro') || item.unidade_medida.toLowerCase().includes('ml');
            displayQty = Math.ceil(item.totalGramas / 10) / 100; // round to 2 decimals
            displayUnit = isVolume ? 'L' : 'kg';
          } else {
            const isVolume = item.unidade_medida.toLowerCase().includes('litro') || item.unidade_medida.toLowerCase().includes('ml');
            displayQty = Math.ceil(item.totalGramas);
            displayUnit = isVolume ? 'mL' : 'g';
          }
        }

        // Custo estimado: (totalGramas / quantidade_liquida_em_gramas) * valor_pago
        const qtLiqGramas = safeNum(converterParaBase(item.quantidade_liquida, item.unidade_medida || 'g'));
        // Audit P1: divisão por zero já protegida; safeNum garante consistência.
        const pacotesNecessarios = qtLiqGramas > 0 ? safeNum(item.totalGramas / qtLiqGramas) : 0;
        const custoEstimado = safeNum(pacotesNecessarios * item.valor_pago);

        return { ...item, displayQty, displayUnit, custoEstimado };
      });

      // Group by category
      const grouped = {};
      items.forEach(item => {
        if (!grouped[item.categoria]) grouped[item.categoria] = [];
        grouped[item.categoria].push(item);
      });
      Object.keys(grouped).forEach(cat => grouped[cat].sort((a, b) => a.nome.localeCompare(b.nome)));

      const custoTotal = items.reduce((a, i) => a + safeNum(i.custoEstimado), 0);
      const categorias = Object.keys(grouped).sort((a, b) => {
        if (a === 'Sem categoria') return 1;
        return a.localeCompare(b);
      });

      setLista({ grouped, categorias, custoTotal, totalItems: items.length });
    } catch (e) {
      // Audit P0: catch silencioso fazia "Gerar Lista" não responder.
      console.error('[ListaCompras.gerarLista]', e);
      setGerarError('Não foi possível gerar a lista. Verifique seus dados e tente novamente.');
    } finally {
      setGerando(false);
    }
  }

  function exportarPDF() {
    if (!lista || Platform.OS !== 'web') return;

    const prodsSelecionados = produtos.filter(p => parseInt(quantidades[p.id]) > 0)
      .map(p => `<li>${escapeHtml(p.nome)}${p.isCombo ? ' (Combo)' : ''} — ${quantidades[p.id]} un</li>`).join('');

    let html = `<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Lista de Compras - PrecificaÍ</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', sans-serif; padding: 40px; color: #333; max-width: 800px; margin: 0 auto; }
      .header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #004d47; padding-bottom: 20px; }
      .header h1 { color: #004d47; font-size: 24px; }
      .header p { color: #666; font-size: 12px; margin-top: 4px; }
      .produtos { font-size: 12px; color: #666; margin-bottom: 20px; padding: 10px; background: #f5f5f5; border-radius: 8px; }
      .categoria { margin-bottom: 20px; }
      .categoria h3 { color: #004d47; font-size: 14px; padding: 8px 0; border-bottom: 1px solid #ddd; margin-bottom: 8px; }
      .item { display: flex; justify-content: space-between; padding: 6px 0 6px 16px; border-bottom: 1px solid #f0f0f0; }
      .item-nome { font-size: 14px; }
      .item-qty { font-size: 13px; color: #666; }
      .item-custo { font-size: 14px; font-weight: 600; color: #004d47; min-width: 80px; text-align: right; }
      .total { display: flex; justify-content: space-between; margin-top: 20px; padding-top: 16px; border-top: 3px solid #004d47; font-size: 18px; font-weight: 700; }
      .total-valor { color: #004d47; }
      .footer { text-align: center; margin-top: 40px; font-size: 11px; color: #999; }
      .checkbox { display: inline-block; width: 14px; height: 14px; border: 1.5px solid #999; border-radius: 3px; margin-right: 8px; vertical-align: middle; }
      @page { margin: 10mm; size: A4; }
      @media print { body { padding: 0; } .footer { position: fixed; bottom: 0; left: 0; right: 0; } }
    </style></head><body>
    <div class="header">
      <h1>Lista de Compras</h1>
      <p>Gerada por Precificaí em ${new Date().toLocaleDateString('pt-BR')}</p>
    </div>
    <div class="produtos"><strong>Produção planejada:</strong><ul style="margin:8px 0 0 20px;padding:0">${prodsSelecionados}</ul></div>`;

    for (const cat of lista.categorias) {
      html += `<div class="categoria"><h3>${escapeHtml(cat)}</h3>`;
      for (const item of lista.grouped[cat]) {
        const qty = item.displayQty % 1 === 0 ? item.displayQty : item.displayQty.toFixed(2);
        html += `<div class="item">
          <div><span class="checkbox"></span><span class="item-nome">${escapeHtml(item.nome)}</span>
          <span class="item-qty"> (${qty} ${escapeHtml(item.displayUnit)})</span></div>
          <div class="item-custo">${formatCurrency(item.custoEstimado)}</div>
        </div>`;
      }
      html += `</div>`;
    }

    html += `<div class="total">
      <span>Custo Total Estimado</span>
      <span class="total-valor">${formatCurrency(lista.custoTotal)}</span>
    </div>
    <div class="footer">Gerado por Precificaí - precificaipp.com</div>
    </body></html>`;

    const win = window.open('', '_blank');
    win.document.write(html);
    win.document.close();
    setTimeout(() => win.print(), 500);
  }

  const temProdutosSelecionados = Object.values(quantidades).some(v => parseInt(v) > 0);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: isMobile ? 200 : 100 }]}>
        {/* Audit P0: banner de erro de carregamento (era silent) */}
        {loadError ? (
          <TouchableOpacity
            style={styles.errorBanner}
            onPress={loadProdutos}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Tentar carregar produtos novamente"
          >
            <Feather name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 8 }} />
            <Text style={styles.errorBannerText}>{loadError}</Text>
          </TouchableOpacity>
        ) : null}
        {gerarError ? (
          <View style={styles.errorBanner} accessibilityRole="alert">
            <Feather name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 8 }} />
            <Text style={styles.errorBannerText}>{gerarError}</Text>
          </View>
        ) : null}
        {/* Info */}
        <View style={styles.infoCard}>
          <Feather name="shopping-cart" size={18} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoTitle}>Lista de Compras</Text>
            <Text style={styles.infoDesc}>
              Informe quantas unidades pretende produzir e gere a lista consolidada de todos os ingredientes necessários (incluindo ingredientes dos preparos).
            </Text>
          </View>
        </View>

        {/* Product quantity inputs */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Produção planejada</Text>
          {!loading && produtos.length > 0 && (
            <View style={styles.searchRow}>
              <Feather name="search" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar produto..."
                placeholderTextColor={colors.disabled}
                value={busca}
                onChangeText={setBusca}
              />
              {busca.length > 0 && (
                <TouchableOpacity onPress={() => setBusca('')}>
                  <Feather name="x" size={14} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>
          )}
          {loading ? (
            <View style={{ padding: 20, alignItems: 'center' }}>
              <ActivityIndicator color={colors.primary} />
            </View>
          ) : produtos.length === 0 ? (
            <EmptyState
              icon="shopping-cart"
              title="Nenhum insumo cadastrado"
              description="Cadastre seus insumos em Insumos para gerar uma lista de compras automática a partir do estoque atual."
            />
          ) : (
            <View>
              {(() => {
                const groups = {};
                const filteredProds = produtos.filter(p => !busca.trim() || normalizeStr(p.nome).includes(normalizeStr(busca)));
                filteredProds.forEach(p => {
                  const cat = p.categoria_nome || 'Sem categoria';
                  if (!groups[cat]) groups[cat] = [];
                  groups[cat].push(p);
                });

                return Object.entries(groups).map(([catName, items], ci) => (
                  <View key={catName}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: isCompact ? 4 : 6, marginTop: ci > 0 ? (isCompact ? 8 : 12) : 0 }}>
                      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: CATEGORY_COLORS[ci % CATEGORY_COLORS.length] }} />
                      <Text style={{ fontSize: titleFontSize, fontFamily: fontFamily.semiBold, color: colors.text }}>{catName}</Text>
                      <Text style={{ fontSize: listItemSubtitleFontSize, color: colors.textSecondary }}>({items.length})</Text>
                    </View>
                    <View style={isDesktop ? styles.gridContainer : undefined}>
                      {items.map(p => (
                        <View key={p.id} style={isDesktop ? styles.gridCardProduto : [styles.produtoRow, { minHeight: rowMinHeight, paddingVertical: isCompact ? 8 : 14 }]}>
                          {Platform.OS === 'web' ? (
                            <div title={p.nome} style={{ flex: 1, overflow: 'hidden' }}>
                              <Text style={isDesktop ? styles.gridCardName : styles.produtoNome} numberOfLines={1}>{p.nome}</Text>
                            </div>
                          ) : (
                            <Text style={isDesktop ? styles.gridCardName : styles.produtoNome} numberOfLines={1}>{p.nome}</Text>
                          )}
                          <View style={styles.qtyGroup}>
                            <TouchableOpacity
                              style={isDesktop ? styles.qtyBtnSm : styles.qtyBtn}
                              onPress={() => {
                                const cur = parseInt(quantidades[p.id]) || 0;
                                if (cur > 0) setQtd(p.id, String(cur - 1));
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Diminuir quantidade de ${p.nome}`}
                            >
                              <Feather name="minus" size={isDesktop ? 12 : 14} color={colors.textSecondary} />
                            </TouchableOpacity>
                            <TextInput
                              style={isDesktop ? styles.qtyInputSm : styles.qtyInput}
                              value={quantidades[p.id] || '0'}
                              onChangeText={v => setQtd(p.id, v.replace(/[^0-9]/g, ''))}
                              keyboardType="numeric"
                              selectTextOnFocus
                              accessibilityLabel={`Quantidade de ${p.nome}`}
                            />
                            <TouchableOpacity
                              style={isDesktop ? styles.qtyBtnSm : styles.qtyBtn}
                              onPress={() => {
                                const cur = parseInt(quantidades[p.id]) || 0;
                                setQtd(p.id, String(cur + 1));
                              }}
                              accessibilityRole="button"
                              accessibilityLabel={`Aumentar quantidade de ${p.nome}`}
                            >
                              <Feather name="plus" size={isDesktop ? 12 : 14} color={colors.primary} />
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  </View>
                ));
              })()}
            </View>
          )}
        </View>

        {/* Results */}
        {lista && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Feather name="check-circle" size={18} color={colors.success} />
              <Text style={styles.resultTitle}>
                {lista.totalItems} {lista.totalItems === 1 ? 'ingrediente' : 'ingredientes'}
              </Text>
            </View>

            {lista.categorias.map(cat => (
              <View key={cat} style={styles.categorySection}>
                <View style={styles.categoryHeader}>
                  <View style={[styles.categoryDot, { backgroundColor: colors.primary }]} />
                  <Text style={styles.categoryTitle}>{cat}</Text>
                </View>
                {isDesktop ? (
                  <View style={styles.gridContainer}>
                    {lista.grouped[cat].map(item => (
                      <View key={item.mp_id} style={styles.gridCardItem}>
                        {Platform.OS === 'web' ? (
                          <div title={item.nome} style={{ overflow: 'hidden' }}>
                            <Text style={styles.gridCardName} numberOfLines={1}>{item.nome}</Text>
                          </div>
                        ) : (
                          <Text style={styles.gridCardName} numberOfLines={1}>{item.nome}</Text>
                        )}
                        <Text style={styles.gridCardPrice}>
                          {item.displayQty % 1 === 0 ? item.displayQty : item.displayQty.toFixed(2)} {item.displayUnit} • {formatCurrency(item.custoEstimado)}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  lista.grouped[cat].map(item => (
                    <View key={item.mp_id} style={[styles.itemRow, { minHeight: rowMinHeight, paddingVertical: isCompact ? 6 : 10 }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemNome}>{item.nome}</Text>
                        <Text style={[styles.itemQty, { fontSize: listItemSubtitleFontSize }]}>
                          {item.displayQty % 1 === 0 ? item.displayQty : item.displayQty.toFixed(2)} {item.displayUnit}
                        </Text>
                      </View>
                      <Text style={styles.itemCusto}>{formatCurrency(item.custoEstimado)}</Text>
                    </View>
                  ))
                )}
              </View>
            ))}

            {/* Total */}
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Custo total estimado</Text>
              <Text style={styles.totalValue}>{formatCurrency(lista.custoTotal)}</Text>
            </View>

            {/* Export PDF button */}
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={exportarPDF}
              accessibilityRole="button"
              accessibilityLabel="Exportar lista de compras em PDF"
            >
              <Feather name="printer" size={16} color={colors.primary} />
              <Text style={styles.exportBtnText}>Exportar PDF / Imprimir</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Sticky bottom CTA — Gerar Lista */}
      <View style={[styles.stickyFooter, { bottom: bottomOffset }]} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.gerarBtn, (!temProdutosSelecionados || gerando) && styles.gerarBtnDisabled]}
          onPress={gerarLista}
          disabled={!temProdutosSelecionados || gerando}
          accessibilityRole="button"
          accessibilityState={{ disabled: !temProdutosSelecionados || gerando, busy: gerando }}
          accessibilityLabel={gerando ? 'Gerando lista de compras' : 'Gerar lista de compras'}
        >
          {gerando ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <>
              <Feather name="list" size={16} color="#fff" />
              <Text style={styles.gerarBtnText}>Gerar Lista</Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 1200, width: '100%', paddingBottom: 220, alignSelf: 'center' },
  stickyFooter: {
    position: 'absolute', left: 0, right: 0,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 4,
  },

  // Audit P0: banner de erro (loadError + gerarError)
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10,
    borderRadius: borderRadius.sm, marginBottom: spacing.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
  },
  errorBannerText: { color: '#dc2626', fontSize: fonts.small, flex: 1, fontFamily: fontFamily.regular },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  infoTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary, marginBottom: 2 },
  infoDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 20 },

  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.background, borderRadius: borderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 8, marginBottom: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontSize: fonts.small, color: colors.text, padding: 0 },
  emptyText: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', paddingVertical: spacing.lg },

  produtoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: colors.border + '40',
    backgroundColor: colors.surface,
  },
  produtoNome: { flex: 1, fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text, marginRight: 12 },
  qtyGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  qtyBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyInput: {
    width: 48, height: 32, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, textAlign: 'center',
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, backgroundColor: '#fff',
  },

  gerarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 14, minHeight: 48,
  },
  gerarBtnDisabled: { opacity: 0.5 },
  gerarBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: '#fff' },

  resultCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  resultHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginBottom: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  resultTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },

  categorySection: { marginBottom: spacing.md },
  categoryHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: 8, paddingBottom: 4,
  },
  categoryTitle: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.primary },

  itemRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8, paddingLeft: 20,
    borderBottomWidth: 1, borderBottomColor: colors.border + '40',
  },
  itemNome: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  itemQty: { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2 },
  itemCusto: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.primary },

  totalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm, paddingTop: spacing.md,
    borderTopWidth: 2, borderTopColor: colors.primary + '30',
  },
  totalLabel: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text },
  totalValue: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.primary },

  // Desktop grid styles
  gridContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  gridCardProduto: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    width: '23.5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  gridCardItem: {
    backgroundColor: colors.surface, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.sm, paddingVertical: 8,
    width: '23.5%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  gridCardName: { fontSize: 12, fontFamily: fontFamily.medium, fontWeight: '500', color: colors.text, flex: 1, marginRight: 8 },
  gridCardPrice: { fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primary, flexShrink: 0 },
  qtyBtnSm: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  qtyInputSm: {
    width: 38, height: 26, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, textAlign: 'center',
    fontSize: 11, fontFamily: fontFamily.semiBold, backgroundColor: '#fff',
  },
  categoryDot: { width: 8, height: 8, borderRadius: 4 },

  exportBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginTop: spacing.md, paddingVertical: 12,
    borderWidth: 1.5, borderColor: colors.primary, borderRadius: borderRadius.md,
    backgroundColor: colors.primary + '08',
  },
  exportBtnText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.primary },
});
