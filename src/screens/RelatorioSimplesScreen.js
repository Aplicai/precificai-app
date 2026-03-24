import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, calcDespesasFixasPercentual } from '../utils/calculations';

export default function RelatorioSimplesScreen({ navigation }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useFocusEffect(useCallback(() => {
    loadData();
  }, []));

  async function loadData() {
    try {
      setLoading(true);
      const db = await getDatabase();

      // Load ALL data in a single parallel batch
      const [fixas, variaveis, fat, configRows, prods, allIngs, allEmbs, allPreps] = await Promise.all([
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT * FROM produtos'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      ]);
      const lucroDesejado = configRows?.[0]?.lucro_desejado || 0;

      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0
        ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length
        : 0;
      const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);

      // Build lookup maps
      const ingsByProd = {};
      allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const embsByProd = {};
      allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });
      const prepsByProd = {};
      allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });

      const produtos = prods.map(p => {
        const custoIng = (ingsByProd[p.id] || []).reduce((a, i) => {
          if (i.unidade_medida === 'un') return a + i.quantidade_utilizada * (i.preco_por_kg || 0);
          return a + (converterParaBase(i.quantidade_utilizada, i.unidade_medida) / 1000) * (i.preco_por_kg || 0);
        }, 0);
        const custoPr = (prepsByProd[p.id] || []).reduce((a, pp) => {
          return a + (converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g') / 1000) * (pp.custo_por_kg || 0);
        }, 0);
        const custoEmb = (embsByProd[p.id] || []).reduce((a, e) => a + (e.preco_unitario || 0) * e.quantidade_utilizada, 0);

        const custoTotal = custoIng + custoPr + custoEmb;
        const custoUn = custoTotal / (p.rendimento_unidades || 1);
        const precoVenda = p.preco_venda || 0;
        const despFixasVal = precoVenda * dfPerc;
        const despVarVal = precoVenda * totalVar;
        const lucro = precoVenda - custoUn - despFixasVal - despVarVal;
        const margem = precoVenda > 0 ? lucro / precoVenda : 0;

        return { ...p, custoUn, precoVenda, lucro, margem, margemReais: lucro, despFixasVal, despVarVal };
      });

      // Load delivery data
      let deliveryProdutos = [];
      try {
        deliveryProdutos = await db.getAllAsync('SELECT * FROM delivery_produtos');
      } catch (e) { /* no delivery table */ }

      // Build insights
      const produtosComPreco = produtos.filter(p => p.precoVenda > 0);

      // --- Resumo Geral (para cada R$10) ---
      let resumo = null;
      if (fatMedio > 0 && produtosComPreco.length > 0) {
        const totalReceita = produtosComPreco.reduce((a, p) => a + p.precoVenda, 0);
        const totalCustoIng = produtosComPreco.reduce((a, p) => a + p.custoUn, 0);
        const totalDespFixas = produtosComPreco.reduce((a, p) => a + p.despFixasVal, 0);
        const totalDespVar = produtosComPreco.reduce((a, p) => a + p.despVarVal, 0);
        const totalLucro = produtosComPreco.reduce((a, p) => a + p.lucro, 0);

        const percIng = totalReceita > 0 ? totalCustoIng / totalReceita : 0;
        const percFixas = totalReceita > 0 ? totalDespFixas / totalReceita : 0;
        const percVar = totalReceita > 0 ? totalDespVar / totalReceita : 0;
        const percLucro = totalReceita > 0 ? totalLucro / totalReceita : 0;

        resumo = {
          ingredientes: (percIng * 10).toFixed(2).replace('.', ','),
          fixas: (percFixas * 10).toFixed(2).replace('.', ','),
          variaveis: (percVar * 10).toFixed(2).replace('.', ','),
          lucro: (percLucro * 10).toFixed(2).replace('.', ','),
          lucroPositivo: percLucro > 0,
        };
      }

      // --- Melhores produtos (top 3 por margem em R$) ---
      const melhores = [...produtosComPreco]
        .filter(p => p.margemReais > 0)
        .sort((a, b) => b.margemReais - a.margemReais)
        .slice(0, 3);

      // --- Atenção: margem < 10% ---
      const atencao = produtosComPreco.filter(p => p.margem < 0.10 && p.margem >= 0);

      // --- Ponto de equilíbrio ---
      let pontoEquilibrio = null;
      if (totalFixas > 0 && produtosComPreco.length > 0) {
        const margemMediaDecimal = produtosComPreco.reduce((a, p) => a + p.margem, 0) / produtosComPreco.length;
        if (margemMediaDecimal > 0) {
          const peDiario = (totalFixas / margemMediaDecimal) / 30;
          // Produto mais vendido = o de menor preço (mais acessível, proxy)
          const produtoRef = [...produtosComPreco].sort((a, b) => a.precoVenda - b.precoVenda)[0];
          const qtdEquiv = produtoRef && produtoRef.precoVenda > 0
            ? Math.ceil(peDiario / produtoRef.precoVenda)
            : 0;
          pontoEquilibrio = {
            valorDiario: peDiario,
            produtoNome: produtoRef?.nome || '',
            qtdProduto: qtdEquiv,
          };
        }
      }

      // --- Delivery vs Balcão ---
      let deliveryInsight = null;
      if (deliveryProdutos.length > 0) {
        const deliveryMap = {};
        deliveryProdutos.forEach(dp => { deliveryMap[dp.produto_id] = dp; });

        const comparacoes = [];
        for (const p of produtosComPreco) {
          const dp = deliveryMap[p.id];
          if (dp && dp.preco_delivery > 0) {
            const taxas = (dp.comissao_percent || 0) * dp.preco_delivery;
            const lucroDelivery = dp.preco_delivery - p.custoUn - p.despFixasVal - p.despVarVal - taxas;
            const diffPercent = p.lucro > 0 ? ((p.lucro - lucroDelivery) / p.lucro) * 100 : 0;
            if (diffPercent > 0) {
              comparacoes.push({ nome: p.nome, diffPercent });
            }
          }
        }
        if (comparacoes.length > 0) {
          const pior = comparacoes.sort((a, b) => b.diffPercent - a.diffPercent)[0];
          deliveryInsight = {
            produto: pior.nome,
            percentMenos: pior.diffPercent.toFixed(0),
          };
        }
      }

      // --- Tendência (simulada com base nos dados disponíveis) ---
      let tendencia = null;
      if (fat.length >= 2) {
        const sorted = [...fat].filter(f => f.valor > 0).sort((a, b) => {
          const da = `${a.ano}-${String(a.mes).padStart(2, '0')}`;
          const db2 = `${b.ano}-${String(b.mes).padStart(2, '0')}`;
          return da.localeCompare(db2);
        });
        if (sorted.length >= 2) {
          const ultimo = sorted[sorted.length - 1].valor;
          const penultimo = sorted[sorted.length - 2].valor;
          if (penultimo > 0) {
            const variacaoFat = ((ultimo - penultimo) / penultimo) * 100;
            // If costs stayed the same but revenue changed, margin changes
            const margemAtual = produtosComPreco.length > 0
              ? produtosComPreco.reduce((a, p) => a + p.margem, 0) / produtosComPreco.length
              : 0;
            const margemProjetada = margemAtual + (variacaoFat / 100 * 0.3); // simplified projection
            tendencia = {
              variacao: Math.abs(variacaoFat).toFixed(1).replace('.', ','),
              subiu: variacaoFat > 0,
              desceu: variacaoFat < 0,
              margemProjetada: (margemProjetada * 100).toFixed(1).replace('.', ','),
            };
          }
        }
      }

      setData({
        resumo,
        melhores,
        atencao,
        pontoEquilibrio,
        deliveryInsight,
        tendencia,
        totalProdutos: produtos.length,
        produtosComPreco: produtosComPreco.length,
      });
    } catch (e) {
      console.error('RelatorioSimples error:', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Preparando seu relatório...</Text>
      </View>
    );
  }

  if (!data || data.totalProdutos === 0) {
    return (
      <View style={styles.loadingContainer}>
        <Feather name="file-text" size={48} color={colors.disabled} />
        <Text style={styles.emptyTitle}>Nenhum produto cadastrado</Text>
        <Text style={styles.emptyDesc}>Cadastre seus produtos para ver o relatório simplificado.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Header */}
      <View style={styles.header}>
        <Feather name="book-open" size={24} color={colors.primary} />
        <Text style={styles.headerTitle}>Explica aí</Text>
        <Text style={styles.headerSub}>Seus números traduzidos em linguagem simples</Text>
      </View>

      {/* Resumo Geral */}
      {data.resumo && (
        <View style={[styles.card, styles.cardResumo]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.primary + '15' }]}>
              <Feather name="pie-chart" size={18} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Resumo Geral</Text>
          </View>
          <Text style={styles.cardText}>
            De cada{' '}
            <Text style={styles.highlight}>R$ 10,00</Text>
            {' '}que entra no seu caixa:
          </Text>
          <View style={styles.breakdownList}>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.coral }]} />
              <Text style={styles.breakdownText}>
                <Text style={styles.breakdownValue}>R$ {data.resumo.ingredientes}</Text> vai pra ingredientes
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.breakdownText}>
                <Text style={styles.breakdownValue}>R$ {data.resumo.fixas}</Text> vai pra despesas fixas
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: colors.purple }]} />
              <Text style={styles.breakdownText}>
                <Text style={styles.breakdownValue}>R$ {data.resumo.variaveis}</Text> vai pra despesas variáveis
              </Text>
            </View>
            <View style={styles.breakdownItem}>
              <View style={[styles.breakdownDot, { backgroundColor: data.resumo.lucroPositivo ? colors.success : colors.error }]} />
              <Text style={styles.breakdownText}>
                {data.resumo.lucroPositivo ? 'e sobram ' : 'e faltam '}
                <Text style={[styles.breakdownValue, { color: data.resumo.lucroPositivo ? colors.success : colors.error }]}>
                  R$ {data.resumo.lucro}
                </Text>
                {data.resumo.lucroPositivo ? ' de lucro' : ' (prejuízo)'}
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* Melhores Produtos */}
      {data.melhores.length > 0 && (
        <View style={[styles.card, styles.cardSuccess]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.success + '15' }]}>
              <Feather name="award" size={18} color={colors.success} />
            </View>
            <Text style={styles.cardTitle}>Seus Melhores Produtos</Text>
          </View>
          {data.melhores.map((p, i) => (
            <View key={p.id} style={styles.insightRow}>
              <Feather
                name="check-circle"
                size={16}
                color={colors.success}
                style={{ marginRight: 8, marginTop: 2 }}
              />
              <Text style={styles.cardText}>
                {i === 0 ? (
                  <>
                    O <Text style={styles.highlightSuccess}>{p.nome}</Text> é seu campeão: você ganha{' '}
                    <Text style={styles.highlightSuccess}>{formatCurrency(p.margemReais)}</Text> a cada unidade vendida
                  </>
                ) : (
                  <>
                    <Text style={styles.highlightSuccess}>{p.nome}</Text>: lucro de{' '}
                    <Text style={styles.highlightSuccess}>{formatCurrency(p.margemReais)}</Text> por unidade
                  </>
                )}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Atenção */}
      {data.atencao.length > 0 && (
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.warning + '15' }]}>
              <Feather name="alert-triangle" size={18} color={colors.warning} />
            </View>
            <Text style={styles.cardTitle}>Atenção!</Text>
          </View>
          {data.atencao.slice(0, 5).map(p => {
            const precoSugerido = p.custoUn > 0 ? p.custoUn / 0.30 : p.precoVenda * 1.15;
            return (
              <View key={p.id} style={styles.insightRow}>
                <Feather
                  name="alert-circle"
                  size={16}
                  color={colors.warning}
                  style={{ marginRight: 8, marginTop: 2 }}
                />
                <Text style={styles.cardText}>
                  <Text style={styles.highlightWarning}>{p.nome}</Text> está te custando quase o que você cobra.
                  Considere aumentar de{' '}
                  <Text style={styles.highlightWarning}>{formatCurrency(p.precoVenda)}</Text> para{' '}
                  <Text style={styles.highlightWarning}>{formatCurrency(precoSugerido)}</Text>
                </Text>
              </View>
            );
          })}
        </View>
      )}

      {/* Ponto de Equilíbrio */}
      {data.pontoEquilibrio && (
        <View style={[styles.card]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accent + '15' }]}>
              <Feather name="target" size={18} color={colors.accent} />
            </View>
            <Text style={styles.cardTitle}>Ponto de Equilíbrio Traduzido</Text>
          </View>
          <View style={styles.insightRow}>
            <Feather name="info" size={16} color={colors.accent} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.cardText}>
              Você precisa vender pelo menos{' '}
              <Text style={styles.highlightAccent}>{formatCurrency(data.pontoEquilibrio.valorDiario)}</Text>
              {' '}por dia para não ter prejuízo.
              {data.pontoEquilibrio.produtoNome ? (
                <>
                  {' '}Isso equivale a{' '}
                  <Text style={styles.highlightAccent}>{data.pontoEquilibrio.qtdProduto}</Text>
                  {' '}{data.pontoEquilibrio.produtoNome} por dia.
                </>
              ) : null}
            </Text>
          </View>
        </View>
      )}

      {/* Delivery vs Balcão */}
      {data.deliveryInsight && (
        <View style={[styles.card, styles.cardWarning]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: colors.warning + '15' }]}>
              <Feather name="truck" size={18} color={colors.warning} />
            </View>
            <Text style={styles.cardTitle}>Delivery vs Balcão</Text>
          </View>
          <View style={styles.insightRow}>
            <Feather name="alert-circle" size={16} color={colors.warning} style={{ marginRight: 8, marginTop: 2 }} />
            <Text style={styles.cardText}>
              No iFood, seu <Text style={styles.highlightWarning}>{data.deliveryInsight.produto}</Text> rende{' '}
              <Text style={styles.highlightWarning}>{data.deliveryInsight.percentMenos}%</Text> menos que no balcão por causa das taxas
            </Text>
          </View>
        </View>
      )}

      {/* Tendência */}
      {data.tendencia && (
        <View style={[styles.card, data.tendencia.subiu ? styles.cardSuccess : styles.cardWarning]}>
          <View style={styles.cardHeader}>
            <View style={[styles.iconCircle, { backgroundColor: (data.tendencia.subiu ? colors.success : colors.warning) + '15' }]}>
              <Feather
                name={data.tendencia.subiu ? 'trending-up' : 'trending-down'}
                size={18}
                color={data.tendencia.subiu ? colors.success : colors.warning}
              />
            </View>
            <Text style={styles.cardTitle}>Tendencia</Text>
          </View>
          <View style={styles.insightRow}>
            <Feather
              name="activity"
              size={16}
              color={data.tendencia.subiu ? colors.success : colors.warning}
              style={{ marginRight: 8, marginTop: 2 }}
            />
            <Text style={styles.cardText}>
              Nos ultimos meses, seu faturamento{' '}
              {data.tendencia.subiu ? 'subiu' : 'desceu'}{' '}
              <Text style={data.tendencia.subiu ? styles.highlightSuccess : styles.highlightWarning}>
                {data.tendencia.variacao}%
              </Text>.
              {' '}Se continuar assim, em 3 meses sua margem sera de{' '}
              <Text style={data.tendencia.subiu ? styles.highlightSuccess : styles.highlightWarning}>
                {data.tendencia.margemProjetada}%
              </Text>
            </Text>
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    maxWidth: 960,
    alignSelf: 'center',
    width: '100%',
    padding: spacing.md,
  },

  // Loading / Empty
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: fonts.regular,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  emptyTitle: {
    marginTop: spacing.md,
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  emptyDesc: {
    marginTop: spacing.xs,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
  },

  // Header
  header: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: {
    fontSize: fonts.title,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.sm,
  },
  headerSub: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },

  // Cards
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.lg,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
  },
  cardResumo: {
    borderLeftColor: colors.primary,
  },
  cardSuccess: {
    borderLeftColor: colors.success,
  },
  cardWarning: {
    borderLeftColor: colors.warning,
  },
  cardError: {
    borderLeftColor: colors.error,
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm + 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  cardTitle: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    flex: 1,
  },

  cardText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 24,
  },

  // Breakdown list (resumo geral)
  breakdownList: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  breakdownDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: spacing.sm,
    marginTop: 7,
  },
  breakdownText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 24,
    flex: 1,
  },
  breakdownValue: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },

  // Insight row
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm,
  },

  // Highlights
  highlight: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    fontSize: fonts.large,
  },
  highlightSuccess: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.success,
  },
  highlightWarning: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.warning,
  },
  highlightAccent: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.accent,
  },
  highlightError: {
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.error,
  },
});
