import React, { useState, useEffect, useRef } from 'react';
import { ScrollView, View, StyleSheet, TouchableOpacity, Text, Alert, Modal, TextInput, Keyboard, TouchableWithoutFeedback, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import InputField from '../components/InputField';
import PickerSelect from '../components/PickerSelect';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useIsFocused } from '@react-navigation/native';
import { calcPrecoUnitarioEmbalagem, formatCurrency } from '../utils/calculations';

const UNIDADES_EMBALAGEM = [
  { label: 'Unidades', value: 'Unidades' },
  { label: 'Metros', value: 'Metros' },
  { label: 'Rolos', value: 'Rolos' },
];

export default function EmbalagemFormScreen({ route, navigation }) {
  const editId = route.params?.id;
  const isFocused = useIsFocused();
  const [form, setForm] = useState({
    nome: '', marca: '', categoria_id: null,
    quantidade: '', unidade_medida: 'Unidades', preco_embalagem: '',
  });
  const [categorias, setCategorias] = useState([]);
  const [catPickerVisible, setCatPickerVisible] = useState(false);
  const [novaCatMode, setNovaCatMode] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [errors, setErrors] = useState({});
  const [historicoPrecos, setHistoricoPrecos] = useState([]);
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
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
    if (!f.quantidade || parseFloat(String(f.quantidade).replace(',', '.')) <= 0) errs.quantidade = true;
    if (!f.preco_embalagem || parseFloat(String(f.preco_embalagem).replace(',', '.')) <= 0) errs.preco_embalagem = true;
    return errs;
  }

  function isFormComplete(f) {
    return Object.keys(validateForm(f)).length === 0;
  }

  useEffect(() => {
    navigation.setOptions({ title: editId ? 'Editar Embalagem' : 'Nova Embalagem' });
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
      if (allowExit.current) return;
      if (editId) return; // Auto-save handles edit mode

      const f = formRef.current;
      if (!f.nome.trim() && !f.quantidade && !f.preco_embalagem) return;

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
  }, [form, loaded]);

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  async function loadCategorias() {
    const db = await getDatabase();
    setCategorias(await db.getAllAsync('SELECT * FROM categorias_embalagens ORDER BY nome'));
  }

  async function loadItem() {
    const db = await getDatabase();
    const item = await db.getFirstAsync('SELECT * FROM embalagens WHERE id = ?', [editId]);
    if (item) {
      setForm({
        nome: item.nome, marca: item.marca || '',
        categoria_id: item.categoria_id || null,
        quantidade: String(item.quantidade || ''),
        unidade_medida: item.unidade_medida || 'Unidades',
        preco_embalagem: String(item.preco_embalagem || ''),
      });
      // Load price history
      try {
        const hist = await db.getAllAsync('SELECT * FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 10', [editId]);
        setHistoricoPrecos((hist || []).reverse());
      } catch(e) {}
      // Marca como carregado após setar o form para evitar auto-save imediato
      setTimeout(() => setLoaded(true), 100);
    } else {
      setLoaded(true);
    }
  }

  const parseNum = (v) => parseFloat(String(v).replace(',', '.')) || 0;
  const qtd = parseNum(form.quantidade);
  const preco = parseNum(form.preco_embalagem);
  const precoUn = calcPrecoUnitarioEmbalagem(preco, qtd);
  const temDadosCalculo = qtd > 0 && preco > 0;

  // Auto-save para modo edição
  async function autoSave() {
    const f = formRef.current;
    if (!f.nome.trim()) return; // não salva sem nome

    const q = parseFloat(String(f.quantidade).replace(',', '.')) || 0;
    const p = parseFloat(String(f.preco_embalagem).replace(',', '.')) || 0;
    const pu = calcPrecoUnitarioEmbalagem(p, q);

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE embalagens SET nome=?, marca=?, categoria_id=?, quantidade=?, unidade_medida=?, preco_embalagem=?, preco_unitario=? WHERE id=?',
        [f.nome, f.marca, f.categoria_id, q, f.unidade_medida, p, pu, editId]
      );
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
    const params = [form.nome, form.marca, form.categoria_id, qtd, form.unidade_medida, preco, precoUn];
    await db.runAsync(
      'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
      params
    );
    navigation.goBack();
  }

  // Ações do modal de campos incompletos
  async function handleDeleteAndExit() {
    setShowIncompleteModal(false);
    allowExit.current = true;
    if (editId) {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM embalagens WHERE id = ?', [editId]);
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
      titulo: 'Excluir Embalagem',
      nome: form.nome || 'esta embalagem',
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM embalagens WHERE id = ?', [editId]);
        setConfirmDelete(null);
        allowExit.current = true;
        navigation.goBack();
      },
    });
  }

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
    <View style={styles.wrapper}>
      <View style={styles.content}>

        {/* Nome da embalagem */}
        <InputField
          label="Nome da embalagem"
          value={form.nome}
          onChangeText={(v) => { setForm(p => ({ ...p, nome: v })); setErrors(p => ({ ...p, nome: undefined })); }}
          placeholder="Ex: Marmita 500ml"
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
              placeholder="Ex: Galvanotek"
              style={styles.fieldCompact}
            />
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.pickerContainer}>
              <Text style={styles.pickerLabel}>Categoria</Text>
              <TouchableOpacity style={styles.pickerSelector} onPress={() => { setCatPickerVisible(true); setNovaCatMode(false); }}>
                <Text style={[styles.pickerText, !form.categoria_id && styles.pickerPlaceholder]} numberOfLines={1}>
                  {form.categoria_id
                    ? (() => { const c = categorias.find(x => x.id === form.categoria_id); return c ? c.nome : 'Selecione'; })()
                    : 'Selecione'}
                </Text>
                <Feather name="chevron-down" size={14} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Unidade + Quantidade */}
        <View style={styles.row}>
          <View style={{ flex: 0.7 }}>
            <PickerSelect
              label="Unidade"
              value={form.unidade_medida}
              onValueChange={(v) => setForm(p => ({ ...p, unidade_medida: v }))}
              options={UNIDADES_EMBALAGEM.map(u => ({ label: u.label, value: u.value }))}
              displayValue={form.unidade_medida}
            />
          </View>
          <View style={{ flex: 1 }}>
            <InputField
              label="Quantidade"
              value={form.quantidade}
              onChangeText={(v) => { setForm(p => ({ ...p, quantidade: v })); setErrors(p => ({ ...p, quantidade: undefined })); }}
              keyboardType="numeric"
              placeholder="Ex: 100"
              error={errors.quantidade}
              style={styles.fieldCompact}
            />
          </View>
        </View>

        {/* Preço Embalagem */}
        <InputField
          label="Preço Embalagem (R$)"
          value={form.preco_embalagem}
          onChangeText={(v) => { setForm(p => ({ ...p, preco_embalagem: v })); setErrors(p => ({ ...p, preco_embalagem: undefined })); }}
          keyboardType="numeric"
          placeholder="Ex: 25,00"
          error={errors.preco_embalagem}
          style={styles.fieldCompact}
        />

        {/* Resultado Calculado */}
        {temDadosCalculo ? (
          <View style={styles.resultBar}>
            <View style={[styles.resultChip, styles.resultChipHighlight]}>
              <Text style={styles.resultChipLabel}>Preço Unitário</Text>
              <Text style={[styles.resultChipValue, { color: colors.primary }]}>{formatCurrency(precoUn)}</Text>
            </View>
            <View style={styles.resultChip}>
              <Text style={styles.resultChipLabel}>Pacote</Text>
              <Text style={styles.resultChipValue}>{formatCurrency(preco)}</Text>
            </View>
            <View style={styles.resultChip}>
              <Text style={styles.resultChipLabel}>Qtd</Text>
              <Text style={styles.resultChipValue}>{qtd}</Text>
            </View>
          </View>
        ) : (
          <View style={styles.resultEmpty}>
            <Feather name="bar-chart-2" size={14} color={colors.disabled} />
            <Text style={styles.resultEmptyText}>
              Preencha os campos para ver o custo calculado.
            </Text>
          </View>
        )}

        {/* Histórico de Preço */}
        {editId && historicoPrecos.length > 1 && (
          <View style={styles.historicoCard}>
            <Text style={styles.historicoTitle}>📈 Histórico de Preço</Text>
            {(() => {
              const sorted = [...historicoPrecos].reverse();
              const prices = sorted.map(x => x.valor_pago);
              const min = Math.min(...prices);
              const max = Math.max(...prices);
              const range = max - min || 1;
              const ultimo = prices[prices.length - 1];
              const penultimo = prices.length >= 2 ? prices[prices.length - 2] : ultimo;
              const variacao = penultimo > 0 ? ((ultimo - penultimo) / penultimo * 100) : 0;
              return (
                <>
                  <View style={styles.historicoBars}>
                    {sorted.map((h, i) => {
                      const p = h.valor_pago;
                      const height = Math.max(12, ((p - min) / range) * 56 + 12);
                      const isLast = i === sorted.length - 1;
                      const data = h.data ? new Date(h.data).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit'}) : '';
                      return (
                        <View key={h.id || i} style={styles.historicoBarWrapper}>
                          <Text style={styles.historicoBarPrice}>{formatCurrency(p)}</Text>
                          <View style={[styles.historicoBar, { height, backgroundColor: isLast ? colors.primary : colors.primary+'30' }]} />
                          {data ? <Text style={styles.historicoBarDate}>{data}</Text> : null}
                          <TouchableOpacity
                            style={styles.historicoDeleteBtn}
                            onPress={async () => {
                              if (Platform.OS === 'web') {
                                const ok = window.confirm('Deseja excluir este registro de preço do histórico?');
                                if (ok) {
                                  try {
                                    const db = await getDatabase();
                                    await db.runAsync('DELETE FROM historico_precos WHERE id = ?', [h.id]);
                                    setHistoricoPrecos(prev => prev.filter(x => x.id !== h.id));
                                  } catch (e) {}
                                }
                              } else {
                                Alert.alert('Excluir registro', 'Deseja excluir este registro de preço?', [
                                  { text: 'Cancelar', style: 'cancel' },
                                  { text: 'Excluir', style: 'destructive', onPress: async () => {
                                    try { const db = await getDatabase(); await db.runAsync('DELETE FROM historico_precos WHERE id = ?', [h.id]); setHistoricoPrecos(prev => prev.filter(x => x.id !== h.id)); } catch(e) {}
                                  }}
                                ]);
                              }
                            }}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            {...(Platform.OS === 'web' ? { title: 'Excluir este registro de preço' } : {})}
                          >
                            <Feather name="x" size={9} color={colors.error + '80'} />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 11, color: variacao > 0 ? colors.error : variacao < 0 ? colors.success : colors.textSecondary, fontFamily: fontFamily.semiBold, marginTop: 8 }}>
                    {variacao > 0 ? '▲ Subiu' : variacao < 0 ? '▼ Caiu' : '= Estável'} {Math.abs(variacao).toFixed(1)}%
                  </Text>
                </>
              );
            })()}
          </View>
        )}

        {/* Excluir */}
        {editId && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
            {isFormComplete(form) && <TouchableOpacity style={[styles.btnDelete, { borderColor: colors.primary + '30' }]} onPress={async () => {
              const f = formRef.current;
              try { await autoSave(); } catch(e) {}
              const db = await getDatabase();
              const result = await db.runAsync('INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
                [f.nome.trim() + ' (cópia)', f.marca, f.categoria_id, parseFloat(f.quantidade) || 0, f.unidade_medida, parseFloat(String(f.preco_embalagem).replace(',','.')) || 0, parseFloat(f.preco_unitario) || 0]);
              if (result?.lastInsertRowId) { allowExit.current = true; navigation.replace('EmbalagemForm', { id: result.lastInsertRowId }); }
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

      </View>

      {/* Footer: save+back (edição) ou botão salvar (novo) */}
      {editId ? (
        <View style={styles.editFooter}>
          {saveStatus && (
            <View style={styles.autoSaveBar}>
              {saveStatus === 'saving' ? (
                <>
                  <Feather name="loader" size={13} color={colors.textSecondary} />
                  <Text style={styles.autoSaveText}>Salvando...</Text>
                </>
              ) : (
                <>
                  <Feather name="check-circle" size={13} color={colors.success} />
                  <Text style={[styles.autoSaveText, { color: colors.success }]}>Salvo</Text>
                </>
              )}
            </View>
          )}
          <TouchableOpacity style={styles.saveBackBtn} onPress={async () => {
            allowExit.current = true;
            // Save price to history
            const price = parseFloat(String(formRef.current.preco_embalagem).replace(',','.')) || 0;
            if (price > 0 && editId) {
              try {
                const db = await getDatabase();
                const lastHist = await db.getAllAsync('SELECT valor_pago FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 1', [editId]);
                if (!lastHist?.[0] || Math.abs(lastHist[0].valor_pago - price) > 0.001) {
                  await db.runAsync('INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)', [editId, price, 0]);
                }
              } catch(e) {}
            }
            autoSave();
            setTimeout(() => {
              const returnTo = route.params?.returnTo;
              if (returnTo) {
                navigation.navigate(returnTo);
              } else {
                navigation.navigate('Embalagens');
              }
            }, 200);
          }}>
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.saveBackBtnText}>Salvar e voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={styles.btnSave} onPress={salvarNovo}>
            <Text style={styles.btnSaveText}>Salvar Embalagem</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de seleção / criação de subcategoria */}
      <Modal visible={catPickerVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setCatPickerVisible(false); setNovaCatMode(false); }}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>

            {!novaCatMode ? (
              <>
                <Text style={styles.modalTitle}>Categoria</Text>

                <ScrollView style={{ maxHeight: 300 }}>
                  {categorias.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catOption, form.categoria_id === c.id && styles.catOptionAtivo]}
                      onPress={() => {
                        setForm(p => ({ ...p, categoria_id: c.id }));
                        setCatPickerVisible(false);
                      }}
                    >
                      <Text style={[styles.catOptionText, form.categoria_id === c.id && styles.catOptionTextAtivo]}>{c.nome}</Text>
                      {form.categoria_id === c.id && <Feather name="check" size={16} color={colors.primary} />}
                    </TouchableOpacity>
                  ))}
                </ScrollView>

                <TouchableOpacity style={styles.novaCatBtn} onPress={() => setNovaCatMode(true)}>
                  <Feather name="plus" size={16} color={colors.primary} style={{ marginRight: 6 }} />
                  <Text style={styles.novaCatBtnText}>Criar nova categoria</Text>
                </TouchableOpacity>

                {form.categoria_id && (
                  <TouchableOpacity
                    style={styles.limparBtn}
                    onPress={() => { setForm(p => ({ ...p, categoria_id: null })); setCatPickerVisible(false); }}
                  >
                    <Text style={styles.limparBtnText}>Remover categoria</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Nova Categoria</Text>

                <Text style={styles.modalLabel}>Nome</Text>
                <TextInput
                  style={styles.modalInput}
                  value={novaCatNome}
                  onChangeText={setNovaCatNome}
                  placeholder="Ex: Descartáveis, Caixas..."
                  placeholderTextColor={colors.disabled}
                  autoFocus
                />

                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNovaCatMode(false)}>
                    <Text style={styles.modalCancelText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={async () => {
                    if (!novaCatNome.trim()) return Alert.alert('Erro', 'Informe o nome da categoria');
                    const db = await getDatabase();
                    const result = await db.runAsync('INSERT INTO categorias_embalagens (nome, icone) VALUES (?, ?)', [novaCatNome.trim(), 'tag']);
                    const newId = result.lastInsertRowId;
                    setForm(p => ({ ...p, categoria_id: newId }));
                    setNovaCatNome('');
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
              Preencha todos os campos obrigatórios antes de sair. Deseja excluir esta embalagem ou continuar editando?
            </Text>
            <TouchableOpacity style={styles.incompleteBtnEdit} onPress={handleContinueEditing} activeOpacity={0.7}>
              <Feather name="edit-2" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnEditText}>Continuar editando</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.incompleteBtnDelete} onPress={handleDeleteAndExit} activeOpacity={0.7}>
              <Feather name="trash-2" size={15} color={colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnDeleteText}>Excluir embalagem</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1, backgroundColor: colors.background },
  content: { flex: 1, padding: spacing.md, paddingTop: spacing.sm },
  row: { flexDirection: 'row', gap: spacing.sm },
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
  resultChipLabel: {
    fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600',
    color: colors.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.3, marginBottom: 2,
  },
  resultChipValue: {
    fontSize: fonts.regular, fontFamily: fontFamily.bold, fontWeight: '700',
    color: colors.text,
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

  // Histórico de preço
  historicoCard: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.sm, marginTop: spacing.sm },
  historicoTitle: { fontSize: 13, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: 8 },
  historicoBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, minHeight: 100, paddingBottom: 4, backgroundColor: colors.background, borderRadius: borderRadius.sm, padding: spacing.sm },
  historicoBarWrapper: { alignItems: 'center', flex: 1, maxWidth: 64 },
  historicoBar: { width: '70%', maxWidth: 28, borderRadius: 4, minHeight: 8 },
  historicoBarPrice: { fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginBottom: 4, textAlign: 'center' },
  historicoBarDate: { fontSize: 9, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 3 },
  historicoDeleteBtn: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.error + '12', alignItems: 'center', justifyContent: 'center', marginTop: 4 },
});
