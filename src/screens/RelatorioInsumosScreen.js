/**
 * RelatorioInsumosScreen — Sessão 28.17
 *
 * Substitui a aba "Comparar Fornecedores" (que ficou complicada de manter,
 * exigindo cadastrar marcas e variações). Aqui o foco é VISÃO GERAL DE PREÇOS:
 *
 *   - Preço médio por categoria de insumo
 *   - Top 5 mais caros / mais baratos
 *   - Histórico de mudanças de preço (a partir de `historico_precos` quando existir)
 *
 * Pra quê: empreendedora quer ver "como meus custos estão evoluindo" sem
 * precisar pensar em marcas/fornecedores específicos.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

const safe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function RelatorioInsumosScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [insumos, setInsumos] = useState([]);
  const [categoriaStats, setCategoriaStats] = useState([]);
  const [historico, setHistorico] = useState([]);

  useFocusEffect(useCallback(() => { carregar(); }, []));

  async function carregar() {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [mps, cats] = await Promise.all([
        db.getAllAsync('SELECT mp.*, c.nome as categoria_nome FROM materias_primas mp LEFT JOIN categorias_insumos c ON c.id = mp.categoria_id ORDER BY mp.nome'),
        db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome'),
      ]);
      setInsumos(mps || []);

      // Stats por categoria
      const byCat = {};
      (mps || []).forEach(m => {
        const cat = m.categoria_nome || 'Sem categoria';
        if (!byCat[cat]) byCat[cat] = { nome: cat, items: [], total: 0, count: 0 };
        const preco = safe(m.preco_por_kg);
        if (preco > 0) {
          byCat[cat].items.push({ nome: m.nome, marca: m.marca, preco, unidade: m.unidade_medida });
          byCat[cat].total += preco;
          byCat[cat].count += 1;
        }
      });
      const statsArr = Object.values(byCat).map(c => ({
        ...c,
        media: c.count > 0 ? c.total / c.count : 0,
        max: c.items.length > 0 ? Math.max(...c.items.map(i => i.preco)) : 0,
        min: c.items.length > 0 ? Math.min(...c.items.map(i => i.preco)) : 0,
      })).sort((a, b) => b.count - a.count);
      setCategoriaStats(statsArr);

      // Histórico (defensivo — tabela pode não existir)
      try {
        const hist = await db.getAllAsync(`
          SELECT h.materia_prima_id, h.preco_por_kg, h.criado_em, mp.nome, mp.marca, mp.unidade_medida
          FROM historico_precos h
          LEFT JOIN materias_primas mp ON mp.id = h.materia_prima_id
          ORDER BY h.criado_em DESC
          LIMIT 30
        `);
        setHistorico(hist || []);
      } catch (e) {
        // Tabela ausente ou esquema diferente — silencioso.
        setHistorico([]);
      }
    } catch (e) {
      console.error('[RelatorioInsumos.carregar]', e);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Relatório de Insumos</Text>
          <Text style={styles.subtitle}>
            Visão geral dos preços médios por categoria + histórico de mudanças. Sem necessidade de cadastrar marcas ou fornecedores.
          </Text>
        </View>

        {insumos.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={32} color={colors.disabled} />
            <Text style={styles.emptyTitle}>Sem insumos cadastrados</Text>
            <Text style={styles.emptyDesc}>
              Vai em Insumos pra cadastrar os primeiros e ver o relatório.
            </Text>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={() => navigation.navigate('Insumos', { screen: 'MateriasPrimas' })}
              activeOpacity={0.8}
            >
              <Text style={styles.btnPrimaryText}>Cadastrar insumos</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {/* KPIs gerais */}
            <View style={styles.kpiRow}>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Total de insumos</Text>
                <Text style={styles.kpiValue}>{insumos.length}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Categorias</Text>
                <Text style={styles.kpiValue}>{categoriaStats.length}</Text>
              </View>
              <View style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>Mudanças registradas</Text>
                <Text style={styles.kpiValue}>{historico.length}</Text>
              </View>
            </View>

            {/* Stats por categoria */}
            <Text style={styles.sectionTitle}>Preços médios por categoria</Text>
            {categoriaStats.map((cat, i) => (
              <View key={i} style={styles.catCard}>
                <View style={styles.catHeader}>
                  <Text style={styles.catNome}>{cat.nome}</Text>
                  <Text style={styles.catCount}>{cat.count} insumo{cat.count !== 1 ? 's' : ''}</Text>
                </View>
                <View style={styles.catStatsRow}>
                  <View style={styles.catStat}>
                    <Text style={styles.catStatLabel}>Média</Text>
                    <Text style={styles.catStatValue}>{formatCurrency(cat.media)}</Text>
                  </View>
                  <View style={styles.catStat}>
                    <Text style={styles.catStatLabel}>Mínimo</Text>
                    <Text style={[styles.catStatValue, { color: colors.success }]}>{formatCurrency(cat.min)}</Text>
                  </View>
                  <View style={styles.catStat}>
                    <Text style={styles.catStatLabel}>Máximo</Text>
                    <Text style={[styles.catStatValue, { color: colors.error }]}>{formatCurrency(cat.max)}</Text>
                  </View>
                </View>
              </View>
            ))}

            {/* Histórico */}
            {historico.length > 0 && (
              <>
                <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>
                  Últimas mudanças de preço
                </Text>
                {historico.slice(0, 15).map((h, i) => (
                  <View key={i} style={styles.histRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.histNome}>
                        {h.nome}{h.marca ? ` (${h.marca})` : ''}
                      </Text>
                      <Text style={styles.histData}>
                        {h.criado_em ? new Date(h.criado_em).toLocaleDateString('pt-BR') : '—'}
                      </Text>
                    </View>
                    <Text style={styles.histPreco}>{formatCurrency(safe(h.preco_por_kg))}/{h.unidade_medida || 'kg'}</Text>
                  </View>
                ))}
              </>
            )}
            {historico.length === 0 && (
              <View style={[styles.empty, { marginTop: spacing.md, padding: spacing.md }]}>
                <Feather name="clock" size={20} color={colors.disabled} />
                <Text style={[styles.emptyDesc, { marginTop: 4 }]}>
                  Sem histórico de mudanças ainda. Edite o preço de algum insumo pra começar a registrar a evolução.
                </Text>
              </View>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 960, alignSelf: 'center', width: '100%' },
  header: { marginBottom: spacing.md },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, lineHeight: 18 },
  empty: { alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  emptyTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
  btnPrimary: {
    backgroundColor: colors.primary, paddingVertical: 12, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, marginTop: spacing.md,
  },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular },
  kpiRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  kpiCard: {
    flex: 1, backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  kpiLabel: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: 4 },
  kpiValue: { fontSize: fonts.xlarge || 22, fontFamily: fontFamily.bold, color: colors.primary },
  sectionTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm },
  catCard: {
    backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.sm,
  },
  catHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.sm },
  catNome: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },
  catCount: { fontSize: fonts.small, color: colors.textSecondary },
  catStatsRow: { flexDirection: 'row', gap: spacing.sm },
  catStat: { flex: 1 },
  catStatLabel: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: 2 },
  catStatValue: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text },
  histRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  histNome: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  histData: { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 2 },
  histPreco: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary },
});
