/**
 * FluxoCaixaDREScreen — Feature beta gated por whitelist por email.
 *
 * Página com 2 abas (padrão visual idêntico ao DeliveryHubScreen):
 *  1. Fluxo de Caixa — movimentações mensais (entradas/saídas) com sumário
 *     de saldo, CRUD em modal e botão "Importar receita do mês" (pré-popula
 *     com vendas registradas no mês × preço de venda).
 *  2. DRE — Demonstração de Resultado do Exercício no formato brasileiro
 *     simplificado pra pequeno negócio (estilo ContaAzul / Granatum / Bling):
 *     receita bruta → deduções → custos → despesas → lucro líquido.
 *
 * Mantém SIMPLES: pequeno negócio não precisa de contabilidade complexa.
 */
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Platform,
  TextInput, ActivityIndicator, StyleSheet,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  formatCurrency,
  calcCustoIngrediente,
  calcCustoPreparo,
  parseDecimalBROrZero,
} from '../utils/calculations';
import InputField from '../components/InputField';
import PickerSelect from '../components/PickerSelect';
import EmptyState from '../components/EmptyState';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import CurrencyInputModal from '../components/CurrencyInputModal';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { showToast } from '../utils/toastBus';

// safeNum defensivo — alinhado com o resto do app (evita NaN/Infinity)
function safeNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

// Valida formato YYYY-MM-DD básico
function isValidDateStr(s) {
  if (!s || typeof s !== 'string') return false;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

// Formata número como "1.234,56" para exibição no input modal de moeda
function formatBRNumber(n) {
  const num = safeNum(n);
  return num.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
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

// Util — converte string "1.234,56" ou "1234.56" pra número
function parseNum(str) {
  if (typeof str === 'number') return str;
  if (!str) return 0;
  const n = parseFloat(String(str).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function pad2(n) { return String(n).padStart(2, '0'); }

// Mês de referência: YYYY-MM
function getMonthKey(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

// Primeiro/último dia do mês em YYYY-MM-DD
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

export default function FluxoCaixaDREScreen() {
  const { isDesktop } = useResponsiveLayout();
  const [activeTab, setActiveTab] = useState('fluxo');
  const [monthKey, setMonthKey] = useState(() => getMonthKey(new Date()));
  const [loading, setLoading] = useState(true);

  // Fluxo de caixa state
  const [movimentos, setMovimentos] = useState([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = novo, obj = edit
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [valorModalOpen, setValorModalOpen] = useState(false);

  // Form state — modal
  const [formData, setFormData] = useState('');
  const [formTipo, setFormTipo] = useState('entrada');
  const [formCategoria, setFormCategoria] = useState('');
  const [formDescricao, setFormDescricao] = useState('');
  const [formValor, setFormValor] = useState('');
  const [formErrors, setFormErrors] = useState({});

  // DRE — flag pra editar CMV manualmente quando não há vendas
  const [cmvManual, setCmvManual] = useState(false);
  const [vendasCount, setVendasCount] = useState(null); // null = ainda não calculado

  // DRE state — valores ajustáveis pelo user (após "Recalcular" puxa do banco)
  const [dre, setDre] = useState({
    receitaBruta: 0,
    deducoes: 0,
    devolucoes: 0,
    cmv: 0,
    despesasFixas: 0,
    despesasVariaveis: 0,
    outrasDespesas: 0,
    outrasReceitas: 0,
  });
  const [dreLoading, setDreLoading] = useState(false);

  const reloadMovimentos = useCallback(async () => {
    setLoading(true);
    try {
      const db = await getDatabase();
      const { start, end } = monthRange(monthKey);

      // Carrega movimentos do mês + saldo acumulado de meses anteriores em paralelo
      const [rows, anteriores] = await Promise.all([
        db.getAllAsync(
          'SELECT * FROM fluxo_caixa_movimentos WHERE data >= ? AND data <= ? ORDER BY data DESC',
          [start, end]
        ).catch((e) => {
          console.warn('[FluxoCaixaDRE.load]', e?.message || e);
          return [];
        }),
        // Saldo inicial = soma de TUDO antes do primeiro dia do mês
        db.getAllAsync(
          'SELECT tipo, COALESCE(SUM(valor), 0) AS total FROM fluxo_caixa_movimentos WHERE data < ? GROUP BY tipo',
          [start]
        ).catch((e) => {
          console.warn('[FluxoCaixaDRE.saldoInicial]', e?.message || e);
          return [];
        }),
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

  // Sumário do mês
  const resumo = useMemo(() => {
    let entradas = 0;
    let saidas = 0;
    for (const m of movimentos) {
      const v = safeNum(m.valor);
      if (m.tipo === 'entrada') entradas += v;
      else saidas += v;
    }
    return {
      entradas, saidas,
      saldoInicial,
      saldoFinal: saldoInicial + entradas - saidas,
    };
  }, [movimentos, saldoInicial]);

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

  // "Importar receita do mês" — soma das vendas registradas no mês × preço.
  // vendas.data armazena YYYY-MM (não YYYY-MM-DD). Se o usuário não tiver
  // vendas registradas, mostra mensagem informativa.
  async function importarReceitaDoMes() {
    try {
      const db = await getDatabase();
      const [vendas, produtos] = await Promise.all([
        db.getAllAsync('SELECT * FROM vendas WHERE data = ?', [monthKey]).catch(() => []),
        db.getAllAsync('SELECT id, nome, preco_venda FROM produtos').catch(() => []),
      ]);
      if (!vendas || vendas.length === 0) {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert(`Sem vendas registradas em ${formatMonthLabel(monthKey)}. Cadastre vendas no Painel Geral primeiro.`);
        }
        return;
      }
      const precoMap = {};
      (produtos || []).forEach(p => { precoMap[p.id] = Number(p.preco_venda) || 0; });
      let total = 0;
      for (const v of vendas) {
        total += (Number(v.quantidade) || 0) * (precoMap[v.produto_id] || 0);
      }
      if (total <= 0) {
        if (typeof window !== 'undefined' && window.alert) {
          window.alert('Vendas existem, mas o total ficou em R$ 0,00 (preços não cadastrados?).');
        }
        return;
      }
      const { start } = monthRange(monthKey);
      await db.runAsync(
        'INSERT INTO fluxo_caixa_movimentos (data, tipo, categoria, descricao, valor) VALUES (?, ?, ?, ?, ?)',
        [start, 'entrada', 'Vendas Balcão', `Receita do mês ${formatMonthLabel(monthKey)} (importada)`, total]
      );
      showToast('Receita importada: ' + formatCurrency(total), 'download');
      await reloadMovimentos();
    } catch (e) {
      console.error('[FluxoCaixaDRE.importarReceita]', e);
    }
  }

  // --- DRE ---

  // Recalcula DRE puxando dados do banco:
  //  - receita bruta: vendas do mês × preco_venda (mesmo cálculo do botão)
  //  - CMV: soma do custo unitário de cada produto × quantidade vendida
  //  - despesas fixas: soma de despesas_fixas
  //  - despesas variáveis: soma % × receita
  //  - impostos (deduções): % de impostos × receita
  const recalcularDRE = useCallback(async () => {
    setDreLoading(true);
    try {
      const db = await getDatabase();
      const { start, end } = monthRange(monthKey);
      const [
        vendas,
        produtos,
        produtoIngredientes,
        produtoPreparos,
        produtoEmbalagens,
        despFixas,
        despVars,
        fluxoMov,
      ] = await Promise.all([
        // vendas.data armazena YYYY-MM (mês todo), bate exato com monthKey
        db.getAllAsync('SELECT * FROM vendas WHERE data = ?', [monthKey]).catch(() => []),
        db.getAllAsync('SELECT * FROM produtos').catch(() => []),
        // Joins idênticos aos usados em MatrizBCGScreen pra calcular custo do produto
        db.getAllAsync(
          'SELECT pi.produto_id, pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id'
        ).catch(() => []),
        db.getAllAsync(
          'SELECT pp.produto_id, pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id'
        ).catch(() => []),
        db.getAllAsync(
          'SELECT pe.produto_id, pe.quantidade_utilizada, em.preco_unitario FROM produto_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id'
        ).catch(() => []),
        db.getAllAsync('SELECT * FROM despesas_fixas').catch(() => []),
        db.getAllAsync('SELECT * FROM despesas_variaveis').catch(() => []),
        db.getAllAsync(
          'SELECT * FROM fluxo_caixa_movimentos WHERE data >= ? AND data <= ?',
          [start, end]
        ).catch(() => []),
      ]);

      // Marca se há vendas no mês — usado pra mostrar mensagem informativa
      setVendasCount((vendas || []).length);

      // Agrupa ingredientes/preparos/embalagens por produto_id
      const ingsByProd = {};
      for (const r of (produtoIngredientes || [])) {
        (ingsByProd[r.produto_id] = ingsByProd[r.produto_id] || []).push(r);
      }
      const prepsByProd = {};
      for (const r of (produtoPreparos || [])) {
        (prepsByProd[r.produto_id] = prepsByProd[r.produto_id] || []).push(r);
      }
      const embsByProd = {};
      for (const r of (produtoEmbalagens || [])) {
        (embsByProd[r.produto_id] = embsByProd[r.produto_id] || []).push(r);
      }

      // Calcula custo unitário REAL de cada produto somando ingredientes + preparos + embalagens
      // (mesma fórmula usada em MatrizBCGScreen)
      const precoMap = {};
      const custoUnitMap = {};
      for (const p of (produtos || [])) {
        precoMap[p.id] = safeNum(p.preco_venda);
        const ings = ingsByProd[p.id] || [];
        const custoIng = ings.reduce(
          (a, i) => a + safeNum(calcCustoIngrediente(
            safeNum(i.preco_por_kg),
            i.quantidade_utilizada,
            i.unidade_medida,
            i.unidade_medida
          )),
          0
        );
        const preps = prepsByProd[p.id] || [];
        const custoPr = preps.reduce(
          (a, pp) => a + safeNum(calcCustoPreparo(
            safeNum(pp.custo_por_kg),
            pp.quantidade_utilizada,
            pp.unidade_medida || 'g'
          )),
          0
        );
        const embs = embsByProd[p.id] || [];
        const custoEmb = embs.reduce(
          (a, e) => a + safeNum(e.preco_unitario) * safeNum(e.quantidade_utilizada),
          0
        );
        custoUnitMap[p.id] = custoIng + custoPr + custoEmb;
      }

      let receitaBruta = 0;
      let cmv = 0;
      for (const v of (vendas || [])) {
        const qtd = safeNum(v.quantidade);
        receitaBruta += qtd * (precoMap[v.produto_id] || 0);
        cmv += qtd * (custoUnitMap[v.produto_id] || 0);
      }

      const despesasFixas = (despFixas || []).reduce((s, d) => s + safeNum(d.valor), 0);
      const totalVarPerc = (despVars || []).reduce((s, d) => s + safeNum(d.percentual), 0);
      // Impostos vem do somatório das variáveis que contêm "imposto" na descrição.
      const impostoPerc = (despVars || []).reduce((s, d) => {
        const desc = String(d.descricao || '').toLowerCase();
        return desc.includes('imposto') ? s + safeNum(d.percentual) : s;
      }, 0);
      const deducoes = receitaBruta * (impostoPerc / 100);
      const despesasVariaveis = receitaBruta * ((totalVarPerc - impostoPerc) / 100);

      // Outras receitas/despesas = movimentos manuais que NÃO sejam categoria "Vendas..."
      let outrasReceitas = 0;
      let outrasDespesas = 0;
      for (const m of (fluxoMov || [])) {
        const cat = String(m.categoria || '');
        if (m.tipo === 'entrada') {
          if (cat === 'Outras Receitas') outrasReceitas += safeNum(m.valor);
        } else {
          // saidas operacionais já estão em despesasFixas/Vars; aqui só "Outras"
          if (cat === 'Outros') outrasDespesas += safeNum(m.valor);
        }
      }

      // Se o user havia ativado edição manual de CMV mas agora existem vendas,
      // mantém o valor automático (o flag só faz sentido quando vendasCount === 0).
      if ((vendas || []).length > 0) {
        setCmvManual(false);
      }

      setDre({
        receitaBruta,
        deducoes,
        devolucoes: 0,
        cmv,
        despesasFixas,
        despesasVariaveis,
        outrasDespesas,
        outrasReceitas,
      });
      showToast('DRE recalculada', 'refresh-cw');
    } catch (e) {
      console.error('[FluxoCaixaDRE.recalcular]', e);
      showToast('Erro ao recalcular DRE', 'alert-triangle');
    } finally {
      setDreLoading(false);
    }
  }, [monthKey]);

  // Recálculo automático ao trocar de mês na aba DRE
  useEffect(() => {
    if (activeTab === 'dre') {
      recalcularDRE();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, monthKey]);

  // Linhas calculadas do DRE
  const dreLinhas = useMemo(() => {
    const receitaLiquida = dre.receitaBruta - dre.deducoes - dre.devolucoes;
    const lucroBruto = receitaLiquida - dre.cmv;
    const totalOperacionais = dre.despesasFixas + dre.despesasVariaveis;
    const lucroOperacional = lucroBruto - totalOperacionais;
    const lucroLiquido = lucroOperacional - dre.outrasDespesas + dre.outrasReceitas;
    return { receitaLiquida, lucroBruto, totalOperacionais, lucroOperacional, lucroLiquido };
  }, [dre]);

  // -------------------- RENDER --------------------

  return (
    <View style={styles.container}>
      <View style={styles.pageShell}>
        {/* Seletor de mês */}
        <View style={styles.monthBar}>
          <TouchableOpacity
            onPress={() => setMonthKey(m => shiftMonth(m, -1))}
            style={styles.monthArrow}
            accessibilityRole="button"
            accessibilityLabel="Mês anterior"
          >
            <Feather name="chevron-left" size={22} color={colors.primary} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
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

        {/* Tabs (padrão DeliveryHubScreen) */}
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
              onImportar={importarReceitaDoMes}
              isDesktop={isDesktop}
            />
          ) : (
            <DRETab
              dre={dre}
              setDre={setDre}
              linhas={dreLinhas}
              loading={dreLoading}
              onRecalcular={recalcularDRE}
              onExportPDF={() => showToast('Exportação PDF em breve', 'file-text')}
              vendasCount={vendasCount}
              cmvManual={cmvManual}
              onAtivarCmvManual={() => setCmvManual(true)}
              monthLabel={formatMonthLabel(monthKey)}
            />
          )}
        </ScrollView>
      </View>

      {/* Modal de cadastro/edição */}
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
            <ScrollView style={{ maxHeight: 480 }}>
              {/* Data — usa <input type="date"> no web pra ter picker nativo */}
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

              {/* Valor — abre CurrencyInputModal com formatação BR */}
              <Text style={styles.fieldLabel}>Valor (R$)</Text>
              <TouchableOpacity
                onPress={() => setValorModalOpen(true)}
                style={[
                  styles.valorTrigger,
                  formErrors.valor && { borderColor: colors.error },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Editar valor"
              >
                <Text style={[
                  styles.valorTriggerText,
                  !formValor && { color: colors.placeholder },
                ]}>
                  {formValor ? `R$ ${formValor}` : 'Toque para informar o valor'}
                </Text>
                <Feather name="edit-2" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
              {formErrors.valor ? <Text style={styles.errorText}>{formErrors.valor}</Text> : null}
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

      {/* Modal de edição de valor com formatação BR */}
      <CurrencyInputModal
        visible={valorModalOpen}
        title="Valor do movimento"
        prefix="R$"
        value={formValor}
        placeholder="0,00"
        onConfirm={(v) => {
          const n = parseDecimalBROrZero(v);
          setFormValor(n > 0 ? formatBRNumber(n) : '');
          // Limpa erro do valor ao confirmar
          if (formErrors.valor && n > 0) {
            setFormErrors(prev => ({ ...prev, valor: undefined }));
          }
          setValorModalOpen(false);
        }}
        onCancel={() => setValorModalOpen(false)}
      />
    </View>
  );
}

// ============================================================
// Aba 1 — Fluxo de Caixa
// ============================================================
function FluxoTab({ loading, movimentos, resumo, onAdd, onEdit, onDelete, onImportar, isDesktop }) {
  return (
    <>
      {/* Sumário */}
      <View style={[styles.summaryRow, !isDesktop && styles.summaryRowMobile]}>
        <SummaryCard label="Saldo inicial" value={formatCurrency(resumo.saldoInicial)} color={colors.textSecondary} />
        <SummaryCard label="Entradas" value={formatCurrency(resumo.entradas)} color={colors.success} icon="arrow-down-circle" />
        <SummaryCard label="Saídas" value={formatCurrency(resumo.saidas)} color={colors.error} icon="arrow-up-circle" />
        <SummaryCard
          label="Saldo final"
          value={formatCurrency(resumo.saldoFinal)}
          color={resumo.saldoFinal >= 0 ? colors.primary : colors.error}
          highlight
        />
      </View>

      {/* Ações */}
      <View style={styles.actionsRow}>
        <TouchableOpacity onPress={onAdd} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
          <Feather name="plus" size={16} color="#fff" />
          <Text style={styles.btnPrimaryText}>Adicionar movimento</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onImportar} style={[styles.btn, styles.btnOutline, { flex: 1 }]}>
          <Feather name="download" size={16} color={colors.primary} />
          <Text style={styles.btnOutlineText}>Importar receita do mês</Text>
        </TouchableOpacity>
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
          description="Toque em + Adicionar para registrar uma entrada ou saída. Você também pode importar a receita do mês a partir das vendas cadastradas."
          ctaLabel="+ Adicionar"
          onPress={onAdd}
        />
      ) : (
        movimentos.map(m => (
          <TouchableOpacity
            key={m.id}
            style={styles.movRow}
            onPress={() => onEdit(m)}
            accessibilityRole="button"
            accessibilityLabel={`Editar ${m.descricao || m.categoria}`}
          >
            <View style={[
              styles.movDot,
              { backgroundColor: m.tipo === 'entrada' ? colors.success : colors.error },
            ]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.movDesc} numberOfLines={1}>
                {m.descricao || m.categoria || (m.tipo === 'entrada' ? 'Entrada' : 'Saída')}
              </Text>
              <Text style={styles.movSub} numberOfLines={1}>
                {(m.data || '').split('-').reverse().join('/')} {m.categoria ? `• ${m.categoria}` : ''}
              </Text>
            </View>
            <Text style={[
              styles.movValor,
              { color: m.tipo === 'entrada' ? colors.success : colors.error },
            ]}>
              {m.tipo === 'entrada' ? '+ ' : '- '}{formatCurrency(Number(m.valor) || 0)}
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
        ))
      )}
    </>
  );
}

function SummaryCard({ label, value, color, icon, highlight }) {
  return (
    <View style={[styles.summaryCard, highlight && styles.summaryCardHighlight]}>
      <View style={styles.summaryLabelRow}>
        {icon ? <Feather name={icon} size={12} color={color} /> : null}
        <Text style={styles.summaryLabel}>{label}</Text>
      </View>
      <Text style={[styles.summaryValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ============================================================
// Aba 2 — DRE (Demonstração de Resultado do Exercício)
// ============================================================
function DRETab({
  dre, setDre, linhas, loading, onRecalcular, onExportPDF,
  vendasCount, cmvManual, onAtivarCmvManual, monthLabel,
}) {
  const receita = safeNum(dre.receitaBruta);

  function pctText(valor) {
    if (receita <= 0) return '';
    const p = (safeNum(valor) / receita) * 100;
    return `${p.toFixed(1).replace('.', ',')}%`;
  }

  function setField(field, str) {
    setDre(d => ({ ...d, [field]: parseDecimalBROrZero(str) }));
  }
  function field(label, value, fieldName, options = {}) {
    return (
      <View style={styles.dreRow}>
        <Text style={[styles.dreLabel, options.indent && { paddingLeft: 16 }]}>{label}</Text>
        <View style={styles.dreValueCol}>
          <TextInput
            style={[styles.dreInput, options.disabled && { opacity: 0.55 }]}
            value={String(value).replace('.', ',')}
            onChangeText={(t) => setField(fieldName, t)}
            keyboardType="decimal-pad"
            inputMode="decimal"
            placeholder="0,00"
            placeholderTextColor={colors.placeholder}
            editable={!options.disabled}
          />
          {options.showPct ? (
            <Text style={styles.drePctText}>{pctText(value)}</Text>
          ) : null}
        </View>
      </View>
    );
  }
  function readonly(label, value, { strong, signal, showPct } = {}) {
    const positive = (value || 0) >= 0;
    return (
      <View style={[styles.dreRow, strong && styles.dreRowStrong]}>
        <Text style={[styles.dreLabel, strong && styles.dreLabelStrong]}>{label}</Text>
        <View style={styles.dreValueCol}>
          <Text style={[
            styles.dreReadonly,
            strong && styles.dreReadonlyStrong,
            signal && { color: positive ? colors.success : colors.error },
          ]}>
            {formatCurrency(value || 0)}
          </Text>
          {showPct ? <Text style={styles.drePctText}>{pctText(value)}</Text> : null}
        </View>
      </View>
    );
  }

  // CMV editável só quando: (a) não há vendas cadastradas e o user clicou
  // pra editar manualmente, OU (b) o user quer ajustar mesmo com vendas.
  // Por padrão, com vendas no mês o CMV vem do cálculo automático e fica
  // editável (mantemos compat — DRE não trava ninguém).
  const cmvAutoOff = vendasCount === 0 && !cmvManual;

  return (
    <>
      <View style={styles.dreActions}>
        <TouchableOpacity onPress={onRecalcular} style={[styles.btn, styles.btnPrimary, { flex: 1 }]}>
          {loading ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="refresh-cw" size={16} color="#fff" />}
          <Text style={styles.btnPrimaryText}>Recalcular</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onExportPDF} style={[styles.btn, styles.btnOutline, { flex: 1 }]}>
          <Feather name="file-text" size={16} color={colors.primary} />
          <Text style={styles.btnOutlineText}>Exportar PDF</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.dreCard}>
        <Text style={styles.dreHelper}>
          Valores puxados do seu cadastro de produtos, despesas e vendas. Edite qualquer linha pra ajustar manualmente.
          A coluna cinza à direita mostra % sobre a Receita Bruta.
        </Text>

        {/* Aviso quando não há vendas registradas no mês */}
        {vendasCount === 0 ? (
          <View style={styles.dreWarning}>
            <Feather name="alert-circle" size={14} color={colors.warning || '#B45309'} />
            <Text style={styles.dreWarningText}>
              Nenhuma venda registrada em {monthLabel}. CMV não pode ser calculado automaticamente.
            </Text>
            {!cmvManual ? (
              <TouchableOpacity onPress={onAtivarCmvManual} style={styles.dreWarningCta}>
                <Text style={styles.dreWarningCtaText}>Inserir manualmente</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}

        {field('RECEITA BRUTA', dre.receitaBruta, 'receitaBruta')}
        {field('(-) Deduções (impostos)', dre.deducoes, 'deducoes', { indent: true, showPct: true })}
        {field('(-) Devoluções', dre.devolucoes, 'devolucoes', { indent: true, showPct: true })}
        {readonly('= RECEITA LÍQUIDA', linhas.receitaLiquida, { strong: true, showPct: true })}

        {field('(-) Custo dos Produtos Vendidos (CMV)', dre.cmv, 'cmv', {
          indent: true, showPct: true, disabled: cmvAutoOff,
        })}
        {readonly('= LUCRO BRUTO', linhas.lucroBruto, { strong: true, signal: true, showPct: true })}

        <View style={styles.dreRow}>
          <Text style={styles.dreLabel}>(-) Despesas Operacionais</Text>
          <View style={styles.dreValueCol}>
            <Text style={styles.dreReadonly}>{formatCurrency(linhas.totalOperacionais)}</Text>
            <Text style={styles.drePctText}>{pctText(linhas.totalOperacionais)}</Text>
          </View>
        </View>
        {field('   Despesas Fixas', dre.despesasFixas, 'despesasFixas', { indent: true, showPct: true })}
        {field('   Despesas Variáveis', dre.despesasVariaveis, 'despesasVariaveis', { indent: true, showPct: true })}

        {readonly('= LUCRO OPERACIONAL', linhas.lucroOperacional, { strong: true, signal: true, showPct: true })}

        {field('(-) Outras Despesas', dre.outrasDespesas, 'outrasDespesas', { indent: true, showPct: true })}
        {field('(+) Outras Receitas', dre.outrasReceitas, 'outrasReceitas', { indent: true, showPct: true })}

        {readonly('= LUCRO LÍQUIDO', linhas.lucroLiquido, { strong: true, signal: true, showPct: true })}
      </View>

      <Text style={styles.dreFooter}>
        Referência: estrutura padrão brasileira simplificada para pequeno negócio
        (alinhada com ContaAzul, Granatum e Bling).
      </Text>
    </>
  );
}

// ============================================================
// Styles
// ============================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  pageShell: { flex: 1, width: '100%', maxWidth: 1100, alignSelf: 'center' },
  content: { padding: spacing.md, paddingBottom: 100 },

  // Month bar
  monthBar: {
    flexDirection: 'row', alignItems: 'center',
    padding: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  monthArrow: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '10',
  },
  monthLabel: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text, textTransform: 'capitalize' },
  todayChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    marginLeft: spacing.sm,
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '10',
  },
  todayChipText: {
    fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.primary,
  },

  // Modal — campos
  dateInputNative: {
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: colors.inputBg,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm,
    color: colors.text,
    fontSize: 14,
  },
  errorText: {
    fontSize: 11, color: colors.error, marginTop: 4, marginBottom: 4,
    fontFamily: fontFamily.medium,
  },
  valorTrigger: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    minHeight: 48, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1.5, borderColor: colors.primary + '40',
    borderRadius: borderRadius.sm,
    marginBottom: 4,
  },
  valorTriggerText: {
    fontSize: 16, fontFamily: fontFamily.semiBold, color: colors.text,
  },

  // Tabs (replica do DeliveryHub)
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

  // Summary cards
  summaryRow: {
    flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md,
  },
  summaryRowMobile: {
    flexWrap: 'wrap',
  },
  summaryCard: {
    flex: 1, minWidth: 140,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.sm + 2,
    borderWidth: 1, borderColor: colors.border,
  },
  summaryCardHighlight: {
    borderColor: colors.primary + '40',
    backgroundColor: colors.primary + '08',
  },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 4 },
  summaryLabel: { fontSize: 11, color: colors.textSecondary, fontFamily: fontFamily.medium },
  summaryValue: { fontSize: 16, fontFamily: fontFamily.bold },

  // Actions
  actionsRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
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

  // Movements list
  movRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.border,
  },
  movDot: { width: 8, height: 8, borderRadius: 4 },
  movDesc: { fontSize: 14, fontFamily: fontFamily.semiBold, color: colors.text },
  movSub: { fontSize: 11, color: colors.textSecondary, marginTop: 2 },
  movValor: { fontSize: 14, fontFamily: fontFamily.bold },
  movDelete: {
    width: 28, height: 28, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.inputBg,
    marginLeft: spacing.xs,
  },

  // Field label
  fieldLabel: {
    fontSize: 13, fontFamily: fontFamily.medium, color: colors.textSecondary,
    marginBottom: 6, marginTop: spacing.xs,
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

  // Modal
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

  // DRE
  dreActions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md, flexWrap: 'wrap' },
  dreCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1, borderColor: colors.border,
  },
  dreHelper: {
    fontSize: 12, color: colors.textSecondary, lineHeight: 16,
    marginBottom: spacing.md,
  },
  dreRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: colors.border + '60',
    gap: spacing.sm,
  },
  dreRowStrong: {
    backgroundColor: colors.primary + '08',
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.sm,
    borderBottomWidth: 0,
    marginVertical: 2,
  },
  dreLabel: { flex: 1, fontSize: 13, color: colors.text, fontFamily: fontFamily.regular },
  dreLabelStrong: { fontFamily: fontFamily.bold, fontSize: 14 },
  dreInput: {
    width: 130,
    paddingHorizontal: 10, paddingVertical: 8,
    backgroundColor: colors.inputBg,
    borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    fontSize: 13, fontFamily: fontFamily.semiBold,
    color: colors.text,
    textAlign: 'right',
  },
  dreReadonly: {
    width: 130, paddingHorizontal: 10, paddingVertical: 8,
    fontSize: 13, fontFamily: fontFamily.semiBold,
    color: colors.text, textAlign: 'right',
  },
  dreReadonlyStrong: { fontSize: 15, fontFamily: fontFamily.bold },
  dreValueCol: {
    alignItems: 'flex-end',
    minWidth: 130,
  },
  drePctText: {
    fontSize: 10,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginTop: 2,
    paddingHorizontal: 10,
  },
  dreWarning: {
    flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6,
    backgroundColor: (colors.warning || '#FBBF24') + '15',
    borderWidth: 1, borderColor: (colors.warning || '#FBBF24') + '50',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginBottom: spacing.sm,
  },
  dreWarningText: {
    flex: 1, fontSize: 12, color: colors.text, lineHeight: 16,
    fontFamily: fontFamily.medium,
  },
  dreWarningCta: {
    paddingVertical: 6, paddingHorizontal: 10,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.primary,
  },
  dreWarningCtaText: {
    fontSize: 11, color: '#fff', fontFamily: fontFamily.semiBold,
  },
  dreFooter: {
    fontSize: 11, color: colors.textSecondary,
    textAlign: 'center', marginTop: spacing.md,
    fontStyle: 'italic',
  },
});
