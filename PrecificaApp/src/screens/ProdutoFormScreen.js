import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity, Alert, Modal, TextInput, Keyboard, TouchableWithoutFeedback } from 'react-native';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import InputField from '../components/InputField';
import Card from '../components/Card';
import PickerSelect from '../components/PickerSelect';
import InfoTooltip from '../components/InfoTooltip';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import {
  UNIDADES_MEDIDA, formatCurrency, formatPercent, calcMarkup, calcDespesasFixasPercentual,
  converterParaBase, getTipoUnidade, calcCustoIngrediente, calcCustoPreparo,
  calcFatorCorrecao, calcPrecoBase, getLabelPrecoBase, normalizeSearch, getTipoVenda,
} from '../utils/calculations';

const UNIDADES_TEMPO = [
  { label: 'Minutos', value: 'Minutos' },
  { label: 'Horas', value: 'Horas' },
  { label: 'Dias', value: 'Dias' },
];

// Cores para categorias no picker
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
  colors.primaryLight, colors.accentLight, colors.coralLight, colors.purpleLight,
];

const CONSERVACAO_OPCOES = [
  { key: 'congelado', label: 'Congelado', icon: 'box', tempDefault: '-18°C' },
  { key: 'refrigerado', label: 'Refrigerado', icon: 'thermometer', tempDefault: '0 a 5°C' },
  { key: 'ambiente', label: 'Ambiente', icon: 'sun', tempDefault: '20 a 25°C' },
];

export default function ProdutoFormScreen({ route, navigation }) {
  const isFocused = useIsFocused();
  const { isDesktop } = useResponsiveLayout();
  const editId = route.params?.id;
  const [form, setForm] = useState({
    nome: '', categoria_id: null, rendimento_total: '', unidade_rendimento: 'g',
    rendimento_unidades: '1', tempo_preparo: '', unidade_tempo: 'Minutos',
    preco_venda: '', margem_lucro_produto: '',
    validade_dias: '', modo_preparo: '', observacoes: '',
    conserv_congelado: false, temp_congelado: '', tempo_congelado: '',
    conserv_refrigerado: false, temp_refrigerado: '', tempo_refrigerado: '',
    conserv_ambiente: false, temp_ambiente: '', tempo_ambiente: '',
  });

  const [ingredientes, setIngredientes] = useState([]);
  const [produtoPreparos, setProdutoPreparos] = useState([]);
  const [produtoEmbalagens, setProdutoEmbalagens] = useState([]);
  const [materiasPrimas, setMateriasPrimas] = useState([]);
  const [preparosList, setPreparosList] = useState([]);
  const [embalagensList, setEmbalagensList] = useState([]);
  const [config, setConfig] = useState({ despFixasPerc: 0, despVarPerc: 0, lucroDesejado: 0.15, markup: 1 });

  const [novoIng, setNovoIng] = useState({ id: null, quantidade: '' });
  const [novoPreparo, setNovoPreparo] = useState({ id: null, quantidade: '' });
  const [novaEmb, setNovaEmb] = useState({ id: null, quantidade: '' });

  // Quantity prompt modal state: { type: 'ingrediente'|'preparo'|'embalagem', id, nome, unidade, detalhe, quantidade }
  const [quantityPrompt, setQuantityPrompt] = useState(null);
  const qtyInputRef = useRef(null);

  // Visual feedback states
  const [ingAdicionado, setIngAdicionado] = useState(false);
  const [prepAdicionado, setPrepAdicionado] = useState(false);
  const [embAdicionado, setEmbAdicionado] = useState(false);

  // Category picker state
  const [categorias, setCategorias] = useState([]);
  const [catPickerVisible, setCatPickerVisible] = useState(false);
  const [novaCatMode, setNovaCatMode] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [novaCatIcone, setNovaCatIcone] = useState('tag');

  // Search filters
  const [buscaIng, setBuscaIng] = useState('');
  const [buscaPreparo, setBuscaPreparo] = useState('');
  const [buscaEmb, setBuscaEmb] = useState('');

  // Collapsible section
  const [showInfoAdicionais, setShowInfoAdicionais] = useState(false);

  // New ingredient modal state
  const [novoIngModalVisible, setNovoIngModalVisible] = useState(false);
  const [novoIngForm, setNovoIngForm] = useState({
    nome: '', unidade_medida: 'g', quantidade_bruta: '', quantidade_liquida: '', valor_pago: '',
  });

  // New embalagem modal state
  const [novaEmbModalVisible, setNovaEmbModalVisible] = useState(false);
  const [novaEmbForm, setNovaEmbForm] = useState({ nome: '', quantidade: '', preco_embalagem: '' });

  // Delete modal
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [historicoPrecos, setHistoricoPrecos] = useState([]);

  // Auto-save & validation state
  const [errors, setErrors] = useState({});
  const [showIncompleteModal, setShowIncompleteModal] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved'
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef(null);
  const scrollRef = useRef(null);
  const formRef = useRef(form);
  formRef.current = form;
  const allowExit = useRef(false);
  const pendingNavAction = useRef(null);

  // Validação dos campos obrigatórios
  function validateForm(f) {
    const errs = {};
    if (!f.nome.trim()) errs.nome = true;
    if (!f.preco_venda || parseFloat(String(f.preco_venda).replace(',', '.')) <= 0) errs.preco_venda = true;
    return errs;
  }

  function isFormComplete(f) {
    return Object.keys(validateForm(f)).length === 0;
  }

  useEffect(() => {
    loadAuxData();
    loadCategorias();
    if (editId) {
      loadProduto();
    } else {
      setLoaded(true);
    }
  }, [editId]);

  // Dynamic title
  useEffect(() => {
    navigation.setOptions({ title: editId ? (form.nome || 'Ficha Técnica') : 'Nova Ficha Técnica' });
  }, [editId, form.nome]);

  useFocusEffect(
    useCallback(() => {
      loadAuxData();
      return () => setConfirmDelete(null);
    }, [])
  );

  // Intercepta saída para validar campos
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExit.current) return;
      // In edit mode, auto-save handles persistence — always allow exit
      if (editId) return;

      const f = formRef.current;
      // Se o form está totalmente vazio (novo sem preencher nada), deixa sair
      if (!f.nome.trim() && !f.preco_venda) return;

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

  const parseNum = (v) => parseFloat(String(v).replace(',', '.')) || 0;

  function sufixoUnidadeRendimento() {
    const un = UNIDADES_MEDIDA.find(u => u.value === form.unidade_rendimento);
    return un ? un.value : '';
  }

  async function loadCategorias() {
    const db = await getDatabase();
    setCategorias(await db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome'));
  }

  async function loadAuxData() {
    const db = await getDatabase();
    const [mpList, prepList, embList, cfgs, fixas, variaveis, fat] = await Promise.all([
      db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome'),
      db.getAllAsync('SELECT * FROM preparos ORDER BY nome'),
      db.getAllAsync('SELECT * FROM embalagens ORDER BY nome'),
      db.getAllAsync('SELECT * FROM configuracao'),
      db.getAllAsync('SELECT * FROM despesas_fixas'),
      db.getAllAsync('SELECT * FROM despesas_variaveis'),
      db.getAllAsync('SELECT * FROM faturamento_mensal'),
    ]);
    setMateriasPrimas(mpList);
    setPreparosList(prepList);
    setEmbalagensList(embList);

    const cfg = cfgs?.[0];
    const totalFixas = fixas.reduce((a, d) => a + (d.valor || 0), 0);
    const totalVar = variaveis.reduce((a, d) => a + (d.percentual || 0), 0);
    const mesesComFat = fat.filter(f => f.valor > 0);
    const fatMedio = mesesComFat.length > 0 ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length : 0;
    const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
    const lucro = cfg?.lucro_desejado || 0.15;
    const mk = calcMarkup(dfPerc, totalVar, lucro);

    setConfig({ despFixasPerc: dfPerc, despVarPerc: totalVar, lucroDesejado: lucro, markup: mk });
  }

  async function salvarNovoIngrediente() {
    if (!novoIngForm.nome.trim()) return Alert.alert('Erro', 'Informe o nome do ingrediente');
    const qtB = parseNum(novoIngForm.quantidade_bruta);
    const qtL = parseNum(novoIngForm.quantidade_liquida);
    const vp = parseNum(novoIngForm.valor_pago);
    const fc = calcFatorCorrecao(qtB, qtL);
    const pb = calcPrecoBase(vp, qtL, novoIngForm.unidade_medida);
    const db = await getDatabase();
    const result = await db.runAsync(
      'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
      [novoIngForm.nome.trim(), '', null, qtB, qtL, fc, novoIngForm.unidade_medida, vp, pb]
    );
    const newId = result.lastInsertRowId;
    const updated = await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome');
    setMateriasPrimas(updated);
    setNovoIngForm({ nome: '', unidade_medida: 'g', quantidade_bruta: '', quantidade_liquida: '', valor_pago: '' });
    setNovoIngModalVisible(false);
    // Open quantity prompt for the newly created ingredient
    const newItem = updated.find(m => m.id === newId);
    if (newItem) openQuantityPrompt('ingrediente', newItem);
  }

  async function salvarNovaEmbalagem() {
    if (!novaEmbForm.nome.trim()) return Alert.alert('Erro', 'Informe o nome da embalagem');
    const qtd = parseNum(novaEmbForm.quantidade);
    const precoEmb = parseNum(novaEmbForm.preco_embalagem);
    if (qtd <= 0) return Alert.alert('Erro', 'Informe a quantidade');
    if (precoEmb <= 0) return Alert.alert('Erro', 'Informe o preço da embalagem');
    const precoUnitario = precoEmb / qtd;
    const db = await getDatabase();
    const result = await db.runAsync(
      'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
      [novaEmbForm.nome.trim(), '', null, qtd, 'Unidades', precoEmb, precoUnitario]
    );
    const newId = result.lastInsertRowId;
    const updated = await db.getAllAsync('SELECT * FROM embalagens ORDER BY nome');
    setEmbalagensList(updated);
    setNovaEmbForm({ nome: '', quantidade: '', preco_embalagem: '' });
    setNovaEmbModalVisible(false);
    // Open quantity prompt for the newly created embalagem
    const newItem = updated.find(e => e.id === newId);
    if (newItem) openQuantityPrompt('embalagem', newItem);
  }

  async function loadProduto() {
    const db = await getDatabase();
    const p = await db.getFirstAsync('SELECT * FROM produtos WHERE id = ?', [editId]);
    if (p) {
      setForm({
        nome: p.nome, categoria_id: p.categoria_id || null,
        rendimento_total: String(p.rendimento_total || ''),
        unidade_rendimento: p.unidade_rendimento || 'g', rendimento_unidades: String(p.rendimento_unidades || '1'),
        tempo_preparo: String(p.tempo_preparo || ''), unidade_tempo: p.unidade_tempo || 'Minutos',
        preco_venda: String(p.preco_venda || ''),
        margem_lucro_produto: p.margem_lucro_produto != null ? String((p.margem_lucro_produto * 100).toFixed(1)) : '',
        validade_dias: String(p.validade_dias || ''), modo_preparo: p.modo_preparo || '',
        observacoes: p.observacoes || '',
        conserv_congelado: !!(p.temp_congelado || p.tempo_congelado),
        temp_congelado: p.temp_congelado || '', tempo_congelado: p.tempo_congelado || '',
        conserv_refrigerado: !!(p.temp_refrigerado || p.tempo_refrigerado),
        temp_refrigerado: p.temp_refrigerado || '', tempo_refrigerado: p.tempo_refrigerado || '',
        conserv_ambiente: !!(p.temp_ambiente || p.tempo_ambiente),
        temp_ambiente: p.temp_ambiente || '', tempo_ambiente: p.tempo_ambiente || '',
      });

      const ings = await db.getAllAsync(
        `SELECT pi.*, mp.nome as mp_nome, mp.preco_por_kg, mp.unidade_medida as mp_unidade FROM produto_ingredientes pi
         JOIN materias_primas mp ON mp.id = pi.materia_prima_id WHERE pi.produto_id = ?`, [editId]);
      setIngredientes(ings.map(i => ({ materia_prima_id: i.materia_prima_id, mp_nome: i.mp_nome || i.nome, preco_por_kg: i.preco_por_kg, quantidade_utilizada: i.quantidade_utilizada, unidade: i.mp_unidade || i.unidade_medida || 'g' })));

      const preps = await db.getAllAsync(
        `SELECT pp.*, pr.nome as pr_nome, pr.custo_por_kg, pr.unidade_medida as pr_unidade FROM produto_preparos pp
         JOIN preparos pr ON pr.id = pp.preparo_id WHERE pp.produto_id = ?`, [editId]);
      setProdutoPreparos(preps.map(p => ({ preparo_id: p.preparo_id, pr_nome: p.pr_nome || p.nome, custo_por_kg: p.custo_por_kg, quantidade_utilizada: p.quantidade_utilizada, unidade: p.pr_unidade || p.unidade_medida || 'g' })));

      const embs = await db.getAllAsync(
        `SELECT pe.*, em.nome as em_nome, em.preco_unitario FROM produto_embalagens pe
         JOIN embalagens em ON em.id = pe.embalagem_id WHERE pe.produto_id = ?`, [editId]);
      setProdutoEmbalagens(embs.map(e => ({ embalagem_id: e.embalagem_id, em_nome: e.em_nome || e.nome, preco_unitario: e.preco_unitario, quantidade_utilizada: e.quantidade_utilizada })));

      // Load price history for product (use offset ID to avoid collision with insumos)
      try {
        const prodHistId = editId + 1000000;
        const hist = await db.getAllAsync('SELECT * FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 10', [prodHistId]);
        setHistoricoPrecos((hist || []).reverse());
      } catch(e) {}

      // Marca como carregado após setar o form para evitar auto-save imediato
      setTimeout(() => setLoaded(true), 100);
    } else {
      setLoaded(true);
    }
  }

  // ========== COST CALCULATIONS ==========
  const custoInsumos = ingredientes.reduce((acc, ing) => {
    const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
    const precoBase = mp?.preco_por_kg || ing.preco_por_kg || 0;
    const unidade = ing.unidade || mp?.unidade_medida || 'g';
    return acc + calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade);
  }, 0);

  const custoPreparos = produtoPreparos.reduce((acc, pp) => {
    const pr = preparosList.find(p => p.id === pp.preparo_id);
    const cpk = pr?.custo_por_kg || pp.custo_por_kg || 0;
    const unidade = pp.unidade || pr?.unidade_medida || 'g';
    return acc + calcCustoPreparo(cpk, pp.quantidade_utilizada, unidade);
  }, 0);

  const custoEmbalagens = produtoEmbalagens.reduce((acc, pe) => {
    const em = embalagensList.find(e => e.id === pe.embalagem_id);
    const pu = em?.preco_unitario || pe.preco_unitario || 0;
    return acc + pu * pe.quantidade_utilizada;
  }, 0);

  const custoTotalReceita = custoInsumos + custoPreparos + custoEmbalagens;
  const rendUn = parseNum(form.rendimento_unidades) || 1;

  // Determinar tipo de venda usando função centralizada (calculations.js)
  const tipoVenda = getTipoVenda(form);

  // Por kg/litro: divide pelo rendimento total (em kg ou litros)
  // Por unidade: divide pelo número de unidades
  const custoUnitario = tipoVenda !== 'unidade'
    ? custoTotalReceita / (parseNum(form.rendimento_total) || 1)
    : custoTotalReceita / rendUn;

  const margemProduto = form.margem_lucro_produto.trim() !== ''
    ? parseNum(form.margem_lucro_produto) / 100
    : null;
  const lucroEfetivo = margemProduto !== null ? margemProduto : config.lucroDesejado;
  const markupEfetivo = margemProduto !== null
    ? calcMarkup(config.despFixasPerc, config.despVarPerc, margemProduto)
    : config.markup;

  const precoSugerido = markupEfetivo > 0 ? custoUnitario * markupEfetivo : 0;
  const precoVenda = parseNum(form.preco_venda) || precoSugerido;

  const despFixasValor = precoVenda * config.despFixasPerc;
  const despVarValor = precoVenda * config.despVarPerc;
  const lucroLiquido = precoVenda - custoUnitario - despFixasValor - despVarValor;
  const lucroPerc = precoVenda > 0 ? lucroLiquido / precoVenda : 0;
  const cmvPerc = precoVenda > 0 ? custoUnitario / precoVenda : 0;

  function showFeedback(setter) {
    setter(true);
    setTimeout(() => setter(false), 1500);
  }

  function addIngrediente(overrideId, overrideQtd) {
    const id = overrideId || novoIng.id;
    const qtd = overrideQtd || novoIng.quantidade;
    if (!id) return Alert.alert('Erro', 'Selecione um insumo');
    if (!qtd || parseNum(qtd) <= 0) return Alert.alert('Erro', 'Informe a quantidade');
    const mp = materiasPrimas.find(m => m.id === id);
    const unidade = mp?.unidade_medida || 'g';
    setIngredientes(prev => [...prev, { materia_prima_id: id, mp_nome: mp.nome, preco_por_kg: mp.preco_por_kg, quantidade_utilizada: parseNum(qtd), unidade }]);
    setNovoIng({ id: null, quantidade: '' });
    showFeedback(setIngAdicionado);
  }

  function addPreparo(overrideId, overrideQtd) {
    const id = overrideId || novoPreparo.id;
    const qtd = overrideQtd || novoPreparo.quantidade;
    if (!id) return Alert.alert('Erro', 'Selecione um preparo');
    if (!qtd || parseNum(qtd) <= 0) return Alert.alert('Erro', 'Informe a quantidade');
    const pr = preparosList.find(p => p.id === id);
    setProdutoPreparos(prev => [...prev, { preparo_id: id, pr_nome: pr.nome, custo_por_kg: pr.custo_por_kg, quantidade_utilizada: parseNum(qtd), unidade: pr.unidade_medida || 'g' }]);
    setNovoPreparo({ id: null, quantidade: '' });
    showFeedback(setPrepAdicionado);
  }

  function addEmbalagem(overrideId, overrideQtd) {
    const id = overrideId || novaEmb.id;
    const qtd = overrideQtd || novaEmb.quantidade;
    if (!id) return Alert.alert('Erro', 'Selecione uma embalagem');
    if (!qtd || parseNum(qtd) <= 0) return Alert.alert('Erro', 'Informe a quantidade');
    const em = embalagensList.find(e => e.id === id);
    setProdutoEmbalagens(prev => [...prev, { embalagem_id: id, em_nome: em.nome, preco_unitario: em.preco_unitario, quantidade_utilizada: parseNum(qtd) }]);
    setNovaEmb({ id: null, quantidade: '' });
    showFeedback(setEmbAdicionado);
  }

  // Open quantity prompt when tapping an item in the search list
  function openQuantityPrompt(type, item) {
    let nome, unidade, detalhe;
    if (type === 'ingrediente') {
      nome = item.nome;
      unidade = item.unidade_medida || 'g';
      detalhe = `${formatCurrency(item.preco_por_kg)}/${getLabelPrecoBase(item.unidade_medida).replace('Preço por ', '')}`;
    } else if (type === 'preparo') {
      nome = item.nome;
      unidade = item.unidade_medida || 'g';
      detalhe = `${formatCurrency(item.custo_por_kg)}/kg`;
    } else {
      nome = item.nome;
      unidade = 'un';
      detalhe = `${formatCurrency(item.preco_unitario)}/un`;
    }
    setQuantityPrompt({ type, id: item.id, nome, unidade, detalhe, quantidade: '' });
    setTimeout(() => qtyInputRef.current?.focus(), 200);
  }

  function confirmQuantityPrompt() {
    if (!quantityPrompt || !quantityPrompt.quantidade || parseNum(quantityPrompt.quantidade) <= 0) {
      return Alert.alert('Erro', 'Informe a quantidade');
    }
    const { type, id, quantidade } = quantityPrompt;
    if (type === 'ingrediente') addIngrediente(id, quantidade);
    else if (type === 'preparo') addPreparo(id, quantidade);
    else addEmbalagem(id, quantidade);
    setQuantityPrompt(null);
  }

  function getSelectedIngUnit() {
    if (!novoIng.id) return 'g/ml/un';
    const mp = materiasPrimas.find(m => m.id === novoIng.id);
    return mp?.unidade_medida || 'g';
  }

  function getSelectedPrepUnit() {
    if (!novoPreparo.id) return 'g/ml';
    const pr = preparosList.find(p => p.id === novoPreparo.id);
    return pr?.unidade_medida || 'g';
  }

  // Helper: custo de um ingrediente
  function custoIng(ing) {
    const mp = materiasPrimas.find(m => m.id === ing.materia_prima_id);
    const precoBase = mp?.preco_por_kg || ing.preco_por_kg || 0;
    const unidade = ing.unidade || mp?.unidade_medida || 'g';
    return calcCustoIngrediente(precoBase, ing.quantidade_utilizada, unidade, unidade);
  }

  function custoPreparo(pp) {
    const pr = preparosList.find(p => p.id === pp.preparo_id);
    const cpk = pr?.custo_por_kg || pp.custo_por_kg || 0;
    const unidade = pp.unidade || pr?.unidade_medida || 'g';
    return calcCustoPreparo(cpk, pp.quantidade_utilizada, unidade);
  }

  // Auto-save para modo edição (salva apenas campos principais do produto)
  async function autoSave() {
    const f = formRef.current;
    if (!f.nome.trim()) return; // não salva sem nome

    const margemSalvar = f.margem_lucro_produto.trim() !== '' ? parseFloat(String(f.margem_lucro_produto).replace(',', '.')) / 100 : null;
    const pv = parseFloat(String(f.preco_venda).replace(',', '.')) || 0;

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync(
        `UPDATE produtos SET nome=?, categoria_id=?, rendimento_total=?, unidade_rendimento=?, rendimento_unidades=?,
         tempo_preparo=?, preco_venda=?, margem_lucro_produto=?, validade_dias=?,
         temp_congelado=?, tempo_congelado=?, temp_refrigerado=?, tempo_refrigerado=?,
         temp_ambiente=?, tempo_ambiente=?, modo_preparo=?, observacoes=? WHERE id=?`,
        [
          f.nome, f.categoria_id, parseNum(f.rendimento_total), f.unidade_rendimento,
          parseNum(f.rendimento_unidades) || 1, parseNum(f.tempo_preparo), pv, margemSalvar,
          parseNum(f.validade_dias),
          f.conserv_congelado ? f.temp_congelado : '', f.conserv_congelado ? f.tempo_congelado : '',
          f.conserv_refrigerado ? f.temp_refrigerado : '', f.conserv_refrigerado ? f.tempo_refrigerado : '',
          f.conserv_ambiente ? f.temp_ambiente : '', f.conserv_ambiente ? f.tempo_ambiente : '',
          f.modo_preparo, f.observacoes, editId,
        ]
      );
      setSaveStatus('saved');
    } catch (e) {
      setSaveStatus(null);
    }
  }

  // Salvar manual (novo) ou atualizar (edição)
  async function salvar() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return Alert.alert('Campos obrigatórios', 'Preencha o nome do produto e o preço de venda antes de salvar.');
    }
    setErrors({});
    allowExit.current = true;

    try {
      const db = await getDatabase();
      const margemSalvar = form.margem_lucro_produto.trim() !== '' ? parseNum(form.margem_lucro_produto) / 100 : null;
      const params = [
        form.nome, form.categoria_id, parseNum(form.rendimento_total), form.unidade_rendimento,
        rendUn, parseNum(form.tempo_preparo), precoVenda, margemSalvar,
        parseNum(form.validade_dias),
        form.conserv_congelado ? form.temp_congelado : '', form.conserv_congelado ? form.tempo_congelado : '',
        form.conserv_refrigerado ? form.temp_refrigerado : '', form.conserv_refrigerado ? form.tempo_refrigerado : '',
        form.conserv_ambiente ? form.temp_ambiente : '', form.conserv_ambiente ? form.tempo_ambiente : '',
        form.modo_preparo, form.observacoes,
      ];

      let produtoId = editId;
      if (editId) {
        await db.runAsync(
          `UPDATE produtos SET nome=?, categoria_id=?, rendimento_total=?, unidade_rendimento=?, rendimento_unidades=?,
           tempo_preparo=?, preco_venda=?, margem_lucro_produto=?, validade_dias=?, temp_congelado=?, tempo_congelado=?,
           temp_refrigerado=?, tempo_refrigerado=?, temp_ambiente=?, tempo_ambiente=?,
           modo_preparo=?, observacoes=? WHERE id=?`, [...params, editId]);
        await db.runAsync('DELETE FROM produto_ingredientes WHERE produto_id = ?', [editId]);
        await db.runAsync('DELETE FROM produto_preparos WHERE produto_id = ?', [editId]);
        await db.runAsync('DELETE FROM produto_embalagens WHERE produto_id = ?', [editId]);
      } else {
        const result = await db.runAsync(
          `INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades,
           tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado,
           temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente,
           modo_preparo, observacoes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, params);
        produtoId = result.lastInsertRowId;
      }

      for (const ing of ingredientes) {
        await db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)',
          [produtoId, ing.materia_prima_id, ing.quantidade_utilizada]);
      }
      for (const pp of produtoPreparos) {
        await db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)',
          [produtoId, pp.preparo_id, pp.quantidade_utilizada]);
      }
      for (const pe of produtoEmbalagens) {
        await db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)',
          [produtoId, pe.embalagem_id, pe.quantidade_utilizada]);
      }

      const returnTo = route.params?.returnTo;
      if (returnTo) {
        navigation.navigate(returnTo);
      } else {
        navigation.goBack();
      }
    } catch (e) {
      allowExit.current = false;
      Alert.alert('Erro ao salvar', 'Ocorreu um erro ao salvar o produto. Tente novamente.');
    }
  }

  function solicitarExclusao() {
    setConfirmDelete({
      titulo: 'Excluir Produto',
      nome: form.nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM produto_ingredientes WHERE produto_id = ?', [editId]);
        await db.runAsync('DELETE FROM produto_preparos WHERE produto_id = ?', [editId]);
        await db.runAsync('DELETE FROM produto_embalagens WHERE produto_id = ?', [editId]);
        await db.runAsync('DELETE FROM produtos WHERE id = ?', [editId]);
        setConfirmDelete(null);
        allowExit.current = true;
        navigation.goBack();
      },
    });
  }

  // Ações do modal de campos incompletos
  async function handleDeleteAndExit() {
    setShowIncompleteModal(false);
    allowExit.current = true;
    if (editId) {
      const db = await getDatabase();
      await db.runAsync('DELETE FROM produto_ingredientes WHERE produto_id = ?', [editId]);
      await db.runAsync('DELETE FROM produto_preparos WHERE produto_id = ?', [editId]);
      await db.runAsync('DELETE FROM produto_embalagens WHERE produto_id = ?', [editId]);
      await db.runAsync('DELETE FROM produtos WHERE id = ?', [editId]);
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

  const temCustos = custoTotalReceita > 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView ref={scrollRef} style={styles.container} contentContainerStyle={[styles.content, isDesktop && { maxWidth: 960, alignSelf: 'center', width: '100%' }]} keyboardShouldPersistTaps="handled" onScrollBeginDrag={Keyboard.dismiss}>
        <View style={isDesktop ? styles.desktopRow : undefined}>
        <View style={isDesktop ? styles.desktopLeftCol : undefined}>
        {/* Bloco 1: Informações do Produto */}
        <Card title="Informações do Produto">
          <InputField label="Nome do Produto *" value={form.nome} onChangeText={(v) => { setForm(p => ({ ...p, nome: v })); setErrors(p => ({ ...p, nome: undefined })); }} placeholder="Ex: Hambúrguer Artesanal" error={errors.nome} errorText="Informe o nome do produto" />

          <View style={styles.pickerContainer}>
            <Text style={styles.pickerLabel}>Categoria</Text>
            <TouchableOpacity style={styles.pickerSelector} onPress={() => { setCatPickerVisible(true); setNovaCatMode(false); }}>
              <Text style={[styles.pickerText, !form.categoria_id && styles.pickerPlaceholder]}>
                {form.categoria_id
                  ? (() => { const c = categorias.find(x => x.id === form.categoria_id); return c ? c.nome : 'Selecione...'; })()
                  : 'Selecione uma categoria'}
              </Text>
              <Feather name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {(() => {

            return (
              <>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>Como você vende?</Text>
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                    {[
                      { label: 'Por unidade', value: 'unidade', icon: 'box' },
                      { label: 'Por kg', value: 'kg', icon: 'package' },
                      { label: 'Por litro', value: 'litro', icon: 'droplet' },
                    ].map(opt => (
                      <TouchableOpacity key={opt.value} style={[styles.vendaChip, tipoVenda === opt.value && styles.vendaChipActive]}
                        onPress={() => {
                          const map = { unidade: 'por_unidade', kg: 'por_kg', litro: 'por_litro' };
                          setForm(p => ({ ...p, unidade_rendimento: map[opt.value] }));
                        }}>
                        <Feather name={opt.icon} size={14} color={tipoVenda === opt.value ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                        <Text style={[styles.vendaChipText, tipoVenda === opt.value && styles.vendaChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {tipoVenda === 'unidade' ? (
                  <View style={styles.tempoRow}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <InputField
                        label="Quantas unidades a receita rende?"
                        value={form.rendimento_unidades}
                        onChangeText={(v) => setForm(p => ({ ...p, rendimento_unidades: v }))}
                        keyboardType="numeric"
                        placeholder="Ex: 10"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <InputField
                        label="Preço de Venda /un (R$) *"
                        value={form.preco_venda}
                        onChangeText={(v) => { setForm(p => ({ ...p, preco_venda: v })); setErrors(p => ({ ...p, preco_venda: undefined })); }}
                        keyboardType="numeric"
                        placeholder={precoSugerido > 0 ? precoSugerido.toFixed(2) : '0,00'}
                        error={errors.preco_venda}
                        errorText="Informe o preço de venda"
                      />
                    </View>
                  </View>
                ) : (
                  <View style={styles.tempoRow}>
                    <View style={{ flex: 1, marginRight: spacing.sm }}>
                      <InputField
                        label={`Rendimento total (${tipoVenda === 'kg' ? 'kg' : 'L'})`}
                        value={form.rendimento_total}
                        onChangeText={(v) => setForm(p => ({ ...p, rendimento_total: v }))}
                        keyboardType="numeric"
                        placeholder={tipoVenda === 'kg' ? 'Ex: 1,2' : 'Ex: 5'}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <InputField
                        label={`Preço por ${tipoVenda === 'kg' ? 'kg' : 'litro'} (R$) *`}
                        value={form.preco_venda}
                        onChangeText={(v) => { setForm(p => ({ ...p, preco_venda: v })); setErrors(p => ({ ...p, preco_venda: undefined })); }}
                        keyboardType="numeric"
                        placeholder={precoSugerido > 0 ? precoSugerido.toFixed(2) : '0,00'}
                        error={errors.preco_venda}
                        errorText="Informe o preço de venda"
                      />
                    </View>
                  </View>
                )}
              </>
            );
          })()}
        </Card>

        {/* Bloco 2: Custos e Precificação - DESTAQUE (mobile only, desktop goes to sidebar) */}
        {!isDesktop && temCustos && (
          <View style={styles.costsSummaryCard}>
            <View style={styles.costsHeader}>
              <Feather name="dollar-sign" size={16} color={colors.primary} />
              <Text style={styles.costsTitle}>Resumo de Custos</Text>
              <InfoTooltip
                title="Precificação"
                text="Preço sugerido = Custo Unitário × Markup. O Markup considera despesas fixas, variáveis e margem de lucro."
                examples={['Altere a margem individual abaixo', 'Preço sugerido se ajusta automaticamente']}
              />
            </View>
            <View style={styles.costsGrid}>
              <View style={styles.costsItem}>
                <Text style={styles.costsItemLabel}>CMV{tipoVenda === 'kg' ? '/kg' : tipoVenda === 'litro' ? '/L' : ' Unit.'}</Text>
                <Text style={styles.costsItemValue}>{formatCurrency(custoUnitario)}</Text>
              </View>
              <View style={styles.costsItem}>
                <Text style={styles.costsItemLabel}>Sugerido</Text>
                <Text style={[styles.costsItemValue, { color: colors.primary }]}>{formatCurrency(precoSugerido)}</Text>
              </View>
              <View style={styles.costsItem}>
                <Text style={styles.costsItemLabel}>Lucro</Text>
                <Text style={[styles.costsItemValue, { color: lucroLiquido >= 0 ? colors.success : colors.error }]}>
                  {formatCurrency(lucroLiquido)}
                </Text>
              </View>
              <View style={styles.costsItem}>
                <Text style={styles.costsItemLabel}>Margem</Text>
                <Text style={[styles.costsItemValue, { color: lucroPerc >= 0.1 ? colors.success : colors.coral }]}>
                  {formatPercent(lucroPerc)}
                </Text>
              </View>
            </View>
            <View style={styles.costsBreakdown}>
              <Text style={styles.costsBreakdownItem}>Insumos {formatCurrency(custoInsumos)}</Text>
              <Text style={styles.costsBreakdownSep}>·</Text>
              <Text style={styles.costsBreakdownItem}>Preparos {formatCurrency(custoPreparos)}</Text>
              <Text style={styles.costsBreakdownSep}>·</Text>
              <Text style={styles.costsBreakdownItem}>Emb. {formatCurrency(custoEmbalagens)}</Text>
            </View>
          </View>
        )}

        {/* Bloco 3: Preparos (search + table unified) */}
        <Card
          title={`Preparos${produtoPreparos.length > 0 ? ` (${produtoPreparos.length})` : ''}`}
          style={{ marginTop: spacing.md }}
          headerRight={
            <InfoTooltip
              title="O que é um Preparo?"
              text="Preparos são receitas intermediárias (ex: caldas, massas, recheios) que você faz antes de montar o produto final."
              examples={[
                'Calda de chocolate: usada em bolos e sobremesas',
                'Massa base de bolo: usada em vários sabores',
                'Cadastre na aba "Preparos" e selecione aqui',
              ]}
            />
          }
        >
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar preparo..."
              placeholderTextColor={colors.disabled}
              value={buscaPreparo}
              onChangeText={setBuscaPreparo}
            />
          </View>
          <TouchableOpacity style={styles.novoIngBtn} onPress={() => navigation.navigate('PreparoForm')}>
            <Text style={styles.novoIngBtnIcon}>+</Text>
            <Text style={styles.novoIngBtnText}>Criar novo preparo</Text>
          </TouchableOpacity>
          <ScrollView style={styles.selectionList} nestedScrollEnabled>
            {preparosList
              .filter(p => !buscaPreparo || normalizeSearch(p.nome).includes(normalizeSearch(buscaPreparo)))
              .map(p => (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.selListItem]}
                  onPress={() => openQuantityPrompt('preparo', p)}
                >
                  <Text style={[styles.selListItemName]}>{p.nome}</Text>
                  <Text style={[styles.selListItemDetail]}>
                    {p.unidade_medida || 'g'} - {formatCurrency(p.custo_por_kg)}/kg
                  </Text>
                </TouchableOpacity>
              ))}
            {preparosList.filter(p => !buscaPreparo || normalizeSearch(p.nome).includes(normalizeSearch(buscaPreparo))).length === 0 && (
              <Text style={styles.listEmpty}>Nenhum preparo encontrado</Text>
            )}
          </ScrollView>
          {prepAdicionado && <Text style={styles.feedbackText}>Preparo adicionado!</Text>}

          {produtoPreparos.length > 0 && (
            <View style={styles.tableBlock}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Preparo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Qtd</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8, textAlign: 'center' }]}>Un</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.2, textAlign: 'right' }]}>Custo</Text>
                <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}></Text>
              </View>
              {produtoPreparos.map((pp, idx) => {
                const pr = preparosList.find(p => p.id === pp.preparo_id);
                const unidade = pp.unidade || pr?.unidade_medida || 'g';
                return (
                  <View key={idx} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]}>
                    <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{pp.pr_nome || pr?.nome}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{pp.quantidade_utilizada}</Text>
                    <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>{unidade}</Text>
                    <Text style={[styles.tableCellCusto, { flex: 1.2, textAlign: 'right' }]}>{formatCurrency(custoPreparo(pp))}</Text>
                    <TouchableOpacity onPress={() => setProdutoPreparos(prev => prev.filter((_, i) => i !== idx))} style={{ width: 32, alignItems: 'center' }}>
                      <Text style={styles.removeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={styles.tableFooter}>
                <Text style={styles.tableFooterLabel}>Total Preparos:</Text>
                <Text style={styles.tableFooterValue}>{formatCurrency(custoPreparos)}</Text>
              </View>
            </View>
          )}
        </Card>

        {/* Bloco 4: Insumos (search + table unified) */}
        <Card
          title={`Insumos${ingredientes.length > 0 ? ` (${ingredientes.length})` : ''}`}
          style={{ marginTop: spacing.md }}
          headerRight={
            <InfoTooltip
              title="O que são Insumos?"
              text="Insumos são ingredientes comprados diretamente (ex: farinha, açúcar, ovos) usados na receita."
            />
          }
        >
          {/* Search + add */}
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar insumo..."
              placeholderTextColor={colors.disabled}
              value={buscaIng}
              onChangeText={setBuscaIng}
            />
          </View>
          <TouchableOpacity style={styles.novoIngBtn} onPress={() => setNovoIngModalVisible(true)}>
            <Text style={styles.novoIngBtnIcon}>+</Text>
            <Text style={styles.novoIngBtnText}>Criar novo insumo</Text>
          </TouchableOpacity>
          {buscaIng.length > 0 && (
          <ScrollView style={styles.selectionList} nestedScrollEnabled>
            {materiasPrimas
              .filter(m => normalizeSearch(m.nome).includes(normalizeSearch(buscaIng)))
              .map(m => (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.selListItem]}
                  onPress={() => openQuantityPrompt('ingrediente', m)}
                >
                  <Text style={[styles.selListItemName]}>{m.nome}</Text>
                  <Text style={[styles.selListItemDetail]}>
                    {formatCurrency(m.preco_por_kg)}/{getLabelPrecoBase(m.unidade_medida).replace('Preço por ', '')}
                  </Text>
                </TouchableOpacity>
              ))}
            {materiasPrimas.filter(m => normalizeSearch(m.nome).includes(normalizeSearch(buscaIng))).length === 0 && (
              <Text style={styles.listEmpty}>Nenhum insumo encontrado</Text>
            )}
          </ScrollView>
          )}
          {ingAdicionado && <Text style={styles.feedbackText}>Insumo adicionado!</Text>}

          {/* Table inline */}
          {ingredientes.length > 0 && (
            <View style={styles.tableBlock}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2 }]}>Insumo</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Qtd</Text>
                <Text style={[styles.tableHeaderText, { flex: 0.8, textAlign: 'center' }]}>Un</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.2, textAlign: 'right' }]}>Custo</Text>
                <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}></Text>
              </View>
              {ingredientes.map((ing, idx) => (
                <View key={idx} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]}>
                  <Text style={[styles.tableCell, { flex: 2 }]} numberOfLines={1}>{ing.mp_nome}</Text>
                  <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{ing.quantidade_utilizada}</Text>
                  <Text style={[styles.tableCell, { flex: 0.8, textAlign: 'center' }]}>{ing.unidade}</Text>
                  <Text style={[styles.tableCellCusto, { flex: 1.2, textAlign: 'right' }]}>{formatCurrency(custoIng(ing))}</Text>
                  <TouchableOpacity onPress={() => setIngredientes(prev => prev.filter((_, i) => i !== idx))} style={{ width: 32, alignItems: 'center' }}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <View style={styles.tableFooter}>
                <Text style={styles.tableFooterLabel}>Total Insumos:</Text>
                <Text style={styles.tableFooterValue}>{formatCurrency(custoInsumos)}</Text>
              </View>
            </View>
          )}
        </Card>

        {/* Bloco 5: Embalagens (search + table unified) */}
        <Card title={`Embalagens${produtoEmbalagens.length > 0 ? ` (${produtoEmbalagens.length})` : ''}`} style={{ marginTop: spacing.md }}>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar embalagem..."
              placeholderTextColor={colors.disabled}
              value={buscaEmb}
              onChangeText={setBuscaEmb}
            />
          </View>
          <TouchableOpacity style={styles.novoIngBtn} onPress={() => navigation.navigate('EmbalagemForm')}>
            <Text style={styles.novoIngBtnIcon}>+</Text>
            <Text style={styles.novoIngBtnText}>Criar nova embalagem</Text>
          </TouchableOpacity>
          {buscaEmb.length > 0 && (
          <ScrollView style={styles.selectionList} nestedScrollEnabled>
            {embalagensList
              .filter(e => normalizeSearch(e.nome).includes(normalizeSearch(buscaEmb)))
              .map(e => (
                <TouchableOpacity
                  key={e.id}
                  style={[styles.selListItem]}
                  onPress={() => openQuantityPrompt('embalagem', e)}
                >
                  <Text style={[styles.selListItemName]}>{e.nome}</Text>
                  <Text style={[styles.selListItemDetail]}>
                    {formatCurrency(e.preco_unitario)}/un
                  </Text>
                </TouchableOpacity>
              ))}
            {embalagensList.filter(e => normalizeSearch(e.nome).includes(normalizeSearch(buscaEmb))).length === 0 && (
              <Text style={styles.listEmpty}>Nenhuma embalagem encontrada</Text>
            )}
          </ScrollView>
          )}
          {embAdicionado && <Text style={styles.feedbackText}>Embalagem adicionada!</Text>}

          {produtoEmbalagens.length > 0 && (
            <View style={styles.tableBlock}>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderText, { flex: 2.5 }]}>Embalagem</Text>
                <Text style={[styles.tableHeaderText, { flex: 1, textAlign: 'center' }]}>Qtd</Text>
                <Text style={[styles.tableHeaderText, { flex: 1.2, textAlign: 'right' }]}>Custo</Text>
                <Text style={[styles.tableHeaderText, { width: 32, textAlign: 'center' }]}></Text>
              </View>
              {produtoEmbalagens.map((pe, idx) => {
                const em = embalagensList.find(e => e.id === pe.embalagem_id);
                const pu = em?.preco_unitario || pe.preco_unitario || 0;
                const custo = pu * pe.quantidade_utilizada;
                return (
                  <View key={idx} style={[styles.tableRow, idx % 2 === 0 && styles.tableRowEven]}>
                    <Text style={[styles.tableCell, { flex: 2.5 }]} numberOfLines={1}>{pe.em_nome || em?.nome}</Text>
                    <Text style={[styles.tableCell, { flex: 1, textAlign: 'center' }]}>{pe.quantidade_utilizada} un</Text>
                    <Text style={[styles.tableCellCusto, { flex: 1.2, textAlign: 'right' }]}>{formatCurrency(custo)}</Text>
                    <TouchableOpacity onPress={() => setProdutoEmbalagens(prev => prev.filter((_, i) => i !== idx))} style={{ width: 32, alignItems: 'center' }}>
                      <Text style={styles.removeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              <View style={styles.tableFooter}>
                <Text style={styles.tableFooterLabel}>Total Embalagens:</Text>
                <Text style={styles.tableFooterValue}>{formatCurrency(custoEmbalagens)}</Text>
              </View>
            </View>
          )}
        </Card>

        {/* Bloco 5: Custos e Precificação (hidden on desktop - sidebar has it) */}
        {!isDesktop && <Card
          title="Custos e Precificação"
          style={{ marginTop: spacing.md }}
          headerRight={
            <InfoTooltip
              title="Precificação"
              text="O preço sugerido é calculado aplicando o Mark-up sobre o custo unitário. O Mark-up considera despesas fixas, variáveis e a margem de lucro desejada."
              examples={[
                'Markup = 1 / (1 - DF% - DV% - Lucro%)',
                'Preço Sugerido = Custo Unitário × Markup',
                'Altere a margem abaixo para ajustar só este produto',
              ]}
            />
          }
        >
          {temCustos ? (
            <>
              {/* Resumo executivo */}
              <View style={styles.resultGrid}>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Custo Unitário</Text>
                  <Text style={styles.resultValue}>{formatCurrency(custoUnitario)}</Text>
                </View>
                <View style={styles.resultItem}>
                  <Text style={styles.resultLabel}>Preço Sugerido</Text>
                  <Text style={[styles.resultValue, { color: colors.primary }]}>{formatCurrency(precoSugerido)}</Text>
                </View>
              </View>

              <View style={styles.separator} />

              {/* Composição do custo */}
              <View style={styles.custoRow}><Text style={styles.custoLabel}>Insumos</Text><Text style={styles.custoValue}>{formatCurrency(custoInsumos)}</Text></View>
              <View style={styles.custoRow}><Text style={styles.custoLabel}>Preparos</Text><Text style={styles.custoValue}>{formatCurrency(custoPreparos)}</Text></View>
              <View style={styles.custoRow}><Text style={styles.custoLabel}>Embalagens</Text><Text style={styles.custoValue}>{formatCurrency(custoEmbalagens)}</Text></View>
              <View style={[styles.custoRow, styles.custoTotal]}><Text style={[styles.custoLabel, styles.custoTotalText]}>Custo Total da Receita</Text><Text style={[styles.custoValue, styles.custoTotalText]}>{formatCurrency(custoTotalReceita)}</Text></View>
              {tipoVenda === 'unidade' ? (
                rendUn > 1 && <View style={styles.custoRow}><Text style={styles.custoLabel}>Custo por Unidade ({rendUn} un)</Text><Text style={styles.custoValue}>{formatCurrency(custoUnitario)}</Text></View>
              ) : (
                <View style={styles.custoRow}><Text style={styles.custoLabel}>Custo por {tipoVenda === 'kg' ? 'kg' : 'litro'}</Text><Text style={styles.custoValue}>{formatCurrency(custoUnitario)}</Text></View>
              )}

              <View style={styles.separator} />

              {/* Margem e preço */}
              <InputField
                label="Margem de Lucro deste Produto (%)"
                value={form.margem_lucro_produto}
                onChangeText={(v) => setForm(p => ({ ...p, margem_lucro_produto: v }))}
                keyboardType="numeric"
                placeholder={`${(config.lucroDesejado * 100).toFixed(1)} (padrão)`}
                rightLabel={
                  <InfoTooltip
                    title="Margem Individual"
                    text="Defina uma margem específica para este produto. Se deixar em branco, será usada a margem padrão da aba Financeiro."
                    examples={[
                      'Produto caro: reduza para 8-10%',
                      'Produto premium: aumente para 20-25%',
                      'Vazio = margem padrão',
                    ]}
                  />
                }
              />

              <View style={styles.precoSugeridoBox}>
                <Text style={styles.precoSugeridoLabel}>Preço Sugerido (Markup {markupEfetivo.toFixed(2)}x)</Text>
                <Text style={styles.precoSugeridoValor}>{formatCurrency(precoSugerido)}</Text>
              </View>

              <InputField
                label="Preço de Venda (R$) *"
                value={form.preco_venda}
                onChangeText={(v) => { setForm(p => ({ ...p, preco_venda: v })); setErrors(p => ({ ...p, preco_venda: undefined })); }}
                keyboardType="numeric"
                placeholder={precoSugerido.toFixed(2)}
                error={errors.preco_venda}
                errorText="Informe o preço de venda"
              />
              {form.preco_venda && parseNum(form.preco_venda) !== precoSugerido && precoSugerido > 0 && (
                <Text style={styles.precoHint}>
                  {parseNum(form.preco_venda) > precoSugerido
                    ? `Acima do sugerido (+${formatCurrency(parseNum(form.preco_venda) - precoSugerido)})`
                    : `Abaixo do sugerido (${formatCurrency(parseNum(form.preco_venda) - precoSugerido)})`}
                </Text>
              )}

              <View style={styles.separator} />

              {/* Análise final */}
              <View style={styles.custoRow}><Text style={styles.custoLabel}>CMV</Text><Text style={styles.custoValue}>{formatPercent(cmvPerc)}</Text></View>
              <View style={styles.custoRow}><Text style={styles.custoLabel}>Despesas Fixas</Text><Text style={styles.custoValue}>{formatCurrency(despFixasValor)} ({formatPercent(config.despFixasPerc)})</Text></View>
              <View style={styles.custoRow}><Text style={styles.custoLabel}>Despesas Variáveis</Text><Text style={styles.custoValue}>{formatCurrency(despVarValor)} ({formatPercent(config.despVarPerc)})</Text></View>
              <View style={[styles.custoRow, styles.custoTotal]}>
                <Text style={[styles.custoLabel, styles.custoTotalText]}>Lucro Líquido</Text>
                <Text style={[styles.custoValue, { color: lucroLiquido >= 0 ? colors.success : colors.error, fontWeight: '700' }]}>
                  {formatCurrency(lucroLiquido)} ({formatPercent(lucroPerc)})
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.custoEmpty}>
              <Feather name="bar-chart-2" size={28} color={colors.disabled} style={{ marginBottom: spacing.sm }} />
              <Text style={styles.custoEmptyText}>Adicione insumos, preparos ou embalagens para ver os custos calculados</Text>
            </View>
          )}
        </Card>}

        {/* Bloco 6: Informações Adicionais - Collapsible */}
        <TouchableOpacity style={styles.collapsibleBtn} onPress={() => setShowInfoAdicionais(!showInfoAdicionais)}>
          <Text style={styles.collapsibleIcon}>{showInfoAdicionais ? '▼' : '▶'}</Text>
          <Text style={styles.collapsibleText}>Informações Adicionais <Text style={styles.collapsibleOpcional}>(opcional)</Text></Text>
        </TouchableOpacity>
        {showInfoAdicionais && (
          <Card style={{ marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
            <Text style={styles.subSectionTitle}>Conservação e Validade</Text>
            <InputField label="Validade (dias)" value={form.validade_dias} onChangeText={(v) => setForm(p => ({ ...p, validade_dias: v }))} keyboardType="numeric" placeholder="Ex: 5" />

            {CONSERVACAO_OPCOES.map(opt => (
              <View key={opt.key} style={styles.conservBlock}>
                <TouchableOpacity
                  style={[styles.conservToggle, form[`conserv_${opt.key}`] && styles.conservToggleAtivo]}
                  onPress={() => setForm(p => ({ ...p, [`conserv_${opt.key}`]: !p[`conserv_${opt.key}`] }))}
                >
                  <Feather name={opt.icon} size={16} color={form[`conserv_${opt.key}`] ? colors.primary : colors.textSecondary} style={{ marginRight: 6 }} />
                  <Text style={[styles.conservLabel, form[`conserv_${opt.key}`] && styles.conservLabelAtivo]}>{opt.label}</Text>
                  <Text style={styles.conservCheck}>{form[`conserv_${opt.key}`] ? '✓' : ''}</Text>
                </TouchableOpacity>
                {form[`conserv_${opt.key}`] && (
                  <View style={styles.conservFields}>
                    <InputField
                      style={{ flex: 1, marginRight: spacing.sm, marginBottom: 0 }}
                      label="Temperatura"
                      value={form[`temp_${opt.key}`]}
                      onChangeText={(v) => setForm(p => ({ ...p, [`temp_${opt.key}`]: v }))}
                      placeholder={opt.tempDefault}
                    />
                    <InputField
                      style={{ flex: 1, marginBottom: 0 }}
                      label="Validade"
                      value={form[`tempo_${opt.key}`]}
                      onChangeText={(v) => setForm(p => ({ ...p, [`tempo_${opt.key}`]: v }))}
                      placeholder="Ex: 5 dias"
                    />
                  </View>
                )}
              </View>
            ))}

            <View style={styles.separator} />

            <Text style={styles.subSectionTitle}>Modo de Preparo e Observações</Text>
            <InputField label="Modo de Preparo" value={form.modo_preparo} onChangeText={(v) => setForm(p => ({ ...p, modo_preparo: v }))} multiline numberOfLines={4} placeholder="Descreva os passos..." />
            <InputField label="Observações" value={form.observacoes} onChangeText={(v) => setForm(p => ({ ...p, observacoes: v }))} multiline numberOfLines={3} />
          </Card>
        )}

        {/* Delete button for existing products */}
        {editId && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
            {isFormComplete(form) && <TouchableOpacity style={[styles.deleteProductBtn, { borderColor: colors.primary + '30' }]} onPress={async () => {
              const f = formRef.current;
              try { await autoSave(); } catch(e) {}
              const db = await getDatabase();
              const margemVal = f.margem_lucro_produto && f.margem_lucro_produto.trim() !== '' ? parseFloat(String(f.margem_lucro_produto).replace(',', '.')) / 100 : null;
              const result = await db.runAsync(
                `INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades, tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado, temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente, modo_preparo, observacoes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
                [f.nome.trim() + ' (cópia)', f.categoria_id, parseNum(f.rendimento_total), f.unidade_rendimento || 'g', parseNum(f.rendimento_unidades) || 1, parseNum(f.tempo_preparo), parseFloat(String(f.preco_venda).replace(',','.')) || 0, margemVal, parseNum(f.validade_dias),
                 f.conserv_congelado ? f.temp_congelado : '', f.conserv_congelado ? f.tempo_congelado : '',
                 f.conserv_refrigerado ? f.temp_refrigerado : '', f.conserv_refrigerado ? f.tempo_refrigerado : '',
                 f.conserv_ambiente ? f.temp_ambiente : '', f.conserv_ambiente ? f.tempo_ambiente : '',
                 f.modo_preparo || '', f.observacoes || '']);
              const newId = result?.lastInsertRowId;
              if (newId) {
                const ings = await db.getAllAsync('SELECT * FROM produto_ingredientes WHERE produto_id = ?', [editId]);
                for (const i of ings) await db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)', [newId, i.materia_prima_id, i.quantidade_utilizada]);
                const preps = await db.getAllAsync('SELECT * FROM produto_preparos WHERE produto_id = ?', [editId]);
                for (const p of preps) await db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)', [newId, p.preparo_id, p.quantidade_utilizada]);
                const embs = await db.getAllAsync('SELECT * FROM produto_embalagens WHERE produto_id = ?', [editId]);
                for (const e of embs) await db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)', [newId, e.embalagem_id, e.quantidade_utilizada]);
                allowExit.current = true;
                navigation.replace('ProdutoForm', { id: newId });
              }
            }}>
              <Feather name="copy" size={13} color={colors.primary} style={{ marginRight: 5 }} />
              <Text style={[styles.deleteProductText, { color: colors.primary }]}>Duplicar</Text>
            </TouchableOpacity>}
            <TouchableOpacity style={styles.deleteProductBtn} onPress={solicitarExclusao}>
              <Feather name="trash-2" size={13} color={colors.error} style={{ marginRight: 5 }} />
              <Text style={styles.deleteProductText}>Excluir</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Spacer for footer */}
        {!editId && <View style={{ height: 20 }} />}
        </View>{/* end desktopLeftCol */}

        {/* Desktop sidebar: Resumo de Custos sticky */}
        {isDesktop && (
          <View style={styles.desktopRightCol}>
            <View style={styles.costsSummaryCard}>
              <View style={styles.costsHeader}>
                <Feather name="dollar-sign" size={16} color={colors.primary} />
                <Text style={styles.costsTitle}>Resumo de Custos</Text>
                <InfoTooltip
                  title="Precificação"
                  text="Preço sugerido = Custo Unitário × Markup. O Markup considera despesas fixas, variáveis e margem de lucro."
                  examples={['Altere a margem individual abaixo', 'Preço sugerido se ajusta automaticamente']}
                />
              </View>
              <View style={[styles.costsGrid, { flexWrap: 'wrap' }]}>
                <View style={[styles.costsItem, { minWidth: '45%' }]}>
                  <Text style={styles.costsItemLabel}>CMV{tipoVenda === 'kg' ? '/kg' : tipoVenda === 'litro' ? '/L' : ' Unit.'}</Text>
                  <Text style={styles.costsItemValue}>{formatCurrency(custoUnitario)}</Text>
                </View>
                <View style={[styles.costsItem, { minWidth: '45%' }]}>
                  <Text style={styles.costsItemLabel}>Sugerido</Text>
                  <Text style={[styles.costsItemValue, { color: colors.primary }]}>{formatCurrency(precoSugerido)}</Text>
                </View>
                <View style={[styles.costsItem, { minWidth: '45%' }]}>
                  <Text style={styles.costsItemLabel}>Lucro</Text>
                  <Text style={[styles.costsItemValue, { color: lucroLiquido >= 0 ? colors.success : colors.error }]}>
                    {formatCurrency(lucroLiquido)}
                  </Text>
                </View>
                <View style={[styles.costsItem, { minWidth: '45%' }]}>
                  <Text style={styles.costsItemLabel}>Margem</Text>
                  <Text style={[styles.costsItemValue, { color: lucroPerc >= 0.1 ? colors.success : colors.coral }]}>
                    {formatPercent(lucroPerc)}
                  </Text>
                </View>
              </View>
              <View style={styles.costsBreakdown}>
                <Text style={styles.costsBreakdownItem}>Insumos {formatCurrency(custoInsumos)}</Text>
                <Text style={styles.costsBreakdownSep}>·</Text>
                <Text style={styles.costsBreakdownItem}>Preparos {formatCurrency(custoPreparos)}</Text>
                <Text style={styles.costsBreakdownSep}>·</Text>
                <Text style={styles.costsBreakdownItem}>Emb. {formatCurrency(custoEmbalagens)}</Text>
              </View>

              {/* Detailed breakdown in sidebar */}
              {temCustos && (() => {
                const pv = parseNum(form.preco_venda) || 0;
                const divisor = tipoVenda !== 'unidade' ? (parseNum(form.rendimento_total) || 1) : (rendUn || 1);
                const labelUnit = tipoVenda === 'kg' ? 'por kg' : tipoVenda === 'litro' ? 'por litro' : 'por unidade vendida';
                const percInsumos = pv > 0 ? (custoInsumos / divisor) / pv : 0;
                const percPreparos = pv > 0 ? (custoPreparos / divisor) / pv : 0;
                const percEmbalagens = pv > 0 ? (custoEmbalagens / divisor) / pv : 0;
                return (
                  <>
                    <View style={[styles.separator, { marginTop: spacing.md }]} />
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginBottom: 6, fontFamily: fontFamily.medium }}>Composição {labelUnit}</Text>
                    <View style={styles.custoRow}>
                      <Text style={styles.custoLabel}>Insumos</Text>
                      <Text style={styles.custoValue}>{formatCurrency(custoInsumos / divisor)} {pv > 0 ? `(${formatPercent(percInsumos)})` : ''}</Text>
                    </View>
                    <View style={styles.custoRow}>
                      <Text style={styles.custoLabel}>Preparos</Text>
                      <Text style={styles.custoValue}>{formatCurrency(custoPreparos / divisor)} {pv > 0 ? `(${formatPercent(percPreparos)})` : ''}</Text>
                    </View>
                    <View style={styles.custoRow}>
                      <Text style={styles.custoLabel}>Embalagens</Text>
                      <Text style={styles.custoValue}>{formatCurrency(custoEmbalagens / divisor)} {pv > 0 ? `(${formatPercent(percEmbalagens)})` : ''}</Text>
                    </View>
                    <View style={[styles.custoRow, styles.custoTotal]}>
                      <Text style={[styles.custoLabel, styles.custoTotalText]}>CMV{tipoVenda === 'kg' ? '/kg' : tipoVenda === 'litro' ? '/L' : ' Unitário'}</Text>
                      <Text style={[styles.custoValue, styles.custoTotalText]}>{formatCurrency(custoUnitario)} {pv > 0 ? `(${formatPercent(cmvPerc)})` : ''}</Text>
                    </View>
                    <View style={styles.separator} />
                    <View style={styles.custoRow}><Text style={styles.custoLabel}>Desp. Fixas</Text><Text style={styles.custoValue}>{formatCurrency(despFixasValor)} ({formatPercent(config.despFixasPerc)})</Text></View>
                    <View style={styles.custoRow}><Text style={styles.custoLabel}>Desp. Variáveis</Text><Text style={styles.custoValue}>{formatCurrency(despVarValor)} ({formatPercent(config.despVarPerc)})</Text></View>
                    <View style={[styles.custoRow, styles.custoTotal]}>
                      <Text style={[styles.custoLabel, styles.custoTotalText]}>Lucro Líquido</Text>
                      <Text style={[styles.custoValue, { color: lucroLiquido >= 0 ? colors.success : colors.error, fontWeight: '700' }]}>
                        {formatCurrency(lucroLiquido)} ({formatPercent(lucroPerc)})
                      </Text>
                    </View>
                  </>
                );
              })()}
              {!temCustos && (
                <View style={[styles.custoEmpty, { paddingVertical: spacing.md }]}>
                  <Feather name="bar-chart-2" size={24} color={colors.disabled} style={{ marginBottom: spacing.xs }} />
                  <Text style={styles.custoEmptyText}>Adicione insumos, preparos ou embalagens para ver os custos</Text>
                </View>
              )}
            </View>

            {/* Items summary in sidebar */}
            {(ingredientes.length > 0 || produtoPreparos.length > 0 || produtoEmbalagens.length > 0) && (
              <View style={[styles.costsSummaryCard, { marginTop: spacing.sm }]}>
                {ingredientes.length > 0 && (
                  <>
                    <Text style={[styles.costsTitle, { fontSize: 13, marginBottom: 6 }]}>Insumos ({ingredientes.length})</Text>
                    {ingredientes.map((ing, i) => {
                      const custoIng = calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada || 0, ing.unidade || 'g', ing.unidade || 'g');
                      return (
                        <View key={ing.id || i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{ing.mp_nome || ing.nome}</Text>
                          <Text style={{ fontSize: 12, color: colors.text, fontFamily: fontFamily.semiBold }}>{formatCurrency(custoIng)}</Text>
                        </View>
                      );
                    })}
                  </>
                )}
                {produtoPreparos.length > 0 && (
                  <>
                    <Text style={[styles.costsTitle, { fontSize: 13, marginTop: 10, marginBottom: 6 }]}>Preparos ({produtoPreparos.length})</Text>
                    {produtoPreparos.map((pr, i) => {
                      const custoPr = calcCustoPreparo(pr.custo_por_kg || 0, pr.quantidade_utilizada || 0, pr.unidade || 'g');
                      return (
                        <View key={pr.preparo_id || i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{pr.pr_nome}</Text>
                          <Text style={{ fontSize: 12, color: colors.text, fontFamily: fontFamily.semiBold }}>{formatCurrency(custoPr)}</Text>
                        </View>
                      );
                    })}
                  </>
                )}
                {produtoEmbalagens.length > 0 && (
                  <>
                    <Text style={[styles.costsTitle, { fontSize: 13, marginTop: 10, marginBottom: 6 }]}>Embalagens ({produtoEmbalagens.length})</Text>
                    {produtoEmbalagens.map((em, i) => {
                      const custoEmb = (em.preco_unitario || 0) * (em.quantidade_utilizada || 1);
                      return (
                        <View key={em.embalagem_id || i} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
                          <Text style={{ fontSize: 12, color: colors.textSecondary, flex: 1 }} numberOfLines={1}>{em.em_nome}</Text>
                          <Text style={{ fontSize: 12, color: colors.text, fontFamily: fontFamily.semiBold }}>{formatCurrency(custoEmb)}</Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>
            )}

            {/* Histórico de Preço de Venda */}
            {editId && historicoPrecos.length > 1 && (
              <View style={[styles.costsSummaryCard, { marginTop: spacing.sm }]}>
                <Text style={[styles.costsTitle, { fontSize: 13, marginBottom: 8 }]}>📈 Histórico de Preço</Text>
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
                                style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.error + '12', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}
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
          </View>
        )}
        </View>{/* end desktopRow */}
      </ScrollView>

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
            const price = parseFloat(String(formRef.current.preco_venda).replace(',','.')) || 0;
            if (price > 0 && editId) {
              try {
                const prodHistId = editId + 1000000;
                const db = await getDatabase();
                const lastH = await db.getAllAsync('SELECT valor_pago FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 1', [prodHistId]);
                if (!lastH?.[0] || Math.abs(lastH[0].valor_pago - price) > 0.001) {
                  await db.runAsync('INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)', [prodHistId, price, -1]);
                }
              } catch(e) {}
            }
            const returnTo = route.params?.returnTo;
            if (returnTo) {
              navigation.navigate(returnTo);
            } else {
              navigation.navigate('ProdutosList');
            }
          }}>
            <Feather name="check" size={16} color="#fff" />
            <Text style={styles.saveBackBtnText}>Salvar e Voltar</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.stickyFooter}>
          <TouchableOpacity style={styles.btnSave} onPress={salvar}>
            <Text style={styles.btnSaveText}>Salvar Produto</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Modal de seleção / criação de categoria */}
      <Modal visible={catPickerVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => { setCatPickerVisible(false); setNovaCatMode(false); }}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            {!novaCatMode ? (
              <>
                <Text style={styles.modalTitle}>Categoria do Produto</Text>
                <ScrollView style={{ maxHeight: 300 }}>
                  {categorias.map((c, idx) => {
                    const dotColor = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catOption, form.categoria_id === c.id && styles.catOptionAtivo]}
                        onPress={() => { setForm(p => ({ ...p, categoria_id: c.id })); setCatPickerVisible(false); }}
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
                  <Text style={styles.novaCatBtnText}>Criar nova categoria</Text>
                </TouchableOpacity>
                {form.categoria_id && (
                  <TouchableOpacity style={styles.limparBtn} onPress={() => { setForm(p => ({ ...p, categoria_id: null })); setCatPickerVisible(false); }}>
                    <Text style={styles.limparBtnText}>Remover categoria</Text>
                  </TouchableOpacity>
                )}
              </>
            ) : (
              <>
                <Text style={styles.modalTitle}>Nova Categoria</Text>
                <Text style={styles.modalLabel}>Nome</Text>
                <TextInput style={styles.modalInput} value={novaCatNome} onChangeText={setNovaCatNome}
                  placeholder="Ex: Sobremesas, Lanches..." placeholderTextColor={colors.disabled} autoFocus />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNovaCatMode(false)}>
                    <Text style={styles.modalCancelText}>Voltar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={async () => {
                    if (!novaCatNome.trim()) return Alert.alert('Erro', 'Informe o nome da categoria');
                    const db = await getDatabase();
                    const result = await db.runAsync('INSERT INTO categorias_produtos (nome, icone) VALUES (?, ?)', [novaCatNome.trim(), 'tag']);
                    const newId = result.lastInsertRowId;
                    setForm(p => ({ ...p, categoria_id: newId }));
                    setNovaCatNome(''); setNovaCatIcone('tag');
                    setNovaCatMode(false); setCatPickerVisible(false);
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

      {/* Modal Quantity Prompt (inline add) */}
      <Modal visible={!!quantityPrompt} transparent animationType="fade" onRequestClose={() => setQuantityPrompt(null)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setQuantityPrompt(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.modalContent, { maxWidth: 360 }]} onPress={() => {}}>
            {quantityPrompt && (
              <>
                <Text style={styles.modalTitle}>{quantityPrompt.nome}</Text>
                <Text style={{ fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginTop: -spacing.sm, marginBottom: spacing.md }}>
                  {quantityPrompt.detalhe}
                </Text>
                <Text style={styles.modalLabel}>Quantidade ({quantityPrompt.unidade})</Text>
                <TextInput
                  ref={qtyInputRef}
                  style={styles.modalInput}
                  value={quantityPrompt.quantidade}
                  onChangeText={(v) => setQuantityPrompt(prev => prev ? { ...prev, quantidade: v } : null)}
                  keyboardType="numeric"
                  placeholder="Ex: 100"
                  placeholderTextColor={colors.disabled}
                  autoFocus
                  onSubmitEditing={confirmQuantityPrompt}
                  returnKeyType="done"
                />
                <View style={styles.modalActions}>
                  <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setQuantityPrompt(null)}>
                    <Text style={styles.modalCancelText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.modalSaveBtn} onPress={confirmQuantityPrompt}>
                    <Text style={styles.modalSaveText}>Adicionar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Nova Embalagem */}
      <Modal visible={novaEmbModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setNovaEmbModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <Text style={styles.modalTitle}>Nova Embalagem</Text>

            <Text style={styles.modalLabel}>Nome *</Text>
            <TextInput
              style={styles.modalInput}
              value={novaEmbForm.nome}
              onChangeText={(v) => setNovaEmbForm(p => ({ ...p, nome: v }))}
              placeholder="Ex: Caixa kraft P"
              placeholderTextColor={colors.disabled}
              autoFocus
            />

            <Text style={styles.modalLabel}>Quantidade (unidades no pacote)</Text>
            <TextInput
              style={styles.modalInput}
              value={novaEmbForm.quantidade}
              onChangeText={(v) => setNovaEmbForm(p => ({ ...p, quantidade: v }))}
              keyboardType="numeric"
              placeholder="Ex: 100"
              placeholderTextColor={colors.disabled}
            />

            <Text style={styles.modalLabel}>Preço do Pacote (R$)</Text>
            <TextInput
              style={styles.modalInput}
              value={novaEmbForm.preco_embalagem}
              onChangeText={(v) => setNovaEmbForm(p => ({ ...p, preco_embalagem: v }))}
              keyboardType="numeric"
              placeholder="Ex: 25,00"
              placeholderTextColor={colors.disabled}
            />

            {parseNum(novaEmbForm.quantidade) > 0 && parseNum(novaEmbForm.preco_embalagem) > 0 && (
              <View style={styles.novoIngCalc}>
                <Text style={styles.novoIngCalcLabel}>
                  Preço Unitário: {formatCurrency(parseNum(novaEmbForm.preco_embalagem) / parseNum(novaEmbForm.quantidade))}
                </Text>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNovaEmbModalVisible(false)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarNovaEmbalagem}>
                <Text style={styles.modalSaveText}>Criar e Selecionar</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Modal Novo Ingrediente */}
      <Modal visible={novoIngModalVisible} transparent animationType="fade">
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setNovoIngModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalContent} onPress={() => {}}>
            <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Novo Insumo</Text>

              <Text style={styles.modalLabel}>Nome *</Text>
              <TextInput
                style={styles.modalInput}
                value={novoIngForm.nome}
                onChangeText={(v) => setNovoIngForm(p => ({ ...p, nome: v }))}
                placeholder="Ex: Farinha de trigo"
                placeholderTextColor={colors.disabled}
                autoFocus
              />

              <Text style={styles.modalLabel}>Unidade de Medida</Text>
              <View style={styles.novoIngUnidades}>
                {UNIDADES_MEDIDA.map(u => (
                  <TouchableOpacity
                    key={u.value}
                    style={[styles.novoIngUnidadeChip, novoIngForm.unidade_medida === u.value && styles.novoIngUnidadeChipAtivo]}
                    onPress={() => setNovoIngForm(p => ({ ...p, unidade_medida: u.value }))}
                  >
                    <Text style={[styles.novoIngUnidadeText, novoIngForm.unidade_medida === u.value && styles.novoIngUnidadeTextAtivo]}>{u.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Quantidade Bruta ({novoIngForm.unidade_medida})</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={novoIngForm.quantidade_bruta}
                    onChangeText={(v) => setNovoIngForm(p => ({ ...p, quantidade_bruta: v }))}
                    keyboardType="numeric"
                    placeholder="Ex: 1000"
                    placeholderTextColor={colors.disabled}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalLabel}>Quantidade Líquida ({novoIngForm.unidade_medida})</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={novoIngForm.quantidade_liquida}
                    onChangeText={(v) => setNovoIngForm(p => ({ ...p, quantidade_liquida: v }))}
                    keyboardType="numeric"
                    placeholder="Ex: 800"
                    placeholderTextColor={colors.disabled}
                  />
                </View>
              </View>

              <Text style={styles.modalLabel}>Valor Pago (R$)</Text>
              <TextInput
                style={styles.modalInput}
                value={novoIngForm.valor_pago}
                onChangeText={(v) => setNovoIngForm(p => ({ ...p, valor_pago: v }))}
                keyboardType="numeric"
                placeholder="Ex: 5,00"
                placeholderTextColor={colors.disabled}
              />

              {parseNum(novoIngForm.quantidade_liquida) > 0 && parseNum(novoIngForm.valor_pago) > 0 && (
                <View style={styles.novoIngCalc}>
                  <Text style={styles.novoIngCalcLabel}>
                    Fator de Correção: {calcFatorCorrecao(parseNum(novoIngForm.quantidade_bruta), parseNum(novoIngForm.quantidade_liquida)).toFixed(2)}
                  </Text>
                  <Text style={styles.novoIngCalcLabel}>
                    {getLabelPrecoBase(novoIngForm.unidade_medida)}: {formatCurrency(calcPrecoBase(parseNum(novoIngForm.valor_pago), parseNum(novoIngForm.quantidade_liquida), novoIngForm.unidade_medida))}
                  </Text>
                </View>
              )}

              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setNovoIngModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSaveBtn} onPress={salvarNovoIngrediente}>
                  <Text style={styles.modalSaveText}>Criar e Selecionar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
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
              Preencha todos os campos obrigatórios antes de sair. Deseja excluir este produto ou continuar editando?
            </Text>
            <TouchableOpacity style={styles.incompleteBtnEdit} onPress={handleContinueEditing} activeOpacity={0.7}>
              <Feather name="edit-2" size={15} color="#fff" style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnEditText}>Continuar editando</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.incompleteBtnDelete} onPress={handleDeleteAndExit} activeOpacity={0.7}>
              <Feather name="trash-2" size={15} color={colors.error} style={{ marginRight: 6 }} />
              <Text style={styles.incompleteBtnDeleteText}>Excluir produto</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40 },
  vendaChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20,
    backgroundColor: colors.background, borderWidth: 1.5, borderColor: colors.border,
  },
  vendaChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  vendaChipText: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  vendaChipTextActive: { color: '#fff' },
  desktopRow: { flexDirection: 'row', gap: 24 },
  desktopLeftCol: { flex: 3 },
  desktopRightCol: { flex: 2, position: 'sticky', top: 80, alignSelf: 'flex-start' },
  tempoRow: { flexDirection: 'row', alignItems: 'flex-start' },

  // Table
  tableBlock: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.xs },
  tableHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 4, paddingHorizontal: spacing.xs,
    backgroundColor: colors.primary, borderRadius: borderRadius.sm, marginBottom: 1,
  },
  tableHeaderText: { fontSize: 9, fontWeight: '700', color: colors.textLight, textTransform: 'uppercase' },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 5, paddingHorizontal: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  tableRowEven: { backgroundColor: colors.inputBg },
  tableCell: { fontSize: 11, color: colors.text },
  tableCellCusto: { fontSize: 11, fontWeight: '600', color: colors.primary },
  tableFooter: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.xs,
    backgroundColor: colors.primary + '15', borderRadius: borderRadius.sm, marginTop: spacing.xs,
  },
  tableFooterLabel: { fontSize: fonts.small, fontWeight: '700', color: colors.text },
  tableFooterValue: { fontSize: fonts.regular, fontWeight: '700', color: colors.primary },

  removeBtn: { color: colors.disabled, fontSize: 16, fontWeight: '700' },
  addRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.xs },
  addBtn: { backgroundColor: colors.primary, width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: colors.textLight, fontSize: 18, fontWeight: '300' },

  // Feedback text
  feedbackText: { color: colors.success, fontSize: fonts.tiny, fontWeight: '600', marginTop: spacing.xs, fontStyle: 'italic' },

  // Custos
  custoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  custoLabel: { fontSize: fonts.small, color: colors.textSecondary },
  custoValue: { fontSize: fonts.small, color: colors.text, fontWeight: '600' },
  custoTotal: { borderTopWidth: 1, borderTopColor: colors.border, marginTop: spacing.xs, paddingTop: spacing.sm },
  custoTotalText: { fontSize: fonts.regular, fontWeight: '700', color: colors.primary },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: spacing.sm },
  subSectionTitle: { fontSize: fonts.regular, fontWeight: '700', color: colors.primary, marginBottom: spacing.sm, marginTop: spacing.xs },

  // Result grid (executive summary)
  resultGrid: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  resultItem: {
    flex: 1, alignItems: 'center',
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
  },
  resultLabel: { fontSize: fonts.tiny, color: colors.textSecondary, marginBottom: 2 },
  resultValue: { fontSize: fonts.medium, fontWeight: '700', color: colors.text },

  // Custos empty state
  custoEmpty: { alignItems: 'center', paddingVertical: spacing.lg },
  custoEmptyText: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', lineHeight: 20 },

  // Preço Sugerido highlight
  precoSugeridoBox: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary + '15', borderWidth: 1.5, borderColor: colors.primary,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2, marginBottom: spacing.sm,
  },
  precoSugeridoLabel: { fontSize: fonts.small, color: colors.primary, fontWeight: '700' },
  precoSugeridoValor: { fontSize: fonts.medium, color: colors.primary, fontWeight: '800' },

  // Preço hint
  precoHint: { fontSize: fonts.tiny, color: colors.textSecondary, fontStyle: 'italic', marginTop: -spacing.xs, marginBottom: spacing.xs },

  // Collapsible sections
  collapsibleBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.card, borderRadius: borderRadius.sm,
    padding: spacing.sm + 4, marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.border,
    elevation: 1, shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 1,
  },
  collapsibleIcon: { fontSize: 12, color: colors.primary, marginRight: spacing.sm, width: 16 },
  collapsibleText: { fontSize: fonts.regular, fontWeight: '700', color: colors.text, flex: 1 },
  collapsibleOpcional: { fontSize: fonts.tiny, fontWeight: '400', color: colors.disabled, fontStyle: 'italic' },

  // Conservação
  conservBlock: { marginBottom: spacing.sm },
  conservToggle: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: spacing.sm + 2, paddingHorizontal: spacing.sm,
    backgroundColor: colors.inputBg, borderRadius: borderRadius.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  conservToggleAtivo: { backgroundColor: colors.primary + '15', borderColor: colors.primary },
  conservLabel: { fontSize: fonts.regular, color: colors.text, flex: 1, fontWeight: '600' },
  conservLabelAtivo: { color: colors.primary },
  conservCheck: { fontSize: 18, color: colors.primary, fontWeight: '700', width: 24, textAlign: 'center' },
  conservFields: { flexDirection: 'row', marginTop: spacing.xs, paddingLeft: spacing.sm },

  // Category picker
  pickerContainer: { marginBottom: spacing.md },
  pickerLabel: { fontSize: fonts.small, color: colors.textSecondary, marginBottom: spacing.xs, fontWeight: '600' },
  pickerSelector: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2,
  },
  pickerText: { fontSize: fonts.regular, color: colors.text },
  pickerPlaceholder: { color: colors.disabled },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: spacing.sm },
  modalContent: { backgroundColor: '#fff', borderRadius: borderRadius.md, padding: spacing.lg, width: '100%', maxWidth: 600, maxHeight: '90%' },
  modalTitle: { fontSize: fonts.large, fontWeight: '700', color: colors.text, marginBottom: spacing.md, textAlign: 'center' },
  modalLabel: { fontSize: fonts.small, fontWeight: '600', color: colors.textSecondary, marginBottom: spacing.xs, marginTop: spacing.sm },
  modalInput: {
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, padding: spacing.sm + 2, fontSize: fonts.regular, color: colors.text,
  },
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
  modalCancelBtn: { flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
  modalCancelText: { color: colors.textSecondary, fontWeight: '600', fontSize: fonts.regular },
  modalSaveBtn: { flex: 1, padding: spacing.sm + 2, borderRadius: borderRadius.sm, backgroundColor: colors.primary, alignItems: 'center' },
  modalSaveText: { color: colors.textLight, fontWeight: '700', fontSize: fonts.regular },

  // Novo ingrediente inline
  novoIngBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    paddingVertical: spacing.xs + 2, marginTop: spacing.xs, marginBottom: spacing.xs,
    borderWidth: 1, borderColor: colors.primary, borderStyle: 'dashed',
    borderRadius: borderRadius.sm, backgroundColor: colors.primary + '08',
  },
  novoIngBtnIcon: { fontSize: 14, fontWeight: '700', color: colors.primary, marginRight: spacing.xs },
  novoIngBtnText: { fontSize: fonts.tiny, fontWeight: '600', color: colors.primary },
  novoIngUnidades: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.xs },
  novoIngUnidadeChip: {
    paddingHorizontal: spacing.sm + 2, paddingVertical: spacing.xs + 2,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.inputBg,
  },
  novoIngUnidadeChipAtivo: { borderColor: colors.primary, backgroundColor: colors.primary + '15' },
  novoIngUnidadeText: { fontSize: fonts.small, color: colors.textSecondary },
  novoIngUnidadeTextAtivo: { color: colors.primary, fontWeight: '700' },
  novoIngCalc: {
    backgroundColor: colors.primary + '10', borderRadius: borderRadius.sm,
    padding: spacing.sm, marginTop: spacing.sm,
  },
  novoIngCalcLabel: { fontSize: fonts.small, color: colors.primary, fontWeight: '600', marginBottom: 2 },

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

  // Sticky footer (botão salvar - só para novo)
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

  // Delete product
  deleteProductBtn: { alignItems: 'center', paddingVertical: spacing.md, marginTop: spacing.sm },
  deleteProductText: { fontSize: fonts.small, color: colors.error, fontWeight: '600' },

  // Costs summary card (prominent)
  costsSummaryCard: {
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, marginTop: spacing.md,
    borderWidth: 1.5, borderColor: colors.primary + '25',
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6, elevation: 2,
  },
  costsHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm },
  costsTitle: { fontSize: fonts.body, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text, flex: 1 },
  costsGrid: { flexDirection: 'row', gap: spacing.xs, marginBottom: spacing.sm },
  costsItem: { flex: 1, alignItems: 'center', backgroundColor: colors.inputBg, borderRadius: borderRadius.sm, paddingVertical: 6 },
  costsItemLabel: { fontSize: 9, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 2 },
  costsItemValue: { fontSize: fonts.small, fontFamily: fontFamily.bold, fontWeight: '700', color: colors.text },
  costsBreakdown: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' },
  costsBreakdownItem: { fontSize: 10, fontFamily: fontFamily.regular, color: colors.textSecondary },
  costsBreakdownSep: { marginHorizontal: 4, color: colors.disabled, fontSize: 10 },

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

  // Search row
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.inputBg, borderWidth: 1, borderColor: colors.border,
    borderRadius: borderRadius.sm, paddingHorizontal: spacing.sm,
    marginBottom: spacing.xs,
  },
  searchIcon: { fontSize: 16, marginRight: spacing.xs },
  searchInput: {
    flex: 1, fontSize: fonts.regular, color: colors.text,
    paddingVertical: spacing.sm, paddingHorizontal: 0,
  },

  // Selection list
  selectionList: { maxHeight: 120, marginBottom: spacing.xs },
  selListItem: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: spacing.xs + 2, paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    backgroundColor: '#fff', borderRadius: borderRadius.sm,
  },
  selListItemSelected: {
    backgroundColor: colors.success + '18',
    borderColor: colors.success,
    borderWidth: 1,
  },
  selListItemName: { fontSize: fonts.small, color: colors.text, fontWeight: '500', flex: 1 },
  selListItemNameSelected: { color: colors.success },
  selListItemDetail: { fontSize: 10, color: colors.textSecondary, marginLeft: spacing.xs },
  selListItemDetailSelected: { color: colors.success },
  listEmpty: {
    fontSize: fonts.small, color: colors.disabled, textAlign: 'center',
    paddingVertical: spacing.md, fontStyle: 'italic',
  },

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
  historicoBars: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, minHeight: 100, paddingBottom: 4, backgroundColor: colors.background, borderRadius: borderRadius.sm, padding: spacing.sm },
  historicoBarWrapper: { alignItems: 'center', flex: 1, maxWidth: 64 },
  historicoBar: { width: '70%', maxWidth: 28, borderRadius: 4, minHeight: 8 },
  historicoBarPrice: { fontSize: 10, fontFamily: fontFamily.semiBold, fontWeight: '600', color: colors.text, marginBottom: 4, textAlign: 'center' },
  historicoBarDate: { fontSize: 9, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 3 },
});
