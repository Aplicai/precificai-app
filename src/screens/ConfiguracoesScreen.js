import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const OPCOES = [
  { key: 'perfil', icon: 'user', label: 'Perfil do Negócio', desc: 'Nome, segmento e telefone', screen: 'Perfil', color: colors.primary },
  { key: 'conta', icon: 'lock', label: 'Conta e Segurança', desc: 'Alterar e-mail e senha', screen: 'ContaSeguranca', color: colors.blue },
  { key: 'kitinicio', icon: 'gift', label: 'Kit de Início', desc: 'Trocar segmento e insumos pré-cadastrados', screen: 'KitInicio', color: colors.coral },
  { key: 'sobre', icon: 'info', label: 'Sobre o App', desc: 'Versão e informações', screen: 'Sobre', color: colors.accent },
];

const BACKUP_TABLES = [
  'configuracao', 'perfil', 'categorias_insumos', 'materias_primas',
  'categorias_embalagens', 'embalagens', 'categorias_preparos', 'preparos',
  'preparo_ingredientes', 'categorias_produtos', 'produtos', 'produto_ingredientes',
  'produto_preparos', 'produto_embalagens', 'despesas_fixas', 'despesas_variaveis',
  'faturamento_mensal', 'delivery_config', 'delivery_combos', 'delivery_combo_itens',
];

export default function ConfiguracoesScreen({ navigation }) {
  const [exporting, setExporting] = useState(false);

  async function exportBackup() {
    setExporting(true);
    try {
      const db = await getDatabase();
      const backup = {};
      for (const table of BACKUP_TABLES) {
        try {
          backup[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
        } catch (e) {
          backup[table] = [];
        }
      }
      backup._meta = { date: new Date().toISOString(), version: '1.0.0' };

      if (Platform.OS === 'web') {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `precificai-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        Alert.alert('Backup exportado', 'O arquivo JSON foi baixado com sucesso.');
      } else {
        Alert.alert('Backup', 'Exportação disponível apenas na versão web por enquanto.');
      }
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível exportar o backup.');
    } finally {
      setExporting(false);
    }
  }


  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.subtitle}>Ajustes gerais do aplicativo</Text>
      {OPCOES.map((op) => (
        <TouchableOpacity
          key={op.key}
          style={styles.row}
          activeOpacity={0.7}
          onPress={() => {
            if (op.screen) {
              navigation.navigate(op.screen);
            } else {
              Alert.alert(op.label, 'Em breve!');
            }
          }}
        >
          <View style={[styles.iconBox, { backgroundColor: (op.color || colors.primary) + '12' }]}>
            <Feather name={op.icon} size={18} color={op.color || colors.primary} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>{op.label}</Text>
            <Text style={styles.rowDesc}>{op.desc}</Text>
          </View>
          <Feather name="chevron-right" size={18} color={colors.disabled} />
        </TouchableOpacity>
      ))}

      {/* Backup e Restauração */}
      <View style={styles.backupSection}>
        <View style={styles.backupHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.blue + '12' }]}>
            <Feather name="shield" size={18} color={colors.blue} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>Backup e Restauração</Text>
            <Text style={styles.rowDesc}>Salve ou restaure todos os dados do app</Text>
          </View>
        </View>

        <Text style={styles.backupDesc}>
          Exporte seus dados (insumos, produtos, configurações, etc.) como arquivo JSON para manter uma cópia de segurança.
        </Text>

        <TouchableOpacity
          style={styles.backupBtn}
          activeOpacity={0.7}
          onPress={exportBackup}
          disabled={exporting}
        >
          {exporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Feather name="download" size={16} color="#fff" />
          )}
          <Text style={styles.backupBtnText}>
            {exporting ? 'Exportando...' : 'Exportar Dados'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backupBtnOutline}
          activeOpacity={0.7}
          onPress={() => Alert.alert('Importar Dados', 'Em breve! Esta funcionalidade está em desenvolvimento.')}
        >
          <Feather name="upload" size={16} color={colors.primary} />
          <Text style={styles.backupBtnOutlineText}>Importar Dados</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>PrecificaApp v1.0.0</Text>

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40, maxWidth: 600, width: '100%', alignSelf: 'center' },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.md, textAlign: 'center' },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  iconBox: {
    width: 40, height: 40, borderRadius: borderRadius.md,
    backgroundColor: colors.inputBg, justifyContent: 'center', alignItems: 'center',
    marginRight: spacing.md,
  },
  icon: { fontSize: 18 },
  rowBody: { flex: 1 },
  rowLabel: { fontSize: fonts.regular, fontWeight: '700', color: colors.text, marginBottom: 2 },
  rowDesc: { fontSize: fonts.tiny, color: colors.textSecondary },
  chevron: { fontSize: 24, color: colors.disabled, marginLeft: spacing.sm },
  backupSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  backupHeader: {
    flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm,
  },
  backupDesc: {
    fontSize: fonts.tiny, color: colors.textSecondary, lineHeight: 18,
    marginBottom: spacing.md, marginLeft: 2,
  },
  backupBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 12, marginBottom: spacing.sm,
  },
  backupBtnText: {
    fontSize: fonts.regular, fontWeight: '700', color: '#fff',
  },
  backupBtnOutline: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: 'transparent', borderRadius: borderRadius.md,
    paddingVertical: 12, borderWidth: 1.5, borderColor: colors.primary,
  },
  backupBtnOutlineText: {
    fontSize: fonts.regular, fontWeight: '700', color: colors.primary,
  },
  version: { fontSize: fonts.tiny, color: colors.disabled, textAlign: 'center', marginTop: spacing.lg },
});
