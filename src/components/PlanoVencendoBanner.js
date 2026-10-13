/**
 * PlanoVencendoBanner — lembrete de renovação do plano anual (Pix).
 *
 * No mensal o cartão renova sozinho. No anual não há débito automático: o Asaas
 * envia a cobrança por e-mail e SMS e, se o cliente não pagar, o plano cai para
 * o grátis no vencimento. Este aviso aparece nos 15 dias anteriores e abre a
 * escolha de plano: renovar o anual no Pix ou passar para o mensal no cartão.
 *
 * A cobrança é criada na hora do clique. A primeira versão procurava a fatura
 * que o Asaas gera sozinho, e o botão ficava sem ter o que abrir quando ela
 * ainda não existia. Quando o novo pagamento entra, o webhook remove a
 * assinatura antiga para não haver cobrança em dobro.
 *
 * Não tem botão de fechar de propósito: perder o plano por esquecimento é pior
 * que ver o aviso por alguns dias, e ele some sozinho quando o pagamento entra.
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import usePlan from '../hooks/usePlan';
import { calcAvisoVencimento, textoPrazo } from '../utils/avisoVencimento';
import UpgradeModal from './UpgradeModal';
import { UPGRADE_HIGHLIGHTS } from '../config/plans';
import { spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

export default function PlanoVencendoBanner() {
  const { planCiclo, planStatus, planExpiresAt } = usePlan();
  const [escolhendo, setEscolhendo] = useState(false);

  const aviso = calcAvisoVencimento({ ciclo: planCiclo, status: planStatus, expiresAt: planExpiresAt });
  if (!aviso) return null;

  const data = aviso.venceEm.toLocaleDateString('pt-BR');

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Feather name="calendar" size={18} color="#B45309" style={{ marginRight: spacing.sm }} />
      <View style={styles.body}>
        <Text style={styles.title}>Seu plano anual {textoPrazo(aviso.dias)} ({data})</Text>
        <Text style={styles.desc}>
          Ele não renova sozinho. Sem o pagamento, a conta volta para o plano grátis. Os dias que faltam não são perdidos ao renovar agora.
        </Text>
      </View>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => setEscolhendo(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Renovar plano"
      >
        <Text style={styles.btnText}>Renovar plano</Text>
      </TouchableOpacity>

      <UpgradeModal
        visible={escolhendo}
        onClose={() => setEscolhendo(false)}
        requiredPlan="pro"
        defaultCiclo="anual"
        ctaLabel="Renovar"
        title="Renovar seu plano Pro"
        message="Escolha como quer continuar. O novo período começa quando o atual terminar."
        highlights={UPGRADE_HIGHLIGHTS}
      />
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
  btn: {
    backgroundColor: '#B45309',
    borderRadius: borderRadius.sm,
    paddingVertical: 10, paddingHorizontal: spacing.md,
    minHeight: 40, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700' },
});
