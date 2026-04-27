import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, TouchableWithoutFeedback } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import InputField from '../components/InputField';
import Card from '../components/Card';
import PickerSelect from '../components/PickerSelect';
import InfoTooltip from '../components/InfoTooltip';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import SaveStatus from '../components/SaveStatus';
import ModalFormWrapper from '../components/ModalFormWrapper';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useListDensity from '../hooks/useListDensity';
import { t } from '../i18n/pt-BR';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
// Sprint 2 S5 — checagem central de dependências antes de delete (audit P0-05).
import { contarDependencias, formatarMensagemDeps } from '../services/dependenciesService';
// Sessão 28.8 — exibe nome+marca p/ distinguir insumos com mesmo nome
import { formatInsumoLabel, formatIngLabel } from '../utils/formatInsumo';
import {
  UNIDADES_MEDIDA,
  formatCurrency,
  calcCustoIngrediente,
} from '../utils/calculations';

// Cores para categorias no picker
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

export default function PreparoFormScreen({ route, navigation }) {
  const editId = route.params?.id;
  const isFocused = useIsFocused();
  const { isDesktop, isMobile } = useResponsiveLayout();
  const { isCompact, buttonHeight } = useListDensity();
  // Sessão Forms-Mobile — agrupamentos 2-col viram coluna no mobile p/ não
  // espremer os inputs e respeitar o padrão de 1-campo-por-linha.
  const rowStyle = isMobile
    ? { flexDirection: 'column', gap: 0 }
    : { flexDirection: 'row', gap: spacing.sm };
  const [form, setForm] = useState({ nome: '', rendimento_total: '', unidade_medida: 'g', categoria_id: null, modo_preparo: '', observacoes: '', validade_dias: '', temp_congelado: '', tempo_congelado: '', temp_refrigerado: '', tempo_refrigerado: '', temp_ambiente: '', tempo_ambiente: '' });
  const [showInfoAdicional, setShowInfoAdicional] = useState(false); // collapsed by default for compactness
  const [ingredientes, setIngredientes] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [novoIng, setNovoIng] = useState({ materia_prima_id: null, quantidade: '' });
  const [quantityPrompt, setQuantityPrompt] = useState(null);
  const qtyInputRef = useRef(null);
  const [catPickerVisible, setCatPickerVisible] = useState(false);
  const [novaCatMode, setNovaCatMode] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [novaCatIcone, setNovaCatIcone] = useState('tag');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [ingAdicionado, setIngAdicionado] = useState(false);
  const [errors, setErrors] = useState({});
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const pendingNavAction = useRef(null);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;
  const ingredientesRef = useRef(ingredientes);
  ingredientesRef.current = ingredientes;
  const allowExit = useRef(false);

  // Validação dos campos obrigatórios
  function validateForm(f) {
    const errs = {};
    if (!f.nome.trim()) errs.nome = true;
    if (!f.rendimento_total || parseFloat(String(f.rendimento_total).replace(',', '.')) <= 0) errs.rendimento_total = true;
    return errs;
  }

  function isFormComplete(f) {
    return Object.keys(validateForm(f)).length === 0;
  }

  useEffect(() => {
    navigation.setOptions({ title: editId ? 'Editar preparo' : 'Novo preparo' });
    loadMateriasPrimas();
    if (editId) {
      loadItem();
    } else {
      setLoaded(true);
    }
  }, [editId]);

  // Recarregar lista de insumos ao voltar (ex: após criar novo insumo)
  // F2-J2-01: também recarrega categorias (criada inline em outro form precisa aparecer)
  useFocusEffect(useCallback(() => {
    loadMateriasPrimas();
    loadCategorias();
  }, []));

  // Intercepta saída para validar campos
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExit.current) return;
      if (editId) return; // Auto-save handles edit mode

      const f = formRef.current;
      if (!f.nome.trim() && !f.rendimento_total) return;

      if (!isFormComplete(f)) {
        e.preventDefault();
        setErrors(validateForm(f));
        pendingNavAction.current = e.data.action;
        setShowIncompleteModal(true);
      }
    });
    return unsubscribe;
  }, [navigation, editId]);

  // Auto-save: debounce 600ms após mudança no form (só no modo edição)
  useEffect(() => {
    if (!editId || !loaded) return;

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveStatus(null);
    saveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, ingredientes, loaded]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function loadMateriasPrimas() {
    const db = await getDatabase();
    setMateriasPrimas(await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome'));
  }

  async function loadCategorias() {
    const db = await getDatabase();
    setCategorias(await db.getAllAsync('SELECT * FROM categorias_preparos ORDER BY nome'));
  }

  async function loadItem() {
    const db = await getDatabase();
    const item = await db.getFirstAsync('SELECT * FROM preparos WHERE id = ?', [editId]);
    if (item) {
      setForm({ nome: item.nome, rendimento_total: String(item.rendimento_total || ''), unidade_medida: item.unidade_medida || 'g', categoria_id: item.categoria_id || null, modo_preparo: item.modo_preparo || '', observacoes: item.observacoes || '', validade_dias: String(item.validade_dias || ''), temp_congelado: item.temp_congelado || '', tempo_congelado: item.tempo_congelado || '', temp_refrigerado: item.temp_refrigerado || '', tempo_refrigerado: item.tempo_refrigerado || '', temp_ambiente: item.temp_ambiente || '', tempo_ambiente: item.tempo_ambiente || '' });
      if (item.modo_preparo || item.observacoes || item.validade_dias) setShowInfoAdicional(true);
      const ings = await db.getAllAsync(
        `SELECT pi.*, mp.nome as mp_nome, mp.marca as mp_marca, mp.preco_por_kg, mp.unidade_medida as mp_unidade FROM preparo_ingredientes pi
         JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.preparo_id = ?`, [editId]
      );
      setIngredientes(ings);
      // Marca como carregado após setar o form para evitar auto-save imediato
      setTimeout(() => setLoaded(true), 100);
    } else {
      setLoaded(true);
    }
  }

  const parseNum = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };
  const safeCusto = (v) => (Number.isFinite(v) && v >= 0 ? v : 0);

  function getUnidadeIngrediente(mpId) {
    const mp = materiasPrimas.find(m => m.id === mpId);
    return mp?.unidade_medida || 'g';
  }

  function getUnidadeDoIngrediente(ing) {
    const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
    return mp?.unidade_medida || ing.mp_unidade || 'g';
  }

  const custoTotal = ingredientes.reduce((acc, ing) => {
    const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
    const precoBase = mp?.preco_por_kg || ing.preco_por_kg || 0;
    const unidade = getUnidadeDoIngrediente(ing);
    return acc + safeCusto(calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade));
  }, 0);

  const rendimento = parseNum(form.rendimento_total);
  const custoKg = rendimento > 0 && Number.isFinite(custoTotal) ? (custoTotal / rendimento) * 1000 : 0;
  const temCustos = ingredientes.length > 0;

  function openQuantityPrompt(mpId) {
    const mp = materiasPrimas.find(m => m.id === mpId);
    if (!mp) return;
    setQuantityPrompt({
      materia_prima_id: mp.id,
      nome: mp.nome,
      marca: mp.marca || '',
      unidade: mp.unidade_medida || 'g',
      preco_por_kg: mp.preco_por_kg,
      quantidade: '',
    });
    setTimeout(() => qtyInputRef.current?.focus(), 200);
  }

  function confirmQuantity() {
    if (!quantityPrompt) return;
    const qtd = parseNum(quantityPrompt.quantidade);
    if (!Number.isFinite(qtd) || qtd <= 0) {
      // mantém modal aberto para o usuário corrigir
      return Alert.alert('Quantidade', 'Informe uma quantidade válida (maior que zero).');
    }
    setIngredientes(prev => [...prev, {
      materia_prima_id: quantityPrompt.materia_prima_id,
      mp_nome: quantityPrompt.nome,
      mp_marca: quantityPrompt.marca || '',
      preco_por_kg: quantityPrompt.preco_por_kg,
      mp_unidade: quantityPrompt.unidade,
      quantidade_utilizada: qtd,
    }]);
    setQuantityPrompt(null);
    setIngAdicionado(true);
    setTimeout(() => setIngAdicionado(false), 1500);
  }

  function adicionarIngrediente() {
    if (!novoIng.materia_prima_id) return Alert.alert('Selecione', 'Escolha um insumo antes de adicionar.');
    openQuantityPrompt(novoIng.materia_prima_id);
    setNovoIng({ materia_prima_id: null, quantidade: '' });
  }

  function removerIngrediente(index) {
    setIngredientes(prev => prev.filter((_, i) => i !== index));
  }

  // Auto-save para modo edição
  async function autoSave() {
    const f = formRef.current;
    if (!f.nome.trim()) return; // não salva sem nome

    const rend = parseNum(f.rendimento_total);
    const ings = ingredientesRef.current;

    const ct = ings.reduce((acc, ing) => {
      const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
      const precoBase = mp?.preco_por_kg || ing.preco_por_kg || 0;
      const unidade = getUnidadeDoIngrediente(ing);
      return acc + safeCusto(calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade));
    }, 0);
    const ck = rend > 0 && Number.isFinite(ct) ? (ct / rend) * 1000 : 0;
    const validadeDias = parseNum(f.validade_dias);

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync('UPDATE preparos SET nome=?, categoria_id=?, rendimento_total=?, unidade_medida=?, custo_total=?, custo_por_kg=?, modo_preparo=?, observacoes=?, validade_dias=?, temp_congelado=?, tempo_congelado=?, temp_refrigerado=?, tempo_refrigerado=?, temp_ambiente=?, tempo_ambiente=? WHERE id=?',
        [f.nome, f.categoria_id, rend, f.unidade_medida, ct, ck, f.modo_preparo || '', f.observacoes || '', validadeDias, f.temp_congelado || '', f.tempo_congelado || '', f.temp_refrigerado || '', f.tempo_refrigerado || '', f.temp_ambiente || '', f.tempo_ambiente || '', editId]);
      // Re-save ingredientes — DELETE + bulk INSERT (single statement quando possível)
      await db.runAsync('DELETE FROM preparo_ingredientes WHERE preparo_id = ?', [editId]);
      if (ings.length > 0) {
        const placeholders = ings.map(() => '(?,?,?,?)').join(',');
        const params = [];
        for (const ing of ings) {
          const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
          const precoBase = mp?.preco_por_kg || ing.preco_por_kg || 0;
          const unidade = getUnidadeDoIngrediente(ing);
          const custo = safeCusto(calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade));
          params.push(editId, ing.materia_prima_id, ing.quantidade_utilizada, custo);
        }
        await db.runAsync(
          `INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES ${placeholders}`,
          params
        );
      }
      setSaveStatus('saved');
    } catch (e) {
      console.error('[PreparoForm.autoSave]', e);
      setSaveStatus('error');
    }
  }

  // Salvar manual para modo criação
  async function salvarNovo() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return Alert.alert('Campos obrigatórios', 'Preencha todos os campos obrigatórios antes de salvar.');
    }
    setErrors({});
    allowExit.current = true;
    const db = await getDatabase();

    const result = await db.runAsync('INSERT INTO preparos (nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg, modo_preparo, observacoes, validade_dias, temp_congelado, tempo_congelado, temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
      [form.nome, form.categoria_id, rendimento, form.unidade_medida, custoTotal, custoKg, form.modo_preparo || '', form.observacoes || '', parseFloat(form.validade_dias) || 0, form.temp_congelado || '', form.tempo_congelado || '', form.temp_refrigerado || '', form.tempo_refrigerado || '', form.temp_ambiente || '', form.tempo_ambiente || '']);
    const newId = result.lastInsertRowId;
    for (const ing of ingredientes) {
      const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
      const precoBase = mp?.preco_por_kg || 0;
      const unidade = getUnidadeDoIngrediente(ing);
      const custo = calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade);
      await db.runAsync('INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES (?,?,?,?)',
        [newId, ing.materia_prima_id, ing.quantidade_utilizada, custo]);
    }
    navigation.goBack();
  }

  // Ações do modal de campos incompletos
  async function handleDeleteAndExit() {
    setShowIncompleteModal(false);
    allowExit.current = true;
    if (editId) {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM preparo_ingredientes WHERE preparo_id = ?', [editId]);
      await db.runAsync('DELETE FROM preparos WHERE id = ?', [editId]);
    }
    if (pendingNavAction.current) {
      navigation.dispatch(pendingNavAction.current);
    } else {
      navigation.goBack();
    }
  }

  function handleContinueEditing() {
    setShowIncompleteModal(false);
    pendingNavAction.current = null;
  }

  async function solicitarExclusao() {
    if (!editId) return;
    // Sprint 2 S5 — antes de excluir, mostra ao usuário em quantos produtos/preparos
    // este preparo é utilizado (evita órfãos silenciosos no CMV).
    let mensagemExtra = null;
    try {
      const db = await getDatabase();
      const deps = await contarDependencias(db, 'preparo', editId);
      if (deps.total > 0) {
        mensagemExtra = formatarMensagemDeps(deps, { acao: 'excluir', entidade: 'preparo' });
      }
    } catch (e) {
      console.error('[PreparoForm.solicitarExclusao.deps]', e);
    }
    setConfirmDelete({
      titulo: 'Excluir Preparo',
      nome: form.nome || 'este preparo',
      mensagemExtra,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM preparo_ingredientes WHERE preparo_id = ?', [editId]);
        await db.runAsync('DELETE FROM preparos WHERE id = ?', [editId]);
        setConfirmDelete(null);
        allowExit.current = true;
        navigation.goBack();
      },
    });
  }

  const formTitle = editId ? 'Editar Preparo' : 'Novo Preparo';

  return (
    <ModalFormWrapper title={formTitle} onClose={() => navigation.goBack()}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

        {/* Bloco 1 — Dados do Preparo */}
        <Card title="Dados do Preparo">
          <InputField
            label="Nome do preparo"
            value={form.nome}
            onChangeText={(v) => { setForm(p => ({ ...p, nome: v })); setErrors(p => ({ ...p, nome: undefined })); }}
            placeholder="Ex: Cebola Caramelizada"
            error={errors.nome}
          />

          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>Subcategoria</Text>
            <TouchableOpacity style={styles.pickerSelector} onPress={() => { setCatPickerVisible(true); setNovaCatMode(false); }}>
              <Text style={[styles.pickerText, !form.categoria_id && styles.pickerPlaceholder]}>
                {form.categoria_id
                  ? (() => { const c = categorias.find(x => x.id === form.categoria_id); return c ? c.nome : 'Selecione...'; })()
                  : 'Selecione uma subcategoria'}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <View style={rowStyle}>
            <View style={{ flex: 1 }}>
              <InputField
                label="Rendimento total"
                value={form.rendimento_total}
                onChangeText={(v) => { setForm(p => ({ ...p, rendimento_total: v })); setErrors(p => ({ ...p, rendimento_total: undefined })); }}
                keyboardType="numeric"
                placeholder="Ex: 500"
                error={errors.rendimento_total}
                rightLabel={
                  <InfoTooltip
                    title="Rendimento Total"
                    text="Quantidade final que o preparo rende após pronto. É a quantidade líquida que será usada nas receitas."
                    examples={[
                      'Calda de chocolate: 500g após pronta',
                      'Massa de bolo: 1200g de massa crua',
                      'Cebola caramelizada: 300g após redução',
                    ]}
                  />
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <PickerSelect
                label="Unidade"
                value={form.unidade_medida}
                onValueChange={(v) => setForm(p => ({ ...p, unidade_medida: v }))}
                options={UNIDADES_MEDIDA.map(u => ({ label: u.label, value: u.value }))}
              />
            </View>
          </View>
        </Card>

        {/* Bloco 2 — Ingredientes */}
        <Card title="Ingredientes" style={{ marginTop: spacing.sm }}>
          {/* Adicionar ingrediente */}
          <View style={styles.addIngSection}>
            <PickerSelect
              label="Adicionar insumo"
              value={null}
              onValueChange={(v) => { if (v) openQuantityPrompt(v); }}
              options={materiasPrimas.map(mp => ({ label: formatInsumoLabel(mp), value: mp.id }))}
              placeholder="Selecione um insumo"
              onCreateNew={() => navigation.navigate('MateriaPrimaForm')}
              createLabel="Cadastrar novo insumo"
            />
            {ingAdicionado && (
              <Text style={styles.addFeedback}>Ingrediente adicionado!</Text>
            )}
          </View>

          {/* Lista de ingredientes */}
          {ingredientes.length > 0 && (
            <View style={styles.ingListContainer}>
              <View style={styles.ingListHeader}>
                <Text style={[styles.ingHeaderText, { flex: 2 }]}>Insumo</Text>
                <Text style={[styles.ingHeaderText, { flex: 1, textAlign: 'center' }]}>Qtd.</Text>
                <Text style={[styles.ingHeaderText, { flex: 1, textAlign: 'center' }]}>Un.</Text>
                <Text style={[styles.ingHeaderText, { flex: 1.2, textAlign: 'right', paddingRight: 28 }]}>Custo</Text>
              </View>

              {ingredientes.map((ing, idx) => {
                const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
                const precoBase = mp?.preco_por_kg || ing.preco_por_kg || 0;
                const unidade = getUnidadeDoIngrediente(ing);
                const custo = calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade);
                return (
                  <View key={idx} style={[styles.ingRow, idx % 2 === 0 && styles.ingRowEven]}>
                    <Text style={[styles.ingCell, { flex: 2 }]} numberOfLines={1}>{formatIngLabel(ing) || formatInsumoLabel(mp)}</Text>
                    <Text style={[styles.ingCell, { flex: 1, textAlign: 'center' }]}>{ing.quantidade_utilizada}</Text>
                    <Text style={[styles.ingCell, { flex: 1, textAlign: 'center' }]}>{unidade}</Text>
                    <Text style={[styles.ingCellCusto, { flex: 1.2, textAlign: 'right' }]}>{formatCurrency(custo)}</Text>
                    <TouchableOpacity onPress={() => removerIngrediente(idx)} style={styles.ingRemoveBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      <Text style={styles.ingRemoveText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              <View style={styles.ingFooter}>
                <Text style={styles.ingFooterLabel}>Total dos ingredientes</Text>
                <Text style={styles.ingFooterValue}>{formatCurrency(custoTotal)}</Text>
              </View>
            </View>
          )}

          {ingredientes.length === 0 && (
            <View style={styles.ingEmpty}>
              <Text style={styles.ingEmptyText}>Selecione insumos acima para montar o preparo.</Text>
            </View>
          )}
        </Card>

        {/* Custos Calculados */}
        {temCustos && rendimento > 0 ? (
          <View style={styles.resultBar}>
            <View style={styles.resultChip}>
              <Text style={styles.resultChipLabel}>Custo Total</Text>
              <Text style={styles.resultChipValue}>{formatCurrency(custoTotal)}</Text>
            </View>
            <View style={[styles.resultChip, styles.resultChipHighlight]}>
              <Text style={styles.resultChipLabel}>
                Custo/{form.unidade_medida === 'L' || form.unidade_medida === 'mL' ? 'L' : form.unidade_medida === 'un' ? 'Un' : 'Kg'}
              </Text>
              <Text style={[styles.resultChipValue, { color: colors.primary }]}>{formatCurrency(custoKg)}</Text>
            </View>
            <View style={styles.resultChip}>
              <Text style={styles.resultChipLabel}>Rendimento</Text>
              <Text style={styles.resultChipValue}>{rendimento}{form.unidade_medida}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.resultEmpty}>
            <Feather name="bar-chart-2" size={14} color={colors.disabled} />
            <Text style={styles.resultEmptyText}>
              {ingredientes.length === 0
                ? 'Adicione ingredientes e informe o rendimento para ver os custos.'
                : 'Informe o rendimento total para calcular o custo por kg.'}
            </Text>
          </View>
        )}

        {/* Informações Adicionais */}
        <TouchableOpacity
          style={styles.collapsibleHeader}
          onPress={() => setShowInfoAdicional(!showInfoAdicional)}
          activeOpacity={0.7}
        >
          <Feather name="file-text" size={14} color={colors.textSecondary} />
          <Text style={styles.collapsibleText}>Informações Adicionais <Text style={{ fontSize: 11, color: colors.disabled }}>(opcional)</Text></Text>
          <Feather name={showInfoAdicional ? 'chevron-up' : 'chevron-down'} size={16} color={colors.disabled} />
        </TouchableOpacity>

        {showInfoAdicional && (
          <View style={styles.infoAdicionalBody}>
            <InputField
              label="Modo de Preparo"
              value={form.modo_preparo}
              onChangeText={(v) => setForm(p => ({ ...p, modo_preparo: v }))}
              placeholder="Descreva o passo a passo..."
              multiline
              numberOfLines={4}
              style={{ minHeight: 80, textAlignVertical: 'top' }}
            />
            <InputField
              label="Observações"
              value={form.observacoes}
              onChangeText={(v) => setForm(p => ({ ...p, observacoes: v }))}
              placeholder="Dicas, variações, alérgenos..."
              multiline
              numberOfLines={3}
              style={{ minHeight: 60, textAlignVertical: 'top' }}
            />
            <View style={isMobile ? { flexDirection: 'column' } : { flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Validade (dias)"
                  value={form.validade_dias}
                  onChangeText={(v) => setForm(p => ({ ...p, validade_dias: v }))}
                  keyboardType="numeric"
                  placeholder="Ex: 7"
                />
              </View>
              {!isMobile && <View style={{ flex: 2 }} />}
            </View>

            <Text style={{ fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginTop: spacing.sm, marginBottom: 4 }}>Conservação</Text>
            {[
              { key: 'congelado', icon: 'box', label: 'Congelado', tempKey: 'temp_congelado', tempoKey: 'tempo_congelado' },
              { key: 'refrigerado', icon: 'thermometer', label: 'Refrigerado', tempKey: 'temp_refrigerado', tempoKey: 'tempo_refrigerado' },
              { key: 'ambiente', icon: 'sun', label: 'Ambiente', tempKey: 'temp_ambiente', tempoKey: 'tempo_ambiente' },
            ].map(c => (
              <View key={c.key} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: 6 }}>
                <Feather name={c.icon} size={13} color={colors.textSecondary} />
                <Text style={{ fontSize: 12, fontFamily: fontFamily.medium, color: colors.text, width: 80 }}>{c.label}</Text>
                <TextInput
                  style={styles.conservInput}
                  value={form[c.tempKey]}
                  onChangeText={(v) => setForm(p => ({ ...p, [c.tempKey]: v }))}
                  placeholder="Temp."
                  placeholderTextColor={colors.disabled}
                />
                <TextInput
                  style={styles.conservInput}
                  value={form[c.tempoKey]}
                  onChangeText={(v) => setForm(p => ({ ...p, [c.tempoKey]: v }))}
                  placeholder="Duração"
                  placeholderTextColor={colors.disabled}
                />
              </View>
            ))}
          </View>
        )}

        {/* Excluir */}
        {editId && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
            {isFormComplete(form) && <TouchableOpacity style={[styles.btnDelete, { borderColor: colors.primary + '30' }]} onPress={async () => {
              const f = formRef.current;
              // CR-5: catch antes era silencioso — log do erro de auto-save antes de duplicar
              try { await autoSave(); } catch(e) {
                if (typeof console !== 'undefined' && console.error) console.error('[PreparoForm.duplicar.autoSave]', e);
              }
              const db = await getDatabase();
              const result = await db.runAsync('INSERT INTO preparos (nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg, modo_preparo, observacoes, validade_dias) VALUES (?,?,?,?,?,?,?,?,?)',
                [f.nome.trim() + ' (cópia)', f.categoria_id, parseFloat(f.rendimento_total) || 0, f.unidade_medida, 0, 0, f.modo_preparo || '', f.observacoes || '', parseFloat(f.validade_dias) || 0]);
              const newId = result?.lastInsertRowId;
              if (newId) {
                const ings = await db.getAllAsync('SELECT * FROM preparo_ingredientes WHERE preparo_id = ?', [editId]);
                for (const ing of ings) {
                  await db.runAsync('INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES (?,?,?,?)',
                    [newId, ing.materia_prima_id, ing.quantidade_utilizada, ing.custo]);
                }
                allowExit.current = true;
                navigation.replace('PreparoForm', { id: newId });
              }
            }}>
              <Feather name="copy" size={13} color={colors.primary} style={{ marginRight: 5 }} />
              <Text style={[styles.btnDeleteText, { color: colors.primary }]}>Duplicar</Text>
            </TouchableOpacity>}
            <TouchableOpacity style={styles.btnDelete} onPress={solicitarExclusao}>
              <Feather name="trash-2" size={13} color={colors.error} style={{ marginRight: 5 }} />
              <Text style={styles.btnDeleteText}>Excluir</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 80 }} />
      </ScrollView>

      {/* Footer: save+back (edição) ou botão salvar (novo) */}
      {editId ? (
        <View style={styles.editFooter}>
          {saveStatus && (
            <View style={styles.autoSaveBar}>
              <SaveStatus status={saveStatus} variant="badge" />
            </View>
          )}
          <TouchableOpacity style={styles.saveBackBtn} onPress={async () => { allowExit.current = true; try { await autoSave(); } catch(e) {
            // CR-5: catch antes era silencioso — log + status de erro p/ feedback
            if (typeof console !== 'undefined' && console.error) console.error('[PreparoForm.saveBackBtn]', e);
            setSaveStatus('error');
          } const returnTo = route.params?.returnTo; if (returnTo) { navigation.navigate(returnTo); } else { navigation.goBack(); } }}>
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.saveBackBtnText}>Salvar e voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={[styles.btnSave, { minHeight: buttonHeight, paddingVertical: isCompact ? spacing.sm : spacing.md }]} onPress={salvarNovo}>
            <Text style={styles.btnSaveText}>Salvar Preparo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de seleção / criação de subcategoria */}
      <Modal visible={catPickerVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setCatPickerVisible(false); setNovaCatMode(false); }}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>

            {!novaCatMode ? (
              <>
                <Text style={styles.modalTitle}>Subcategoria</Text>

                <ScrollView style={{ maxHeight: 300 }}>
                  {categorias.map((c, idx) => {
                    const dotColor = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catOption, form.categoria_id === c.id && styles.catOptionAtivo]}
                        onPress={() => {
                          setForm(p => ({ ...p, categoria_id: c.id }));
                          setCatPickerVisible(false);
                        }}
                      >
                        <View style={[styles.catOptionDot, { backgroundColor: dotColor }]} />
                        <Text style={[styles.catOptionText, form.categoria_id === c.id && styles.catOptionTextAtivo]}>{c.nome}</Text>
                        {form.categoria_id === c.id && <Feather name="check" size={16} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity style={styles.novaCatBtn} onPress={() => setNovaCatMode(true)}>
                  <Feather name="plus" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.novaCatBtnText}>Criar nova subcategoria</Text>
                </TouchableOpacity>

                {form.categoria_id && (
                  <TouchableOpacity
                    style={styles.limparBtn}
                    onPress={() => { setForm(p => ({ ...p, categoria_id: null })); setCatPickerVisible(false); }}
                  >
                    <Text style={styles.limparBtnText}>Remover subcategoria</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Nova Subcategoria</Text>

                <Text style={styles.modalLabel}>Nome</Text>
                <TextInput
                  style={styles.modalInput}
                  value={novaCatNome}
                  onChangeText={setNovaCatNome}
                  placeholder="Ex: Recheios, Caldas..."
                  placeholderTextColor={colors.disabled}
                  autoFocus
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNovaCatMode(false)}>
                    <Text style={styles.modalCancelText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={async () => {
                    if (!novaCatNome.trim()) return Alert.alert(t.alertAttention, t.validation.requiredSubcategoryName);
                    const db = await getDatabase();
                    const result = await db.runAsync('INSERT INTO categorias_preparos (nome, icone) VALUES (?, ?)', [novaCatNome.trim(), 'tag']);
                    const newId = result.lastInsertRowId;
                    setForm(p => ({ ...p, categoria_id: newId }));
                    setNovaCatNome('');
                    setNovaCatIcone('tag');
                    setNovaCatMode(false);
                    setCatPickerVisible(false);
                    loadCategorias();
                  }}>
                    <Text style={styles.modalSaveText}>Criar e Selecionar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Quantity Prompt */}
      <Modal visible={!!quantityPrompt} transparent animationType="fade" onRequestClose={() => setQuantityPrompt(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setQuantityPrompt(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { maxWidth: 360 }]} onPress={() => {}}>
            {quantityPrompt && (
              <>
                <Text style={styles.modalTitle}>{quantityPrompt.nome}</Text>
                <Text style={styles.modalLabel}>Quantidade ({quantityPrompt.unidade})</Text>
                <TextInput
                  ref={qtyInputRef}
                  style={styles.modalInput}
                  value={quantityPrompt.quantidade}
                  onChangeText={(v) => setQuantityPrompt(prev => prev ? { ...prev, quantidade: v } : null)}
                  keyboardType="numeric"
                  placeholder="Ex: 200"
                  placeholderTextColor={colors.disabled}
                  autoFocus
                  onSubmitEditing={confirmQuantity}
                  returnKeyType="done"
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setQuantityPrompt(null)}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={confirmQuantity}>
                    <Text style={styles.modalSaveText}>Adicionar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <ConfirmDeleteModal
        visible={!!confirmDelete}
        isFocused={isFocused}
        titulo={confirmDelete?.titulo}
        nome={confirmDelete?.nome}
        aviso={confirmDelete?.mensagemExtra}
        onConfirm={confirmDelete?.onConfirm}
        onCancel={() => setConfirmDelete(null)}
      />

      {/* Modal de campos incompletos */}
      <Modal visible={showIncompleteModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.incompleteModal}>
            <View style={styles.incompleteIconCircle}>
              <Feather name="alert-circle" size={28} color={colors.error} />
            </View>
            <Text style={styles.incompleteTitle}>Campos obrigatórios</Text>
            <Text style={styles.incompleteDesc}>
              Preencha todos os campos obrigatórios antes de sair. Deseja excluir este preparo ou continuar editando?
            </Text>
            <TouchableOpacity style={styles.incompleteBtnEdit} onPress={handleContinueEditing} activeOpacity={0.7}>
              <Feather name="edit-2" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnEditText}>Continuar editando</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.incompleteBtnDelete} onPress={handleDeleteAndExit} activeOpacity={0.7}>
              <Feather name="trash-2" size={15} color={colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnDeleteText}>Excluir preparo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ModalFormWrapper>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.background },
  container: { flex: 1 },
  content: { padding: spacing.md },
  row: { flexDirection: 'row', gap: spacing.sm },

  // Adicionar ingrediente
  addIngSection: { marginBottom: spacing.sm },
  addRow: { flexDirection: 'row', alignItems: 'flex-end' },
  addBtn: {
    backgroundColor: colors.primary, width: 36, height: 36, borderRadius: 18,
    justifyContent: 'center', alignItems: 'center', marginBottom: spacing.md,
  },
  addFeedback: {
    fontSize: fonts.tiny, color: colors.success, fontWeight: '600',
    textAlign: 'center', marginTop: spacing.xs,
  },

  // Lista de ingredientes
  ingListContainer: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  ingListHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.xs,
    backgroundColor: colors.primary, borderRadius: borderRadius.sm, marginBottom: 2,
  },
  ingHeaderText: { fontSize: fonts.tiny, fontWeight: '700', color: colors.textLight },
  ingRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  ingRowEven: { backgroundColor: colors.inputBg },
  ingCell: { fontSize: fonts.small, color: colors.text },
  ingCellCusto: { fontSize: fonts.small, fontWeight: '600', color: colors.primary },
  ingRemoveBtn: { width: 28, alignItems: 'center' },
  ingRemoveText: { color: colors.disabled, fontSize: 13, fontWeight: '600' },
  ingFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xs,
    paddingRight: spacing.xs + 28,
    backgroundColor: colors.primary + '15', borderRadius: borderRadius.sm, marginTop: spacing.xs,
  },
  ingFooterLabel: { fontSize: fonts.small, fontWeight: '700', color: colors.text },
  ingFooterValue: { fontSize: fonts.regular, fontWeight: '700', color: colors.primary },

  // Ingredientes vazio
  ingEmpty: { alignItems: 'center', paddingVertical: spacing.md },
  ingEmptyText: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', fontStyle: 'italic' },

  // Custos calculados (chips)
  resultBar: {
    flexDirection: 'row', gap: spacing.xs + 2,
    marginTop: spacing.sm, paddingHorizontal: 2,
  },
  resultChip: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
  },
  resultChipHighlight: {
    backgroundColor: colors.primary + '10',
  },
  resultChipLabel: {
    fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.3, marginBottom: 2,
  },
  resultChipValue: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },
  resultEmpty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginTop: spacing.sm,
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
  },
  resultEmptyText: {
    fontSize: fonts.tiny, color: colors.disabled, flex: 1,
  },

  // Edit footer with save+back
  editFooter: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border,
    gap: spacing.sm,
  },
  saveBackBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.primary, paddingVertical: 8, paddingHorizontal: 16,
    borderRadius: borderRadius.md,
  },
  saveBackBtnText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, fontWeight: '600', color: '#fff' },
  autoSaveBar: {
    flexDirection: 'row', alignItems: 'center',
    gap: 6,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  autoSaveText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium, fontWeight: '500',
    color: colors.textSecondary,
  },

  // Botão salvar fixo (só para novo)
  stickyFooter: {
    backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    paddingBottom: spacing.md,
  },
  btnSave: {
    backgroundColor: colors.primary, padding: spacing.md,
    borderRadius: borderRadius.sm, alignItems: 'center',
  },
  btnSaveText: { color: colors.textLight, fontWeight: '700', fontSize: fonts.regular },

  // Excluir
  collapsibleHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: spacing.xs, marginTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.border + '40',
  },
  collapsibleText: { flex: 1, fontSize: 13, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text },
  infoAdicionalBody: { paddingTop: spacing.xs },
  conservInput: {
    flex: 1, height: 32, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingHorizontal: 8,
    fontSize: 12, fontFamily: fontFamily.regular, color: colors.text,
    backgroundColor: colors.background,
  },
  btnDelete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.error + '40',
    padding: spacing.xs + 4, borderRadius: borderRadius.sm, marginTop: spacing.sm,
  },
  btnDeleteText: { color: colors.error, fontWeight: '600', fontSize: fonts.small },

  // Picker customizado
  pickerContainer: { marginBottom: spacing.sm },
  pickerLabel: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: '600' },
  pickerSelector: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2,
  },
  pickerText: { fontSize: fonts.regular, color: colors.text },
  pickerPlaceholder: { color: colors.disabled },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', padding: spacing.sm,
  },
  modalContent: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 600, maxHeight: '90%',
  },
  modalTitle: { fontSize: fonts.large, fontWeight: '700', color: colors.text, marginBottom: spacing.md, textAlign: 'center' },
  modalLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2, fontSize: fonts.regular, color: colors.text,
  },

  // Opções de categoria
  catOption: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border, borderRadius: borderRadius.sm,
  },
  catOptionAtivo: { backgroundColor: colors.primary + '15' },
  catOptionDot: { width: 8, height: 8, borderRadius: 4, marginRight: spacing.sm },
  catOptionText: { fontSize: fonts.regular, color: colors.text, flex: 1 },
  catOptionTextAtivo: { color: colors.primary, fontWeight: '700' },

  novaCatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 4, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: borderRadius.sm, backgroundColor: colors.primary + '08',
  },
  novaCatBtnText: { fontSize: fonts.regular, fontWeight: '600', color: colors.primary },

  limparBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  limparBtnText: { fontSize: fonts.small, color: colors.error, fontWeight: '600' },

  modalActions: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.lg, gap: spacing.sm },
  modalCancelBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border, alignItems: 'center',
  },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: fonts.regular },
  modalSaveBtn: {
    flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm,
    backgroundColor: colors.primary, alignItems: 'center',
  },
  modalSaveText: { color: colors.textLight, fontWeight: '700', fontSize: fonts.regular },

  // Modal campos incompletos
  incompleteModal: {
    backgroundColor: '#fff', borderRadius: borderRadius.md,
    padding: spacing.lg, width: '100%', maxWidth: 340,
    alignItems: 'center',
  },
  incompleteIconCircle: {
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.error + '12',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: spacing.md,
  },
  incompleteTitle: {
    fontSize: fonts.large, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text, marginBottom: spacing.xs, textAlign: 'center',
  },
  incompleteDesc: {
    fontSize: fonts.small, fontFamily: fontFamily.regular,
    color: colors.textSecondary, textAlign: 'center',
    lineHeight: 20, marginBottom: spacing.lg,
  },
  incompleteBtnEdit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, width: '100%', marginBottom: spacing.sm,
  },
  incompleteBtnEditText: {
    color: '#fff', fontFamily: fontFamily.bold, fontWeight: '700',
    fontSize: fonts.regular,
  },
  incompleteBtnDelete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.error + '40',
    borderRadius: borderRadius.sm, paddingVertical: spacing.sm + 2, width: '100%',
  },
  incompleteBtnDeleteText: {
    color: colors.error, fontFamily: fontFamily.semiBold, fontWeight: '600',
    fontSize: fonts.regular,
  },
});
