import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Platform, Dimensions } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';

const { width } = Dimensions.get('window');

export default function LandingScreen({ navigation }) {
  return (
    <View style={styles.container}>
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

        {/* CTAs */}
        <View style={styles.ctaArea}>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.navigate('Register')}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryBtnText}>Começar grátis</Text>
            <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => navigation.navigate('Login')}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryBtnText}>Já tenho conta</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.freeText}>Grátis para até 5 produtos</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.primary,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 32,
  },
  logo: {
    width: 200,
    height: 44,
    marginBottom: 16,
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
    gap: 12,
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
    width: 32,
    height: 32,
    borderRadius: 16,
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
    gap: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.md,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    ...Platform.select({
      web: { boxShadow: '0 4px 16px rgba(0,0,0,0.15)' },
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
    }),
  },
  primaryBtnText: {
    color: colors.primary,
    fontSize: 17,
    fontWeight: '700',
    fontFamily: fontFamily.bold,
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
    borderRadius: borderRadius.md,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: fontFamily.semiBold,
  },
  freeText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontFamily: fontFamily.regular,
    textAlign: 'center',
  },
});
