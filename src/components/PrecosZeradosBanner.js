/**
 * PrecosZeradosBanner — Sessão 28.9
 *
 * Aviso global que aparece quando o usuário tem insumos com `valor_pago = 0`
 * (típico após aplicar um Kit de Início — os templates vêm zerados de propósito
 * pra forçar o user a colocar os preços REAIS antes de confiar nas margens).
 *
 * Comportamento:
 *  - Aparece em TODAS as telas (renderizado via StackWithBanner no AppNavigator)
 *  - Re-checa a cada `useFocusEffect` (mudança de tela)
 *  - Click → leva pra tab Insumos pra atualizar
 *  - User pode dispensar via X (preferência salva em AsyncStorage por 24h)
 */

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { getDatabase } from '../database/database';

const DISMISS_KEY = 'precos_zerados_banner_dismiss_until';

export default function PrecosZeradosBanner() {
  const navigation = useNavigation();
  const [info, setInfo] = useState(null); // { count, total }
  const [dismissed, setDismissed] = useState(false);

  useFocusEffect(useCallback(() => {
    let cancelled = false;
    (async () => {
      try {
        // 1. Checa dispensa temporária (24h)
        const until = await AsyncStorage.getItem(DISMISS_KEY);
        if (until && Date.now() < Number(until)) {
          if (!cancelled) { setDismissed(true); setInfo(null); }
          return;
        }
        if (!cancelled) setDismissed(false);

        // 2. D-26: Conta insumos zerados OU com valor estimado pelo Kit
        // (após APP-14, kit popula com valores médios + marca = '__VALOR_ESTIMADO_KIT__')
        const db = await getDatabase();
        const rows = await db.getAllAsync(
          "SELECT COUNT(*) as zerados FROM materias_primas WHERE valor_pago IS NULL OR valor_pago = 0 OR marca = '__VALOR_ESTIMADO_KIT__'"
        );
        const total = await db.getAllAsync('SELECT COUNT(*) as total FROM materias_primas');
        const count = (rows && rows[0] && (rows[0].zerados ?? rows[0].count ?? 0)) || 0;
        const totalCount = (total && total[0] && (total[0].total ?? total[0].count ?? 0)) || 0;
        if (!cancelled) {
          if (count > 0) setInfo({ count, total: totalCount });
          else setInfo(null);
        }
      } catch {
        if (!cancelled) setInfo(null);
      }
    })();
    return () => { cancelled = true; };
  }, []));

  if (dismissed || !info || info.count === 0) return null;

  function goToInsumos() {
    try {
      const parent = navigation.getParent();
      const tabNav = parent?.getParent?.() || parent;
      if (tabNav) tabNav.navigate('Insumos');
      else navigation.navigate('Insumos');
    } catch {
      navigation.navigate('Insumos');
    }
  }

  async function dismiss(e) {
    e?.stopPropagation?.();
    const until = Date.now() + (24 * 60 * 60 * 1000); // 24h
    try { await AsyncStorage.setItem(DISMISS_KEY, String(until)); } catch {}
    setDismissed(true);
  }

  return (
    <TouchableOpacity style={styles.banner} activeOpacity={0.85} onPress={goToInsumos}>
      <Feather name="alert-circle" size={16} color="#B45309" style={{ marginRight: spacing.sm }} />
      <View style={styles.body}>
        <Text style={styles.title}>
          Confira os preços dos seus insumos
          {info.total > 0 && (
            <Text style={styles.titleCount}>  ({info.count} de {info.total} estão estimados)</Text>
          )}
        </Text>
        <Text style={styles.desc}>
          Os valores do Kit são médias de mercado — ajuste com os preços reais do seu fornecedor pra ver custos e margens corretos.
        </Text>
      </View>
      <TouchableOpacity
        onPress={dismiss}
        style={styles.dismissBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Dispensar por 24h"
      >
        <Feather name="x" size={14} color="#B45309" />
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FCD34D',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
  },
  body: { flex: 1 },
  title: { fontSize: fonts.small, fontWeight: '700', color: '#B45309', marginBottom: 1 },
  titleCount: { fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: '#92400E' },
  desc: { fontSize: fonts.tiny, color: '#92400E', lineHeight: 16 },
  dismissBtn: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: spacing.xs,
  },
});
