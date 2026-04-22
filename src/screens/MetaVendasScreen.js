import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Switch, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import EmptyState from '../components/EmptyState';
import Loader from '../components/Loader';

export default function MetaVendasScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [metaLucro, setMetaLucro] = useState('');
  const [produtos, setProdutos] = useState([]);
  const [custoFixoMensal, setCustoFixoMensal] = useState(0);
  const [totalVarDecimal, setTotalVarDecimal] = useState(0);
  const [cmvMedioPercent, setCmvMedioPercent] = useState(0);
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
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0); // percentual already decimal (0.06 = 6%)

      setCustoFixoMensal(totalFixas);
      setTotalVarDecimal(totalVar);

      // Build lookup maps
      const ingsByProd = {};
      allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      // Calculate average CMV% across all products
      let somaCmvPerc = 0;
      let countCmv = 0;
      for (const p of prodsR) {
        const custoIng = (ingsByProd[p.id] || []).reduce((a, ing) => a + calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada, ing.unidade_medida, ing.unidade_medida || 'g'), 0);
        const custoPr = (prepsByProd[p.id] || []).reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
        const custoEmb = (embsByProd[p.id] || []).reduce((a, e) => a + (e.preco_unitario || 0) * (e.quantidade_utilizada || 0), 0);
        const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
        if (p.preco_venda > 0) {
          somaCmvPerc += custoUnit / p.preco_venda;
          countCmv++;
        }
      }
      const cmvPerc = countCmv > 0 ? somaCmvPerc / countCmv : 0;
      setCmvMedioPercent(cmvPerc);

      setProdutos(prodsR); // keep for empty state check
    } catch (e) {
    } finally {
      setLoading(false);
    }
  }

  // Fórmula simplificada: Faturamento = (Fixos + Lucro) / (1 - CMV% - Var%)
  function calcular(valor) {
    const lucro = parseFloat(valor) || 0;
    if (lucro <= 0) {
      setResultado(null);
      return;
    }

    const margemDisponivel = 1 - cmvMedioPercent - totalVarDecimal;
    if (margemDisponivel <= 0) {
      setResultado(null);
      return;
    }

    const faturamentoMensal = (custoFixoMensal + lucro) / margemDisponivel;
    const faturamentoDiario = faturamentoMensal / 30;

    setResultado({
      faturamentoMensal,
      faturamentoDiario,
      cmvValor: faturamentoMensal * cmvMedioPercent,
      varValor: faturamentoMensal * totalVarDecimal,
    });
  }

  function onChangeMeta(text) {
    // Allow only numbers
    const numericOnly = text.replace(/[^0-9]/g, '');
    setMetaLucro(numericOnly);
    calcular(numericOnly);
  }

  function onQuickValue(valor) {
    const str = String(valor);
    setMetaLucro(str);
    calcular(str);
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader message="Calculando sua meta de vendas..." />
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
          <View style={styles.resultCard}>
            <Text style={styles.resultLabel}>Você precisa faturar</Text>
            <Text style={styles.resultBig}>{formatCurrency(resultado.faturamentoMensal)}<Text style={styles.resultSuffix}>/mês</Text></Text>
            <Text style={styles.resultDaily}>{formatCurrency(resultado.faturamentoDiario)} por dia</Text>
            <View style={styles.resultDivider} />

            {/* Decomposição clara do cálculo */}
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 2 }}>Como chegamos nesse valor:</Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary }}>Faturamento necessário</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, color: colors.text }}>{formatCurrency(resultado.faturamentoMensal)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.error }}>− CMV médio ({formatPercent(cmvMedioPercent)})</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.error }}>-{formatCurrency(resultado.cmvValor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.error }}>− Custos variáveis ({formatPercent(totalVarDecimal)})</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.error }}>-{formatCurrency(resultado.varValor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.error }}>− Custos fixos mensais</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.error }}>-{formatCurrency(custoFixoMensal)}</Text>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.success }}>= Lucro líquido</Text>
                <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.success }}>{formatCurrency(parseFloat(metaLucro) || 0)}/mês</Text>
              </View>
            </View>
          </View>
        )}

        {/* Empty state */}
        {produtos.length === 0 && !loading && (
          <EmptyState
            icon="package"
            title="Nenhum produto com preço cadastrado"
            description="Cadastre produtos com preço de venda para usar esta ferramenta."
          />
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
    fontSize: fonts.large,
    color: colors.primary,
    marginRight: spacing.sm,
  },
  metaInput: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fonts.title,
    color: colors.text,
    paddingVertical: spacing.sm + 4,
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
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  resultLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.small,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  resultBig: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.primary,
  },
  resultSuffix: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.small,
    color: colors.textSecondary,
  },
  resultDaily: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
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
