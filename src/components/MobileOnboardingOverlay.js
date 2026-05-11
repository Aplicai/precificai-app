import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

// Sessão 29 — Onboarding leve para mobile.
//
// Card sticky no topo da Home explicando a ordem correta de uso do app.
// Aparece SOMENTE em mobile (isMobile === true) e SOMENTE na Home (caller
// renderiza só lá). Dismiss inteligente via AsyncStorage:
//   - PREF_DISMISSED: true quando user clica "Não mostrar mais" OU concluiu
//     o walkthrough (último passo + "Começar pelo Financeiro").
//   - PREF_VIEWS: contador de aberturas. Acima de MAX_VIEWS, oculta.
//
// Não adiciona libs novas. Usa Animated da react-native + AsyncStorage.

const PREF_VIEWS = 'mobile_onboarding_views';
const PREF_DISMISSED = 'mobile_onboarding_dismissed';
const MAX_VIEWS = 20;

const STEPS = [
  {
    n: 1,
    icon: 'dollar-sign',
    color: colors.coral,
    title: 'Financeiro',
    desc: 'Comece configurando margem, custos do mês e faturamento. É a base de tudo.',
  },
  {
    n: 2,
    icon: 'shopping-bag',
    color: colors.success,
    title: 'Insumos',
    desc: 'Cadastre suas matérias-primas com preço, quantidade e unidade.',
  },
  {
    n: 3,
    icon: 'layers',
    color: colors.purple,
    title: 'Preparos',
    desc: 'Crie receitas base (massas, molhos, recheios) reutilizáveis.',
  },
  {
    n: 4,
    icon: 'package',
    color: colors.accent,
    title: 'Embalagens',
    desc: 'Cadastre caixas, potes e sacos que entram no custo do produto.',
  },
  {
    n: 5,
    icon: 'box',
    color: colors.primary,
    title: 'Produtos',
    desc: 'Monte fichas técnicas combinando insumos, preparos e embalagens.',
  },
  {
    n: 6,
    icon: 'trending-up',
    color: colors.yellow,
    title: 'Análise & Preço',
    desc: 'Defina preços de venda e acompanhe margens nos relatórios.',
  },
];

export default function MobileOnboardingOverlay({ navigation }) {
  const { isMobile } = useResponsiveLayout();
  const [visible, setVisible] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  const checkedRef = useRef(false);

  // Hidrata flag + contador na montagem
  useEffect(() => {
    if (!isMobile) return;
    if (checkedRef.current) return;
    checkedRef.current = true;
    (async () => {
      try {
        const [dismissed, viewsRaw] = await Promise.all([
          AsyncStorage.getItem(PREF_DISMISSED),
          AsyncStorage.getItem(PREF_VIEWS),
        ]);
        if (dismissed === '1') return;
        const views = parseInt(viewsRaw || '0', 10) || 0;
        if (views >= MAX_VIEWS) return;
        // Incrementa contador e mostra
        try {
          await AsyncStorage.setItem(PREF_VIEWS, String(views + 1));
        } catch {}
        setVisible(true);
        Animated.timing(fade, {
          toValue: 1,
          duration: 280,
          useNativeDriver: Platform.OS !== 'web',
        }).start();
      } catch {
        // Se AsyncStorage falhar, melhor não atrapalhar a Home.
      }
    })();
  }, [isMobile, fade]);

  const close = useCallback((permanent) => {
    Animated.timing(fade, {
      toValue: 0,
      duration: 180,
      useNativeDriver: Platform.OS !== 'web',
    }).start(() => setVisible(false));
    if (permanent) {
      AsyncStorage.setItem(PREF_DISMISSED, '1').catch(() => {});
    }
  }, [fade]);

  const navigateToFinanceiro = useCallback(() => {
    // HomeScreen navega para Financeiro via:
    //   navigation.getParent()?.navigate('Mais', { screen: 'FinanceiroMain' });
    // Replicamos esse padrão aqui.
    try {
      const parent = navigation?.getParent?.();
      if (parent && typeof parent.navigate === 'function') {
        parent.navigate('Mais', { screen: 'FinanceiroMain' });
      } else if (navigation && typeof navigation.navigate === 'function') {
        // Fallback caso esteja em outra estrutura
        navigation.navigate('Mais', { screen: 'FinanceiroMain' });
      }
    } catch {
      // ignore
    }
    close(true);
  }, [navigation, close]);

  const next = useCallback(() => {
    setStepIdx((i) => Math.min(i + 1, STEPS.length - 1));
  }, []);

  const prev = useCallback(() => {
    setStepIdx((i) => Math.max(i - 1, 0));
  }, []);

  if (!isMobile || !visible) return null;

  const isLast = stepIdx === STEPS.length - 1;
  const step = STEPS[stepIdx];

  // Modo compacto (não expandido): só um banner com CTA pra abrir
  if (!expanded) {
    return (
      <Animated.View style={[styles.banner, { opacity: fade }]}>
        <View style={styles.bannerIconWrap}>
          <Feather name="compass" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.bannerTitle}>Por onde começar?</Text>
          <Text style={styles.bannerDesc} numberOfLines={2}>
            Veja a ordem certa de uso em 6 passos rápidos.
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => setExpanded(true)}
          style={styles.bannerCta}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Ver passos do onboarding"
        >
          <Text style={styles.bannerCtaText}>Ver</Text>
          <Feather name="arrow-right" size={14} color="#fff" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => close(false)}
          style={styles.bannerCloseBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Fechar onboarding"
        >
          <Feather name="x" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // Modo expandido: walkthrough passo a passo
  return (
    <Animated.View style={[styles.card, { opacity: fade }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.stepIcon, { backgroundColor: step.color + '20' }]}>
          <Feather name={step.icon} size={18} color={step.color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardEyebrow}>Passo {step.n} de {STEPS.length}</Text>
          <Text style={styles.cardTitle}>{step.title}</Text>
        </View>
        <TouchableOpacity
          onPress={() => close(false)}
          style={styles.closeBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel="Fechar onboarding"
        >
          <Feather name="x" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>

      <Text style={styles.cardDesc}>{step.desc}</Text>

      {/* Progresso (dots) */}
      <View style={styles.dotsRow}>
        {STEPS.map((s, i) => (
          <View
            key={s.n}
            style={[
              styles.dot,
              i === stepIdx && styles.dotActive,
              i < stepIdx && styles.dotDone,
            ]}
          />
        ))}
      </View>

      {/* Navegação */}
      <View style={styles.actionsRow}>
        {stepIdx > 0 ? (
          <TouchableOpacity
            onPress={prev}
            style={styles.secondaryBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Feather name="arrow-left" size={14} color={colors.primary} />
            <Text style={styles.secondaryBtnText}>Voltar</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => close(true)}
            style={styles.secondaryBtn}
            activeOpacity={0.7}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Não mostrar mais</Text>
          </TouchableOpacity>
        )}

        {!isLast ? (
          <TouchableOpacity
            onPress={next}
            style={styles.primaryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
          >
            <Text style={styles.primaryBtnText}>Próximo</Text>
            <Feather name="arrow-right" size={14} color="#fff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={navigateToFinanceiro}
            style={styles.primaryBtn}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Começar pelo Financeiro"
          >
            <Text style={styles.primaryBtnText}>Começar pelo Financeiro</Text>
            <Feather name="arrow-right" size={14} color="#fff" style={{ marginLeft: 4 }} />
          </TouchableOpacity>
        )}
      </View>

      {/* Pular sempre disponível em qualquer passo (exceto o primeiro que já tem
          o "Não mostrar mais"). */}
      {stepIdx > 0 && !isLast && (
        <TouchableOpacity
          onPress={() => close(true)}
          style={styles.skipBtn}
          activeOpacity={0.7}
          accessibilityRole="button"
        >
          <Text style={styles.skipText}>Pular e não mostrar mais</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Banner compacto (estado inicial)
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.primary + '0C',
    borderColor: colors.primary + '30',
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
    marginBottom: spacing.sm,
  },
  bannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  bannerDesc: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 1,
  },
  bannerCta: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 8,
    borderRadius: borderRadius.sm,
    minHeight: 36,
  },
  bannerCtaText: {
    color: '#fff',
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
  },
  bannerCloseBtn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Card expandido (walkthrough)
  card: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    borderWidth: 1,
    borderColor: colors.primary + '25',
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  stepIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardEyebrow: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  cardTitle: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    color: colors.text,
    marginTop: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardDesc: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 19,
    marginBottom: spacing.sm + 4,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    marginBottom: spacing.sm + 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: colors.border,
  },
  dotActive: {
    backgroundColor: colors.primary,
    width: 18,
  },
  dotDone: {
    backgroundColor: colors.primary + '60',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.sm,
    minHeight: 44,
  },
  secondaryBtnText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    minHeight: 44,
    flexShrink: 1,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
  },
  skipBtn: {
    marginTop: spacing.sm,
    alignSelf: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    minHeight: 32,
  },
  skipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
