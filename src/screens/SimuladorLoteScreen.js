/**
 * SimuladorLoteScreen — APP-28
 *
 * Simulador em lote: tabela com todos os produtos × todas as plataformas
 * ativas. Permite ver de uma vez o preço sugerido em cada plataforma e
 * comparar com o preço atual.
 *
 * Substitui o fluxo "buscar produto por produto" do SimuladorScreen
 * tradicional. Citação da testadora:
 *   "O simulador de preços no iFood eu tenho que buscar o produto.
 *    Eu tenho que buscar um produto por produto."
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  formatCurrency, calcCustoIngrediente, calcCustoPreparo,
  getDivisorRendimento, calcDespesasFixasPercentual,
} from '../utils/calculations';
import { calcSugestaoDeliveryCompleta, compararDeliveryVsBalcao } from '../utils/deliveryPricing';
import { calcularPrecoBalcao } from '../utils/precificacao';
import { extrairImpostoPercentual } from '../utils/deliveryAdapter';
import ComoCalculadoModal from '../components/ComoCalculadoModal';

const safeNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

export default function SimuladorLoteScreen() {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState([]);
  const [plataformas, setPlataformas] = useState([]);
  const [contexto, setContexto] = useState({ lucroPerc: 0.15, fixoPerc: 0, impostoPerc: 0, variavelPerc: 0 });
  const [modalCalculo, setModalCalculo] = useState(null);

  useFocusEffect(useCallback(() => { carregar(); }, []));

  async function carregar() {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [prods, allIngs, allPreps, allEmbs, plats, cfgRows, fixasRows, varsRows, fatRows] = await Promise.all([
        db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT * FROM delivery_config WHERE ativo = 1 ORDER BY id'),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT valor FROM despesas_fixas'),
        db.getAllAsync('SELECT descricao, percentual FROM despesas_variaveis'),
        db.getAllAsync('SELECT valor FROM faturamento_mensal WHERE valor > 0'),
      ]);

      // Contexto financeiro
      const cfg = cfgRows?.[0] || {};
      const totalFixas = (fixasRows || []).reduce((a, r) => a + safeNum(r.valor), 0);
      const fatMedio = (fatRows || []).length > 0
        ? (fatRows || []).reduce((a, r) => a + safeNum(r.valor), 0) / (fatRows || []).length : 0;
      const fixoPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
      const lucroPerc = Number.isFinite(cfg.lucro_desejado_delivery) ? cfg.lucro_desejado_delivery
                      : Number.isFinite(cfg.lucro_desejado) ? cfg.lucro_desejado : 0.15;
      const impostoPerc = extrairImpostoPercentual(varsRows || []);
      const variavelPerc = (varsRows || []).reduce((a, d) => a + (Number.isFinite(d.percentual) ? d.percentual : 0), 0);
      setContexto({ lucroPerc, fixoPerc, impostoPerc, variavelPerc });

      // Maps de custo por produto
      const ingsByProd = {}; (allIngs || []).forEach(i => (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i));
      const prepsByProd = {}; (allPreps || []).forEach(p => (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p));
      const embsByProd = {}; (allEmbs || []).forEach(e => (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e));

      const linhas = (prods || []).map(p => {
        const ings = ingsByProd[p.id] || [];
        const custoIng = ings.reduce((a, i) => a + calcCustoIngrediente(i.preco_por_kg, i.quantidade_utilizada, i.unidade_medida, i.unidade_medida), 0);
        const preps = prepsByProd[p.id] || [];
        const custoPr = preps.reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
        const embs = embsByProd[p.id] || [];
        const custoEmb = embs.reduce((a, e) => a + safeNum(e.preco_unitario) * safeNum(e.quantidade_utilizada), 0);
        const cmv = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
        return {
          id: p.id,
          nome: p.nome,
          cmv,
          precoVendaBalcao: safeNum(p.preco_venda),
        };
      });

      setProdutos(linhas);
      setPlataformas(plats || []);
    } catch (e) {
      console.error('[SimuladorLote.carregar]', e);
    } finally {
      setLoading(false);
    }
  }

  const linhasCalculadas = useMemo(() => {
    return produtos.map(prod => {
      const balcao = calcularPrecoBalcao({
        cmv: prod.cmv,
        lucroPerc: contexto.lucroPerc,
        fixoPerc: contexto.fixoPerc,
        variavelPerc: contexto.variavelPerc,
      });
      const sugBalcao = balcao.preco;
      const plataformaCells = plataformas.map(plat => {
        const sug = calcSugestaoDeliveryCompleta({ cmv: prod.cmv, plat, contexto });
        const cmp = sugBalcao > 0 && sug?.preco > 0
          ? compararDeliveryVsBalcao(sug.preco, sugBalcao)
          : { ok: true, nivel: 'ok', mensagem: '' };
        return { plat, resultado: sug, comparacao: cmp };
      });
      return { prod, balcao, sugBalcao, plataformaCells };
    });
  }, [produtos, plataformas, contexto]);

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
        <Text style={{ marginTop: spacing.sm, color: colors.textSecondary }}>Carregando produtos...</Text>
      </View>
    );
  }

  if (produtos.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: spacing.lg }]}>
        <Feather name="package" size={48} color={colors.disabled} />
        <Text style={styles.emptyTitle}>Nenhum produto cadastrado</Text>
        <Text style={styles.emptyDesc}>
          Cadastre produtos primeiro para usar o simulador em lote. Você pode aplicar um Kit de Início pra começar mais rápido.
        </Text>
      </View>
    );
  }

  if (plataformas.length === 0) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: spacing.lg }]}>
        <Feather name="smartphone" size={48} color={colors.disabled} />
        <Text style={styles.emptyTitle}>Nenhuma plataforma ativa</Text>
        <Text style={styles.emptyDesc}>
          Ative pelo menos uma plataforma de delivery para usar o simulador em lote.
        </Text>
        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={() => navigation.navigate('DeliveryPlataformas')}
          activeOpacity={0.8}
        >
          <Text style={styles.btnPrimaryText}>Configurar plataformas</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Visão geral / Simulador em lote</Text>
          <Text style={styles.subtitle}>
            Preço sugerido para cada produto em cada plataforma. Cálculo: CMV + lucro + custos fixos + imposto + comissão + taxa pgto online.
          </Text>
        </View>

        {/* Legenda — sessão 28.12: subiu pra antes da tabela (mais visível com muitos itens) */}
        <View style={styles.legend}>
          <Text style={styles.legendTitle}>Como ler:</Text>
          <View style={styles.legendGrid}>
            <View style={styles.legendRow}>
              <Feather name="check-circle" size={11} color={colors.success} />
              <Text style={styles.legendText}>Viável (preço &gt; balcão)</Text>
            </View>
            <View style={styles.legendRow}>
              <Feather name="alert-triangle" size={11} color={colors.warning} />
              <Text style={styles.legendText}>Próximo do balcão</Text>
            </View>
            <View style={styles.legendRow}>
              <Feather name="alert-octagon" size={11} color={colors.error} />
              <Text style={styles.legendText}>Menor que balcão</Text>
            </View>
            <View style={styles.legendRow}>
              <Feather name="x-circle" size={11} color={colors.error} />
              <Text style={styles.legendText}>Inviável (taxas &gt; 100%)</Text>
            </View>
          </View>
        </View>

        {/* Tabela horizontal scrollável */}
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* Header row */}
            <View style={[styles.row, styles.headerRow]}>
              <View style={[styles.cellProduto, styles.headerCell]}>
                <Text style={styles.headerText}>Produto</Text>
              </View>
              <View style={[styles.cellNumeric, styles.headerCell]}>
                <Text style={styles.headerText}>CMV</Text>
              </View>
              <View style={[styles.cellNumeric, styles.headerCell]}>
                <Text style={styles.headerText}>Balcão</Text>
              </View>
              {plataformas.map(plat => (
                <View key={plat.id} style={[styles.cellNumeric, styles.headerCell]}>
                  <Text style={styles.headerText} numberOfLines={1}>{plat.plataforma}</Text>
                </View>
              ))}
            </View>

            {/* Data rows */}
            {linhasCalculadas.map(linha => (
              <View key={linha.prod.id} style={styles.row}>
                <View style={styles.cellProduto}>
                  <Text style={styles.produtoNome} numberOfLines={2}>{linha.prod.nome}</Text>
                </View>
                <View style={styles.cellNumeric}>
                  <Text style={styles.cellValueDim}>{formatCurrency(linha.prod.cmv)}</Text>
                </View>
                <TouchableOpacity
                  style={styles.cellNumeric}
                  onPress={() => setModalCalculo({ resultado: linha.balcao, titulo: `${linha.prod.nome} — Balcão`, modo: 'balcao' })}
                  activeOpacity={0.7}
                >
                  <Text style={styles.cellValuePrimary}>
                    {linha.balcao.validacao.ok ? formatCurrency(linha.sugBalcao) : '—'}
                  </Text>
                  <Feather name="info" size={9} color={colors.primary} />
                </TouchableOpacity>
                {linha.plataformaCells.map(({ plat, resultado, comparacao }) => {
                  const cor =
                    !resultado.validacao.ok ? colors.error :
                    comparacao?.nivel === 'critico' ? colors.error :
                    comparacao?.nivel === 'aviso' ? colors.warning :
                    colors.success;
                  const icone =
                    !resultado.validacao.ok ? 'x-circle' :
                    comparacao?.nivel === 'critico' ? 'alert-octagon' :
                    comparacao?.nivel === 'aviso' ? 'alert-triangle' :
                    'check-circle';
                  return (
                    <TouchableOpacity
                      key={plat.id}
                      style={styles.cellNumeric}
                      onPress={() => setModalCalculo({ resultado, titulo: `${linha.prod.nome} — ${plat.plataforma}`, modo: 'delivery' })}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <Feather name={icone} size={11} color={cor} />
                        <Text style={[styles.cellValuePrimary, { color: cor }]}>
                          {resultado.validacao.ok ? formatCurrency(resultado.preco) : '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>

      </ScrollView>

      <ComoCalculadoModal
        visible={!!modalCalculo}
        onClose={() => setModalCalculo(null)}
        modo={modalCalculo?.modo || 'balcao'}
        titulo={modalCalculo?.titulo}
        resultado={modalCalculo?.resultado}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 100 },
  header: { marginBottom: spacing.md },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, lineHeight: 18 },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  headerRow: { backgroundColor: colors.primary + '12' },
  // Sessão 28.13: cells balanceados — fontes legíveis sem ficar tabloides
  cellProduto: { width: 170, padding: spacing.sm, justifyContent: 'center' },
  cellNumeric: { width: 92, padding: spacing.xs, paddingHorizontal: spacing.sm, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 4 },
  headerCell: { borderBottomWidth: 2, borderBottomColor: colors.primary },
  headerText: { fontSize: 12, fontFamily: fontFamily.bold, color: colors.text, textAlign: 'center' },
  produtoNome: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text },
  cellValueDim: { fontSize: 13, color: colors.textSecondary, fontFamily: fontFamily.regular },
  cellValuePrimary: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text },
  legend: {
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: borderRadius.md,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
  },
  legendTitle: { fontSize: fonts.small, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 8 },
  legendGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 200 },
  legendText: { fontSize: fonts.small, color: colors.textSecondary },
  emptyTitle: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text, marginTop: spacing.md, textAlign: 'center' },
  emptyDesc: { fontSize: fonts.small, color: colors.textSecondary, marginTop: spacing.sm, textAlign: 'center', lineHeight: 18, maxWidth: 320 },
  btnPrimary: {
    backgroundColor: colors.primary,
    paddingVertical: 14, paddingHorizontal: spacing.lg,
    borderRadius: borderRadius.md, marginTop: spacing.md,
    minHeight: 48, alignItems: 'center', justifyContent: 'center',
  },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular },
});
