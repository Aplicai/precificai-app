import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Dimensions, Platform } from 'react-native';
import { BarChart } from 'react-native-chart-kit';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

/**
 * MetaVsRealidadeChart
 * ────────────────────────────────────────────────────────────────────────────
 * Mostra um gráfico de barras comparando o faturamento alvo (meta) com o
 * faturamento real do mês corrente, calculado a partir das vendas registradas.
 *
 * Semântica:
 *  - "Meta"      = `metaFaturamento` — valor que o usuário precisa faturar
 *                  no mês para atingir o lucro líquido desejado (já calculado
 *                  pelo Simulador via fórmula CMV/Var/Fixos).
 *  - "Realizado" = soma de `quantidade * preco_venda` das vendas do mês.
 *
 * Cores:
 *  - Verde se realizado >= meta (atingiu)
 *  - Vermelho se realizado < meta (abaixo da meta)
 *
 * Acessibilidade:
 *  - Container com `accessibilityRole="image"` e `accessibilityLabel`
 *    descritivo do estado (% atingido, valor faltando, etc.).
 *
 * Fallback:
 *  - Se não há meta definida OU não há vendas, mostra mensagem amigável
 *    em PT-BR orientando o usuário.
 *
 * Props:
 *  - metaFaturamento (number): meta de faturamento mensal calculada
 *  - faturamentoRealizado (number): soma das vendas do mês
 *  - mesLabel (string): mês de referência ("YYYY-MM" ou nome formatado)
 */
function MetaVsRealidadeChart({ metaFaturamento = 0, faturamentoRealizado = 0, mesLabel = '' }) {
  const meta = Number.isFinite(metaFaturamento) ? Math.max(0, metaFaturamento) : 0;
  const realizado = Number.isFinite(faturamentoRealizado) ? Math.max(0, faturamentoRealizado) : 0;

  // Fallback: sem meta OU sem vendas → mensagem orientativa
  const semDados = meta <= 0 || realizado <= 0;

  // Atingiu meta? Define cor da barra "Realizado"
  const atingiuMeta = realizado >= meta && meta > 0;
  const corRealizado = atingiuMeta ? colors.success : colors.error;
  const percAtingido = meta > 0 ? (realizado / meta) * 100 : 0;
  const faltando = Math.max(0, meta - realizado);

  // Largura responsiva: respeita o container, mas com limites razoáveis
  const screenWidth = Dimensions.get('window').width;
  const chartWidth = useMemo(() => Math.min(Math.max(screenWidth - 64, 280), 720), [screenWidth]);

  const chartData = useMemo(() => ({
    labels: ['Meta', 'Realizado'],
    datasets: [
      {
        data: [meta, realizado],
        // chart-kit aceita callback `colors` para cor por barra
        colors: [
          (opacity = 1) => colors.primary, // Meta sempre primary (alvo)
          (opacity = 1) => corRealizado,    // Realizado: verde/vermelho conforme status
        ],
      },
    ],
  }), [meta, realizado, corRealizado]);

  // Config visual do chart-kit (PT-BR para formatação de valores)
  const chartConfig = useMemo(() => ({
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(120, 120, 120, ${opacity})`,
    labelColor: (opacity = 1) => colors.textSecondary,
    barPercentage: 0.6,
    propsForBackgroundLines: { stroke: colors.border, strokeDasharray: '4 4' },
    formatYLabel: (val) => {
      // Compacta valores grandes no eixo Y para não ocupar espaço (ex.: R$ 8k)
      const n = Number(val);
      if (!Number.isFinite(n)) return '';
      if (n >= 1000) return `R$ ${Math.round(n / 1000)}k`;
      return `R$ ${Math.round(n)}`;
    },
  }), []);

  // Label de acessibilidade descreve o estado completo (não só o gráfico em si)
  const a11yLabel = semDados
    ? 'Gráfico Meta versus Realidade sem dados. Defina sua meta e registre vendas para visualizar.'
    : `Gráfico Meta versus Realidade do mês ${mesLabel || 'corrente'}. ` +
      `Meta de ${formatCurrency(meta)}, realizado de ${formatCurrency(realizado)}, ` +
      `${atingiuMeta ? `meta atingida em ${percAtingido.toFixed(0)} por cento` : `${percAtingido.toFixed(0)} por cento da meta, faltam ${formatCurrency(faltando)}`}.`;

  // ── Render: estado vazio (sem meta ou sem vendas) ──
  if (semDados) {
    return (
      <View
        style={styles.emptyCard}
        accessibilityRole="image"
        accessibilityLabel={a11yLabel}
      >
        <Feather name="bar-chart-2" size={28} color={colors.disabled} />
        <Text style={styles.emptyTitle}>Meta vs Realidade</Text>
        <Text style={styles.emptyDesc}>
          Defina sua meta de lucro acima e registre vendas no mês para visualizar a comparação.
        </Text>
      </View>
    );
  }

  // ── Render: chart com dados ──
  return (
    <View
      style={styles.card}
      accessibilityRole="image"
      accessibilityLabel={a11yLabel}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Meta vs Realidade</Text>
          {!!mesLabel && <Text style={styles.subtitle}>Mês de referência: {mesLabel}</Text>}
        </View>
        <View style={[styles.statusPill, { backgroundColor: (atingiuMeta ? colors.success : colors.error) + '15' }]}>
          <Feather
            name={atingiuMeta ? 'check-circle' : 'alert-circle'}
            size={14}
            color={atingiuMeta ? colors.success : colors.error}
          />
          <Text style={[styles.statusText, { color: atingiuMeta ? colors.success : colors.error }]}>
            {percAtingido.toFixed(0)}% da meta
          </Text>
        </View>
      </View>

      <BarChart
        data={chartData}
        width={chartWidth}
        height={220}
        chartConfig={chartConfig}
        fromZero
        showValuesOnTopOfBars
        withCustomBarColorFromData
        flatColor
        withInnerLines
        // Move labels do eixo Y para perto do chart (não cortar valores grandes)
        yAxisLabel=""
        yAxisSuffix=""
        style={styles.chart}
      />

      {/* Resumo numérico abaixo do gráfico — reforça o que o chart mostra */}
      <View style={styles.summaryRow}>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Meta</Text>
          <Text style={styles.summaryValue}>{formatCurrency(meta)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>Realizado</Text>
          <Text style={[styles.summaryValue, { color: corRealizado }]}>{formatCurrency(realizado)}</Text>
        </View>
        <View style={styles.summaryItem}>
          <Text style={styles.summaryLabel}>{atingiuMeta ? 'Excedente' : 'Faltando'}</Text>
          <Text style={[styles.summaryValue, { color: atingiuMeta ? colors.success : colors.error }]}>
            {formatCurrency(atingiuMeta ? realizado - meta : faltando)}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: Platform.OS === 'web' ? 'dashed' : 'solid',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
    color: colors.text,
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  emptyDesc: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.regular,
    color: colors.text,
  },
  subtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontFamily: fontFamily.semiBold,
    fontSize: 11,
  },
  chart: {
    marginVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    gap: spacing.sm,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    color: colors.textSecondary,
    marginBottom: 2,
  },
  summaryValue: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.small,
    color: colors.text,
  },
});

export default React.memo(MetaVsRealidadeChart);
