import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase } from '../utils/calculations';

export default function SimuladorScreen({ navigation }) {
  const [insumos, setInsumos] = useState([]);
  const [produtos, setProdutos] = useState([]);
  const [ajuste, setAjuste] = useState('10'); // percentual de aumento
  const [insumoSelecionado, setInsumoSelecionado] = useState(null); // null = todos
  const [resultados, setResultados] = useState(null);
  const [busca, setBusca] = useState('');

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    const db = await getDatabase();
    const mps = await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome');
    setInsumos(mps);

    // Load all data in parallel batch
    const [prods, allIngs, allPreps, allEmbs] = await Promise.all([
      db.getAllAsync('SELECT * FROM produtos WHERE preco_venda > 0'),
      db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida, mp.nome as mp_nome, mp.id as mp_id FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
      db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida, pr.nome as pr_nome FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
      db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario, em.nome as emb_nome FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
    ]);

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
      const custoIng = ings.reduce((a, ing) => a + (converterParaBase(ing.quantidade_utilizada, ing.unidade_medida || 'g') / 1000) * (ing.preco_por_kg || 0), 0);
      const custoPr = preps.reduce((a, pp) => a + (converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g') / 1000) * (pp.custo_por_kg || 0), 0);
      const custoEmb = embs.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);
      const custoUnit = (custoIng + custoPr + custoEmb) / (p.rendimento_unidades || 1);
      const margem = p.preco_venda > 0 ? (p.preco_venda - custoUnit) / p.preco_venda : 0;
      return { id: p.id, nome: p.nome, preco_venda: p.preco_venda, custoAtual: custoUnit, margemAtual: margem, ingredientes: ings, preparos: preps, embalagens: embs, rendimento_unidades: p.rendimento_unidades || 1 };
    });
    setProdutos(prodData);
  }

  function simular() {
    const pct = parseFloat(ajuste.replace(',', '.')) / 100;
    if (isNaN(pct)) return;

    const results = produtos.map(p => {
      let novoCustoIng = p.ingredientes.reduce((a, ing) => {
        const qtBase = converterParaBase(ing.quantidade_utilizada, ing.unidade_medida || 'g');
        let preco = ing.preco_por_kg || 0;
        // Aplicar ajuste se for o insumo selecionado ou todos
        if (!insumoSelecionado || ing.mp_id === insumoSelecionado) {
          preco = preco * (1 + pct);
        }
        return a + (qtBase / 1000) * preco;
      }, 0);
      const custoPr = p.preparos.reduce((a, pp) => {
        const qtBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g');
        return a + (qtBase / 1000) * (pp.custo_por_kg || 0);
      }, 0);
      const custoEmb = p.embalagens.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);

      const novoCusto = (novoCustoIng + custoPr + custoEmb) / p.rendimento_unidades;
      const novaMargemVal = p.preco_venda - novoCusto;
      const novaMargem = p.preco_venda > 0 ? novaMargemVal / p.preco_venda : 0;
      const impacto = novoCusto - p.custoAtual;

      return {
        ...p,
        custoNovo: novoCusto,
        margemNova: novaMargem,
        impacto,
        impactoPercent: p.custoAtual > 0 ? impacto / p.custoAtual : 0,
      };
    }).sort((a, b) => a.margemNova - b.margemNova); // pior margem primeiro

    setResultados(results);
  }

  const insumosFiltrados = busca
    ? insumos.filter(i => i.nome.toLowerCase().includes(busca.toLowerCase()))
    : insumos;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Explicação */}
        <View style={styles.infoCard}>
          <Feather name="zap" size={18} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoTitle}>Simulador de Impacto</Text>
            <Text style={styles.infoDesc}>
              Simule o efeito de uma variação de preço nos seus custos e margens. Escolha um insumo específico ou aplique a todos.
            </Text>
          </View>
        </View>

        {/* Controles */}
        <View style={styles.controlsCard}>
          <Text style={styles.controlLabel}>Variação de preço (%)</Text>
          <View style={styles.ajusteRow}>
            {['-20', '-10', '-5', '+5', '+10', '+20'].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.ajusteChip, ajuste === v.replace('+', '') && styles.ajusteChipActive]}
                onPress={() => setAjuste(v.replace('+', ''))}
              >
                <Text style={[styles.ajusteChipText, ajuste === v.replace('+', '') && styles.ajusteChipTextActive]}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Personalizado:</Text>
            <TextInput
              style={styles.customInput}
              value={ajuste}
              onChangeText={setAjuste}
              keyboardType="numeric"
              placeholder="10"
            />
            <Text style={styles.customSuffix}>%</Text>
          </View>

          <Text style={[styles.controlLabel, { marginTop: spacing.md }]}>Aplicar em</Text>
          <TouchableOpacity
            style={[styles.insumoSelect, !insumoSelecionado && styles.insumoSelectActive]}
            onPress={() => setInsumoSelecionado(null)}
          >
            <Text style={[styles.insumoSelectText, !insumoSelecionado && styles.insumoSelectTextActive]}>
              Todos os insumos
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.searchInput}
            placeholder="Buscar insumo específico..."
            value={busca}
            onChangeText={setBusca}
          />

          {busca.length > 0 && (
            <View style={styles.insumoList}>
              {insumosFiltrados.slice(0, 5).map(i => (
                <TouchableOpacity
                  key={i.id}
                  style={[styles.insumoSelect, insumoSelecionado === i.id && styles.insumoSelectActive]}
                  onPress={() => { setInsumoSelecionado(i.id); setBusca(''); }}
                >
                  <Text style={[styles.insumoSelectText, insumoSelecionado === i.id && styles.insumoSelectTextActive]}>
                    {i.nome} — {formatCurrency(i.valor_pago)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {insumoSelecionado && (
            <View style={styles.selectedTag}>
              <Text style={styles.selectedTagText}>
                {insumos.find(i => i.id === insumoSelecionado)?.nome}
              </Text>
              <TouchableOpacity onPress={() => setInsumoSelecionado(null)}>
                <Feather name="x" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.simularBtn} onPress={simular}>
            <Feather name="play" size={16} color="#fff" />
            <Text style={styles.simularBtnText}>Simular</Text>
          </TouchableOpacity>
        </View>

        {/* Resultados */}
        {resultados && (
          <View style={styles.resultadosCard}>
            <Text style={styles.resultadosTitle}>
              Impacto: {parseFloat(ajuste) > 0 ? '+' : ''}{ajuste}% {insumoSelecionado ? `em ${insumos.find(i => i.id === insumoSelecionado)?.nome}` : 'em todos os insumos'}
            </Text>

            {/* Resumo */}
            <View style={styles.resumoRow}>
              <View style={styles.resumoItem}>
                <Text style={styles.resumoLabel}>Produtos afetados</Text>
                <Text style={styles.resumoValue}>{resultados.filter(r => Math.abs(r.impacto) > 0.01).length}</Text>
              </View>
              <View style={styles.resumoItem}>
                <Text style={styles.resumoLabel}>Impacto médio</Text>
                <Text style={[styles.resumoValue, { color: parseFloat(ajuste) > 0 ? colors.error : colors.success }]}>
                  {formatCurrency(resultados.reduce((a, r) => a + r.impacto, 0) / Math.max(resultados.length, 1))}
                </Text>
              </View>
              <View style={styles.resumoItem}>
                <Text style={styles.resumoLabel}>Margens em risco</Text>
                <Text style={[styles.resumoValue, { color: colors.error }]}>
                  {resultados.filter(r => r.margemNova < 0.10).length}
                </Text>
              </View>
            </View>

            {/* Lista de produtos */}
            {resultados.map(r => {
              const margemColor = r.margemNova >= 0.15 ? colors.success : r.margemNova >= 0.05 ? colors.warning : colors.error;
              return (
                <View key={r.id} style={styles.produtoRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.produtoNome} numberOfLines={1}>{r.nome}</Text>
                    <Text style={styles.produtoDetalhe}>
                      CMV: {formatCurrency(r.custoAtual)} → {formatCurrency(r.custoNovo)}
                      {'  '}({r.impacto >= 0 ? '+' : ''}{formatCurrency(r.impacto)})
                    </Text>
                  </View>
                  <View style={styles.produtoMargens}>
                    <Text style={[styles.margemText, { color: colors.textSecondary }]}>{formatPercent(r.margemAtual)}</Text>
                    <Feather name="arrow-right" size={12} color={colors.disabled} />
                    <Text style={[styles.margemText, { color: margemColor, fontFamily: fontFamily.bold }]}>{formatPercent(r.margemNova)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 960, alignSelf: 'center', width: '100%' },

  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  infoTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary, marginBottom: 2 },
  infoDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 20 },

  controlsCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  controlLabel: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },

  ajusteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  ajusteChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  ajusteChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  ajusteChipText: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.textSecondary },
  ajusteChipTextActive: { color: '#fff' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customLabel: { fontSize: fonts.small, color: colors.textSecondary },
  customInput: {
    width: 60, height: 36, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, textAlign: 'center', fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold, backgroundColor: '#fff',
  },
  customSuffix: { fontSize: fonts.regular, color: colors.textSecondary },

  insumoSelect: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: borderRadius.sm,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    marginBottom: 6,
  },
  insumoSelectActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary },
  insumoSelectText: { fontSize: fonts.small, color: colors.textSecondary },
  insumoSelectTextActive: { color: colors.primary, fontFamily: fontFamily.semiBold },

  searchInput: {
    height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: 12, fontSize: fonts.small, backgroundColor: '#fff', marginBottom: 6,
  },
  insumoList: { marginBottom: spacing.sm },

  selectedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary + '10', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  selectedTagText: { fontSize: fonts.small, color: colors.primary, fontFamily: fontFamily.semiBold },

  simularBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 12, marginTop: spacing.sm,
  },
  simularBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: '#fff' },

  resultadosCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  resultadosTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.md,
  },

  resumoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  resumoItem: {
    flex: 1, alignItems: 'center', backgroundColor: colors.background,
    borderRadius: borderRadius.sm, padding: spacing.sm,
  },
  resumoLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: 4 },
  resumoValue: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text },

  produtoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border + '60',
  },
  produtoNome: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text },
  produtoDetalhe: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  produtoMargens: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 12 },
  margemText: { fontSize: fonts.small, fontFamily: fontFamily.medium },
});
