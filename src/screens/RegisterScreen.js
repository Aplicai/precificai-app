import React, { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal, Image } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useRateLimit from '../hooks/useRateLimit';

const PASSWORD_RULES = [
  { key: 'length', label: '8+ caracteres', test: (p) => p.length >= 8 },
  { key: 'upper', label: 'Letra maiúscula', test: (p) => /[A-Z]/.test(p) },
  { key: 'number', label: 'Número', test: (p) => /[0-9]/.test(p) },
  { key: 'special', label: 'Caractere especial', test: (p) => /[!@#$%^&*(),.?":{}|<>]/.test(p) },
];

export default function RegisterScreen({ navigation }) {
  const { signUp } = useAuth();
  const rateLimit = useRateLimit();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const passwordStrength = useMemo(() => {
    if (!password) return { passed: 0, total: PASSWORD_RULES.length, results: [] };
    const results = PASSWORD_RULES.map(r => ({ ...r, ok: r.test(password) }));
    return { passed: results.filter(r => r.ok).length, total: results.length, results };
  }, [password]);

  const allPasswordOk = passwordStrength.passed === passwordStrength.total;

  const handleRegister = async () => {
    const limitMsg = rateLimit.checkLimit();
    if (limitMsg) { setError(limitMsg); return; }
    if (!acceptedTerms) {
      setError('Você precisa aceitar os termos para criar sua conta.');
      return;
    }
    if (!email.trim() || !password.trim()) {
      setError('Preencha todos os campos');
      return;
    }
    if (!allPasswordOk) {
      setError('A senha não atende todos os requisitos');
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await signUp(email.trim().toLowerCase(), password);
      rateLimit.reset();
      setSuccess(true);
    } catch (err) {
      rateLimit.recordAttempt();
      setError('Erro ao criar conta. Verifique seus dados e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <View style={styles.container}>
        <View style={styles.inner}>
          <View style={styles.card}>
            <View style={styles.successIconCircle}>
              <Feather name="check" size={32} color={colors.success} />
            </View>
            <Text style={styles.cardTitle}>Conta criada!</Text>
            <Text style={styles.successText}>
              Enviamos um link de confirmação para <Text style={{ fontFamily: fontFamily.semiBold, color: colors.text }}>{email}</Text>. Verifique sua caixa de entrada e clique no link para ativar sua conta.
            </Text>
            <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.replace('Login')} activeOpacity={0.8}>
              <Text style={styles.primaryBtnText}>Ir para Login</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* Branding */}
        <View style={styles.logoArea}>
          <Image
            source={require('../../assets/images/logo-header-white.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.tagline}>Precificação inteligente{'\n'}para seu negócio</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Criar Conta</Text>
          <Text style={styles.cardSubtitle}>Comece gratuitamente com até 5 produtos</Text>

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
            placeholderTextColor={colors.disabled}
          />

          <Text style={styles.label}>Senha</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={password}
              onChangeText={setPassword}
              placeholder="Crie uma senha forte"
              secureTextEntry={!showPassword}
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

          {/* Password strength indicator */}
          {password.length > 0 && (
            <View style={styles.strengthBox}>
              <View style={styles.strengthBarBg}>
                {[0, 1, 2, 3].map(i => (
                  <View
                    key={i}
                    style={[
                      styles.strengthBarSegment,
                      {
                        backgroundColor: i < passwordStrength.passed
                          ? (passwordStrength.passed <= 2 ? '#F59E0B' : '#22C55E')
                          : colors.border,
                      },
                    ]}
                  />
                ))}
              </View>
              <View style={styles.strengthRules}>
                {passwordStrength.results.map(r => (
                  <View key={r.key} style={styles.strengthRule}>
                    <Feather
                      name={r.ok ? 'check-circle' : 'circle'}
                      size={12}
                      color={r.ok ? '#22C55E' : colors.disabled}
                    />
                    <Text style={[styles.strengthRuleText, r.ok && styles.strengthRuleOk]}>{r.label}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}

          <Text style={styles.label}>Confirmar Senha</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              style={styles.passwordInput}
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="Repita a senha"
              secureTextEntry={!showConfirm}
              placeholderTextColor={colors.disabled}
            />
            <TouchableOpacity
              style={styles.eyeBtn}
              onPress={() => setShowConfirm(!showConfirm)}
              activeOpacity={0.7}
            >
              <Feather name={showConfirm ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>
          {confirmPassword.length > 0 && password !== confirmPassword && (
            <Text style={styles.matchError}>As senhas não coincidem</Text>
          )}
          {confirmPassword.length > 0 && password === confirmPassword && allPasswordOk && (
            <View style={styles.matchOk}>
              <Feather name="check-circle" size={12} color="#22C55E" />
              <Text style={styles.matchOkText}>Senhas conferem</Text>
            </View>
          )}

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={styles.termsText}>
              Li e aceito os{' '}
              <Text style={styles.termsLink} onPress={() => setShowTerms(true)}>
                Termos de Uso
              </Text>
              {' '}e a{' '}
              <Text style={styles.termsLink} onPress={() => setShowPrivacy(true)}>
                Política de Privacidade
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, { marginTop: 20, opacity: acceptedTerms ? 1 : 0.5 }]}
            onPress={handleRegister}
            disabled={loading || !acceptedTerms}
            activeOpacity={0.8}
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

  // Branding
  logoArea: { alignItems: 'center', marginBottom: 24 },
  logo: { width: 160, height: 36, marginBottom: 8 },
  tagline: {
    color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: fontFamily.regular,
    textAlign: 'center', lineHeight: 19,
  },

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

  // Password strength
  strengthBox: { marginTop: 8 },
  strengthBarBg: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  strengthBarSegment: { flex: 1, height: 4, borderRadius: 2 },
  strengthRules: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  strengthRule: { flexDirection: 'row', alignItems: 'center', width: '48%', gap: 4 },
  strengthRuleText: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.disabled },
  strengthRuleOk: { color: '#22C55E' },

  // Password match
  matchError: { fontSize: 11, fontFamily: fontFamily.regular, color: colors.error, marginTop: 4 },
  matchOk: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  matchOkText: { fontSize: 11, fontFamily: fontFamily.regular, color: '#22C55E' },

  // Terms
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 16, marginBottom: 4 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: colors.border,
    backgroundColor: 'transparent',
    alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 1,
  },
  checkboxChecked: { borderColor: colors.primary, backgroundColor: colors.primary },
  termsText: { flex: 1, fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 18 },
  termsLink: { color: colors.primary, textDecorationLine: 'underline' },

  // Buttons
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: colors.textSecondary, fontFamily: fontFamily.regular },
  registerLink: { fontSize: 14, color: colors.primary, fontWeight: '600', fontFamily: fontFamily.semiBold },

  // Error
  errorBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10, borderRadius: borderRadius.sm,
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
    lineHeight: 20, marginBottom: 24, fontFamily: fontFamily.regular,
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
