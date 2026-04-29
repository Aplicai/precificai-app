import React from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * ItemPreviewModal — modal compacto de "espiada" (preview) de UM item.
 *
 * Mostrado a partir do BulkActionBar quando o usuário selecionou exatamente 1
 * item e quer ver os principais campos sem precisar abrir o formulário inteiro.
 *
 * Props:
 *  - visible: boolean
 *  - title: string                    — nome principal do item
 *  - subtitle?: string                — categoria, marca, etc.
 *  - icon?: Feather name (default 'eye')
 *  - iconColor?: string
 *  - fields: Array<{ label: string, value: string|number, accent?: boolean }>
 *  - meta?: string                    — texto auxiliar abaixo do subtítulo (ex.: "Editado há 3 dias")
 *  - favorito?: 0|1                   — se definido, renderiza botão de estrela no header
 *  - onToggleFavorite?: () => void    — chamado quando o usuário tap na estrela (P3-H)
 *  - onEdit?: () => void              — abre formulário completo (CTA primária)
 *  - onClose: () => void
 */
export default function ItemPreviewModal({
  visible,
  title,
  subtitle,
  icon = 'eye',
  iconColor = colors.primary,
  fields = [],
  meta,
  favorito,
  onToggleFavorite,
  onEdit,
  onClose,
  // Sessão 28.9 — APP-05: ações secundárias (ex: "Mudar categoria") aparecem
  // como linha de chips clicáveis acima dos botões Fechar/Editar.
  extraActions,
}) {
  const isFav = favorito === 1 || favorito === true;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          {/* Header */}
          <View style={styles.header}>
            <View style={[styles.iconCircle, { backgroundColor: iconColor + '18' }]}>
              <Feather name={icon} size={18} color={iconColor} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={2}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
              {meta ? <Text style={styles.meta} numberOfLines={1}>{meta}</Text> : null}
            </View>
            {onToggleFavorite ? (
              <TouchableOpacity
                onPress={onToggleFavorite}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={{ marginRight: 4 }}
                accessibilityLabel={isFav ? 'Desfavoritar' : 'Favoritar'}
              >
                <Feather
                  name="star"
                  size={20}
                  color={isFav ? (colors.yellow || '#FFC83A') : colors.disabled}
                  style={isFav ? { textShadowColor: 'rgba(0,0,0,0.15)', textShadowRadius: 1 } : null}
                />
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Fields */}
          <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingVertical: spacing.xs }}>
            {fields.map((f, idx) => (
              <View key={idx} style={[styles.field, idx < fields.length - 1 && styles.fieldBorder]}>
                <Text style={styles.fieldLabel}>{f.label}</Text>
                <Text style={[styles.fieldValue, f.accent && { color: iconColor, fontFamily: fontFamily.bold }]} numberOfLines={2}>
                  {f.value === null || f.value === undefined || f.value === '' ? '—' : String(f.value)}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Sessão 28.9 — Ações extras (ex: Mudar categoria) */}
          {extraActions && extraActions.length > 0 && (
            <View style={styles.extraActions}>
              {extraActions.map((act, idx) => (
                <TouchableOpacity
                  key={idx}
                  style={styles.extraActionChip}
                  onPress={() => act.onPress && act.onPress()}
                  accessibilityRole="button"
                  accessibilityLabel={act.label}
                >
                  {act.icon && <Feather name={act.icon} size={13} color={colors.primary} />}
                  <Text style={styles.extraActionChipText}>{act.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
              <Text style={styles.btnSecondaryText}>Fechar</Text>
            </TouchableOpacity>
            {onEdit ? (
              <TouchableOpacity style={[styles.btnPrimary, { backgroundColor: iconColor }]} onPress={onEdit}>
                <Feather name="edit-2" size={14} color="#fff" style={{ marginRight: 6 }} />
                <Text style={styles.btnPrimaryText}>Editar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 6,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  iconCircle: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    color: colors.text,
  },
  subtitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    marginTop: 2,
  },
  meta: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.disabled,
    marginTop: 2,
    fontStyle: 'italic',
  },
  field: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.sm,
  },
  fieldBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  fieldLabel: {
    fontSize: fonts.small,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    flex: 1,
  },
  fieldValue: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    textAlign: 'right',
    maxWidth: '60%',
  },
  // Sessão 28.9 — APP-05: ações secundárias (chips entre fields e botões)
  extraActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  extraActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '08',
  },
  extraActionChipText: {
    fontSize: fonts.tiny,
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  btnSecondary: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  btnSecondaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  btnPrimary: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPrimaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.bold,
    color: '#fff',
  },
});
