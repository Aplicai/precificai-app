/**
 * Sessão 28.29: styles extraídos de MateriaPrimaFormScreen.
 *
 * Original era 1539 linhas (366 só de styles). Splitar em arquivo dedicado
 * reduz noise no código de UI/lógica e permite navegação mais rápida.
 *
 * Sem mudança de comportamento — apenas reorganização.
 */
import { StyleSheet } from 'react-native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../../utils/theme';

export const materiaPrimaFormStyles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: 20 },
  row: { flexDirection: 'row', gap: spacing.sm },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  fieldCompact: { marginBottom: spacing.sm },
  // Sessão 28.8 — banner de sugestão do dicionário (zero IA)
  sugestaoBanner: {
    backgroundColor: colors.primary + '0D',
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginBottom: spacing.sm,
    marginTop: -spacing.xs,
  },
  sugestaoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sugestaoTitulo: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  sugestaoTexto: {
    fontSize: 12,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    lineHeight: 16,
    marginBottom: spacing.sm,
  },
  sugestaoBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  sugestaoBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: borderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    minHeight: 32,
  },
  sugestaoBtnPrimario: {
    backgroundColor: colors.primary,
  },
  sugestaoBtnPrimarioText: {
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: '#fff',
  },
  sugestaoBtnText: {
    fontSize: 12,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },

  // Resultado calculado (compacto)
  resultBar: {
    flexDirection: 'row', gap: spacing.xs + 2,
    marginTop: spacing.sm, paddingHorizontal: 2,
  },
  resultChip: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
  },
  resultChipHighlight: {
    backgroundColor: colors.primary + '10',
  },
  resultChipLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2,
  },
  resultChipLabel: {
    fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  resultChipValue: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },

  perdaHint: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium, fontWeight: '500',
    color: colors.warning, textAlign: 'center',
    marginTop: spacing.xs + 2, paddingHorizontal: spacing.sm,
  },
  // APP-17: nota informativa sobre fatores de perda padrão do setor
  fatorNote: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginTop: spacing.xs + 2, paddingHorizontal: spacing.sm,
    gap: 4,
  },
  fatorNoteText: {
    flex: 1, fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, lineHeight: 14,
  },
  // APP-14: badge "valor estimado" quando o preço veio pré-preenchido pelo Kit
  estimadoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warning + '15',
    borderLeftWidth: 3,
    borderLeftColor: colors.warning,
    borderRadius: borderRadius.sm,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: spacing.xs,
    marginBottom: spacing.xs,
  },
  estimadoBadgeText: {
    flex: 1,
    fontSize: fonts.tiny,
    color: colors.text,
    fontFamily: fontFamily.medium,
    lineHeight: 16,
  },

  // Histórico de preços
  historicoSection: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historicoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  historicoTitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  historicoChart: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
  },
  historicoBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    minHeight: 100,
    paddingBottom: 4,
  },
  historicoBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    maxWidth: 64,
  },
  historicoBar: {
    width: '70%',
    maxWidth: 28,
    borderRadius: 4,
    minHeight: 8,
  },
  historicoDeleteBtn: {
    width: 16, height: 16, borderRadius: 8,
    backgroundColor: colors.error + '12',
    alignItems: 'center', justifyContent: 'center',
    marginTop: 4,
  },
  historicoBarPrice: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  historicoBarDate: {
    fontSize: 9,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 3,
    textAlign: 'center',
  },
  historicoInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  historicoInfoText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },

  // Resultado vazio
  resultEmpty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginTop: spacing.sm,
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  resultEmptyText: {
    fontSize: fonts.tiny, color: colors.disabled, flex: 1,
  },

  // Auto-save status bar
  autoSaveBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  autoSaveText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium, fontWeight: '500',
    color: colors.textSecondary,
  },

  // Botão salvar fixo (só para novo)
  stickyFooter: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    paddingBottom: spacing.md,
  },
  btnSave: {
    backgroundColor: colors.primary, padding: spacing.md,
    borderRadius: borderRadius.sm, alignItems: 'center',
  },
  btnSaveText: { color: colors.textLight, fontWeight: '700', fontSize: fonts.regular },

  // Salvar e voltar (edição - sutil)
  btnSaveEdit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    alignSelf: 'center',
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.primary + '30',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.lg, marginTop: spacing.sm,
  },
  btnSaveEditText: { color: colors.primary, fontWeight: '600', fontSize: fonts.small },
  autoSaveInline: {
    alignItems: 'center', marginTop: spacing.xs,
  },
  autoSaveInlineText: { fontSize: fonts.tiny, color: colors.textSecondary },

  // Excluir
  btnDelete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.error + '40',
    padding: spacing.xs + 4, borderRadius: borderRadius.sm, marginTop: spacing.sm,
  },
  btnDeleteText: { color: colors.error, fontWeight: '600', fontSize: fonts.small },

  // Picker customizado
  pickerContainer: { marginBottom: spacing.sm },
  pickerLabel: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: '600' },
  pickerSelector: {
    // Sessão 28.9 — APP-05: aumenta visibilidade do picker (era difícil
    // perceber que era clicável). Touch target 48pt + chevron mais forte.
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2,
    minHeight: 48,
  },
  pickerText: { fontSize: fonts.regular, color: colors.text },
  pickerPlaceholder: { color: colors.disabled },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.sm,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 600, maxHeight: '90%',
  },
  modalTitle: { fontSize: fonts.large, fontWeight: '700', color: colors.text, marginBottom: spacing.md, textAlign: 'center' },
  modalLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2, fontSize: fonts.regular, color: colors.text,
  },

  // Opções de categoria
  catOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: borderRadius.sm,
  },
  catOptionAtivo: { backgroundColor: colors.primary + '15' },
  catOptionText: { fontSize: fonts.regular, color: colors.text, flex: 1 },
  catOptionTextAtivo: { color: colors.primary, fontWeight: '700' },

  // Botão nova categoria
  novaCatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 4, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: borderRadius.sm, backgroundColor: colors.primary + '08',
  },
  novaCatBtnText: { fontSize: fonts.regular, fontWeight: '600', color: colors.primary },

  // Limpar seleção
  limparBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  limparBtnText: { fontSize: fonts.small, color: colors.error, fontWeight: '600' },

  // Ações do modal
  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.sm },
  modalCancelBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: fonts.regular },
  modalSaveBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  modalSaveText: { color: colors.textLight, fontWeight: '700', fontSize: fonts.regular },

  // Modal campos incompletos
  incompleteModal: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 340,
    alignItems: 'center',
  },
  incompleteIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.error + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  incompleteTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.xs, textAlign: 'center',
  },
  incompleteDesc: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: spacing.lg,
  },
  incompleteBtnEdit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, width: '100%', marginBottom: spacing.sm,
  },
  incompleteBtnEditText: {
    color: '#fff', fontFamily: fontFamily.bold, fontWeight: '700',
    fontSize: fonts.regular,
  },
  incompleteBtnDelete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.error + '40',
    borderRadius: borderRadius.sm, paddingVertical: spacing.sm + 2, width: '100%',
  },
  incompleteBtnDeleteText: {
    color: colors.error, fontFamily: fontFamily.semiBold, fontWeight: '600',
    fontSize: fonts.regular,
  },
});

export default materiaPrimaFormStyles;
