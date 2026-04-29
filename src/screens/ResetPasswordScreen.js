/**
 * ResetPasswordScreen — Sessão 28.9 (APP-01)
 *
 * Destino do link de reset enviado por email pelo Supabase.
 * Quando user clica no link, abre `app.precificaiapp.com/reset-password#access_token=...`
 * O Supabase Auth processa o hash automaticamente (via supabase-js) e cria uma
 * sessão temporária com `aud: 'authenticated'` + `role: 'authenticated'`.
 *
 * Esta tela verifica se há sessão ativa de recuperação e oferece o form
 * pra user definir a nova senha. Após sucesso, redireciona pra Login.
 */

import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Platform, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const MIN_PASSWORD_LENGTH = 6;

export default function ResetPasswordScreen({ navigation }) {
  const { clearPasswordRecovery } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(null); // null = checking, true/false

  useEffect(() => {
    // Detecta se há sessão de recovery (criada pelo link do email).
    // Supabase-js auto-processa o hash da URL. Esperamos um tick e
    // verificamos a session.
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!cancelled) setHasRecoverySession(!!data?.session);
      } catch {
        if (!cancelled) setHasRecoverySession(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  async function handleSubmit() {
    setError('');
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não conferem. Digite a mesma senha nos dois campos.');
      return;
    }
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setLoading(false);
      // Faz logout pra limpar a sessão de recovery, limpa flag e leva pra login
      setTimeout(async () => {
        try { await supabase.auth.signOut(); } catch {}
        try { clearPasswordRecovery && clearPasswordRecovery(); } catch {}
        navigation.replace('Login');
      }, 1500);
    } catch (e) {
      setLoading(false);
      const msg = (e && e.message) ? e.message : 'Erro ao redefinir senha';
      setError(msg);
    }
  }

  if (hasRecoverySession === null) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={styles.checkingText}>Verificando link de recuperação...</Text>
      </View>
    );
  }

  if (!hasRecoverySession) {
    return (
      <View style={styles.center}>
        <View style={styles.errorIconCircle}>
          <Feather name="alert-circle" size={32} color={colors.error} />
        </View>
        <Text style={styles.errorTitle}>Link inválido ou expirado</Text>
        <Text style={styles.errorDesc}>
          Este link de recuperação não é mais válido. Pode ter expirado ou já ter sido usado.
        </Text>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={async () => {
            try { await supabase.auth.signOut(); } catch {}
            try { clearPasswordRecovery && clearPasswordRecovery(); } catch {}
            navigation.replace('ForgotPassword');
          }}
          activeOpacity={0.7}
        >
          <Text style={styles.btnPrimaryText}>Pedir novo link</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={async () => {
          try { await supabase.auth.signOut(); } catch {}
          try { clearPasswordRecovery && clearPasswordRecovery(); } catch {}
          navigation.replace('Login');
        }} style={{ marginTop: 12 }}>
          <Text style={styles.linkText}>Voltar para login</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (done) {
    return (
      <View style={styles.center}>
        <View style={styles.successIconCircle}>
          <Feather name="check" size={32} color="#fff" />
        </View>
        <Text style={styles.successTitle}>Senha redefinida!</Text>
        <Text style={styles.successDesc}>Você será redirecionado pro login em segundos...</Text>
        <ActivityIndicator color={colors.primary} style={{ marginTop: spacing.md }} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.card}>
        <View style={styles.iconCircle}>
          <Feather name="lock" size={24} color={colors.primary} />
        </View>
        <Text style={styles.title}>Redefinir senha</Text>
        <Text style={styles.desc}>Crie uma nova senha pra sua conta. Use no mínimo {MIN_PASSWORD_LENGTH} caracteres.</Text>

        <Text style={styles.label}>Nova senha</Text>
        <View style={styles.inputWrap}>
          <TextInput
            value={password}
            onChangeText={(v) => { setPassword(v); if (error) setError(''); }}
            secureTextEntry={!showPassword}
            style={styles.input}
            placeholder="Mínimo 6 caracteres"
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
            <Feather name={showPassword ? 'eye-off' : 'eye'} size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>Confirme a nova senha</Text>
        <TextInput
          value={confirm}
          onChangeText={(v) => { setConfirm(v); if (error) setError(''); }}
          secureTextEntry={!showPassword}
          style={styles.input}
          placeholder="Digite a senha novamente"
          autoCapitalize="none"
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity
          style={[styles.btnPrimary, loading && { opacity: 0.6 }]}
          onPress={handleSubmit}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnPrimaryText}>Redefinir senha</Text>}
        </TouchableOpacity>

        <TouchableOpacity onPress={async () => {
          try { await supabase.auth.signOut(); } catch {}
          try { clearPasswordRecovery && clearPasswordRecovery(); } catch {}
          navigation.replace('Login');
        }} style={{ marginTop: 16, alignSelf: 'center' }}>
          <Text style={styles.linkText}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: spacing.md, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg, backgroundColor: colors.background },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.lg, padding: spacing.lg, maxWidth: 420, width: '100%', alignSelf: 'center' },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md, alignSelf: 'center' },
  title: { fontSize: fonts.title, fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center', marginBottom: 6 },
  desc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 18 },
  label: { fontSize: fonts.small, color: colors.textSecondary, fontFamily: fontFamily.semiBold, marginBottom: 6, marginTop: spacing.sm },
  inputWrap: { position: 'relative' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.md, paddingHorizontal: spacing.sm + 2, paddingVertical: 12, fontSize: fonts.regular, color: colors.text, backgroundColor: colors.surface, minHeight: 48 },
  eyeBtn: { position: 'absolute', right: 8, top: 12, padding: 6 },
  errorText: { fontSize: fonts.small, color: colors.error, marginTop: spacing.sm, textAlign: 'center' },
  btnPrimary: { backgroundColor: colors.primary, borderRadius: borderRadius.md, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', marginTop: spacing.md, minHeight: 48 },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular },
  linkText: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, textAlign: 'center' },
  errorIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.error + '12', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  errorTitle: { fontSize: fonts.title, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 6, textAlign: 'center' },
  errorDesc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.lg, lineHeight: 18, maxWidth: 320 },
  successIconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.md },
  successTitle: { fontSize: fonts.title, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 6 },
  successDesc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center' },
  checkingText: { marginTop: spacing.sm, color: colors.textSecondary, fontSize: fonts.small },
});
