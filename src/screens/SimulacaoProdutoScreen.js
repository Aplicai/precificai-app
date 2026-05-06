/**
 * SimulacaoProdutoScreen — Sessão 28.20
 *
 * Tela DEDICADA de simulação de preço produto×plataforma. Acessada ao tocar
 * em uma célula da Visão Geral / Lote.
 *
 * Diferença pro modal "Como calculado": permite EDITAR um novo preço de venda
 * e PERSISTIR (em produto_preco_delivery) com 1 clique.
 *
 * Fluxo:
 *   1. User clica numa célula da Visão Geral
 *   2. Cai aqui mostrando: produto + plataforma + composição completa
 *   3. Input "Quanto quero cobrar" pré-preenchido com sugestão da margem do financeiro
 *   4. Botão "Salvar como meu preço delivery" → persiste em produto_preco_delivery
 */
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { Alert } from 'react-native';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  formatCurrency, calcCustoIngrediente, calcCustoPreparo,
  getDivisorRendimento,
} from '../utils/calculations';
import { calcSugestaoDeliveryCompleta } from '../utils/deliveryPricing';
import { buildContextoFinanceiro } from '../utils/deliveryAdapter';
// Sessão 28.26: service unificado de upsert do preço delivery
import { upsertPrecoDelivery } from '../services/precoDeliveryService';

const safe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Sessão 28.21: também export como conteúdo pra ser usado em Modal/Popup.
// Aceita props produtoId/plataformaId/onClose/onSaved pra modo popup.
// Sessão 28.25: onSaved é invocado APÓS persistir no DB → parent reload sem reabrir popup.
export function SimulacaoProdutoContent({ produtoId: pidProp, plataformaId: platProp, onClose, onSaved, isPopup = false }) {
  const navigation = useNavigation();
  const produtoId = pidProp;
  const plataformaId = platProp;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [data, setData] = useState(null);
  const [precoEscolhido, setPrecoEscolhido] = useState('');
  const [precoSalvo, setPrecoSalvo] = useState(null);

  // Sessão 28.25: em modo popup usamos useEffect (não useFocusEffect) — o popup
  // não desfocaliza/refocaliza ao trocar produtoId/plataformaId; o parent só
  // remonta o componente quando o usuário toca em outra célula. useFocusEffect
  // gera race condition: ao trocar o par produto/plataforma, a chamada antiga
  // continua rodando e pode sobrescrever o data novo com data antigo.
  useEffect(() => {
    if (isPopup) {
      let cancelled = false;
      (async () => {
        await carregar();
        if (cancelled) return; // reentrância: descarta resultado se trocou de produto/plataforma
      })();
      return () => { cancelled = true; };
    }
  }, [produtoId, plataformaId, isPopup]);

  // Modo navegação tradicional (não-popup) usa useFocusEffect padrão.
  useFocusEffect(useCallback(() => {
    if (!isPopup) carregar();
  }, [produtoId, plataformaId, isPopup]));

  async function carregar() {
    if (!produtoId || !plataformaId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const db = await getDatabase();
      const [prods, plats, cfgRows, fixasRows, varsRows, fatRows, ingsRows, prepsRows, embsRows, ppdRows] = await Promise.all([
        db.getAllAsync('SELECT * FROM produtos WHERE id = ?', [produtoId]),
        db.getAllAsync('SELECT * FROM delivery_config WHERE id = ?', [plataformaId]),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT valor FROM despesas_fixas'),
        db.getAllAsync('SELECT descricao, percentual FROM despesas_variaveis'),
        db.getAllAsync('SELECT valor FROM faturamento_mensal WHERE valor > 0'),
        db.getAllAsync('SELECT pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.produto_id = ?', [produtoId]),
        db.getAllAsync('SELECT pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id WHERE pp.produto_id = ?', [produtoId]),
        db.getAllAsync('SELECT pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id WHERE pe.produto_id = ?', [produtoId]),
        db.getAllAsync('SELECT preco_venda FROM produto_preco_delivery WHERE produto_id = ? AND plataforma_id = ?', [produtoId, plataformaId]).catch(() => []),
      ]);

      const prod = prods?.[0];
      const plat = plats?.[0];
      if (!prod || !plat) {
        setLoading(false);
        return;
      }

      // CMV
      const custoIng = (ingsRows || []).reduce((a, i) => a + calcCustoIngrediente(safe(i.preco_por_kg), i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);
      const custoPr = (prepsRows || []).reduce((a, pp) => a + calcCustoPreparo(safe(pp.custo_por_kg), pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
      const custoEmb = (embsRows || []).reduce((a, e) => a + safe(e.preco_unitario) * safe(e.quantidade_utilizada), 0);
      const cmv = (custoIng + custoPr + custoEmb) / getDivisorRendimento(prod);

      // Sessão 28.26: usa builder unificado (substitui ~10 linhas duplicadas)
      const contexto = buildContextoFinanceiro({
        cfgRows, fixasRows, varsRows, fatRows,
        options: { usarLucroDelivery: true },
      });

      // Sugestão pela margem do financeiro
      const sugFinanceiro = calcSugestaoDeliveryCompleta({ cmv, plat, contexto });

      // Sessão 28.26 BUG FIX (mesmo do SimuladorLote 28.25): MARGEM IGUAL
      // estava usando margemBruta como lucroPerc → custos contados 2x.
      // Agora usa lucro líquido REAL do balcão.
      const precoBalcao = safe(prod.preco_venda);
      const margemBrutaBalcao = precoBalcao > 0
        ? Math.max(0, (precoBalcao - cmv) / precoBalcao)
        : 0;
      const lucroPercBalcaoReal = Math.max(
        0,
        margemBrutaBalcao - contexto.fixoPerc - contexto.variavelPerc
      );
      const sugMantemMargem = (precoBalcao > 0 && lucroPercBalcaoReal > 0)
        ? calcSugestaoDeliveryCompleta({ cmv, plat, contexto: { ...contexto, lucroPerc: lucroPercBalcaoReal } })
        : null;

      setData({
        prod, plat, cmv, contexto, sugFinanceiro, sugMantemMargem,
        margemBrutaBalcao, lucroPercBalcaoReal,
        // Mantém `margemAtual` por compat com código de UI a jusante
        margemAtual: margemBrutaBalcao,
      });

      // Preço atual salvo
      const ppdAtual = ppdRows?.[0];
      if (ppdAtual?.preco_venda > 0) {
        setPrecoSalvo(ppdAtual.preco_venda);
        setPrecoEscolhido(String(ppdAtual.preco_venda.toFixed(2)).replace('.', ','));
      } else if (sugFinanceiro?.preco > 0) {
        setPrecoEscolhido(String(sugFinanceiro.preco.toFixed(2)).replace('.', ','));
      }
    } catch (e) {
      console.error('[SimulacaoProduto.carregar]', e);
    } finally {
      setLoading(false);
    }
  }

  async function salvarComoPrecoDelivery() {
    const num = parseFloat(String(precoEscolhido).replace(',', '.'));
    if (!Number.isFinite(num) || num <= 0) return;
    setSaving(true);
    try {
      // Sessão 28.26: delegado pro service unificado.
      const db = await getDatabase();
      const r = await upsertPrecoDelivery(db, { produtoId, plataformaId, precoVenda: num });
      if (!r.ok) throw new Error(r.error || 'Falha ao salvar preço delivery');
      setPrecoSalvo(num);
      setSavedFlash(true);
      // Sessão 28.25: notifica o pai ANTES de fechar pra ele recarregar precosCadastrados.
      // Antes: parent só reagia a useFocusEffect — o que NÃO dispara em popup, então
      // a coluna "MEU PREÇO" só atualizava se o usuário recarregasse a página.
      if (onSaved) {
        try { onSaved({ produtoId, plataformaId, precoVenda: num }); } catch {}
      }
      // Sessão 28.23: se está em popup, fecha automaticamente após salvar (UX melhor)
      if (isPopup && onClose) {
        setTimeout(() => { onClose(); }, 800);
      } else {
        setTimeout(() => setSavedFlash(false), 2500);
      }
    } catch (e) {
      console.error('[SimulacaoProduto.salvar]', e);
      Alert.alert?.('Erro', 'Não foi possível salvar o preço delivery: ' + (e?.message || 'erro desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}><ActivityIndicator color={colors.primary} size="large" /></View>;
  }
  if (!data) {
    return (
      <View style={[styles.container, { padding: spacing.lg }]}>
        <Text style={{ color: colors.textSecondary }}>Produto ou plataforma não encontrados.</Text>
      </View>
    );
  }

  const { prod, plat, cmv, contexto, sugFinanceiro, sugMantemMargem, margemAtual, lucroPercBalcaoReal } = data;
  // Sessão 28.27: lucro LÍQUIDO em R$ no balcão (pra dar evidência concreta ao user)
  const precoBalcaoNum = safe(prod.preco_venda);
  const lucroLiqBalcaoR = precoBalcaoNum > 0
    ? precoBalcaoNum * (lucroPercBalcaoReal || 0)
    : 0;
  const numEscolhido = parseFloat(String(precoEscolhido).replace(',', '.'));
  const precoValido = Number.isFinite(numEscolhido) && numEscolhido > 0;

  // Composição com o preço escolhido (igual à do simulador)
  const valFixos = precoValido ? numEscolhido * (contexto.fixoPerc || 0) : 0;
  const valImposto = precoValido ? numEscolhido * (contexto.impostoPerc || 0) : 0;
  // Sessão 28.23: usa fallback comissao_app ?? taxa_plataforma (UI escreve em comissao_app)
  const comissaoPct = safe(plat?.comissao_app ?? plat?.taxa_plataforma) / 100;
  const valComissao = precoValido ? numEscolhido * comissaoPct : 0;
  const cupomR = safe(plat?.embalagem_extra);
  const freteR = safe(plat?.taxa_entrega);
  const totalGastos = cmv + valFixos + valImposto + valComissao + cupomR + freteR;
  const lucroLiquido = precoValido ? numEscolhido - totalGastos : 0;
  const margemLiquida = precoValido && numEscolhido > 0 ? lucroLiquido / numEscolhido : 0;

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>{prod.nome}</Text>
          <Text style={styles.subtitle}>Simulação no <Text style={{ fontFamily: fontFamily.bold, color: colors.text }}>{plat.plataforma}</Text></Text>
        </View>

        {/* Tooltip estratégia */}
        <View style={styles.tooltip}>
          <Feather name="info" size={14} color="#92400E" style={{ marginTop: 2 }} />
          <Text style={styles.tooltipText}>
            <Text style={{ fontFamily: fontFamily.bold }}>Estratégia: </Text>
            avalie o preço como parte do conjunto. Itens vitrine podem ter margem menor pra atrair pedidos.
          </Text>
        </View>

        {/* KPI atual */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>CMV</Text>
            <Text style={styles.kpiValue}>{formatCurrency(cmv)}</Text>
          </View>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>Preço balcão</Text>
            <Text style={styles.kpiValue}>{formatCurrency(safe(prod.preco_venda))}</Text>
            {/* Sessão 28.27: clareza — mostra lucro LÍQUIDO em R$ + % (não margem bruta) */}
            <Text style={styles.kpiSub}>
              Lucro líq.: {formatCurrency(lucroLiqBalcaoR)} ({(lucroPercBalcaoReal * 100).toFixed(1)}%)
            </Text>
          </View>
          {precoSalvo && (
            <View style={[styles.kpiCard, { backgroundColor: colors.primary + '12' }]}>
              <Text style={styles.kpiLabel}>Preço salvo</Text>
              <Text style={[styles.kpiValue, { color: colors.primary }]}>{formatCurrency(precoSalvo)}</Text>
            </View>
          )}
        </View>

        {/* Sugestões — Sessão 28.21: copy mais claro */}
        <Text style={styles.sectionTitle}>Toque numa sugestão pra usar como base:</Text>
        <View style={styles.sugRow}>
          <TouchableOpacity
            style={[styles.sugCard, { borderColor: colors.primary }]}
            onPress={() => sugMantemMargem?.preco && setPrecoEscolhido(String(sugMantemMargem.preco.toFixed(2)).replace('.', ','))}
            activeOpacity={0.7}
            disabled={!sugMantemMargem?.preco}
          >
            {/* Sessão 28.27: rotulado por LUCRO LÍQUIDO real (não margem bruta).
                Antes dizia "MESMA MARGEM DO BALCÃO" + "X% de lucro" usando margemAtual
                (margem bruta) → user via 66.7% aqui mas 10.8% na composição → confusão. */}
            <Text style={[styles.sugLabel, { color: colors.primary }]}>MESMO LUCRO LÍQUIDO</Text>
            <Text style={styles.sugSub}>
              Pra ter {formatCurrency(lucroLiqBalcaoR)} de lucro por venda ({(lucroPercBalcaoReal * 100).toFixed(1)}%) — mesmo do balcão
            </Text>
            <Text style={[styles.sugPrice, { color: colors.primary }]}>
              {sugMantemMargem?.validacao?.ok ? formatCurrency(sugMantemMargem.preco) : '—'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sugCard, { borderColor: colors.success }]}
            onPress={() => sugFinanceiro?.preco && setPrecoEscolhido(String(sugFinanceiro.preco.toFixed(2)).replace('.', ','))}
            activeOpacity={0.7}
            disabled={!sugFinanceiro?.preco}
          >
            <Text style={[styles.sugLabel, { color: colors.success }]}>MARGEM DO FINANCEIRO</Text>
            <Text style={styles.sugSub}>Pra atingir o lucro {((contexto.lucroPerc || 0) * 100).toFixed(1)}% que você definiu nas configurações</Text>
            <Text style={[styles.sugPrice, { color: colors.success }]}>
              {sugFinanceiro?.validacao?.ok ? formatCurrency(sugFinanceiro.preco) : '—'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Input preço escolhido */}
        <Text style={[styles.sectionTitle, { marginTop: spacing.lg }]}>Quanto eu quero cobrar?</Text>
        <View style={styles.inputBox}>
          <Text style={{ fontSize: 18, fontFamily: fontFamily.bold, color: colors.text, marginRight: 8 }}>R$</Text>
          <TextInput
            style={styles.priceInput}
            value={precoEscolhido}
            onChangeText={setPrecoEscolhido}
            placeholder="0,00"
            keyboardType="numeric"
            selectTextOnFocus
          />
        </View>

        {/* Composição com preço escolhido */}
        {precoValido && (
          <View style={styles.compCard}>
            <Text style={styles.compTitle}>Composição com este preço:</Text>
            {[
              { label: 'Preço cobrado', val: numEscolhido, color: colors.text, bold: true },
              { label: 'CMV (insumos + embalagem)', val: -cmv, color: colors.error },
              { label: `Custos fixos (${((contexto.fixoPerc || 0) * 100).toFixed(1)}%)`, val: -valFixos, color: colors.error },
              { label: `Imposto (${((contexto.impostoPerc || 0) * 100).toFixed(1)}%)`, val: -valImposto, color: colors.error },
              { label: `Comissão plataforma (${(comissaoPct * 100).toFixed(1)}%)`, val: -valComissao, color: colors.error },
              ...(cupomR > 0 ? [{ label: 'Cupom recorrente', val: -cupomR, color: colors.error }] : []),
              ...(freteR > 0 ? [{ label: 'Frete subsidiado', val: -freteR, color: colors.error }] : []),
            ].map((row, i) => (
              <View key={i} style={styles.compRow}>
                <Text style={[styles.compLabel, row.bold && { fontFamily: fontFamily.bold, color: colors.text }]}>{row.label}</Text>
                <Text style={[styles.compVal, row.bold && { fontFamily: fontFamily.bold }, { color: row.color || colors.text }]}>
                  {row.val < 0 ? '-' : ''}{formatCurrency(Math.abs(row.val))}
                </Text>
              </View>
            ))}
            <View style={styles.compTotalRow}>
              <Text style={styles.compTotalLabel}>Lucro líquido /un</Text>
              <Text style={[styles.compTotalVal, { color: lucroLiquido >= 0 ? colors.success : colors.error }]}>
                {formatCurrency(lucroLiquido)}
              </Text>
            </View>
            <View style={styles.compRow}>
              <Text style={styles.compLabel}>Margem líquida</Text>
              <Text style={[styles.compVal, { fontFamily: fontFamily.bold, color: margemLiquida >= 0.10 ? colors.success : margemLiquida >= 0 ? colors.warning : colors.error }]}>
                {(margemLiquida * 100).toFixed(1)}%
              </Text>
            </View>
            {/* Sessão 28.27: comparação direta com balcão pra dar evidência ao user */}
            {precoBalcaoNum > 0 && (
              <View style={[styles.compRow, { paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4 }]}>
                <Text style={[styles.compLabel, { fontStyle: 'italic' }]}>vs balcão (lucro líq.)</Text>
                <Text style={[styles.compVal, { fontStyle: 'italic', color: colors.textSecondary }]}>
                  {formatCurrency(lucroLiqBalcaoR)} ({(lucroPercBalcaoReal * 100).toFixed(1)}%)
                </Text>
              </View>
            )}
            {lucroLiquido < 0 && (
              <Text style={styles.alertText}>
                ⚠️ Você teria PREJUÍZO cobrando este valor. Aumente o preço ou reduza custos.
              </Text>
            )}
          </View>
        )}

        {/* Salvar */}
        <TouchableOpacity
          style={[styles.saveBtn, (!precoValido || saving) && { opacity: 0.6 }]}
          onPress={salvarComoPrecoDelivery}
          disabled={!precoValido || saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.saveBtnText}>
                {precoSalvo ? 'Atualizar meu preço delivery' : 'Salvar como meu preço delivery'}
              </Text>
            </>
          )}
        </TouchableOpacity>

        {savedFlash && (
          <View style={styles.flashOK}>
            <Feather name="check-circle" size={14} color={colors.success} />
            <Text style={{ color: colors.success, fontSize: fonts.small, fontFamily: fontFamily.medium }}>
              Preço salvo! A Visão Geral já reflete esse valor.
            </Text>
          </View>
        )}

        <View style={{ height: 60 }} />
      </ScrollView>
    </View>
  );
}

// Wrapper pra rota antiga (continua funcionando se alguém navega via deep-link)
export default function SimulacaoProdutoScreen({ route }) {
  return (
    <SimulacaoProdutoContent
      produtoId={route?.params?.produtoId}
      plataformaId={route?.params?.plataformaId}
      isPopup={false}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 720, alignSelf: 'center', width: '100%' },
  header: { marginBottom: spacing.md },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, marginTop: 4 },
  tooltip: {
    flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 8,
    padding: 10, marginBottom: spacing.md, gap: 8,
    borderLeftWidth: 3, borderLeftColor: '#F59E0B',
  },
  tooltipText: { flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 },
  kpiRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.md },
  kpiCard: {
    flex: 1, backgroundColor: colors.surface, padding: spacing.sm,
    borderRadius: borderRadius.md, alignItems: 'center',
  },
  kpiLabel: { fontSize: 10, color: colors.textSecondary, marginBottom: 2 },
  kpiValue: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.text },
  kpiSub: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm },
  sugRow: { flexDirection: 'row', gap: 10 },
  sugCard: {
    flex: 1, backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, borderWidth: 2, alignItems: 'center',
  },
  sugLabel: { fontSize: 10, fontFamily: fontFamily.bold, letterSpacing: 0.5 },
  sugSub: { fontSize: 10, color: colors.textSecondary, marginTop: 2 },
  sugPrice: { fontSize: 22, fontFamily: fontFamily.bold, marginTop: 6 },
  inputBox: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface,
    paddingHorizontal: spacing.md, paddingVertical: 4,
    borderRadius: borderRadius.md, borderWidth: 1.5, borderColor: colors.primary,
  },
  priceInput: { flex: 1, fontSize: 24, fontFamily: fontFamily.bold, color: colors.text, paddingVertical: 12 },
  compCard: {
    backgroundColor: colors.surface, padding: spacing.md,
    borderRadius: borderRadius.md, marginTop: spacing.md,
  },
  compTitle: { fontSize: fonts.small, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 8 },
  compRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  compLabel: { fontSize: 12, color: colors.textSecondary, flex: 1 },
  compVal: { fontSize: 12, fontFamily: fontFamily.medium, color: colors.text },
  compTotalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    borderTopWidth: 1.5, borderTopColor: colors.border, marginTop: 8, paddingTop: 10,
  },
  compTotalLabel: { fontSize: 13, fontFamily: fontFamily.bold, color: colors.text },
  compTotalVal: { fontSize: 18, fontFamily: fontFamily.bold },
  alertText: { fontSize: 11, color: colors.error, marginTop: 8, fontStyle: 'italic' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.primary, paddingVertical: 14,
    borderRadius: borderRadius.md, marginTop: spacing.lg,
  },
  saveBtnText: { color: '#fff', fontSize: fonts.regular, fontFamily: fontFamily.bold },
  flashOK: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.success + '14', padding: 10,
    borderRadius: borderRadius.sm, marginTop: spacing.sm,
  },
});
