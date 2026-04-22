import React, { useRef, useEffect } from 'react';
import { View, TextInput, StyleSheet, TouchableOpacity, Platform, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, borderRadius, fontFamily } from '../utils/theme';

/**
 * SearchBar — caixa de busca padronizada (audit P1-19).
 *
 * Props:
 *  - value, onChangeText, placeholder
 *  - style?: override do container (use para zerar margem em modals/inline)
 *  - autoFocus?: foca ao montar (útil em modais de seleção)
 *  - inset?: 'screen' (default) | 'modal'  — variante visual:
 *      'modal' zera margens horizontais/verticais externas para encaixar
 *      bem dentro de um padding já aplicado pelo modal pai.
 *  - shortcut?: bool (default true para inset 'screen')  — habilita atalho
 *      Cmd+K / Ctrl+K (apenas Web) para focar o input. Mostra hint visual à direita.
 */
export default function SearchBar({
  value,
  onChangeText,
  placeholder = 'Buscar...',
  style,
  autoFocus = false,
  inset = 'screen',
  shortcut,
}) {
  const isModal = inset === 'modal';
  const enableShortcut = shortcut === undefined ? !isModal : shortcut;
  const inputRef = useRef(null);
  const isWeb = Platform.OS === 'web';

  // P3-F: Atalho Cmd+K / Ctrl+K para focar a busca (apenas Web)
  useEffect(() => {
    if (!isWeb || !enableShortcut) return;
    function onKey(e) {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        try { inputRef.current && inputRef.current.focus(); } catch {}
      }
    }
    if (typeof window !== 'undefined' && window.addEventListener) {
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [isWeb, enableShortcut]);

  return (
    <View style={[styles.container, isModal && styles.containerModal, style]}>
      <Feather name="search" size={16} color={colors.disabled} style={styles.icon} />
      <TextInput
        ref={inputRef}
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.disabled}
        autoFocus={autoFocus}
      />
      {value ? (
        <TouchableOpacity onPress={() => onChangeText('')} style={styles.clearBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Feather name="x" size={14} color={colors.textSecondary} />
        </TouchableOpacity>
      ) : isWeb && enableShortcut ? (
        <View style={styles.kbdHint} pointerEvents="none">
          <Text style={styles.kbdHintText}>Ctrl K</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm + 2,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    height: 40,
  },
  containerModal: {
    marginHorizontal: 0,
    marginTop: 0,
    marginBottom: spacing.sm,
  },
  icon: {
    marginRight: spacing.xs + 2,
  },
  input: {
    flex: 1,
    fontSize: fonts.small,
    color: colors.text,
    paddingVertical: 0,
    height: 38,
    outlineStyle: 'none',
  },
  clearBtn: {
    padding: spacing.xs,
  },
  kbdHint: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  kbdHintText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
});
