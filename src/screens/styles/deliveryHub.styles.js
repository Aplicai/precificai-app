/**
 * Sessão 28.29: styles extraídos de DeliveryHubScreen.
 * Original 1402 linhas; 238 eram styles.
 */
import { StyleSheet } from 'react-native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../../utils/theme';

export const deliveryHubStyles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  // Sessão 25: shell centralizado — alinha com Home/Simulador/Financeiro.
  pageShell: {
    flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center',
  },
  content: { padding: spacing.md, paddingBottom: 60 },

  // Page Header
  pageHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  pageHeaderIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  pageHeaderTitle: { fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  pageHeaderSubtitle: { fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },

  // Hero info card (above tabs)
  heroInfoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.primary + '08',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    padding: spacing.md, marginTop: spacing.sm, marginHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  heroInfoText: { flex: 1, fontSize: fonts.small, color: colors.text, fontFamily: fontFamily.regular, lineHeight: 18 },

  // Tabs (underline style)
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    marginTop: spacing.md, marginBottom: spacing.sm,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', flexDirection: 'row', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    justifyContent: 'center',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  tabTextActive: { color: colors.primary },

  // Info card
  infoCard: {
    flexDirection: 'row', gap: 10, alignItems: 'flex-start',
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: colors.primary,
  },
  infoText: { flex: 1, fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 18 },

  // Count — Área 9: 12→13 pra leitura no mobile
  countText: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: spacing.sm },

  // Platform card
  platCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  platHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md,
  },
  // Área 9 — dot um pouco maior (10→14) pra equilibrar com texto, ainda discreto
  platDot: { width: 14, height: 14, borderRadius: 7, marginRight: spacing.sm },
  platName: { flex: 1, fontSize: fonts.body, fontFamily: fontFamily.semiBold, color: colors.text },
  // Área 9 — status 11→12 (fonts.tiny) pra equilibrar peso visual
  platStatus: { fontSize: fonts.tiny, fontFamily: fontFamily.medium },
  platBody: {
    paddingHorizontal: spacing.md, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  platFieldsRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  platField: { flex: 1, minWidth: 120 },
  // Área 9 — labels 11→13 pra leitura confortável no mobile, balanceando o input maior
  platFieldLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: 4 },
  platInput: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    // Área 9 — fontSize fonts.body (15) mantido; iOS Safari zoom é coberto pelo
    // CSS global em mobileWebFixes.js (16px mínimo). Altura 40→44 pra toque maior.
    padding: 10, fontSize: fonts.body, fontFamily: fontFamily.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border, height: 44,
  },
  deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.md, alignSelf: 'flex-start' },
  deleteBtnText: { fontSize: 12, color: colors.error, fontFamily: fontFamily.medium },

  // Add platform
  addPlatCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginTop: spacing.sm,
    borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed',
  },
  addPlatTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  addPlatRow: { flexDirection: 'row', gap: spacing.sm },
  addBtn: {
    width: 40, height: 40, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center',
  },
  suggestRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  suggestChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 4, paddingHorizontal: 10,
    borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
  },
  suggestDot: { width: 8, height: 8, borderRadius: 4 },
  suggestText: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium },

  // Simulator
  simLabel: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.xs },
  chipScroll: { marginBottom: spacing.sm },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: borderRadius.sm, backgroundColor: colors.inputBg,
    borderWidth: 1, borderColor: colors.border,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  chipTextActive: { color: '#fff' },
  chipPrice: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary },
  simBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: 12, marginTop: spacing.md, marginBottom: spacing.md,
  },
  simBtnText: { color: '#fff', fontSize: fonts.body, fontFamily: fontFamily.semiBold },

  // Results
  resultCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  resultTitle: { fontSize: 16, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.md },
  compareRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.md, padding: spacing.md,
    marginBottom: spacing.md,
  },
  compareCol: { flex: 1, alignItems: 'center' },
  compareLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, textAlign: 'center', marginBottom: 4 },
  compareValue: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.text },
  compareSub: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },

  breakdownCard: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
  },
  breakdownTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },
  breakdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  breakdownLabel: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular },
  breakdownValue: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text },

  suggestedCard: {
    borderRadius: borderRadius.md,
    borderWidth: 1, borderColor: colors.border,
    overflow: 'hidden',
    padding: spacing.md,
    marginTop: spacing.md,
  },
  suggestedTitle: { fontSize: 14, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4 },
  suggestedRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border,
  },
  suggestedLabel: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  suggestedSub: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2 },
  suggestedPrice: { fontSize: 20, fontFamily: fontFamily.bold },

  // Overview (Visão Geral)
  overviewCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    marginBottom: spacing.md, overflow: 'hidden',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 1,
  },
  overviewHeader: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  overviewPlatName: { flex: 1, fontSize: 15, fontFamily: fontFamily.bold, color: colors.text },
  overviewPlatTax: { fontSize: 12, fontFamily: fontFamily.medium, color: colors.textSecondary },
  overviewTableHeader: {
    flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.md,
    backgroundColor: colors.inputBg, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  overviewTh: { fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.textSecondary, textTransform: 'uppercase' },
  overviewRow: { flexDirection: 'row', paddingVertical: 8, paddingHorizontal: spacing.md },
  overviewTd: { fontSize: 13, fontFamily: fontFamily.regular, color: colors.text },

  // Sessão 28+ — mobile-web cards (substitui overviewRow apertada em < 1024px)
  overviewCardMobile: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginVertical: spacing.xs,
    borderLeftWidth: 4,
    borderLeftColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    borderRightColor: colors.border,
    borderBottomColor: colors.border,
    minHeight: 44,
  },
  overviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  overviewCardTitle: {
    flex: 1,
    fontSize: 15,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  overviewCardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    minHeight: 24,
  },
  overviewCardLabel: {
    fontSize: 13,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  overviewCardValue: {
    fontSize: 14,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
});

export default deliveryHubStyles;
