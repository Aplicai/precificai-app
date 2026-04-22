/**
 * SuggestPriceModal (M1-23)
 *
 * Modal que mostra a sugestão de preço gerada pela IA. Estados:
 *  - loading  → spinner + texto reassuring
 *  - error    → mensagem + botão "Tentar de novo"
 *  - result   → cards com preço sugerido, psicológico, faixa, margem,
 *               racional, alertas, e CTA "Aplicar este preço"
 *
 * Props:
 *   visible: bool
 *   loading: bool
 *   error: string | null
 *   result: SuggestResponse | null
 *   onClose: () => void
 *   onRetry: () => void
 *   onApply: (preco: number) => void
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

function formatBRL(v) {
  const n = Number(v) || 0;
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function SuggestPriceModal({
  visible,
  loading,
  error,
  result,
  onClose,
  onRetry,
  onApply,
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <Feather name="zap" size={20} color={colors.primary} />
              <Text style={styles.title}>Sugestão de preço</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
              <Feather name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {loading && (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.primary} size="large" />
              <Text style={styles.loadingText}>
                Calculando sugestão...
              </Text>
              <Text style={styles.loadingHint}>
                Cruzando custo, despesas e margem alvo.
              </Text>
            </View>
          )}

          {!loading && error && (
            <View style={styles.errorBox}>
              <Feather name="alert-triangle" size={32} color={colors.warning} />
              <Text style={styles.errorTitle}>Não foi possível gerar a sugestão</Text>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryBtn} onPress={onRetry} activeOpacity={0.8}>
                <Feather name="refresh-cw" size={16} color="#fff" />
                <Text style={styles.retryText}>Tentar de novo</Text>
              </TouchableOpacity>
            </View>
          )}

          {!loading && !error && result && (
            <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
              <View style={styles.precoCard}>
                <Text style={styles.precoLabel}>Preço sugerido</Text>
                <Text style={styles.precoValor}>{formatBRL(result.preco_sugerido)}</Text>
                {result.preco_psicologico && result.preco_psicologico !== result.preco_sugerido && (
                  <Text style={styles.precoPsico}>
                    Psicológico: <Text style={{ fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primary }}>
                      {formatBRL(result.preco_psicologico)}
                    </Text>
                  </Text>
                )}
              </View>

              <View style={styles.statsRow}>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Faixa</Text>
                  <Text style={styles.statValue}>
                    {formatBRL(result.faixa_recomendada?.min)} – {formatBRL(result.faixa_recomendada?.max)}
                  </Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statLabel}>Margem</Text>
                  <Text style={[styles.statValue, { color: marginColor(result.margem_resultante) }]}>
                    {((result.margem_resultante || 0) * 100).toFixed(1)}%
                  </Text>
                </View>
              </View>

              {result.racional ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Por que esse preço?</Text>
                  <Text style={styles.racional}>{result.racional}</Text>
                </View>
              ) : null}

              {Array.isArray(result.alertas) && result.alertas.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Atenção</Text>
                  {result.alertas.map((a, i) => (
                    <View key={i} style={styles.alertaRow}>
                      <Feather name="info" size={14} color={colors.warning} />
                      <Text style={styles.alertaText}>{a}</Text>
                    </View>
                  ))}
                </View>
              )}

              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.applySecondaryBtn}
                  onPress={() => onApply(result.preco_psicologico || result.preco_sugerido)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.applySecondaryText}>
                    Usar psicológico ({formatBRL(result.preco_psicologico || result.preco_sugerido)})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={() => onApply(result.preco_sugerido)}
                  activeOpacity={0.8}
                >
                  <Feather name="check" size={16} color="#fff" />
                  <Text style={styles.applyText}>
                    Aplicar {formatBRL(result.preco_sugerido)}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.footnote}>
                Sugestão calculada a partir dos seus custos e despesas. Use como
                referência — você decide o preço final.
              </Text>
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

function marginColor(m) {
  const v = Number(m) || 0;
  if (v >= 0.3) return colors.success;
  if (v >= 0.15) return colors.warning;
  return colors.error;
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 460,
    maxHeight: '90%',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...Platform.select({
      web: { boxShadow: '0 8px 24px rgba(0,0,0,0.18)' },
      default: {
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18, shadowRadius: 12, elevation: 6,
      },
    }),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: fonts.medium, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },

  loadingBox: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  loadingText: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.semiBold, fontWeight: '600', marginTop: spacing.sm,
  },
  loadingHint: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.regular, textAlign: 'center',
  },

  errorBox: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  errorTitle: {
    fontSize: fonts.regular, color: colors.text, fontFamily: fontFamily.bold, fontWeight: '700',
    marginTop: spacing.sm, textAlign: 'center',
  },
  errorText: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.regular, textAlign: 'center', lineHeight: 18,
  },
  retryBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: 10, borderRadius: borderRadius.md, marginTop: spacing.sm,
  },
  retryText: { color: '#fff', fontFamily: fontFamily.semiBold, fontWeight: '600', fontSize: fonts.small },

  precoCard: {
    backgroundColor: colors.primary + '0E',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  precoLabel: {
    fontSize: fonts.tiny, color: colors.primary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.6,
  },
  precoValor: {
    fontSize: fonts.title, color: colors.primary,
    fontFamily: fontFamily.bold, fontWeight: '800',
    marginTop: 4,
  },
  precoPsico: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 4,
  },

  statsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  statBox: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginBottom: 2,
  },
  statValue: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },

  section: { marginBottom: spacing.md },
  sectionLabel: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6,
  },
  racional: {
    fontSize: fonts.small, color: colors.text,
    fontFamily: fontFamily.regular, lineHeight: 20,
  },
  alertaRow: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    paddingVertical: 4,
  },
  alertaText: {
    flex: 1, fontSize: fonts.small, color: colors.text,
    fontFamily: fontFamily.regular, lineHeight: 18,
  },

  actionsRow: { gap: spacing.sm, marginTop: spacing.sm },
  applyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: borderRadius.md,
  },
  applyText: { color: '#fff', fontFamily: fontFamily.bold, fontWeight: '700', fontSize: fonts.regular },
  applySecondaryBtn: {
    paddingVertical: 12, borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  applySecondaryText: {
    color: colors.text, fontFamily: fontFamily.semiBold, fontWeight: '600',
    fontSize: fonts.small,
  },

  footnote: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, lineHeight: 16,
    textAlign: 'center', marginTop: spacing.md, paddingHorizontal: spacing.sm,
  },
});
