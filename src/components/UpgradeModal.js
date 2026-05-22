import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { PLAN_LABELS, PLAN_PRICES } from '../config/plans';

/**
 * UpgradeModal — popup de upgrade reutilizável (Fase 0).
 *
 * Estratégia (regra do fundador): empurrar o usuário a assinar no momento de
 * MAIOR intenção (bateu o limite / tocou num recurso pago). Persistente, mas
 * não chato: sempre dá a saída "Agora não".
 *
 * RN Web-safe: usa Modal + Pressable (NÃO Alert.alert, que no web só renderiza
 * ≤2 botões e tem callback não-confiável).
 *
 * Props:
 *   visible       bool
 *   onClose       fn   — fechar (botão "Agora não" / clique no backdrop)
 *   requiredPlan  'pro' | 'ilimitado'  — plano que desbloqueia (default 'pro')
 *   title         string — ex: "Delivery é um recurso Pro"
 *   message       string — explicação curta
 *   highlights    string[] — bullets do que a assinatura desbloqueia (opcional)
 *   onSubscribe   fn   — ação do botão "Assinar" (FASE 1: abre checkout Asaas).
 *                        Na Fase 0 pode ser undefined → mostra aviso "em breve".
 */
export default function UpgradeModal({
  visible,
  onClose,
  requiredPlan = 'pro',
  title,
  message,
  highlights = [],
  onSubscribe,
}) {
  const planLabel = PLAN_LABELS[requiredPlan] || 'Pro';
  const price = PLAN_PRICES[requiredPlan];
  const priceStr = price != null
    ? `R$ ${price.toFixed(2).replace('.', ',')}/mês`
    : '';

  const handleSubscribe = () => {
    if (onSubscribe) {
      onSubscribe();
    } else if (Platform.OS === 'web') {
      // Fase 0 — checkout ainda não plugado (Asaas é Fase 1).
      window.alert('Assinatura em breve! Estamos finalizando o pagamento.');
    }
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        {/* Pressable interno bloqueia o fechamento ao clicar dentro do card */}
        <Pressable style={styles.card} onPress={() => {}}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ alignItems: 'center' }}>
            <View style={styles.iconCircle}>
              <Feather name="lock" size={26} color="#fff" />
            </View>

            <Text style={styles.title}>{title || `Recurso do plano ${planLabel}`}</Text>

            {!!message && <Text style={styles.message}>{message}</Text>}

            {highlights.length > 0 && (
              <View style={styles.highlights}>
                {highlights.map((h, i) => (
                  <View key={i} style={styles.highlightRow}>
                    <Feather name="check" size={15} color={colors.success} />
                    <Text style={styles.highlightText}>{h}</Text>
                  </View>
                ))}
              </View>
            )}

            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>{planLabel}</Text>
              {!!priceStr && <Text style={styles.planBadgePrice}>{priceStr}</Text>}
            </View>

            <Pressable
              style={({ pressed }) => [styles.btnPrimary, pressed && { opacity: 0.85 }]}
              onPress={handleSubscribe}
              accessibilityRole="button"
              accessibilityLabel={`Assinar plano ${planLabel}`}
            >
              <Feather name="zap" size={16} color="#fff" />
              <Text style={styles.btnPrimaryText}>Assinar {planLabel}</Text>
            </Pressable>

            <Pressable
              style={styles.btnSecondary}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Agora não"
            >
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
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(0,0,0,0.25)' },
      default: { elevation: 16 },
    }),
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: {
    fontSize: fonts.title,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  message: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  highlights: {
    width: '100%',
    marginTop: spacing.md,
    gap: 8,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  highlightText: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.text,
  },
  planBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderRadius: borderRadius.md,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginTop: spacing.md,
  },
  planBadgeText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.primary,
  },
  planBadgePrice: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    width: '100%',
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    minHeight: 48,
    marginTop: spacing.lg,
  },
  btnPrimaryText: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: '#fff',
  },
  btnSecondary: {
    paddingVertical: 12,
    marginTop: spacing.xs,
    alignItems: 'center',
  },
  btnSecondaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
});
