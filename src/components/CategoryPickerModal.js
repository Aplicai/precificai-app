import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * CategoryPickerModal — modal de seleção de categoria (P2-B bulk move).
 *
 * Props:
 *  - visible: boolean
 *  - title?: string — título do modal (default: "Mover para...")
 *  - subtitle?: string — subtítulo opcional (ex.: "5 itens selecionados")
 *  - categorias: [{ id, nome }] — lista de categorias
 *  - onSelect: (catId | null) => void — callback ao escolher (null = "Sem categoria")
 *  - onCancel: () => void
 *  - allowNone?: boolean — exibe opção "Sem categoria" (default: true)
 */
export default function CategoryPickerModal({
  visible,
  title = 'Mover para...',
  subtitle,
  categorias = [],
  onSelect,
  onCancel,
  allowNone = true,
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.content} onPress={() => {}}>
          <View style={styles.header}>
            <Feather name="folder" size={18} color={colors.primary} />
            <Text style={styles.title}>{title}</Text>
          </View>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: spacing.sm }}>
            {allowNone && (
              <TouchableOpacity style={styles.option} onPress={() => onSelect(null)}>
                <Feather name="inbox" size={16} color={colors.textSecondary} />
                <Text style={styles.optionText}>Sem categoria</Text>
              </TouchableOpacity>
            )}
            {categorias.map((c) => (
              <TouchableOpacity key={String(c.id)} style={styles.option} onPress={() => onSelect(c.id)}>
                <Feather name={c.icone || 'tag'} size={16} color={colors.primary} />
                <Text style={styles.optionText}>{c.nome}</Text>
              </TouchableOpacity>
            ))}
            {categorias.length === 0 && !allowNone && (
              <Text style={styles.empty}>Nenhuma categoria cadastrada.</Text>
            )}
          </ScrollView>

          <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.md,
  },
  content: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 420, maxHeight: '80%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginBottom: spacing.xs,
  },
  title: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm,
  },
  list: {
    maxHeight: 360, marginTop: spacing.xs,
  },
  option: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.sm,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  optionText: {
    fontSize: fonts.regular, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text, flex: 1,
  },
  empty: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, textAlign: 'center', padding: spacing.md,
  },
  cancelBtn: {
    marginTop: spacing.sm, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  cancelText: {
    color: colors.textSecondary, fontFamily: fontFamily.semiBold,
    fontWeight: '600', fontSize: fonts.regular,
  },
});
