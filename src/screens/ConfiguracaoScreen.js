import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, Keyboard, TextInput, Switch, RefreshControl, Platform } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import CurrencyInputModal from '../components/CurrencyInputModal';
import { useFocusEffect, useIsFocused, useNavigation } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import InfoTooltip from '../components/InfoTooltip';
import Chip from '../components/Chip';
import { Feather } from '@expo/vector-icons';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, calcDespesasFixasPercentual, calcMarkup } from '../utils/calculations';
import { getFinanceiroStatus } from '../utils/financeiroStatus';

// Parsing seguro: aceita "12,5" e "12.5", retorna NaN para entrada inválida (não 0 silencioso).
function parseNum(str) {
  if (str == null) return NaN;
  const n = parseFloat(String(str).replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

const SUGESTOES_FIXAS = [
  'Aluguel', 'Energia elétrica', 'Água', 'Gás', 'Internet', 'Telefone',
  'Funcionário CLT', 'Funcionário freelancer', 'Pró-labore', 'INSS/MEI', 'Contador',
  'Seguro do imóvel', 'Seguro equipamentos', 'Alvará/Licenças', 'Vigilância sanitária',
  'Limpeza', 'Manutenção equipamentos', 'Software/Sistema', 'Plataforma delivery',
  'Marketing fixo', 'Publicidade', 'Material de escritório', 'Material de limpeza',
  'Uniformes', 'Estacionamento', 'Combustível', 'Frete fixo', 'Armazenamento',
  'Condomínio', 'IPTU', 'Taxa lixo', 'Depreciação equipamentos', 'Depreciação móveis',
  'Assinatura delivery', 'Domínio/Hospedagem', 'Plano de saúde', 'Vale transporte',
  'Vale refeição', 'Segurança', 'Dedetização', 'Jardinagem', 'Consultoria',
  'Advocacia', 'Financiamento', 'Empréstimo', 'Leasing', 'Música ambiente',
  'TV a cabo', 'Associação comercial', 'Sindicato',
];
const SUGESTOES_VARIAVEIS = [
  'Impostos (Simples)', 'Taxa maquininha', 'Taxa PIX', 'Perdas e desperdícios',
  'Comissão vendedores', 'Comissão garçom', 'Taxa marketplace',
  'Gorjeta', 'Devoluções', 'Bonificações', 'Royalties', 'Taxa antecipação cartão',
  'Imposto sobre serviço', 'ICMS', 'Contribuição sindical',
];

export default function ConfiguracaoScreen() {
  const { isDesktop } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const navigation = useNavigation();
  const [loadError, setLoadError] = useState(false);
  const [lucroDesejado, setLucroDesejado] = useState('');
  const [despesasFixas, setDespesasFixas] = useState([]);
  const [despesasVariaveis, setDespesasVariaveis] = useState([]);
  const [faturamento, setFaturamento] = useState([]);
  const [novaFixa, setNovaFixa] = useState({ descricao: '', valor: '' });
  const [novaVariavel, setNovaVariavel] = useState({ descricao: '', percentual: '' });
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editModal, setEditModal] = useState(null);
  const [finStatus, setFinStatus] = useState(null);
  const [savedFeedback, setSavedFeedback] = useState(null);
  const [margemSeguranca, setMargemSeguranca] = useState('0');
  const [currencyModal, setCurrencyModal] = useState(null);
  const [configId, setConfigId] = useState(null);
  const [faturamentoMode, setFaturamentoMode] = useState('media'); // 'media' or 'mensal'
  const [faturamentoMedioInput, setFaturamentoMedioInput] = useState('');
  // Densidade global de listas (P3-G)

  const mesesCurtos = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  const debounceRef = useRef(null);
  const [refreshing, setRefreshing] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => setConfirmDelete(null);
    }, [])
  );

  async function handleRefresh() {
    setRefreshing(true);
    try { await loadData(); } finally { setRefreshing(false); }
  }

  function showSaved(msg) {
    setSavedFeedback(msg || 'Salvo');
    setTimeout(() => setSavedFeedback(null), 1500);
  }

  function showError(msg) {
    Alert.alert('Erro ao salvar', msg || 'Tente novamente.');
  }

  async function loadData() {
    try {
      setLoadError(false);
    const db = await getDatabase();
    const [configs, fixas, variaveis, fatRaw] = await Promise.all([
      db.getAllAsync('SELECT * FROM configuracao'),
      db.getAllAsync('SELECT * FROM despesas_fixas ORDER BY id'),
      db.getAllAsync('SELECT * FROM despesas_variaveis ORDER BY id'),
      db.getAllAsync('SELECT * FROM faturamento_mensal ORDER BY id'),
    ]);
    let config = configs?.[0];
    if (!config) {
      // Criar row de configuração se não existir
      await db.runAsync('INSERT INTO configuracao (lucro_desejado, margem_seguranca) VALUES (0.15, 0)');
      const newConfigs = await db.getAllAsync('SELECT * FROM configuracao');
      config = newConfigs?.[0];
    }
    if (config) {
      setConfigId(config.id);
      const lucro = config.lucro_desejado;
      if (lucro && lucro > 0) {
        setLucroDesejado(String((lucro * 100).toFixed(1)));
      }
      setMargemSeguranca(String(((config.margem_seguranca || 0) * 100).toFixed(1)));
    }

    setDespesasFixas(fixas);
    setDespesasVariaveis(variaveis);

    let fat = fatRaw;
    if (fat.length === 0) {
      for (const mes of mesesCurtos) {
        await db.runAsync('INSERT INTO faturamento_mensal (mes, valor) VALUES (?, ?)', [mes, 0]);
      }
      fat = await db.getAllAsync('SELECT * FROM faturamento_mensal ORDER BY id');
    } else if (fat.length > 12) {
      const extras = fat.slice(12);
      for (const e of extras) {
        await db.runAsync('DELETE FROM faturamento_mensal WHERE id = ?', [e.id]);
      }
      fat = fat.slice(0, 12);
    }
    fat = fat.map((f, i) => ({ ...f, mes: mesesCurtos[i] || f.mes }));
    setFaturamento(fat);

    // Detect if user filled month-by-month (different values) or single average
    const filledMonths = fat.filter(f => f.valor > 0);
    const uniqueValues = new Set(filledMonths.map(f => f.valor));
    if (filledMonths.length > 1 && uniqueValues.size > 1) {
      setFaturamentoMode('mensal');
    }

    // Set the media input from average
    if (filledMonths.length > 0) {
      const avg = filledMonths.reduce((a, f) => a + f.valor, 0) / filledMonths.length;
      setFaturamentoMedioInput(String(avg).replace('.', ','));
    }

    const status = await getFinanceiroStatus();
    setFinStatus(status);
    } catch (e) {
      setLoadError(true);
      if (typeof console !== 'undefined' && console.error) console.error('[ConfiguracaoScreen.loadData]', e);
    }
  }

  async function salvarLucro() {
    const db = await getDatabase();
    const p = parseNum(lucroDesejado);
    const valor = Number.isFinite(p) ? p / 100 : 0;
    await db.runAsync('UPDATE configuracao SET lucro_desejado = ? WHERE id > 0', [valor]);
    showSaved('Margem salva');
    loadData();
  }

  async function salvarMargemSeguranca() {
    const db = await getDatabase();
    const valor = parseFloat(margemSeguranca.replace(',', '.'));
    if (isNaN(valor) || valor < 0 || valor > 30) {
      return Alert.alert('Valor inválido', 'A margem de segurança deve ser entre 0% e 30%.');
    }
    await db.runAsync('UPDATE configuracao SET margem_seguranca = ? WHERE id > 0', [valor / 100]);
    showSaved('Margem de segurança salva');
    loadData();
  }

  async function adicionarDespesaFixa() {
    if (!novaFixa.descricao.trim()) return Alert.alert('Erro', 'Informe a descrição');
    const db = await getDatabase();
    const valor = parseNum(novaFixa.valor);
    await db.runAsync('INSERT INTO despesas_fixas (descricao, valor) VALUES (?, ?)',
      [novaFixa.descricao, Number.isFinite(valor) ? valor : 0]);
    setNovaFixa({ descricao: '', valor: '' });
    showSaved('Despesa adicionada');
    loadData();
  }

  function removerDespesaFixa(id, descricao) {
    setConfirmDelete({
      titulo: 'Excluir custo mensal', nome: descricao,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM despesas_fixas WHERE id = ?', [id]);
        setConfirmDelete(null);
        loadData();
      },
    });
  }

  async function adicionarDespesaVariavel() {
    if (!novaVariavel.descricao.trim()) return Alert.alert('Erro', 'Informe a descrição');
    const db = await getDatabase();
    const p = parseNum(novaVariavel.percentual);
    const finalPerc = Number.isFinite(p) ? p / 100 : 0;
    await db.runAsync('INSERT INTO despesas_variaveis (descricao, percentual) VALUES (?, ?)',
      [novaVariavel.descricao, finalPerc]);
    setNovaVariavel({ descricao: '', percentual: '' });
    showSaved('Despesa adicionada');
    loadData();
  }

  function removerDespesaVariavel(id, descricao) {
    setConfirmDelete({
      titulo: 'Excluir custo por venda', nome: descricao,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM despesas_variaveis WHERE id = ?', [id]);
        setConfirmDelete(null);
        loadData();
      },
    });
  }

  function editarDespesaFixa(d) {
    setEditModal({ tipo: 'fixa', id: d.id, descricao: d.descricao, valor: String(d.valor || 0) });
  }

  function editarDespesaVariavel(d) {
    setEditModal({ tipo: 'variavel', id: d.id, descricao: d.descricao, valor: String(((d.percentual || 0) * 100).toFixed(2)).replace('.', ',') });
  }

  async function salvarEdicao() {
    if (!editModal) return;
    const db = await getDatabase();
    if (editModal.tipo === 'fixa') {
      const valor = parseNum(editModal.valor);
      await db.runAsync('UPDATE despesas_fixas SET descricao = ?, valor = ? WHERE id = ?',
        [editModal.descricao, Number.isFinite(valor) ? valor : 0, editModal.id]);
    } else {
      const p = parseNum(editModal.valor);
      const finalPerc = Number.isFinite(p) ? p / 100 : 0;
      await db.runAsync('UPDATE despesas_variaveis SET descricao = ?, percentual = ? WHERE id = ?',
        [editModal.descricao, finalPerc, editModal.id]);
    }
    setEditModal(null);
    showSaved('Atualizado');
    loadData();
  }

  async function salvarFaturamento(id, valor) {
    const db = await getDatabase();
    const v = parseNum(valor);
    await db.runAsync('UPDATE faturamento_mensal SET valor = ? WHERE id = ?',
      [Number.isFinite(v) ? v : 0, id]);
    const status = await getFinanceiroStatus();
    setFinStatus(status);
  }

  async function salvarFaturamentoMedio(valorStr) {
    const valor = parseNum(valorStr);
    if (!Number.isFinite(valor) || valor <= 0) {
      return Alert.alert('Valor inválido', 'O faturamento médio deve ser maior que zero.');
    }
    try {
      const db = await getDatabase();
      // Apply same value to all 12 months
      for (const f of faturamento) {
        await db.runAsync('UPDATE faturamento_mensal SET valor = ? WHERE id = ?', [valor, f.id]);
      }
      showSaved('Faturamento salvo');
      loadData();
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[ConfiguracaoScreen.salvarFaturamentoMedio]', e);
      showError('Não foi possível salvar o faturamento.');
    }
  }

  function debounceSave(fn, delay = 600) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(fn, delay);
  }

  async function adicionarSugestaoFixa(descricao) {
    if (despesasFixas.some(d => d.descricao.toLowerCase() === descricao.toLowerCase())) return;
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO despesas_fixas (descricao, valor) VALUES (?, ?)', [descricao, 0]);
    await loadData();
    // Auto-open value modal for the newly added item
    const newId = result?.lastInsertRowId;
    if (newId) {
      setTimeout(() => {
        setCurrencyModal({
          title: descricao, value: '0', prefix: 'R$', placeholder: '0,00',
          onConfirm: async (val) => {
            const parsed = parseNum(val);
            const v = Number.isFinite(parsed) ? parsed : 0;
            const dbx = await getDatabase();
            await dbx.runAsync('UPDATE despesas_fixas SET valor = ? WHERE id = ?', [v, newId]);
            setCurrencyModal(null);
            showSaved();
            loadData();
          },
        });
      }, 300);
    }
  }

  async function adicionarSugestaoVariavel(descricao) {
    if (despesasVariaveis.some(d => d.descricao.toLowerCase() === descricao.toLowerCase())) return;
    const db = await getDatabase();
    const result = await db.runAsync('INSERT INTO despesas_variaveis (descricao, percentual) VALUES (?, ?)', [descricao, 0]);
    await loadData();
    // Auto-open value modal
    const newId = result?.lastInsertRowId;
    if (newId) {
      setTimeout(() => {
        setCurrencyModal({
          title: descricao, value: '0', suffix: '%', placeholder: '0,0',
          onConfirm: async (val) => {
            const p = parseNum(val);
            const v = Number.isFinite(p) ? p / 100 : 0;
            const dbx = await getDatabase();
            await dbx.runAsync('UPDATE despesas_variaveis SET percentual = ? WHERE id = ?', [v, newId]);
            setCurrencyModal(null);
            showSaved();
            loadData();
          },
        });
      }, 300);
    }
  }

  const totalFixas = despesasFixas.reduce((acc, d) => acc + (Number.isFinite(d.valor) ? d.valor : 0), 0);
  const totalVariaveis = despesasVariaveis.reduce((acc, d) => acc + (Number.isFinite(d.percentual) ? d.percentual : 0), 0);
  const mesesComFat = faturamento.filter(f => Number.isFinite(f.valor) && f.valor > 0);
  const faturamentoMedio = mesesComFat.length > 0
    ? mesesComFat.reduce((acc, f) => acc + f.valor, 0) / mesesComFat.length : 0;
  const despFixasPerc = calcDespesasFixasPercentual(totalFixas, faturamentoMedio);
  const lucroPercRaw = parseNum(lucroDesejado);
  const lucroPerc = Number.isFinite(lucroPercRaw) ? lucroPercRaw / 100 : 0;
  const markup = calcMarkup(despFixasPerc, totalVariaveis, lucroPerc);
  // custoBruto = quanto sobra do preço para o ingrediente após deduzir despesas/lucro.
  // Se >= 1 → modelo inviável (despesas + lucro absorvem 100%+ do preço).
  const custoBruto = 1 - despFixasPerc - totalVariaveis - lucroPerc;
  const custoMaxPerc = Math.max(0, custoBruto);
  const modeloInviavel = Number.isFinite(custoBruto) && custoBruto <= 0 && (despFixasPerc > 0 || totalVariaveis > 0 || lucroPerc > 0);
  const markupValido = Number.isFinite(markup) && markup > 0;
  const markupDisplay = markupValido ? `${markup.toFixed(2)}x` : '∞';

  const faturamentoOrdenado = [...faturamento].sort((a, b) => mesesCurtos.indexOf(a.mes) - mesesCurtos.indexOf(b.mes));

  // ===== STEP NUMBER CIRCLE =====
  function StepNumber({ number, color }) {
    return (
      <View style={[s.stepCircle, { backgroundColor: color }]}>
        <Text style={s.stepCircleText}>{number}</Text>
      </View>
    );
  }

  // ===== SUMMARY PANEL =====
  function SummaryPanel() {
    const slices = [
      { label: 'CMV', value: custoMaxPerc, color: colors.primary },
      { label: 'Custos Fixos', value: despFixasPerc, color: colors.coral },
      { label: 'Custos Variáveis', value: totalVariaveis, color: colors.purple },
      { label: 'Margem de Lucro', value: lucroPerc, color: colors.success },
    ].filter(sl => sl.value > 0);
    const total = slices.reduce((a, sl) => a + sl.value, 0);

    return (
      <View style={[s.summaryPanel, isDesktop && s.summaryPanelDesktop]}>
        <Text style={s.summaryTitle}>Resumo Financeiro</Text>

        {/* KPI Cards */}
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, !markupValido && { color: colors.error }]}>{markupDisplay}</Text>
            <Text style={s.kpiLabel}>Mark-up</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={s.kpiValue}>{formatPercent(despFixasPerc)}</Text>
            <Text style={s.kpiLabel}>Custos Fixos</Text>
          </View>
        </View>
        <View style={s.kpiRow}>
          <View style={s.kpiCard}>
            <Text style={s.kpiValue}>{formatPercent(totalVariaveis)}</Text>
            <Text style={s.kpiLabel}>Custos Variáveis</Text>
          </View>
          <View style={s.kpiCard}>
            <Text style={[s.kpiValue, custoMaxPerc < 0.2 && { color: colors.error }]}>
              {formatPercent(custoMaxPerc)}
            </Text>
            <Text style={s.kpiLabel}>CMV Máximo</Text>
          </View>
        </View>

        {/* Composition bar */}
        {total > 0 && (
          <View style={s.compositionSection}>
            <Text style={s.compositionTitle}>Composição do Preço</Text>
            <View style={s.stackedBar}>
              {slices.map((sl, i) => (
                <View key={i} style={{
                  flex: sl.value / total,
                  height: 12,
                  backgroundColor: sl.color,
                  borderTopLeftRadius: i === 0 ? 6 : 0,
                  borderBottomLeftRadius: i === 0 ? 6 : 0,
                  borderTopRightRadius: i === slices.length - 1 ? 6 : 0,
                  borderBottomRightRadius: i === slices.length - 1 ? 6 : 0,
                }} />
              ))}
            </View>
            <View style={s.legendRow}>
              {slices.map((sl, i) => (
                <View key={i} style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: sl.color }]} />
                  <Text style={s.legendLabel}>{sl.label}</Text>
                  <Text style={[s.legendValue, { color: sl.color }]}>{(sl.value * 100).toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {modeloInviavel && (
          <View style={s.inviabilityBanner}>
            <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 6 }} />
            <Text style={s.inviabilityText}>
              Modelo financeiro inviável: despesas + lucro ({formatPercent(despFixasPerc + totalVariaveis + lucroPerc)}) absorvem 100% ou mais do preço. Reduza despesas, aumente faturamento, ou diminua a margem de lucro.
            </Text>
          </View>
        )}

        {finStatus && !finStatus.completo && (
          <View style={s.summaryWarning}>
            <Feather name="alert-circle" size={13} color="#E65100" style={{ marginRight: 4 }} />
            <Text style={s.summaryWarningText}>Valores preliminares. Complete a configuração.</Text>
          </View>
        )}
      </View>
    );
  }

  // ===== FORM CONTENT (Steps) =====
  function FormContent() {
    return (
      <View style={[s.formColumn, isDesktop && s.formColumnDesktop]}>
        {/* Progress bar */}
        {finStatus && !finStatus.completo && (
          <View style={s.progressSection}>
            <View style={s.progressHeader}>
              <Text style={s.progressLabel}>Progresso</Text>
              <Text style={s.progressCount}>{finStatus.concluidas}/{finStatus.total} etapas</Text>
            </View>
            <View style={s.progressBarBg}>
              <View style={[s.progressBarFill, { width: `${finStatus.progresso * 100}%` }]} />
            </View>
            <View style={s.pendenciasRow}>
              {finStatus.etapas.filter(e => !e.done).map(e => (
                <View key={e.key} style={s.pendenciaChip}>
                  <Feather name="circle" size={8} color="#E65100" style={{ marginRight: 4 }} />
                  <Text style={s.pendenciaText}>{e.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
        {finStatus && finStatus.completo && (
          <View style={[s.progressSection, { backgroundColor: colors.success + '10', borderColor: colors.success + '30' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Feather name="check-circle" size={20} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={[s.progressLabel, { color: colors.success }]}>Configuração completa!</Text>
                <Text style={{ fontSize: fonts.tiny, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 2 }}>
                  Seus preços e margens serão calculados com base nestas configurações.
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={{ marginTop: spacing.sm, backgroundColor: colors.success, borderRadius: borderRadius.md, paddingVertical: spacing.sm, alignItems: 'center' }}
              onPress={() => navigation.navigate('Início')}
            >
              <Text style={{ color: '#fff', fontFamily: fontFamily.semiBold, fontSize: fonts.small }}>Voltar ao Início</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 1: Margem de Lucro */}
        <View style={s.stepCard}>
          <View style={s.stepHeader}>
            <StepNumber number={1} color={colors.success} />
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.stepTitle}>Margem de Lucro</Text>
                <InfoTooltip
                  title="Referências do mercado"
                  text="Margens de lucro líquido típicas do mercado brasileiro de alimentação:"
                  examples={[
                    'Confeitaria artesanal: 15-30%',
                    'Bolos e tortas: 20-35%',
                    'Doces finos/gourmet: 25-40%',
                    'Salgados e empadas: 15-25%',
                    'Marmitas/refeições: 10-20%',
                    'Food truck: 12-22%',
                    'Pizzaria delivery: 15-25%',
                    'Hamburgueria: 12-20%',
                    'Padaria artesanal: 10-18%',
                    'Alimentação geral: 10-20%',
                  ]}
                />
              </View>
              <Text style={s.stepSubtitle}>Rentabilidade desejada por produto</Text>
            </View>
            {lucroPerc > 0 && (
              <Chip
                label={`${(lucroPerc * 100).toFixed(0)}%`}
                color={colors.success}
                style={s.stepBadge}
              />
            )}
          </View>

          <View style={s.stepBody}>
            <TouchableOpacity
              style={s.bigValueBtn}
              activeOpacity={0.7}
              onPress={() => setCurrencyModal({
                title: 'Margem de Lucro',
                value: lucroDesejado,
                suffix: '%',
                placeholder: '15',
                onConfirm: (val) => {
                  setLucroDesejado(val);
                  setCurrencyModal(null);
                  const db_val = parseFloat(val.replace(',', '.')) / 100;
                  if (!isNaN(db_val) && db_val > 0) {
                    getDatabase().then(db => {
                      db.runAsync('UPDATE configuracao SET lucro_desejado = ? WHERE id > 0', [db_val]);
                      showSaved('Margem salva');
                      loadData();
                    });
                  }
                },
              })}
            >
              <Text style={[s.bigValueText, !lucroDesejado && { color: colors.disabled }]}>
                {lucroDesejado ? `${lucroDesejado}%` : 'Definir lucro desejado'}
              </Text>
              <Feather name="edit-2" size={14} color={colors.primary} style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            {/* Real-time markup preview */}
            <View style={s.markupPreview}>
              <Feather name="zap" size={13} color={colors.accent} />
              <Text style={s.markupPreviewText}>
                Mark-up resultante: <Text style={{ fontWeight: '800', color: markupValido ? colors.primary : colors.error }}>{markupDisplay}</Text>
              </Text>
            </View>


            {/* Margem de Segurança inline */}
            <View style={s.subSection}>
              <View style={s.subSectionHeader}>
                <Feather name="shield" size={14} color={colors.info} />
                <Text style={s.subSectionTitle}>Margem de Segurança</Text>
                <InfoTooltip
                  title="Margem de Segurança"
                  text="Percentual adicionado ao custo dos insumos para cobrir variações de preço. Evita a necessidade de atualizar preços constantemente."
                  examples={['Com 5%, um insumo de R$ 10 será calculado como R$ 10,50']}
                />
              </View>
              <TouchableOpacity
                style={s.inlineValueBtn}
                activeOpacity={0.7}
                onPress={() => setCurrencyModal({
                  title: 'Margem de Segurança',
                  value: margemSeguranca,
                  suffix: '%',
                  placeholder: '0',
                  onConfirm: (val) => {
                    setMargemSeguranca(val);
                    setCurrencyModal(null);
                    const parsed = parseFloat(val.replace(',', '.'));
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 30) {
                      getDatabase().then(db => {
                        db.runAsync('UPDATE configuracao SET margem_seguranca = ? WHERE id > 0', [parsed / 100]);
                        showSaved('Margem de segurança salva');
                        loadData();
                      });
                    }
                  },
                })}
              >
                <Text style={[s.inlineValueText, parseFloat(margemSeguranca) > 0 && s.inlineValueTextFilled]}>
                  {margemSeguranca}%
                </Text>
                <Feather name="edit-2" size={12} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* STEP 2: Faturamento Mensal */}
        <View style={s.stepCard}>
          <View style={s.stepHeader}>
            <StepNumber number={2} color={colors.accent} />
            <View style={{ flex: 1 }}>
              <Text style={s.stepTitle}>Faturamento Mensal</Text>
              <Text style={s.stepSubtitle}>Peso dos custos mensais sobre cada produto</Text>
            </View>
            {faturamentoMedio > 0 && (
              <Chip
                label={formatCurrency(faturamentoMedio)}
                color={colors.accent}
                style={s.stepBadge}
              />
            )}
          </View>

          <View style={s.stepBody}>
            {/* Mode toggle */}
            <View style={s.modeToggle}>
              <TouchableOpacity
                style={[s.modeBtn, faturamentoMode === 'media' && s.modeBtnActive]}
                onPress={() => setFaturamentoMode('media')}
              >
                <Feather name="dollar-sign" size={14} color={faturamentoMode === 'media' ? '#fff' : colors.textSecondary} />
                <Text style={[s.modeBtnText, faturamentoMode === 'media' && s.modeBtnTextActive]}>Média mensal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.modeBtn, faturamentoMode === 'mensal' && s.modeBtnActive]}
                onPress={() => setFaturamentoMode('mensal')}
              >
                <Feather name="calendar" size={14} color={faturamentoMode === 'mensal' ? '#fff' : colors.textSecondary} />
                <Text style={[s.modeBtnText, faturamentoMode === 'mensal' && s.modeBtnTextActive]}>Mês a mês</Text>
              </TouchableOpacity>
            </View>

            {faturamentoMode === 'media' ? (
              <View>
                <Text style={s.fieldHint}>Informe o faturamento médio mensal do seu negócio:</Text>
                <TouchableOpacity
                  style={s.bigValueBtn}
                  activeOpacity={0.7}
                  onPress={() => setCurrencyModal({
                    title: 'Faturamento Médio Mensal',
                    value: faturamentoMedioInput,
                    prefix: 'R$',
                    placeholder: '0,00',
                    onConfirm: (val) => {
                      setFaturamentoMedioInput(val);
                      setCurrencyModal(null);
                      salvarFaturamentoMedio(val);
                    },
                  })}
                >
                  <Text style={s.bigValueText}>
                    {faturamentoMedio > 0 ? formatCurrency(faturamentoMedio) : 'R$ 0,00'}
                  </Text>
                  <Feather name="edit-2" size={14} color={colors.primary} style={{ marginLeft: 8 }} />
                </TouchableOpacity>
              </View>
            ) : (
              <View>
                <Text style={s.fieldHint}>Preencha os meses com valores reais ou estimativas:</Text>
                <View style={s.fatGrid}>
                  {faturamentoOrdenado.map((f) => (
                    <TouchableOpacity
                      key={f.id}
                      style={[s.fatItem, isDesktop && s.fatItemDesktop]}
                      activeOpacity={0.7}
                      onPress={() => setCurrencyModal({
                        title: `Faturamento - ${f.mes}`,
                        value: f.valor > 0 ? String(f.valor).replace('.', ',') : '',
                        prefix: 'R$',
                        placeholder: '0,00',
                        onConfirm: (val) => {
                          const clean = val.replace(/[^0-9,\.]/g, '');
                          const parsed = parseNum(clean);
                          const novoValor = Number.isFinite(parsed) ? parsed : 0;
                          setFaturamento(prev => prev.map(item =>
                            item.id === f.id ? { ...item, valor: novoValor } : item
                          ));
                          salvarFaturamento(f.id, clean);
                          setCurrencyModal(null);
                        },
                      })}
                    >
                      <Text style={s.fatLabel}>{f.mes}</Text>
                      <View style={[s.fatValueBox, f.valor > 0 && s.fatValueBoxFilled]}>
                        <Text style={[s.fatValueText, f.valor > 0 && s.fatValueTextFilled]}>
                          {f.valor > 0 ? formatCurrency(f.valor) : '---'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
                <View style={s.avgRow}>
                  <Text style={s.avgLabel}>Média mensal</Text>
                  <Text style={s.avgValue}>{formatCurrency(faturamentoMedio)}</Text>
                </View>
                {mesesComFat.length > 0 && (
                  <Text style={s.avgSub}>{mesesComFat.length} {mesesComFat.length === 1 ? 'mês preenchido' : 'meses preenchidos'}</Text>
                )}
              </View>
            )}
          </View>
        </View>

        {/* STEP 3: Custos Mensais (audit P1-08 — antes "Despesas Fixas") */}
        <View style={s.stepCard}>
          <View style={s.stepHeader}>
            <StepNumber number={3} color={colors.coral} />
            <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={s.stepTitle}>Custos do mês</Text>
              <InfoTooltip
                title="O que são Custos do mês?"
                text="São contas que você paga TODO mês, mesmo que não venda nada. Aluguel, luz, internet, salário... esse dinheiro sai da sua conta no mesmo dia, independente de quanto você produziu."
                examples={['Aluguel', 'Conta de luz', 'Internet', 'Salário do funcionário', 'Contador']}
              />
            </View>
            {totalFixas > 0 && (
              <Chip
                label={formatCurrency(totalFixas)}
                color={colors.coral}
                style={s.stepBadge}
              />
            )}
          </View>

          <View style={s.stepBody}>
            <Text style={s.stepSubtitle}>O que sai todo mês, independente do que você vende</Text>

            {/* Sugestões como lista selecionável */}
            {(() => {
              const existentes = despesasFixas.map(d => d.descricao?.toLowerCase());
              const disponiveis = SUGESTOES_FIXAS.filter(s => !existentes.includes(s.toLowerCase()));
              if (disponiveis.length === 0) return null;
              return (
                <View style={s.suggestionsList}>
                  <Text style={s.suggestionsLabel}>Selecione para adicionar:</Text>
                  <View style={s.suggestionsRow}>
                    {disponiveis.map(sug => (
                      <TouchableOpacity key={sug} style={s.suggestionChip} onPress={() => adicionarSugestaoFixa(sug)}>
                        <Feather name="plus" size={12} color={colors.primary} />
                        <Text style={s.suggestionChipText}>{sug}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Clean table */}
            {despesasFixas.length > 0 && (
              <View style={s.despTable}>
                {/* Header */}
                <View style={s.despTableHeader}>
                  <Text style={[s.despTableHeaderText, { flex: 1 }]}>Descrição</Text>
                  <Text style={[s.despTableHeaderText, { width: 100, textAlign: 'right' }]}>Valor (R$)</Text>
                  <View style={{ width: 32 }} />
                </View>
                {/* Rows */}
                {despesasFixas.map((d, index) => (
                  <View key={d.id} style={[s.despTableRow, index % 2 === 0 && s.despTableRowAlt]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => editarDespesaFixa(d)}>
                      <Text style={s.despTableName} numberOfLines={1}>{d.descricao}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.despTableValueBtn}
                      onPress={() => setCurrencyModal({
                        title: d.descricao,
                        value: d.valor > 0 ? String(d.valor).replace('.', ',') : '',
                        prefix: 'R$',
                        placeholder: '0,00',
                        onConfirm: async (val) => {
                          const db = await getDatabase();
                          const parsed = parseNum(val);
                          const novoValor = Number.isFinite(parsed) ? parsed : 0;
                          await db.runAsync('UPDATE despesas_fixas SET valor = ? WHERE id = ?',
                            [novoValor, d.id]);
                          setCurrencyModal(null);
                          showSaved('Salvo');
                          loadData();
                        },
                      })}
                    >
                      <Text style={[s.despTableValue, d.valor > 0 && s.despTableValueFilled]}>
                        {d.valor > 0 ? formatCurrency(d.valor) : 'R$ 0,00'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.despDeleteBtn}
                      onPress={() => removerDespesaFixa(d.id, d.descricao)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={14} color={colors.disabled} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add inline */}
            <View style={s.addRow}>
              <TextInput
                style={[s.addInput, { flex: 1 }]}
                value={novaFixa.descricao}
                onChangeText={(v) => setNovaFixa(prev => ({ ...prev, descricao: v }))}
                placeholder="Descrição (ex: Aluguel)"
                placeholderTextColor={colors.disabled}
              />
              <TouchableOpacity
                style={s.addValueBtn}
                onPress={() => setCurrencyModal({
                  title: 'Valor do custo mensal',
                  value: novaFixa.valor,
                  prefix: 'R$',
                  placeholder: '0,00',
                  onConfirm: (val) => {
                    setNovaFixa(prev => ({ ...prev, valor: val }));
                    setCurrencyModal(null);
                  },
                })}
              >
                <Text style={[s.addValueText, novaFixa.valor ? s.addValueTextFilled : null]}>
                  {novaFixa.valor ? `R$ ${novaFixa.valor}` : 'R$ 0,00'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addCircleBtn} onPress={adicionarDespesaFixa}>
                <Feather name="plus" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Total */}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total mensal</Text>
              <Text style={s.totalValue}>{formatCurrency(totalFixas)}</Text>
            </View>
            {faturamentoMedio > 0 && (
              <Text style={s.totalSub}>Representa {formatPercent(despFixasPerc)} do faturamento</Text>
            )}

          </View>
        </View>

        {/* STEP 4: Custos por venda (audit P1-08 — antes "Despesas Variáveis") */}
        <View style={s.stepCard}>
          <View style={s.stepHeader}>
            <StepNumber number={4} color={colors.purple} />
            <View style={[{ flex: 1, flexDirection: 'row', alignItems: 'center' }]}>
              <Text style={s.stepTitle}>Custos por venda</Text>
              <InfoTooltip
                title="O que são Custos por venda?"
                text="São porcentagens que somem da sua venda toda vez que alguém compra: imposto, taxa do cartão, taxa do iFood, comissão... quanto mais você vende, mais sai. Coloque o percentual médio que costuma pagar."
                examples={['Imposto (Simples Nacional)', 'Taxa do cartão de crédito', 'Taxa do PIX', 'Comissão do iFood', 'Comissão de vendedor']}
              />
            </View>
            {totalVariaveis > 0 && (
              <Chip
                label={formatPercent(totalVariaveis)}
                color={colors.purple}
                style={s.stepBadge}
              />
            )}
          </View>

          <View style={s.stepBody}>
            <Text style={s.stepSubtitle}>Percentuais descontados sobre cada venda</Text>

            {/* Sugestões como lista selecionável */}
            {(() => {
              const existentes = despesasVariaveis.map(d => d.descricao?.toLowerCase());
              const disponiveis = SUGESTOES_VARIAVEIS.filter(s => !existentes.includes(s.toLowerCase()));
              if (disponiveis.length === 0) return null;
              return (
                <View style={s.suggestionsList}>
                  <Text style={s.suggestionsLabel}>Selecione para adicionar:</Text>
                  <View style={s.suggestionsRow}>
                    {disponiveis.map(sug => (
                      <TouchableOpacity key={sug} style={s.suggestionChip} onPress={() => adicionarSugestaoVariavel(sug)}>
                        <Feather name="plus" size={12} color={colors.primary} />
                        <Text style={s.suggestionChipText}>{sug}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })()}

            {/* Clean table */}
            {despesasVariaveis.length > 0 && (
              <View style={s.despTable}>
                <View style={s.despTableHeader}>
                  <Text style={[s.despTableHeaderText, { flex: 1 }]}>Descrição</Text>
                  <Text style={[s.despTableHeaderText, { width: 80, textAlign: 'right' }]}>Percentual</Text>
                  <View style={{ width: 32 }} />
                </View>
                {despesasVariaveis.map((d, index) => (
                  <View key={d.id} style={[s.despTableRow, index % 2 === 0 && s.despTableRowAlt]}>
                    <TouchableOpacity style={{ flex: 1 }} onPress={() => editarDespesaVariavel(d)}>
                      <Text style={s.despTableName} numberOfLines={1}>{d.descricao}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.despTableValueBtn}
                      onPress={() => setCurrencyModal({
                        title: d.descricao,
                        value: String(((d.percentual || 0) * 100).toFixed(2)).replace('.', ','),
                        suffix: '%',
                        placeholder: '0,00',
                        onConfirm: async (val) => {
                          const p = parseNum(val);
                          const finalPerc = Number.isFinite(p) ? p / 100 : 0;
                          const db = await getDatabase();
                          await db.runAsync('UPDATE despesas_variaveis SET percentual = ? WHERE id = ?',
                            [finalPerc, d.id]);
                          setCurrencyModal(null);
                          showSaved('Salvo');
                          loadData();
                        },
                      })}
                    >
                      <Text style={[s.despTableValue, d.percentual > 0 && s.despTableValueFilled]}>
                        {d.percentual > 0 ? formatPercent(d.percentual) : '0%'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={s.despDeleteBtn}
                      onPress={() => removerDespesaVariavel(d.id, d.descricao)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="trash-2" size={14} color={colors.disabled} />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            {/* Add inline */}
            <View style={s.addRow}>
              <TextInput
                style={[s.addInput, { flex: 1 }]}
                value={novaVariavel.descricao}
                onChangeText={(v) => setNovaVariavel(prev => ({ ...prev, descricao: v }))}
                placeholder="Descrição (ex: Impostos)"
                placeholderTextColor={colors.disabled}
              />
              <TouchableOpacity
                style={s.addValueBtn}
                onPress={() => setCurrencyModal({
                  title: 'Percentual da Despesa',
                  value: novaVariavel.percentual,
                  suffix: '%',
                  placeholder: '0,00',
                  onConfirm: (val) => {
                    setNovaVariavel(prev => ({ ...prev, percentual: val }));
                    setCurrencyModal(null);
                  },
                })}
              >
                <Text style={[s.addValueText, novaVariavel.percentual ? s.addValueTextFilled : null]}>
                  {novaVariavel.percentual ? `${novaVariavel.percentual}%` : '0%'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addCircleBtn} onPress={adicionarDespesaVariavel}>
                <Feather name="plus" size={18} color="#fff" />
              </TouchableOpacity>
            </View>

            {/* Total */}
            <View style={s.totalRow}>
              <Text style={s.totalLabel}>Total variável</Text>
              <Text style={s.totalValue}>{formatPercent(totalVariaveis)}</Text>
            </View>

          </View>
        </View>

        <View style={{ height: 20 }} />
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        style={s.container}
        contentContainerStyle={s.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={Platform.OS !== 'web' ? (
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        ) : undefined}
      >
        {loadError && (
          <View style={s.errorBanner}>
            <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 8 }} />
            <Text style={s.errorBannerText}>Não foi possível carregar a configuração financeira.</Text>
            <TouchableOpacity onPress={loadData} style={s.errorBannerBtn} activeOpacity={0.7}>
              <Text style={s.errorBannerBtnText}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Page header */}
        <View style={s.pageHeader}>
          <View style={s.pageHeaderIcon}>
            <Feather name="settings" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.pageTitle}>Configuração Financeira</Text>
            <Text style={s.pageSubtitle}>Base de cálculo de preços e margens</Text>
          </View>
          {finStatus && !finStatus.completo && (
            <View style={[s.statusBadge, s.statusBadgePending]}>
              <Text style={s.statusBadgeText}>{finStatus.concluidas}/{finStatus.total}</Text>
            </View>
          )}
        </View>

        {/* Desktop: 2-column layout */}
        {isDesktop ? (
          <View style={s.desktopLayout}>
            <FormContent />
            <SummaryPanel />
          </View>
        ) : (
          <View>
            <SummaryPanel />
            <FormContent />
          </View>
        )}
      </ScrollView>

      {/* Save feedback toast */}
      {savedFeedback && (
        <View style={s.toast}>
          <Feather name="check-circle" size={14} color="#fff" style={{ marginRight: 6 }} />
          <Text style={s.toastText}>{savedFeedback}</Text>
        </View>
      )}

      {/* Edit Despesa Modal */}
      <Modal visible={!!editModal && isFocused} transparent animationType="fade">
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setEditModal(null)}>
          <TouchableOpacity activeOpacity={1} style={s.modalContent} onPress={() => {}}>
            <Text style={s.modalTitle}>
              {editModal?.tipo === 'fixa' ? 'Editar custo mensal' : 'Editar custo por venda'}
            </Text>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={s.modalLabel}>Descrição</Text>
              <TextInput
                style={s.modalInput}
                value={editModal?.descricao || ''}
                onChangeText={(v) => setEditModal(prev => prev ? { ...prev, descricao: v } : null)}
                placeholder="Descrição"
                placeholderTextColor={colors.disabled}
              />
            </View>
            <View style={{ marginBottom: spacing.md }}>
              <Text style={s.modalLabel}>{editModal?.tipo === 'fixa' ? 'Valor (R$)' : 'Percentual (%)'}</Text>
              <TextInput
                style={s.modalInput}
                value={editModal?.valor || ''}
                onChangeText={(v) => setEditModal(prev => prev ? { ...prev, valor: v } : null)}
                keyboardType="numeric"
                placeholder="0,00"
                placeholderTextColor={colors.disabled}
              />
            </View>
            <View style={s.modalActions}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setEditModal(null)}>
                <Text style={s.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={salvarEdicao}>
                <Feather name="check" size={16} color="#fff" style={{ marginRight: 4 }} />
                <Text style={s.modalSaveText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <CurrencyInputModal
        visible={!!currencyModal && isFocused}
        title={currencyModal?.title}
        value={currencyModal?.value}
        prefix={currencyModal?.prefix}
        suffix={currencyModal?.suffix}
        placeholder={currencyModal?.placeholder}
        onConfirm={(val) => currencyModal?.onConfirm(val)}
        onCancel={() => setCurrencyModal(null)}
      />

      <ConfirmDeleteModal
        visible={!!confirmDelete}
        isFocused={isFocused}
        titulo={confirmDelete?.titulo}
        nome={confirmDelete?.nome}
        onConfirm={confirmDelete?.onConfirm}
        onCancel={() => setConfirmDelete(null)}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, width: '100%' },
  content: { padding: spacing.md, width: '100%', paddingBottom: 40, maxWidth: 960, alignSelf: 'center' },

  // Page header
  pageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  pageHeaderIcon: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  pageTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text,
  },
  pageSubtitle: {
    fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 1,
  },
  statusBadge: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  statusBadgeOk: { backgroundColor: colors.success + '15' },
  statusBadgePending: { backgroundColor: '#FFF3E0' },
  statusBadgeText: { fontSize: fonts.small, fontWeight: '800', color: '#E65100' },

  // Desktop layout
  desktopLayout: {
    flexDirection: 'row',
    gap: spacing.md,
  },

  // Summary Panel
  summaryPanel: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  summaryPanelDesktop: {
    width: 320,
    alignSelf: 'flex-start',
    position: 'sticky',
    top: spacing.md,
    marginBottom: 0,
  },
  summaryTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.sm + 2,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  kpiCard: {
    flex: 1,
    backgroundColor: colors.primary + '08',
    borderRadius: borderRadius.sm,
    padding: spacing.sm + 2,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '800',
    color: colors.primary, marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 10, color: colors.textSecondary, fontFamily: fontFamily.medium,
  },
  compositionSection: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  compositionTitle: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text, marginBottom: spacing.sm,
  },
  stackedBar: {
    flexDirection: 'row',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: spacing.sm,
  },
  legendRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '48%',
    marginBottom: 2,
  },
  legendDot: {
    width: 8, height: 8, borderRadius: 4, marginRight: 5,
  },
  legendLabel: {
    fontSize: 11, fontFamily: fontFamily.regular, color: colors.textSecondary, flex: 1,
  },
  legendValue: {
    fontSize: 11, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  summaryWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  summaryWarningText: {
    fontSize: 11, color: '#E65100', flex: 1,
  },

  inviabilityBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#fee2e2',
    borderRadius: borderRadius.sm,
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  inviabilityText: {
    flex: 1,
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    color: colors.error,
    lineHeight: 16,
  },

  // Error banner (loadData)
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderLeftWidth: 4,
    borderLeftColor: colors.error,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    flex: 1,
    fontSize: fonts.small,
    color: colors.error,
    fontWeight: '600',
    marginRight: spacing.sm,
  },
  errorBannerBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.error,
    borderRadius: borderRadius.sm,
  },
  errorBannerBtnText: {
    color: '#fff',
    fontSize: fonts.tiny,
    fontWeight: '700',
  },

  // Progress
  progressSection: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  progressLabel: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text,
  },
  progressCount: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary,
  },
  progressBarBg: {
    height: 6, backgroundColor: colors.border, borderRadius: 3,
    overflow: 'hidden', marginBottom: spacing.sm,
  },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: '#FF8F00' },
  pendenciasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  pendenciaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  pendenciaText: { fontSize: 11, color: '#E65100' },

  // Form column
  formColumn: { flex: 1 },
  formColumnDesktop: { flex: 1, marginRight: 0 },

  // Step cards
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    marginBottom: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    paddingBottom: 0,
  },
  stepCircle: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm + 2,
  },
  stepCircleText: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '800', color: '#fff',
  },
  stepTitle: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text,
  },
  stepSubtitle: {
    fontSize: fonts.tiny, color: colors.textSecondary, marginTop: 1,
  },
  // Visual original preservado: radius 12 (não-pílula) + padding um pouco maior.
  // Cor (bg + fg) e tipografia (fonts.tiny + fontFamily.bold) ficam por conta do Chip.
  stepBadge: {
    borderRadius: 12,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  stepBody: {
    padding: spacing.md,
    paddingTop: spacing.sm + 2,
  },

  // Big value button (margem, faturamento)
  bigValueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '08',
    borderWidth: 1.5,
    borderColor: colors.primary + '25',
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  bigValueText: {
    fontSize: fonts.title, fontFamily: fontFamily.bold, fontWeight: '800', color: colors.primary,
  },

  // Markup preview
  markupPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accent + '08',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
  },
  markupPreviewText: {
    fontSize: fonts.small, color: colors.text, marginLeft: spacing.xs,
  },

  // Benchmarks
  benchmarkRow: {
    marginBottom: spacing.sm,
  },
  benchmarkTitle: {
    fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium,
    marginBottom: spacing.xs,
  },
  benchmarkChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  benchmarkChip: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  benchmarkChipText: {
    fontSize: 11, color: colors.textSecondary,
  },

  // Sub section (margem seguranca inside step 1)
  subSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    marginTop: spacing.xs,
  },
  subSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  subSectionTitle: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.text, marginLeft: spacing.xs + 2,
  },
  inlineValueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    height: 40,
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
  },
  inlineValueText: {
    fontSize: fonts.regular, color: colors.disabled,
  },
  inlineValueTextFilled: {
    color: colors.text, fontFamily: fontFamily.semiBold, fontWeight: '600',
  },

  // Mode toggle (faturamento)
  modeToggle: {
    flexDirection: 'row',
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    padding: 3,
    marginBottom: spacing.md,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.sm - 2,
    gap: spacing.xs,
  },
  modeBtnActive: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modeBtnText: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.textSecondary,
  },
  modeBtnTextActive: {
    color: '#fff',
  },
  fieldHint: {
    fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: spacing.sm,
  },

  // Faturamento grid
  fatGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: -spacing.xs / 2,
  },
  fatItem: {
    width: '33.33%',
    paddingHorizontal: spacing.xs / 2,
    marginBottom: spacing.sm,
  },
  fatItemDesktop: { width: '25%' },
  fatLabel: {
    fontSize: 10, color: colors.textSecondary, fontWeight: '700',
    textAlign: 'center', marginBottom: 2,
  },
  fatValueBox: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm - 2,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.xs + 2, paddingHorizontal: 4,
    alignItems: 'center', minHeight: 36, justifyContent: 'center',
  },
  fatValueBoxFilled: {
    backgroundColor: colors.primary + '08', borderColor: colors.primary + '30',
  },
  fatValueText: {
    fontSize: 10, color: colors.disabled, textAlign: 'center',
  },
  fatValueTextFilled: {
    color: colors.text, fontWeight: '600',
  },
  avgRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  avgLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.text },
  avgValue: { fontSize: fonts.regular, fontWeight: '800', color: colors.primary },
  avgSub: { fontSize: 10, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },

  // Despesas table
  despTable: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
    marginBottom: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  despTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '08',
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.sm + 2,
  },
  despTableHeaderText: {
    fontSize: 11, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  despTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.xs,
    minHeight: 44,
  },
  despTableRowAlt: {
    backgroundColor: colors.inputBg + '80',
  },
  despTableName: {
    fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text,
  },
  despTableValueBtn: {
    width: 100,
    alignItems: 'flex-end',
  },
  despTableValue: {
    fontSize: fonts.small, color: colors.disabled,
  },
  despTableValueFilled: {
    color: colors.primary, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  despDeleteBtn: {
    padding: spacing.xs + 2,
    marginLeft: spacing.xs,
  },

  // Add row
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  addInput: {
    height: 40,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fonts.small,
    color: colors.text,
  },
  addValueBtn: {
    height: 40,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    minWidth: 90,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addValueText: {
    fontSize: fonts.small, color: colors.disabled,
  },
  addValueTextFilled: {
    color: colors.text, fontWeight: '600',
  },
  addCircleBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Suggestions
  suggestionsSection: {
    marginBottom: spacing.md,
  },
  suggestionsLabel: {
    fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium,
    marginBottom: spacing.xs,
  },
  suggestionsList: {
    marginTop: spacing.sm,
    marginBottom: spacing.md,
  },
  suggestionsLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  suggestionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  suggestionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '08',
    borderWidth: 1,
    borderColor: colors.primary + '20',
    borderRadius: 16,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs + 1,
    gap: 4,
  },
  suggestionChipText: {
    fontSize: fonts.tiny, color: colors.primary, fontFamily: fontFamily.medium,
  },
  inlineSuggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  miniSuggestionChip: {
    backgroundColor: colors.inputBg,
    borderRadius: 12,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  miniSuggestionText: {
    fontSize: 11, color: colors.primary, fontFamily: fontFamily.medium,
  },

  // Total row
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    marginTop: spacing.xs,
  },
  totalLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.text },
  totalValue: { fontSize: fonts.regular, fontWeight: '800', color: colors.primary },
  totalSub: { fontSize: 10, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },

  // Toast
  toast: {
    position: 'absolute', bottom: 20, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.success, borderRadius: borderRadius.full,
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  toastText: { color: colors.textLight, fontSize: fonts.small, fontWeight: '600' },

  // Edit Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.lg,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: borderRadius.lg,
    padding: spacing.lg, width: '100%', maxWidth: 400,
  },
  modalTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.lg, textAlign: 'center',
  },
  modalLabel: {
    fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, marginBottom: spacing.xs,
  },
  modalInput: {
    height: 40,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.sm,
    paddingHorizontal: spacing.sm,
    fontSize: fonts.regular,
    color: colors.text,
  },
  modalActions: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm,
  },
  modalCancelBtn: {
    flex: 1, paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  modalCancelText: {
    color: colors.textSecondary, fontWeight: '600', fontSize: fonts.regular,
  },
  modalSaveBtn: {
    flex: 1, flexDirection: 'row',
    paddingVertical: spacing.sm + 2,
    borderRadius: borderRadius.sm, backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: fonts.regular },
});
