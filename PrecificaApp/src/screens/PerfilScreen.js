import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Keyboard, Pressable, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

export default function PerfilScreen({ navigation, route }) {
  const isSetup = route?.params?.setup || route?.name === 'ProfileSetup';
  const [perfil, setPerfil] = useState({
    nome_negocio: '',
    segmento: '',
    telefone: '',
  });
  const [saveStatus, setSaveStatus] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const perfilRef = useRef(perfil);
  perfilRef.current = perfil;

  useFocusEffect(
    useCallback(() => {
      loadPerfil();
      return () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      };
    }, [])
  );

  async function loadPerfil() {
    try {
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
    }
    setLoaded(true);
  }

  function updateField(key, value) {
    setPerfil(p => ({ ...p, [key]: value }));
    if (!loaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      autoSave({ ...perfilRef.current, [key]: value });
    }, 600);
  }

  async function autoSave(data) {
    setSaveStatus('saving');
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
  }

  const inicial = (perfil.nome_negocio || 'N').charAt(0).toUpperCase();

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* Avatar */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{inicial}</Text>
        </View>
        <Text style={styles.avatarName}>{perfil.nome_negocio || 'Seu Negócio'}</Text>
        {perfil.segmento ? <Text style={styles.avatarSub}>{perfil.segmento}</Text> : null}
      </View>

      {/* Form */}
      <View style={styles.card}>
        <View style={styles.field}>
          <Text style={styles.label}>Nome do Negócio</Text>
          <TextInput
            style={styles.input}
            value={perfil.nome_negocio}
            onChangeText={(v) => updateField('nome_negocio', v)}
            placeholder="Ex: Doces da Maria"
            placeholderTextColor={colors.disabled}
          />
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

      {isSetup && (
        <TouchableOpacity
          style={[styles.continueBtn, !perfil.nome_negocio.trim() && styles.continueBtnDisabled]}
          disabled={!perfil.nome_negocio.trim()}
          activeOpacity={0.8}
          onPress={() => navigation.replace('KitInicio', { setup: true })}
        >
          <Text style={styles.continueBtnText}>Continuar</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>

    {/* Auto-save feedback */}
    {saveStatus && (
      <View style={styles.toast}>
        {saveStatus === 'saving' ? (
          <>
            <Feather name="loader" size={13} color="#fff" style={{ marginRight: 6 }} />
            <Text style={styles.toastText}>Salvando...</Text>
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
  avatarText: { fontSize: 32, fontWeight: '800', color: '#fff', fontFamily: fontFamily.bold },
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
  toast: {
    position: 'absolute', bottom: 20, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.primary, borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4, elevation: 4,
  },
  toastText: { color: '#fff', fontSize: fonts.small, fontWeight: '600' },

  continueBtn: {
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: spacing.lg,
  },
  continueBtnDisabled: { opacity: 0.4 },
  continueBtnText: { color: '#fff', fontSize: 16, fontWeight: '600', fontFamily: fontFamily.semiBold },
});
