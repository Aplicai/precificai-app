import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';

export default function PickerSelect({ label, value, options, onValueChange, placeholder, style, displayValue, onCreateNew, createLabel }) {
  const [visible, setVisible] = useState(false);
  const selectedLabel = displayValue || options.find(o => o.value === value)?.label || placeholder || 'Selecione...';

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.selector} onPress={() => setVisible(true)}>
        <Text style={[styles.selectorText, !value && styles.placeholder]}>{selectedLabel}</Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade">
        <TouchableOpacity style={styles.overlay} onPress={() => setVisible(false)} activeOpacity={1}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{label || 'Selecione'}</Text>
            <FlatList
              data={options}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => { onValueChange(item.value); setVisible(false); }}
                >
                  <Text style={[styles.optionText, item.value === value && styles.optionTextSelected]}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              )}
            />
            {onCreateNew && (
              <TouchableOpacity
                style={styles.createNewBtn}
                onPress={() => { setVisible(false); onCreateNew(); }}
                activeOpacity={0.7}
              >
                <Feather name="plus-circle" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.createNewText}>{createLabel || 'Criar novo'}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  label: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: '600' },
  selector: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2,
  },
  selectorText: { fontSize: fonts.regular, color: colors.text },
  placeholder: { color: colors.disabled },
  arrow: { fontSize: 12, color: colors.textSecondary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.xl },
  modal: { backgroundColor: colors.surface, borderRadius: borderRadius.md, maxHeight: '60%', padding: spacing.md },
  modalTitle: { fontSize: fonts.large, fontWeight: '700', color: colors.primary, marginBottom: spacing.md, textAlign: 'center' },
  option: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border },
  optionSelected: { backgroundColor: colors.primaryLight + '20' },
  optionText: { fontSize: fonts.regular, color: colors.text },
  optionTextSelected: { color: colors.primary, fontWeight: '600' },
  createNewBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 4, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  createNewText: { fontSize: fonts.regular, fontWeight: '600', color: colors.primary },
});
