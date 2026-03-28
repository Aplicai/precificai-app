import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import useRateLimit from '../hooks/useRateLimit';

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
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      setError('A senha deve ter no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e caractere especial (!@#$%...)');
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
            <Text style={styles.successIcon}>✓</Text>
            <Text style={styles.cardTitle}>Conta criada!</Text>
            <Text style={styles.successText}>
              Enviamos um link de confirmação para {email}. Verifique sua caixa de entrada e clique no link para ativar sua conta.
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
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Criar Conta</Text>
          <Text style={styles.cardSubtitle}>Comece gratuitamente com até 5 produtos</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="Mín. 8 caracteres, maiúscula, número e especial"
            secureTextEntry
            placeholderTextColor={colors.disabled}
          />

          <Text style={styles.label}>Confirmar Senha</Text>
          <TextInput
            style={styles.input}
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            placeholder="Repita a senha"
            secureTextEntry
            placeholderTextColor={colors.disabled}
          />

          <TouchableOpacity
            style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: 12, marginBottom: 8 }}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            activeOpacity={0.7}
          >
            <View style={{
              width: 20, height: 20, borderRadius: 4,
              borderWidth: 2, borderColor: acceptedTerms ? colors.primary : colors.border,
              backgroundColor: acceptedTerms ? colors.primary : 'transparent',
              alignItems: 'center', justifyContent: 'center', marginRight: 10, marginTop: 2,
            }}>
              {acceptedTerms && <Feather name="check" size={14} color="#fff" />}
            </View>
            <Text style={{ flex: 1, fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 18 }}>
              Li e aceito os{' '}
              <Text style={{ color: colors.primary, textDecorationLine: 'underline' }} onPress={() => setShowTerms(true)}>
                Termos de Uso
              </Text>
              {' '}e a{' '}
              <Text style={{ color: colors.primary, textDecorationLine: 'underline' }} onPress={() => setShowPrivacy(true)}>
                Política de Privacidade
              </Text>
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.primaryBtn, { marginTop: 24, opacity: acceptedTerms ? 1 : 0.5 }]} onPress={handleRegister} disabled={loading || !acceptedTerms} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.primaryBtnText}>Criar Conta Grátis</Text>
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
            <Text style={styles.modalTitle}>Termos de Uso</Text>
            <ScrollView style={styles.modalScroll}>
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
            <Text style={styles.modalTitle}>Política de Privacidade</Text>
            <ScrollView style={styles.modalScroll}>
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
  inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: 40, maxWidth: 420, alignSelf: 'center', width: '100%' },
  card: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, paddingTop: 28 },
  cardTitle: { fontSize: 22, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center' },
  cardSubtitle: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: 6, marginBottom: 16, fontFamily: fontFamily.regular },
  label: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, fontFamily: fontFamily.regular, color: colors.text, borderWidth: 1, borderColor: colors.border,
  },
  primaryBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
  registerRow: { flexDirection: 'row', justifyContent: 'center', marginTop: 20 },
  registerText: { fontSize: 14, color: colors.textSecondary, fontFamily: fontFamily.regular },
  registerLink: { fontSize: 14, color: colors.primary, fontWeight: '600', fontFamily: fontFamily.semiBold },
  errorText: { backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 13, padding: 10, borderRadius: borderRadius.sm, textAlign: 'center', marginBottom: 8, marginTop: 8 },
  successIcon: { fontSize: 48, color: colors.success, textAlign: 'center', marginBottom: 12 },
  successText: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 24, fontFamily: fontFamily.regular },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, maxWidth: 500, width: '100%', maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center', marginBottom: 16 },
  modalScroll: { marginBottom: 16 },
  modalText: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular, lineHeight: 20 },
  modalCloseBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 12, alignItems: 'center' },
  modalCloseBtnText: { color: '#fff', fontSize: 15, fontWeight: '600', fontFamily: fontFamily.semiBold },
});
