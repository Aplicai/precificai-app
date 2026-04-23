import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, TouchableOpacity, Switch, ActivityIndicator, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, converterParaBase, getDivisorRendimento, calcCustoIngrediente, calcCustoPreparo } from '../utils/calculations';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import InfoTooltip from '../components/InfoTooltip';
import EmptyState from '../components/EmptyState';
import Loader from '../components/Loader';

const TABS = [
  { key: 'ese', label: 'Simulador de Impacto', icon: 'trending-up' },
  { key: 'meta', label: 'Meta de Faturamento', icon: 'target' },
];

function normalizeStr(str) {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Helper: extrai número finito ou 0 (evita NaN/Infinity em cálculos)
const safeNum = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};

export default function SimuladorScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const isWeb = Platform.OS === 'web';
  const [activeTab, setActiveTab] = useState('ese');
  const [loading, setLoading] = useState(true);

  // ── Shared data ──
  const [insumos, setInsumos] = useState([]);
  const [produtos, setProdutos] = useState([]);

  // ── "E se?" state ──
  const [ajuste, setAjuste] = useState('10');
  const [insumoSelecionado, setInsumoSelecionado] = useState(null);
  const [resultados, setResultados] = useState(null);
  const [busca, setBusca] = useState('');

  // ── "Meta de Vendas" state ──
  const [metaLucro, setMetaLucro] = useState('');
  const [metaProdutos, setMetaProdutos] = useState([]);
  const [custoFixoMensal, setCustoFixoMensal] = useState(0);
  const [totalVarDecimal, setTotalVarDecimal] = useState(0);
  const [metaCmvPercent, setMetaCmvPercent] = useState(0);
  const [metaResultado, setMetaResultado] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useFocusEffect(useCallback(() => { loadData(); }, []));

  async function loadData() {
    setLoadError(null);
    try {
      setLoading(true);
      const db = await getDatabase();

      const [mps, prodsR, fixas, variaveis, allIngs, allPreps, allEmbs] = await Promise.all([
        db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome'),
        db.getAllAsync('SELECT * FROM produtos WHERE preco_venda > 0'),
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida, mp.nome as mp_nome, mp.id as mp_id FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'),
        db.getAllAsync('SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida, pr.nome as pr_nome FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'),
        db.getAllAsync('SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario, em.nome as emb_nome FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'),
      ]);

      setInsumos(mps);

      const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
      const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0); // percentual already decimal (0.06 = 6%)
      setCustoFixoMensal(totalFixas);
      setTotalVarDecimal(totalVar);

      // Build lookup maps
      const ingsByProd = {};
      allIngs.forEach(i => { (ingsByProd[i.produto_id] = ingsByProd[i.produto_id] || []).push(i); });
      const prepsByProd = {};
      allPreps.forEach(p => { (prepsByProd[p.produto_id] = prepsByProd[p.produto_id] || []).push(p); });
      const embsByProd = {};
      allEmbs.forEach(e => { (embsByProd[e.produto_id] = embsByProd[e.produto_id] || []).push(e); });

      // Build "E se?" product data
      const prodData = prodsR.map(p => {
        const ings = ingsByProd[p.id] || [];
        const preps = prepsByProd[p.id] || [];
        const embs = embsByProd[p.id] || [];
        const custoIng = ings.reduce((a, ing) => a + calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada, ing.unidade_medida, ing.unidade_medida || 'g'), 0);
        const custoPr = preps.reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
        const custoEmb = embs.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);
        const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
        const margem = p.preco_venda > 0 ? (p.preco_venda - custoUnit) / p.preco_venda : 0;
        return { id: p.id, nome: p.nome, preco_venda: p.preco_venda, custoAtual: custoUnit, margemAtual: margem, ingredientes: ings, preparos: preps, embalagens: embs, rendimento_unidades: p.rendimento_unidades || 1, unidade_rendimento: p.unidade_rendimento, rendimento_total: p.rendimento_total };
      });
      setProdutos(prodData);

      // Calculate average CMV% for Meta de Faturamento
      let somaCmvPerc = 0;
      let countCmv = 0;
      for (const p of prodsR) {
        const custoIng = (ingsByProd[p.id] || []).reduce((a, ing) => a + calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada, ing.unidade_medida, ing.unidade_medida || 'g'), 0);
        const custoPr = (prepsByProd[p.id] || []).reduce((a, pp) => a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
        const custoEmb = (embsByProd[p.id] || []).reduce((a, e) => a + (e.preco_unitario || 0) * (e.quantidade_utilizada || 0), 0);
        const custoUnit = (custoIng + custoPr + custoEmb) / getDivisorRendimento(p);
        if (p.preco_venda > 0) {
          somaCmvPerc += custoUnit / p.preco_venda;
          countCmv++;
        }
      }
      const cmvMedioPerc = countCmv > 0 ? somaCmvPerc / countCmv : 0;
      setMetaCmvPercent(cmvMedioPerc);
      setMetaProdutos(prodsR); // keep only for empty state check
    } catch (e) {
      console.error('[Simulador.loadData]', e);
      setLoadError(e?.message || 'Não foi possível carregar os dados do simulador.');
    } finally {
      setLoading(false);
    }
  }

  // Auto-simular quando ajuste ou insumo muda (se já existe resultado anterior)
  useEffect(() => {
    if (resultados !== null && produtos.length > 0) {
      simular();
    }
  }, [ajuste, insumoSelecionado]);

  // ── "E se?" logic ──
  function simular() {
    const pct = safeNum(ajuste) / 100;
    if (!Number.isFinite(pct)) return;

    const results = produtos.map(p => {
      let novoCustoIng = p.ingredientes.reduce((a, ing) => {
        let preco = safeNum(ing.preco_por_kg);
        if (!insumoSelecionado || ing.mp_id === insumoSelecionado) {
          preco = preco * (1 + pct);
        }
        if ((ing.unidade_medida || '').toLowerCase() === 'un') return a + safeNum(ing.quantidade_utilizada) * preco;
        return a + (converterParaBase(safeNum(ing.quantidade_utilizada), ing.unidade_medida || 'g') / 1000) * preco;
      }, 0);
      const custoPr = p.preparos.reduce((a, pp) => a + calcCustoPreparo(safeNum(pp.custo_por_kg), pp.quantidade_utilizada, pp.unidade_medida || 'g'), 0);
      const custoEmb = p.embalagens.reduce((a, pe) => a + safeNum(pe.quantidade_utilizada) * safeNum(pe.preco_unitario), 0);

      const divisor = getDivisorRendimento(p);
      const novoCusto = divisor > 0 ? safeNum((novoCustoIng + custoPr + custoEmb) / divisor) : 0;
      const preco = safeNum(p.preco_venda);
      const novaMargemVal = preco - novoCusto;
      const novaMargem = preco > 0 ? safeNum(novaMargemVal / preco) : 0;
      const impacto = novoCusto - safeNum(p.custoAtual);

      return {
        ...p,
        custoNovo: novoCusto,
        margemNova: novaMargem,
        impacto,
        impactoPercent: safeNum(p.custoAtual) > 0 ? safeNum(impacto / p.custoAtual) : 0,
      };
    }).sort((a, b) => a.margemNova - b.margemNova);

    setResultados(results);
  }

  const insumosFiltrados = busca
    ? insumos.filter(i => normalizeStr(i.nome).includes(normalizeStr(busca)))
    : insumos;

  // ── "Meta de Vendas" logic ──
  // Fórmula simplificada: Faturamento = (Fixos + Lucro) / (1 - CMV% - Var%)
  function calcularMeta(valor) {
    const lucro = safeNum(valor);
    if (lucro <= 0) {
      setMetaResultado(null);
      return;
    }

    const margemDisponivel = 1 - safeNum(metaCmvPercent) - safeNum(totalVarDecimal);
    if (!Number.isFinite(margemDisponivel) || margemDisponivel <= 0) {
      // CMV + custos variáveis ≥ 100% → modelo inviável (lucro impossível)
      setMetaResultado({ inviavel: true });
      return;
    }

    const faturamentoMensal = safeNum((safeNum(custoFixoMensal) + lucro) / margemDisponivel);
    const faturamentoDiario = safeNum(faturamentoMensal / 30);

    setMetaResultado({
      faturamentoMensal,
      faturamentoDiario,
      cmvValor: safeNum(faturamentoMensal * metaCmvPercent),
      varValor: safeNum(faturamentoMensal * totalVarDecimal),
    });
  }

  function onChangeMeta(text) {
    const numericOnly = text.replace(/[^0-9]/g, '');
    setMetaLucro(numericOnly);
    calcularMeta(numericOnly);
  }

  function onQuickValue(valor) {
    const str = String(valor);
    setMetaLucro(str);
    calcularMeta(str);
  }

  // ── Tab content renderers ──
  function renderEseTab() {
    return (
      <>
        {/* Explicacao */}
        <View style={styles.infoCard}>
          <Feather name="zap" size={18} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={styles.infoTitle}>Simulador de Impacto</Text>
            <Text style={styles.infoDesc}>
              Simule o efeito de uma variação de preço nos seus custos e margens. Escolha um insumo específico ou aplique a todos.
            </Text>
          </View>
        </View>

        {/* Controles */}
        <View style={styles.controlsCard}>
          <Text style={styles.controlLabel}>Variação de preço (%)</Text>
          <View style={styles.ajusteRow}>
            {['-20', '-10', '-5', '+5', '+10', '+20'].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.ajusteChip, ajuste === v.replace('+', '') && styles.ajusteChipActive]}
                onPress={() => setAjuste(v.replace('+', ''))}
              >
                <Text style={[styles.ajusteChipText, ajuste === v.replace('+', '') && styles.ajusteChipTextActive]}>{v}%</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.customRow}>
            <Text style={styles.customLabel}>Personalizado:</Text>
            <TextInput
              style={styles.customInput}
              value={ajuste}
              onChangeText={setAjuste}
              keyboardType="numeric"
              placeholder="10"
            />
            <Text style={styles.customSuffix}>%</Text>
          </View>

          <Text style={[styles.controlLabel, { marginTop: spacing.md }]}>Aplicar em</Text>
          <TouchableOpacity
            style={[styles.insumoSelect, !insumoSelecionado && styles.insumoSelectActive]}
            onPress={() => setInsumoSelecionado(null)}
          >
            <Text style={[styles.insumoSelectText, !insumoSelecionado && styles.insumoSelectTextActive]}>
              Todos os insumos
            </Text>
          </TouchableOpacity>

          <TextInput
            style={styles.searchInput}
            placeholder="Buscar insumo específico..."
            value={busca}
            onChangeText={setBusca}
          />

          {busca.length > 0 && (
            <View style={styles.insumoList}>
              {insumosFiltrados.slice(0, 5).map(i => (
                <TouchableOpacity
                  key={i.id}
                  style={[styles.insumoSelect, insumoSelecionado === i.id && styles.insumoSelectActive]}
                  onPress={() => { setInsumoSelecionado(i.id); setBusca(''); }}
                >
                  <Text style={[styles.insumoSelectText, insumoSelecionado === i.id && styles.insumoSelectTextActive]}>
                    {i.nome} — {formatCurrency(i.valor_pago)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {insumoSelecionado && (
            <View style={styles.selectedTag}>
              <Text style={styles.selectedTagText}>
                {insumos.find(i => i.id === insumoSelecionado)?.nome}
              </Text>
              <TouchableOpacity onPress={() => setInsumoSelecionado(null)}>
                <Feather name="x" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          )}

          <TouchableOpacity style={styles.simularBtn} onPress={simular}>
            <Feather name="play" size={16} color="#fff" />
            <Text style={styles.simularBtnText}>Simular</Text>
          </TouchableOpacity>
        </View>

        {/* Resultados */}
        {resultados && (
          <View style={styles.resultadosCard}>
            <Text style={styles.resultadosTitle}>
              Impacto: {parseFloat(ajuste) > 0 ? '+' : ''}{ajuste}% {insumoSelecionado ? `em ${insumos.find(i => i.id === insumoSelecionado)?.nome}` : 'em todos os insumos'}
            </Text>

            {/* Resumo */}
            <View style={styles.resumoRow}>
              <View style={styles.resumoItem}>
                <Text style={styles.resumoLabel}>Produtos afetados</Text>
                <Text style={styles.resumoValue}>{resultados.filter(r => Math.abs(r.impacto) > 0.01).length}</Text>
              </View>
              <View style={styles.resumoItem}>
                <Text style={styles.resumoLabel}>Impacto médio</Text>
                <Text style={[styles.resumoValue, { color: parseFloat(ajuste) > 0 ? colors.error : colors.success }]}>
                  {formatCurrency(resultados.reduce((a, r) => a + r.impacto, 0) / Math.max(resultados.length, 1))}
                </Text>
              </View>
              <View style={styles.resumoItem}>
                <Text style={styles.resumoLabel}>Margens em risco</Text>
                <Text style={[styles.resumoValue, { color: colors.error }]}>
                  {resultados.filter(r => r.margemNova < 0.10).length}
                </Text>
              </View>
            </View>

            {/* Lista de produtos (filtrada pelo insumo selecionado) */}
            {(insumoSelecionado ? resultados.filter(r => r.ingredientes.some(ing => ing.mp_id === insumoSelecionado)) : resultados).map(r => {
              const margemColor = r.margemNova >= 0.15 ? colors.success : r.margemNova >= 0.05 ? colors.warning : colors.error;
              const margemRisco = r.margemNova < 0.10;
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.produtoRow, margemRisco && { backgroundColor: '#fef2f2' }]}
                  onPress={() => navigation.navigate('ProdutoForm', { id: r.id, sugerirNovoPreco: margemRisco })}
                  accessibilityRole="button"
                  accessibilityLabel={`Ajustar preço de ${r.nome}, margem nova ${(r.margemNova * 100).toFixed(0)} por cento`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.produtoNome} numberOfLines={1}>{r.nome}</Text>
                    <Text style={styles.produtoDetalhe}>
                      CMV: {formatCurrency(r.custoAtual)} → {formatCurrency(r.custoNovo)}
                      {'  '}({r.impacto >= 0 ? '+' : ''}{formatCurrency(r.impacto)})
                    </Text>
                  </View>
                  <View style={styles.produtoMargens}>
                    <Text style={[styles.margemText, { color: colors.textSecondary }]}>{formatPercent(r.margemAtual)}</Text>
                    <Feather name="arrow-right" size={12} color={colors.disabled} />
                    <Text style={[styles.margemText, { color: margemColor, fontFamily: fontFamily.bold }]}>{formatPercent(r.margemNova)}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color={colors.disabled} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              );
            })}
            <View style={styles.aplicarHint}>
              <Feather name="info" size={12} color={colors.textSecondary} />
              <Text style={styles.aplicarHintText}>Toque em um produto para ajustar o preço de venda.</Text>
            </View>
          </View>
        )}
      </>
    );
  }

  function renderMetaTab() {
    return (
      <>
        {/* Info card */}
        <View style={styles.metaInfoCard}>
          <View style={styles.metaInfoIconWrap}>
            <Feather name="zap" size={20} color="#fff" />
          </View>
          <View style={{ flex: 1, marginLeft: spacing.sm }}>
            <Text style={styles.metaInfoTitle}>Quanto preciso vender?</Text>
            <Text style={styles.metaInfoDesc}>
              Informe quanto deseja lucrar por mês. O cálculo já considera todos os custos: ingredientes (CMV), custos do mês e custos por venda (impostos, taxas).
            </Text>
          </View>
        </View>

        {/* Ponto de Equilíbrio */}
        {metaProdutos.length > 0 && custoFixoMensal > 0 && (() => {
          const margemDisp = 1 - metaCmvPercent - totalVarDecimal;
          if (margemDisp <= 0) return null;
          const pe = custoFixoMensal / margemDisp;
          return (
            <View style={[styles.metaCard, { borderLeftWidth: 3, borderLeftColor: colors.warning }]}>
              <Text style={{ fontSize: 12, fontFamily: fontFamily.semiBold, color: colors.warning, marginBottom: 4 }}>Ponto de Equilíbrio</Text>
              <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: 6 }}>
                Faturamento mínimo para cobrir todos os custos (lucro zero)
              </Text>
              <Text style={{ fontSize: 16, fontFamily: fontFamily.bold, color: colors.text }}>{formatCurrency(pe)}<Text style={{ fontSize: 11, color: colors.textSecondary }}>/mês</Text></Text>
              <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 }}>{formatCurrency(pe / 30)}/dia · CMV médio {formatPercent(metaCmvPercent)} + {formatPercent(totalVarDecimal)} por venda + {formatCurrency(custoFixoMensal)} mensais</Text>
            </View>
          );
        })()}

        {/* Meta input */}
        <View style={styles.metaCard}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.metaCardLabel}>Meta de lucro líquido mensal</Text>
            <InfoTooltip
              title="Lucro Líquido"
              text="É o valor que sobra depois de descontar TODOS os custos: ingredientes (CMV), custos do mês (aluguel, energia, etc), custos por venda (impostos, taxas) e custos de entrega. É o dinheiro que realmente vai para o seu bolso."
            />
          </View>
          <View style={styles.metaInputRow}>
            <Text style={styles.metaInputPrefix}>R$</Text>
            <TextInput
              style={styles.metaInput}
              value={metaLucro}
              onChangeText={onChangeMeta}
              keyboardType="numeric"
              placeholder="0"
              placeholderTextColor={colors.disabled}
            />
          </View>

          {/* Quick buttons */}
          <View style={styles.quickRow}>
            {[3000, 5000, 8000, 10000].map(v => (
              <TouchableOpacity
                key={v}
                style={[styles.quickBtn, metaLucro === String(v) && styles.quickBtnActive]}
                onPress={() => onQuickValue(v)}
              >
                <Text style={[styles.quickBtnText, metaLucro === String(v) && styles.quickBtnTextActive]}>
                  {formatCurrency(v)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Resultado inviável (CMV+Var ≥ 100%) */}
        {metaResultado?.inviavel && (
          <View style={[styles.metaResultCard, { backgroundColor: '#fee2e2', borderLeftWidth: 3, borderLeftColor: colors.error }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Feather name="alert-octagon" size={18} color={colors.error} />
              <Text style={{ fontSize: 14, fontFamily: fontFamily.bold, color: colors.error }}>Modelo financeiro inviável</Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.text, fontFamily: fontFamily.regular }}>
              Seus custos variáveis (CMV {formatPercent(metaCmvPercent)} + variáveis {formatPercent(totalVarDecimal)}) somam ≥ 100% do faturamento. Não há margem para lucro com a estrutura atual. Reduza CMV/variáveis em Configurações antes de definir uma meta.
            </Text>
          </View>
        )}

        {/* Resultado */}
        {metaResultado && !metaResultado.inviavel && (
          <View style={styles.metaResultCard}>
            <Text style={styles.metaResultLabel}>Você precisa faturar</Text>
            <Text style={styles.metaResultBig}>{formatCurrency(metaResultado.faturamentoMensal)}<Text style={styles.metaResultSuffix}>/mês</Text></Text>
            <Text style={styles.metaResultDaily}>{formatCurrency(metaResultado.faturamentoDiario)} por dia</Text>
            <View style={styles.metaResultDivider} />

            {/* Decomposição clara do cálculo */}
            <View style={{ gap: 6, width: '100%' }}>
              <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 2 }}>Como chegamos nesse valor:</Text>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary }}>Faturamento necessário</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.bold, color: colors.text }}>{formatCurrency(metaResultado.faturamentoMensal)}</Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.error }}>− CMV médio ({formatPercent(metaCmvPercent)})</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.error }}>-{formatCurrency(metaResultado.cmvValor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.error }}>− Custos variáveis ({formatPercent(totalVarDecimal)})</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.error }}>-{formatCurrency(metaResultado.varValor)}</Text>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.regular, color: colors.error }}>− Custos fixos mensais</Text>
                <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.error }}>-{formatCurrency(custoFixoMensal)}</Text>
              </View>

              <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 4, marginTop: 2, flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.success }}>= Lucro líquido</Text>
                <Text style={{ fontSize: 12, fontFamily: fontFamily.bold, color: colors.success }}>{formatCurrency(safeNum(metaLucro))}/mês</Text>
              </View>
            </View>
          </View>
        )}

        {/* Empty state */}
        {metaProdutos.length === 0 && !loading && (
          <EmptyState
            icon="package"
            title="Nenhum produto com preço cadastrado"
            description="Cadastre produtos com preço de venda para usar o simulador 'E se?'."
          />
        )}

        <View style={{ height: spacing.xl }} />
      </>
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Loader message="Simulando cenários de venda..." />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {loadError && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 8 }} />
          <Text style={styles.errorBannerText}>{loadError}</Text>
          <TouchableOpacity onPress={loadData} style={styles.errorBannerBtn} activeOpacity={0.7}>
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}
      {/* Tabs */}
      <View style={[styles.tabsRow, isDesktop && styles.tabsRowDesktop]}>
        {TABS.map(tab => {
          const isActive = activeTab === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[
                styles.tab,
                isDesktop && styles.tabDesktop,
                isActive && styles.tabActive,
                isActive && isDesktop && styles.tabActiveDesktop,
                isWeb && { cursor: 'pointer' },
              ]}
              onPress={() => setActiveTab(tab.key)}
              activeOpacity={0.7}
            >
              {isDesktop && (
                <Feather
                  name={tab.icon}
                  size={15}
                  color={isActive ? colors.primary : colors.textSecondary}
                  style={{ marginRight: 6 }}
                />
              )}
              <Text style={[
                styles.tabText,
                isDesktop && styles.tabTextDesktop,
                isActive && styles.tabTextActive,
                isActive && isDesktop && styles.tabTextActiveDesktop,
              ]}>
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'ese' ? renderEseTab() : renderMetaTab()}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 1000, alignSelf: 'center', width: '100%' },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },

  // ── Tabs ──
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    gap: 6,
    marginBottom: 0,
    flexWrap: 'wrap',
    paddingTop: spacing.sm,
  },
  tabsRowDesktop: {
    gap: 0,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    flexWrap: 'nowrap',
    paddingTop: 0,
  },
  tab: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.xs,
  },
  tabDesktop: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderRadius: 0,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    marginRight: spacing.sm,
    marginBottom: 0,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tabActiveDesktop: {
    backgroundColor: 'transparent',
    borderBottomColor: colors.primary,
  },
  tabText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextDesktop: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: '#fff',
  },
  tabTextActiveDesktop: {
    color: colors.primary,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  // ── "E se?" styles ──
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: colors.primary + '08', borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.primary + '20',
  },
  infoTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary, marginBottom: 2 },
  infoDesc: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, lineHeight: 20 },

  controlsCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginBottom: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  controlLabel: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.sm },

  ajusteRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: spacing.sm },
  ajusteChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  ajusteChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  ajusteChipText: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.textSecondary },
  ajusteChipTextActive: { color: '#fff' },

  customRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  customLabel: { fontSize: fonts.small, color: colors.textSecondary },
  customInput: {
    width: 60, height: 36, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, textAlign: 'center', fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold, backgroundColor: '#fff',
  },
  customSuffix: { fontSize: fonts.regular, color: colors.textSecondary },

  insumoSelect: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: borderRadius.sm,
    backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
    marginBottom: 6,
  },
  insumoSelectActive: { backgroundColor: colors.primary + '10', borderColor: colors.primary },
  insumoSelectText: { fontSize: fonts.small, color: colors.textSecondary },
  insumoSelectTextActive: { color: colors.primary, fontFamily: fontFamily.semiBold },

  searchInput: {
    height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: 12, fontSize: fonts.small, backgroundColor: '#fff', marginBottom: 6,
  },
  insumoList: { marginBottom: spacing.sm },

  selectedTag: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: colors.primary + '10', borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 6, alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  selectedTagText: { fontSize: fonts.small, color: colors.primary, fontFamily: fontFamily.semiBold },

  simularBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: colors.primary, borderRadius: borderRadius.md,
    paddingVertical: 12, marginTop: spacing.sm,
  },
  simularBtnText: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: '#fff' },

  resultadosCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, borderWidth: 1, borderColor: colors.border,
  },
  resultadosTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.md,
  },

  resumoRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  resumoItem: {
    flex: 1, alignItems: 'center', backgroundColor: colors.background,
    borderRadius: borderRadius.sm, padding: spacing.sm,
  },
  resumoLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium, marginBottom: 4 },
  resumoValue: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },

  produtoRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 8, borderRadius: borderRadius.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border + '60',
  },
  produtoNome: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text },
  produtoDetalhe: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
  produtoMargens: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 12 },
  margemText: { fontSize: fonts.small, fontFamily: fontFamily.medium },
  aplicarHint: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border + '40',
  },
  aplicarHintText: {
    fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.regular, fontStyle: 'italic',
  },

  // ── "Meta de Vendas" styles ──
  metaInfoCard: {
    flexDirection: 'row',
    backgroundColor: colors.primaryDark,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: 'flex-start',
  },
  metaInfoIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.primaryLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaInfoTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.medium,
    color: '#fff',
    marginBottom: 4,
  },
  metaInfoDesc: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.primaryPale,
    lineHeight: 20,
  },

  metaCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  metaCardLabel: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
    color: colors.text,
    marginBottom: spacing.sm,
  },

  metaInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  metaInputPrefix: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.large,
    color: colors.primary,
    marginRight: spacing.sm,
  },
  metaInput: {
    flex: 1,
    fontFamily: fontFamily.bold,
    fontSize: fonts.title,
    color: colors.text,
    paddingVertical: spacing.sm + 4,
    textAlign: 'center',
  },

  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  quickBtn: {
    flex: 1,
    minWidth: 80,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: borderRadius.md,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  quickBtnActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  quickBtnText: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.small,
    color: colors.text,
  },
  quickBtnTextActive: {
    color: '#fff',
  },

  metaResultCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
  },
  metaResultLabel: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.regular,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  metaResultBig: {
    fontFamily: fontFamily.bold,
    fontSize: 24,
    color: colors.primary,
  },
  metaResultSuffix: {
    fontFamily: fontFamily.medium,
    fontSize: fonts.regular,
    color: colors.textSecondary,
  },
  metaResultDaily: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
    color: colors.text,
    marginTop: spacing.xs,
  },
  metaResultDivider: {
    width: '60%',
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },
  metaResultDetail: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Table
  tableTitle: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.medium,
    color: colors.text,
    marginBottom: 2,
  },
  tableSubtitle: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    marginBottom: spacing.xs,
  },
  thText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.inputBg,
  },
  tableRowInactive: {
    opacity: 0.5,
  },
  tdNome: {
    flex: 1,
    fontFamily: fontFamily.medium,
    fontSize: fonts.small,
    color: colors.text,
  },
  tdText: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.text,
  },
  tdUnidades: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.small,
    color: colors.primary,
  },
  tdInactive: {
    color: colors.disabled,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: 2,
    borderTopColor: colors.border,
  },
  totalLabel: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.regular,
    color: colors.text,
  },
  totalValue: {
    fontFamily: fontFamily.bold,
    fontSize: fonts.regular,
    color: colors.primary,
  },

  // Empty state
  emptyCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyText: {
    fontFamily: fontFamily.semiBold,
    fontSize: fonts.regular,
    color: colors.text,
    marginTop: spacing.md,
  },
  emptySubtext: {
    fontFamily: fontFamily.regular,
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderLeftWidth: 3, borderLeftColor: colors.error,
    padding: spacing.sm,
    margin: spacing.md, marginBottom: 0,
    borderRadius: borderRadius.sm,
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small, color: colors.error,
    fontFamily: fontFamily.regular,
  },
  errorBannerBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
    marginLeft: 8,
  },
  errorBannerBtnText: {
    fontSize: fonts.tiny, color: '#fff',
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
});
