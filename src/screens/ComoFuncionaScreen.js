/**
 * Primeiro acesso (16/10/2026): vídeo de 50 s "Quanto cobrar?" logo depois do
 * perfil, no lugar do Kit de Início.
 *
 * Dados de 14–15/10: quem pegou o Kit (~90 ingredientes sem preço) parou ali,
 * e quem pulou o Kit também não cadastrou nada. A ideia é mostrar em 1 minuto
 * o que o app faz e qual o primeiro passo, sem obrigar a preencher nada. O
 * Kit continua em Configurações.
 *
 * Vídeo servido pelo próprio app (public/videos/como-funciona.mp4, 540×960,
 * ~3 MB, faststart): media-src cai no default-src 'self' da CSP. Só web; no
 * app nativo a tela segue direto para a Home.
 */
import React, { useEffect, useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { trackEvent } from '../utils/marketing';
import { CHAVE_COMO_FUNCIONA } from '../utils/initialRoute';

const VIDEO_SRC = '/videos/como-funciona.mp4';
const POSTER_SRC = '/videos/como-funciona.jpg';

export default function ComoFuncionaScreen({ navigation }) {
  const assistiuRef = useRef(false);
  const ehWeb = Platform.OS === 'web';

  async function irParaApp() {
    try { await AsyncStorage.setItem('onboarding_done', 'true'); } catch (_) {}
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab: 'Início' } }] }));
  }

  // Uma vez só (a rota de entrada não traz de novo). Nativo não tem o player
  // web: segue para a Home.
  useEffect(() => {
    AsyncStorage.setItem(CHAVE_COMO_FUNCIONA, 'true').catch(() => {});
    if (!ehWeb) irParaApp();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aoTocar() {
    if (assistiuRef.current) return;
    assistiuRef.current = true;
    trackEvent('AssistiuComoFunciona', { content_name: 'video_boas_vindas' });
  }

  if (!ehWeb) return <View style={styles.tela} />;

  return (
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}>
      <View style={styles.coluna}>
        <Text style={styles.titulo}>Veja em 1 minuto como funciona</Text>
        <Text style={styles.subtitulo}>Depois é só cadastrar o primeiro ingrediente e montar o seu primeiro preço.</Text>
        <View style={styles.videoCaixa}>
          {React.createElement('video', {
            src: VIDEO_SRC,
            poster: POSTER_SRC,
            controls: true,
            playsInline: true,
            preload: 'metadata',
            onPlay: aoTocar,
            style: { width: '100%', height: '100%', borderRadius: 16, backgroundColor: '#000', objectFit: 'contain' },
          })}
        </View>
        <TouchableOpacity style={styles.botao} onPress={irParaApp} accessibilityRole="button">
          <Text style={styles.botaoTexto}>Começar</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.background },
  conteudo: { padding: spacing.md, paddingBottom: spacing.xl },
  coluna: { maxWidth: 420, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.bold, color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  subtitulo: { fontSize: fonts.regular, lineHeight: 22, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md, textAlign: 'center' },
  videoCaixa: { width: '100%', aspectRatio: 9 / 16, maxHeight: '62vh', alignSelf: 'center', borderRadius: borderRadius.lg, overflow: 'hidden', backgroundColor: '#000' },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 52, marginTop: spacing.lg },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
});
