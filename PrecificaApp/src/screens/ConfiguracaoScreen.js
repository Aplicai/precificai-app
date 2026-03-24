import React, { useState, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Alert, Modal, Animated, Keyboard, TouchableWithoutFeedback } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import CurrencyInputModal from '../components/CurrencyInputModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import InputField from '../components/InputField';
import Card from '../components/Card';
import InfoTooltip from '../components/InfoTooltip';
import { Feather } from '@expo/vector-icons';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, formatPercent, calcDespesasFixasPercentual, calcMarkup } from '../utils/calculations';
import { getFinanceiroStatus } from '../utils/financeiroStatus';

export default function ConfiguracaoScreen() {
  const { isDesktop } = useResponsiveLayout();
  const isFocused = useIsFocused();
  const [lucroDesejado, setLucroDesejado] = useState('15');
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
  const [expandedSections, setExpandedSections] = useState({
    margem: true,
    margemSeguranca: false,
    faturamento: false,
    fixas: false,
    variaveis: false,
  });

  const meses = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

  const mesesCurtos = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => setConfirmDelete(null);
    }, [])
  );

  function showSaved(msg) {
    setSavedFeedback(msg || 'Salvo');
    setTimeout(() => setSavedFeedback(null), 1500);
  }

  async function loadData() {
    const db = await getDatabase();
    const [configs, fixas, variaveis, fatRaw] = await Promise.all([
      db.getAllAsync('SELECT * FROM configuracao'),
      db.getAllAsync('SELECT * FROM despesas_fixas ORDER BY id'),
      db.getAllAsync('SELECT * FROM despesas_variaveis ORDER BY id'),
      db.getAllAsync('SELECT * FROM faturamento_mensal ORDER BY id'),
    ]);
    const config = configs?.[0];
    if (config) {
      setConfigId(config.id);
      setLucroDesejado(String((config.lucro_desejado * 100).toFixed(1)));
      setMargemSeguranca(String(((config.margem_seguranca || 0) * 100).toFixed(1)));
    }

    setDespesasFixas(fixas);
    setDespesasVariaveis(variaveis);

    let fat = fatRaw;
    if (fat.length === 0) {
      // Insert 12 months with short names
      for (const mes of mesesCurtos) {
        await db.runAsync('INSERT INTO faturamento_mensal (mes, valor) VALUES (?, ?)', [mes, 0]);
      }
      fat = await db.getAllAsync('SELECT * FROM faturamento_mensal ORDER BY id');
    } else if (fat.length > 12) {
      // Duplicates detected — keep only first 12 and delete extras
      const extras = fat.slice(12);
      for (const e of extras) {
        await db.runAsync('DELETE FROM faturamento_mensal WHERE id = ?', [e.id]);
      }
      fat = fat.slice(0, 12);
    }
    // Normalize month names to short format
    fat = fat.map((f, i) => ({ ...f, mes: mesesCurtos[i] || f.mes }));
    setFaturamento(fat);

    const status = await getFinanceiroStatus();
    setFinStatus(status);

    // Auto-expand first incomplete section
    if (status && !status.completo) {
      const firstIncomplete = status.etapas.find(e => !e.done);
      if (firstIncomplete) {
        const sectionMap = { lucro: 'margem', faturamento: 'faturamento', fixas: 'fixas', variaveis: 'variaveis' };
        const key = sectionMap[firstIncomplete.key];
        if (key) {
          setExpandedSections(prev => ({ ...prev, [key]: true }));
        }
      }
    }
  }

  async function salvarLucro() {
    const db = await getDatabase();
    const valor = parseFloat(lucroDesejado.replace(',', '.')) / 100;
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
    await db.runAsync('INSERT INTO despesas_fixas (descricao, valor) VALUES (?, ?)',
      [novaFixa.descricao, parseFloat(novaFixa.valor.replace(',', '.')) || 0]);
    setNovaFixa({ descricao: '', valor: '' });
    showSaved('Despesa adicionada');
    loadData();
  }

  function removerDespesaFixa(id, descricao) {
    setConfirmDelete({
      titulo: 'Excluir Despesa Fixa', nome: descricao,
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
    await db.runAsync('INSERT INTO despesas_variaveis (descricao, percentual) VALUES (?, ?)',
      [novaVariavel.descricao, parseFloat(novaVariavel.percentual.replace(',', '.')) / 100 || 0]);
    setNovaVariavel({ descricao: '', percentual: '' });
    showSaved('Despesa adicionada');
    loadData();
  }

  function removerDespesaVariavel(id, descricao) {
    setConfirmDelete({
      titulo: 'Excluir Despesa Variável', nome: descricao,
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
      await db.runAsync('UPDATE despesas_fixas SET descricao = ?, valor = ? WHERE id = ?',
        [editModal.descricao, parseFloat(editModal.valor.replace(',', '.')) || 0, editModal.id]);
    } else {
      await db.runAsync('UPDATE despesas_variaveis SET descricao = ?, percentual = ? WHERE id = ?',
        [editModal.descricao, parseFloat(editModal.valor.replace(',', '.')) / 100 || 0, editModal.id]);
    }
    setEditModal(null);
    showSaved('Atualizado');
    loadData();
  }

  async function salvarFaturamento(id, valor) {
    const db = await getDatabase();
    await db.runAsync('UPDATE faturamento_mensal SET valor = ? WHERE id = ?',
      [parseFloat(valor.replace(',', '.')) || 0, id]);
    const status = await getFinanceiroStatus();
    setFinStatus(status);
  }

  function toggleSection(key) {
    setExpandedSections(prev => ({ ...prev, [key]: !prev[key] }));
  }

  const totalFixas = despesasFixas.reduce((acc, d) => acc + (d.valor || 0), 0);
  const totalVariaveis = despesasVariaveis.reduce((acc, d) => acc + (d.percentual || 0), 0);
  const mesesComFat = faturamento.filter(f => f.valor > 0);
  const faturamentoMedio = mesesComFat.length > 0
    ? mesesComFat.reduce((acc, f) => acc + f.valor, 0) / mesesComFat.length : 0;
  const despFixasPerc = calcDespesasFixasPercentual(totalFixas, faturamentoMedio);
  const lucroPerc = parseFloat(lucroDesejado.replace(',', '.')) / 100 || 0;
  const markup = calcMarkup(despFixasPerc, totalVariaveis, lucroPerc);
  const custoMaxPerc = Math.max(0, 1 - despFixasPerc - totalVariaveis - lucroPerc);

  const faturamentoOrdenado = [...faturamento].sort((a, b) => mesesCurtos.indexOf(a.mes) - mesesCurtos.indexOf(b.mes));

  function SectionHeader({ title, sectionKey, icon, badge, badgeColor, iconColor, tooltip }) {
    const isOpen = expandedSections[sectionKey];
    const sectionColor = iconColor || colors.primary;
    return (
      <TouchableOpacity
        style={styles.sectionHeader}
        onPress={() => toggleSection(sectionKey)}
        activeOpacity={0.7}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionDot, { backgroundColor: sectionColor }]} />
          <View style={[styles.sectionIconCircle, { backgroundColor: sectionColor + '15' }]}>
            <Feather name={icon} size={15} color={sectionColor} />
          </View>
          <Text style={styles.sectionTitle}>{title}</Text>
          {tooltip && <InfoTooltip {...tooltip} />}
          <Feather name={isOpen ? 'chevron-down' : 'chevron-right'} size={16} color={colors.disabled} style={{ marginLeft: 4 }} />
        </View>
        {badge !== undefined && badge !== null && (
          <View style={[styles.sectionBadge, badgeColor && { backgroundColor: badgeColor + '15' }]}>
            <Text style={[styles.sectionBadgeText, badgeColor && { color: badgeColor }]}>{badge}</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={{ flex: 1 }}>
    <ScrollView style={styles.container} contentContainerStyle={styles.content} onScrollBeginDrag={Keyboard.dismiss}>

      {/* Compact header */}
      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary + '12', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}><Feather name="settings" size={16} color={colors.primary} /></View>
          <View>
            <Text style={styles.topBarTitle}>Configuração Central</Text>
            <Text style={styles.topBarDesc}>Base de cálculo de preços e margens</Text>
          </View>
        </View>
        {finStatus && (
          <View style={[styles.topBarStatus, finStatus.completo ? styles.topBarStatusOk : styles.topBarStatusPending]}>
            {finStatus.completo ? (
              <Feather name="check" size={14} color={colors.success} />
            ) : (
              <Text style={[styles.topBarStatusText, { color: '#E65100' }]}>
                {finStatus.concluidas}/{finStatus.total}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* Progress bar */}
      {finStatus && !finStatus.completo && (
        <View style={styles.progressRow}>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${finStatus.progresso * 100}%` }]} />
          </View>
          <View style={styles.pendenciasRow}>
            {finStatus.etapas.filter(e => !e.done).map(e => (
              <Text key={e.key} style={styles.pendenciaText}>• {e.label}</Text>
            ))}
          </View>
        </View>
      )}

      {/* Resumo Financeiro - Painel */}
      <View style={styles.painelResumo}>
        <View style={styles.painelItem}>
          <Text style={styles.painelValue}>{markup.toFixed(2)}x</Text>
          <Text style={styles.painelLabel}>Mark-up</Text>
        </View>
        <View style={styles.painelDivider} />
        <View style={styles.painelItem}>
          <Text style={styles.painelValue}>{formatPercent(despFixasPerc)}</Text>
          <Text style={styles.painelLabel}>Desp. Fixas</Text>
        </View>
        <View style={styles.painelDivider} />
        <View style={styles.painelItem}>
          <Text style={styles.painelValue}>{formatPercent(totalVariaveis)}</Text>
          <Text style={styles.painelLabel}>Desp. Var.</Text>
        </View>
        <View style={styles.painelDivider} />
        <View style={styles.painelItem}>
          <Text style={[styles.painelValue, { color: custoMaxPerc < 0.2 ? colors.error : colors.primary }]}>
            {formatPercent(custoMaxPerc)}
          </Text>
          <Text style={styles.painelLabel}>Custo Máx.</Text>
        </View>
      </View>
      {finStatus && !finStatus.completo && (
        <Text style={styles.painelWarning}>Valores preliminares. Complete a configuração</Text>
      )}

      {/* Composição do Preço - Barras */}
      {(() => {
        const slices = [
          { label: 'CMV', value: custoMaxPerc, color: colors.primary },
          { label: 'Custos Fixos', value: despFixasPerc, color: colors.coral },
          { label: 'Custos Variáveis', value: totalVariaveis, color: colors.purple },
          { label: 'Margem de Lucro', value: lucroPerc, color: colors.success },
        ].filter(s => s.value > 0);
        const total = slices.reduce((a, s) => a + s.value, 0);

        return total > 0 ? (
          <View style={styles.chartCard}>
            <View style={styles.chartHeaderRow}>
              <View style={[styles.sectionDot, { backgroundColor: colors.accent }]} />
              <Text style={styles.chartTitle}>Composição do Preço</Text>
            </View>
            {/* Stacked bar */}
            <View style={styles.stackedBar}>
              {slices.map((s, i) => (
                <View key={i} style={{
                  flex: s.value / total,
                  height: 14,
                  backgroundColor: s.color,
                  borderTopLeftRadius: i === 0 ? 7 : 0,
                  borderBottomLeftRadius: i === 0 ? 7 : 0,
                  borderTopRightRadius: i === slices.length - 1 ? 7 : 0,
                  borderBottomRightRadius: i === slices.length - 1 ? 7 : 0,
                }} />
              ))}
            </View>
            {/* Legend */}
            <View style={styles.chartLegend}>
              {slices.map((s, i) => (
                <View key={i} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: s.color }]} />
                  <Text style={styles.legendLabel}>{s.label}</Text>
                  <Text style={[styles.legendValue, { color: s.color }]}>{(s.value * 100).toFixed(1)}%</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null;
      })()}

      {/* ① Margem de Lucro */}
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Margem de Lucro"
          sectionKey="margem"
          icon="target"
          iconColor={colors.success}
          badge={lucroPerc > 0 ? `${(lucroPerc * 100).toFixed(0)}%` : null}
          badgeColor={colors.success}
        />
        {expandedSections.margem && (
          <View style={styles.sectionBody}>
            <Text style={styles.sectionExplain}>
              Rentabilidade desejada por produto. Impacta diretamente o preço sugerido.
            </Text>
            <View style={styles.margemRow}>
              <TouchableOpacity
                style={[styles.tapValueBtn, { flex: 1, marginRight: spacing.sm }]}
                onPress={() => setCurrencyModal({
                  title: 'Margem de Lucro',
                  value: lucroDesejado,
                  suffix: '%',
                  placeholder: '15',
                  onConfirm: (val) => {
                    setLucroDesejado(val);
                    setCurrencyModal(null);
                    // Auto-save
                    const db_val = parseFloat(val.replace(',', '.')) / 100;
                    if (!isNaN(db_val) && db_val > 0 && configId) {
                      getDatabase().then(db => {
                        db.runAsync('UPDATE configuracao SET lucro_desejado = ? WHERE id > 0', [db_val]);
                        showSaved('Margem salva');
                        loadData();
                      });
                    }
                  },
                })}
              >
                <Text style={[styles.tapValueText, styles.tapValueTextFilled, { fontSize: fonts.regular }]}>
                  {lucroDesejado}%
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.margemHint}>
              <Text style={styles.margemHintText}>Alimentação: 10-20%  ·  Confeitaria: 15-25%  ·  Marmitas: 10-15%</Text>
            </View>
          </View>
        )}
      </View>

      {/* ① ½ Margem de Segurança */}
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Margem de Segurança"
          sectionKey="margemSeguranca"
          icon="shield"
          iconColor={colors.info}
          badge={parseFloat(margemSeguranca.replace(',', '.')) > 0 ? `${parseFloat(margemSeguranca.replace(',', '.')).toFixed(0)}%` : null}
          badgeColor={colors.info}
        />
        {expandedSections.margemSeguranca && (
          <View style={styles.sectionBody}>
            <Text style={styles.sectionExplain}>
              Percentual adicionado ao custo dos insumos para cobrir variações de preço. Evita a necessidade de atualizar preços constantemente.
            </Text>
            <View style={styles.margemRow}>
              <TouchableOpacity
                style={[styles.tapValueBtn, { flex: 1, marginRight: spacing.sm }]}
                onPress={() => setCurrencyModal({
                  title: 'Margem de Segurança',
                  value: margemSeguranca,
                  suffix: '%',
                  placeholder: '0',
                  onConfirm: (val) => {
                    setMargemSeguranca(val);
                    setCurrencyModal(null);
                    const parsed = parseFloat(val.replace(',', '.'));
                    if (!isNaN(parsed) && parsed >= 0 && parsed <= 30 && configId) {
                      getDatabase().then(db => {
                        db.runAsync('UPDATE configuracao SET margem_seguranca = ? WHERE id > 0', [parsed / 100]);
                        showSaved('Margem de segurança salva');
                        loadData();
                      });
                    }
                  },
                })}
              >
                <Text style={[styles.tapValueText, parseFloat(margemSeguranca) > 0 ? styles.tapValueTextFilled : null, { fontSize: fonts.regular }]}>
                  {margemSeguranca}%
                </Text>
              </TouchableOpacity>
            </View>
            <View style={styles.margemHint}>
              <Text style={styles.margemHintText}>
                Ex: Com 5% de margem, um insumo de R$ 10,00 será calculado como R$ 10,50
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ② Faturamento Mensal */}
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Faturamento Mensal"
          sectionKey="faturamento"
          icon="bar-chart-2"
          iconColor={colors.accent}
          badge={faturamentoMedio > 0 ? `${formatCurrency(faturamentoMedio)}/mês` : null}
          badgeColor={colors.primary}
        />
        {expandedSections.faturamento && (
          <View style={styles.sectionBody}>
            <Text style={styles.sectionExplain}>
              Calcula o peso das despesas fixas sobre cada produto. Use valores reais ou estimativas.
            </Text>
            <View style={styles.fatGrid}>
              {faturamentoOrdenado.map((f, index) => (
                <TouchableOpacity
                  key={f.id}
                  style={[styles.fatItem, isDesktop && styles.fatItemDesktop]}
                  activeOpacity={0.7}
                  onPress={() => setCurrencyModal({
                    title: `Faturamento - ${f.mes}`,
                    value: f.valor > 0 ? String(f.valor).replace('.', ',') : '',
                    prefix: 'R$',
                    placeholder: '0,00',
                    onConfirm: (val) => {
                      const clean = val.replace(/[^0-9,\.]/g, '');
                      setFaturamento(prev => prev.map(item =>
                        item.id === f.id ? { ...item, valor: parseFloat(clean.replace(',', '.')) || 0 } : item
                      ));
                      salvarFaturamento(f.id, clean);
                      setCurrencyModal(null);
                    },
                  })}
                >
                  <Text style={styles.fatLabel}>{f.mes}</Text>
                  <View style={[styles.fatValueBox, f.valor > 0 && styles.fatValueBoxFilled]}>
                    <Text style={[styles.fatValueText, f.valor > 0 && styles.fatValueTextFilled]}>
                      {f.valor > 0 ? formatCurrency(f.valor) : '—'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.fatMediaRow}>
              <Text style={styles.fatMediaLabel}>Média mensal</Text>
              <Text style={styles.fatMediaValue}>{formatCurrency(faturamentoMedio)}</Text>
            </View>
            {mesesComFat.length > 0 && (
              <Text style={styles.fatMediaSub}>{mesesComFat.length} {mesesComFat.length === 1 ? 'mês preenchido' : 'meses preenchidos'}</Text>
            )}
          </View>
        )}
      </View>

      {/* ③ Despesas Fixas */}
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Despesas Fixas"
          sectionKey="fixas"
          icon="briefcase"
          iconColor={colors.coral}
          badge={totalFixas > 0 ? formatCurrency(totalFixas) : null}
          badgeColor={colors.warning}
          tooltip={{
            title: 'O que são Despesas Fixas?',
            text: 'São custos mensais que não mudam com a quantidade produzida. Você paga esses valores todo mês, independente de quanto vende.',
            examples: ['Aluguel', 'Conta de luz', 'Internet', 'Salários fixos', 'Contador'],
          }}
        />
        {expandedSections.fixas && (
          <View style={styles.sectionBody}>
            <Text style={styles.sectionExplain}>
              Custos mensais independentes da produção. Diluídos no preço de cada produto.
            </Text>

            {/* Add form */}
            <View style={styles.addFormCompact}>
              <InputField
                style={{ flex: 1, marginBottom: 0, marginRight: spacing.xs }}
                value={novaFixa.descricao}
                onChangeText={(v) => setNovaFixa(prev => ({ ...prev, descricao: v }))}
                placeholder="Descrição (ex: Aluguel)"
              />
              <TouchableOpacity
                style={styles.tapValueBtn}
                onPress={() => setCurrencyModal({
                  title: 'Valor da Despesa Fixa',
                  value: novaFixa.valor,
                  prefix: 'R$',
                  placeholder: '0,00',
                  onConfirm: (val) => {
                    setNovaFixa(prev => ({ ...prev, valor: val }));
                    setCurrencyModal(null);
                  },
                })}
              >
                <Text style={[styles.tapValueText, novaFixa.valor ? styles.tapValueTextFilled : null]}>
                  {novaFixa.valor ? `R$ ${novaFixa.valor}` : 'R$ 0,00'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={adicionarDespesaFixa}>
                <Text style={styles.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* List */}
            {despesasFixas.length === 0 ? (
              <Text style={styles.emptyListText}>Nenhuma despesa fixa cadastrada</Text>
            ) : (
              <View style={styles.despList}>
                {despesasFixas.map((d, index) => {
                  const inicial = (d.descricao || '?').charAt(0).toUpperCase();
                  const isFirst = index === 0;
                  const isLast = index === despesasFixas.length - 1;
                  return (
                    <View key={d.id} style={[
                      styles.despItem,
                      isFirst && styles.despItemFirst,
                      isLast && styles.despItemLast,
                      !isLast && styles.despItemBorder,
                    ]}>
                      <View style={[styles.despAvatar, { backgroundColor: colors.coral + '18' }]}>
                        <Text style={[styles.despAvatarText, { color: colors.coral }]}>{inicial}</Text>
                      </View>
                      <View style={styles.despItemMain}>
                        <Text style={styles.despItemName} numberOfLines={1}>{d.descricao}</Text>
                        <Text style={styles.despItemValue}>{formatCurrency(d.valor)}</Text>
                      </View>
                      <View style={styles.despItemActions}>
                        <TouchableOpacity onPress={() => editarDespesaFixa(d)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.despEditBtn}>
                          <Feather name="edit-2" size={13} color={colors.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removerDespesaFixa(d.id, d.descricao)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.despDeleteBtn}>
                          <Feather name="trash-2" size={13} color={colors.disabled} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total mensal</Text>
              <Text style={styles.totalValue}>{formatCurrency(totalFixas)}</Text>
            </View>
            {faturamentoMedio > 0 && (
              <Text style={styles.totalSub}>Representa {formatPercent(despFixasPerc)} do faturamento</Text>
            )}
          </View>
        )}
      </View>

      {/* ④ Despesas Variáveis */}
      <View style={styles.sectionCard}>
        <SectionHeader
          title="Despesas Variáveis"
          sectionKey="variaveis"
          icon="percent"
          iconColor={colors.purple}
          badge={totalVariaveis > 0 ? formatPercent(totalVariaveis) : null}
          badgeColor={colors.error}
          tooltip={{
            title: 'O que são Despesas Variáveis?',
            text: 'São percentuais descontados sobre cada venda. Quanto mais você vende, mais paga. Geralmente são taxas e impostos.',
            examples: ['Impostos (Simples Nacional)', 'Taxa do cartão de crédito', 'Comissão de vendedores', 'Taxa de marketplace'],
          }}
        />
        {expandedSections.variaveis && (
          <View style={styles.sectionBody}>
            <Text style={styles.sectionExplain}>
              Percentuais descontados sobre cada venda. Impactam a margem líquida.
            </Text>

            {/* Add form */}
            <View style={styles.addFormCompact}>
              <InputField
                style={{ flex: 1, marginBottom: 0, marginRight: spacing.xs }}
                value={novaVariavel.descricao}
                onChangeText={(v) => setNovaVariavel(prev => ({ ...prev, descricao: v }))}
                placeholder="Descrição (ex: Impostos)"
              />
              <TouchableOpacity
                style={styles.tapValueBtn}
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
                <Text style={[styles.tapValueText, novaVariavel.percentual ? styles.tapValueTextFilled : null]}>
                  {novaVariavel.percentual ? `${novaVariavel.percentual}%` : '0%'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={adicionarDespesaVariavel}>
                <Text style={styles.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* List */}
            {despesasVariaveis.length === 0 ? (
              <Text style={styles.emptyListText}>Nenhuma despesa variável cadastrada</Text>
            ) : (
              <View style={styles.despList}>
                {despesasVariaveis.map((d, index) => {
                  const inicial = (d.descricao || '?').charAt(0).toUpperCase();
                  const isFirst = index === 0;
                  const isLast = index === despesasVariaveis.length - 1;
                  return (
                    <View key={d.id} style={[
                      styles.despItem,
                      isFirst && styles.despItemFirst,
                      isLast && styles.despItemLast,
                      !isLast && styles.despItemBorder,
                    ]}>
                      <View style={[styles.despAvatar, { backgroundColor: colors.purple + '18' }]}>
                        <Text style={[styles.despAvatarText, { color: colors.purple }]}>{inicial}</Text>
                      </View>
                      <View style={styles.despItemMain}>
                        <Text style={styles.despItemName} numberOfLines={1}>{d.descricao}</Text>
                        <Text style={styles.despItemValue}>{formatPercent(d.percentual)}</Text>
                      </View>
                      <View style={styles.despItemActions}>
                        <TouchableOpacity onPress={() => editarDespesaVariavel(d)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.despEditBtn}>
                          <Feather name="edit-2" size={13} color={colors.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removerDespesaVariavel(d.id, d.descricao)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }} style={styles.despDeleteBtn}>
                          <Feather name="trash-2" size={13} color={colors.disabled} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Total variável</Text>
              <Text style={styles.totalValue}>{formatPercent(totalVariaveis)}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>

      {/* Save feedback toast */}
      {savedFeedback && (
        <View style={styles.toast}>
          <Feather name="check-circle" size={14} color="#fff" style={{ marginRight: 6 }} /><Text style={styles.toastText}>{savedFeedback}</Text>
        </View>
      )}

      <Modal visible={!!editModal && isFocused} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModal(null)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>
              {editModal?.tipo === 'fixa' ? 'Editar Despesa Fixa' : 'Editar Despesa Variável'}
            </Text>
            <InputField
              label="Descrição"
              value={editModal?.descricao || ''}
              onChangeText={(v) => setEditModal(prev => prev ? { ...prev, descricao: v } : null)}
              placeholder="Descrição"
            />
            <InputField
              label={editModal?.tipo === 'fixa' ? 'Valor (R$)' : 'Percentual (%)'}
              value={editModal?.valor || ''}
              onChangeText={(v) => setEditModal(prev => prev ? { ...prev, valor: v } : null)}
              keyboardType="numeric"
              placeholder="0,00"
              suffix={editModal?.tipo === 'fixa' ? 'R$' : '%'}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModal(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarEdicao}>
                <Text style={styles.modalSaveText}>Salvar</Text>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, width: '100%' },
  content: { padding: spacing.md, width: '100%', paddingBottom: 40, maxWidth: 960, alignSelf: 'center' },

  // Top bar
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  topBarIcon: { fontSize: 28, marginRight: spacing.sm },
  topBarTitle: { fontSize: fonts.regular, fontWeight: '700', color: colors.text },
  topBarDesc: { fontSize: fonts.tiny, color: colors.textSecondary },
  topBarStatus: {
    width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center',
  },
  topBarStatusOk: { backgroundColor: colors.success + '15' },
  topBarStatusPending: { backgroundColor: '#FFF3E0' },
  topBarStatusText: { fontSize: fonts.small, fontWeight: '800' },

  // Progress
  progressRow: { marginBottom: spacing.md },
  progressBarBg: {
    height: 6, backgroundColor: colors.border, borderRadius: 3,
    overflow: 'hidden', marginBottom: spacing.xs,
  },
  progressBarFill: { height: 6, borderRadius: 3, backgroundColor: '#FF8F00' },
  pendenciasRow: { flexDirection: 'row', flexWrap: 'wrap' },
  pendenciaText: { fontSize: 11, color: '#E65100', marginRight: spacing.sm },

  // Painel resumo
  painelResumo: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  painelItem: { flex: 1, alignItems: 'center' },
  painelValue: { fontSize: fonts.regular, fontWeight: '800', color: colors.primary, marginBottom: 1 },
  painelLabel: { fontSize: 10, color: colors.textSecondary },
  painelDivider: { width: 1, backgroundColor: colors.border, marginVertical: 4 },
  painelWarning: {
    fontSize: 10, color: '#E65100', textAlign: 'center',
    marginBottom: spacing.md, marginTop: spacing.xs,
  },

  // Pie chart
  chartCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    padding: spacing.md,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  chartHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  chartTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    color: colors.text,
  },
  stackedBar: {
    flexDirection: 'row',
    borderRadius: 7,
    overflow: 'hidden',
    marginBottom: spacing.sm + 2,
  },
  chartLegend: {
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
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  legendLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
    flex: 1,
  },
  legendValue: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
  },

  // Section cards (accordion)
  sectionCard: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm + 4,
    paddingHorizontal: spacing.md,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  sectionDot: {
    width: 8, height: 8, borderRadius: 4, marginRight: 8,
  },
  sectionIconCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
    marginRight: 8,
  },
  sectionTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text, flex: 1 },
  sectionBadge: {
    backgroundColor: colors.inputBg,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sectionBadgeText: { fontSize: fonts.tiny, fontWeight: '700', color: colors.primary },
  sectionBody: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    backgroundColor: colors.surface,
  },
  sectionExplain: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    marginBottom: spacing.sm, lineHeight: 17,
  },

  // Margem
  margemRow: { flexDirection: 'row', alignItems: 'flex-end' },
  margemHint: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    padding: spacing.xs + 2, marginTop: spacing.sm,
  },
  margemHintText: { fontSize: 10, color: colors.textSecondary, textAlign: 'center' },

  // Faturamento grid (3 columns)
  fatGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    marginHorizontal: -spacing.xs / 2,
  },
  fatItem: {
    width: '33.33%',
    paddingHorizontal: spacing.xs / 2,
    marginBottom: spacing.sm,
  },
  fatItemDesktop: {
    width: '25%',
  },
  fatLabel: {
    fontSize: 10, color: colors.textSecondary, fontWeight: '700',
    textAlign: 'center', marginBottom: 2,
  },
  fatMediaRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  fatMediaLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.text },
  fatMediaValue: { fontSize: fonts.regular, fontWeight: '800', color: colors.primary },
  fatMediaSub: { fontSize: 10, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },
  fatValueBox: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm - 2,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.xs + 2, paddingHorizontal: 4,
    alignItems: 'center',
    minHeight: 36,
    justifyContent: 'center',
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

  // Tap value button
  tapValueBtn: {
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
    height: 40, paddingHorizontal: spacing.sm,
    minWidth: 100, alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.xs,
  },
  tapValueText: {
    fontSize: fonts.small, color: colors.disabled,
  },
  tapValueTextFilled: {
    color: colors.text, fontWeight: '600',
  },

  // Add form
  addFormCompact: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: spacing.sm,
  },
  addBtn: {
    backgroundColor: colors.primary, width: 40, height: 40,
    borderRadius: 20, justifyContent: 'center', alignItems: 'center',
  },
  addBtnText: { color: colors.textLight, fontSize: 22, fontWeight: '400', marginTop: -1 },

  // Desp list
  emptyListText: {
    fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, textAlign: 'center',
    paddingVertical: spacing.md,
  },
  despList: {
    borderRadius: borderRadius.md,
    overflow: 'hidden',
  },
  despItem: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg,
    paddingVertical: spacing.sm + 2,
    paddingLeft: spacing.sm + 2,
    paddingRight: spacing.xs,
    minHeight: 52,
  },
  despItemFirst: {
    borderTopLeftRadius: borderRadius.md, borderTopRightRadius: borderRadius.md,
  },
  despItemLast: {
    borderBottomLeftRadius: borderRadius.md, borderBottomRightRadius: borderRadius.md,
  },
  despItemBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  despAvatar: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    marginRight: spacing.sm,
  },
  despAvatarText: {
    fontSize: 13, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  despItemMain: { flex: 1 },
  despItemName: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginBottom: 1 },
  despItemValue: { fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.primary },
  despItemActions: { flexDirection: 'row', alignItems: 'center', marginLeft: spacing.sm },
  despEditBtn: { padding: spacing.xs + 2, marginRight: spacing.xs },
  despDeleteBtn: { padding: spacing.xs + 2 },

  // Total
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    marginTop: spacing.sm,
  },
  totalLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.text },
  totalValue: { fontSize: fonts.regular, fontWeight: '800', color: colors.primary },
  totalSub: { fontSize: 10, color: colors.textSecondary, textAlign: 'right', marginTop: 2 },

  // Save button
  btnSave: {
    backgroundColor: colors.primary, paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg, borderRadius: borderRadius.sm,
  },
  btnSaveText: { color: colors.textLight, fontWeight: '700', fontSize: fonts.small },

  // Toast
  toast: {
    position: 'absolute', bottom: 20, alignSelf: 'center',
    backgroundColor: colors.success, borderRadius: borderRadius.full,
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2, shadowRadius: 8, elevation: 6,
  },
  toastText: { color: colors.textLight, fontSize: fonts.small, fontWeight: '600' },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.lg },
  modalContent: { backgroundColor: '#fff', borderRadius: borderRadius.md, padding: spacing.lg, width: '100%', maxWidth: 440 },
  modalTitle: { fontSize: fonts.large, fontWeight: '700', color: colors.text, marginBottom: spacing.md, textAlign: 'center' },
  modalActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  modalCancelBtn: { flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: fonts.regular },
  modalSaveBtn: { flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm, backgroundColor: colors.primary, alignItems: 'center' },
  modalSaveText: { color: '#fff', fontWeight: '700', fontSize: fonts.regular },
});
