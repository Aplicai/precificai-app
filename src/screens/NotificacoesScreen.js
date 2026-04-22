/**
 * NotificacoesScreen (M1-33)
 *
 * Tela em /Mais para o usuário gerenciar quais notifs quer receber:
 *  - Estoque baixo (diário 8h)
 *  - Margem crítica (após reajuste, imediato)
 *  - Resumo diário (20h)
 */
import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import { getNotifPrefs, saveNotifPrefs, requestAndRegisterPush, isPushSupported } from '../services/push';

export default function NotificacoesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState({
    estoque_baixo: true,
    margem_critica: true,
    resumo_diario: false,
  });
  const [pushAtivo, setPushAtivo] = useState(false);

  const carregar = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    try {
      const p = await getNotifPrefs(user.id);
      if (p) setPrefs({
        estoque_baixo: !!p.estoque_baixo,
        margem_critica: !!p.margem_critica,
        resumo_diario: !!p.resumo_diario,
      });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  function toggle(k) {
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    saveNotifPrefs(user.id, next).catch(() => {});
  }

  async function ativarPush() {
    const r = await requestAndRegisterPush(user.id);
    if (r.granted && r.token) {
      setPushAtivo(true);
      Alert.alert('Notificações ativadas', 'Você passará a receber alertas configurados abaixo.');
    } else {
      Alert.alert('Permissão negada', 'Habilite notificações nas configurações do sistema para receber alertas.');
    }
  }

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ padding: spacing.md }}>
      {!isPushSupported() && Platform.OS === 'web' && (
        <View style={styles.notice}>
          <Feather name="info" size={16} color={colors.info} />
          <Text style={styles.noticeText}>
            Notificações push em navegadores chegam na próxima versão. Por enquanto, só no app instalado.
          </Text>
        </View>
      )}

      {isPushSupported() && !pushAtivo && (
        <TouchableOpacity style={styles.activateBtn} onPress={ativarPush} activeOpacity={0.8}>
          <Feather name="bell" size={18} color="#fff" />
          <Text style={styles.activateText}>Ativar notificações</Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle}>Tipos de notificação</Text>

      <Item
        icon="package"
        title="Estoque baixo"
        desc="Avisamos quando algum insumo ou embalagem ficar abaixo do mínimo definido."
        value={prefs.estoque_baixo}
        onChange={() => toggle('estoque_baixo')}
      />
      <Item
        icon="alert-triangle"
        title="Margem crítica"
        desc="Quando um produto ficar com margem abaixo de 5%, te avisamos imediatamente."
        value={prefs.margem_critica}
        onChange={() => toggle('margem_critica')}
      />
      <Item
        icon="bar-chart-2"
        title="Resumo diário"
        desc="Toda noite, um pequeno resumo de vendas e lucro do dia."
        value={prefs.resumo_diario}
        onChange={() => toggle('resumo_diario')}
      />

      <Text style={styles.help}>
        Você pode mudar essas preferências a qualquer momento. As mudanças entram em vigor na próxima notificação programada.
      </Text>
    </ScrollView>
  );
}

function Item({ icon, title, desc, value, onChange }) {
  return (
    <View style={styles.item}>
      <View style={styles.itemIcon}>
        <Feather name={icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.itemTitle}>{title}</Text>
        <Text style={styles.itemDesc}>{desc}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.border, true: colors.primary + '60' }}
        thumbColor={value ? colors.primary : '#fff'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notice: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.info + '12', padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.md,
  },
  noticeText: {
    flex: 1, fontSize: fonts.small, color: colors.text,
    fontFamily: fontFamily.regular, lineHeight: 18,
  },
  activateBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, paddingVertical: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.md,
  },
  activateText: {
    color: '#fff', fontSize: fonts.regular,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
  sectionTitle: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
    marginVertical: spacing.sm, marginLeft: spacing.xs,
  },
  item: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.sm,
  },
  itemIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '14',
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.md,
  },
  itemTitle: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  itemDesc: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 2, lineHeight: 16,
  },
  help: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, lineHeight: 16,
    marginTop: spacing.lg, paddingHorizontal: spacing.sm, textAlign: 'center',
  },
});
