/**
 * BackToSettings — APP-12
 *
 * Botão "Voltar para Configurações" sempre visível no topo das subseções
 * de Configurações (Perfil, Conta/Segurança, Suporte, Sobre, Termos,
 * Privacidade, Kit Início, Notificações).
 *
 * Motivo: testadora reportou que após entrar numa subseção precisava
 * clicar várias vezes em "Configurações" pra voltar. O header nativo do
 * stack mostra um chevron pequeno; este componente adiciona um link
 * textual claro no corpo da tela.
 *
 * Uso:
 *   import BackToSettings from '../components/BackToSettings';
 *   ...
 *   <ScrollView>
 *     <BackToSettings navigation={navigation} />
 *     {restante do conteúdo...}
 *   </ScrollView>
 */
import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily } from '../utils/theme';

export default function BackToSettings({ navigation, label = 'Voltar para Configurações' }) {
  if (!navigation) return null;

  function onPress() {
    try {
      if (navigation.canGoBack && navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Configuracoes');
      }
    } catch (_) {
      try { navigation.navigate('Configuracoes'); } catch (__) {}
    }
  }

  return (
    <TouchableOpacity
      style={styles.btn}
      activeOpacity={0.7}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Feather name="chevron-left" size={18} color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, paddingHorizontal: 4,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  text: {
    fontSize: fonts.small,
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    marginLeft: 4,
  },
});
