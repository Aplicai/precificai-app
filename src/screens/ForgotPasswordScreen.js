import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { colors, spacing, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';

export default function ForgotPasswordScreen({ navigation }) {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleReset = async () => {
    if (!email.trim()) {
      setError('Digite seu email');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim().toLowerCase());
      setSent(true);
    } catch (err) {
      setError('Erro ao enviar email. Verifique o endereço.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.inner}>
        <View style={styles.card}>
          {sent ? (
            <>
              <Text style={styles.successIcon}>✉</Text>
              <Text style={styles.cardTitle}>Email enviado!</Text>
              <Text style={styles.desc}>Verifique sua caixa de entrada em {email} e siga as instruções para redefinir sua senha.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('Login')} activeOpacity={0.8}>
                <Text style={styles.primaryBtnText}>Voltar ao Login</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.cardTitle}>Recuperar Senha</Text>
              <Text style={styles.desc}>Digite seu email e enviaremos um link para redefinir sua senha.</Text>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <Text style={styles.label}>Email</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="seu@email.com"
                keyboardType="email-address"
                autoCapitalize="none"
                placeholderTextColor={colors.disabled}
              />

              <TouchableOpacity style={[styles.primaryBtn, { marginTop: 24 }]} onPress={handleReset} disabled={loading} activeOpacity={0.8}>
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.primaryBtnText}>Enviar Link</Text>}
              </TouchableOpacity>

              <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 16, alignItems: 'center' }}>
                <Text style={styles.backText}>Voltar ao Login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.primary },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, maxWidth: 420, alignSelf: 'center', width: '100%' },
  card: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, paddingTop: 28 },
  cardTitle: { fontSize: 22, fontWeight: '700', fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center', marginBottom: 8 },
  desc: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16, fontFamily: fontFamily.regular },
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
  backText: { fontSize: 14, color: colors.primary, fontFamily: fontFamily.medium },
  errorText: { backgroundColor: '#fef2f2', color: '#dc2626', fontSize: 13, padding: 10, borderRadius: borderRadius.sm, textAlign: 'center', marginBottom: 8 },
  successIcon: { fontSize: 48, textAlign: 'center', marginBottom: 12 },
});
