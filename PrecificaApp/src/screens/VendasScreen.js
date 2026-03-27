import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { formatCurrency, converterParaBase, calcDespesasFixasPercentual, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';

function getUltimos6Meses() {
  const meses = [];
  const now = new Date();
  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const nomesMeses = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    meses.push({ key: `${yyyy}-${mm}`, label: `${nomesMeses[d.getMonth()]}/${String(yyyy).slice(2)}` });
  }
  return meses;
}

export default function VendasScreen({ navigation }) {
  const [mesAtual, setMesAtual] = useState(getUltimos6Meses()[0].key);
  const [produtos, setProdutos] = useState([]);
  const [resumo, setResumo] = useState({ totalQty: 0, faturamento: 0, lucro: 0, ticketMedio: 0 });
  const [loading, setLoading] = useState(true);

  const meses = getUltimos6Meses();

  useFocusEffect(useCallback(() => {
    loadData();
  }, [mesAtual]));

  async function loadData() {
    setLoading(true);
    try {
      const db = await getDatabase();

      // Load despesas config
      const [fixas, variaveis, fat, todasVendas, prods, allIngs, allPreps, allEmbs] = await Promise.all([
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
        db.getAllAsync('SELECT * FROM vendas'),
        db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      ]);

      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
      const mesesComFat = fat.filter(f => f.valor > 0);
      const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
      const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);

      // Filter vendas by month in JS (web DB compatibility)
      const vendasDoMes = todasVendas.filter(v => v.data && v.data.startsWith(mesAtual));
      const vendasPorProduto = {};
      vendasDoMes.forEach(v => {
        if (!vendasPorProduto[v.produto_id]) vendasPorProduto[v.produto_id] = 0;
        vendasPorProduto[v.produto_id] += v.quantidade;
      });

      // Build lookup maps
      const ingsByProd = {};
      (allIngs || []).forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      (allPreps || []).forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      (allEmbs || []).forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      // Calculate costs and build list
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

        const custoUn = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
        const precoVenda = p.preco_venda || 0;
        const despFixasVal = precoVenda * dfPerc;
        const despVarVal = precoVenda * totalVar;
        const lucroUn = precoVenda - custoUn - despFixasVal - despVarVal;
        const margemPerc = precoVenda > 0 ? (lucroUn / precoVenda) * 100 : 0;

        const qtdVendida = vendasPorProduto[p.id] || 0;
        const receita = qtdVendida * precoVenda;
        const lucroTotal = qtdVendida * lucroUn;

        result.push({
          ...p,
          custoUn,
          precoVenda,
          lucroUn,
          margemPerc,
          qtdVendida,
          receita,
          lucroTotal,
        });
      }

      // Sort: most sold first, 0 sales at bottom
      result.sort((a, b) => {
        if (a.qtdVendida === 0 && b.qtdVendida > 0) return 1;
        if (b.qtdVendida === 0 && a.qtdVendida > 0) return -1;
        return b.qtdVendida - a.qtdVendida;
      });

      // Calculate summary
      const totalQty = result.reduce((a, p) => a + p.qtdVendida, 0);
      const faturamento = result.reduce((a, p) => a + p.receita, 0);
      const lucro = result.reduce((a, p) => a + p.lucroTotal, 0);
      const ticketMedio = totalQty > 0 ? faturamento / totalQty : 0;

      setProdutos(result);
      setResumo({ totalQty, faturamento, lucro, ticketMedio });
    } catch (e) {
      console.error('Erro ao carregar vendas:', e);
    } finally {
      setLoading(false);
    }
  }

  const maxQtd = Math.max(...produtos.map(p => p.qtdVendida), 1);

  function renderProdutoItem({ item }) {
    const semVendas = item.qtdVendida === 0;
    const barWidth = semVendas ? 0 : (item.qtdVendida / maxQtd) * 100;

    return (
      <TouchableOpacity
        style={[styles.produtoItem, semVendas && styles.produtoSemVendas]}
        onPress={() => navigation.navigate('VendaDetalhe', { id: item.id })}
        activeOpacity={0.6}
      >
        <View style={styles.produtoHeader}>
          <Text style={[styles.produtoNome, semVendas && styles.textoInativo]} numberOfLines={1}>
            {item.nome}
          </Text>
          {semVendas && (
            <Text style={styles.semVendasBadge}>Sem vendas</Text>
          )}
        </View>

        <View style={styles.produtoMetrics}>
          <View style={styles.produtoMetric}>
            <Text style={[styles.produtoMetricValue, semVendas && styles.textoInativo]}>
              {item.qtdVendida % 1 === 0 ? item.qtdVendida : item.qtdVendida.toFixed(1)} un
            </Text>
            <Text style={styles.produtoMetricLabel}>Vendidos</Text>
          </View>
          <View style={styles.produtoMetric}>
            <Text style={[styles.produtoMetricValue, { color: semVendas ? colors.disabled : colors.info }, semVendas && styles.textoInativo]}>
              {formatCurrency(item.receita)}
            </Text>
            <Text style={styles.produtoMetricLabel}>Receita</Text>
          </View>
          <View style={styles.produtoMetric}>
            <Text style={[
              styles.produtoMetricValue,
              { color: semVendas ? colors.disabled : (item.margemPerc >= 0 ? colors.success : colors.error) },
            ]}>
              {item.margemPerc.toFixed(1)}%
            </Text>
            <Text style={styles.produtoMetricLabel}>Margem</Text>
          </View>
        </View>

        {!semVendas && (
          <View style={styles.barContainer}>
            <View style={[styles.bar, { width: `${barWidth}%` }]} />
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.container}>
      {/* Month selector */}
      <View style={styles.mesesContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.mesesList}>
          {meses.map(m => (
            <TouchableOpacity
              key={m.key}
              style={[styles.mesChip, mesAtual === m.key && styles.mesChipAtivo]}
              onPress={() => setMesAtual(m.key)}
            >
              <Text style={[styles.mesTexto, mesAtual === m.key && styles.mesTextoAtivo]}>
                {m.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={produtos}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <>
            {/* Summary card */}
            <Card style={styles.resumoCard}>
              <View style={styles.resumoGrid}>
                <View style={styles.resumoItem}>
                  <Text style={styles.resumoValor}>{resumo.totalQty % 1 === 0 ? resumo.totalQty : resumo.totalQty.toFixed(1)}</Text>
                  <Text style={styles.resumoLabel}>Total de Vendas</Text>
                </View>
                <View style={styles.resumoItem}>
                  <Text style={[styles.resumoValor, { color: colors.info }]}>{formatCurrency(resumo.faturamento)}</Text>
                  <Text style={styles.resumoLabel}>Faturamento</Text>
                </View>
                <View style={styles.resumoItem}>
                  <Text style={[styles.resumoValor, { color: resumo.lucro >= 0 ? colors.success : colors.error }]}>
                    {formatCurrency(resumo.lucro)}
                  </Text>
                  <Text style={styles.resumoLabel}>Lucro Estimado</Text>
                </View>
                <View style={styles.resumoItem}>
                  <Text style={[styles.resumoValor, { color: colors.secondary }]}>{formatCurrency(resumo.ticketMedio)}</Text>
                  <Text style={styles.resumoLabel}>Ticket Medio</Text>
                </View>
              </View>
            </Card>

            {/* Menu button */}
            <TouchableOpacity
              style={styles.menuBtn}
              onPress={() => navigation.navigate('MatrizBCG')}
              activeOpacity={0.7}
            >
              <Text style={styles.menuBtnText}>Ver Engenharia de Cardápio  📊</Text>
            </TouchableOpacity>

            {/* List header */}
            <Text style={styles.listTitle}>Produtos</Text>
          </>
        }
        renderItem={renderProdutoItem}
        ListEmptyComponent={
          !loading ? (
            <Text style={styles.empty}>Nenhum produto cadastrado.</Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },

  // Month selector
  mesesContainer: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingVertical: spacing.sm,
  },
  mesesList: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  mesChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.full,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.xs,
  },
  mesChipAtivo: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  mesTexto: {
    fontSize: fonts.tiny,
    fontWeight: '600',
    color: colors.text,
  },
  mesTextoAtivo: {
    color: colors.textLight,
  },

  // List
  listContent: {
    padding: spacing.md,
    paddingBottom: spacing.xl,
  },

  // Summary card
  resumoCard: {
    marginBottom: spacing.sm,
  },
  resumoGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  resumoItem: {
    width: '50%',
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  resumoValor: {
    fontSize: fonts.large,
    fontWeight: '700',
    color: colors.primary,
  },
  resumoLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    marginTop: 2,
  },

  // Menu button
  menuBtn: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  menuBtnText: {
    color: colors.textLight,
    fontSize: fonts.small,
    fontWeight: '700',
  },

  // List header
  listTitle: {
    fontSize: fonts.regular,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.sm,
  },

  // Product item
  produtoItem: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  produtoSemVendas: {
    opacity: 0.5,
  },
  produtoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  produtoNome: {
    fontSize: fonts.small,
    fontWeight: '600',
    color: colors.text,
    flex: 1,
    marginRight: spacing.sm,
  },
  textoInativo: {
    color: colors.disabled,
  },
  semVendasBadge: {
    fontSize: 10,
    color: colors.textSecondary,
    backgroundColor: colors.inputBg,
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 1,
    borderRadius: borderRadius.sm,
    overflow: 'hidden',
  },
  produtoMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  produtoMetric: {
    alignItems: 'center',
    flex: 1,
  },
  produtoMetricValue: {
    fontSize: fonts.tiny,
    fontWeight: '700',
    color: colors.text,
  },
  produtoMetricLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 1,
  },

  // Sales volume bar
  barContainer: {
    height: 3,
    backgroundColor: colors.border,
    borderRadius: 2,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  bar: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 2,
  },

  // Empty
  empty: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginTop: 60,
    fontSize: fonts.regular,
    lineHeight: 24,
  },
});
