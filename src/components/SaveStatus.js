import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily } from '../utils/theme';

/**
 * SaveStatus — indicador reutilizável de auto-save (audit P1-17).
 *
 * Mostra três estados visuais no canto do formulário/modal:
 *  - 'saving'  → ⟳ "Salvando..."
 *  - 'saved'   → ✓ "Salvo"  (com fade-out automático após 2s)
 *  - 'error'   → ✕ "Erro ao salvar"
 *
 * Use sempre que houver auto-save num formulário para dar feedback contínuo
 * ao usuário (ex: edição de combo, ficha técnica, configuração).
 *
 * Variantes:
 *  - inline (default): pequeno, para usar ao lado de um título de modal
 *  - badge: pílula com fundo, para usar em headers de tela
 *
 * Exemplo:
 *   const [status, setStatus] = useState(null);
 *   ...
 *   <SaveStatus status={status} />
 */
export default function SaveStatus({ status, variant = 'inline' }) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!status) {
      opacity.setValue(0);
      return undefined;
    }
    Animated.timing(opacity, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();
    // 'saved' e 'error' fazem fade-out depois de 2s — o caller decide quando
    // limpar o estado, mas a opacidade já some para reduzir ruído visual.
    if (status === 'saved' || status === 'error') {
      const t = setTimeout(() => {
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 400,
          useNativeDriver: true,
        }).start();
      }, 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, opacity]);

  if (!status) return null;

  const config = {
    saving: { icon: 'loader', label: 'Salvando...', color: colors.textSecondary },
    saved: { icon: 'check-circle', label: 'Salvo', color: colors.success },
    error: { icon: 'x-circle', label: 'Erro ao salvar', color: colors.error },
  }[status];

  if (!config) return null;

  const isBadge = variant === 'badge';
  const containerStyle = isBadge ? styles.badge : styles.inline;
  const textStyle = isBadge ? styles.badgeText : styles.inlineText;
  const iconSize = isBadge ? 13 : 11;

  return (
    <Animated.View
      style={[
        containerStyle,
        isBadge && { backgroundColor: config.color + '15' },
        { opacity },
      ]}
    >
      <Feather name={config.icon} size={iconSize} color={config.color} />
      <Text style={[textStyle, { color: config.color }]}>{config.label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  inline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  inlineText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
});
