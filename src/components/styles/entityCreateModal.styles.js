/**
 * Sessão 28.29: styles extraídos de EntityCreateModal.
 * Original 1933 linhas; 611 eram styles. Reduz noise no componente.
 */
import { StyleSheet, Platform } from 'react-native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../../utils/theme';

export const entityCreateModalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    // Sessão 28.51 — zIndex defensivo pra garantir empilhamento correto no web.
    ...Platform.select({ web: { zIndex: 1000 }, default: {} }),
  },
  overlayMobile: {
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  content: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(0,0,0,0.18)' },
      default: { elevation: 12 },
    }),
  },
  contentDesktop: {
    width: '92%',
    maxWidth: 920,
    maxHeight: '88%',
    borderRadius: borderRadius.lg,
  },
  contentMobile: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  subtitleHeader: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },

  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bodyTwoCol: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  colLeft: { flex: 1, minWidth: 0 },
  colRight: { flex: 1, minWidth: 0 },

  fieldLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: spacing.xs,
  },

  // Categoria selector
  catSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  catSelectText: {
    fontSize: fonts.regular,
    color: colors.text,
    fontFamily: fontFamily.regular,
  },

  // Como você vende
  vendaChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  vendaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  vendaChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  vendaChipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  vendaChipTextActive: { color: '#fff' },

  // Unidade preparo
  unidadeChipsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  unidadeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  unidadeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unidadeChipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  unidadeChipTextActive: { color: '#fff' },

  // Resumo
  resumo: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  resumoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  resumoTitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    textTransform: 'uppercase',
  },
  resumoGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resumoCell: { flex: 1 },
  resumoLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  resumoValue: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  resumoBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  resumoBreakdownItem: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  resumoBreakdownSep: {
    fontSize: 10,
    color: colors.textSecondary + '60',
  },
  resumoComparacao: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    marginTop: 6,
  },

  // Análise composição do preço
  analiseBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  analiseTitulo: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  analiseLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  analiseLinhaTotal: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  analiseLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  analiseLabelTotal: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  analiseValor: {
    fontSize: fonts.tiny,
    color: colors.text,
    fontFamily: fontFamily.semiBold,
  },
  analisePerc: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  analiseHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  analiseHintText: {
    flex: 1,
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
  },

  subtitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  itensHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  itensHint: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },

  // Item já adicionado
  itemRow: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: 6,
  },
  itemRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  itemTipoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemTipoBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  itemNome: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.text,
  },
  itemDeleteBtn: { padding: 4 },
  itemEditBtn: { padding: 4, marginRight: 2 },
  itemRowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperInput: {
    minWidth: 44,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    height: 28,
  },
  // Sessão 28.9 — Badge da unidade, separada do stepper para legibilidade
  unidadeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.primary + '12',
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unidadeBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  itemCustoTotal: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
  },

  // Picker
  tipoFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginBottom: 6,
  },
  tipoFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 30,
  },
  tipoFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tipoFilterChipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  tipoFilterChipTextActive: { color: '#fff' },

  catBlock: { marginTop: spacing.sm },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.background,
    gap: 6,
    minHeight: 36,
  },
  catHeaderLabel: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  catHeaderCount: {
    minWidth: 22, height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  catHeaderCountText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
  },

  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    minHeight: 40,
  },
  addItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addItemBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  addItemName: {
    flex: 1,
    fontSize: fonts.small,
    color: colors.text,
    fontFamily: fontFamily.medium,
  },
  addItemCusto: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
  },
  addItemPlusBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyResults: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
    fontStyle: 'italic',
  },

  // Footer
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    fontSize: fonts.tiny,
    color: '#991b1b',
    fontFamily: fontFamily.medium,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnSecondaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: '#fff',
  },

  // Categoria modal
  catModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catModalContent: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(0,0,0,0.18)' },
      default: { elevation: 12 },
    }),
  },
  catModalTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  catRowActive: {
    backgroundColor: colors.primary + '15',
  },
  catRowText: {
    fontSize: fonts.regular,
    color: colors.text,
    fontFamily: fontFamily.medium,
  },
  catNovaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    borderStyle: 'dashed',
  },
  catNovaBtnText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  catNovaInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: fonts.regular,
    color: colors.text,
  },
});

export default entityCreateModalStyles;
