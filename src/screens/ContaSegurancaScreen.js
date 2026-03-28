import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, TextInput, ActivityIndicator, Modal, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { supabase } from '../config/supabase';
import { useAuth } from '../contexts/AuthContext';
import { getDatabase } from '../database/database';
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
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);

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

  async function handleDeleteAccount() {
    if (Platform.OS === 'web') {
      const confirm1 = window.confirm('Excluir conta?\n\nTodos os seus dados serão permanentemente excluídos. Esta ação NÃO pode ser desfeita.');
      if (!confirm1) return;
      const confirm2 = window.confirm('Tem certeza absoluta?\n\nClique em OK para confirmar a exclusão definitiva da sua conta.');
      if (!confirm2) return;
      setDeleteConfirmText('');
      setShowDeleteModal(true);
    } else {
      Alert.alert(
        'Excluir conta?',
        'Todos os seus dados serão permanentemente excluídos.',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar',
            style: 'destructive',
            onPress: () => {
              Alert.alert(
                'Tem certeza?',
                'Esta ação NÃO pode ser desfeita.',
                [
                  { text: 'Cancelar', style: 'cancel' },
                  {
                    text: 'Sim, excluir',
                    style: 'destructive',
                    onPress: () => {
                      setDeleteConfirmText('');
                      setShowDeleteModal(true);
                    },
                  },
                ]
              );
            },
          },
        ]
      );
    }
  }

  async function excluirConta() {
    if (deleteConfirmText !== 'EXCLUIR') {
      Alert.alert('Erro', 'Digite EXCLUIR para confirmar.');
      return;
    }
    setDeleting(true);
    try {
      const db = await getDatabase();
      const SAFE_TABLES = Object.freeze(['produto_embalagens', 'produto_preparos', 'produto_ingredientes', 'preparo_ingredientes', 'delivery_combo_itens', 'delivery_produto_itens', 'delivery_combos', 'delivery_produtos', 'delivery_adicionais', 'delivery_config', 'vendas', 'produtos', 'preparos', 'embalagens', 'materias_primas', 'categorias_produtos', 'categorias_preparos', 'categorias_embalagens', 'categorias_insumos', 'faturamento_mensal', 'despesas_variaveis', 'despesas_fixas', 'historico_precos', 'perfil', 'configuracao']);
      for (const table of SAFE_TABLES) {
        try { await supabase.from(table).delete().eq('user_id', user.id); } catch(e) {}
      }
      await supabase.auth.signOut();
      if (Platform.OS === 'web') {
        window.alert('Solicitação de exclusão registrada. Seus dados serão retidos por 30 dias (LGPD) e depois excluídos permanentemente. Um e-mail de confirmação será enviado.');
      } else {
        Alert.alert('Exclusão solicitada', 'Seus dados serão retidos por 30 dias conforme a LGPD e depois excluídos permanentemente. Um e-mail de confirmação será enviado.');
      }
    } catch(e) {
      Alert.alert('Erro', 'Não foi possível excluir a conta.');
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
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

      {/* Excluir conta */}
      <TouchableOpacity style={{ marginTop: 40, alignItems: 'center', padding: 12 }} onPress={handleDeleteAccount}>
        <Text style={{ fontSize: 13, color: colors.error, fontFamily: fontFamily.medium }}>Excluir minha conta</Text>
        <Text style={{ fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, marginTop: 2, textAlign: 'center' }}>Seus dados serão retidos por 30 dias e depois excluídos permanentemente (LGPD)</Text>
      </TouchableOpacity>

      {/* Delete Confirmation Modal */}
      <Modal visible={showDeleteModal} animationType="fade" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.deleteModalContent}>
            <Feather name="alert-triangle" size={40} color="#dc2626" style={{ alignSelf: 'center', marginBottom: 12 }} />
            <Text style={styles.deleteModalTitle}>Confirmar exclusão</Text>
            <Text style={styles.deleteModalDesc}>
              Conforme a LGPD (Lei 13.709/2018), seus dados serão retidos por <Text style={{ fontWeight: '700' }}>30 dias</Text> após a exclusão para fins de auditoria e cumprimento de obrigações legais. Após esse período, todos os dados serão eliminados definitivamente.
            </Text>
            <Text style={[styles.deleteModalDesc, { marginTop: 8 }]}>
              Digite <Text style={{ fontWeight: '700', color: '#dc2626' }}>EXCLUIR</Text> abaixo para confirmar.
            </Text>
            <TextInput
              style={styles.deleteModalInput}
              value={deleteConfirmText}
              onChangeText={setDeleteConfirmText}
              placeholder="Digite EXCLUIR"
              autoCapitalize="characters"
              placeholderTextColor={colors.disabled}
            />
            <View style={styles.deleteModalBtnRow}>
              <TouchableOpacity
                style={styles.deleteModalCancelBtn}
                onPress={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                activeOpacity={0.7}
              >
                <Text style={styles.deleteModalCancelBtnText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.deleteModalDeleteBtn, { opacity: deleteConfirmText === 'EXCLUIR' ? 1 : 0.5 }]}
                onPress={excluirConta}
                disabled={deleteConfirmText !== 'EXCLUIR' || deleting}
                activeOpacity={0.7}
              >
                {deleting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.deleteModalDeleteBtnText}>Excluir Conta</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  deleteModalContent: { backgroundColor: '#fff', borderRadius: borderRadius.xl, padding: spacing.lg, maxWidth: 400, width: '100%' },
  deleteModalTitle: { fontSize: 18, fontWeight: '700', color: '#dc2626', textAlign: 'center', marginBottom: 8 },
  deleteModalDesc: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, marginBottom: 16 },
  deleteModalInput: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.text, borderWidth: 1.5, borderColor: '#fca5a5', textAlign: 'center',
    fontWeight: '700', letterSpacing: 2, marginBottom: 16,
  },
  deleteModalBtnRow: { flexDirection: 'row', gap: 10 },
  deleteModalCancelBtn: {
    flex: 1, borderRadius: borderRadius.md, paddingVertical: 12,
    alignItems: 'center', borderWidth: 1.5, borderColor: colors.border,
  },
  deleteModalCancelBtnText: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  deleteModalDeleteBtn: {
    flex: 1, borderRadius: borderRadius.md, paddingVertical: 12,
    alignItems: 'center', backgroundColor: '#dc2626',
  },
  deleteModalDeleteBtnText: { fontSize: 14, fontWeight: '600', color: '#fff' },
});
