import React from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const OPCOES = [
  { key: 'perfil', icon: 'user', label: 'Perfil do Negócio', desc: 'Nome, segmento e telefone', screen: 'Perfil', color: colors.primary },
  { key: 'conta', icon: 'lock', label: 'Conta e Segurança', desc: 'Alterar e-mail e senha', screen: 'ContaSeguranca', color: colors.blue },
  { key: 'kitinicio', icon: 'gift', label: 'Kit de Início', desc: 'Trocar segmento e insumos pré-cadastrados', screen: 'KitInicio', color: colors.coral },
  { key: 'sobre', icon: 'info', label: 'Sobre o App', desc: 'Versão e informações', screen: 'Sobre', color: colors.accent },
];

export default function ConfiguracoesScreen({ navigation }) {
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
      <Text style={styles.version}>PrecificaApp v1.0.0</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40 },
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
  version: { fontSize: fonts.tiny, color: colors.disabled, textAlign: 'center', marginTop: spacing.lg },
});
