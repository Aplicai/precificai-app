import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase } from '../utils/calculations';

export default function MetaVendasScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [metaLucro, setMetaLucro] = useState('');
  const [produtos, setProdutos] = useState([]);
  const [custoFixoMensal, setCustoFixoMensal] = useState(0);
  const [totalVarDecimal, setTotalVarDecimal] = useState(0);
  const [resultado, setResultado] = useState(null);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    try {
      setLoading(true);
      const db = await getDatabase();

      // Load ALL data in parallel
      const [prodsR, fixas, variaveis, allIngs, allPreps, allEmbs] = await Promise.all([
        db.getAllAsync('SELECT * FROM produtos WHERE preco_venda > 0'),
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      ]);

      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + ((d.percentual || 0) / 100), 0);

      setCustoFixoMensal(totalFixas);
      setTotalVarDecimal(totalVar);

      // Build lookup maps
      const ingsByProd = {};
      allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      const prodData = [];
      for (const p of prodsR) {
        const custoIng = (ingsByProd[p.id] || []).reduce((a, ing) => {
          if (ing.unidade_medida === 'un') return a + ing.quantidade_utilizada * (ing.preco_por_kg || 0);
          return a + (converterParaBase(ing.quantidade_utilizada, ing.unidade_medida || 'g') / 1000) * (ing.preco_por_kg || 0);
        }, 0);
        const custoPr = (prepsByProd[p.id] || []).reduce((a, pp) => a + (converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g') / 1000) * (pp.custo_por_kg || 0), 0);
        const custoEmb = (embsByProd[p.id] || []).reduce((a, e) => a + (e.preco_unitario || 0) * (e.quantidade_utilizada || 0), 0);

        const custoUnit = (custoIng + custoPr + custoEmb) / (p.rendimento_unidades || 1);
        const margemContrib = p.preco_venda - custoUnit - (p.preco_venda * totalVar);
        const margemPercent = p.preco_venda > 0 ? margemContrib / p.preco_venda : 0;

        prodData.push({
          id: p.id,
          nome: p.nome,
          preco_venda: p.preco_venda,
          custoUnit,
          margemContrib,
          margemPercent,
          ativo: true,
        });
      }

      setProdutos(prodData);
    } catch (e) {
      console.error('MetaVendasScreen loadData error:', e);
    } finally {
      setLoading(false);
    }
  }

  function calcular(valor, prods) {
    const lucro = parseFloat(valor) || 0;
    if (lucro <= 0) {
      setResultado(null);
      return;
    }

    const ativos = prods.filter(p => p.ativo && p.margemContrib > 0);
    if (ativos.length === 0) {
      setResultado(null);
      return;
    }

    // Margem de contribuicao media ponderada (por preco)
    const somaPrecos = ativos.reduce((a, p) => a + p.preco_venda, 0);
    const mcMedia = ativos.reduce((a, p) => a + (p.margemContrib / p.preco_venda) * (p.preco_venda / somaPrecos), 0);

    // Faturamento necessario: (custos fixos + lucro desejado) / margem contribuicao media %
    const faturamentoMensal = mcMedia > 0 ? (custoFixoMensal + lucro) / mcMedia : 0;
    const faturamentoDiario = faturamentoMensal / 30;

    // Distribuir proporcionalmente entre produtos ativos
    const produtosComMeta = ativos.map(p => {
      const peso = p.preco_venda / somaPrecos;
      const faturamentoProdMensal = faturamentoMensal * peso;
      const unidadesMes = p.preco_venda > 0 ? faturamentoProdMensal / p.preco_venda : 0;
      const unidadesDia = unidadesMes / 30;
      return { ...p, unidadesDia, unidadesMes };
    });

    setResultado({
      faturamentoMensal,
      faturamentoDiario,
      produtos: produtosComMeta,
    });
  }

  function onChangeMeta(text) {
    // Allow only numbers
    const numericOnly = text.replace(/[^0-9]/g, '');
    setMetaLucro(numericOnly);
    calcular(numericOnly, produtos);
  }

  function onQuickValue(valor) {
    const str = String(valor);
    setMetaLucro(str);
    calcular(str, produtos);
  }

  function toggleProduto(id) {
    const updated = produtos.map(p => p.id === id ? { ...p, ativo: !p.ativo } : p);
    setProdutos(updated);
    calcular(metaLucro, updated);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Info card */}
        <View style={styles.infoCard}>
          <View style={styles.infoIconWrap}>
            <Feather name="zap" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.infoTitle}>Quanto preciso vender?</Text>
            <Text style={styles.infoDesc}>
              Defina quanto deseja lucrar por mês e descubra quantas unidades de cada produto precisa vender por dia para atingir sua meta.
            </Text>
          </View>
        </View>

        {/* Meta input */}
        <View style={styles.card}>
          <Text style={styles.cardLabel}>Meta de lucro mensal</Text>
          <View style={styles.inputRow}>
            <Text style={styles.inputPrefix}>R$</Text>
            <TextInput
              style={styles.metaInput}
              value={metaLucro}
              onChangeText={onChangeMeta}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.disabled}
            />
          </View>

          {/* Quick buttons */}
          <View style={styles.quickRow}>
            {[3000, 5000, 8000, 10000].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.quickBtn, metaLucro === String(v) && styles.quickBtnActive]}
                onPress={() => onQuickValue(v)}
              >
                <Text style={[styles.quickBtnText, metaLucro === String(v) && styles.quickBtnTextActive]}>
                  {formatCurrency(v)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Resultado */}
        {resultado && (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Você precisa faturar</Text>
              <Text style={styles.resultBig}>{formatCurrency(resultado.faturamentoMensal)}<Text style={styles.resultSuffix}>/mês</Text></Text>
              <Text style={styles.resultDaily}>{formatCurrency(resultado.faturamentoDiario)} por dia</Text>
              <View style={styles.resultDivider} />
              <Text style={styles.resultDetail}>
                Considerando {formatCurrency(custoFixoMensal)} de custos fixos + {formatPercent(totalVarDecimal)} de custos variáveis
              </Text>
            </View>

            {/* Product mix table */}
            <View style={styles.card}>
              <Text style={styles.tableTitle}>Mix de produtos</Text>
              <Text style={styles.tableSubtitle}>Ative/desative produtos para ajustar a distribuição</Text>

              {/* Table header */}
              <View style={styles.tableHeader}>
                <Text style={[styles.thText, { flex: 1 }]}>Produto</Text>
                <Text style={[styles.thText, { width: 70, textAlign: 'right' }]}>Preço</Text>
                <Text style={[styles.thText, { width: 60, textAlign: 'right' }]}>Margem</Text>
                <Text style={[styles.thText, { width: 60, textAlign: 'right' }]}>Un/dia</Text>
                <View style={{ width: 44 }} />
              </View>

              {/* Product rows */}
              {produtos.map(p => {
                const metaProd = resultado.produtos.find(rp => rp.id === p.id);
                const margemColor = p.margemPercent >= 0.15 ? colors.success : p.margemPercent >= 0.05 ? colors.warning : colors.error;
                return (
                  <View key={p.id} style={[styles.tableRow, !p.ativo && styles.tableRowInactive]}>
                    <Text style={[styles.tdNome, !p.ativo && styles.tdInactive]} numberOfLines={1}>{p.nome}</Text>
                    <Text style={[styles.tdText, { width: 70, textAlign: 'right' }, !p.ativo && styles.tdInactive]}>
                      {formatCurrency(p.preco_venda)}
                    </Text>
                    <Text style={[styles.tdText, { width: 60, textAlign: 'right', color: p.ativo ? margemColor : colors.disabled }]}>
                      {formatPercent(p.margemPercent)}
                    </Text>
                    <Text style={[styles.tdUnidades, { width: 60, textAlign: 'right' }, !p.ativo && styles.tdInactive]}>
                      {metaProd ? metaProd.unidadesDia.toFixed(1) : '—'}
                    </Text>
                    <View style={{ width: 44, alignItems: 'center' }}>
                      <Switch
                        value={p.ativo}
                        onValueChange={() => toggleProduto(p.id)}
                        trackColor={{ false: colors.border, true: colors.primarySoft }}
                        thumbColor={p.ativo ? colors.primary : colors.disabled}
                      />
                    </View>
                  </View>
                );
              })}

              {/* Total row */}
              {resultado.produtos.length > 0 && (
                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.totalValue}>
                    {resultado.produtos.reduce((a, p) => a + p.unidadesDia, 0).toFixed(1)} un/dia
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Empty state */}
        {produtos.length === 0 && !loading && (
          <View style={styles.emptyCard}>
            <Feather name="package" size={40} color={colors.disabled} />
            <Text style={styles.emptyText}>Nenhum produto com preço cadastrado.</Text>
            <Text style={styles.emptySubtext}>Cadastre produtos com preço de venda para usar esta ferramenta.</Text>
          </View>
        )}

        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // Info card
  infoCard: {
    flexDirection: 'row',
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  infoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.medium,
    color: '#fff',
    marginBottom: 4,
  },
  infoDesc: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.primaryPale,
    lineHeight: 20,
  },

  // Card
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
    color: colors.text,
    marginBottom: spacing.sm,
  },

  // Meta input
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  inputPrefix: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.title,
    color: colors.primary,
    marginRight: spacing.sm,
  },
  metaInput: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fonts.header,
    color: colors.text,
    paddingVertical: spacing.md,
    textAlign: 'center',
  },

  // Quick buttons
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    minWidth: 80,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  quickBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.small,
    color: colors.text,
  },
  quickBtnTextActive: {
    color: '#fff',
  },

  // Result card
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  resultLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.regular,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  resultBig: {
    fontFamily: fontFamily.bold,
    fontSize: 32,
    color: colors.primary,
  },
  resultSuffix: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.regular,
    color: colors.textSecondary,
  },
  resultDaily: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.large,
    color: colors.text,
    marginTop: spacing.xs,
  },
  resultDivider: {
    width: '60%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  resultDetail: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Table
  tableTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.medium,
    color: colors.text,
    marginBottom: 2,
  },
  tableSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  thText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBg,
  },
  tableRowInactive: {
    opacity: 0.5,
  },
  tdNome: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fonts.small,
    color: colors.text,
  },
  tdText: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.text,
  },
  tdUnidades: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.small,
    color: colors.primary,
  },
  tdInactive: {
    color: colors.disabled,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.regular,
    color: colors.text,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.regular,
    color: colors.primary,
  },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
