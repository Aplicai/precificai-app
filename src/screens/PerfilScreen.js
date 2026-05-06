import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Keyboard, Pressable, TouchableOpacity, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import BackToSettings from '../components/BackToSettings';

// Multi-tenant: cada usuário tem sua chave de avatar (mesmo padrão de
// usePushPermissions). Sem userId, não persiste nada — evita vazamento entre contas.
const AVATAR_KEY_PREFIX = 'avatar_uri_';
const buildAvatarKey = (userId) => `${AVATAR_KEY_PREFIX}${userId}`;

// Aceita apenas formatos comuns de imagem; tamanho máx 2MB (validação best-effort
// via fileSize do ImagePicker quando disponível — sem expo-file-system no projeto).
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const ALLOWED_MIME_PREFIX = 'image/';

export default function PerfilScreen({ navigation, route }) {
  const isSetup = route?.params?.setup || route?.name === 'ProfileSetup';
  const { user } = useAuth();
  const [perfil, setPerfil] = useState({
    nome_negocio: '',
    segmento: '',
    telefone: '',
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  // P1: feedback visível quando o usuário tenta avançar sem nome (acessibilidade).
  const [showNameError, setShowNameError] = useState(false);
  // Avatar: uri local (file:// ou data:) persistida em AsyncStorage por usuário.
  const [avatarUri, setAvatarUri] = useState(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState(null);
  const saveTimerRef = useRef(null);
  const perfilRef = useRef(perfil);
  perfilRef.current = perfil;

  useFocusEffect(
    useCallback(() => {
      loadPerfil();
      loadAvatar();
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }, [user?.id])
  );

  async function loadAvatar() {
    if (!user?.id) {
      setAvatarUri(null);
      return;
    }
    try {
      const uri = await AsyncStorage.getItem(buildAvatarKey(user.id));
      setAvatarUri(uri || null);
    } catch (e) {
      console.error('[Perfil.avatar]', e);
      setAvatarUri(null);
    }
  }

  async function pickAvatar() {
    if (!user?.id) {
      setAvatarError('Faça login para personalizar a foto.');
      return;
    }
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        setAvatarError('Permissão de acesso à galeria negada.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });
      if (result.canceled || !result.assets || !result.assets[0]) return;

      const asset = result.assets[0];
      // Best-effort: nem toda plataforma popula mimeType / fileSize.
      if (asset.mimeType && !asset.mimeType.startsWith(ALLOWED_MIME_PREFIX)) {
        setAvatarError('Arquivo selecionado não é uma imagem.');
        return;
      }
      if (typeof asset.fileSize === 'number' && asset.fileSize > MAX_AVATAR_BYTES) {
        setAvatarError('Imagem maior que 2MB. Escolha outra.');
        return;
      }

      await AsyncStorage.setItem(buildAvatarKey(user.id), asset.uri);
      setAvatarUri(asset.uri);
    } catch (e) {
      console.error('[Perfil.avatar]', e);
      setAvatarError('Não foi possível atualizar a foto. Tente de novo.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function removeAvatar() {
    if (!user?.id) return;
    setAvatarError(null);
    setAvatarBusy(true);
    try {
      await AsyncStorage.removeItem(buildAvatarKey(user.id));
      setAvatarUri(null);
    } catch (e) {
      console.error('[Perfil.avatar]', e);
      setAvatarError('Falha ao remover a foto.');
    } finally {
      setAvatarBusy(false);
    }
  }

  async function loadPerfil() {
    try {
      setLoadError(null);
      const db = await getDatabase();
      const row = await db.getFirstAsync('SELECT * FROM perfil LIMIT 1');
      if (row) {
        setPerfil({
          nome_negocio: row.nome_negocio || '',
          segmento: row.segmento || '',
          telefone: row.telefone || '',
        });
      }
    } catch (err) {
      // Audit P0: silent catch original mascarava falhas de DB. Agora loga e
      // mostra banner para o usuário poder reagir (tentar de novo).
      console.error('[Perfil.loadPerfil]', err);
      setLoadError('Não foi possível carregar seu perfil. Toque para tentar de novo.');
    }
    setLoaded(true);
  }

  function updateField(key, value) {
    setPerfil(p => ({ ...p, [key]: value }));
    // Limpa erro de nome assim que o usuário começa a digitar.
    if (key === 'nome_negocio' && showNameError && value.trim()) {
      setShowNameError(false);
    }
    if (!loaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      autoSave({ ...perfilRef.current, [key]: value });
    }, 600);
  }

  async function autoSave(data) {
    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      // Try update first (Supabase has auto-generated id)
      const existing = await db.getFirstAsync('SELECT id FROM perfil LIMIT 1');
      if (existing) {
        await db.runAsync(
          'UPDATE perfil SET nome_negocio = ?, segmento = ?, telefone = ? WHERE id = ?',
          [data.nome_negocio, data.segmento, data.telefone, existing.id]
        );
      } else {
        await db.runAsync(
          'INSERT INTO perfil (nome_negocio, segmento, telefone) VALUES (?, ?, ?)',
          [data.nome_negocio, data.segmento, data.telefone]
        );
      }
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(null), 1500);
    } catch (e) {
      // Audit P0: autoSave silencioso fazia o usuário perder dados sem perceber.
      console.error('[Perfil.autoSave]', e);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3500);
    }
  }

  function onContinuePress() {
    if (!perfil.nome_negocio.trim()) {
      setShowNameError(true);
      return;
    }
    navigation.replace('KitInicio', { setup: true });
  }

  const inicial = (perfil.nome_negocio || 'N').charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* APP-12: voltar pra Configurações sempre visível (exceto no fluxo de setup) */}
      {!isSetup && <BackToSettings navigation={navigation} />}

      {/* Audit P0: banner de erro de carregamento (antes era silent) */}
      {loadError ? (
        <TouchableOpacity style={styles.errorBanner} onPress={loadPerfil} activeOpacity={0.8}>
          <Feather name="alert-circle" size={16} color="#dc2626" style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </TouchableOpacity>
      ) : null}

      {/* Avatar */}
      <View style={styles.avatarSection}>
        {avatarUri ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.avatarImage}
            accessibilityLabel={`Foto de perfil de ${perfil.nome_negocio || 'seu negócio'}`}
          />
        ) : (
          <View
            style={[styles.avatar, styles.avatarInitial]}
            accessibilityLabel={`Avatar com inicial ${inicial}`}
          >
            <Text style={styles.avatarInitialText}>{inicial}</Text>
          </View>
        )}
        <Text style={styles.avatarName}>{perfil.nome_negocio || 'Seu Negócio'}</Text>
        {perfil.segmento ? <Text style={styles.avatarSub}>{perfil.segmento}</Text> : null}

        <View style={styles.avatarActions}>
          <TouchableOpacity
            style={[styles.avatarBtn, avatarBusy && styles.avatarBtnDisabled]}
            onPress={pickAvatar}
            disabled={avatarBusy}
            accessibilityRole="button"
            accessibilityLabel="Trocar foto de perfil"
            activeOpacity={0.8}
          >
            <Feather name="camera" size={14} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.avatarBtnText}>Trocar foto</Text>
          </TouchableOpacity>
          {avatarUri ? (
            <TouchableOpacity
              style={[styles.avatarBtn, styles.avatarBtnGhost, avatarBusy && styles.avatarBtnDisabled]}
              onPress={removeAvatar}
              disabled={avatarBusy}
              accessibilityRole="button"
              accessibilityLabel="Remover foto de perfil"
              activeOpacity={0.8}
            >
              <Feather name="trash-2" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
              <Text style={styles.avatarBtnGhostText}>Remover</Text>
            </TouchableOpacity>
          ) : null}
        </View>
        {avatarError ? (
          <Text style={styles.avatarErrorText} accessibilityLiveRegion="polite">{avatarError}</Text>
        ) : null}
      </View>

      {/* Form */}
      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>Nome do Negócio</Text>
          <TextInput
            style={[styles.input, showNameError && styles.inputError]}
            value={perfil.nome_negocio}
            onChangeText={(v) => updateField('nome_negocio', v)}
            placeholder="Ex: Doces da Maria"
            placeholderTextColor={colors.disabled}
            accessibilityLabel="Nome do negócio"
            accessibilityHint={showNameError ? 'Campo obrigatório' : undefined}
          />
          {showNameError ? (
            <View style={styles.fieldErrorRow}>
              <Feather name="alert-circle" size={12} color="#dc2626" style={{ marginRight: 4 }} />
              <Text style={styles.fieldErrorText}>Nome do negócio é obrigatório para continuar.</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Segmento</Text>
          <TextInput
            style={styles.input}
            value={perfil.segmento}
            onChangeText={(v) => updateField('segmento', v)}
            placeholder="Ex: Confeitaria, Marmitas..."
            placeholderTextColor={colors.disabled}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Telefone / WhatsApp</Text>
          <TextInput
            style={styles.input}
            value={perfil.telefone}
            onChangeText={(v) => updateField('telefone', v)}
            placeholder="(00) 00000-0000"
            placeholderTextColor={colors.disabled}
            keyboardType="phone-pad"
          />
        </View>
      </View>

      {/* Sessão 28.22: Multi-loja — gerenciar lojas + selecionar a atual */}
      {!isSetup && <LojasSection userId={user?.id} />}

      {isSetup && (
        <TouchableOpacity
          style={styles.continueBtn}
          activeOpacity={0.8}
          onPress={onContinuePress}
          accessibilityRole="button"
          accessibilityLabel="Continuar para próxima etapa"
        >
          <Text style={styles.continueBtnText}>Continuar</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Auto-save feedback (audit P0: agora trata erro também) */}
    {saveStatus && (
      <View style={[styles.toast, saveStatus === 'error' && styles.toastError]}>
        {saveStatus === 'saving' ? (
          <>
            <Feather name="loader" size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>Salvando...</Text>
          </>
        ) : saveStatus === 'error' ? (
          <>
            <Feather name="alert-circle" size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>Falha ao salvar. Tente de novo.</Text>
          </>
        ) : (
          <>
            <Feather name="check-circle" size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>Salvo</Text>
          </>
        )}
      </View>
    )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 520, alignSelf: 'center', width: '100%' },

  avatarSection: { alignItems: 'center', paddingVertical: spacing.lg },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: colors.primary, justifyContent: 'center', alignItems: 'center',
    marginBottom: spacing.sm,
    shadowColor: colors.primary, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 8, elevation: 6,
  },
  // Variante "inicial" usa fundo translúcido (alpha 14 hex ≈ 8%) para parecer
  // chip e não competir visualmente com a foto real quando ela existe.
  avatarInitial: {
    backgroundColor: colors.primary + '14',
    shadowOpacity: 0,
    elevation: 0,
  },
  avatarInitialText: { fontSize: 32, fontWeight: '800', color: colors.primary, fontFamily: fontFamily.bold },
  avatarImage: {
    width: 80, height: 80, borderRadius: 40, marginBottom: spacing.sm,
    backgroundColor: colors.primary + '14',
  },
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff', fontFamily: fontFamily.bold },
  avatarActions: {
    flexDirection: 'row', marginTop: spacing.sm, gap: spacing.sm,
  },
  avatarBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.xs + 2,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '14',
    borderWidth: 1, borderColor: colors.primary + '33',
  },
  avatarBtnGhost: {
    backgroundColor: 'transparent',
    borderColor: colors.border,
  },
  avatarBtnDisabled: { opacity: 0.5 },
  avatarBtnText: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600' },
  avatarBtnGhostText: { color: colors.textSecondary, fontSize: fonts.small, fontFamily: fontFamily.medium },
  avatarErrorText: {
    color: '#dc2626', fontSize: fonts.tiny, marginTop: spacing.xs,
    textAlign: 'center', maxWidth: 280,
  },
  avatarName: {
    fontSize: fonts.title, fontWeight: '800', fontFamily: fontFamily.bold,
    color: colors.text, marginBottom: 2,
  },
  avatarSub: { fontSize: fonts.small, color: colors.textSecondary },

  card: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  field: { marginBottom: spacing.md },
  label: {
    fontSize: fonts.small, fontWeight: '600', color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  input: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm, fontSize: fonts.regular, color: colors.text,
  },
  // Audit P1: borda vermelha + ícone para feedback de validação acessível.
  inputError: { borderColor: '#dc2626', borderWidth: 1.5 },
  fieldErrorRow: { flexDirection: 'row', alignItems: 'center', marginTop: 6 },
  fieldErrorText: { fontSize: fonts.tiny, color: '#dc2626', fontFamily: fontFamily.medium },
  // Audit P0: banner de falha no load com borda lateral vermelha (acessibilidade daltonismo).
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fef2f2', padding: 10, borderRadius: borderRadius.sm,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    marginBottom: spacing.sm,
  },
  errorBannerText: { color: '#dc2626', fontSize: fonts.small, flex: 1, fontFamily: fontFamily.regular },
  toast: {
    // Sessão 28 — Audit mobile-web: bottom: 20 ficava encoberto pelo BottomTab (66pt).
    // 90 garante visibilidade em iOS (88), Android (66) e web mobile (66).
    position: 'absolute', bottom: 90, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  // Variante de erro do toast (audit P0).
  toastError: { backgroundColor: '#dc2626' },
  toastText: { color: '#fff', fontSize: fonts.small, fontWeight: '600' },

  continueBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.lg,
  },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
});

// ─────────────────────────────────────────────────────────────────────────────
// Sessão 28.22: Multi-loja — componente de gerenciamento + seleção da loja atual
// ─────────────────────────────────────────────────────────────────────────────
import useLojas from '../hooks/useLojas';

function LojasSection({ userId }) {
  const { lojas, currentId, current, adicionar, renomear, remover, selecionar } = useLojas(userId);
  const [novaNome, setNovaNome] = React.useState('');
  const [renameId, setRenameId] = React.useState(null);
  const [renameVal, setRenameVal] = React.useState('');

  return (
    <View style={lojasStyles.section}>
      <View style={lojasStyles.header}>
        <View style={lojasStyles.headerIcon}>
          <Feather name="home" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={lojasStyles.title}>Minhas Lojas</Text>
          <Text style={lojasStyles.subtitle}>Cadastre suas unidades e escolha a que você está usando agora</Text>
        </View>
      </View>

      {/* Loja atual em destaque */}
      {current && (
        <View style={lojasStyles.currentCard}>
          <Feather name="check-circle" size={14} color={colors.success} />
          <Text style={lojasStyles.currentText}>
            Trabalhando na loja: <Text style={{ fontFamily: fontFamily.bold, color: colors.text }}>{current.nome}</Text>
          </Text>
        </View>
      )}

      {/* Lista de lojas */}
      {lojas.length > 0 && (
        <View style={{ marginTop: spacing.sm }}>
          {lojas.map(loja => {
            const isAtual = loja.id === currentId;
            const isRenaming = renameId === loja.id;
            return (
              <View key={loja.id} style={[lojasStyles.lojaRow, isAtual && lojasStyles.lojaRowAtual]}>
                {isRenaming ? (
                  <>
                    <TextInput
                      style={lojasStyles.input}
                      value={renameVal}
                      onChangeText={setRenameVal}
                      autoFocus
                      placeholder="Nome da loja"
                      onSubmitEditing={async () => {
                        if (renameVal.trim()) await renomear(loja.id, renameVal.trim());
                        setRenameId(null); setRenameVal('');
                      }}
                    />
                    <TouchableOpacity onPress={async () => {
                      if (renameVal.trim()) await renomear(loja.id, renameVal.trim());
                      setRenameId(null); setRenameVal('');
                    }}>
                      <Feather name="check" size={18} color={colors.success} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setRenameId(null); setRenameVal(''); }}>
                      <Feather name="x" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <TouchableOpacity
                      style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      onPress={() => !isAtual && selecionar(loja.id)}
                      activeOpacity={0.7}
                    >
                      <View style={[
                        lojasStyles.radio,
                        isAtual && { backgroundColor: colors.primary, borderColor: colors.primary },
                      ]}>
                        {isAtual && <View style={lojasStyles.radioInner} />}
                      </View>
                      <Text style={[lojasStyles.lojaName, isAtual && { fontFamily: fontFamily.bold }]} numberOfLines={1}>
                        {loja.nome}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => { setRenameId(loja.id); setRenameVal(loja.nome); }} style={{ padding: 6 }}>
                      <Feather name="edit-2" size={14} color={colors.textSecondary} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => remover(loja.id)} style={{ padding: 6 }}>
                      <Feather name="trash-2" size={14} color={colors.error} />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Adicionar loja */}
      <View style={lojasStyles.addRow}>
        <TextInput
          style={lojasStyles.input}
          placeholder="Nome da nova loja (ex: Filial Centro)"
          placeholderTextColor={colors.disabled}
          value={novaNome}
          onChangeText={setNovaNome}
          onSubmitEditing={async () => {
            if (novaNome.trim()) {
              await adicionar(novaNome.trim());
              setNovaNome('');
            }
          }}
        />
        <TouchableOpacity
          style={[lojasStyles.addBtn, !novaNome.trim() && { opacity: 0.5 }]}
          onPress={async () => {
            if (novaNome.trim()) {
              await adicionar(novaNome.trim());
              setNovaNome('');
            }
          }}
          disabled={!novaNome.trim()}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={16} color="#fff" />
          <Text style={{ color: '#fff', fontFamily: fontFamily.bold }}>Adicionar</Text>
        </TouchableOpacity>
      </View>

      {/* Aviso sobre roadmap */}
      <View style={lojasStyles.note}>
        <Feather name="info" size={12} color={colors.textSecondary} />
        <Text style={lojasStyles.noteText}>
          Por enquanto, a seleção de loja é apenas um marcador visual. A separação completa de dados (insumos, produtos etc) por loja vem na próxima atualização.
        </Text>
      </View>
    </View>
  );
}

const lojasStyles = StyleSheet.create({
  section: {
    backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, marginTop: spacing.lg,
  },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  headerIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, marginTop: 2 },
  currentCard: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.success + '14', padding: 10,
    borderRadius: borderRadius.sm, marginTop: spacing.sm,
  },
  currentText: { fontSize: fonts.small, color: '#065F46' },
  lojaRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 10, paddingHorizontal: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  lojaRowAtual: { backgroundColor: colors.primary + '06' },
  radio: {
    width: 18, height: 18, borderRadius: 9,
    borderWidth: 2, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  lojaName: { fontSize: fonts.regular, color: colors.text, flex: 1 },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: 10, paddingVertical: 8, fontSize: fonts.regular, color: colors.text,
    backgroundColor: '#fff',
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: spacing.md },
  addBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.primary, paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: borderRadius.sm,
  },
  note: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    marginTop: spacing.sm, padding: 8,
    backgroundColor: colors.background, borderRadius: borderRadius.sm,
  },
  noteText: { flex: 1, fontSize: 11, color: colors.textSecondary, lineHeight: 15 },
});
