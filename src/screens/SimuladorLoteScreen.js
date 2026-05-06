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
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { SimulacaoProdutoContent } from './SimulacaoProdutoScreen';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  formatCurrency, calcCustoIngrediente, calcCustoPreparo,
  getDivisorRendimento,
} from '../utils/calculations';
import { calcSugestaoDeliveryCompleta } from '../utils/deliveryPricing';
import { calcularPrecoBalcao } from '../utils/precificacao';
import { buildContextoFinanceiro } from '../utils/deliveryAdapter';
import ComoCalculadoModal from '../components/ComoCalculadoModal';

const safeNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function SimuladorLoteScreen() {
  const navigation = useNavigation();
  const { isMobile } = useResponsiveLayout();
  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState([]);
  const [plataformas, setPlataformas] = useState([]);
  const [contexto, setContexto] = useState({ lucroPerc: 0.15, fixoPerc: 0, impostoPerc: 0, variavelPerc: 0 });
  const [modalCalculo, setModalCalculo] = useState(null);
  // Sessão 28.21: simulação agora abre como POPUP (não nova tela)
  const [popupSimulacao, setPopupSimulacao] = useState(null); // { produtoId, plataformaId }
  // Sessão 28.23: preços cadastrados pelo user em produto_preco_delivery
  const [precosCadastrados, setPrecosCadastrados] = useState({}); // { `prodId-platId`: preco }

  useFocusEffect(useCallback(() => { carregar(); }, []));

  async function carregar() {
    setLoading(true);
    try {
      const db = await getDatabase();
      const [prods, allIngs, allPreps, allEmbs, plats, cfgRows, fixasRows, varsRows, fatRows, ppdRows] = await Promise.all([
        db.getAllAsync('SELECT * FROM produtos ORDER BY nome'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
        db.getAllAsync('SELECT * FROM delivery_config WHERE ativo = 1 ORDER BY id'),
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT valor FROM despesas_fixas'),
        db.getAllAsync('SELECT descricao, percentual FROM despesas_variaveis'),
        db.getAllAsync('SELECT valor FROM faturamento_mensal WHERE valor > 0'),
        // Sessão 28.23: carrega preços DELIVERY que o user cadastrou (produto_preco_delivery)
        db.getAllAsync('SELECT produto_id, plataforma_id, preco_venda FROM produto_preco_delivery').catch(() => []),
      ]);
      // Mapa { `produtoId-platformaId`: preco }
      const ppdMap = {};
      (ppdRows || []).forEach(r => { ppdMap[`${r.produto_id}-${r.plataforma_id}`] = safeNum(r.preco_venda); });

      // Sessão 28.25: usa builder unificado do contexto (deliveryAdapter)
      // — antes, cada tela replicava esse cálculo. Agora é canonical em 1 lugar.
      const ctx = buildContextoFinanceiro({
        cfgRows, fixasRows, varsRows, fatRows,
        options: { usarLucroDelivery: true },
      });
      setContexto(ctx);

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
      setPrecosCadastrados(ppdMap);
    } catch (e) {
      console.error('[SimuladorLote.carregar]', e);
    } finally {
      setLoading(false);
    }
  }

  // Sessão 28.16/28.25: 3 valores por plataforma
  // - "MEU PREÇO" (preço atual cadastrado em produto_preco_delivery)
  // - "MARGEM IGUAL" (preço delivery que entrega o MESMO LUCRO LÍQUIDO % do balcão)
  // - "SUGERIDO" (preço pra atingir o lucroPerc do financeiro)
  //
  // SESSÃO 28.25 BUG FIX (formula audit): "MARGEM IGUAL" estava dobrando custos.
  // Antes: passava `lucroPerc = (precoBalcao - cmv) / precoBalcao` (margem BRUTA)
  //        para o engine de delivery — que adiciona fixo+imposto+comissão por cima.
  //        Resultado: divisor virava (1 - margemBruta - fixo - imposto - comissao - ...)
  //        → preço inflado em 100%+ (custos contados 2x: já estavam embutidos na
  //        margemBruta + reaplicados pelo engine).
  // Agora: lucroPercReal_balcao = margemBruta - fixoPerc - variavelPerc.
  //        Esse é o LUCRO LÍQUIDO % de fato do balcão. Engine adiciona fixo + imposto
  //        + comissão + taxa online por cima → preço delivery dá o MESMO % de lucro
  //        líquido que o produto tem hoje no balcão.
  const linhasCalculadas = useMemo(() => {
    return produtos.map(prod => {
      const balcao = calcularPrecoBalcao({
        cmv: prod.cmv,
        lucroPerc: contexto.lucroPerc,
        fixoPerc: contexto.fixoPerc,
        variavelPerc: contexto.variavelPerc,
      });
      const sugBalcao = balcao.preco;
      // Margem BRUTA do produto no balcão (preço - CMV) / preço — só pra exibir
      const margemBrutaBalcao = prod.precoVendaBalcao > 0
        ? Math.max(0, (prod.precoVendaBalcao - prod.cmv) / prod.precoVendaBalcao)
        : 0;
      // LUCRO LÍQUIDO % real do balcão (subtraindo custos fixos e variáveis)
      const lucroPercBalcaoReal = Math.max(
        0,
        margemBrutaBalcao - contexto.fixoPerc - contexto.variavelPerc
      );
      const plataformaCells = plataformas.map(plat => {
        // V1: usando o lucroPerc do FINANCEIRO (configuração)
        const sugFinanceiro = calcSugestaoDeliveryCompleta({ cmv: prod.cmv, plat, contexto });
        // V2: usando o lucro líquido REAL do balcão (mantém mesma rentabilidade)
        const sugMantemMargem = (prod.precoVendaBalcao > 0 && lucroPercBalcaoReal > 0)
          ? calcSugestaoDeliveryCompleta({
              cmv: prod.cmv,
              plat,
              contexto: { ...contexto, lucroPerc: lucroPercBalcaoReal },
            })
          : null;
        return { plat, sugFinanceiro, sugMantemMargem };
      });
      return { prod, balcao, sugBalcao, margemBrutaBalcao, lucroPercBalcaoReal, plataformaCells };
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

        {/* Sessão 28.16: tooltip de estratégia + Como ler reformulado */}
        <View style={{ flexDirection: 'row', backgroundColor: '#FEF3C7', borderRadius: 8, padding: 10, marginBottom: spacing.sm, gap: 8, borderLeftWidth: 3, borderLeftColor: '#F59E0B' }}>
          <Feather name="info" size={14} color="#92400E" style={{ marginTop: 2 }} />
          <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 }}>
            <Text style={{ fontFamily: fontFamily.bold }}>Estratégia: </Text>
            nem todo produto precisa ter lucro alto no delivery. Itens com alta visibilidade (fotos atrativas, posição de destaque) podem ter margem menor pra atrair pedidos. Avalie a precificação como ESTRATÉGIA DO NEGÓCIO COMO UM TODO. Toque numa célula da plataforma pra ver detalhes.
          </Text>
        </View>

        <View style={styles.legend}>
          <Text style={styles.legendTitle}>O que cada coluna significa:</Text>
          <View style={styles.legendGrid}>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: '#F59E0B' }]} />
              <Text style={styles.legendText}>
                <Text style={{ fontFamily: fontFamily.bold }}>MEU PREÇO: </Text>
                quanto VOCÊ está cobrando hoje nesta plataforma. Se está vazio, toque pra cadastrar.
              </Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
              <Text style={styles.legendText}>
                <Text style={{ fontFamily: fontFamily.bold }}>MARGEM IGUAL: </Text>
                preço delivery que entrega o MESMO lucro líquido % que esse produto tem hoje no balcão. Use se o preço de balcão já está bom.
              </Text>
            </View>
            <View style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: colors.success }]} />
              <Text style={styles.legendText}>
                <Text style={{ fontFamily: fontFamily.bold }}>SUGERIDO (financeiro): </Text>
                preço pra atingir o lucro que você definiu nas Configurações Financeiras.
              </Text>
            </View>
            <View style={styles.legendRow}>
              <Feather name="info" size={11} color={colors.textSecondary} />
              <Text style={styles.legendText}>
                Toque em qualquer célula pra abrir simulação completa e cadastrar seu preço.
              </Text>
            </View>
          </View>
        </View>

        {/* Sessão 28.23: layout MOBILE-FIRST — cards verticais por produto */}
        {isMobile ? (
          <View style={{ gap: 12 }}>
            {linhasCalculadas.map(linha => (
              <View key={linha.prod.id} style={{ backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ flex: 1, fontSize: 14, fontFamily: fontFamily.bold, color: colors.text }}>{linha.prod.nome}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>CMV</Text>
                    <Text style={{ fontSize: 13, color: colors.text, fontFamily: fontFamily.medium }}>{formatCurrency(linha.prod.cmv)}</Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>Preço balcão</Text>
                    <Text style={{ fontSize: 13, color: colors.text, fontFamily: fontFamily.medium }}>
                      {linha.prod.precoVendaBalcao > 0 ? formatCurrency(linha.prod.precoVendaBalcao) : '—'}
                    </Text>
                  </View>
                  <View>
                    <Text style={{ fontSize: 10, color: colors.textSecondary }}>Margem atual</Text>
                    <Text style={{ fontSize: 13, color: colors.text, fontFamily: fontFamily.medium }}>{(linha.margemBrutaBalcao * 100).toFixed(1)}%</Text>
                  </View>
                </View>
                {/* Cada plataforma: 1 linha com 3 colunas */}
                {linha.plataformaCells.map(({ plat, sugFinanceiro, sugMantemMargem }) => {
                  const okMantem = sugMantemMargem?.validacao?.ok && Number.isFinite(sugMantemMargem?.preco) && sugMantemMargem.preco > 0;
                  const okFin = sugFinanceiro?.validacao?.ok && Number.isFinite(sugFinanceiro?.preco) && sugFinanceiro.preco > 0;
                  const meuPreco = precosCadastrados[`${linha.prod.id}-${plat.id}`] || 0;
                  return (
                    <TouchableOpacity
                      key={plat.id}
                      onPress={() => setPopupSimulacao({ produtoId: linha.prod.id, plataformaId: plat.id })}
                      activeOpacity={0.7}
                      style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8, marginTop: 8, alignItems: 'center', gap: 6 }}
                    >
                      <Text style={{ flex: 1, fontSize: 12, fontFamily: fontFamily.bold, color: colors.text }}>{plat.plataforma}</Text>
                      <View style={{ alignItems: 'center', minWidth: 70 }}>
                        <Text style={{ fontSize: 9, color: '#92400E', fontFamily: fontFamily.bold }}>MEU PREÇO</Text>
                        <Text style={{ fontSize: 12, color: meuPreco > 0 ? '#92400E' : colors.disabled, fontFamily: fontFamily.medium }}>
                          {meuPreco > 0 ? formatCurrency(meuPreco) : 'cadastrar'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center', minWidth: 70 }}>
                        <Text style={{ fontSize: 9, color: colors.primary, fontFamily: fontFamily.bold }}>MARGEM IGUAL</Text>
                        <Text style={{ fontSize: 12, color: okMantem ? colors.primary : colors.disabled, fontFamily: fontFamily.medium }}>
                          {okMantem ? formatCurrency(sugMantemMargem.preco) : '—'}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'center', minWidth: 70 }}>
                        <Text style={{ fontSize: 9, color: colors.success, fontFamily: fontFamily.bold }}>SUGERIDO</Text>
                        <Text style={{ fontSize: 12, color: okFin ? colors.success : colors.error, fontFamily: fontFamily.medium }}>
                          {okFin ? formatCurrency(sugFinanceiro.preco) : '—'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
                <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 8, fontStyle: 'italic', textAlign: 'center' }}>
                  Toque numa plataforma pra simular preço
                </Text>
              </View>
            ))}
          </View>
        ) : (
        /* Desktop: tabela horizontal scrollável */
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View>
            {/* Header row 1 — plataforma agrupada */}
            <View style={[styles.row, styles.headerRow]}>
              <View style={[styles.cellProduto, styles.headerCell, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                <Text style={styles.headerText}>Produto</Text>
              </View>
              <View style={[styles.cellNumeric, styles.headerCell, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                <Text style={styles.headerText}>CMV</Text>
              </View>
              <View style={[styles.cellNumeric, styles.headerCell, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                <Text style={styles.headerText}>Preço{'\n'}Atual</Text>
              </View>
              {plataformas.map(plat => (
                <View key={plat.id} style={{ width: 270, borderRightWidth: 1, borderRightColor: colors.border, borderBottomWidth: 2, borderBottomColor: colors.primary, paddingTop: 0 }}>
                  {/* Sessão 28.25: header da plataforma com fundo destacado, centralizado SOBRE as 3 sub-colunas */}
                  <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center', paddingVertical: 6, backgroundColor: colors.primary + '22', borderBottomWidth: 1, borderBottomColor: colors.primary }}>
                    <Text style={[styles.headerText, { fontSize: 13, color: colors.primary }]} numberOfLines={1}>{plat.plataforma}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', width: '100%' }}>
                    <View style={{ width: 90, alignItems: 'center', padding: 4, borderRightWidth: 1, borderRightColor: colors.border }}>
                      <Text style={{ fontSize: 9, color: '#92400E', fontFamily: fontFamily.bold }}>MEU PREÇO</Text>
                      <Text style={{ fontSize: 8, color: colors.textSecondary }}>cobrado hoje</Text>
                    </View>
                    <View style={{ width: 90, alignItems: 'center', padding: 4, borderRightWidth: 1, borderRightColor: colors.border }}>
                      <Text style={{ fontSize: 9, color: colors.primary, fontFamily: fontFamily.bold }}>MARGEM IGUAL</Text>
                      <Text style={{ fontSize: 8, color: colors.textSecondary }}>= lucro do balcão</Text>
                    </View>
                    <View style={{ width: 90, alignItems: 'center', padding: 4 }}>
                      <Text style={{ fontSize: 9, color: colors.success, fontFamily: fontFamily.bold }}>SUGERIDO</Text>
                      <Text style={{ fontSize: 8, color: colors.textSecondary }}>margem financ.</Text>
                    </View>
                  </View>
                </View>
              ))}
            </View>

            {/* Data rows */}
            {linhasCalculadas.map(linha => (
              <View key={linha.prod.id} style={styles.row}>
                <View style={[styles.cellProduto, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                  <Text style={styles.produtoNome} numberOfLines={2}>{linha.prod.nome}</Text>
                  <Text style={{ fontSize: 9, color: colors.textSecondary, marginTop: 2 }}>
                    Margem balcão: {(linha.margemBrutaBalcao * 100).toFixed(1)}% • Lucro líq.: {(linha.lucroPercBalcaoReal * 100).toFixed(1)}%
                  </Text>
                </View>
                <View style={[styles.cellNumeric, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                  <Text style={styles.cellValueDim}>{formatCurrency(linha.prod.cmv)}</Text>
                </View>
                {/* Coluna "Preço Atual" — preço de venda DO PRODUTO no balcão (sessão 28.16) */}
                <View style={[styles.cellNumeric, { borderRightWidth: 1, borderRightColor: colors.border }]}>
                  <Text style={[styles.cellValuePrimary, { color: colors.text }]}>
                    {linha.prod.precoVendaBalcao > 0 ? formatCurrency(linha.prod.precoVendaBalcao) : '—'}
                  </Text>
                </View>
                {/* 3 sub-células por plataforma — Sessão 28.23 */}
                {linha.plataformaCells.map(({ plat, sugFinanceiro, sugMantemMargem }) => {
                  const okMantem = sugMantemMargem?.validacao?.ok && Number.isFinite(sugMantemMargem?.preco) && sugMantemMargem.preco > 0;
                  const okFin = sugFinanceiro?.validacao?.ok && Number.isFinite(sugFinanceiro?.preco) && sugFinanceiro.preco > 0;
                  const meuPreco = precosCadastrados[`${linha.prod.id}-${plat.id}`] || 0;
                  return (
                    <View key={plat.id} style={{ flexDirection: 'row', width: 270, borderRightWidth: 1, borderRightColor: colors.border }}>
                      <TouchableOpacity
                        style={{ width: 90, alignItems: 'center', justifyContent: 'center', padding: spacing.xs, borderRightWidth: 1, borderRightColor: colors.border, backgroundColor: meuPreco > 0 ? '#FEF3C7' : 'transparent' }}
                        onPress={() => setPopupSimulacao({ produtoId: linha.prod.id, plataformaId: plat.id })}
                        activeOpacity={0.6}
                      >
                        {meuPreco > 0 ? (
                          <Text style={[styles.cellValuePrimary, { color: '#92400E', fontSize: 12 }]}>
                            {formatCurrency(meuPreco)}
                          </Text>
                        ) : (
                          <Text style={{ fontSize: 10, color: colors.textSecondary, fontStyle: 'italic' }}>cadastrar</Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ width: 90, alignItems: 'center', justifyContent: 'center', padding: spacing.xs, borderRightWidth: 1, borderRightColor: colors.border }}
                        onPress={() => setPopupSimulacao({ produtoId: linha.prod.id, plataformaId: plat.id })}
                        activeOpacity={0.6}
                      >
                        {okMantem ? (
                          <View style={{ alignItems: 'center', gap: 2 }}>
                            <Text style={[styles.cellValuePrimary, { color: colors.primary, fontSize: 12 }]}>
                              {formatCurrency(sugMantemMargem.preco)}
                            </Text>
                          </View>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Feather name="info" size={11} color={colors.disabled} />
                            <Text style={{ fontSize: 10, color: colors.disabled }}>—</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={{ width: 90, alignItems: 'center', justifyContent: 'center', padding: spacing.xs }}
                        onPress={() => setPopupSimulacao({ produtoId: linha.prod.id, plataformaId: plat.id })}
                        activeOpacity={0.6}
                        disabled={!okFin}
                      >
                        {okFin ? (
                          <Text style={[styles.cellValuePrimary, { color: colors.success, fontSize: 12 }]}>
                            {formatCurrency(sugFinanceiro.preco)}
                          </Text>
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Feather name="x-circle" size={11} color={colors.error} />
                            <Text style={{ fontSize: 11, color: colors.error }}>—</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
        )}

      </ScrollView>

      <ComoCalculadoModal
        visible={!!modalCalculo}
        onClose={() => setModalCalculo(null)}
        modo={modalCalculo?.modo || 'balcao'}
        titulo={modalCalculo?.titulo}
        resultado={modalCalculo?.resultado}
      />

      {/* Sessão 28.21: popup de simulação dedicada (substitui navigation pra tela) */}
      <Modal visible={!!popupSimulacao} transparent animationType="fade" onRequestClose={() => setPopupSimulacao(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
          <View style={{ backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '92%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 20, shadowOffset: { width: 0, height: 6 }, elevation: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', padding: spacing.sm, position: 'absolute', top: 0, right: 0, zIndex: 10 }}>
              <TouchableOpacity
                onPress={() => setPopupSimulacao(null)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={{ padding: 8, backgroundColor: '#fff', borderRadius: 20, borderWidth: 1, borderColor: colors.border }}
              >
                <Feather name="x" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>
            {popupSimulacao && (
              <SimulacaoProdutoContent
                produtoId={popupSimulacao.produtoId}
                plataformaId={popupSimulacao.plataformaId}
                onClose={() => setPopupSimulacao(null)}
                // Sessão 28.25: atualiza coluna "MEU PREÇO" sem precisar recarregar a tela.
                onSaved={({ produtoId: pid, plataformaId: plid, precoVenda }) => {
                  setPrecosCadastrados(prev => ({ ...prev, [`${pid}-${plid}`]: safeNum(precoVenda) }));
                }}
                isPopup
              />
            )}
          </View>
        </View>
      </Modal>
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
  legendText: { fontSize: fonts.small, color: colors.textSecondary, flex: 1 },
  // Sessão 28.16: indicador colorido pra legenda das 2 colunas (mantém vs financeiro)
  legendDot: { width: 10, height: 10, borderRadius: 5 },
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
