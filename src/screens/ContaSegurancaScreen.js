import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { useAuth } from '../contexts/AuthContext';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

export default function ContaSegurancaScreen({ navigation }) {
  const { user } = useAuth();
  const [section, setSection] = useState(null); // 'email' | 'senha' | null
  const [newEmail, setNewEmail] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');
  const [currentPass, setCurrentPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrentPass, setShowCurrentPass] = useState(false);
  const [showNewPass, setShowNewPass] = useState(false);

  async function handleUpdateEmail() {
    if (!newEmail.trim() || !newEmail.includes('@')) {
      Alert.alert('Erro', 'Informe um e-mail válido.');
      return;
    }
    if (newEmail.trim().toLowerCase() !== confirmEmail.trim().toLowerCase()) {
      Alert.alert('Erro', 'Os e-mails não coincidem. Digite o mesmo e-mail nos dois campos.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      Alert.alert('Sucesso', 'Um e-mail de confirmação foi enviado para o novo endereço e para o endereço atual. Verifique ambas as caixas de entrada.');
      setNewEmail('');
      setConfirmEmail('');
      setSection(null);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível alterar o e-mail.');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdatePassword() {
    if (newPass.length < 8) {
      Alert.alert('Erro', 'A nova senha deve ter no mínimo 8 caracteres.');
      return;
    }
    if (!/[A-Z]/.test(newPass) || !/[a-z]/.test(newPass) || !/[0-9]/.test(newPass)) {
      Alert.alert('Erro', 'A senha deve conter letras maiúsculas, minúsculas e números.');
      return;
    }
    if (newPass !== confirmPass) {
      Alert.alert('Erro', 'As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      // Verify current password first
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: currentPass,
      });
      if (signInError) {
        Alert.alert('Erro', 'Senha atual incorreta.');
        setLoading(false);
        return;
      }
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) throw error;
      Alert.alert('Sucesso', 'Senha alterada com sucesso!');
      setCurrentPass('');
      setNewPass('');
      setConfirmPass('');
      setSection(null);
    } catch (err) {
      Alert.alert('Erro', err.message || 'Não foi possível alterar a senha.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Current email info */}
      <View style={styles.infoCard}>
        <Feather name="mail" size={18} color={colors.primary} />
        <View style={{ marginLeft: spacing.sm, flex: 1 }}>
          <Text style={styles.infoLabel}>E-mail atual</Text>
          <Text style={styles.infoValue}>{user?.email || '—'}</Text>
        </View>
      </View>

      {/* Change Email */}
      <TouchableOpacity
        style={[styles.optionCard, section === 'email' && styles.optionCardActive]}
        activeOpacity={0.7}
        onPress={() => setSection(section === 'email' ? null : 'email')}
      >
        <View style={styles.optionHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.blue + '12' }]}>
            <Feather name="at-sign" size={18} color={colors.blue} />
          </View>
          <Text style={styles.optionTitle}>Alterar E-mail</Text>
          <Feather name={section === 'email' ? 'chevron-up' : 'chevron-down'} size={18} color={colors.disabled} />
        </View>
      </TouchableOpacity>
      {section === 'email' && (
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Novo e-mail</Text>
          <TextInput
            style={styles.input}
            value={newEmail}
            onChangeText={setNewEmail}
            placeholder="novo@email.com"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={colors.disabled}
          />
          <Text style={styles.fieldLabel}>Confirmar novo e-mail</Text>
          <TextInput
            style={styles.input}
            value={confirmEmail}
            onChangeText={setConfirmEmail}
            placeholder="Repita o novo e-mail"
            keyboardType="email-address"
            autoCapitalize="none"
            placeholderTextColor={colors.disabled}
          />
          <Text style={styles.hint}>Será enviado um e-mail de confirmação para o novo endereço e para o endereço atual.</Text>
          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleUpdateEmail}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Confirmar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Change Password */}
      <TouchableOpacity
        style={[styles.optionCard, section === 'senha' && styles.optionCardActive]}
        activeOpacity={0.7}
        onPress={() => setSection(section === 'senha' ? null : 'senha')}
      >
        <View style={styles.optionHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.coral + '12' }]}>
            <Feather name="key" size={18} color={colors.coral} />
          </View>
          <Text style={styles.optionTitle}>Alterar Senha</Text>
          <Feather name={section === 'senha' ? 'chevron-up' : 'chevron-down'} size={18} color={colors.disabled} />
        </View>
      </TouchableOpacity>
      {section === 'senha' && (
        <View style={styles.formCard}>
          <Text style={styles.fieldLabel}>Senha atual</Text>
          <View style={styles.passRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={currentPass}
              onChangeText={setCurrentPass}
              placeholder="••••••••"
              secureTextEntry={!showCurrentPass}
              placeholderTextColor={colors.disabled}
            />
            <TouchableOpacity onPress={() => setShowCurrentPass(!showCurrentPass)} style={styles.eyeBtn}>
              <Feather name={showCurrentPass ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Nova senha</Text>
          <View style={styles.passRow}>
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={newPass}
              onChangeText={setNewPass}
              placeholder="Mín. 8 caracteres"
              secureTextEntry={!showNewPass}
              placeholderTextColor={colors.disabled}
            />
            <TouchableOpacity onPress={() => setShowNewPass(!showNewPass)} style={styles.eyeBtn}>
              <Feather name={showNewPass ? 'eye-off' : 'eye'} size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <Text style={styles.fieldLabel}>Confirmar nova senha</Text>
          <TextInput
            style={styles.input}
            value={confirmPass}
            onChangeText={setConfirmPass}
            placeholder="Repita a nova senha"
            secureTextEntry={!showNewPass}
            placeholderTextColor={colors.disabled}
          />

          <Text style={styles.hint}>A senha deve ter no mínimo 8 caracteres, com letras maiúsculas, minúsculas e números.</Text>

          <TouchableOpacity
            style={[styles.saveBtn, loading && { opacity: 0.6 }]}
            onPress={handleUpdatePassword}
            disabled={loading}
          >
            {loading ? <ActivityIndicator size="small" color="#fff" /> : (
              <>
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.saveBtnText}>Alterar Senha</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40, maxWidth: 600, alignSelf: 'center', width: '100%' },
  infoCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  infoLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium },
  infoValue: { fontSize: fonts.body, color: colors.text, fontFamily: fontFamily.semiBold, marginTop: 2 },
  optionCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: 2,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1,
  },
  optionCardActive: { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
  optionHeader: { flexDirection: 'row', alignItems: 'center' },
  iconBox: { width: 36, height: 36, borderRadius: borderRadius.sm, justifyContent: 'center', alignItems: 'center', marginRight: spacing.sm },
  optionTitle: { flex: 1, fontSize: fonts.body, fontFamily: fontFamily.semiBold, color: colors.text },
  formCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    borderTopLeftRadius: 0, borderTopRightRadius: 0,
    padding: spacing.md, marginBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  fieldLabel: { fontSize: 12, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: 4, marginTop: spacing.sm },
  input: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    padding: 12, fontSize: fonts.body, fontFamily: fontFamily.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
  },
  passRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyeBtn: { padding: 8 },
  hint: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 6, lineHeight: 16 },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: 12, marginTop: spacing.md,
  },
  saveBtnText: { color: '#fff', fontSize: fonts.body, fontFamily: fontFamily.semiBold },
});
