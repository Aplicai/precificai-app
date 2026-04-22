import React, { useState, useMemo } from 'react';
import {
  View, Text, Modal, TouchableOpacity, TextInput, StyleSheet, ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

/**
 * BulkPriceAdjustModal — modal de reajuste de preço em massa.
 *
 * Permite aplicar um delta percentual (+/-) ou valor fixo (R$) sobre
 * o campo de preço dos itens selecionados.
 *
 * Props:
 *  - visible: boolean
 *  - title?: string  (default 'Reajustar preços')
 *  - subtitle?: string  ("3 itens selecionados")
 *  - currentLabel?: string  (descrição do campo, ex: "preço de venda")
 *  - onConfirm: ({ mode: 'percent'|'fixed', value: number, sign: 1|-1 }) => void
 *  - onCancel: () => void
 */
export default function BulkPriceAdjustModal({
  visible,
  title = 'Reajustar preços',
  subtitle = '',
  currentLabel = 'valores',
  onConfirm,
  onCancel,
}) {
  const [mode, setMode] = useState('percent'); // 'percent' | 'fixed'
  const [sign, setSign] = useState(1); // +1 ou -1
  const [valueStr, setValueStr] = useState('');

  const numeric = useMemo(() => {
    const cleaned = (valueStr || '').replace(',', '.').replace(/[^\d.]/g, '');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  }, [valueStr]);

  const canConfirm = numeric > 0;

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm?.({ mode, value: numeric, sign });
    setValueStr('');
  }

  function handleCancel() {
    setValueStr('');
    onCancel?.();
  }

  return (
    <Modal visible={visible} transparent animationType="fade">
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={handleCancel}>
        <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Feather name="trending-up" size={18} color={colors.primary} />
            <Text style={styles.title}>{title}</Text>
          </View>

          {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}

          {/* Mode toggle */}
          <Text style={styles.label}>Tipo de reajuste</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'percent' && styles.toggleBtnActive]}
              onPress={() => setMode('percent')}
            >
              <Feather name="percent" size={14} color={mode === 'percent' ? '#fff' : colors.text} />
              <Text style={[styles.toggleTxt, mode === 'percent' && styles.toggleTxtActive]}>Percentual</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, mode === 'fixed' && styles.toggleBtnActive]}
              onPress={() => setMode('fixed')}
            >
              <Feather name="dollar-sign" size={14} color={mode === 'fixed' ? '#fff' : colors.text} />
              <Text style={[styles.toggleTxt, mode === 'fixed' && styles.toggleTxtActive]}>Valor fixo</Text>
            </TouchableOpacity>
          </View>

          {/* Sign toggle */}
          <Text style={styles.label}>Direção</Text>
          <View style={styles.toggleRow}>
            <TouchableOpacity
              style={[styles.toggleBtn, sign === 1 && styles.toggleBtnActive]}
              onPress={() => setSign(1)}
            >
              <Feather name="plus" size={14} color={sign === 1 ? '#fff' : colors.success || '#1a8a4f'} />
              <Text style={[styles.toggleTxt, sign === 1 && styles.toggleTxtActive]}>Aumentar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, sign === -1 && styles.toggleBtnActive]}
              onPress={() => setSign(-1)}
            >
              <Feather name="minus" size={14} color={sign === -1 ? '#fff' : colors.error || '#c53030'} />
              <Text style={[styles.toggleTxt, sign === -1 && styles.toggleTxtActive]}>Reduzir</Text>
            </TouchableOpacity>
          </View>

          {/* Input */}
          <Text style={styles.label}>
            {mode === 'percent' ? 'Percentual (%)' : 'Valor (R$)'}
          </Text>
          <View style={styles.inputWrap}>
            <Text style={styles.prefix}>{mode === 'percent' ? '%' : 'R$'}</Text>
            <TextInput
              style={styles.input}
              value={valueStr}
              onChangeText={setValueStr}
              keyboardType="decimal-pad"
              placeholder={mode === 'percent' ? 'ex: 10' : 'ex: 2,50'}
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <Text style={styles.hint}>
            Será aplicado em todos os {currentLabel} selecionados.
          </Text>

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.btnGhost} onPress={handleCancel}>
              <Text style={styles.btnGhostTxt}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnPrimary, !canConfirm && { opacity: 0.5 }]}
              onPress={handleConfirm}
              disabled={!canConfirm}
            >
              <Feather name="check" size={14} color="#fff" />
              <Text style={styles.btnPrimaryTxt}>Aplicar</Text>
            </TouchableOpacity>
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
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.surface || '#fff',
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  title: {
    fontSize: fonts.large,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  subtitle: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  label: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: 6,
  },
  toggleRow: {
    flexDirection: 'row',
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border || '#E5E7EB',
  },
  toggleBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  toggleTxt: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  toggleTxtActive: { color: '#fff' },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border || '#E5E7EB',
    paddingHorizontal: spacing.md,
  },
  prefix: {
    fontSize: fonts.medium,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: fonts.medium,
    color: colors.text,
    fontFamily: fontFamily.regular,
  },
  hint: {
    fontSize: fonts.xsmall || 11,
    color: colors.textSecondary,
    marginTop: 8,
    fontStyle: 'italic',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: spacing.lg,
  },
  btnGhost: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
  },
  btnGhostTxt: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  btnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  btnPrimaryTxt: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: '#fff',
  },
});
