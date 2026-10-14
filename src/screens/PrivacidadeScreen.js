/**
 * Política de Privacidade dentro do app.
 *
 * Havia aqui uma cópia própria da política (maio/2026), que ficou para trás da
 * versão publicada em /privacy e passou a contradizê-la (dizia "não usamos
 * pixels de redes sociais"). Agora a tela resume os pontos principais e abre a
 * política completa: uma fonte só, a de app.precificaiapp.com/privacy.
 */
import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';
import BackToSettings from '../components/BackToSettings';

const POLITICA_URL = 'https://app.precificaiapp.com/privacy';
const VERSAO = 'Versão 2.2 · 14 de outubro de 2026';

const RESUMO = [
  { icon: 'database', texto: 'Os dados do seu negócio (ingredientes, receitas, preços, custos) são seus. Não vendemos nem compartilhamos com anunciantes.' },
  { icon: 'shield', texto: 'Usamos poucos parceiros para o app funcionar: banco de dados e login (Supabase), hospedagem (Vercel), erros (Sentry) e, se você escolher, login com Google.' },
  { icon: 'target', texto: 'Com o seu aceite no aviso de cookies, a Meta mede nossos anúncios e mostra anúncios do Precificaí a quem já nos visitou.' },
  { icon: 'mail', texto: 'Podemos usar seu e-mail, embaralhado, para anúncios do Precificaí no Facebook e Instagram. Para não participar, escreva para contato@precificaiapp.com com o assunto "Não usar meu e-mail em anúncios".' },
  { icon: 'user-check', texto: 'Você pode pedir a qualquer momento acesso, correção ou exclusão dos seus dados pelo mesmo e-mail.' },
];

function abrirPolitica() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(POLITICA_URL, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(POLITICA_URL).catch(() => {});
}

export default function PrivacidadeScreen() {
  const navigation = useNavigation();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackToSettings navigation={navigation} />
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Feather name="shield" size={22} color={colors.accent} />
        </View>
        <Text style={styles.title} accessibilityRole="header">Política de Privacidade</Text>
        <Text style={styles.subtitle}>{VERSAO}</Text>
      </View>

      <Text style={styles.intro}>Os pontos principais, em poucas palavras:</Text>

      {RESUMO.map((item) => (
        <View key={item.icon} style={styles.item}>
          <Feather name={item.icon} size={16} color={colors.primary} style={{ marginTop: 2 }} />
          <Text style={styles.itemText}>{item.texto}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.btn} onPress={abrirPolitica} activeOpacity={0.8} accessibilityRole="link" accessibilityLabel="Ler a política de privacidade completa">
        <Feather name="external-link" size={16} color="#fff" />
        <Text style={styles.btnText}>Ler a política completa</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>
        A versão completa, com bases legais (LGPD), prazos e seus direitos, é a que vale.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: {
    padding: spacing.md,
    paddingBottom: 100,
    maxWidth: 720,
    width: '100%',
    alignSelf: 'center',
  },
  header: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.accent + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fonts.title, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text, textAlign: 'center' },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, marginTop: 4, textAlign: 'center' },
  intro: { fontSize: fonts.regular, color: colors.text, fontFamily: fontFamily.semiBold, marginBottom: spacing.sm },
  item: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  itemText: { flex: 1, fontSize: fonts.regular, color: colors.text, lineHeight: 21 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    marginTop: spacing.md,
  },
  btnText: { color: '#fff', fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700' },
  footer: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
});
