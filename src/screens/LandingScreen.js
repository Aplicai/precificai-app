import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';

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
        </View>

        {/* Features */}
        <View style={styles.features}>
          {[
            { icon: 'dollar-sign', text: 'Markup e margem automáticos' },
            { icon: 'pie-chart', text: 'Ficha técnica dos produtos' },
            { icon: 'truck', text: 'Precificação para delivery' },
          ].map((f, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureIcon}>
                <Feather name={f.icon} size={16} color={colors.primary} />
              </View>
              <Text style={styles.featureText}>{f.text}</Text>
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
            <Text style={styles.registerBtnText}>Começar Grátis</Text>
            <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          <Text style={styles.freeText}>Grátis para até 5 produtos</Text>

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
  },
  featureIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  featureText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
  },
  ctaArea: {
    alignItems: 'center',
  },
  registerBtn: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    width: '100%',
  },
  registerBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
  },
  freeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 24,
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
