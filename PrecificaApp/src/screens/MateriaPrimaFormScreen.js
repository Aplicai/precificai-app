import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, View, StyleSheet, TouchableOpacity, Text, Alert, Modal, TextInput, Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import InputField from '../components/InputField';
import Card from '../components/Card';
import PickerSelect from '../components/PickerSelect';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import InfoTooltip from '../components/InfoTooltip';
import { useIsFocused } from '@react-navigation/native';
import {
  UNIDADES_MEDIDA,
  calcPrecoBase,
  calcFatorCorrecao,
  getLabelPrecoBase,
  formatCurrency,
  converterParaBase,
} from '../utils/calculations';

const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
];
function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export default function MateriaPrimaFormScreen({ route, navigation }) {
  const editId = route.params?.id;
  const isFocused = useIsFocused();
  const [form, setForm] = useState({
    nome: '', marca: '', categoria_id: null,
    quantidade_bruta: '', quantidade_liquida: '',
    unidade_medida: 'g',
    valor_pago: '',
  });
  const [categorias, setCategorias] = useState([]);
  const [catPickerVisible, setCatPickerVisible] = useState(false);
  const [novaCatMode, setNovaCatMode] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [novaCatIcone, setNovaCatIcone] = useState('tag');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [errors, setErrors] = useState({});
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [historicoPrecos, setHistoricoPrecos] = useState([]);
  const pendingNavAction = useRef(null);

  // Auto-save state
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;
  const allowExit = useRef(false);

  // Validação dos campos obrigatórios
  function validateForm(f) {
    const errs = {};
    if (!f.nome.trim()) errs.nome = true;
    if (!f.quantidade_bruta || parseFloat(String(f.quantidade_bruta).replace(',', '.')) <= 0) errs.quantidade_bruta = true;
    if (!f.quantidade_liquida || parseFloat(String(f.quantidade_liquida).replace(',', '.')) <= 0) errs.quantidade_liquida = true;
    if (!f.valor_pago || parseFloat(String(f.valor_pago).replace(',', '.')) <= 0) errs.valor_pago = true;
    return errs;
  }

  function isFormComplete(f) {
    return Object.keys(validateForm(f)).length === 0;
  }

  useEffect(() => {
    navigation.setOptions({ title: editId ? 'Editar Insumo' : 'Novo Insumo' });
    loadCategorias();
    if (editId) {
      loadItem();
    } else {
      setLoaded(true);
    }
  }, [editId]);

  // Intercepta saída para validar campos
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExit.current) return; // permite sair

      const f = formRef.current;
      // Se o form está totalmente vazio (novo sem preencher nada), deixa sair
      if (!f.nome.trim() && !f.quantidade_bruta && !f.quantidade_liquida && !f.valor_pago) {
        // Novo insumo sem nada preenchido — se existir no DB (editId), valida
        if (!editId) return;
      }

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

    // Limpa timer anterior
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);

    setSaveStatus(null);
    saveTimerRef.current = setTimeout(() => {
      autoSave();
    }, 600);

    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, loaded]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function loadCategorias() {
    const db = await getDatabase();
    setCategorias(await db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome'));
  }

  async function loadItem() {
    const db = await getDatabase();
    const item = await db.getFirstAsync('SELECT * FROM materias_primas WHERE id = ?', [editId]);
    if (item) {
      setForm({
        nome: item.nome,
        marca: item.marca || '',
        categoria_id: item.categoria_id || null,
        quantidade_bruta: String(item.quantidade_bruta || ''),
        quantidade_liquida: String(item.quantidade_liquida || ''),
        unidade_medida: item.unidade_medida || 'g',
        valor_pago: String(item.valor_pago || ''),
      });
      // Carregar histórico de preços
      try {
        const hist = await db.getAllAsync(
          'SELECT * FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC',
          [editId]
        );
        setHistoricoPrecos(hist.slice(0, 10).reverse()); // últimos 10, ordem cronológica
      } catch (e) { /* tabela pode não existir */ }
      // Marca como carregado após setar o form para evitar auto-save imediato
      setTimeout(() => setLoaded(true), 100);
    } else {
      setLoaded(true);
    }
  }

  function parseNum(val) {
    return parseFloat(String(val).replace(',', '.')) || 0;
  }

  const qtBruta = parseNum(form.quantidade_bruta);
  const qtLiquida = parseNum(form.quantidade_liquida);
  const valorPago = parseNum(form.valor_pago);
  const fatorCorrecao = calcFatorCorrecao(qtBruta, qtLiquida);
  const precoBase = calcPrecoBase(valorPago, qtLiquida, form.unidade_medida);
  const labelPreco = getLabelPrecoBase(form.unidade_medida);

  const temDadosCalculo = qtBruta > 0 && qtLiquida > 0 && valorPago > 0;
  const perdaPercent = qtBruta > 0 ? ((1 - qtLiquida / qtBruta) * 100) : 0;

  function sufixoUnidade() {
    const un = UNIDADES_MEDIDA.find(u => u.value === form.unidade_medida);
    return un ? un.value : '';
  }

  // Auto-save para modo edição
  async function autoSave() {
    const f = formRef.current;
    if (!f.nome.trim()) return; // não salva sem nome

    const qb = parseFloat(String(f.quantidade_bruta).replace(',', '.')) || 0;
    const ql = parseFloat(String(f.quantidade_liquida).replace(',', '.')) || 0;
    const vp = parseFloat(String(f.valor_pago).replace(',', '.')) || 0;
    const fc = calcFatorCorrecao(qb, ql);
    const pb = calcPrecoBase(vp, ql, f.unidade_medida);

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE materias_primas SET nome=?, marca=?, categoria_id=?, quantidade_bruta=?, quantidade_liquida=?, fator_correcao=?, unidade_medida=?, valor_pago=?, preco_por_kg=? WHERE id=?',
        [f.nome, f.marca, f.categoria_id, qb, ql, fc, f.unidade_medida, vp, pb, editId]
      );
      // Registrar histórico de preço
      if (vp > 0) {
        try {
          await db.runAsync(
            'INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)',
            [editId, vp, pb]
          );
        } catch (e) { /* ignora se tabela não existe ainda */ }
      }
      // Check margin erosion
      try {
        const affected = await db.getAllAsync(
          'SELECT DISTINCT p.id, p.nome, p.preco_venda FROM produto_ingredientes pi JOIN produtos p ON p.id = pi.produto_id WHERE pi.materia_prima_id = ? AND p.preco_venda > 0',
          [editId]
        );
        if (affected.length > 0) {
          const warnings = [];
          for (const prod of affected) {
            const ings = await db.getAllAsync('SELECT pi.quantidade_utilizada, mp.preco_por_kg, mp.unidade_medida FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.produto_id = ?', [prod.id]);
            const custoIng = ings.reduce((a, ing) => {
              const qtBase = converterParaBase(ing.quantidade_utilizada, ing.unidade_medida || 'g');
              return a + (qtBase / 1000) * (ing.preco_por_kg || 0);
            }, 0);
            const preps = await db.getAllAsync('SELECT pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id WHERE pp.produto_id = ?', [prod.id]);
            const custoPr = preps.reduce((a, pp) => {
              const qtBase = converterParaBase(pp.quantidade_utilizada, pp.unidade_medida || 'g');
              return a + (qtBase / 1000) * (pp.custo_por_kg || 0);
            }, 0);
            const embs = await db.getAllAsync('SELECT pe.quantidade_utilizada, e.preco_unitario FROM produto_embalagens pe JOIN embalagens e ON e.id = pe.embalagem_id WHERE pe.produto_id = ?', [prod.id]);
            const custoEmb = embs.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);
            const custoTotal = custoIng + custoPr + custoEmb;
            const margem = prod.preco_venda > 0 ? (prod.preco_venda - custoTotal) / prod.preco_venda : 0;
            if (margem < 0.10) {
              warnings.push(`${prod.nome}: margem ${(margem * 100).toFixed(1)}%`);
            }
          }
          if (warnings.length > 0) {
            Alert.alert(
              '⚠️ Margem em risco',
              `A alteração de preço impactou ${warnings.length} produto(s):\n\n${warnings.join('\n')}\n\nConsidere ajustar os preços de venda.`,
              [{ text: 'Entendi' }]
            );
          }
        }
      } catch (e) { /* silently ignore */ }
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus(null);
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
    const params = [
      form.nome, form.marca, form.categoria_id,
      qtBruta, qtLiquida,
      fatorCorrecao, form.unidade_medida,
      valorPago, precoBase,
    ];
    const result = await db.runAsync(
      'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
      params
    );
    // Registrar histórico de preço inicial
    if (valorPago > 0 && result?.lastInsertRowId) {
      try {
        await db.runAsync(
          'INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)',
          [result.lastInsertRowId, valorPago, precoBase]
        );
      } catch (e) { /* ignora se tabela não existe ainda */ }
    }
    navigation.goBack();
  }

  // Ações do modal de campos incompletos
  async function handleDeleteAndExit() {
    setShowIncompleteModal(false);
    allowExit.current = true;
    if (editId) {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM materias_primas WHERE id = ?', [editId]);
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

  function solicitarExclusao() {
    if (!editId) return;
    setConfirmDelete({
      titulo: 'Excluir Insumo',
      nome: form.nome || 'este insumo',
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM materias_primas WHERE id = ?', [editId]);
        setConfirmDelete(null);
        allowExit.current = true;
        navigation.goBack();
      },
    });
  }

  return (
    <KeyboardAvoidingView style={styles.wrapper} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
      <View>

        {/* Nome do insumo */}
        <InputField
          label="Nome do insumo"
          value={form.nome}
          onChangeText={(v) => { setForm(p => ({ ...p, nome: v })); setErrors(p => ({ ...p, nome: undefined })); }}
          placeholder="Ex: Farinha de trigo"
          error={errors.nome}
          style={styles.fieldCompact}
        />

        {/* Marca + Categoria */}
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <InputField
              label="Marca (opcional)"
              value={form.marca}
              onChangeText={(v) => setForm(p => ({ ...p, marca: v }))}
              placeholder="Ex: Dona Benta"
              style={styles.fieldCompact}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Categoria</Text>
              <TouchableOpacity style={styles.pickerSelector} onPress={() => { setCatPickerVisible(true); setNovaCatMode(false); }}>
                {form.categoria_id && (() => {
                    const idx = categorias.findIndex(x => x.id === form.categoria_id);
                    return idx >= 0 ? <View style={[styles.catDot, { backgroundColor: getCategoryColor(idx) }]} /> : null;
                  })()}
                <Text style={[styles.pickerText, !form.categoria_id && styles.pickerPlaceholder, form.categoria_id && { flex: 1 }]} numberOfLines={1}>
                  {form.categoria_id
                    ? (() => { const c = categorias.find(x => x.id === form.categoria_id); return c ? c.nome : 'Selecione'; })()
                    : 'Selecione'}
                </Text>
                <Feather name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Unidade + Qtd. Bruta + Qtd. Líquida */}
        <View style={styles.row}>
          <View style={{ flex: 0.7 }}>
            <PickerSelect
              label="Unidade"
              value={form.unidade_medida}
              onValueChange={(v) => setForm(p => ({ ...p, unidade_medida: v }))}
              options={UNIDADES_MEDIDA.map(u => ({ label: u.label, value: u.value }))}
              displayValue={form.unidade_medida}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="Qtd. Bruta"
              value={form.quantidade_bruta}
              onChangeText={(v) => { setForm(p => ({ ...p, quantidade_bruta: v })); setErrors(p => ({ ...p, quantidade_bruta: undefined })); }}
              keyboardType="numeric"
              placeholder="Ex: 1000"
              error={errors.quantidade_bruta}
              style={styles.fieldCompact}
              rightLabel={
                <InfoTooltip
                  title="Quantidade Bruta"
                  text="Peso ou volume TOTAL como comprado, incluindo partes descartadas."
                  examples={['Cebola com casca = 1000g', 'Frango com ossos = 2000g']}
                />
              }
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="Qtd. Líquida"
              value={form.quantidade_liquida}
              onChangeText={(v) => { setForm(p => ({ ...p, quantidade_liquida: v })); setErrors(p => ({ ...p, quantidade_liquida: undefined })); }}
              keyboardType="numeric"
              placeholder="Ex: 800"
              error={errors.quantidade_liquida}
              style={styles.fieldCompact}
              rightLabel={
                <InfoTooltip
                  title="Quantidade Líquida"
                  text="Peso ou volume APROVEITÁVEL, após retirar partes descartadas."
                  examples={['Cebola sem casca = 800g', 'Frango sem ossos = 1400g']}
                />
              }
            />
          </View>
        </View>

        {/* Valor Pago */}
        <InputField
          label="Valor Pago (R$)"
          value={form.valor_pago}
          onChangeText={(v) => { setForm(p => ({ ...p, valor_pago: v })); setErrors(p => ({ ...p, valor_pago: undefined })); }}
          keyboardType="numeric"
          placeholder="Ex: 5,00"
          error={errors.valor_pago}
          style={styles.fieldCompact}
          rightLabel={
            <InfoTooltip
              title="Valor Pago"
              text="Valor pago pela quantidade bruta, como na nota fiscal."
              examples={['1kg cebola por R$ 5,00', '500g camarão por R$ 35,00']}
            />
          }
        />

        {/* Resultado Calculado */}
        {temDadosCalculo ? (
          <>
            <View style={styles.resultBar}>
              <View style={styles.resultChip}>
                <View style={styles.resultChipLabelRow}>
                  <Text style={styles.resultChipLabel}>FC</Text>
                  <InfoTooltip
                    title="Fator de Correção (FC)"
                    text="Indica quanto você precisa comprar para obter a quantidade aproveitável. Quanto maior o FC, maior a perda do ingrediente."
                    examples={['FC 1.00 = sem perda', 'FC 1.25 = 20% de perda', 'FC 2.00 = 50% de perda']}
                  />
                </View>
                <Text style={styles.resultChipValue}>{fatorCorrecao.toFixed(2)}</Text>
              </View>
              <View style={[styles.resultChip, styles.resultChipHighlight]}>
                <Text style={styles.resultChipLabel}>{labelPreco}</Text>
                <Text style={[styles.resultChipValue, { color: colors.primary }]}>{formatCurrency(precoBase)}</Text>
              </View>
              {perdaPercent > 0 && (
                <View style={[styles.resultChip, { backgroundColor: colors.warning + '10' }]}>
                  <Text style={styles.resultChipLabel}>Perda</Text>
                  <Text style={[styles.resultChipValue, { color: colors.warning }]}>{perdaPercent.toFixed(0)}%</Text>
                </View>
              )}
            </View>
            {perdaPercent > 0 && (
              <Text style={styles.perdaHint}>
                Perda estimada: {perdaPercent.toFixed(0)}%. O custo real é {fatorCorrecao > 0 ? (1 / fatorCorrecao).toFixed(1) : '-'}x o preço pago
              </Text>
            )}
          </>
        ) : (
          <View style={styles.resultEmpty}>
            <Feather name="bar-chart-2" size={14} color={colors.disabled} />
            <Text style={styles.resultEmptyText}>
              Preencha os campos para ver o custo calculado.
            </Text>
          </View>
        )}

        {/* Histórico de preços */}
        {editId && historicoPrecos.length > 1 && (
          <View style={styles.historicoSection}>
            <View style={styles.historicoHeader}>
              <Feather name="trending-up" size={14} color={colors.textSecondary} />
              <Text style={styles.historicoTitle}>Histórico de Preço</Text>
            </View>
            <View style={styles.historicoChart}>
              {(() => {
                const precos = historicoPrecos.map(h => h.valor_pago);
                const max = Math.max(...precos);
                const min = Math.min(...precos);
                const range = max - min || 1;
                const ultimo = precos[precos.length - 1];
                const penultimo = precos.length >= 2 ? precos[precos.length - 2] : ultimo;
                const variacao = penultimo > 0 ? ((ultimo - penultimo) / penultimo * 100) : 0;
                return (
                  <>
                    <View style={styles.historicoBarContainer}>
                      {precos.map((p, i) => {
                        const height = Math.max(8, ((p - min) / range) * 40 + 8);
                        const isLast = i === precos.length - 1;
                        return (
                          <View key={i} style={styles.historicoBarWrapper}>
                            <View style={[styles.historicoBar, {
                              height,
                              backgroundColor: isLast ? colors.primary : colors.primary + '40',
                            }]} />
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.historicoInfo}>
                      <Text style={styles.historicoInfoText}>
                        Último: {formatCurrency(ultimo)}
                      </Text>
                      <Text style={[styles.historicoInfoText, {
                        color: variacao > 0 ? colors.error : variacao < 0 ? colors.success : colors.textSecondary
                      }]}>
                        {variacao > 0 ? '▲' : variacao < 0 ? '▼' : '='} {Math.abs(variacao).toFixed(1)}%
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          </View>
        )}

        {/* Salvar (edição) */}
        {editId && (
          <TouchableOpacity style={styles.btnSaveEdit} onPress={() => { allowExit.current = true; navigation.goBack(); }}>
            <Feather name="check" size={14} color={colors.primary} style={{ marginRight: 5 }} />
            <Text style={styles.btnSaveEditText}>Salvar e voltar</Text>
          </TouchableOpacity>
        )}

        {/* Excluir */}
        {editId && (
          <TouchableOpacity style={styles.btnDelete} onPress={solicitarExclusao}>
            <Feather name="trash-2" size={13} color={colors.error} style={{ marginRight: 5 }} />
            <Text style={styles.btnDeleteText}>Excluir Insumo</Text>
          </TouchableOpacity>
        )}

        {/* Auto-save status (edição) */}
        {editId && saveStatus && (
          <View style={styles.autoSaveInline}>
            {saveStatus === 'saving' ? (
              <Text style={styles.autoSaveInlineText}>Salvando...</Text>
            ) : (
              <Text style={[styles.autoSaveInlineText, { color: colors.success }]}>Alterações salvas automaticamente</Text>
            )}
          </View>
        )}

        {/* Botão salvar (novo) */}
        {!editId && (
          <TouchableOpacity style={styles.btnSave} onPress={salvarNovo}>
            <Text style={styles.btnSaveText}>Salvar Insumo</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 40 }} />
      </View>

      {/* Modal de seleção / criação de subcategoria */}
      <Modal visible={catPickerVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setCatPickerVisible(false); setNovaCatMode(false); }}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>

            {!novaCatMode ? (
              <>
                <Text style={styles.modalTitle}>Subcategoria</Text>

                <ScrollView style={{ maxHeight: 300 }}>
                  {categorias.map((c, idx) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catOption, form.categoria_id === c.id && styles.catOptionAtivo]}
                      onPress={() => {
                        setForm(p => ({ ...p, categoria_id: c.id }));
                        setCatPickerVisible(false);
                      }}
                    >
                      <View style={[styles.catDot, { backgroundColor: getCategoryColor(idx) }]} />
                      <Text style={[styles.catOptionText, { flex: 1 }, form.categoria_id === c.id && styles.catOptionTextAtivo]}>{c.nome}</Text>
                      {form.categoria_id === c.id && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
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
                  placeholder="Ex: Laticínios, Temperos..."
                  placeholderTextColor={colors.disabled}
                  autoFocus
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNovaCatMode(false)}>
                    <Text style={styles.modalCancelText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={async () => {
                    if (!novaCatNome.trim()) return Alert.alert('Erro', 'Informe o nome da subcategoria');
                    const db = await getDatabase();
                    const result = await db.runAsync('INSERT INTO categorias_insumos (nome, icone) VALUES (?, ?)', [novaCatNome.trim(), novaCatIcone]);
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

      <ConfirmDeleteModal
        visible={!!confirmDelete}
        isFocused={isFocused}
        titulo={confirmDelete?.titulo}
        nome={confirmDelete?.nome}
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
              Preencha todos os campos obrigatórios antes de sair. Deseja excluir este insumo ou continuar editando?
            </Text>
            <TouchableOpacity style={styles.incompleteBtnEdit} onPress={handleContinueEditing} activeOpacity={0.7}>
              <Feather name="edit-2" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnEditText}>Continuar editando</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.incompleteBtnDelete} onPress={handleDeleteAndExit} activeOpacity={0.7}>
              <Feather name="trash-2" size={15} color={colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnDeleteText}>Excluir insumo</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingTop: spacing.sm, paddingBottom: 20 },
  row: { flexDirection: 'row', gap: spacing.sm },
  catDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  fieldCompact: { marginBottom: spacing.sm },

  // Resultado calculado (compacto)
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
  resultChipLabelRow: {
    flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 2,
  },
  resultChipLabel: {
    fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  resultChipValue: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
  },

  perdaHint: {
    fontSize: fonts.tiny, fontFamily: fontFamily.medium, fontWeight: '500',
    color: colors.warning, textAlign: 'center',
    marginTop: spacing.xs + 2, paddingHorizontal: spacing.sm,
  },

  // Histórico de preços
  historicoSection: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  historicoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  historicoTitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  historicoChart: {},
  historicoBarContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    height: 52,
    paddingBottom: 4,
  },
  historicoBarWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  historicoBar: {
    width: '80%',
    maxWidth: 20,
    borderRadius: 3,
    minHeight: 4,
  },
  historicoInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  historicoInfoText: {
    fontSize: 11,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },

  // Resultado vazio
  resultEmpty: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: spacing.xs, marginTop: spacing.md,
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.md,
  },
  resultEmptyText: {
    fontSize: fonts.tiny, color: colors.disabled, flex: 1,
  },

  // Auto-save status bar
  autoSaveBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
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

  // Salvar e voltar (edição - sutil)
  btnSaveEdit: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.primary + '30',
    paddingVertical: spacing.sm, marginTop: spacing.md,
  },
  btnSaveEditText: { color: colors.primary, fontWeight: '600', fontSize: fonts.small },
  autoSaveInline: {
    alignItems: 'center', marginTop: spacing.sm,
  },
  autoSaveInlineText: { fontSize: fonts.tiny, color: colors.textSecondary },

  // Excluir
  btnDelete: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#fff', borderWidth: 1, borderColor: colors.error + '40',
    padding: spacing.xs + 4, borderRadius: borderRadius.sm, marginTop: spacing.md,
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
  catOptionText: { fontSize: fonts.regular, color: colors.text, flex: 1 },
  catOptionTextAtivo: { color: colors.primary, fontWeight: '700' },

  // Botão nova categoria
  novaCatBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.sm + 4, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: borderRadius.sm, backgroundColor: colors.primary + '08',
  },
  novaCatBtnText: { fontSize: fonts.regular, fontWeight: '600', color: colors.primary },

  // Limpar seleção
  limparBtn: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: spacing.xs },
  limparBtnText: { fontSize: fonts.small, color: colors.error, fontWeight: '600' },

  // Ações do modal
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
