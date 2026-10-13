/**
 * PlanoVencendoBanner — lembrete de renovação do plano anual (Pix).
 *
 * No mensal o cartão renova sozinho. No anual não há débito automático: o Asaas
 * envia a cobrança por e-mail e SMS e, se o cliente não pagar, o plano cai para
 * o grátis no vencimento. Este aviso aparece nos 15 dias anteriores e leva
 * direto à fatura que o Asaas já gerou.
 *
 * Não tem botão de fechar de propósito: perder o plano por esquecimento é pior
 * que ver o aviso por alguns dias, e ele some sozinho quando o pagamento entra.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import usePlan from '../hooks/usePlan';
import { calcAvisoVencimento, textoPrazo } from '../utils/avisoVencimento';
import { openRenewalInvoice } from '../services/checkout';
import { spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

export default function PlanoVencendoBanner() {
  const { planCiclo, planStatus, planExpiresAt } = usePlan();
  const [buscando, setBuscando] = useState(false);
  const [recado, setRecado] = useState('');

  const aviso = calcAvisoVencimento({ ciclo: planCiclo, status: planStatus, expiresAt: planExpiresAt });
  if (!aviso) return null;

  const data = aviso.venceEm.toLocaleDateString('pt-BR');

  const pagar = async () => {
    setRecado('');
    setBuscando(true);
    const r = await openRenewalInvoice();
    setBuscando(false);
    if (!r.ok) setRecado(r.error || 'Não foi possível buscar a cobrança agora.');
    else if (r.semFatura) setRecado('A cobrança de renovação ainda não foi gerada. Ela chega por e-mail e SMS antes do vencimento.');
  };

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Feather name="calendar" size={18} color="#B45309" style={{ marginRight: spacing.sm }} />
      <View style={styles.body}>
        <Text style={styles.title}>Seu plano anual {textoPrazo(aviso.dias)} ({data})</Text>
        <Text style={styles.desc}>
          A renovação é por Pix e não é debitada sozinha. Sem o pagamento, a conta volta para o plano grátis.
        </Text>
        {!!recado && <Text style={styles.recado}>{recado}</Text>}
      </View>
      <TouchableOpacity
        style={styles.btn}
        onPress={pagar}
        disabled={buscando}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Pagar renovação"
      >
        {buscando
          ? <ActivityIndicator size="small" color="#fff" />
          : <Text style={styles.btnText}>Pagar renovação</Text>}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap',
    backgroundColor: '#FEF3C7',
    borderWidth: 1, borderColor: '#FCD34D',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    gap: spacing.sm,
  },
  body: { flex: 1, minWidth: 220 },
  title: { fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700', color: '#B45309', marginBottom: 1 },
  desc: { fontSize: fonts.tiny, color: '#92400E', lineHeight: 16 },
  recado: { fontSize: fonts.tiny, color: '#92400E', fontFamily: fontFamily.medium, marginTop: 4 },
  btn: {
    backgroundColor: '#B45309',
    borderRadius: borderRadius.sm,
    paddingVertical: 10, paddingHorizontal: spacing.md,
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700' },
});
