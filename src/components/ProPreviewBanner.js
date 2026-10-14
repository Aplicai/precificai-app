/**
 * ProPreviewBanner — faixa fina no topo das telas Pro quando o plano é Grátis.
 *
 * Decisão do fundador (14/10/2026): quem está no Grátis VÊ as telas Pro com os
 * próprios dados — só a ação final (salvar, gerar, exportar...) pede assinatura.
 * Antes o menu interceptava o toque e abria o popup sem mostrar nada; a pessoa
 * nunca descobria o que estava comprando. Mesmo padrão já usado em
 * ExportPDFScreen (monta a ficha de graça, trava só o botão "Exportar").
 *
 * Renderiza nada quando o plano já inclui a feature.
 *
 * Props:
 *   feature  chave de FEATURE_MIN_PLAN (ex.: 'delivery')
 *   tela     nome da tela como aparece pra pessoa (ex.: "Delivery")
 *   acao     o que a assinatura libera, no infinitivo (ex.: "salvar plataformas e preços")
 */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Feather } from '@expo/vector-icons';
import usePlan from '../hooks/usePlan';
import UpgradeModal from './UpgradeModal';
import { FEATURE_MIN_PLAN, PLAN_LABELS, UPGRADE_HIGHLIGHTS } from '../config/plans';
import { spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

export default function ProPreviewBanner({ feature, tela, acao, style }) {
  const { hasFeature } = usePlan();
  const [assinando, setAssinando] = useState(false);
  if (hasFeature(feature)) return null;

  const reqPlan = FEATURE_MIN_PLAN[feature] || 'pro';
  const planLabel = PLAN_LABELS[reqPlan] || 'Pro';

  return (
    <View style={[styles.banner, style]} accessibilityRole="alert">
      <Feather name="eye" size={16} color="#B45309" />
      <Text style={styles.text}>
        Você está vendo {tela} do {planLabel} com os seus dados. Assine para {acao}.
      </Text>
      <TouchableOpacity
        style={styles.btn}
        onPress={() => setAssinando(true)}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel={`Assinar o plano ${planLabel}`}
      >
        <Text style={styles.btnText}>Assinar</Text>
      </TouchableOpacity>

      <UpgradeModal
        visible={assinando}
        onClose={() => setAssinando(false)}
        requiredPlan={reqPlan}
        title={`${tela} é um recurso ${planLabel}`}
        message={`Ver é grátis. Para ${acao}, assine:`}
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
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    gap: spacing.sm,
  },
  text: { flex: 1, minWidth: 200, fontSize: fonts.tiny, color: '#92400E', lineHeight: 16 },
  btn: {
    backgroundColor: '#B45309',
    borderRadius: borderRadius.sm,
    paddingVertical: 6, paddingHorizontal: spacing.sm,
    minHeight: 30, alignItems: 'center', justifyContent: 'center',
  },
  btnText: { color: '#fff', fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700' },
});
