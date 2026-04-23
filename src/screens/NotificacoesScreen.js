/**
 * NotificacoesScreen (M1-33)
 *
 * Tela em /Mais para o usuário gerenciar quais notifs quer receber:
 *  - Estoque baixo (diário 8h)
 *  - Margem crítica (após reajuste, imediato)
 *  - Resumo diário (20h)
 */
import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Switch, ScrollView, ActivityIndicator, TouchableOpacity, Alert, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import { getNotifPrefs, saveNotifPrefs, requestAndRegisterPush, isPushSupported } from '../services/push';

export default function NotificacoesScreen() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [activating, setActivating] = useState(false);
  const [prefs, setPrefs] = useState({
    estoque_baixo: true,
    margem_critica: true,
    resumo_diario: false,
  });
  const [pushAtivo, setPushAtivo] = useState(false);
  const isLoadingRef = useRef(false);

  const carregar = useCallback(async () => {
    if (!user?.id) { setLoading(false); return; }
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadError(null);
    try {
      const p = await getNotifPrefs(user.id);
      if (p) setPrefs({
        estoque_baixo: !!p.estoque_baixo,
        margem_critica: !!p.margem_critica,
        resumo_diario: !!p.resumo_diario,
      });
    } catch (e) {
      console.error('[NotificacoesScreen.carregar]', e);
      setLoadError('Não foi possível carregar suas preferências. Toque para tentar novamente.');
    } finally {
      setLoading(false);
      isLoadingRef.current = false;
    }
  }, [user?.id]);

  useEffect(() => { carregar(); }, [carregar]);

  async function toggle(k) {
    const prev = prefs;
    const next = { ...prefs, [k]: !prefs[k] };
    setPrefs(next);
    setSaveError(null);
    try {
      await saveNotifPrefs(user.id, next);
    } catch (e) {
      console.error('[NotificacoesScreen.toggle]', e);
      setPrefs(prev); // rollback otimista
      setSaveError('Não conseguimos salvar essa mudança. Verifique sua conexão.');
      setTimeout(() => setSaveError(null), 4000);
    }
  }

  async function ativarPush() {
    if (activating) return;
    setActivating(true);
    setSaveError(null);
    try {
      const r = await requestAndRegisterPush(user.id);
      if (r.granted && r.token) {
        setPushAtivo(true);
        Alert.alert('Notificações ativadas', 'Você passará a receber alertas configurados abaixo.');
      } else {
        Alert.alert('Permissão negada', 'Habilite notificações nas configurações do sistema para receber alertas.');
      }
    } catch (e) {
      console.error('[NotificacoesScreen.ativarPush]', e);
      setSaveError('Não foi possível ativar notificações. Tente novamente em alguns instantes.');
      setTimeout(() => setSaveError(null), 4000);
    } finally {
      setActivating(false);
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
      {loadError && (
        <TouchableOpacity
          style={styles.errorBanner}
          onPress={carregar}
          accessibilityRole="button"
          accessibilityLabel="Tentar carregar preferências novamente"
        >
          <Feather name="alert-circle" size={16} color="#dc2626" />
          <Text style={styles.errorBannerText}>{loadError}</Text>
        </TouchableOpacity>
      )}

      {saveError && (
        <View style={styles.errorBanner} accessibilityLiveRegion="polite">
          <Feather name="alert-circle" size={16} color="#dc2626" />
          <Text style={styles.errorBannerText}>{saveError}</Text>
        </View>
      )}

      {!isPushSupported() && Platform.OS === 'web' && (
        <View style={styles.notice}>
          <Feather name="info" size={16} color={colors.info} />
          <Text style={styles.noticeText}>
            Notificações push em navegadores chegam na próxima versão. Por enquanto, só no app instalado.
          </Text>
        </View>
      )}

      {isPushSupported() && !pushAtivo && (
        <TouchableOpacity
          style={[styles.activateBtn, activating && { opacity: 0.7 }]}
          onPress={ativarPush}
          activeOpacity={0.8}
          disabled={activating}
          accessibilityRole="button"
          accessibilityLabel={activating ? 'Ativando notificações, aguarde' : 'Ativar notificações push'}
          accessibilityState={{ disabled: activating, busy: activating }}
        >
          {activating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Feather name="bell" size={18} color="#fff" />
          )}
          <Text style={styles.activateText}>
            {activating ? 'Ativando...' : 'Ativar notificações'}
          </Text>
        </TouchableOpacity>
      )}

      <Text style={styles.sectionTitle} accessibilityRole="header">Tipos de notificação</Text>

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
    <View
      style={styles.item}
      accessible
      accessibilityRole="switch"
      accessibilityLabel={`${title}. ${desc}`}
      accessibilityState={{ checked: value }}
    >
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
        accessibilityLabel={`Alternar ${title}`}
        accessibilityState={{ checked: value }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errorBanner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: '#fef2f2', padding: spacing.md,
    borderRadius: borderRadius.md, marginBottom: spacing.md,
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small, color: '#991b1b',
    fontFamily: fontFamily.regular, lineHeight: 18,
  },
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
