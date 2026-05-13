/**
 * FluxoCaixaDREScreen — Feature beta gated por whitelist por email.
 *
 * REDESIGN (Sessão 28.50):
 *  - Solução SOLITÁRIA: a tela NÃO depende mais de vendas/produtos/CMV
 *    automático. Toda a DRE é editável manualmente.
 *  - Única integração com o resto do app: tabela `despesas_fixas` (toggle
 *    "Usar Financeiro" pode importar o total). User pode desligar e digitar.
 *  - Integração interna: a DRE pode opcionalmente puxar Receita Bruta /
 *    Outras Receitas / Outras Despesas do Fluxo de Caixa do mesmo mês.
 *  - Valor passou a ser TextInput inline (decimal-pad + formatação BR),
 *    nada de CurrencyInputModal.
 *  - Layout reformulado: seletor de mês proeminente compartilhado pelas 2
 *    tabs, KPIs grandes no topo, lista timeline no Fluxo, tabela com
 *    subtotais coloridos na DRE.
 *
 * Preserva: schema `fluxo_caixa_movimentos`, 2 tabs (Fluxo / DRE),
 * feature flag externo (`useFeatureFlags().dreFluxoCaixa`), navegação.
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Platform,
  TextInput, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, parseDecimalBROrZero } from '../utils/calculations';
import InputField from '../components/InputField';
import PickerSelect from '../components/PickerSelect';
import EmptyState from '../components/EmptyState';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { showToast } from '../utils/toastBus';

// ---------- helpers ----------

function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidDateStr(s) {
  if (!s || typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// "1234.56" / 1234.56 → "1.234,56"
function formatBRNumber(n) {
  const num = safeNum(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Sanitiza input de moeda enquanto o user digita: aceita só dígitos,
// vírgula e ponto; preserva o que o user digitou (não força máscara
// agressiva que move o cursor).
function sanitizeCurrencyInput(raw) {
  if (raw == null) return '';
  // Só dígitos, vírgula, ponto. Limita a 1 vírgula.
  let s = String(raw).replace(/[^\d.,]/g, '');
  // se tiver mais de uma vírgula, mantém só a primeira
  const firstComma = s.indexOf(',');
  if (firstComma >= 0) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, '');
  }
  // máximo 2 casas após vírgula
  const parts = s.split(',');
  if (parts.length === 2 && parts[1].length > 2) {
    s = parts[0] + ',' + parts[1].slice(0, 2);
  }
  return s;
}

function pad2(n) { return String(n).padStart(2, '0'); }
function getMonthKey(date) { return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`; }
function monthRange(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return { start: `${monthKey}-01`, end: `${monthKey}-${pad2(last)}` };
}
function formatMonthLabel(monthKey) {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
}
function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const date = new Date(y, m - 1 + delta, 1);
  return getMonthKey(date);
}

const TABS = [
  { key: 'fluxo', label: 'Fluxo de Caixa', icon: 'trending-up' },
  { key: 'dre', label: 'DRE', icon: 'bar-chart-2' },
];

const CATEGORIAS_ENTRADA = [
  'Vendas Balcão', 'Vendas Delivery', 'Vendas Combos', 'Outras Receitas',
];
const CATEGORIAS_SAIDA = [
  'Salários', 'Aluguel', 'Insumos', 'Embalagens', 'Marketing', 'Impostos',
  'Energia/Água', 'Internet/Telefone', 'Manutenção', 'Outros',
];

// ============================================================
// MAIN
// ============================================================
export default function FluxoCaixaDREScreen() {
  const { isDesktop } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState('fluxo');
  const [monthKey, setMonthKey] = useState(() => getMonthKey(new Date()));
  const [loading, setLoading] = useState(true);

  // Fluxo de caixa state
  const [movimentos, setMovimentos] = useState([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Form state — modal
  const [formData, setFormData] = useState('');
  const [formTipo, setFormTipo] = useState('entrada');
  const [formCategoria, setFormCategoria] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // DRE state — TUDO digitado pelo user (string para o input, número derivado).
  const emptyDre = {
    receitaBruta: '',
    deducoes: '',
    devolucoes: '',
    cmv: '',
    despesasFixas: '',
    despesasVariaveis: '',
    outrasDespesas: '',
    outrasReceitas: '',
  };
  const [dre, setDre] = useState(emptyDre);
  const [despesasFixasFromFinanceiro, setDespesasFixasFromFinanceiro] = useState(0);
  // Toggle: usar custos fixos do Financeiro automaticamente?
  const [useFixasFromFinanceiro, setUseFixasFromFinanceiro] = useState(true);
  const [showDespesasFixasDetail, setShowDespesasFixasDetail] = useState(false);
  const [despesasFixasList, setDespesasFixasList] = useState([]);

  // ---------- LOAD FLUXO ----------
  const reloadMovimentos = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const { start, end } = monthRange(monthKey);
      const [rows, anteriores] = await Promise.all([
        db.getAllAsync(
          'SELECT * FROM fluxo_caixa_movimentos WHERE data >= ? AND data <= ? ORDER BY data DESC',
          [start, end]
        ).catch((e) => { console.warn('[FluxoCaixaDRE.load]', e?.message || e); return []; }),
        db.getAllAsync(
          'SELECT tipo, COALESCE(SUM(valor), 0) AS total FROM fluxo_caixa_movimentos WHERE data < ? GROUP BY tipo',
          [start]
        ).catch((e) => { console.warn('[FluxoCaixaDRE.saldoInicial]', e?.message || e); return []; }),
      ]);
      setMovimentos(rows || []);
      let saldo = 0;
      for (const r of (anteriores || [])) {
        const v = safeNum(r.total);
        if (r.tipo === 'entrada') saldo += v;
        else saldo -= v;
      }
      setSaldoInicial(saldo);
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useFocusEffect(useCallback(() => { reloadMovimentos(); }, [reloadMovimentos]));

  // ---------- LOAD DESPESAS FIXAS (Financeiro) ----------
  const reloadDespesasFixas = useCallback(async () => {
    try {
      const db = await getDatabase();
      const rows = await db.getAllAsync('SELECT * FROM despesas_fixas').catch(() => []);
      setDespesasFixasList(rows || []);
      const total = (rows || []).reduce((s, d) => s + safeNum(d.valor), 0);
      setDespesasFixasFromFinanceiro(total);
    } catch (e) {
      console.warn('[FluxoCaixaDRE.despesasFixas]', e?.message || e);
    }
  }, []);

  useEffect(() => { reloadDespesasFixas(); }, [reloadDespesasFixas]);

  // Se o toggle "Usar do Financeiro" está ligado, sincroniza o campo.
  useEffect(() => {
    if (useFixasFromFinanceiro) {
      setDre(prev => ({
        ...prev,
        despesasFixas: despesasFixasFromFinanceiro > 0
          ? formatBRNumber(despesasFixasFromFinanceiro) : '',
      }));
    }
  }, [useFixasFromFinanceiro, despesasFixasFromFinanceiro]);

  // ---------- FLUXO sumário ----------
  const resumo = useMemo(() => {
    let entradas = 0, saidas = 0;
    for (const m of movimentos) {
      const v = safeNum(m.valor);
      if (m.tipo === 'entrada') entradas += v;
      else saidas += v;
    }
    return { entradas, saidas, saldoInicial, saldoFinal: saldoInicial + entradas - saidas };
  }, [movimentos, saldoInicial]);

  // ---------- DRE valores numéricos ----------
  const dreNum = useMemo(() => ({
    receitaBruta: parseDecimalBROrZero(dre.receitaBruta),
    deducoes: parseDecimalBROrZero(dre.deducoes),
    devolucoes: parseDecimalBROrZero(dre.devolucoes),
    cmv: parseDecimalBROrZero(dre.cmv),
    despesasFixas: parseDecimalBROrZero(dre.despesasFixas),
    despesasVariaveis: parseDecimalBROrZero(dre.despesasVariaveis),
    outrasDespesas: parseDecimalBROrZero(dre.outrasDespesas),
    outrasReceitas: parseDecimalBROrZero(dre.outrasReceitas),
  }), [dre]);

  const dreLinhas = useMemo(() => {
    const receitaLiquida = dreNum.receitaBruta - dreNum.deducoes - dreNum.devolucoes;
    const lucroBruto = receitaLiquida - dreNum.cmv;
    const totalOperacionais = dreNum.despesasFixas + dreNum.despesasVariaveis;
    const lucroOperacional = lucroBruto - totalOperacionais;
    const lucroLiquido = lucroOperacional - dreNum.outrasDespesas + dreNum.outrasReceitas;
    return { receitaLiquida, lucroBruto, totalOperacionais, lucroOperacional, lucroLiquido };
  }, [dreNum]);

  // ---------- FORM helpers ----------
  function abrirNovo() {
    setEditing(null);
    setFormData(new Date().toISOString().slice(0, 10));
    setFormTipo('entrada');
    setFormCategoria('');
    setFormDescricao('');
    setFormValor('');
    setFormErrors({});
    setModalOpen(true);
  }

  function abrirEdicao(mov) {
    setEditing(mov);
    setFormData(mov.data || new Date().toISOString().slice(0, 10));
    setFormTipo(mov.tipo || 'entrada');
    setFormCategoria(mov.categoria || '');
    setFormDescricao(mov.descricao || '');
    setFormValor(formatBRNumber(mov.valor));
    setFormErrors({});
    setModalOpen(true);
  }

  function validateForm() {
    const errs = {};
    if (!isValidDateStr(formData)) errs.data = 'Data inválida (use AAAA-MM-DD).';
    if (formTipo !== 'entrada' && formTipo !== 'saida') errs.tipo = 'Selecione entrada ou saída.';
    const v = parseDecimalBROrZero(formValor);
    if (!(v > 0)) errs.valor = 'Valor deve ser maior que zero.';
    if (!formCategoria) errs.categoria = 'Selecione uma categoria.';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function salvarMovimento() {
    if (!validateForm()) {
      showToast('Verifique os campos do formulário', 'alert-triangle');
      return;
    }
    const valor = parseDecimalBROrZero(formValor);
    try {
      const db = await getDatabase();
      const isEdit = !!editing?.id;
      if (isEdit) {
        await db.runAsync(
          'UPDATE fluxo_caixa_movimentos SET data = ?, tipo = ?, categoria = ?, descricao = ?, valor = ? WHERE id = ?',
          [formData, formTipo, formCategoria || null, formDescricao || null, valor, editing.id]
        );
      } else {
        await db.runAsync(
          'INSERT INTO fluxo_caixa_movimentos (data, tipo, categoria, descricao, valor) VALUES (?, ?, ?, ?, ?)',
          [formData, formTipo, formCategoria || null, formDescricao || null, valor]
        );
      }
      setModalOpen(false);
      showToast(isEdit ? 'Movimento atualizado' : 'Movimento registrado', 'check-circle');
      await reloadMovimentos();
    } catch (e) {
      console.error('[FluxoCaixaDRE.salvar]', e);
      if (typeof window !== 'undefined' && window.alert) {
        window.alert('Erro ao salvar movimento: ' + (e?.message || ''));
      }
    }
  }

  async function excluirMovimento(id) {
    try {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM fluxo_caixa_movimentos WHERE id = ?', [id]);
      setConfirmDelete(null);
      showToast('Movimento removido', 'trash-2');
      await reloadMovimentos();
    } catch (e) {
      console.error('[FluxoCaixaDRE.excluir]', e);
    }
  }

  // ---------- INTEGRAÇÃO Fluxo → DRE ----------
  // "Importar do Fluxo": preenche Receita Bruta = soma de entradas do mês
  // (exceto categoria "Outras Receitas") e Outras Receitas/Despesas das
  // categorias específicas. NÃO toca CMV nem despesas variáveis.
  function importarDoFluxo() {
    let receita = 0, outrasRec = 0, outrasDesp = 0;
    for (const m of movimentos) {
      const cat = String(m.categoria || '');
      const v = safeNum(m.valor);
      if (m.tipo === 'entrada') {
        if (cat === 'Outras Receitas') outrasRec += v;
        else receita += v;
      } else {
        if (cat === 'Outros') outrasDesp += v;
      }
    }
    setDre(prev => ({
      ...prev,
      receitaBruta: receita > 0 ? formatBRNumber(receita) : prev.receitaBruta,
      outrasReceitas: outrasRec > 0 ? formatBRNumber(outrasRec) : prev.outrasReceitas,
      outrasDespesas: outrasDesp > 0 ? formatBRNumber(outrasDesp) : prev.outrasDespesas,
    }));
    showToast('Valores importados do Fluxo de Caixa', 'download');
  }

  function setDreField(field, raw) {
    const s = sanitizeCurrencyInput(raw);
    setDre(prev => ({ ...prev, [field]: s }));
    // Se o user editou despesas fixas manualmente, desliga o toggle automático.
    if (field === 'despesasFixas' && useFixasFromFinanceiro) {
      setUseFixasFromFinanceiro(false);
    }
  }

  function resetDre() {
    setDre(emptyDre);
    setUseFixasFromFinanceiro(true);
    showToast('DRE limpo', 'rotate-ccw');
  }

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <View style={styles.container}>
      <View style={styles.pageShell}>
        {/* ===== Seletor de mês PROEMINENTE (compartilhado pelas 2 tabs) ===== */}
        <View style={styles.monthHero}>
          <TouchableOpacity
            onPress={() => setMonthKey(m => shiftMonth(m, -1))}
            style={styles.monthArrow}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
          >
            <Feather name="chevron-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <View style={styles.monthCenter}>
            <Text style={styles.monthEyebrow}>PERÍODO</Text>
            <Text style={styles.monthLabel}>{formatMonthLabel(monthKey)}</Text>
          </View>
          <TouchableOpacity
            onPress={() => setMonthKey(m => shiftMonth(m, +1))}
            style={styles.monthArrow}
            accessibilityRole="button"
            accessibilityLabel="Próximo mês"
          >
            <Feather name="chevron-right" size={22} color={colors.primary} />
          </TouchableOpacity>
          {monthKey !== getMonthKey(new Date()) ? (
            <TouchableOpacity
              onPress={() => setMonthKey(getMonthKey(new Date()))}
              style={styles.todayChip}
              accessibilityRole="button"
              accessibilityLabel="Voltar para o mês atual"
            >
              <Feather name="calendar" size={12} color={colors.primary} />
              <Text style={styles.todayChipText}>Hoje</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* ===== Tabs ===== */}
        <View style={styles.tabsRow}>
          {TABS.map(t => {
            const active = activeTab === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, active && styles.tabActive]}
                onPress={() => setActiveTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Feather name={t.icon} size={16} color={active ? colors.primary : colors.textSecondary} />
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          {activeTab === 'fluxo' ? (
            <FluxoTab
              loading={loading}
              movimentos={movimentos}
              resumo={resumo}
              onAdd={abrirNovo}
              onEdit={abrirEdicao}
              onDelete={(mov) => setConfirmDelete(mov)}
              isDesktop={isDesktop}
            />
          ) : (
            <DRETab
              dre={dre}
              dreNum={dreNum}
              linhas={dreLinhas}
              setDreField={setDreField}
              onResetDre={resetDre}
              onImportarFluxo={importarDoFluxo}
              useFixasFromFinanceiro={useFixasFromFinanceiro}
              setUseFixasFromFinanceiro={setUseFixasFromFinanceiro}
              despesasFixasFromFinanceiro={despesasFixasFromFinanceiro}
              despesasFixasList={despesasFixasList}
              showDespesasFixasDetail={showDespesasFixasDetail}
              setShowDespesasFixasDetail={setShowDespesasFixasDetail}
              monthLabel={formatMonthLabel(monthKey)}
              isDesktop={isDesktop}
            />
          )}
        </ScrollView>

        {/* FAB sticky no Fluxo (mobile e web) */}
        {activeTab === 'fluxo' ? (
          <TouchableOpacity
            onPress={abrirNovo}
            style={[styles.fab, isDesktop && styles.fabDesktop]}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Adicionar movimento"
          >
            <Feather name="plus" size={isDesktop ? 18 : 22} color="#fff" />
            {isDesktop ? <Text style={styles.fabLabel}>Adicionar movimento</Text> : null}
          </TouchableOpacity>
        ) : null}
      </View>

      {/* ===== Modal cadastro / edição ===== */}
      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editing ? 'Editar movimento' : 'Novo movimento'}
              </Text>
              <TouchableOpacity onPress={() => setModalOpen(false)} accessibilityLabel="Fechar">
                <Feather name="x" size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 520 }}>
              {/* Data */}
              <Text style={styles.fieldLabel}>Data</Text>
              {Platform.OS === 'web' ? (
                <input
                  type="date"
                  value={formData}
                  onChange={(e) => setFormData(e.target.value)}
                  style={{
                    width: '100%',
                    boxSizing: 'border-box',
                    padding: '10px 12px',
                    fontSize: 14,
                    fontFamily: 'inherit',
                    backgroundColor: colors.inputBg,
                    border: `1px solid ${formErrors.data ? colors.error : colors.border}`,
                    borderRadius: borderRadius.sm,
                    color: colors.text,
                    marginBottom: 4,
                    outline: 'none',
                  }}
                />
              ) : (
                <TextInput
                  style={[
                    styles.dateInputNative,
                    formErrors.data && { borderColor: colors.error },
                  ]}
                  value={formData}
                  onChangeText={setFormData}
                  placeholder="AAAA-MM-DD"
                  placeholderTextColor={colors.placeholder}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              )}
              {formErrors.data ? <Text style={styles.errorText}>{formErrors.data}</Text> : null}

              {/* Tipo */}
              <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Tipo</Text>
              <View style={styles.chipRow}>
                {['entrada', 'saida'].map(t => {
                  const sel = formTipo === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => { setFormTipo(t); setFormCategoria(''); }}
                      style={[styles.chip, sel && styles.chipActive]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: sel }}
                    >
                      <Feather
                        name={t === 'entrada' ? 'arrow-down-circle' : 'arrow-up-circle'}
                        size={14}
                        color={sel ? '#fff' : (t === 'entrada' ? colors.success : colors.error)}
                      />
                      <Text style={[styles.chipText, sel && styles.chipTextActive]}>
                        {t === 'entrada' ? 'Entrada' : 'Saída'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <PickerSelect
                label="Categoria"
                value={formCategoria}
                placeholder="Selecione..."
                options={(formTipo === 'entrada' ? CATEGORIAS_ENTRADA : CATEGORIAS_SAIDA).map(c => ({ value: c, label: c }))}
                onValueChange={setFormCategoria}
              />
              {formErrors.categoria ? <Text style={styles.errorText}>{formErrors.categoria}</Text> : null}

              <InputField
                label="Descrição (opcional)"
                value={formDescricao}
                onChangeText={setFormDescricao}
                placeholder="Ex: Aluguel maio, pagamento fornecedor X"
              />

              {/* Valor — TextInput INLINE com prefixo R$, sem modal */}
              <InputField
                label="Valor (R$)"
                value={formValor}
                onChangeText={(v) => {
                  const sanitized = sanitizeCurrencyInput(v);
                  setFormValor(sanitized);
                  if (formErrors.valor && parseDecimalBROrZero(sanitized) > 0) {
                    setFormErrors(prev => ({ ...prev, valor: undefined }));
                  }
                }}
                placeholder="0,00"
                keyboardType="decimal-pad"
                inputMode="decimal"
                prefix="R$"
                error={!!formErrors.valor}
                errorText={formErrors.valor}
              />
            </ScrollView>
            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setModalOpen(false)}
                style={[styles.btn, styles.btnGhost]}
              >
                <Text style={styles.btnGhostText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={salvarMovimento}
                style={[styles.btn, styles.btnPrimary]}
              >
                <Feather name="check" size={16} color="#fff" />
                <Text style={styles.btnPrimaryText}>Salvar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <ConfirmDeleteModal
        visible={!!confirmDelete}
        titulo="Excluir movimento?"
        nome={confirmDelete?.descricao || confirmDelete?.categoria || 'este movimento'}
        onConfirm={() => excluirMovimento(confirmDelete?.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </View>
  );
}

// ============================================================
// Aba 1 — Fluxo de Caixa
// ============================================================
function FluxoTab({ loading, movimentos, resumo, onAdd, onEdit, onDelete, isDesktop }) {
  return (
    <>
      {/* KPIs grandes no topo */}
      <View style={[styles.kpiRow, !isDesktop && styles.kpiRowMobile]}>
        <KPICard
          label="Saldo inicial"
          value={formatCurrency(resumo.saldoInicial)}
          color={colors.textSecondary}
          icon="anchor"
        />
        <KPICard
          label="Entradas"
          value={formatCurrency(resumo.entradas)}
          color={colors.success}
          icon="arrow-down-circle"
        />
        <KPICard
          label="Saídas"
          value={formatCurrency(resumo.saidas)}
          color={colors.error}
          icon="arrow-up-circle"
        />
        <KPICard
          label="Saldo final"
          value={formatCurrency(resumo.saldoFinal)}
          color={resumo.saldoFinal >= 0 ? colors.primary : colors.error}
          icon={resumo.saldoFinal >= 0 ? 'trending-up' : 'trending-down'}
          highlight
        />
      </View>

      {/* Section title */}
      <View style={styles.sectionTitleRow}>
        <Text style={styles.sectionTitle}>MOVIMENTAÇÕES DO MÊS</Text>
        <Text style={styles.sectionCount}>
          {movimentos.length} {movimentos.length === 1 ? 'item' : 'itens'}
        </Text>
      </View>

      {/* Lista */}
      {loading ? (
        <View style={{ padding: 40, alignItems: 'center' }}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : movimentos.length === 0 ? (
        <EmptyState
          icon="inbox"
          title="Nenhum movimento"
          description="Toque em + Adicionar para registrar uma entrada ou saída do seu caixa."
          ctaLabel="+ Adicionar"
          onPress={onAdd}
        />
      ) : (
        <View style={styles.timeline}>
          {movimentos.map(m => {
            const isEntrada = m.tipo === 'entrada';
            return (
              <TouchableOpacity
                key={m.id}
                style={styles.movRow}
                onPress={() => onEdit(m)}
                accessibilityRole="button"
                accessibilityLabel={`Editar ${m.descricao || m.categoria}`}
              >
                <View style={[
                  styles.movIconBadge,
                  { backgroundColor: (isEntrada ? colors.success : colors.error) + '15' },
                ]}>
                  <Feather
                    name={isEntrada ? 'arrow-down-right' : 'arrow-up-right'}
                    size={16}
                    color={isEntrada ? colors.success : colors.error}
                  />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.movDesc} numberOfLines={1}>
                    {m.descricao || m.categoria || (isEntrada ? 'Entrada' : 'Saída')}
                  </Text>
                  <Text style={styles.movSub} numberOfLines={1}>
                    {(m.data || '').split('-').reverse().join('/')}
                    {m.categoria ? `  •  ${m.categoria}` : ''}
                  </Text>
                </View>
                <Text style={[
                  styles.movValor,
                  { color: isEntrada ? colors.success : colors.error },
                ]}>
                  {isEntrada ? '+ ' : '- '}{formatCurrency(safeNum(m.valor))}
                </Text>
                <TouchableOpacity
                  onPress={(e) => { e?.stopPropagation?.(); onDelete(m); }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.movDelete}
                  accessibilityRole="button"
                  accessibilityLabel="Excluir movimento"
                >
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </>
  );
}

function KPICard({ label, value, color, icon, highlight }) {
  return (
    <View style={[styles.kpiCard, highlight && styles.kpiCardHighlight]}>
      <View style={styles.kpiHeader}>
        {icon ? (
          <View style={[styles.kpiIconBubble, { backgroundColor: color + '15' }]}>
            <Feather name={icon} size={14} color={color} />
          </View>
        ) : null}
        <Text style={styles.kpiLabel}>{label}</Text>
      </View>
      <Text style={[styles.kpiValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ============================================================
// Aba 2 — DRE
// ============================================================
function DRETab({
  dre, dreNum, linhas, setDreField, onResetDre, onImportarFluxo,
  useFixasFromFinanceiro, setUseFixasFromFinanceiro,
  despesasFixasFromFinanceiro, despesasFixasList,
  showDespesasFixasDetail, setShowDespesasFixasDetail,
  monthLabel, isDesktop,
}) {
  const receita = dreNum.receitaBruta;

  function pctText(valor) {
    if (receita <= 0) return '';
    const p = (safeNum(valor) / receita) * 100;
    return `${p.toFixed(1).replace('.', ',')}%`;
  }

  return (
    <>
      {/* KPIs DRE */}
      <View style={[styles.kpiRow, !isDesktop && styles.kpiRowMobile]}>
        <KPICard
          label="Receita Bruta"
          value={formatCurrency(dreNum.receitaBruta)}
          color={colors.primary}
          icon="dollar-sign"
        />
        <KPICard
          label="CMV"
          value={formatCurrency(dreNum.cmv)}
          color={colors.warning}
          icon="package"
        />
        <KPICard
          label="Lucro Bruto"
          value={formatCurrency(linhas.lucroBruto)}
          color={linhas.lucroBruto >= 0 ? colors.success : colors.error}
          icon="trending-up"
        />
        <KPICard
          label="Lucro Líquido"
          value={formatCurrency(linhas.lucroLiquido)}
          color={linhas.lucroLiquido >= 0 ? colors.primary : colors.error}
          icon={linhas.lucroLiquido >= 0 ? 'check-circle' : 'alert-circle'}
          highlight
        />
      </View>

      {/* Ações */}
      <View style={styles.dreActions}>
        <TouchableOpacity onPress={onImportarFluxo} style={[styles.btn, styles.btnOutline, { flex: 1 }]}>
          <Feather name="download" size={16} color={colors.primary} />
          <Text style={styles.btnOutlineText}>Importar do Fluxo</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onResetDre} style={[styles.btn, styles.btnGhost, { flex: 1 }]}>
          <Feather name="rotate-ccw" size={16} color={colors.textSecondary} />
          <Text style={styles.btnGhostText}>Limpar</Text>
        </TouchableOpacity>
      </View>

      {/* Helper */}
      <View style={styles.dreHelperBox}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={styles.dreHelperText}>
          Você pode editar qualquer valor desta DRE. Pra agilizar, use{' '}
          <Text style={{ fontFamily: fontFamily.semiBold }}>Importar do Fluxo</Text>
          {' '}(puxa a Receita Bruta automaticamente) ou ative{' '}
          <Text style={{ fontFamily: fontFamily.semiBold }}>Usar cadastro do Financeiro</Text>
          {' '}nas Despesas Fixas. Os valores em cinza mostram o % de cada item sobre a Receita Bruta.
        </Text>
      </View>

      {/* ===== Tabela DRE ===== */}
      <View style={styles.dreCard}>
        <Text style={styles.sectionTitle}>DEMONSTRATIVO — {monthLabel.toUpperCase()}</Text>

        <DREEditableRow
          label="RECEITA BRUTA"
          value={dre.receitaBruta}
          numValue={dreNum.receitaBruta}
          onChangeText={(v) => setDreField('receitaBruta', v)}
          showPct={false}
          pctText={null}
          bold
        />
        <DREEditableRow
          label="(-) Deduções (impostos, taxas)"
          value={dre.deducoes}
          numValue={dreNum.deducoes}
          onChangeText={(v) => setDreField('deducoes', v)}
          indent
          showPct
          pctText={pctText(dreNum.deducoes)}
        />
        <DREEditableRow
          label="(-) Devoluções"
          value={dre.devolucoes}
          numValue={dreNum.devolucoes}
          onChangeText={(v) => setDreField('devolucoes', v)}
          indent
          showPct
          pctText={pctText(dreNum.devolucoes)}
        />

        <DRESubtotalRow
          label="= RECEITA LÍQUIDA"
          value={linhas.receitaLiquida}
          pctText={pctText(linhas.receitaLiquida)}
        />

        <DRESectionHeader title="CUSTOS" />
        <DREEditableRow
          label="(-) Custo dos Produtos Vendidos (CMV)"
          value={dre.cmv}
          numValue={dreNum.cmv}
          onChangeText={(v) => setDreField('cmv', v)}
          indent
          showPct
          pctText={pctText(dreNum.cmv)}
        />

        <DRESubtotalRow
          label="= LUCRO BRUTO"
          value={linhas.lucroBruto}
          pctText={pctText(linhas.lucroBruto)}
          highlight
        />

        <DRESectionHeader title="DESPESAS OPERACIONAIS" />

        {/* Despesas Fixas — com toggle "Usar do Financeiro" */}
        <View style={styles.dreFixasBox}>
          <DREEditableRow
            label="(-) Despesas Fixas"
            value={dre.despesasFixas}
            numValue={dreNum.despesasFixas}
            onChangeText={(v) => setDreField('despesasFixas', v)}
            indent
            showPct
            pctText={pctText(dreNum.despesasFixas)}
            noBorder
          />
          <View style={styles.dreToggleRow}>
            <TouchableOpacity
              onPress={() => setUseFixasFromFinanceiro(v => !v)}
              style={styles.dreToggle}
              accessibilityRole="switch"
              accessibilityState={{ checked: useFixasFromFinanceiro }}
            >
              <View style={[
                styles.dreToggleTrack,
                useFixasFromFinanceiro && styles.dreToggleTrackOn,
              ]}>
                <View style={[
                  styles.dreToggleThumb,
                  useFixasFromFinanceiro && styles.dreToggleThumbOn,
                ]} />
              </View>
              <Text style={styles.dreToggleLabel}>
                Usar custos fixos do Financeiro
                {useFixasFromFinanceiro && despesasFixasFromFinanceiro > 0
                  ? ` (${formatCurrency(despesasFixasFromFinanceiro)})` : ''}
              </Text>
            </TouchableOpacity>
            {despesasFixasList.length > 0 ? (
              <TouchableOpacity
                onPress={() => setShowDespesasFixasDetail(v => !v)}
                style={styles.dreDetailBtn}
                accessibilityRole="button"
              >
                <Feather
                  name={showDespesasFixasDetail ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.primary}
                />
                <Text style={styles.dreDetailBtnText}>Detalhar</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {showDespesasFixasDetail ? (
            <View style={styles.dreFixasDetail}>
              {despesasFixasList.length === 0 ? (
                <Text style={styles.dreFixasEmpty}>
                  Nenhuma despesa fixa cadastrada no Financeiro.
                </Text>
              ) : despesasFixasList.map(d => (
                <View key={d.id} style={styles.dreFixaItem}>
                  <Text style={styles.dreFixaDesc} numberOfLines={1}>
                    {d.descricao || '(sem nome)'}
                  </Text>
                  <Text style={styles.dreFixaValor}>
                    {formatCurrency(safeNum(d.valor))}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <DREEditableRow
          label="(-) Despesas Variáveis"
          value={dre.despesasVariaveis}
          numValue={dreNum.despesasVariaveis}
          onChangeText={(v) => setDreField('despesasVariaveis', v)}
          indent
          showPct
          pctText={pctText(dreNum.despesasVariaveis)}
        />

        <DRESubtotalRow
          label="(=) Total Despesas Operacionais"
          value={linhas.totalOperacionais}
          pctText={pctText(linhas.totalOperacionais)}
          muted
        />

        <DRESubtotalRow
          label="= LUCRO OPERACIONAL"
          value={linhas.lucroOperacional}
          pctText={pctText(linhas.lucroOperacional)}
          highlight
        />

        <DRESectionHeader title="NÃO-OPERACIONAIS" />
        <DREEditableRow
          label="(+) Outras Receitas"
          value={dre.outrasReceitas}
          numValue={dreNum.outrasReceitas}
          onChangeText={(v) => setDreField('outrasReceitas', v)}
          indent
          showPct
          pctText={pctText(dreNum.outrasReceitas)}
        />
        <DREEditableRow
          label="(-) Outras Despesas"
          value={dre.outrasDespesas}
          numValue={dreNum.outrasDespesas}
          onChangeText={(v) => setDreField('outrasDespesas', v)}
          indent
          showPct
          pctText={pctText(dreNum.outrasDespesas)}
        />

        <DRESubtotalRow
          label="= LUCRO LÍQUIDO"
          value={linhas.lucroLiquido}
          pctText={pctText(linhas.lucroLiquido)}
          highlight
          big
        />
      </View>

      <Text style={styles.dreFooter}>
        Estrutura DRE simplificada para pequeno negócio — referência ContaAzul / Granatum / Bling.
      </Text>
    </>
  );
}

function DRESectionHeader({ title }) {
  return (
    <View style={styles.dreSectionHeader}>
      <Text style={styles.dreSectionHeaderText}>{title}</Text>
    </View>
  );
}

function DREEditableRow({
  label, value, numValue, onChangeText, indent, showPct, pctText, bold, noBorder,
}) {
  return (
    <View style={[
      styles.dreRow,
      noBorder && { borderBottomWidth: 0 },
    ]}>
      <Text
        style={[
          styles.dreLabel,
          indent && { paddingLeft: 14 },
          bold && { fontFamily: fontFamily.bold, fontSize: 14 },
        ]}
        numberOfLines={2}
      >
        {label}
      </Text>
      <View style={styles.dreValueCol}>
        <View style={styles.dreInputWrap}>
          <Text style={styles.dreInputPrefix}>R$</Text>
          <TextInput
            style={styles.dreInput}
            value={String(value ?? '')}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0,00"
            placeholderTextColor={colors.placeholder}
            selectTextOnFocus
          />
        </View>
        {showPct ? (
          <Text style={styles.drePctText}>{pctText || ''}</Text>
        ) : null}
      </View>
    </View>
  );
}

function DRESubtotalRow({ label, value, pctText, highlight, big, muted }) {
  const positive = (value || 0) >= 0;
  const bg = muted
    ? colors.background
    : highlight
      ? (positive ? colors.success + '12' : colors.error + '12')
      : colors.primary + '06';
  const borderColor = muted
    ? colors.border
    : highlight
      ? (positive ? colors.success + '40' : colors.error + '40')
      : colors.primary + '30';
  const valueColor = highlight
    ? (positive ? colors.success : colors.error)
    : colors.text;
  return (
    <View style={[
      styles.dreSubtotalRow,
      { backgroundColor: bg, borderColor },
    ]}>
      <Text style={[
        styles.dreSubtotalLabel,
        big && { fontSize: 15, fontFamily: fontFamily.bold },
      ]}>{label}</Text>
      <View style={styles.dreValueCol}>
        <Text style={[
          styles.dreSubtotalValue,
          { color: valueColor },
          big && { fontSize: 18 },
        ]}>
          {formatCurrency(value || 0)}
        </Text>
        {pctText ? <Text style={styles.drePctText}>{pctText}</Text> : null}
      </View>
    </View>
  );
}

// ============================================================
// STYLES
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageShell: { flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  content: { padding: spacing.md, paddingBottom: 120 },

  // -------- Month hero --------
  monthHero: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  monthCenter: { flex: 1, alignItems: 'center' },
  monthEyebrow: {
    fontSize: 10, fontFamily: fontFamily.semiBold,
    color: colors.textSecondary, letterSpacing: 1.2,
    marginBottom: 2,
  },
  monthLabel: {
    fontSize: fonts.large, fontFamily: fontFamily.bold,
    color: colors.text, textTransform: 'capitalize',
  },
  monthArrow: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '12',
  },
  todayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '10',
  },
  todayChipText: {
    fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.primary,
  },

  // -------- Tabs --------
  tabsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1, borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md,
    alignItems: 'center', flexDirection: 'row', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
    justifyContent: 'center',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  tabTextActive: { color: colors.primary },

  // -------- KPI cards --------
  kpiRow: {
    flexDirection: 'row', gap: spacing.sm,
    marginBottom: spacing.md,
  },
  kpiRowMobile: { flexWrap: 'wrap' },
  kpiCard: {
    flex: 1, minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md - 2,
    borderWidth: 1, borderColor: colors.border + '80',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,77,71,0.06)' },
      default: { elevation: 1, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 2 },
    }),
  },
  kpiCardHighlight: {
    borderColor: colors.primary + '50',
    backgroundColor: colors.primary + '06',
  },
  kpiHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  kpiIconBubble: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  kpiLabel: {
    fontSize: 11, color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    letterSpacing: 0.3,
  },
  kpiValue: {
    fontSize: 20, fontFamily: fontFamily.bold,
    marginTop: 2,
  },

  // -------- Section title --------
  sectionTitleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.sm, marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 12, fontFamily: fontFamily.bold,
    color: colors.textSecondary, letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionCount: {
    fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium,
  },

  // -------- Timeline (movimentos) --------
  timeline: { gap: spacing.xs },
  movRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.border + '50',
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,77,71,0.04)' },
      default: {},
    }),
  },
  movIconBadge: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  movDesc: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.text },
  movSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  movValor: { fontSize: 14, fontFamily: fontFamily.bold, marginLeft: spacing.sm },
  movDelete: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.inputBg,
    marginLeft: spacing.xs,
  },

  // -------- FAB sticky --------
  fab: {
    position: 'absolute',
    right: 20, bottom: 86,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: colors.primary,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,77,71,0.25)' },
      default: { elevation: 6, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 4 },
    }),
  },
  fabDesktop: {
    bottom: 24,
    width: 'auto', height: 'auto',
    paddingHorizontal: 18, paddingVertical: 12,
    borderRadius: borderRadius.md,
  },
  fabLabel: {
    color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 14,
  },

  // -------- Modal --------
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    width: '100%', maxWidth: 520,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  modalTitle: { fontSize: 18, fontFamily: fontFamily.bold, color: colors.text },
  modalFooter: {
    flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md,
  },
  fieldLabel: {
    fontSize: 13, fontFamily: fontFamily.medium, color: colors.textSecondary,
    marginBottom: 6, marginTop: spacing.xs,
  },
  errorText: {
    fontSize: 11, color: colors.error, marginTop: 4, marginBottom: 4,
    fontFamily: fontFamily.medium,
  },
  dateInputNative: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm,
    color: colors.text,
    fontSize: 14,
  },
  chipRow: { flexDirection: 'row', gap: 8, marginBottom: spacing.sm },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.inputBg,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontFamily: fontFamily.medium, color: colors.text },
  chipTextActive: { color: '#fff' },

  // -------- Buttons --------
  btn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    minHeight: 44,
  },
  btnPrimary: { backgroundColor: colors.primary },
  btnPrimaryText: { color: '#fff', fontFamily: fontFamily.semiBold, fontSize: 14 },
  btnOutline: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: colors.primary },
  btnOutlineText: { color: colors.primary, fontFamily: fontFamily.semiBold, fontSize: 14 },
  btnGhost: { backgroundColor: 'transparent' },
  btnGhostText: { color: colors.textSecondary, fontFamily: fontFamily.semiBold, fontSize: 14 },

  // -------- DRE --------
  dreActions: {
    flexDirection: 'row', gap: spacing.sm,
    marginBottom: spacing.md, flexWrap: 'wrap',
  },
  dreHelperBox: {
    flexDirection: 'row', gap: 8,
    backgroundColor: colors.primary + '08',
    borderWidth: 1, borderColor: colors.primary + '25',
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    marginBottom: spacing.md,
  },
  dreHelperText: {
    flex: 1,
    fontSize: 12, color: colors.text, lineHeight: 17,
    fontFamily: fontFamily.regular,
  },
  dreCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.border + '60',
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,77,71,0.06)' },
      default: {},
    }),
  },
  dreSectionHeader: {
    marginTop: spacing.sm + 2,
    marginBottom: 2,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border + '60',
  },
  dreSectionHeaderText: {
    fontSize: 10, fontFamily: fontFamily.bold,
    color: colors.textSecondary, letterSpacing: 1.4,
    textTransform: 'uppercase',
    paddingTop: 6,
  },
  dreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border + '40',
    gap: spacing.sm,
  },
  dreLabel: {
    flex: 1, fontSize: 13, color: colors.text,
    fontFamily: fontFamily.regular,
  },
  dreValueCol: {
    alignItems: 'flex-end',
    minWidth: 140,
  },
  dreInputWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.inputBg,
    overflow: 'hidden',
  },
  dreInputPrefix: {
    fontSize: 11, color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
    paddingHorizontal: 8, paddingVertical: 8,
    backgroundColor: colors.background,
  },
  dreInput: {
    width: 100,
    paddingHorizontal: 8, paddingVertical: 8,
    fontSize: 13, fontFamily: fontFamily.semiBold,
    color: colors.text,
    textAlign: 'right',
  },
  drePctText: {
    fontSize: 10, fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginTop: 3,
    paddingRight: 4,
  },

  // -------- DRE subtotal --------
  dreSubtotalRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    marginVertical: 4,
    gap: spacing.sm,
  },
  dreSubtotalLabel: {
    flex: 1, fontSize: 13.5, color: colors.text,
    fontFamily: fontFamily.semiBold,
  },
  dreSubtotalValue: {
    fontSize: 15, fontFamily: fontFamily.bold,
    textAlign: 'right',
  },

  // -------- DRE Fixas (toggle + detail) --------
  dreFixasBox: {
    borderBottomWidth: 1, borderBottomColor: colors.border + '40',
    paddingBottom: 4,
  },
  dreToggleRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingLeft: 14, paddingRight: 4,
    paddingBottom: 6,
    flexWrap: 'wrap', gap: 8,
  },
  dreToggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    flexShrink: 1,
  },
  dreToggleTrack: {
    width: 32, height: 18, borderRadius: 9,
    backgroundColor: colors.border,
    padding: 2, justifyContent: 'center',
  },
  dreToggleTrackOn: { backgroundColor: colors.primary },
  dreToggleThumb: {
    width: 14, height: 14, borderRadius: 7,
    backgroundColor: '#fff',
    ...Platform.select({
      web: { boxShadow: '0 1px 2px rgba(0,0,0,0.2)' },
      default: { elevation: 2 },
    }),
  },
  dreToggleThumbOn: { alignSelf: 'flex-end' },
  dreToggleLabel: {
    fontSize: 11.5, color: colors.text,
    fontFamily: fontFamily.medium,
    flexShrink: 1,
  },
  dreDetailBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingVertical: 4, paddingHorizontal: 8,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary + '10',
  },
  dreDetailBtnText: {
    fontSize: 11, color: colors.primary, fontFamily: fontFamily.semiBold,
  },
  dreFixasDetail: {
    marginLeft: 14,
    marginTop: 4, marginBottom: 6,
    paddingVertical: 6, paddingHorizontal: 10,
    backgroundColor: colors.background,
    borderRadius: borderRadius.sm,
    gap: 4,
  },
  dreFixaItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 3,
  },
  dreFixaDesc: { flex: 1, fontSize: 12, color: colors.text, fontFamily: fontFamily.regular },
  dreFixaValor: { fontSize: 12, color: colors.text, fontFamily: fontFamily.semiBold },
  dreFixasEmpty: {
    fontSize: 11, fontStyle: 'italic',
    color: colors.textSecondary, fontFamily: fontFamily.regular,
  },

  dreFooter: {
    fontSize: 11, color: colors.textSecondary,
    textAlign: 'center', marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
