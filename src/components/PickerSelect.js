import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, FlatList, StyleSheet, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';

export default function PickerSelect({ label, value, options, onValueChange, placeholder, style, displayValue, onCreateNew, createLabel }) {
  const [visible, setVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  // Bug fix (P0-04): Antes, quando `value` estava setado mas as `options` ainda não
  // tinham carregado (timing/async) ou quando havia mismatch de tipo (string vs number),
  // o componente caía no fallback "Selecione..." mesmo com valor preenchido — o que
  // confundia o usuário em telas como Editar Preparo (campo unidade_medida).
  // Agora, se houver valor mas nenhuma option correspondente, renderizamos o próprio
  // valor como label provisório em vez do placeholder.
  const matchedOption = options?.find(o => o.value === value);
  const hasValue = value !== null && value !== undefined && value !== '';
  const selectedLabel =
    displayValue
    || matchedOption?.label
    || (hasValue ? String(value) : null)
    || placeholder
    || 'Selecione...';
  // Considera "preenchido" qualquer caso em que o usuário tenha escolhido algo —
  // mesmo que a label ainda não tenha sido resolvida pelas options.
  const isFilled = hasValue || !!displayValue;

  const filteredOptions = searchText.trim()
    ? options.filter(o => o.label.toLowerCase().includes(searchText.trim().toLowerCase()))
    : options;

  const closeModal = () => { setVisible(false); setSearchText(''); };

  return (
    <View style={[styles.container, style]}>
      {label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.selector} onPress={() => setVisible(true)}>
        <Text style={[styles.selectorText, !isFilled && styles.placeholder]}>{selectedLabel}</Text>
        <Text style={styles.arrow}>▼</Text>
      </TouchableOpacity>
      <Modal visible={visible} transparent animationType="fade">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
        <TouchableOpacity style={styles.overlay} onPress={closeModal} activeOpacity={1}>
          <TouchableOpacity activeOpacity={1} style={styles.modal} onPress={() => {}}>
            <Text style={styles.modalTitle}>{label || 'Selecione'}</Text>
            {options.length > 6 && (
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar..."
                value={searchText}
                onChangeText={setSearchText}
                autoCorrect={false}
              />
            )}
            <FlatList
              data={filteredOptions}
              keyExtractor={(item) => String(item.value)}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.option, item.value === value && styles.optionSelected]}
                  onPress={() => { onValueChange(item.value); closeModal(); }}
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
                onPress={() => { closeModal(); onCreateNew(); }}
                activeOpacity={0.7}
              >
                <Feather name="plus-circle" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.createNewText}>{createLabel || 'Criar novo'}</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
        </KeyboardAvoidingView>
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
    minHeight: 44, // Sessão 28 — WCAG touch target
  },
  selectorText: { fontSize: fonts.regular, color: colors.text },
  placeholder: { color: colors.disabled },
  arrow: { fontSize: 12, color: colors.textSecondary },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.xl },
  modal: { backgroundColor: colors.surface, borderRadius: borderRadius.md, maxHeight: '60%', padding: spacing.md, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: fonts.large, fontWeight: '700', color: colors.primary, marginBottom: spacing.md, textAlign: 'center' },
  searchInput: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm, fontSize: fonts.regular,
    marginBottom: spacing.sm, color: colors.text,
  },
  option: { padding: spacing.md, minHeight: 44, justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: colors.border },
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
