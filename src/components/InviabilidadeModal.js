/**
 * InviabilidadeModal (Sprint 3)
 *
 * Modal explicativo quando o preço delivery sugerido é inviável (taxa da
 * plataforma cobre/excede o preço base) OU quando o lucro calculado é
 * negativo. Mostra:
 *   - Diagnóstico textual (causa raiz)
 *   - Composição numérica (custo + taxa + comissão + desconto)
 *   - Preço mínimo viável calculado
 *   - 4 dicas práticas para tornar viável
 *   - Botão fechar
 *
 * Props:
 *   visible: bool
 *   onClose: () => void
 *   info: {
 *     itemNome: string,
 *     plataformaNome: string,
 *     custoUnitario: number,
 *     precoBalcao: number,
 *     taxaPct: number,           // ex: 25 = 25%
 *     comissaoApp: number,       // valor fixo R$
 *     descontoPct: number,       // ex: 10 = 10%
 *     precoDelivery: number,     // 0 se inviável
 *     lucro: number,             // pode ser negativo
 *     inviavel: boolean,         // true = sugestão impossível
 *   } | null
 */
import React from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Calcula o preço delivery mínimo viável (lucro >= 0):
 *   precoMin * (1 - taxa% - desconto%) - custo - comissao = 0
 *   precoMin = (custo + comissao) / (1 - taxa% - desconto%)
 *
 * Retorna null se a soma de taxa+desconto >= 100% (matematicamente inviável).
 */
function calcPrecoMinimoViavel(custo, comissao, taxaPct, descontoPct) {
  const denom = 1 - (safeNum(taxaPct) + safeNum(descontoPct)) / 100;
  if (denom <= 0) return null;
  return (safeNum(custo) + safeNum(comissao)) / denom;
}

/**
 * Calcula a taxa máxima viável dado o preço de balcão atual:
 *   custo / precoBalcao = 1 - taxa%/100 - desconto%/100
 *   taxa% = (1 - custo/precoBalcao - desconto%/100) * 100
 *
 * Útil para sugerir alvo de renegociação.
 */
function calcTaxaMaximaViavel(custo, precoBalcao, comissao, descontoPct) {
  const c = safeNum(custo) + safeNum(comissao);
  const p = safeNum(precoBalcao);
  if (p <= 0) return null;
  const ratio = c / p;
  const max = (1 - ratio - safeNum(descontoPct) / 100) * 100;
  return max > 0 ? max : 0;
}

export default function InviabilidadeModal({ visible, onClose, info }) {
  if (!info) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.backdrop} />
      </Modal>
    );
  }

  const {
    itemNome,
    plataformaNome,
    custoUnitario,
    precoBalcao,
    taxaPct,
    comissaoApp,
    descontoPct,
    precoDelivery,
    lucro,
    inviavel,
  } = info;

  const precoMin = calcPrecoMinimoViavel(custoUnitario, comissaoApp, taxaPct, descontoPct);
  const taxaMax = calcTaxaMaximaViavel(custoUnitario, precoBalcao, comissaoApp, descontoPct);

  const tituloDiagnostico = inviavel
    ? 'Preço sugerido inviável'
    : 'Venda com prejuízo';

  const textoDiagnostico = inviavel
    ? `A taxa de ${plataformaNome} (${safeNum(taxaPct).toFixed(1)}%) somada ao desconto promocional cobre o preço de balcão — a venda nunca cobriria os custos.`
    : `Com o preço atual e os custos da plataforma, cada venda gera prejuízo de ${formatCurrency(Math.abs(safeNum(lucro)))}.`;

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
              <Feather name="alert-octagon" size={20} color={colors.error} />
              <Text style={styles.title}>{tituloDiagnostico}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              accessibilityRole="button"
              accessibilityLabel="Fechar diagnóstico"
            >
              <Feather name="x" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={{ paddingBottom: spacing.md }}>
            {/* Item info */}
            <Text style={styles.itemInfo}>
              <Text style={styles.itemNome}>{itemNome}</Text>
              {' em '}
              <Text style={styles.itemNome}>{plataformaNome}</Text>
            </Text>

            {/* Diagnóstico */}
            <View style={styles.diagBox}>
              <Text style={styles.diagText}>{textoDiagnostico}</Text>
            </View>

            {/* Composição */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Composição</Text>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Custo unitário (CMV)</Text>
                <Text style={styles.rowValue}>{formatCurrency(custoUnitario)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Preço de balcão</Text>
                <Text style={styles.rowValue}>{formatCurrency(precoBalcao)}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.rowLabel}>Taxa da plataforma</Text>
                <Text style={[styles.rowValue, { color: colors.error }]}>
                  {safeNum(taxaPct).toFixed(1)}%
                </Text>
              </View>
              {safeNum(comissaoApp) > 0 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Comissão fixa</Text>
                  <Text style={styles.rowValue}>{formatCurrency(comissaoApp)}</Text>
                </View>
              )}
              {safeNum(descontoPct) > 0 && (
                <View style={styles.row}>
                  <Text style={styles.rowLabel}>Desconto promocional</Text>
                  <Text style={styles.rowValue}>{safeNum(descontoPct).toFixed(1)}%</Text>
                </View>
              )}
              {!inviavel && safeNum(precoDelivery) > 0 && (
                <View style={[styles.row, styles.rowTotal]}>
                  <Text style={styles.rowLabel}>Preço delivery atual</Text>
                  <Text style={styles.rowValue}>{formatCurrency(precoDelivery)}</Text>
                </View>
              )}
            </View>

            {/* Preço mínimo viável */}
            {precoMin !== null && (
              <View style={styles.precoMinBox}>
                <Text style={styles.precoMinLabel}>Preço mínimo viável</Text>
                <Text style={styles.precoMinValue}>{formatCurrency(precoMin)}</Text>
                <Text style={styles.precoMinHint}>
                  Acima desse valor a venda começa a dar lucro.
                </Text>
              </View>
            )}

            {/* Dicas */}
            <View style={styles.section}>
              <Text style={styles.sectionLabel}>Como tornar viável</Text>

              <View style={styles.dicaRow}>
                <View style={styles.dicaIconBox}>
                  <Feather name="message-circle" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dicaTitle}>Negocie a taxa</Text>
                  <Text style={styles.dicaText}>
                    Peça uma comissão menor à {plataformaNome}
                    {taxaMax !== null && taxaMax < safeNum(taxaPct)
                      ? ` (atual ${safeNum(taxaPct).toFixed(1)}%, alvo até ${taxaMax.toFixed(1)}%)`
                      : ''}.
                  </Text>
                </View>
              </View>

              <View style={styles.dicaRow}>
                <View style={styles.dicaIconBox}>
                  <Feather name="trending-up" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dicaTitle}>Embuta o custo no preço de balcão</Text>
                  <Text style={styles.dicaText}>
                    Aumente o preço de venda balcão para diluir a taxa percentual.
                  </Text>
                </View>
              </View>

              <View style={styles.dicaRow}>
                <View style={styles.dicaIconBox}>
                  <Feather name="package" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dicaTitle}>Reduza o custo unitário</Text>
                  <Text style={styles.dicaText}>
                    Revise ingredientes, preparos e embalagens para baixar o CMV.
                  </Text>
                </View>
              </View>

              <View style={styles.dicaRow}>
                <View style={styles.dicaIconBox}>
                  <Feather name="edit-3" size={14} color={colors.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.dicaTitle}>Defina manualmente o preço delivery</Text>
                  <Text style={styles.dicaText}>
                    {precoMin !== null
                      ? `Digite um valor acima de ${formatCurrency(precoMin)} no campo "Preço Delivery".`
                      : 'Digite um valor que cubra custo + taxa + comissão.'}
                  </Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel="Entendi, fechar"
            >
              <Text style={styles.closeBtnText}>Entendi</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
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
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
        elevation: 6,
      },
    }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: {
    fontSize: fonts.medium,
    color: colors.text,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  itemInfo: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginBottom: spacing.sm,
  },
  itemNome: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },

  diagBox: {
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3,
    borderLeftColor: colors.error,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  diagText: {
    fontSize: fonts.small,
    color: '#991b1b',
    fontFamily: fontFamily.regular,
    lineHeight: 18,
  },

  section: { marginBottom: spacing.md },
  sectionLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  rowTotal: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    marginTop: 4,
    paddingTop: 8,
  },
  rowLabel: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  rowValue: {
    fontSize: fonts.small,
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },

  precoMinBox: {
    backgroundColor: colors.success + '14',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  precoMinLabel: {
    fontSize: fonts.tiny,
    color: colors.success,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  precoMinValue: {
    fontSize: fonts.title,
    color: colors.success,
    fontFamily: fontFamily.bold,
    fontWeight: '800',
    marginTop: 4,
  },
  precoMinHint: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginTop: 4,
    textAlign: 'center',
  },

  dicaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dicaIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.primary + '14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dicaTitle: {
    fontSize: fonts.small,
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    marginBottom: 2,
  },
  dicaText: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    lineHeight: 18,
  },

  closeBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  closeBtnText: {
    color: '#fff',
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    fontSize: fonts.regular,
  },
});
