import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useListDensity from '../hooks/useListDensity';
import useRateLimit from '../hooks/useRateLimit';
import { mapAuthError } from '../utils/authErrors';
import { parseRateLimitSeconds } from '../utils/parseRateLimit';

// Validação simples: nome@dominio.tld (subset de RFC 5322 suficiente para UX antes do backend).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Timeout para sair de spinner infinito quando o backend trava (audit P2).
const LOGIN_TIMEOUT_MS = 30000;

export default function LoginScreen({ navigation }) {
  const { signIn } = useAuth();
  const { isCompact, inputHeight, buttonHeight } = useListDensity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // Countdown (segundos) para rate-limit retornado pelo Supabase.
  // Quando > 0, desabilita o botão e mostra "Aguarde Xs para tentar novamente".
  const [retryIn, setRetryIn] = useState(0);
  const rateLimit = useRateLimit();
  const passwordRef = useRef(null);

  // Decrementa retryIn a cada segundo até zerar; cleanup garante que o timer
  // seja descartado ao desmontar OU assim que o countdown termina.
  useEffect(() => {
    if (retryIn <= 0) return undefined;
    const id = setInterval(() => {
      setRetryIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [retryIn]);

  // P2 quick-win: limpa erro ao digitar (evita feedback "preso" quando usuário corrige)
  const onChangeEmail = (v) => { if (error) setError(''); setEmail(v); };
  const onChangePassword = (v) => { if (error) setError(''); setPassword(v); };

  const handleLogin = async () => {
    const limitMsg = rateLimit.checkLimit();
    if (limitMsg) { setError(limitMsg); return; }
    // P0: validação por campo + regex de email
    const emailTrim = email.trim();
    const passwordTrim = password.trim();
    if (!emailTrim && !passwordTrim) {
      setError('Informe email e senha para continuar.');
      return;
    }
    if (!emailTrim) {
      setError('Informe seu email.');
      return;
    }
    if (!passwordTrim) {
      setError('Informe sua senha.');
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
    }, LOGIN_TIMEOUT_MS);
    try {
      await signIn(emailTrim.toLowerCase(), password);
      if (timedOut) return;
      rateLimit.reset();
    } catch (err) {
      if (timedOut) return;
      console.error('[LoginScreen.handleLogin]', err);
      rateLimit.recordAttempt();
      // Se o backend devolveu rate-limit explícito, exibe countdown ao invés
      // do erro genérico — feedback mais preciso que mensagem mapeada.
      const seconds = parseRateLimitSeconds(err);
      if (seconds) {
        setRetryIn(seconds);
        setError('');
      } else {
        setError(mapAuthError(err, { context: 'signIn' }));
      }
    } finally {
      clearTimeout(timeoutId);
      if (!timedOut) setLoading(false);
    }
  };

  // P1: botão fica desabilitado durante loading, rate-limit local OU countdown
  // de rate-limit retornado pelo backend (Supabase 429).
  const btnDisabled = loading || !!rateLimit.isLocked || retryIn > 0;

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <View style={styles.logoArea}>
          <Image
            source={require('../../assets/images/logo-header-white.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.subtitle}>Precificação inteligente{'\n'}para seu negócio</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Entrar</Text>
          <Text style={styles.cardSubtitle}>Bom te ver de novo!</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#dc2626" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
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
            returnKeyType="next"
            onSubmitEditing={() => passwordRef.current?.focus()}
            placeholderTextColor={colors.disabled}
          />

          <Text style={styles.label}>Senha</Text>
          <View style={[styles.passwordContainer, { minHeight: inputHeight }]}>
            <TextInput
              ref={passwordRef}
              style={[styles.passwordInput, { paddingVertical: isCompact ? 8 : 12 }]}
              value={password}
              onChangeText={onChangePassword}
              placeholder="Sua senha"
              secureTextEntry={!showPassword}
              autoComplete="password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={handleLogin}
              placeholderTextColor={colors.disabled}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.7}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')} style={styles.forgotBtn}>
            <Text style={styles.forgotText}>Esqueci minha senha</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { minHeight: buttonHeight, paddingVertical: isCompact ? spacing.sm : spacing.md }, btnDisabled && styles.primaryBtnDisabled]}
            onPress={handleLogin}
            disabled={btnDisabled}
            activeOpacity={0.7}
            accessibilityState={{ disabled: btnDisabled }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.primaryBtnText}>Entrar</Text>
                <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </View>
            )}
          </TouchableOpacity>

          {retryIn > 0 ? (
            <Text
              style={styles.retryHint}
              accessibilityLiveRegion="polite"
              accessibilityRole="text"
            >
              Aguarde {retryIn}s para tentar novamente
            </Text>
          ) : null}

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Ainda não tem conta? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Register')}>
              <Text style={styles.registerLink}>Criar conta</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary, alignItems: 'center' },
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: 32, maxWidth: 420, width: '100%', alignSelf: 'center' },
  logoArea: { alignItems: 'center', marginBottom: 28 },
  logo: { width: 160, height: 36, marginBottom: 8 },
  subtitle: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: fontFamily.regular, textAlign: 'center', lineHeight: 19 },
  card: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, paddingTop: 24 },
  cardTitle: { fontSize: 22, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4, textAlign: 'center' },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginBottom: 16, fontFamily: fontFamily.regular },
  label: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 6, marginTop: 14 },
  input: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fontFamily.regular, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  passwordContainer: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  passwordInput: {
    flex: 1, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fontFamily.regular, color: colors.text,
  },
  eyeBtn: {
    paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', alignItems: 'center',
  },
  // P1-15: Esqueci minha senha — alinhado à direita logo abaixo do campo de senha,
  // com mais destaque (semibold + sublinhado) para reduzir bounce de usuários
  // que esquecem a senha e não conseguem encontrar o link.
  // Sessão 28 — paddingVertical 4→12 (touch target 44pt ao invés de 21pt)
  // Sessão 28.9 — APP-02: link aumentado (era 13pt, ficou pequeno demais segundo feedback de teste)
  forgotBtn: { alignSelf: 'flex-end', marginTop: 12, marginBottom: 22, paddingVertical: 14, paddingHorizontal: 10, minHeight: 48, justifyContent: 'center' },
  forgotText: {
    fontSize: 15, color: colors.primary, fontFamily: fontFamily.semiBold,
    fontWeight: '700', textDecorationLine: 'underline',
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  // Audit P1: feedback visual de bot\u00e3o desabilitado durante rate-limit/loading
  primaryBtnDisabled: { opacity: 0.5 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
  // Texto do countdown durante rate-limit do backend (live region p/ a11y).
  retryHint: {
    fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.medium,
    textAlign: 'center', marginTop: 12,
  },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: colors.textSecondary, fontFamily: fontFamily.regular },
  registerLink: { fontSize: 14, color: colors.primary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  // Audit P2: borda esquerda vermelha para acessibilidade daltonismo
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10, borderRadius: borderRadius.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    marginBottom: 4,
  },
  errorText: { color: '#dc2626', fontSize: 13, fontFamily: fontFamily.regular, flex: 1 },
});
