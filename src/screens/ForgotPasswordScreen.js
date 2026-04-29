import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useListDensity from '../hooks/useListDensity';
import useRateLimit from '../hooks/useRateLimit';
import { mapAuthError } from '../utils/authErrors';

// Validação simples: nome@dominio.tld (subset de RFC 5322 suficiente para UX antes do backend).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Timeout para sair de spinner infinito quando o backend trava (audit P2).
const RESET_TIMEOUT_MS = 30000;

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth();
  const { isCompact, inputHeight, buttonHeight } = useListDensity();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const rateLimit = useRateLimit();

  // P2 quick-win: limpa erro ao digitar (evita feedback "preso" quando usuário corrige)
  const onChangeEmail = (v) => { if (error) setError(''); setEmail(v); };

  const handleReset = async () => {
    const limitMsg = rateLimit.checkLimit();
    if (limitMsg) { setError(limitMsg); return; }
    const emailTrim = email.trim();
    if (!emailTrim) {
      setError('Informe seu email para receber o link de recuperação.');
      return;
    }
    if (!EMAIL_RE.test(emailTrim)) {
      setError('Email inválido. Verifique se está no formato nome@dominio.com');
      return;
    }
    setError('');
    setLoading(true);
    // P2: timeout para evitar spinner infinito se backend não responder
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      setLoading(false);
      setError('Servidor demorou para responder. Verifique sua conexão e tente novamente.');
    }, RESET_TIMEOUT_MS);
    try {
      await resetPassword(emailTrim.toLowerCase());
      if (timedOut) return;
      rateLimit.reset();
      setSent(true);
    } catch (err) {
      if (timedOut) return;
      // Sessão 28.9 — APP-01: log detalhado pra diagnosticar falha de envio.
      // Status 500 + mensagem "Error sending recovery email" geralmente = SMTP
      // rejeitando (ex: Resend em modo teste só envia pra email do dono da conta).
      console.error('[ForgotPassword.handleReset] full error:', {
        message: err?.message,
        status: err?.status || err?.code,
        name: err?.name,
        details: err?.details,
        raw: err,
      });
      rateLimit.recordAttempt();
      setError(mapAuthError(err, { context: 'reset' }));
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut) setLoading(false);
    }
  };

  // P1: botão fica desabilitado durante loading OU rate-limit ativo
  const btnDisabled = loading || !!rateLimit.isLocked;

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
                  <Text numberOfLines={2} style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={[styles.input, { minHeight: inputHeight, paddingVertical: isCompact ? 8 : 12 }]}
                value={email}
                onChangeText={onChangeEmail}
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

              <TouchableOpacity
                style={[styles.primaryBtn, { marginTop: 24, minHeight: buttonHeight, paddingVertical: isCompact ? spacing.sm : spacing.md }, btnDisabled && styles.primaryBtnDisabled]}
                onPress={handleReset}
                disabled={btnDisabled}
                activeOpacity={0.8}
                accessibilityState={{ disabled: btnDisabled }}
              >
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
  label: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 6, marginTop: 14 },
  input: {
    minHeight: 44, // Sessão Forms-Mobile — WCAG touch target 44pt mínimo
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fontFamily.regular, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  // Audit P1: feedback visual de botão desabilitado durante rate-limit/loading
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  backText: { fontSize: 14, color: colors.primary, fontFamily: fontFamily.medium },
  // Audit P2: borda esquerda vermelha para acessibilidade daltonismo
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10, borderRadius: borderRadius.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    marginBottom: 8,
  },
  errorText: { color: '#dc2626', fontSize: 12, fontFamily: fontFamily.regular, flex: 1, flexShrink: 1 },
  successIconCircle: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '10',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 12,
  },
});
