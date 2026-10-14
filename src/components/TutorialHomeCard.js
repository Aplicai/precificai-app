/**
 * Card do vídeo "Primeiros passos" na Home, para quem ainda não tem produto.
 *
 * Dados de produção (14/10): 11 de 20 contas grátis nunca cadastraram um
 * ingrediente e a mediana até o primeiro produto foi de 11,5 dias. O vídeo
 * leva exatamente do primeiro acesso ao primeiro produto, então ele aparece
 * onde a pessoa trava. Some sozinho quando o primeiro produto existe (quem
 * chama decide) e pelo ✕, que fica lembrado.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { abrirTutorial } from '../utils/tutorialBus';
import { TUTORIAL_DURACAO } from '../config/tutorial';

const PREF_FECHADO = 'tutorial01_home_card_fechado';

export default function TutorialHomeCard() {
  const [fechado, setFechado] = useState(null); // null = lendo preferência

  useEffect(() => {
    let vivo = true;
    AsyncStorage.getItem(PREF_FECHADO)
      .then((v) => { if (vivo) setFechado(v === 'true'); })
      .catch(() => { if (vivo) setFechado(false); });
    return () => { vivo = false; };
  }, []);

  if (fechado !== false) return null;

  const fechar = () => {
    setFechado(true);
    AsyncStorage.setItem(PREF_FECHADO, 'true').catch(() => {});
  };

  return (
    <View style={styles.card}>
      <TouchableOpacity
        style={styles.body}
        onPress={() => abrirTutorial('abertura')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Assistir o vídeo de primeiros passos"
      >
        <View style={styles.play}>
          <Feather name="play" size={22} color="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Precifique seu primeiro produto em {TUTORIAL_DURACAO}</Text>
          <Text style={styles.desc}>
            Assista o passo a passo: contas do mês, primeiro ingrediente e o produto com o preço sugerido.
          </Text>
          <Text style={styles.cta}>Assistir agora</Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={fechar}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityRole="button"
        accessibilityLabel="Fechar aviso do vídeo"
        style={styles.close}
      >
        <Feather name="x" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary + '0D',
    borderWidth: 1,
    borderColor: colors.primary + '33',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  play: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text, marginBottom: 2 },
  desc: { fontSize: fonts.small, color: colors.textSecondary, lineHeight: 18 },
  cta: { fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primary, marginTop: 6 },
  close: { padding: 4, marginLeft: spacing.sm },
});
