import React, { useState, useRef, useMemo, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import zxcvbn from 'zxcvbn';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useListDensity from '../hooks/useListDensity';
import useRateLimit from '../hooks/useRateLimit';
import { mapAuthError } from '../utils/authErrors';
import { parseRateLimitSeconds } from '../utils/parseRateLimit';

const MIN_PASSWORD_LENGTH = 6;
// Score mínimo do zxcvbn (0-4) para permitir cadastro. 2 = "razoável".
const MIN_PASSWORD_SCORE = 2;

// Mapa de cores e rótulos por nível de força (0=muito fraca → 4=excelente).
// Usa paleta do theme: error (vermelho) → warning (coral) → success (verde).
const STRENGTH_LEVELS = [
  { label: 'Muito fraca', color: colors.error },
  { label: 'Fraca',       color: colors.error },
  { label: 'Razoável',    color: colors.warning },
  { label: 'Boa',         color: colors.primaryMid },
  { label: 'Excelente',   color: colors.success },
];

// Traduz os feedbacks padrão do zxcvbn (en) para PT-BR. Cobre os mais comuns;
// fallback retorna a string original caso a chave não esteja mapeada.
const FEEDBACK_PT = {
  'Use a few words, avoid common phrases': 'Use algumas palavras, evite frases comuns',
  'No need for symbols, digits, or uppercase letters': 'Não é necessário usar símbolos, dígitos ou maiúsculas',
  'Add another word or two. Uncommon words are better.': 'Adicione mais uma ou duas palavras. Palavras incomuns são melhores.',
  'Straight rows of keys are easy to guess': 'Sequências do teclado são fáceis de adivinhar',
  'Short keyboard patterns are easy to guess': 'Padrões curtos do teclado são fáceis de adivinhar',
  'Use a longer keyboard pattern with more turns': 'Use um padrão de teclado mais longo e variado',
  'Repeats like "aaa" are easy to guess': 'Repetições como "aaa" são fáceis de adivinhar',
  'Repeats like "abcabcabc" are only slightly harder to guess than "abc"': 'Repetições como "abcabcabc" são quase tão fáceis quanto "abc"',
  'Avoid repeated words and characters': 'Evite palavras e caracteres repetidos',
  'Sequences like abc or 6543 are easy to guess': 'Sequências como abc ou 6543 são fáceis de adivinhar',
  'Avoid sequences': 'Evite sequências',
  'Recent years are easy to guess': 'Anos recentes são fáceis de adivinhar',
  'Avoid recent years': 'Evite anos recentes',
  'Avoid years that are associated with you': 'Evite anos associados a você',
  'Dates are often easy to guess': 'Datas são geralmente fáceis de adivinhar',
  'Avoid dates and years that are associated with you': 'Evite datas e anos associados a você',
  'This is a top-10 common password': 'Esta é uma das 10 senhas mais comuns',
  'This is a top-100 common password': 'Esta é uma das 100 senhas mais comuns',
  'This is a very common password': 'Esta é uma senha muito comum',
  'This is similar to a commonly used password': 'Esta senha é similar a uma muito comum',
  'A word by itself is easy to guess': 'Uma palavra isolada é fácil de adivinhar',
  'Names and surnames by themselves are easy to guess': 'Nomes e sobrenomes isolados são fáceis de adivinhar',
  'Common names and surnames are easy to guess': 'Nomes e sobrenomes comuns são fáceis de adivinhar',
  'Capitalization doesn\'t help very much': 'Usar maiúsculas não ajuda muito',
  'All-uppercase is almost as easy to guess as all-lowercase': 'Tudo em maiúscula é quase tão fácil quanto tudo em minúscula',
  'Reversed words aren\'t much harder to guess': 'Palavras invertidas não são muito mais difíceis',
  'Predictable substitutions like \'@\' instead of \'a\' don\'t help very much': 'Substituições previsíveis como "@" no lugar de "a" não ajudam muito',
  'Add another word or two. Uncommon words are better': 'Adicione mais uma ou duas palavras. Palavras incomuns são melhores',
};
const translateFeedback = (msg) => (msg ? (FEEDBACK_PT[msg] || msg) : '');

export default function RegisterScreen({ navigation }) {
  const { signUp } = useAuth();
  const rateLimit = useRateLimit();
  const { isCompact, inputHeight, buttonHeight } = useListDensity();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  // Countdown (segundos) para rate-limit retornado pelo Supabase.
  // Quando > 0, desabilita o botão e exibe "Aguarde Xs para tentar novamente".
  const [retryIn, setRetryIn] = useState(0);
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

  // P2 quick-win: limpa erro ao digitar (evita feedback "preso" depois de corrigir)
  const onChangeEmail = (v) => { if (error) setError(''); setEmail(v); };
  const onChangePassword = (v) => { if (error) setError(''); setPassword(v); };

  // Avalia força da senha com zxcvbn. useMemo evita reprocessar a cada render
  // (zxcvbn não é leve — ~400KB de dicionário); só recalcula quando a senha muda.
  const passwordStrength = useMemo(() => {
    if (!password) return null;
    const result = zxcvbn(password);
    return {
      score: result.score, // 0..4
      warning: translateFeedback(result.feedback?.warning),
      suggestions: (result.feedback?.suggestions || []).map(translateFeedback),
    };
  }, [password]);

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
    if (password.length < MIN_PASSWORD_LENGTH) {
      // Audit P1: não expor regra exata (security through ambiguity ajuda contra brute-force)
      setError('Senha muito curta. Use uma senha mais segura para proteger sua conta.');
      return;
    }
    // Bloqueio por força (zxcvbn): exige score mínimo "razoável" (2).
    // Defesa em profundidade: complementa o limite de comprimento contra senhas
    // longas porém previsíveis (ex.: "password123", "qwerty12345").
    if (passwordStrength && passwordStrength.score < MIN_PASSWORD_SCORE) {
      setError('Senha muito fraca — tente combinar letras, números e símbolos.');
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
              Enviamos um link de confirmação para{' '}
              <Text style={{ fontFamily: fontFamily.semiBold, color: colors.text }}>{email}</Text>.
              {'\n\n'}Clique no link para ativar sua conta e começar a usar.
            </Text>
            <Text style={styles.successHint}>Não encontrou? Verifique a pasta de spam.</Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace('Login')} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Ir para Login</Text>
              <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
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
              placeholder="Crie uma senha segura"
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              returnKeyType="done"
              onSubmitEditing={handleRegister}
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

          {/* Indicador de força da senha — só aparece quando há texto digitado */}
          {passwordStrength ? (
            <View style={styles.strengthWrap}>
              <View
                style={styles.strengthBarTrack}
                accessibilityRole="progressbar"
                accessibilityLabel="Força da senha"
                accessibilityValue={{ min: 0, max: 4, now: passwordStrength.score }}
              >
                <View
                  style={[
                    styles.strengthBarFill,
                    {
                      // Largura proporcional ao score (0=20%, 4=100%) para sempre haver
                      // pelo menos algum preenchimento visual quando há texto.
                      width: `${((passwordStrength.score + 1) / 5) * 100}%`,
                      backgroundColor: STRENGTH_LEVELS[passwordStrength.score].color,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.strengthLabel, { color: STRENGTH_LEVELS[passwordStrength.score].color }]}>
                {STRENGTH_LEVELS[passwordStrength.score].label}
              </Text>
              {/* Dicas só quando ainda fraca (< Boa). Acima disso, evita poluir UI. */}
              {passwordStrength.score < 3 && (passwordStrength.warning || passwordStrength.suggestions.length > 0) ? (
                <View style={styles.strengthFeedback}>
                  {passwordStrength.warning ? (
                    <Text style={styles.strengthWarning}>{passwordStrength.warning}</Text>
                  ) : null}
                  {passwordStrength.suggestions.map((s, i) => (
                    <Text key={i} style={styles.strengthSuggestion}>• {s}</Text>
                  ))}
                </View>
              ) : null}
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
                '8. CONTATO\nPara questões sobre privacidade: suporte@precificaiapp.com\n\n' +
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

  // Indicador de força da senha (zxcvbn)
  strengthWrap: { marginTop: 8 },
  strengthBarTrack: {
    height: 6, backgroundColor: colors.border, borderRadius: 3, overflow: 'hidden',
  },
  strengthBarFill: { height: '100%', borderRadius: 3 },
  strengthLabel: {
    fontSize: 12, fontFamily: fontFamily.medium, marginTop: 4,
  },
  strengthFeedback: { marginTop: 4 },
  strengthWarning: {
    fontSize: 12, color: colors.warning, fontFamily: fontFamily.medium, marginBottom: 2,
  },
  strengthSuggestion: {
    fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 16,
  },

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
});
