import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Image, Modal, ActivityIndicator } from 'react-native';
import { useFocusEffect, CommonActions } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, borderRadius, fontFamily } from '../utils/theme';
import { getSetupStatus } from '../utils/setupStatus';
import { setFeatureFlag } from '../hooks/useFeatureFlag';

// Sessão 26 — flag persistida em AsyncStorage indicando que o user já respondeu
// a pergunta "faço delivery?". Uma vez marcada, o card some do Onboarding.
const PROFILE_ANSWERED_KEY = 'onboarding_business_profile_answered';

// Audit P1: mapeamento centralizado para evitar duplicar regras de navegação.
const STEP_NAV_MAP = {
  financeiro: { screen: 'Mais', params: { screen: 'FinanceiroMain' } },
  delivery: { screen: 'Mais', params: { screen: 'DeliveryHub' } },
};

export default function OnboardingScreen({ navigation }) {
  const [status, setStatus] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  // Sessão 26 — perfil do negócio (pergunta "faço delivery?")
  const [profileAnswered, setProfileAnswered] = useState(true); // true = não mostra (default seguro)
  // F1-J1-03: contador de tentativas automáticas em foco quando status chega
  // vazio (ex.: DB ainda hidratando). Limita para evitar loop infinito.
  const retryCountRef = React.useRef(0);
  const MAX_AUTO_RETRIES = 2;

  useFocusEffect(
    useCallback(() => {
      // Reset retries em cada foco — usuário voltando à tela quer fluxo limpo.
      retryCountRef.current = 0;
      loadStatus();
      // Sessão 26 — verifica se user já respondeu a pergunta de perfil
      (async () => {
        try {
          const v = await AsyncStorage.getItem(PROFILE_ANSWERED_KEY);
          setProfileAnswered(v === 'true');
        } catch {
          setProfileAnswered(true); // falha segura — não incomoda
        }
      })();
    }, [])
  );

  // Sessão 26 — callback de resposta da pergunta de delivery
  async function answerDeliveryProfile(usaDelivery) {
    try {
      await setFeatureFlag('usa_delivery', !!usaDelivery);
      await AsyncStorage.setItem(PROFILE_ANSWERED_KEY, 'true');
      setProfileAnswered(true);
    } catch (e) {
      console.error('[Onboarding.answerDeliveryProfile]', e);
    }
  }

  async function loadStatus() {
    try {
      const s = await getSetupStatus();
      // F1-J1-03: status "vazio" (sem etapas) = sintoma típico de DB ainda
      // não populada / falha intermitente do wrapper. Tenta novamente algumas
      // vezes antes de mostrar a UI degradada — evita o app vazio silencioso.
      const isEmpty = !s || !Array.isArray(s.etapas) || s.etapas.length === 0;
      if (isEmpty && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current += 1;
        console.error('[Onboarding.loadStatus] status vazio, retry', retryCountRef.current);
        setTimeout(() => loadStatus(), 600);
        return;
      }
      setStatus(s);
      setLoadError(null);
      if (s.completo) {
        // Audit P1: só mostra o modal de "configuração concluída" UMA vez.
        // Se o usuário já viu, não atrapalha mais ao revisitar a tela.
        try {
          const shown = await AsyncStorage.getItem('onboarding_complete_shown');
          if (shown !== 'true') {
            setShowCompleteModal(true);
            await AsyncStorage.setItem('onboarding_complete_shown', 'true');
          }
        } catch (e) {
          // Falha do AsyncStorage não impede mostrar modal pela primeira vez.
          console.error('[Onboarding.loadStatus.shownFlag]', e);
          setShowCompleteModal(true);
        }
      }
    } catch (err) {
      console.error('[Onboarding.loadStatus]', err);
      setLoadError('Não foi possível carregar seu progresso. Tente novamente.');
    }
  }

  async function goToHome() {
    try {
      await AsyncStorage.setItem('onboarding_done', 'true');
    } catch (e) {
      console.error('[Onboarding.goToHome]', e);
    }
    setShowCompleteModal(false);
    // F1-J1-02 (P0): reset completo do stack para evitar rotas residuais
    // inconsistentes (ex.: ProfileSetup/KitInicio ainda no histórico).
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      })
    );
  }

  function navToStep(etapa) {
    const target = STEP_NAV_MAP[etapa.key];
    if (target) {
      navigation.navigate('MainTabs', target);
    } else {
      navigation.navigate('MainTabs', { screen: etapa.tab });
    }
  }

  async function skipToHome() {
    try {
      await AsyncStorage.setItem('onboarding_done', 'true');
    } catch (e) {
      console.error('[Onboarding.skipToHome]', e);
    }
    // F1-J1-02 (P0): reset completo do stack para evitar rotas residuais
    // inconsistentes ao pular o onboarding direto pra MainTabs.
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'MainTabs' }],
      })
    );
  }

  // Audit P2: feedback de loading inicial (antes era tela em branco).
  if (!status && !loadError) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 12, fontSize: fonts.small, color: colors.textSecondary }}>
          Carregando seu progresso…
        </Text>
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: spacing.lg }]}>
        <Feather name="alert-circle" size={32} color={colors.warning} />
        <Text style={{ marginTop: 12, fontSize: fonts.regular, color: colors.text, textAlign: 'center', marginBottom: 16 }}>
          {loadError}
        </Text>
        <TouchableOpacity
          style={{ backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 20, borderRadius: borderRadius.sm }}
          onPress={loadStatus}
          activeOpacity={0.8}
        >
          <Text style={{ color: '#fff', fontWeight: '700' }}>Tentar de novo</Text>
        </TouchableOpacity>
      </View>
    );
  }

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

        {/* Sprint 1 Q5 — Onboarding canais: 3 opções explícitas (balcão, delivery, ambos) em vez de
            binária "faço delivery sim/não". Reduz erro de classificação para quem vende em múltiplos canais. */}
        {!profileAnswered && (
          <View style={styles.profileCard}>
            <View style={styles.profileHeader}>
              <Feather name="briefcase" size={18} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.profileTitle}>Em quais canais você vende?</Text>
            </View>
            <Text style={styles.profileDesc}>
              Isso ajusta as ferramentas que aparecem. Você pode mudar depois em Configurações.
            </Text>
            <View style={[styles.profileBtnRow, { flexWrap: 'wrap', gap: 8 }]}>
              <TouchableOpacity
                style={[styles.profileBtn, styles.profileBtnSecondary, { flex: 1, minWidth: 110 }]}
                onPress={() => answerDeliveryProfile(false)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Vendo apenas no balcão ou salão"
              >
                <Feather name="shopping-bag" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.profileBtnTextSecondary}>Só balcão</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.profileBtn, styles.profileBtnSecondary, { flex: 1, minWidth: 110 }]}
                onPress={() => answerDeliveryProfile(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Vendo apenas por delivery"
              >
                <Feather name="truck" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.profileBtnTextSecondary}>Só delivery</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.profileBtn, styles.profileBtnPrimary, { flex: 1, minWidth: 110 }]}
                onPress={() => answerDeliveryProfile(true)}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Vendo no balcão e por delivery"
              >
                <Feather name="layers" size={16} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.profileBtnTextPrimary}>Os dois</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

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

  // Perfil do negócio (Sessão 26)
  profileCard: {
    backgroundColor: colors.primary + '08',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  profileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  profileTitle: { fontSize: fonts.regular, fontWeight: '700', color: colors.text },
  profileDesc: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: spacing.sm, lineHeight: 16 },
  profileBtnRow: { flexDirection: 'row', gap: spacing.sm },
  profileBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 2, borderRadius: borderRadius.sm,
  },
  profileBtnPrimary: { backgroundColor: colors.primary },
  profileBtnSecondary: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.primary,
  },
  profileBtnTextPrimary: { color: '#fff', fontWeight: '700', fontSize: fonts.small },
  profileBtnTextSecondary: { color: colors.primary, fontWeight: '700', fontSize: fonts.small },

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
  // Audit P1 acessibilidade: removido `line-through` (redundante com check-icon
  // e prejudica leitura para baixa visão). Mantém só cor verde + ícone.
  finSubTextDone: { color: colors.success, fontFamily: fontFamily.semiBold },
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
