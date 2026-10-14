/**
 * Player do vídeo tutorial, montado UMA vez na raiz do app.
 *
 * Qualquer tela chama `abrirTutorial('ingrediente')` (utils/tutorialBus) e o
 * vídeo abre já no capítulo certo, por cima do app. No web toca embutido
 * (youtube-nocookie) pra pessoa não sair pro YouTube e se perder; no app
 * nativo abre o YouTube.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, Modal, Pressable, ScrollView, StyleSheet, Platform, Linking } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { subscribeTutorial } from '../utils/tutorialBus';
import { CAPITULOS, ORDEM_CAPITULOS, TUTORIAL_TITULO, urlEmbed, urlYoutube, formatarTempo } from '../config/tutorial';

const isWeb = Platform.OS === 'web';

export default function TutorialVideoHost() {
  const [capitulo, setCapitulo] = useState(null); // null = fechado

  useEffect(() => subscribeTutorial((cap) => {
    if (!isWeb) {
      Linking.openURL(urlYoutube(cap)).catch(() => {});
      return;
    }
    setCapitulo(cap ?? 'abertura');
  }), []);

  if (!isWeb || capitulo == null) return null;
  const fechar = () => setCapitulo(null);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={fechar}>
      <Pressable style={styles.overlay} onPress={fechar} accessibilityLabel="Fechar vídeo">
        <Pressable style={styles.card} onPress={() => {}}>
          <View style={styles.header}>
            <Feather name="play-circle" size={18} color={colors.primary} />
            <Text style={styles.title} numberOfLines={1}>{TUTORIAL_TITULO}</Text>
            <Pressable onPress={fechar} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fechar vídeo" style={styles.close}>
              <Feather name="x" size={20} color={colors.text} />
            </Pressable>
          </View>

          <View style={styles.player}>
            {React.createElement('iframe', {
              // key: trocar de capítulo recarrega o player já no ponto novo.
              key: String(capitulo),
              src: urlEmbed(capitulo),
              title: TUTORIAL_TITULO,
              allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
              allowFullScreen: true,
              style: { border: 0, width: '100%', height: '100%', display: 'block' },
            })}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {ORDEM_CAPITULOS.map((k) => {
              const ativo = k === capitulo;
              return (
                <Pressable
                  key={k}
                  onPress={() => setCapitulo(k)}
                  style={[styles.chip, ativo && styles.chipAtivo]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: ativo }}
                  accessibilityLabel={`Ir para ${CAPITULOS[k].titulo}`}
                >
                  <Text style={[styles.chipTempo, ativo && styles.chipTextoAtivo]}>{formatarTempo(CAPITULOS[k].t)}</Text>
                  <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]} numberOfLines={1}>{CAPITULOS[k].titulo}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
  },
  card: {
    width: '100%',
    maxWidth: 960,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg || 16,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  title: {
    flex: 1,
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  close: { padding: 4 },
  player: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: '#000',
  },
  chips: {
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    maxWidth: 260,
  },
  chipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTempo: { fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primary },
  chipTexto: { fontSize: fonts.tiny, color: colors.text },
  chipTextoAtivo: { color: '#fff' },
});
