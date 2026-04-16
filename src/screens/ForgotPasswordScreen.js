import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useRateLimit from '../hooks/useRateLimit';

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const rateLimit = useRateLimit();

  const handleReset = async () => {
    const limitMsg = rateLimit.checkLimit();
    if (limitMsg) { setError(limitMsg); return; }
    if (!email.trim()) {
      setError('Digite seu email');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('Digite um email válido');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase());
      rateLimit.reset();
      setSent(true);
    } catch (err) {
      rateLimit.recordAttempt();
      const raw = err?.message || err?.error_description || String(err);
      const lower = raw.toLowerCase();
      const msg = lower.includes('fetch') || lower.includes('network') || lower.includes('failed to fetch')
        ? 'Sem conexão. Verifique sua internet.'
        : lower.includes('too many requests') || lower.includes('rate limit')
        ? 'Muitas tentativas. Aguarde alguns minutos.'
        : 'Erro ao enviar email. Verifique o endereço.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.logoArea}>
          <Image
            source={require('../../assets/images/logo-header-white.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <View style={styles.card}>
          {sent ? (
            <>
              <View style={styles.successIconCircle}>
                <Feather name="mail" size={28} color={colors.primary} />
              </View>
              <Text style={styles.cardTitle}>Email enviado!</Text>
              <Text style={styles.desc}>
                Verifique sua caixa de entrada em <Text style={{ fontFamily: fontFamily.semiBold, color: colors.text }}>{email}</Text> e siga as instruções para redefinir sua senha.
              </Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.8}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.primaryBtnText}>Voltar ao Login</Text>
                  <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Recuperar Senha</Text>
              <Text style={styles.desc}>Digite seu email e enviaremos um link para redefinir sua senha.</Text>

              {error ? (
                <View style={styles.errorBox}>
                  <Feather name="alert-circle" size={14} color="#dc2626" style={{ marginRight: 6 }} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="done"
                onSubmitEditing={handleReset}
                placeholderTextColor={colors.disabled}
              />

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 24 }]} onPress={handleReset} disabled={loading} activeOpacity={0.8}>
                {loading ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.primaryBtnText}>Enviar Link</Text>
                    <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.backBtn}>
                <Feather name="arrow-left" size={16} color={colors.primary} style={{ marginRight: 4 }} />
                <Text style={styles.backText}>Voltar ao Login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: 32, maxWidth: 420, alignSelf: 'center', width: '100%' },
  logoArea: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 160, height: 36 },
  card: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, paddingTop: 24 },
  cardTitle: { fontSize: 22, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center', marginBottom: 8 },
  desc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16, fontFamily: fontFamily.regular },
  label: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fontFamily.regular, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  backText: { fontSize: 14, color: colors.primary, fontFamily: fontFamily.medium },
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10, borderRadius: borderRadius.sm,
    marginBottom: 8,
  },
  errorText: { color: '#dc2626', fontSize: 13, fontFamily: fontFamily.regular, flex: 1 },
  successIconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '10',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
  },
});
