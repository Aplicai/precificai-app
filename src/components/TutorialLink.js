/**
 * Link discreto "Ver como faz" que abre o vídeo tutorial já no capítulo da tela.
 * Ex.: <TutorialLink capitulo="ingrediente" /> no formulário de ingrediente.
 */
import React from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, fonts, fontFamily } from '../utils/theme';
import { abrirTutorial } from '../utils/tutorialBus';

export default function TutorialLink({ capitulo, label = 'Ver como faz (1 min)', style }) {
  return (
    <TouchableOpacity
      onPress={() => abrirTutorial(capitulo)}
      style={[styles.link, style]}
      hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
      accessibilityRole="button"
      accessibilityLabel={`${label}: vídeo tutorial`}
    >
      <Feather name="play-circle" size={14} color={colors.primary} />
      <Text style={styles.text}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  link: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', paddingVertical: 4 },
  text: { fontSize: fonts.small, color: colors.primary, fontFamily: fontFamily.semiBold, fontWeight: '600' },
});
