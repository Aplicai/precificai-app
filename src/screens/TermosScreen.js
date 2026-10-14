/**
 * Termos de Uso dentro do app.
 *
 * Havia aqui uma cópia própria dos Termos (maio/2026), com outro nome de empresa
 * ("Aplicais"), razão social e CNPJ por preencher e planos pagos "futuros". A
 * versão publicada é a de app.precificaiapp.com/terms; esta tela resume e abre
 * aquela — uma fonte só, como a de Privacidade.
 */
import React from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Linking, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useNavigation } from '@react-navigation/native';
import BackToSettings from '../components/BackToSettings';
import { EMPRESA, EMPRESA_IDENTIFICACAO } from '../config/empresa';

const TERMOS_URL = 'https://app.precificaiapp.com/terms';

const RESUMO = [
  { icon: 'briefcase', texto: `O Precificaí é oferecido pela ${EMPRESA_IDENTIFICACAO}.` },
  { icon: 'database', texto: 'Os dados que você cadastra (ingredientes, receitas, preços, custos) são seus.' },
  { icon: 'info', texto: 'Os preços sugeridos são cálculos a partir do que você informa. A decisão final de preço é sua.' },
  { icon: 'credit-card', texto: 'O plano grátis tem limite de produtos e combos; o plano Pro libera tudo. Você pode cancelar quando quiser e mantém o acesso até o fim do período pago.' },
  { icon: 'mail', texto: `Suporte e pedidos sobre a conta: ${EMPRESA.email}.` },
];

function abrirTermos() {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(TERMOS_URL, '_blank', 'noopener,noreferrer');
    return;
  }
  Linking.openURL(TERMOS_URL).catch(() => {});
}

export default function TermosScreen() {
  const navigation = useNavigation();
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <BackToSettings navigation={navigation} />
      <View style={styles.header}>
        <View style={styles.iconCircle}>
          <Feather name="file-text" size={22} color={colors.primary} />
        </View>
        <Text style={styles.title} accessibilityRole="header">Termos de Uso</Text>
      </View>

      <Text style={styles.intro}>Os pontos principais, em poucas palavras:</Text>

      {RESUMO.map((item) => (
        <View key={item.icon} style={styles.item}>
          <Feather name={item.icon} size={16} color={colors.primary} style={{ marginTop: 2 }} />
          <Text style={styles.itemText}>{item.texto}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.btn} onPress={abrirTermos} activeOpacity={0.8} accessibilityRole="link" accessibilityLabel="Ler os termos de uso completos">
        <Feather name="external-link" size={16} color="#fff" />
        <Text style={styles.btnText}>Ler os termos completos</Text>
      </TouchableOpacity>

      <Text style={styles.footer}>A versão completa é a que vale.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100, maxWidth: 720, width: '100%', alignSelf: 'center' },
  header: { alignItems: 'center', paddingVertical: spacing.md, marginBottom: spacing.sm },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  title: { fontSize: fonts.title, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text, textAlign: 'center' },
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
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14, marginTop: spacing.md,
  },
  btnText: { color: '#fff', fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700' },
  footer: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginTop: spacing.md },
});
