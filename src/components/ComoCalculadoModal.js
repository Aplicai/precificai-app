/**
 * ComoCalculadoModal — APP-19, APP-24b, APP-25 (transparência de cálculo)
 *
 * Modal acionado pelo botão "Como esse preço foi calculado?" em qualquer
 * tela que mostre preço sugerido (produto, combo, delivery).
 *
 * Recebe o objeto retornado pelas funções de `precificacao.js` e renderiza
 * a quebra completa: CMV, lucro, custos fixos, custos variáveis (com
 * subdivisão delivery quando aplicável), preço final, validação.
 *
 * Pedagogia: serve também pra ensinar o usuário a fórmula do método
 * Precificaí (markup divisor) — addresses APP-24b "tela educativa".
 */
import React from 'react';
import { View, Text, ScrollView, Modal, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

const fmt = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? x.toFixed(2).replace('.', ',') : '0,00';
};
const pct = (n) => {
  const x = Number(n);
  return Number.isFinite(x) ? (x * 100).toFixed(1).replace('.', ',') + '%' : '0%';
};

export default function ComoCalculadoModal({ visible, onClose, resultado, modo = 'balcao', titulo }) {
  if (!resultado) return null;

  const c = resultado.composicao;
  const v = resultado.validacao;
  const isInviavel = v && v.nivel === 'inviavel';
  const corValidacao =
    v?.nivel === 'inviavel' ? colors.error :
    v?.nivel === 'critico' ? colors.error :
    v?.nivel === 'aviso' ? colors.warning : colors.success;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Como esse preço foi calculado?</Text>
              {titulo ? <Text style={styles.subtitle}>{titulo}</Text> : null}
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Fechar">
              <Feather name="x" size={22} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: spacing.md }}>
            {/* Diagnóstico */}
            {v && v.mensagem ? (
              <View style={[styles.alertBox, { borderLeftColor: corValidacao, backgroundColor: corValidacao + '12' }]}>
                <Feather
                  name={v.nivel === 'ok' ? 'check-circle' : v.nivel === 'inviavel' ? 'x-circle' : 'alert-triangle'}
                  size={16}
                  color={corValidacao}
                  style={{ marginRight: 8 }}
                />
                <Text style={[styles.alertText, { color: corValidacao }]}>{v.mensagem}</Text>
              </View>
            ) : null}

            {!isInviavel && c ? (
              <>
                {/* Quebra detalhada em formato tabela */}
                <View style={styles.table}>
                  <Row label="CMV (insumos + embalagem + preparos)" value={`R$ ${fmt(c.cmv)}`} pct={pct(c.cmvPercDoPreco)} bold />
                  {c.custosAbsolutos > 0 && (
                    <Row label="+ Custos absolutos (cupons, frete subsidiado)" value={`R$ ${fmt(c.custosAbsolutos)}`} />
                  )}
                  <Row label="Lucro desejado" value={`R$ ${fmt(c.lucroR)}`} pct={pct(resultado.lucroPerc)} />
                  <Row label="Custos fixos do mês" value={`R$ ${fmt(c.fixoR)}`} pct={pct(resultado.fixoPerc)} />

                  {modo === 'delivery' && c.delivery ? (
                    <>
                      <Row label="    Imposto" value={`R$ ${fmt(c.delivery.impostoR)}`} sub />
                      <Row label="    Comissão da plataforma" value={`R$ ${fmt(c.delivery.comissaoR)}`} sub />
                      <Row label="    Taxa de pagamento online" value={`R$ ${fmt(c.delivery.taxaPagamentoOnlineR)}`} sub />
                    </>
                  ) : (
                    <Row label="Custos variáveis (imposto, maquininha)" value={`R$ ${fmt(c.variavelR)}`} pct={pct(resultado.variavelPerc)} />
                  )}

                  <View style={styles.divider} />
                  <Row label="Preço de venda sugerido" value={`R$ ${fmt(resultado.preco)}`} pct="100%" big />
                </View>

                {/* Explicação pedagógica (APP-24b) */}
                <View style={styles.explainBox}>
                  <Text style={styles.explainTitle}>Como esse cálculo funciona</Text>
                  <Text style={styles.explainText}>
                    O método Precificaí soma o lucro que você quer com seus custos fixos e variáveis em %. Esse total tem que caber em 100% do preço, junto com o CMV. A fórmula é:
                  </Text>
                  <View style={styles.formulaBox}>
                    <Text style={styles.formulaText}>
                      Preço = (CMV + custos absolutos) ÷ (1 − lucro% − fixo% − variável%)
                    </Text>
                  </View>
                  <Text style={styles.explainText}>
                    Assim você garante que cada produto vendido já paga sua parte de tudo: insumos, contas do mês, taxas, e ainda sobra o lucro que você definiu.
                  </Text>
                </View>
              </>
            ) : null}
          </ScrollView>

          <TouchableOpacity style={styles.bottomBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.bottomBtnText}>Entendi</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

function Row({ label, value, pct, bold, big, sub }) {
  return (
    <View style={[styles.row, sub && { paddingVertical: 4 }]}>
      <Text style={[styles.rowLabel, bold && styles.rowLabelBold, big && styles.rowLabelBig, sub && styles.rowLabelSub]} numberOfLines={2}>
        {label}
      </Text>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowValue, bold && styles.rowValueBold, big && styles.rowValueBig]}>{value}</Text>
        {pct ? <Text style={styles.rowPct}>{pct}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
    maxHeight: '90%',
    minHeight: '60%',
  },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, marginTop: 2 },
  closeBtn: { padding: 6 },
  alertBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    borderLeftWidth: 3, borderRadius: borderRadius.sm,
    padding: spacing.sm, marginBottom: spacing.md,
  },
  alertText: { flex: 1, fontSize: fonts.small, lineHeight: 18, fontFamily: fontFamily.medium },
  table: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { flex: 1, fontSize: fonts.small, color: colors.text, fontFamily: fontFamily.regular, marginRight: 8 },
  rowLabelBold: { fontFamily: fontFamily.semiBold },
  rowLabelBig: { fontFamily: fontFamily.bold, fontSize: fonts.body },
  rowLabelSub: { color: colors.textSecondary, fontSize: fonts.tiny },
  rowValue: { fontSize: fonts.small, color: colors.text, fontFamily: fontFamily.semiBold },
  rowValueBold: { fontFamily: fontFamily.bold },
  rowValueBig: { fontSize: fonts.large, color: colors.primary },
  rowPct: { fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 1 },
  divider: { height: 1, backgroundColor: colors.border, marginVertical: 8 },
  explainBox: {
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.md,
    padding: spacing.md,
  },
  explainTitle: { fontSize: fonts.body, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 6 },
  explainText: { fontSize: fonts.small, color: colors.text, lineHeight: 19, marginBottom: 8 },
  formulaBox: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    marginVertical: 6,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  formulaText: {
    fontSize: fonts.small,
    fontFamily: Platform.OS === 'web' ? 'monospace' : 'Courier',
    color: colors.text,
    lineHeight: 20,
  },
  bottomBtn: {
    backgroundColor: colors.primary,
    paddingVertical: 14, paddingHorizontal: spacing.lg,
    margin: spacing.md, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center', minHeight: 48,
  },
  bottomBtnText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.body },
});
