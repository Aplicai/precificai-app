import React, { useState, useEffect, useRef } from 'react';
import Constants from 'expo-constants';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useListDensity from '../hooks/useListDensity';

// Versão dinâmica via expoConfig (em vez de hardcoded — evita desync após release).
const APP_VERSION = Constants?.expoConfig?.version || Constants?.manifest?.version || '1.0.0';

// Audit P0 (Fase 2 - Fix #9): mapeia erros técnicos para mensagens amigáveis.
// NUNCA expor `e.message` cru ao usuário (pode vazar paths, stack, infos internas).
function mapBackupError(e) {
  const raw = String(e?.message || '').toLowerCase();
  if (raw.includes('quota') || raw.includes('storage')) {
    return 'Espaço insuficiente no dispositivo para salvar o backup.';
  }
  if (raw.includes('permission') || raw.includes('denied')) {
    return 'Permissão negada para salvar o arquivo.';
  }
  if (raw.includes('network') || raw.includes('failed to fetch')) {
    return 'Sem conexão com a internet. Verifique sua rede.';
  }
  if (raw.includes('timeout')) {
    return 'A operação demorou demais. Tente novamente.';
  }
  return 'Não foi possível exportar o backup. Tente novamente em instantes.';
}

const OPCOES = [
  { key: 'perfil', icon: 'user', label: 'Perfil do Negócio', desc: 'Nome, segmento e telefone', screen: 'Perfil', color: colors.primary },
  { key: 'conta', icon: 'lock', label: 'Conta e Segurança', desc: 'Alterar e-mail e senha', screen: 'ContaSeguranca', color: colors.blue },
  { key: 'kitinicio', icon: 'gift', label: 'Kit de Início', desc: 'Trocar segmento e insumos pré-cadastrados', screen: 'KitInicio', color: colors.coral },
  { key: 'sobre', icon: 'info', label: 'Sobre o App', desc: 'Versão e informações', screen: 'Sobre', color: colors.accent },
  { key: 'termos', icon: 'file-text', label: 'Termos de Uso', desc: 'Condições de uso do aplicativo', screen: 'Termos', color: colors.primary },
  { key: 'privacidade', icon: 'shield', label: 'Política de Privacidade', desc: 'Como tratamos seus dados (LGPD)', screen: 'Privacidade', color: colors.accent },
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
  const { density, setDensity } = useListDensity();

  // Audit P0 (Fase 2 - Fix #10): race-guard contra setState após unmount.
  // exportBackup pode rodar 30s+ em base grande; usuário pode trocar de tela.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Confirmação prévia antes de gerar backup. Web baixa arquivo no clique do usuário,
  // que pode ter dados sensíveis (custos, faturamento) — evita download acidental.
  function pedirConfirmacaoExport() {
    Alert.alert(
      'Exportar backup?',
      'Será gerado um arquivo JSON com todos os seus dados (insumos, produtos, configurações financeiras, vendas). Guarde em local seguro.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Exportar', onPress: exportBackup },
      ]
    );
  }

  async function exportBackup() {
    setExporting(true);
    try {
      const db = await getDatabase();
      const backup = {};
      const tabelasFaltantes = [];
      for (const table of BACKUP_TABLES) {
        try {
          backup[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
        } catch (e) {
          backup[table] = [];
          tabelasFaltantes.push(table);
          if (typeof console !== 'undefined' && console.warn) console.warn('[ConfiguracoesScreen.exportBackup] tabela ausente:', table, e?.message);
        }
      }
      backup._meta = { date: new Date().toISOString(), version: APP_VERSION, tabelasFaltantes };

      if (Platform.OS === 'web') {
        const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `precificai-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);
        const aviso = tabelasFaltantes.length > 0 ? ` (${tabelasFaltantes.length} tabela(s) sem dados)` : '';
        Alert.alert('Backup exportado', `O arquivo JSON foi baixado com sucesso.${aviso}`);
      } else {
        Alert.alert('Backup', 'Exportação disponível apenas na versão web por enquanto.');
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[ConfiguracoesScreen.exportBackup]', e);
      // Audit P0 (Fase 2 - Fix #9): nunca expor e.message cru — usar mapBackupError.
      if (isMountedRef.current) Alert.alert('Erro', mapBackupError(e));
    } finally {
      if (isMountedRef.current) setExporting(false);
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
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
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

      {/* Aparência: densidade das listas */}
      <View style={styles.aparenciaSection}>
        <View style={styles.backupHeader}>
          <View style={[styles.iconBox, { backgroundColor: colors.purple + '12' }]}>
            <Feather name="layout" size={18} color={colors.purple} />
          </View>
          <View style={styles.rowBody}>
            <Text style={styles.rowLabel}>Aparência</Text>
            <Text style={styles.rowDesc}>Densidade das listas (Insumos, Produtos, etc.)</Text>
          </View>
        </View>
        <View style={styles.densityRow}>
          <TouchableOpacity
            onPress={() => setDensity('comfortable')}
            activeOpacity={0.7}
            style={[
              styles.densityBtn,
              density === 'comfortable' && styles.densityBtnActive,
            ]}
            accessibilityRole="radio"
            accessibilityLabel="Densidade confortável"
            accessibilityState={{ selected: density === 'comfortable' }}
          >
            <Feather
              name="menu"
              size={18}
              color={density === 'comfortable' ? colors.primary : colors.textSecondary}
            />
            <Text style={[
              styles.densityBtnText,
              density === 'comfortable' && styles.densityBtnTextActive,
            ]}>Confortável</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setDensity('compact')}
            activeOpacity={0.7}
            style={[
              styles.densityBtn,
              density === 'compact' && styles.densityBtnActive,
            ]}
            accessibilityRole="radio"
            accessibilityLabel="Densidade compacta"
            accessibilityState={{ selected: density === 'compact' }}
          >
            <Feather
              name="align-justify"
              size={18}
              color={density === 'compact' ? colors.primary : colors.textSecondary}
            />
            <Text style={[
              styles.densityBtnText,
              density === 'compact' && styles.densityBtnTextActive,
            ]}>Compacto</Text>
          </TouchableOpacity>
        </View>
      </View>

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
          style={[styles.backupBtn, exporting && { opacity: 0.5 }]}
          activeOpacity={0.7}
          onPress={pedirConfirmacaoExport}
          disabled={exporting}
          accessibilityRole="button"
          accessibilityLabel={exporting ? 'Exportando dados' : 'Exportar dados'}
          accessibilityState={{ disabled: exporting, busy: exporting }}
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
          accessibilityRole="button"
          accessibilityLabel="Importar dados (em breve)"
          accessibilityHint="Funcionalidade em desenvolvimento"
        >
          <Feather name="upload" size={16} color={colors.primary} />
          <Text style={styles.backupBtnOutlineText}>Importar Dados</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.version}>PrecificaApp v{APP_VERSION}</Text>

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
  aparenciaSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginTop: spacing.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08, shadowRadius: 4, elevation: 2,
  },
  densityRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  densityBtn: {
    flex: 1,
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.md,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  densityBtnActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primary + '10',
  },
  densityBtnText: {
    marginTop: 4,
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  densityBtnTextActive: {
    color: colors.primary,
  },
});
