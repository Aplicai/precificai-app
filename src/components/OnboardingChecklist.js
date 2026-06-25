import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

// Chave de persistência do "ocultar". Segue a convenção dos outros
// componentes de onboarding da Home (ex.: mobile_onboarding_dismissed).
const PREF_DISMISSED = 'onboarding_checklist_dismissed';

/**
 * Checklist guiado, NÃO-bloqueante, para usuários novos.
 *
 * Orienta a ORDEM ideal de configuração: Financeiro → Insumos → Preparos → Produtos.
 * É apenas um guia visual: cada passo mostra ✓ quando concluído e é clicável
 * (navega para a tela correspondente). Pode ser ocultado (persiste em AsyncStorage).
 * Some automaticamente quando os 4 passos estiverem completos.
 *
 * Recebe os dados já calculados pela HomeScreen (zero queries adicionais):
 *  - financeiroCompleto: boolean (vem de finStatus.completo)
 *  - totalInsumos / totalPreparos / totalProdutos: number
 *  - onNavigate: (tab) => void  (a função `nav` da Home)
 */
export default function OnboardingChecklist({
  financeiroCompleto = false,
  totalInsumos = 0,
  totalPreparos = 0,
  totalProdutos = 0,
  onNavigate,
}) {
  // null = ainda não sabemos (não renderiza nada até hidratar — evita flash)
  const [dismissed, setDismissed] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const v = await AsyncStorage.getItem(PREF_DISMISSED);
        if (alive) setDismissed(v === '1');
      } catch {
        // Em caso de falha de storage, assume não-dispensado (não-bloqueante).
        if (alive) setDismissed(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    AsyncStorage.setItem(PREF_DISMISSED, '1').catch(() => {});
  }, []);

  // Cada passo: detecção de "completo" segue exatamente o padrão da Home.
  const steps = [
    {
      key: 'financeiro',
      n: 1,
      label: 'Configure o Financeiro',
      desc: 'Faturamento, custos e margem de lucro',
      icon: 'dollar-sign',
      tab: 'Financeiro',
      done: !!financeiroCompleto,
    },
    {
      key: 'insumos',
      n: 2,
      label: 'Cadastre seus insumos',
      desc: 'Ingredientes e matérias-primas',
      icon: 'shopping-bag',
      tab: 'Insumos',
      done: totalInsumos > 0,
    },
    {
      key: 'preparos',
      n: 3,
      label: 'Crie seus preparos',
      desc: 'Receitas base feitas com insumos',
      icon: 'layers',
      tab: 'Preparos',
      done: totalPreparos > 0,
    },
    {
      key: 'produtos',
      n: 4,
      label: 'Monte seus produtos',
      desc: 'Combine tudo e defina os preços',
      icon: 'box',
      tab: 'Produtos',
      done: totalProdutos > 0,
    },
  ];

  const concluidas = steps.filter((s) => s.done).length;
  const completo = concluidas === steps.length;
  // Índice do primeiro passo pendente — destacado como "próximo".
  const nextIndex = steps.findIndex((s) => !s.done);

  // Não renderiza: enquanto hidrata, se dispensado, ou se já completou tudo.
  if (dismissed === null || dismissed || completo) return null;

  const pct = Math.round((concluidas / steps.length) * 100);

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`Guia de primeiros passos. ${concluidas} de ${steps.length} concluídos.`}
    >
      {/* Header: título + progresso + botão ocultar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Feather name="compass" size={16} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Primeiros passos</Text>
            <Text style={styles.subtitle}>
              {concluidas} de {steps.length} concluídos · siga a ordem
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleDismiss}
          style={styles.dismissBtn}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityRole="button"
          accessibilityLabel="Ocultar guia de primeiros passos"
          activeOpacity={0.7}
        >
          <Feather name="x" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      {/* Barra de progresso */}
      <View style={styles.barBg}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>

      {/* Passos */}
      <View style={styles.steps}>
        {steps.map((s, i) => {
          const isNext = !s.done && i === nextIndex;
          return (
            <TouchableOpacity
              key={s.key}
              style={[styles.stepItem, isNext && styles.stepItemActive]}
              activeOpacity={0.7}
              onPress={() => onNavigate && onNavigate(s.tab)}
              accessibilityRole="button"
              accessibilityState={{ checked: s.done }}
              accessibilityLabel={`Passo ${s.n}: ${s.label}. ${
                s.done ? 'Concluído.' : isNext ? 'Próximo passo.' : 'Pendente.'
              }`}
            >
              <View
                style={[
                  styles.stepNumber,
                  s.done && styles.stepNumberDone,
                  isNext && styles.stepNumberActive,
                ]}
              >
                {s.done ? (
                  <Feather name="check" size={14} color="#fff" />
                ) : (
                  <Text style={[styles.stepNumberText, isNext && { color: '#fff' }]}>{s.n}</Text>
                )}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.stepLabel, s.done && styles.stepLabelDone]} numberOfLines={1}>
                  {s.label}
                </Text>
                <Text style={styles.stepDesc} numberOfLines={1}>
                  {s.done ? 'Concluído' : s.desc}
                </Text>
              </View>

              {s.done ? (
                <Feather name="check-circle" size={16} color={colors.success} />
              ) : isNext ? (
                <Feather name="arrow-right" size={16} color={colors.primary} />
              ) : (
                <Feather name="chevron-right" size={16} color={colors.disabled} />
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '20',
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '12',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.sm,
  },
  title: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },
  dismissBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  barBg: {
    height: 6,
    backgroundColor: colors.primary + '12',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  barFill: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
  steps: { marginTop: spacing.xs },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + 2,
    minHeight: 48, // área de toque acessível (≥44pt)
    borderBottomWidth: 1,
    borderBottomColor: colors.border + '40',
  },
  stepItemActive: {
    backgroundColor: colors.primary + '06',
    marginHorizontal: -spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    borderBottomWidth: 0,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberDone: { backgroundColor: colors.success, borderColor: colors.success },
  stepNumberActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  stepNumberText: { fontSize: fonts.small, fontWeight: '700', color: colors.textSecondary },
  stepLabel: {
    fontSize: fonts.small,
    fontWeight: '600',
    color: colors.text,
    fontFamily: fontFamily.semiBold,
  },
  stepLabelDone: { color: colors.textSecondary, textDecorationLine: 'line-through' },
  stepDesc: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginTop: 1,
  },
});
