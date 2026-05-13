/**
 * MobileDesktopHint — banner discreto sugerindo o uso no computador.
 *
 * Área 9 — aparece esporadicamente (a cada 5 sessões) no topo de telas-chave
 * (Início) para usuários no mobile. Texto convidativo (não passivo-agressivo):
 * "Para uma experiência mais completa, use o Precificaí no computador."
 *
 * Comportamento:
 *  - Só renderiza em `isMobile`.
 *  - Conta sessões no AsyncStorage (`mobile_desktop_hint_counter`). A cada 5
 *    sessões, mostra o banner UMA vez naquela sessão.
 *  - Dismissível com X — fica oculto no resto da sessão.
 *  - SSR-safe: não toca AsyncStorage durante render.
 *
 * NÃO depende do HomeScreen — pode ser importado em qualquer tela. O
 * agente integrador deve adicionar `<MobileDesktopHint />` logo abaixo de
 * `<MobileOnboardingOverlay />` no HomeScreen quando for fazer cleanup.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const STORAGE_KEY = 'mobile_desktop_hint_counter';
const SHOW_EVERY = 5; // 1 a cada 5 sessões

export default function MobileDesktopHint() {
  const { isMobile } = useResponsiveLayout();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!isMobile) return;
    let mounted = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const prev = parseInt(raw || '0', 10) || 0;
        const next = prev + 1;
        await AsyncStorage.setItem(STORAGE_KEY, String(next));
        // Mostra na 1ª, 6ª, 11ª... sessão. Garante exibição também no primeiro
        // uso (next === 1) pra usuário descobrir a opção desktop.
        if (mounted && (next === 1 || next % SHOW_EVERY === 1)) {
          setVisible(true);
        }
      } catch (e) {
        if (typeof console !== 'undefined') {
          console.warn('[MobileDesktopHint]', e?.message || e);
        }
      }
    })();
    return () => { mounted = false; };
  }, [isMobile]);

  if (!isMobile || !visible || dismissed) return null;

  return (
    <View style={styles.container} accessibilityRole="alert">
      <View style={styles.iconBox}>
        <Feather name="monitor" size={16} color={colors.primary} />
      </View>
      <Text style={styles.text}>
        Para uma experiência mais completa, use o Precificaí no computador.
      </Text>
      <TouchableOpacity
        onPress={() => setDismissed(true)}
        accessibilityRole="button"
        accessibilityLabel="Dispensar aviso"
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.closeBtn}
      >
        <Feather name="x" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '25',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  iconBox: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary + '18',
    alignItems: 'center', justifyContent: 'center',
  },
  text: {
    flex: 1,
    fontSize: fonts.tiny,
    color: colors.text,
    fontFamily: fontFamily.regular,
    lineHeight: 16,
  },
  closeBtn: {
    padding: 4,
  },
});
