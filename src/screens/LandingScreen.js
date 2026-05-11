import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';

// Sessão 28.50 — Landing reformulada:
// - 4 caixinhas (era 3) com "Delivery está te dando prejuízo?" incluído
// - Destaque pra "zero planilhas necessárias" no subtítulo
// - "Ranking de produtos" focado em LUCRO (não em volume)
// - CTA mantido "Começar Grátis" → navega pra Register
// - Mantida ausência de travessões (—) — usa quebras de linha e pontuação normal
// - Mantido o estilo minimalista, evitando exagero visual
export default function LandingScreen({ navigation }) {
  return (
    <ScrollView contentContainerStyle={styles.scroll} style={styles.container}>
      <View style={styles.inner}>
        {/* Logo + Branding */}
        <View style={styles.logoArea}>
          <Image
            source={require('../../assets/images/logo-header-white.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>
            Precificação inteligente{'\n'}para seu negócio
          </Text>
          <Text style={styles.subtitle}>
            Calcule custos, margens e preços de venda{'\n'}de forma simples e profissional.
          </Text>
          {/* Sessão 28.50: destaque sutil pra "zero planilhas" */}
          <View style={styles.zeroPlanilhasPill}>
            <Feather name="check-circle" size={12} color="#fff" />
            <Text style={styles.zeroPlanilhasText}>Zero planilhas necessárias</Text>
          </View>
        </View>

        {/* Features — 4 caixinhas */}
        <View style={styles.features}>
          {[
            { icon: 'dollar-sign', text: 'Markup e margem automáticos' },
            { icon: 'pie-chart', text: 'Ficha técnica dos produtos' },
            { icon: 'truck', text: 'Delivery está te dando prejuízo?' },
            { icon: 'award', text: 'Ranking de produtos que dão mais lucro' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Feather name={f.icon} size={16} color={colors.primary} />
              </View>
              <Text style={styles.featureText} numberOfLines={2}>{f.text}</Text>
            </View>
          ))}
        </View>

        {/* CTA Buttons */}
        <View style={styles.ctaArea}>
          <TouchableOpacity
            style={styles.registerBtn}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.8}
          >
            <Text style={styles.registerBtnText}>Criar conta grátis</Text>
            <Feather name="arrow-right" size={18} color={colors.primary} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          <Text style={styles.freeText}>Grátis para até 5 produtos cadastrados</Text>

          <View style={styles.loginRow}>
            <Text style={styles.loginText}>Já tem conta? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.loginLink}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  inner: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 40,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 180,
    height: 40,
    marginBottom: 12,
  },
  tagline: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    lineHeight: 20,
  },
  // Sessão 28.50: pill "zero planilhas"
  zeroPlanilhasPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  zeroPlanilhasText: {
    color: '#fff',
    fontSize: 12,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  features: {
    marginBottom: 32,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  featureText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
    flex: 1,
    flexShrink: 1,
  },
  ctaArea: {
    alignItems: 'center',
  },
  registerBtn: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    paddingHorizontal: 18,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  registerBtnText: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
    fontFamily: fontFamily.semiBold,
  },
  // Sessão 28.50: espaçamento ajustado — antes ficava estranho em mobile
  freeText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 22,
    paddingHorizontal: 8,
  },
  loginRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontFamily: fontFamily.regular,
  },
  loginLink: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
    textDecorationLine: 'underline',
  },
});
