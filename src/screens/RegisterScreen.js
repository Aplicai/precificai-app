import React, { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal, Image } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useListDensity from '../hooks/useListDensity';
import useRateLimit from '../hooks/useRateLimit';
import { mapAuthError } from '../utils/authErrors';
import { parseRateLimitSeconds } from '../utils/parseRateLimit';
import { MIN_PASSWORD_LENGTH, validatePassword, passwordCriteria } from '../utils/passwordPolicy';
import { askConsent } from '../utils/marketing';
import { ehContaGoogle } from '../utils/emailGoogle';

// Política de senha: `utils/passwordPolicy.js` (compartilhada com
// ResetPasswordScreen e ContaSegurancaScreen). 8+ caracteres, 1 letra, 1 número.
// Decisão do dono (2026-10): sem símbolo, sem maiúscula/minúscula e sem barreira
// de força (zxcvbn removido — ~400 KB de dicionário só pra frustrar cadastro).

// Polling de fallback da tela "Verifique seu email" (ver useEffect abaixo).
const CONFIRM_POLL_INTERVAL_MS = 5000;
const CONFIRM_POLL_MAX_TICKS = (10 * 60 * 1000) / CONFIRM_POLL_INTERVAL_MS; // 10 min

export default function RegisterScreen({ navigation }) {
  const { signUp, signInWithGoogle, reloadSession } = useAuth();
  const rateLimit = useRateLimit();
  const { isCompact, inputHeight, buttonHeight } = useListDensity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Google primeiro: quem entra pelo Google não depende do e-mail de
  // confirmação (14–15/10: 10 de 10 entraram; por e-mail e senha, 8 de 17).
  // O formulário fica atrás de um link.
  const [formEmail, setFormEmail] = useState(false);
  // Countdown (segundos) para rate-limit retornado pelo Supabase.
  // Quando > 0, desabilita o botão e exibe "Aguarde Xs para tentar novamente".
  const [retryIn, setRetryIn] = useState(0);
  const passwordRef = useRef(null);

  // Tela de chegada dos anúncios: pergunta sobre cookies de medição uma vez.
  useEffect(() => { askConsent(); }, []);

  // Decrementa retryIn a cada segundo até zerar; cleanup garante que o timer
  // seja descartado ao desmontar OU assim que o countdown termina.
  useEffect(() => {
    if (retryIn <= 0) return undefined;
    const id = setInterval(() => {
      setRetryIn((s) => (s <= 1 ? 0 : s - 1));
    }, 1000);
    return () => clearInterval(id);
  }, [retryIn]);

  // P2 quick-win: limpa erro ao digitar (evita feedback "preso" depois de corrigir)
  const onChangeEmail = (v) => { if (error) setError(''); setEmail(v); };
  const onChangePassword = (v) => { if (error) setError(''); setPassword(v); };

  const handleRegister = async () => {
    const limitMsg = rateLimit.checkLimit();
    if (limitMsg) { setError(limitMsg); return; }
    // P1/P2 audit: validação por campo (não "preencha tudo" genérico)
    const emailTrim = email.trim();
    if (!emailTrim && !password.trim()) {
      setError('Preencha email e senha para continuar.');
      return;
    }
    if (!emailTrim) {
      setError('Informe seu email.');
      return;
    }
    if (!password.trim()) {
      setError('Informe sua senha.');
      return;
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (!emailRegex.test(emailTrim)) {
      setError('Email inválido. Verifique se está no formato nome@dominio.com');
      return;
    }
    // Política única em passwordPolicy.js (compartilhada com ResetPasswordScreen).
    const pol = validatePassword(password);
    if (!pol.ok) {
      setError(pol.error);
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp(emailTrim.toLowerCase(), password);
      rateLimit.reset();
      setSuccess(true);
    } catch (err) {
      console.error('[RegisterScreen.handleRegister]', err);
      rateLimit.recordAttempt();
      // Se o backend devolveu rate-limit explícito, exibe countdown ao invés
      // do erro genérico — feedback mais preciso que mensagem mapeada.
      const seconds = parseRateLimitSeconds(err);
      if (seconds) {
        setRetryIn(seconds);
        setError('');
      } else {
        setError(mapAuthError(err, { context: 'signUp' }));
      }
    } finally {
      setLoading(false);
    }
  };

  // P1: botão fica desabilitado durante loading, rate-limit local OU countdown
  // de rate-limit retornado pelo backend (Supabase 429).
  const btnDisabled = loading || !!rateLimit.isLocked || retryIn > 0;

  // Continuar com Google — Supabase OAuth.
  // Em primeira vez, o Supabase cria a conta automaticamente (não precisa de
  // signUp separado). Em logins subsequentes, só autentica. Sempre o mesmo método.
  const handleGoogleSignup = async () => {
    setError('');
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      console.error('[RegisterScreen.handleGoogleSignup]', err);
      setError(err?.message || 'Não foi possível iniciar o login com Google. Tente novamente.');
    } finally {
      setGoogleLoading(false);
    }
  };
  const googleDisabled = googleLoading || loading;

  // Tela "Verifique seu email": a confirmação acontece em OUTRA aba (a que o
  // link do e-mail abre, já logada via detectSessionInUrl). O auth-js avisa
  // esta aba por BroadcastChannel → AuthContext seta `user` → o navigator troca
  // pro app sozinho. Fallback pra quando o aviso não chega (browser sem
  // BroadcastChannel, aba suspensa): relê a sessão do storage compartilhado a
  // cada 5 s, por no máximo 10 min. Quando aparecer, o AuthContext adota e a
  // navegação normal assume — esta tela desmonta.
  const [checkingSession, setCheckingSession] = useState(false);
  useEffect(() => {
    if (!success) return undefined;
    let ticks = 0;
    let cancelled = false;
    const id = setInterval(async () => {
      ticks += 1;
      if (ticks > CONFIRM_POLL_MAX_TICKS) { clearInterval(id); return; }
      const s = await reloadSession();
      if (cancelled) return;
      if (s?.user) clearInterval(id);
    }, CONFIRM_POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, [success, reloadSession]);

  // "Já confirmei, entrar": mesma checagem, na hora. Com sessão, o navigator
  // assume; sem sessão (ainda não clicou no link), vai pro Login.
  const handleAlreadyConfirmed = async () => {
    setCheckingSession(true);
    try {
      const s = await reloadSession();
      if (!s?.user) navigation.replace('Login');
    } finally {
      setCheckingSession(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.innerCenter}>
          <View style={styles.card}>
            <View style={styles.successIconCircle}>
              <Feather name="mail" size={28} color={colors.primary} />
            </View>
            <Text style={styles.cardTitle}>Verifique seu email</Text>
            <Text style={styles.successText}>
              Enviamos um link para{' '}
              <Text style={{ fontFamily: fontFamily.semiBold, color: colors.text }}>{email}</Text>.
              {' '}Clique nele e esta tela avança sozinha.
            </Text>
            <Text style={styles.successHint}>
              Não encontrou? Veja no spam e na aba Promoções. O link vale por 1 hora; se vencer, peça outro na tela de entrar.
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, checkingSession && styles.primaryBtnDisabled]}
              onPress={handleAlreadyConfirmed}
              disabled={checkingSession}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityState={{ disabled: checkingSession }}
            >
              {checkingSession ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <Text style={styles.primaryBtnText}>Já confirmei, entrar</Text>
                  <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

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
          <Text style={styles.cardTitle}>Crie sua conta grátis</Text>
          <Text style={styles.cardSubtitle}>Comece a precificar seus produtos em minutos</Text>

          {error ? (
            <View style={styles.errorBox}>
              <Feather name="alert-circle" size={14} color="#dc2626" style={{ marginRight: 6 }} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

          {/* Continuar com Google — Supabase cria a conta automaticamente na 1ª vez. */}
          <TouchableOpacity
            style={[styles.googleBtn, googleDisabled && styles.googleBtnDisabled]}
            onPress={handleGoogleSignup}
            disabled={googleDisabled}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Continuar com Google"
            accessibilityState={{ disabled: googleDisabled }}
          >
            {googleLoading ? (
              <ActivityIndicator color="#3c4043" size="small" />
            ) : (
              <>
                <MaterialCommunityIcons name="google" size={18} color="#4285F4" style={{ marginRight: 10 }} />
                <Text style={styles.googleBtnText}>Continuar com Google</Text>
              </>
            )}
          </TouchableOpacity>
          <Text style={styles.googleHelperText}>
            Sua conta fica pronta na hora, sem precisar confirmar e-mail.
          </Text>

          {!formEmail ? (
            <TouchableOpacity
              style={styles.formEmailLink}
              onPress={() => setFormEmail(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
            >
              <Feather name="mail" size={15} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.formEmailLinkText}>Prefiro cadastrar com e-mail e senha</Text>
            </TouchableOpacity>
          ) : (
          <>
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>ou</Text>
            <View style={styles.dividerLine} />
          </View>

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
            placeholderTextColor={colors.placeholder}
          />

          {ehContaGoogle(email) ? (
            <View style={styles.gmailHint}>
              <Text style={styles.gmailHintText}>
                Usa Gmail? Entre com o Google: sua conta fica pronta na hora, sem esperar o e-mail de confirmação.
              </Text>
              <TouchableOpacity
                style={[styles.gmailHintBtn, googleDisabled && styles.googleBtnDisabled]}
                onPress={handleGoogleSignup}
                disabled={googleDisabled}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Continuar com Google"
              >
                <MaterialCommunityIcons name="google" size={16} color="#4285F4" style={{ marginRight: 8 }} />
                <Text style={styles.googleBtnText}>Continuar com Google</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <Text style={styles.label}>Senha</Text>
          <View style={[styles.passwordContainer, { minHeight: inputHeight }]}>
            <TextInput
              ref={passwordRef}
              style={[styles.passwordInput, { paddingVertical: isCompact ? 8 : 12 }]}
              value={password}
              onChangeText={onChangePassword}
              placeholder="Crie uma senha segura"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
              placeholderTextColor={colors.placeholder}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowPassword(!showPassword)}
              activeOpacity={0.7}
            >
              <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Sessão 28.9 — APP-03: hint de critérios visível ANTES de digitar */}
          {!password && (
            <Text style={styles.passwordHint}>
              Use no m&iacute;nimo {MIN_PASSWORD_LENGTH} caracteres, com pelo menos 1 letra e 1 n&uacute;mero.
            </Text>
          )}

          {/* Checklist em tempo real — exatamente as 3 regras que `validatePassword`
              exige, vindas da mesma fonte (passwordCriteria). Nada de critério
              "recomendado" que não bloqueia: o que aparece aqui é o que vale. */}
          {password ? (
            <View style={styles.criteriaWrap}>
              {passwordCriteria(password).map((c, i) => (
                <View key={i} style={styles.criteriaRow}>
                  <Feather name={c.ok ? 'check-circle' : 'circle'} size={12} color={c.ok ? colors.success : colors.disabled} />
                  <Text style={[styles.criteriaText, { color: c.ok ? colors.success : colors.textSecondary }]}>{c.label}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 20, minHeight: buttonHeight, paddingVertical: isCompact ? spacing.sm : spacing.md }, btnDisabled && styles.primaryBtnDisabled]}
            onPress={handleRegister}
            disabled={btnDisabled}
            activeOpacity={0.8}
            accessibilityState={{ disabled: btnDisabled }}
          >
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.primaryBtnText}>Criar Conta Grátis</Text>
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
          </>
          )}

          <Text style={styles.termsNotice}>
            Ao criar sua conta, você concorda com os{' '}
            <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>Termos de Uso</Text>
            {' '}e a{' '}
            <Text style={styles.termsLink} onPress={() => setShowPrivacy(true)}>Política de Privacidade</Text>.
          </Text>

          {/* Trust signals */}
          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <Feather name="shield" size={13} color={colors.primaryMid} />
              <Text style={styles.trustText}>Dados protegidos</Text>
            </View>
            <View style={styles.trustItem}>
              <Feather name="credit-card" size={13} color={colors.primaryMid} />
              <Text style={styles.trustText}>Sem cartão</Text>
            </View>
            <View style={styles.trustItem}>
              <Feather name="zap" size={13} color={colors.primaryMid} />
              <Text style={styles.trustText}>Pronto em 2min</Text>
            </View>
          </View>

          <View style={styles.registerRow}>
            <Text style={styles.registerText}>Já tem conta? </Text>
            <TouchableOpacity onPress={() => navigation.replace('Login')}>
              <Text style={styles.registerLink}>Entrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* Terms of Use Modal */}
      <Modal visible={showTerms} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Termos de Uso</Text>
              <TouchableOpacity onPress={() => setShowTerms(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalText}>
                {'TERMOS DE USO - PRECIFICAÍ\n\n' +
                '1. ACEITAÇÃO DOS TERMOS\nAo utilizar o Precificaí, você concorda com estes termos.\n\n' +
                '2. DESCRIÇÃO DO SERVIÇO\nO Precificaí é uma ferramenta de precificação para negócios de alimentação.\n\n' +
                '3. CADASTRO\nVocê é responsável pela veracidade das informações cadastradas.\n\n' +
                '4. USO DO SERVIÇO\nO serviço é destinado exclusivamente para fins de gestão e precificação.\n\n' +
                '5. LIMITAÇÃO DE RESPONSABILIDADE\nO Precificaí não se responsabiliza por decisões comerciais tomadas com base nos cálculos.\n\n' +
                '6. PROPRIEDADE INTELECTUAL\nTodo o conteúdo do app pertence à Precificaí.\n\n' +
                '7. CANCELAMENTO E RETENÇÃO DE DADOS\nVocê pode cancelar sua conta a qualquer momento nas configurações. Após a exclusão, seus dados serão retidos por 30 (trinta) dias para fins de auditoria e cumprimento de obrigações legais, conforme previsto na LGPD (Lei 13.709/2018, Art. 16). Após esse período, todos os dados pessoais serão eliminados definitivamente dos nossos servidores.\n\n' +
                '8. ALTERAÇÕES\nReservamo-nos o direito de alterar estes termos.\n\n' +
                'Última atualização: Março 2026'}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowTerms(false)} activeOpacity={0.8}>
              <Text style={styles.modalCloseBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Privacy Policy Modal */}
      <Modal visible={showPrivacy} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Política de Privacidade</Text>
              <TouchableOpacity onPress={() => setShowPrivacy(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Feather name="x" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalScroll} showsVerticalScrollIndicator={false}>
              <Text style={styles.modalText}>
                {'POLÍTICA DE PRIVACIDADE - PRECIFICAÍ\n\n' +
                '1. DADOS COLETADOS\nColetamos: email, nome do negócio, dados financeiros inseridos por você.\n\n' +
                '2. USO DOS DADOS\nSeus dados são usados exclusivamente para o funcionamento do app.\n\n' +
                '3. ARMAZENAMENTO\nOs dados são armazenados de forma segura em servidores Supabase.\n\n' +
                '4. COMPARTILHAMENTO\nNão compartilhamos seus dados com terceiros.\n\n' +
                '5. LGPD\nEm conformidade com a Lei Geral de Proteção de Dados (Lei 13.709/2018), você tem direito a: acessar, corrigir, excluir e portar seus dados. A base legal para o tratamento dos dados é o consentimento do titular (Art. 7°, I) e a execução de contrato (Art. 7°, V).\n\n' +
                '6. EXCLUSÃO E RETENÇÃO DE DADOS\nVocê pode solicitar a exclusão da sua conta a qualquer momento. Após a solicitação, os dados serão retidos por 30 (trinta) dias para fins de auditoria, cumprimento de obrigações legais e exercício regular de direitos (LGPD, Art. 16, I e II). Decorrido esse prazo, todos os dados pessoais serão eliminados definitivamente.\n\n' +
                '7. COOKIES\nUtilizamos apenas cookies essenciais para funcionamento.\n\n' +
                '8. CONTATO\nPara questões sobre privacidade: contato@precificaiapp.com\n\n' +
                'Última atualização: Março 2026'}
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowPrivacy(false)} activeOpacity={0.8}>
              <Text style={styles.modalCloseBtnText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  inner: {
    flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg,
    paddingVertical: 32, maxWidth: 420, alignSelf: 'center', width: '100%',
  },
  innerCenter: {
    flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg,
    maxWidth: 420, alignSelf: 'center', width: '100%',
  },

  // Branding
  logoArea: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 160, height: 36 },

  // Card
  card: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, paddingTop: 24 },
  cardTitle: { fontSize: 22, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center' },
  cardSubtitle: {
    fontSize: 13, color: colors.textSecondary, textAlign: 'center',
    marginTop: 4, marginBottom: 16, fontFamily: fontFamily.regular,
  },

  // Labels & inputs
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
  eyeBtn: { paddingHorizontal: 12, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },

  // Dica de política de senha (visível antes de digitar)
  passwordHint: {
    fontSize: 12, color: colors.textSecondary, marginTop: 6,
    fontFamily: fontFamily.regular, lineHeight: 16,
  },
  // APP-03: checklist de critérios de senha
  criteriaWrap: { marginTop: 8, marginBottom: 4, gap: 4 },
  criteriaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  criteriaText: { fontSize: 12, fontFamily: fontFamily.medium },

  // Terms (now as notice text below button)
  termsNotice: {
    fontSize: 12, color: colors.disabled, textAlign: 'center',
    marginTop: 12, lineHeight: 16, fontFamily: fontFamily.regular,
  },
  termsLink: { color: colors.primaryMid, textDecorationLine: 'underline' },

  // Trust signals
  trustRow: {
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center',
    marginTop: 16, gap: 16, flexWrap: 'wrap',
  },
  trustItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  trustText: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.regular },

  // Buttons
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
    flexDirection: 'row',
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

  // Error (audit P2: borda esquerda vermelha para acessibilidade daltonismo)
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10, borderRadius: borderRadius.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    marginBottom: 4, marginTop: 8,
  },
  errorText: { color: '#dc2626', fontSize: 13, fontFamily: fontFamily.regular, flex: 1 },

  // Success
  successIconCircle: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: '#f0fdf4',
    alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 16,
  },
  successText: {
    fontSize: 14, color: colors.textSecondary, textAlign: 'center',
    lineHeight: 21, marginBottom: 8, fontFamily: fontFamily.regular,
  },
  successHint: {
    fontSize: 12, color: colors.disabled, textAlign: 'center',
    marginBottom: 24, fontFamily: fontFamily.regular,
  },

  // Modals
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, maxWidth: 500, width: '100%', maxHeight: '80%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text },
  modalScroll: { marginBottom: 16 },
  modalText: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 20 },
  modalCloseBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, alignItems: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: fontFamily.semiBold },

  // Botão "Continuar com Google" — pattern visual recomendado pelo Google
  // (fundo branco, borda cinza clara, texto cor #3c4043, ícone à esquerda).
  googleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 48,
    marginTop: 8,
  },
  googleBtnDisabled: { opacity: 0.5 },
  googleBtnText: {
    color: '#3c4043',
    fontSize: 15,
    fontWeight: '500',
    fontFamily: fontFamily.medium,
  },
  googleHelperText: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 8,
    fontFamily: fontFamily.regular,
    lineHeight: 16,
  },
  // "Prefiro cadastrar com e-mail e senha" (abre o formulário)
  formEmailLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 20,
    paddingVertical: 10,
  },
  formEmailLinkText: {
    fontSize: 14,
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    textDecorationLine: 'underline',
  },
  // Sugestão do Google quando o e-mail digitado é @gmail.com
  gmailHint: {
    marginTop: 10,
    padding: 12,
    borderRadius: borderRadius.md,
    backgroundColor: colors.surfaceTint,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gmailHintText: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.text,
    fontFamily: fontFamily.regular,
  },
  gmailHintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dadce0',
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
  },
  // Separador "ou" entre Google e form de email/senha
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginBottom: 4,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: colors.border },
  dividerText: {
    marginHorizontal: 12,
    fontSize: 12,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
