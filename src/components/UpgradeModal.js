import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { PLAN_LABELS, PLAN_PRICES, PLAN_PRICES_ANNUAL, PLAN_BENEFITS } from '../config/plans';

/**
 * UpgradeModal — popup de upgrade reutilizável (Fase 0).
 *
 * Estratégia (regra do fundador): sempre que a pessoa tocar num recurso fora do
 * plano dela, mostrar de forma CLARA as VANTAGENS de assinar, no momento de maior
 * intenção. Persistente mas não chato (sempre há "Agora não").
 *
 * RN Web-safe: Modal + Pressable (não Alert.alert).
 *
 * Props:
 *   visible       bool
 *   onClose       fn
 *   requiredPlan  'pro' | 'ilimitado'  (default 'pro')
 *   title         string — ex: "Delivery é um recurso Pro"
 *   message       string — frase curta de contexto (opcional)
 *   highlights    string[] — bullets de vantagens. Se vazio, usa PLAN_BENEFITS[plano].
 *   onSubscribe   fn — ação do botão "Assinar" (Fase 1: checkout Asaas). Stub por ora.
 */
export default function UpgradeModal({
  visible,
  onClose,
  requiredPlan = 'pro',
  title,
  message,
  highlights,
  onSubscribe,
}) {
  const planLabel = PLAN_LABELS[requiredPlan] || 'Pro';
  const monthly = PLAN_PRICES[requiredPlan];
  const annual = PLAN_PRICES_ANNUAL[requiredPlan];
  const fmt = (v) => `R$ ${Number(v).toFixed(2).replace('.', ',')}`;

  // Vantagens: usa as passadas ou cai no padrão do plano (sempre comunica valor).
  const benefits = (highlights && highlights.length > 0)
    ? highlights
    : (PLAN_BENEFITS[requiredPlan] || []);

  const handleSubscribe = () => {
    if (onSubscribe) {
      onSubscribe();
    } else if (Platform.OS === 'web') {
      window.alert('Assinatura em breve! Estamos finalizando o pagamento.');
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'stretch' }}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.iconCircle}>
                <Feather name="lock" size={22} color="#fff" />
              </View>
              <View style={styles.planTag}>
                <Feather name="zap" size={11} color={colors.primary} />
                <Text style={styles.planTagText}>{planLabel.toUpperCase()}</Text>
              </View>
            </View>

            <Text style={styles.title}>{title || `Recurso do plano ${planLabel}`}</Text>
            {!!message && <Text style={styles.message}>{message}</Text>}

            {/* Vantagens */}
            <View style={styles.benefitsCard}>
              <Text style={styles.benefitsTitle}>O que você desbloqueia com o {planLabel}</Text>
              {benefits.map((b, i) => (
                <View key={i} style={styles.benefitRow}>
                  <View style={styles.benefitCheck}>
                    <Feather name="check" size={12} color="#fff" />
                  </View>
                  <Text style={styles.benefitText}>{b}</Text>
                </View>
              ))}
            </View>

            {/* Preço */}
            <View style={styles.priceBlock}>
              <Text style={styles.priceMain}>
                {fmt(monthly)}<Text style={styles.pricePer}>/mês</Text>
              </Text>
              {annual > 0 && (
                <Text style={styles.priceAnnual}>
                  ou {fmt(annual)}/ano no Pix · economize 10%
                </Text>
              )}
            </View>

            {/* CTA */}
            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
              onPress={handleSubscribe}
              accessibilityRole="button"
              accessibilityLabel={`Assinar plano ${planLabel}`}
            >
              <Feather name="zap" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Assinar {planLabel}</Text>
            </Pressable>

            <Pressable style={styles.btnSecondary} onPress={onClose} accessibilityRole="button">
              <Text style={styles.btnSecondaryText}>Agora não</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    maxHeight: '92%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...Platform.select({
      web: { boxShadow: '0 24px 70px rgba(0,0,0,0.28)' },
      default: { elevation: 16 },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  planTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primary + '14',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  planTagText: {
    fontSize: 11,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.5,
  },
  title: {
    fontSize: fonts.title,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    marginTop: spacing.xs,
  },
  message: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 4,
    lineHeight: 20,
  },
  benefitsCard: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    marginTop: spacing.md,
    gap: 10,
  },
  benefitsTitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 2,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  benefitCheck: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  benefitText: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
    lineHeight: 19,
  },
  priceBlock: {
    alignItems: 'center',
    marginTop: spacing.md,
  },
  priceMain: {
    fontSize: 30,
    fontFamily: fontFamily.bold,
    fontWeight: '800',
    color: colors.primary,
  },
  pricePer: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  priceAnnual: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginTop: 2,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 15,
    minHeight: 50,
    marginTop: spacing.md,
  },
  btnPrimaryText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: '#fff',
  },
  btnSecondary: {
    paddingVertical: 12,
    marginTop: 4,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
});
