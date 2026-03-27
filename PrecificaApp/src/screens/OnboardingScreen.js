import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius, fontFamily } from '../utils/theme';
import { getSetupStatus } from '../utils/setupStatus';

export default function OnboardingScreen({ navigation }) {
  const [status, setStatus] = useState(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadStatus();
    }, [])
  );

  async function loadStatus() {
    const s = await getSetupStatus();
    setStatus(s);
    if (s.completo) {
      setShowCompleteModal(true);
    }
  }

  function goToHome() {
    setShowCompleteModal(false);
    navigation.replace('MainTabs');
  }

  function navToStep(etapa) {
    if (etapa.key === 'financeiro') {
      navigation.navigate('MainTabs', { screen: 'Ferramentas', params: { screen: 'FinanceiroMain' } });
    } else if (etapa.key === 'delivery') {
      navigation.navigate('MainTabs', { screen: 'Ferramentas', params: { screen: 'DeliveryHub' } });
    } else {
      navigation.navigate('MainTabs', { screen: etapa.tab });
    }
  }

  function skipToHome() {
    navigation.replace('MainTabs');
  }

  if (!status) return <View style={styles.container} />;

  const finStep = status.etapas[0];

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>

        {/* Botão Voltar ao Kit */}
        <TouchableOpacity
          style={styles.backToKit}
          onPress={() => navigation.navigate('KitInicio', { setup: true })}
          activeOpacity={0.7}
        >
          <Feather name="arrow-left" size={18} color={colors.primary} />
          <Text style={styles.backToKitText}>Voltar ao Kit de Início</Text>
        </TouchableOpacity>

        {/* Header */}
        <View style={styles.header}>
          <Image source={require('../../assets/images/logo-header-green.png')} style={{ width: 160, height: 34 }} resizeMode="contain" />
          <Text style={styles.headerTitle}>Configure seu app</Text>
          <Text style={styles.headerDesc}>
            Complete as etapas abaixo para ativar todos os cálculos de precificação, margem e rentabilidade.
          </Text>
        </View>

        {/* Progress */}
        <View style={styles.progressCard}>
          <View style={styles.progressRow}>
            <Text style={styles.progressLabel}>Progresso geral</Text>
            <Text style={styles.progressPct}>{Math.round(status.progresso * 100)}%</Text>
          </View>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, {
              width: `${status.progresso * 100}%`,
              backgroundColor: status.progresso === 1 ? colors.success : colors.primary,
            }]} />
          </View>
          <Text style={styles.progressDetail}>
            {status.concluidas} de {status.total} etapas concluídas
          </Text>
        </View>

        {/* Financeiro obrigatório - destaque */}
        {!finStep.done && (
          <View style={styles.finAlert}>
            <View style={styles.finAlertHeader}>
              <Feather name="alert-triangle" size={18} color="#E65100" style={{ marginRight: 6 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.finAlertTitle}>Financeiro é obrigatório</Text>
                <Text style={styles.finAlertDesc}>
                  Esses dados definem markup, margem e preço sugerido de todos os seus produtos.
                </Text>
              </View>
            </View>
            {/* Sub-progress */}
            <View style={styles.finSubProgress}>
              {finStep.detalhes.map(d => (
                <View key={d.label} style={styles.finSubItem}>
                  <Feather
                    name={d.done ? 'check-circle' : 'circle'}
                    size={14}
                    color={d.done ? colors.success : colors.disabled}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.finSubText, d.done && styles.finSubTextDone]}>{d.label}</Text>
                </View>
              ))}
            </View>
            <TouchableOpacity style={styles.finCta} onPress={() => navToStep(finStep)} activeOpacity={0.7}>
              <Text style={styles.finCtaText}>Configurar Financeiro</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Etapas */}
        <Text style={styles.sectionTitle}>
          {finStep.done ? 'Continue configurando' : 'Próximas etapas'}
        </Text>

        {status.etapas.map((etapa, index) => {
          if (etapa.key === 'financeiro' && !etapa.done) return null;
          const locked = !finStep.done && etapa.key !== 'financeiro';

          return (
            <TouchableOpacity
              key={etapa.key}
              style={[styles.stepCard, etapa.done && styles.stepCardDone, locked && styles.stepCardLocked]}
              onPress={locked ? undefined : () => navToStep(etapa)}
              activeOpacity={locked ? 1 : 0.7}
            >
              <View style={styles.stepLeft}>
                <View style={[styles.stepNumber, etapa.done && styles.stepNumberDone, locked && styles.stepNumberLocked]}>
                  {etapa.done ? (
                    <Feather name="check" size={16} color="#fff" />
                  ) : locked ? (
                    <Feather name="lock" size={14} color={colors.disabled} />
                  ) : (
                    <Text style={styles.stepNumberText}>{index + 1}</Text>
                  )}
                </View>
              </View>
              <View style={styles.stepBody}>
                <View style={styles.stepHeader}>
                  <Feather name={etapa.icon} size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={[styles.stepTitle, locked && styles.stepTitleLocked]}>{etapa.label}</Text>
                  {etapa.done && etapa.count > 0 && (
                    <View style={styles.stepBadge}>
                      <Text style={styles.stepBadgeText}>{etapa.count}</Text>
                    </View>
                  )}
                </View>
                <Text style={[styles.stepDesc, locked && styles.stepDescLocked]}>{etapa.desc}</Text>
                {locked && (
                  <Text style={styles.stepLockedHint}>Complete o Financeiro primeiro</Text>
                )}
              </View>
              {!locked && !etapa.done && (
                <Text style={styles.stepChevron}>›</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* Skip */}
        {finStep.done && (
          <TouchableOpacity style={styles.skipBtn} onPress={skipToHome} activeOpacity={0.7}>
            <Text style={styles.skipText}>Ir para a Home</Text>
            <Feather name="arrow-right" size={16} color={colors.primary} style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Modal de configuração completa */}
      <Modal visible={showCompleteModal} transparent animationType="fade">
        <View style={styles.completeOverlay}>
          <View style={styles.completeCard}>
            <View style={styles.completeIconCircle}>
              <Feather name="check" size={36} color="#fff" />
            </View>
            <Text style={styles.completeTitle}>Configuração concluída!</Text>
            <Text style={styles.completeDesc}>
              Tudo pronto! Seu app está configurado e os cálculos de precificação já estão ativos.
            </Text>
            <TouchableOpacity style={styles.completeBtn} onPress={goToHome} activeOpacity={0.7}>
              <Text style={styles.completeBtnText}>Ir para o Início</Text>
              <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 520, alignSelf: 'center', width: '100%' },

  // Back to Kit
  backToKit: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: spacing.sm, paddingHorizontal: 2,
    marginBottom: spacing.xs, alignSelf: 'flex-start',
  },
  backToKitText: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.primary },

  // Header
  header: { alignItems: 'center', paddingVertical: spacing.lg, paddingBottom: spacing.md },
  headerTitle: { fontSize: fonts.title, fontWeight: '800', fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.xs, marginTop: spacing.md },
  headerDesc: {
    fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 20, paddingHorizontal: spacing.md,
  },

  // Progress
  progressCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: spacing.xs },
  progressLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.text },
  progressPct: { fontSize: fonts.small, fontWeight: '800', color: colors.primary },
  progressBarBg: { height: 8, backgroundColor: colors.border, borderRadius: 4, overflow: 'hidden', marginBottom: spacing.xs },
  progressBarFill: { height: 8, borderRadius: 4 },
  progressDetail: { fontSize: fonts.tiny, color: colors.textSecondary },

  // Financeiro alert
  finAlert: {
    backgroundColor: '#FFF8E1', borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: '#FFE082',
    padding: spacing.md, marginBottom: spacing.md,
  },
  finAlertHeader: { flexDirection: 'row', marginBottom: spacing.sm },
  finAlertIcon: { fontSize: 22, marginRight: spacing.sm, marginTop: 2 },
  finAlertTitle: { fontSize: fonts.regular, fontWeight: '700', color: '#E65100', marginBottom: 2 },
  finAlertDesc: { fontSize: fonts.tiny, color: '#BF360C', lineHeight: 17 },
  finSubProgress: { marginBottom: spacing.sm },
  finSubItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 3 },
  finSubIcon: { fontSize: 13, color: colors.disabled, marginRight: spacing.sm, width: 18, textAlign: 'center' },
  finSubIconDone: { color: colors.success },
  finSubText: { fontSize: fonts.small, color: colors.textSecondary },
  finSubTextDone: { color: colors.success, textDecorationLine: 'line-through' },
  finCta: {
    backgroundColor: '#FF8F00', borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, alignItems: 'center',
  },
  finCtaText: { color: '#fff', fontWeight: '700', fontSize: fonts.regular },

  // Section
  sectionTitle: {
    fontSize: fonts.regular, fontWeight: '700', color: colors.text,
    marginBottom: spacing.sm, marginTop: spacing.xs,
  },

  // Steps
  stepCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  stepCardDone: { borderLeftWidth: 3, borderLeftColor: colors.success },
  stepCardLocked: { opacity: 0.6 },
  stepLeft: { marginRight: spacing.sm },
  stepNumber: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: colors.inputBg, borderWidth: 2, borderColor: colors.border,
    justifyContent: 'center', alignItems: 'center',
  },
  stepNumberDone: { backgroundColor: colors.success + '15', borderColor: colors.success },
  stepNumberLocked: { backgroundColor: colors.inputBg, borderColor: colors.disabled },
  stepNumberText: { fontSize: fonts.small, fontWeight: '700', color: colors.textSecondary },
  stepNumberTextDone: { color: colors.success },
  stepBody: { flex: 1 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  stepIcon: { fontSize: 16, marginRight: spacing.xs },
  stepTitle: { fontSize: fonts.regular, fontWeight: '700', color: colors.text },
  stepTitleLocked: { color: colors.disabled },
  stepBadge: {
    backgroundColor: colors.success + '15', borderRadius: 10,
    paddingHorizontal: 6, paddingVertical: 1, marginLeft: spacing.xs,
  },
  stepBadgeText: { fontSize: 11, fontWeight: '700', color: colors.success },
  stepDesc: { fontSize: fonts.tiny, color: colors.textSecondary, lineHeight: 16 },
  stepDescLocked: { color: colors.disabled },
  stepLockedHint: { fontSize: 10, color: '#E65100', marginTop: 2, fontStyle: 'italic' },
  stepChevron: { fontSize: 22, color: colors.disabled, marginLeft: spacing.xs },

  // Skip
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.md, marginTop: spacing.sm,
  },
  skipText: { fontSize: fonts.regular, fontWeight: '600', color: colors.primary, marginRight: spacing.xs },
  skipArrow: { fontSize: fonts.large, color: colors.primary },

  // Complete modal
  completeOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  completeCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.xl, alignItems: 'center', maxWidth: 340, width: '100%',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15, shadowRadius: 24, elevation: 12,
  },
  completeIconCircle: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: colors.success, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.md,
  },
  completeTitle: {
    fontSize: fonts.title, fontWeight: '800', fontFamily: fontFamily.bold,
    color: colors.text, marginBottom: spacing.sm, textAlign: 'center',
  },
  completeDesc: {
    fontSize: fonts.small, color: colors.textSecondary,
    textAlign: 'center', lineHeight: 20, marginBottom: spacing.lg,
  },
  completeBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 4, paddingHorizontal: spacing.xl, width: '100%',
  },
  completeBtnText: {
    color: '#fff', fontWeight: '700', fontSize: fonts.regular,
  },
});
