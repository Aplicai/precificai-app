import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ScrollView, View, TouchableOpacity, Text, Alert, Modal, TextInput, TouchableWithoutFeedback, KeyboardAvoidingView, Platform } from 'react-native';
// Sessão 28.29: styles extraídos pra arquivo dedicado (eram 366 linhas inline)
import { materiaPrimaFormStyles as styles } from './styles/materiaPrimaForm.styles';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import InputField from '../components/InputField';
import Card from '../components/Card';
import PickerSelect from '../components/PickerSelect';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import SaveStatus from '../components/SaveStatus';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import InfoTooltip from '../components/InfoTooltip';
import ModalFormWrapper from '../components/ModalFormWrapper';
import { useIsFocused, useFocusEffect } from '@react-navigation/native';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import useListDensity from '../hooks/useListDensity';
import { t } from '../i18n/pt-BR';
import {
  UNIDADES_MEDIDA,
  calcPrecoBase,
  calcFatorCorrecao,
  getLabelPrecoBase,
  formatCurrency,
  converterParaBase,
  calcCustoIngrediente,
  calcCustoPreparo,
  calcMargem,
} from '../utils/calculations';
// Sprint 2 S5 — checagem de dependências antes de DELETE (evita órfãos em preparo_ingredientes / produto_ingredientes).
import { contarDependencias, formatarMensagemDeps } from '../services/dependenciesService';
// Sessão 28.8 — sugestão automática via dicionário pré-cadastrado (zero IA, zero custo)
import { matchInsumo, normalize as normalizeStr } from '../data/dicionario';

const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
];
function getCategoryColor(index) {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

export default function MateriaPrimaFormScreen({ route, navigation }) {
  const editId = route.params?.id;
  const returnTo = route.params?.returnTo;
  // Sessão 28.40: returnToParams pra propagar params (ex.: aba do RelatoriosHub)
  const returnToParams = route.params?.returnToParams;
  const { isDesktop, isMobile } = useResponsiveLayout();
  const { isCompact, buttonHeight } = useListDensity();
  // Sessão Forms-Mobile — agrupamentos 2/3-col viram coluna no mobile p/ não
  // espremer os inputs e respeitar o padrão de 1-campo-por-linha.
  const rowStyle = isMobile
    ? { flexDirection: 'column', gap: 0 }
    : styles.row;

  // Mapa estático: returnTo → tab pai (Sessão 24).
  // MateriaPrimaForm é registrado em 3 stacks distintos (Insumos, Produtos, Preparos)
  // mas as telas de retorno podem estar em outros stacks (ex.: MatrizBCG está em Mais).
  // navigation.navigate() local falha silenciosamente se a rota não existe no stack atual,
  // então atravessamos via parent (Tab navigator).
  const RETURN_TO_TABS = {
    'MatrizBCG': 'Mais',
    'DeliveryHub': 'Mais',
    'Fornecedores': 'Mais',
    'AtualizarPrecos': 'Mais',
    // Sessão 28.40: Relatórios unificado (Geral + Insumos via tabs internas)
    'Relatorios': 'Mais',
    'RelatorioInsumos': 'Mais', // legado — fallback
  };

  function goBackSafe() {
    if (returnTo) {
      const parentTab = RETURN_TO_TABS[returnTo];
      if (parentTab) {
        // Atravessa tabs via Tab Navigator pai
        try {
          const parent = navigation.getParent();
          if (parent) {
            // Sessão 28.40: propaga returnToParams (ex.: aba do RelatoriosHub)
            parent.navigate(parentTab, { screen: returnTo, params: returnToParams });
            return;
          }
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.goBackSafe.parent]', e);
        }
      }
      // Fallback: navegar direto (pode resolver se rota está no stack atual)
      try {
        navigation.navigate(returnTo, returnToParams);
      } catch (e) {
        if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.goBackSafe.navigate]', e);
        navigation.goBack();
      }
    } else {
      navigation.navigate('MateriasPrimas');
    }
  }
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
  // APP-14: flag indica que o valor pago veio pré-preenchido pelo Kit (estimativa de mercado)
  const [ehValorEstimado, setEhValorEstimado] = useState(false);
  // Sessão 28.8 — sugestão do dicionário pré-cadastrado (zero IA)
  const [sugestao, setSugestao] = useState(null);
  // Dispensa POR canonical: armazena normalize() do nome canonical
  // que o user aplicou OU dispensou. Suggestion volta se user limpar
  // o campo OU digitar nome que casa com canonical DIFERENTE.
  const [sugestaoDispensadaPara, setSugestaoDispensadaPara] = useState(null);
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
  // P2: throttle do check de margin erosion (caro: N+1 queries) — não rodar em todo auto-save
  const lastMarginCheckRef = useRef(0);
  const MARGIN_CHECK_MIN_INTERVAL_MS = 5000;

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
    if (editId) {
      loadItem();
    } else {
      setLoaded(true);
    }
  }, [editId]);

  // F2-J2-01: recarrega categorias ao voltar p/ a tela
  // (categoria criada em outro form precisa aparecer no picker sem reabrir)
  useFocusEffect(useCallback(() => { loadCategorias(); }, []));

  // Intercepta saída para validar campos
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (allowExit.current) return; // permite sair
      if (editId) return; // Auto-save handles edit mode — always allow exit

      const f = formRef.current;
      // Se o form está totalmente vazio (novo sem preencher nada), deixa sair
      if (!f.nome.trim() && !f.quantidade_bruta && !f.quantidade_liquida && !f.valor_pago) return;

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

  // Sessão 28.30 BUG FIX: cleanup ao DESMONTAR a tela.
  // Antes: clearTimeout no unmount → autoSave pendente NUNCA disparava se user
  // navegava de volta dentro dos 600ms do debounce. Resultado: preço não persistia
  // e Relatório de Insumos mostrava valor velho.
  // Agora: ao sair da tela, FLUSH o save pendente sincronicamente (best-effort).
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
        if (editId && loaded) {
          // dispara autoSave imediatamente (best-effort — se promise não completar
          // o app já está unmounting, mas o UPDATE chega no DB).
          try { autoSave(); } catch {}
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sessão 28.30: também flush ao perder foco (navega pra outra tab/tela)
  // — garante persistência mesmo em web onde unmount nem sempre acontece.
  useEffect(() => {
    if (isFocused) return;
    if (!saveTimerRef.current) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = null;
    if (editId && loaded) {
      try { autoSave(); } catch {}
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFocused]);

  // Dedicated historico load — ensures history is fetched even if loadItem races
  useEffect(() => {
    if (!editId) return;
    (async () => {
      const db = await getDatabase();
      try {
        const hist = await db.getAllAsync('SELECT * FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 10', [editId]);
        const reversed = (hist || []).reverse();
        const filtered = reversed.filter((h, i) => i === 0 || h.valor_pago !== reversed[i - 1].valor_pago);
        setHistoricoPrecos(filtered);
      } catch(e) {
        // F2-J2-03: catch antes era silencioso — log para diagnóstico
        if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.loadHistorico]', e);
      }
    })();
  }, [editId]);

  async function loadCategorias() {
    const db = await getDatabase();
    setCategorias(await db.getAllAsync('SELECT * FROM categorias_insumos ORDER BY nome'));
  }

  async function loadItem() {
    const db = await getDatabase();
    const item = await db.getFirstAsync('SELECT * FROM materias_primas WHERE id = ?', [editId]);
    if (item) {
      // APP-14: detecta se o valor foi pré-preenchido pelo Kit (marcador no campo marca).
      // Esconde o marcador da UI e ativa o badge "valor estimado".
      const marcaValor = item.marca || '';
      const eEstimado = marcaValor === '__VALOR_ESTIMADO_KIT__';
      setEhValorEstimado(eEstimado);
      // APP-04: normalização defensiva da unidade_medida.
      // Bug reportado: usuária salvou "kg", reabriu e veio "un".
      // 1) Trim e remoção de aspas (caso Supabase devolva como JSON-string '"kg"')
      // 2) Validação contra a lista oficial; fallback pra 'kg' (mais comum em
      //    confeitaria) em vez de 'g' que era o default antigo
      // 3) Log explícito quando há fallback, pra rastrear o bug em produção
      let unidadeRaw = item.unidade_medida;
      if (typeof unidadeRaw === 'string') {
        unidadeRaw = unidadeRaw.trim().replace(/^"+|"+$/g, '');
      }
      const VALID_UNITS = ['g','kg','mL','L','un'];
      let unidadeFinal;
      if (VALID_UNITS.includes(unidadeRaw)) {
        unidadeFinal = unidadeRaw;
      } else {
        unidadeFinal = 'kg';
        if (typeof console !== 'undefined' && console.warn) {
          console.warn('[MateriaPrimaForm.loadItem] APP-04 fallback: unidade_medida inválida no DB =', JSON.stringify(item.unidade_medida), '→ usando "kg". Item id:', editId, 'nome:', item.nome);
        }
      }
      setForm({
        nome: item.nome,
        marca: eEstimado ? '' : marcaValor,
        categoria_id: item.categoria_id || null,
        quantidade_bruta: String(item.quantidade_bruta || ''),
        quantidade_liquida: String(item.quantidade_liquida || ''),
        unidade_medida: unidadeFinal,
        valor_pago: String(item.valor_pago || ''),
      });
      // Carregar histórico de preços
      try {
        const hist = await db.getAllAsync(
          'SELECT * FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 10',
          [editId]
        );
        // Filtrar apenas mudanças de preço (remover duplicatas consecutivas)
        const reversed = hist.reverse(); // cronológico (oldest first for chart)
        const filtered = reversed.filter((h, i) => i === 0 || h.valor_pago !== reversed[i - 1].valor_pago);
        setHistoricoPrecos(filtered);
      } catch (e) { /* tabela pode não existir */ }
      // Marca como carregado após setar o form para evitar auto-save imediato
      setTimeout(() => setLoaded(true), 100);
    } else {
      setLoaded(true);
    }
  }

  // F2-J2-03 / CR-1: parseNum retorna null para NaN para que consumidores possam
  // distinguir "vazio/inválido" de "zero explícito". Use Number.isFinite() ou
  // fallback `?? 0` em cada call site.
  function parseNum(val) {
    const n = parseFloat(String(val).replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const qtBruta = parseNum(form.quantidade_bruta);
  const qtLiquida = parseNum(form.quantidade_liquida);
  const valorPago = parseNum(form.valor_pago);
  const fatorCorrecao = calcFatorCorrecao(qtBruta, qtLiquida);
  const precoBase = calcPrecoBase(valorPago, qtLiquida, form.unidade_medida);
  const labelPreco = getLabelPrecoBase(form.unidade_medida);

  const temDadosCalculo = qtBruta > 0 && qtLiquida > 0 && valorPago > 0;
  const formTitle = editId ? 'Editar Insumo' : 'Novo Insumo';
  const perdaPercent = qtBruta > 0 ? ((1 - qtLiquida / qtBruta) * 100) : 0;

  function sufixoUnidade() {
    const un = UNIDADES_MEDIDA.find(u => u.value === form.unidade_medida);
    return un ? un.value : '';
  }

  // Auto-save para modo edição
  async function autoSave() {
    const f = formRef.current;
    if (!f.nome.trim()) return; // não salva sem nome

    // Sessão 28.9 — APP-04: garantia defensiva pra unidade nunca regredir.
    // Se unidade_medida vier vazia/inválida, NÃO faz auto-save (evita corromper
    // o valor salvo). Loga pra debug.
    const unidadeValida = ['g','kg','mL','L','un'].includes(f.unidade_medida);
    if (!unidadeValida) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[MateriaPrimaForm.autoSave] BLOQUEADO: unidade inválida =', f.unidade_medida, '(form completo)', f);
      }
      return;
    }

    // F2-J2-03 / CR-1: usa helper parseNum (Number.isFinite-aware) com `?? 0` p/ DB
    const qb = parseNum(f.quantidade_bruta) ?? 0;
    const ql = parseNum(f.quantidade_liquida) ?? 0;
    const vp = parseNum(f.valor_pago) ?? 0;
    const fc = calcFatorCorrecao(qb, ql);
    const pb = calcPrecoBase(vp, ql, f.unidade_medida);

    setSaveStatus('saving');
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE materias_primas SET nome=?, marca=?, categoria_id=?, quantidade_bruta=?, quantidade_liquida=?, fator_correcao=?, unidade_medida=?, valor_pago=?, preco_por_kg=? WHERE id=?',
        [f.nome, f.marca, f.categoria_id, qb, ql, fc, f.unidade_medida, vp, pb, editId]
      );

      // Sessão 28.9 — APP-08/09/10: cascade automático.
      // Quando preço/unidade do insumo muda, recalcula custo_total e custo_por_kg
      // de TODOS os preparos que usam esse insumo. Sem isso, os preparos ficavam
      // com custo stale e os produtos derivados também.
      try {
        const preparosAfetados = await db.getAllAsync(
          'SELECT DISTINCT preparo_id FROM preparo_ingredientes WHERE materia_prima_id = ?',
          [editId]
        );
        for (const row of (preparosAfetados || [])) {
          const prepId = row.preparo_id;
          const ingsPrep = await db.getAllAsync(
            `SELECT pi.quantidade_utilizada, pi.materia_prima_id, mp.preco_por_kg, mp.unidade_medida
             FROM preparo_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id
             WHERE pi.preparo_id = ?`, [prepId]);
          let custoTotalPrep = 0;
          for (const ing of (ingsPrep || [])) {
            custoTotalPrep += calcCustoIngrediente(
              ing.preco_por_kg || 0,
              ing.quantidade_utilizada,
              ing.unidade_medida || 'g',
              ing.unidade_medida || 'g'
            );
          }
          // Pega rendimento do preparo pra calcular custo_por_kg
          const prepRow = await db.getFirstAsync(
            'SELECT rendimento_total FROM preparos WHERE id = ?', [prepId]);
          const rend = parseNum(prepRow?.rendimento_total) || 1;
          const custoPorKgPrep = rend > 0 ? (custoTotalPrep / rend) * 1000 : 0;
          await db.runAsync(
            'UPDATE preparos SET custo_total=?, custo_por_kg=? WHERE id=?',
            [custoTotalPrep, custoPorKgPrep, prepId]
          );
          // Atualiza também o "custo" individual de cada linha de preparo_ingredientes
          for (const ing of (ingsPrep || [])) {
            const c = calcCustoIngrediente(
              ing.preco_por_kg || 0,
              ing.quantidade_utilizada,
              ing.unidade_medida || 'g',
              ing.unidade_medida || 'g'
            );
            await db.runAsync(
              'UPDATE preparo_ingredientes SET custo=? WHERE preparo_id=? AND materia_prima_id=?',
              [c, prepId, ing.materia_prima_id]
            );
          }
        }
      } catch (cascadeErr) {
        console.warn('[MateriaPrimaForm.cascadeUpdate]', cascadeErr);
      }

      // APP-23: cascade adicional pra delivery_combos. Os preparos já foram
      // atualizados acima; aqui propagamos pra combos que usam produtos ou preparos.
      try {
        const { recalcularTodosCombos } = await import('../services/cascadeRecalc');
        await recalcularTodosCombos(db);
      } catch (e) { console.warn('[MateriaPrimaForm.cascadeCombos]', e); }

      // Sessão 28.9 — APP-09/10: limpa cache do wrapper pra outras telas
      // (Produtos, Preparos, Home) lerem custos atualizados imediatamente.
      try {
        const { clearQueryCache } = await import('../database/supabaseDb');
        clearQueryCache();
      } catch (e) { /* defensivo */ }

      // Sessão 28.43: notifica list screens pra recarregarem
      try {
        const { notifyDataChanged } = await import('../utils/dataSync');
        notifyDataChanged('materias_primas');
        notifyDataChanged('preparos');
        notifyDataChanged('produtos');
        notifyDataChanged('delivery_combos');
      } catch (e) { /* defensivo */ }

      // Sessão 28.26: histórico DE PREÇO no auto-save COM dedup defensivo.
      // Antes: só "Salvar e voltar" registrava histórico → user editava preço,
      // saía da tela direto e o relatório de insumos NÃO mostrava a mudança.
      // Agora: gravamos histórico no auto-save MAS só se:
      //   1. valor_pago > 0 (evita rastrear edições incompletas)
      //   2. valor é DIFERENTE do último histórico (evita poluir a timeline com
      //      uma entrada por keystroke)
      //   3. última entrada tem >= 3min de idade OU preço difere significativamente
      //      (evita N entradas em sequência conforme user digita)
      if (vp > 0) {
        try {
          const lastHist = await db.getAllAsync(
            'SELECT valor_pago, data FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 1',
            [editId]
          );
          const prev = lastHist?.[0];
          const prevValor = prev ? Number(prev.valor_pago) : NaN;
          const isDifferent = !prev || !Number.isFinite(prevValor) || Math.abs(prevValor - vp) > 0.001;
          const isOldEnough = !prev || (Date.now() - new Date(prev.data).getTime()) > 3 * 60 * 1000;
          if (isDifferent && isOldEnough) {
            await db.runAsync(
              'INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)',
              [editId, vp, pb]
            );
          }
        } catch (_) { /* tabela pode não existir em ambientes legados */ }
      }
      // Check margin erosion (P2: throttle — caro com N+1 queries por produto)
      // Check margin erosion (P2: throttle — caro com N+1 queries por produto)
      const now = Date.now();
      if (now - lastMarginCheckRef.current >= MARGIN_CHECK_MIN_INTERVAL_MS) {
        lastMarginCheckRef.current = now;
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
                return a + calcCustoIngrediente(ing.preco_por_kg || 0, ing.quantidade_utilizada, ing.unidade_medida || 'g', ing.unidade_medida || 'g');
              }, 0);
              const preps = await db.getAllAsync('SELECT pp.quantidade_utilizada, pr.custo_por_kg, pr.unidade_medida FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id WHERE pp.produto_id = ?', [prod.id]);
              const custoPr = preps.reduce((a, pp) => {
                return a + calcCustoPreparo(pp.custo_por_kg || 0, pp.quantidade_utilizada, pp.unidade_medida || 'g');
              }, 0);
              const embs = await db.getAllAsync('SELECT pe.quantidade_utilizada, e.preco_unitario FROM produto_embalagens pe JOIN embalagens e ON e.id = pe.embalagem_id WHERE pe.produto_id = ?', [prod.id]);
              const custoEmb = embs.reduce((a, pe) => a + (pe.quantidade_utilizada || 0) * (pe.preco_unitario || 0), 0);
              const custoTotal = custoIng + custoPr + custoEmb;
              // Sessão 28.9 — Auditoria P0-02: usar calcMargem (alerta de margem baixa do produto)
              const margem = calcMargem(prod.preco_venda, custoTotal);
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
        } catch (e) {
          if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.marginCheck]', e);
        }
      }
      setSaveStatus('saved');
    } catch (e) {
      // P1: feedback explícito de erro (SaveStatus já suporta 'error')
      setSaveStatus('error');
      if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.autoSave]', e);
    }
  }

  // Salvar manual para modo criação
  async function salvarNovo() {
    const errs = validateForm(form);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return Alert.alert('Campos obrigatórios', 'Preencha todos os campos obrigatórios antes de salvar.');
    }
    // APP-04: valida unidade no save manual também
    const VALID_UNITS_SAVE = ['g','kg','mL','L','un'];
    if (!VALID_UNITS_SAVE.includes(form.unidade_medida)) {
      return Alert.alert('Unidade inválida', 'Selecione uma unidade de medida válida antes de salvar.');
    }
    setErrors({});
    // Sessão 28.18 BUG FIX: handle de erro com Alert claro pra o user.
    // Antes: erros do DB silenciavam, dando a impressão "não salva".
    try {
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
      // Limpa cache do wrapper pra outras telas verem o insumo recém-criado
      try {
        const { clearQueryCache } = await import('../database/supabaseDb');
        clearQueryCache();
      } catch (_) {}
      // Sessão 28.43: notifica list screens pra recarregarem após criar novo
      try {
        const { notifyDataChanged } = await import('../utils/dataSync');
        notifyDataChanged('materias_primas');
      } catch (_) {}
      // Sessão 28.36/28.38: se o user veio de "+ Insumo" dentro do EntityCreateModal,
      // adiciona o insumo recém-criado à lista de itens do draft.
      // 28.38 BUG FIX: custoUnit precisa ser CUSTO PARA 1 UNIDADE da unidade_medida,
      // não preco_por_kg direto. Antes: preço R$4 por 1000g virava custoUnit=4 →
      // ao multiplicar por quantidade=10g dava R$40 (errado). Agora calculamos
      // custoUnit = calcCustoIngrediente(preco_por_kg, 1, unidade, unidade) que
      // dá o cost-per-1-unit correto.
      if (result?.lastInsertRowId) {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const raw = await AsyncStorage.getItem('reopenEntityModalAfterEdit');
          if (raw) {
            const info = JSON.parse(raw);
            if (info?.draft && info?.pendingAddType === 'materia_prima') {
              const existingItens = info.draft.itens || [];
              const custoUnit = calcCustoIngrediente(
                precoBase || 0,
                1,
                form.unidade_medida || 'g',
                form.unidade_medida || 'g'
              );
              const novoItem = {
                tipo: 'materia_prima',
                id: result.lastInsertRowId,
                nome: form.nome,
                quantidade: 0,
                custoUnit,
                unidade: form.unidade_medida,
              };
              const updated = {
                ...info,
                draft: { ...info.draft, itens: [...existingItens, novoItem] },
                pendingAddType: undefined,
              };
              await AsyncStorage.setItem('reopenEntityModalAfterEdit', JSON.stringify(updated));
            }
          }
        } catch (e) { console.warn('[MateriaPrimaForm.autoAddToDraft]', e); }
      }
      navigation.goBack();
    } catch (e) {
      allowExit.current = false;
      console.error('[MateriaPrimaForm.salvarNovo]', e);
      const msg = (e && e.message) ? e.message : 'Erro desconhecido';
      Alert.alert(
        'Erro ao salvar',
        `Não foi possível salvar o insumo:\n\n${msg}\n\nVerifique sua conexão e tente novamente.`,
        [{ text: 'OK' }]
      );
    }
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

  async function solicitarExclusao() {
    if (!editId) return;
    // Sprint 2 S5 — checa dependências antes de mostrar confirmação.
    let mensagemDeps = null;
    try {
      const db = await getDatabase();
      const deps = await contarDependencias(db, 'materia_prima', editId);
      if (deps.total > 0) {
        mensagemDeps = formatarMensagemDeps(deps, { acao: 'excluir', entidade: 'insumo' });
      }
    } catch (e) {
      console.warn('[MateriaPrimaFormScreen.solicitarExclusao] erro ao checar dependências:', e?.message);
    }
    setConfirmDelete({
      titulo: 'Excluir Insumo',
      nome: form.nome || 'este insumo',
      mensagemExtra: mensagemDeps,
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
    <ModalFormWrapper title={formTitle} onClose={goBackSafe}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View>

        {/* Nome do insumo */}
        <InputField
          label="Nome do insumo"
          value={form.nome}
          onChangeText={(v) => {
            setForm(p => ({ ...p, nome: v }));
            setErrors(p => ({ ...p, nome: undefined }));
            // Sessão 28.8 — sugestão via dicionário (zero IA, zero custo)
            // Comportamento (pós-fix campo recorrente):
            //  - Campo vazio → reseta dispensa (user pode começar de novo)
            //  - <4 chars → não sugere (mas mantém estado)
            //  - Match casa com canonical JÁ aplicado/dispensado → silêncio
            //  - Match com canonical DIFERENTE → sugestão aparece
            //    (mesmo que outros campos estejam preenchidos — user pode
            //     querer SOBREPOR dados ao trocar pra insumo diferente)
            const trimmed = (v || '').trim();
            if (!trimmed) {
              setSugestao(null);
              setSugestaoDispensadaPara(null);
              return;
            }
            if (trimmed.length < 4) { setSugestao(null); return; }
            try {
              const m = matchInsumo(v);
              if (!m) { setSugestao(null); return; }
              const canonicalNorm = normalizeStr(m.nome_canonico);
              if (sugestaoDispensadaPara && sugestaoDispensadaPara === canonicalNorm) {
                // Mesmo canonical da última dispensa/aplicação → não re-sugere
                setSugestao(null);
                return;
              }
              setSugestao(m);
            } catch (_) { /* defensive */ }
          }}
          placeholder="Ex: Farinha de trigo"
          error={errors.nome}
          style={styles.fieldCompact}
        />

        {/* Sessão 28.8 — Banner de sugestão do dicionário */}
        {sugestao && (
          <View style={styles.sugestaoBanner} accessibilityLiveRegion="polite">
            <View style={styles.sugestaoHeader}>
              <Feather name="zap" size={14} color={colors.primary} />
              <Text style={styles.sugestaoTitulo}>Sugestão automática</Text>
            </View>
            <Text style={styles.sugestaoTexto}>
              <Text style={{ fontFamily: fontFamily.semiBold, color: colors.text }}>{sugestao.nome_canonico}</Text>
              {' · '}
              {sugestao.categoria}
              {' · '}
              {sugestao.unidade_padrao}
              {sugestao.qtd_tipica_compra ? `, ${sugestao.qtd_tipica_compra}${sugestao.unidade_padrao} típico` : ''}
            </Text>
            <View style={styles.sugestaoBtns}>
              <TouchableOpacity
                style={[styles.sugestaoBtn, styles.sugestaoBtnPrimario]}
                onPress={async () => {
                  // Resolve categoria_id: busca categoria local pelo nome
                  // do dicionário; se não achar, cria automaticamente.
                  let categoria_id = form.categoria_id;
                  try {
                    if (sugestao.categoria) {
                      const normCat = normalizeStr(sugestao.categoria);
                      const existente = categorias.find(c => normalizeStr(c.nome) === normCat);
                      if (existente) {
                        categoria_id = existente.id;
                      } else {
                        // Cria nova categoria automaticamente (zero friction)
                        const db = await getDatabase();
                        const result = await db.runAsync(
                          'INSERT INTO categorias_insumos (nome, icone) VALUES (?, ?)',
                          [sugestao.categoria, sugestao.icone || 'tag']
                        );
                        categoria_id = result.lastInsertRowId;
                        await loadCategorias();
                      }
                    }
                  } catch (e) {
                    console.warn('[Sugestao.usar] falha ao resolver categoria:', e);
                  }
                  // Sessão 28.17: aplica FC de referência (TACO) ao adotar a sugestão
                  // Antes: bruta == líquida (FC=1) → user precisava ajustar manualmente
                  let qtdBruta = sugestao.qtd_tipica_compra ? String(sugestao.qtd_tipica_compra) : p.quantidade_bruta;
                  let qtdLiquida = qtdBruta;
                  try {
                    const { estimarQuantidadeLiquida, getFatorCorrecaoReferencia } = await import('../data/fatoresCorrecao');
                    const fc = getFatorCorrecaoReferencia(sugestao.nome_canonico);
                    if (fc && fc !== 1 && sugestao.qtd_tipica_compra > 0) {
                      const liquidaCalc = estimarQuantidadeLiquida(sugestao.qtd_tipica_compra, sugestao.nome_canonico);
                      if (liquidaCalc > 0) qtdLiquida = String(Math.round(liquidaCalc));
                    }
                  } catch {}
                  // Sessão 28.34: também sugere PREÇO DE MERCADO se houver match
                  // na base curada de marketPrices.js. User pode editar antes de salvar.
                  let valorPagoMercado = null;
                  try {
                    const { getMarketPrice } = await import('../data/marketPrices');
                    const unidadeFinal = sugestao.unidade_padrao || form.unidade_medida;
                    valorPagoMercado = getMarketPrice(sugestao.nome_canonico, parseFloat(qtdBruta) || 0, unidadeFinal);
                  } catch {}
                  setForm(p => ({
                    ...p,
                    nome: sugestao.nome_canonico,
                    unidade_medida: sugestao.unidade_padrao || p.unidade_medida,
                    quantidade_bruta: qtdBruta,
                    quantidade_liquida: qtdLiquida,
                    categoria_id: categoria_id || p.categoria_id,
                    // só preenche se user ainda não digitou um valor manual
                    valor_pago: (valorPagoMercado != null && (!p.valor_pago || parseFloat(String(p.valor_pago).replace(',', '.')) === 0))
                      ? String(valorPagoMercado).replace('.', ',')
                      : p.valor_pago,
                  }));
                  // Marca como "estimado" pra UI mostrar badge amarelo
                  if (valorPagoMercado != null) {
                    try { setEhValorEstimado(true); } catch {}
                  }
                  setSugestaoDispensadaPara(normalizeStr(sugestao.nome_canonico));
                  setSugestao(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Usar sugestão"
              >
                <Feather name="check" size={12} color="#fff" />
                <Text style={styles.sugestaoBtnPrimarioText}>Usar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.sugestaoBtn}
                onPress={() => {
                  setSugestaoDispensadaPara(normalizeStr(sugestao.nome_canonico));
                  setSugestao(null);
                }}
                accessibilityRole="button"
                accessibilityLabel="Dispensar sugestão"
              >
                <Text style={styles.sugestaoBtnText}>Dispensar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Marca + Categoria */}
        <View style={rowStyle}>
          <View style={{ flex: 1 }}>
            <InputField
              label="Marca (opcional)"
              value={form.marca}
              onChangeText={(v) => setForm(p => ({ ...p, marca: v }))}
              placeholder="Pode deixar em branco"
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
        <View style={rowStyle}>
          <View style={{ flex: isMobile ? 1 : 0.7 }}>
            <PickerSelect
              label="Unidade"
              value={form.unidade_medida}
              onValueChange={(v) => setForm(p => ({ ...p, unidade_medida: v }))}
              options={UNIDADES_MEDIDA.map(u => ({ label: u.label, value: u.value }))}
            />
          </View>
          {/* Sessão 28.21: pra unidade 'un' não faz sentido bruta/líquida — só "Quantidade".
              FC sempre 1, ambas iguais. UI mostra UM input só. */}
          {form.unidade_medida === 'un' ? (
            <View style={{ flex: 2 }}>
              <InputField
                label="Quantidade"
                value={form.quantidade_bruta}
                onChangeText={(v) => {
                  setForm(p => ({ ...p, quantidade_bruta: v, quantidade_liquida: v }));
                  setErrors(p => ({ ...p, quantidade_bruta: undefined, quantidade_liquida: undefined }));
                }}
                keyboardType="decimal-pad"
                placeholder="Ex: 12 (quantas unidades você comprou)"
                error={errors.quantidade_bruta}
                style={styles.fieldCompact}
                rightLabel={
                  <InfoTooltip
                    title="Quantidade comprada"
                    text="Quantas unidades você comprou pelo valor pago. Pra insumos vendidos por unidade não tem perda de casca/osso, então é só esse valor."
                    examples={['Ex: 12 ovos custaram R$ 18,00 → 12 unidades']}
                  />
                }
              />
            </View>
          ) : (
            <>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Qtd. Bruta"
                  value={form.quantidade_bruta}
                  onChangeText={(v) => { setForm(p => ({ ...p, quantidade_bruta: v })); setErrors(p => ({ ...p, quantidade_bruta: undefined })); }}
                  keyboardType="decimal-pad"
                  placeholder="Ex: 1000 (use vírgula para decimais)"
                  error={errors.quantidade_bruta}
                  style={styles.fieldCompact}
                  rightLabel={
                    <InfoTooltip
                      title="Quantidade Bruta (o que você paga)"
                      text="É o peso ou volume TOTAL na hora da compra, incluindo o que será descartado. É por essa quantidade que a nota fiscal cobra."
                      examples={[
                        '1 kg de maracujá com casca = 1000 g',
                        '500 g de camarão com cabeça = 500 g',
                        '1 kg de cebola com casca = 1000 g',
                      ]}
                    />
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <InputField
                  label="Qtd. Líquida"
                  value={form.quantidade_liquida}
                  onChangeText={(v) => { setForm(p => ({ ...p, quantidade_liquida: v })); setErrors(p => ({ ...p, quantidade_liquida: undefined })); }}
                  keyboardType="decimal-pad"
                  placeholder="Ex: 800 (use vírgula para decimais)"
                  error={errors.quantidade_liquida}
                  style={styles.fieldCompact}
                  rightLabel={
                    <InfoTooltip
                      title="Quantidade Líquida (o que você usa)"
                      text="É o peso ou volume APROVEITÁVEL, depois de tirar casca, osso, semente, talo ou qualquer parte que vai pro lixo. É essa quantidade que entra de fato no produto."
                      examples={[
                        '1 kg de maracujá rende 350 g de polpa',
                        '500 g de camarão limpo = 350 g',
                        '1 kg de cebola descascada = 800 g',
                      ]}
                    />
                  }
                />
              </View>
            </>
          )}
        </View>

        {/* Valor Pago */}
        <InputField
          label="Valor Pago (R$)"
          value={form.valor_pago}
          onChangeText={(v) => { setForm(p => ({ ...p, valor_pago: v })); setErrors(p => ({ ...p, valor_pago: undefined })); }}
          keyboardType="decimal-pad"
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

        {/* APP-14: badge "valor estimado" quando o item veio pré-preenchido pelo Kit de Início */}
        {ehValorEstimado && (
          <View style={styles.estimadoBadge}>
            <Feather name="info" size={14} color={colors.warning} style={{ marginRight: 6 }} />
            <Text style={styles.estimadoBadgeText}>
              Valor estimado a partir de média de mercado. Atualize com o seu preço real.
            </Text>
          </View>
        )}

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
            {/* APP-17: nota sobre origem dos fatores de perda pré-preenchidos pelo kit */}
            {perdaPercent > 0 && (
              <View style={styles.fatorNote}>
                <Feather name="info" size={12} color={colors.textSecondary} />
                <Text style={styles.fatorNoteText}>
                  Fatores de perda baseados em referências do setor (Tabela TACO e literatura de food cost). Ajuste se o seu rendimento real for diferente.
                </Text>
              </View>
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
                // Inverter para exibir do mais antigo (esquerda) ao mais recente (direita)
                const sorted = [...historicoPrecos].reverse();
                const precos = sorted.map(h => h.valor_pago);
                const max = Math.max(...precos);
                const min = Math.min(...precos);
                const range = max - min || 1;
                const ultimo = precos[precos.length - 1];
                const penultimo = precos.length >= 2 ? precos[precos.length - 2] : ultimo;
                const variacao = penultimo > 0 ? ((ultimo - penultimo) / penultimo * 100) : 0;
                return (
                  <>
                    <View style={styles.historicoBarContainer}>
                      {sorted.map((h, i) => {
                        const p = h.valor_pago;
                        const heightPct = ((p - min) / range);
                        const height = Math.max(12, heightPct * 56 + 12);
                        const isLast = i === sorted.length - 1;
                        const data = h.data ? new Date(h.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '';
                        return (
                          <View key={h.id || i} style={styles.historicoBarWrapper}>
                            <Text style={styles.historicoBarPrice}>{formatCurrency(p)}</Text>
                            <View style={[styles.historicoBar, {
                              height,
                              backgroundColor: isLast ? colors.primary : colors.primary + '30',
                            }]} />
                            {data ? <Text style={styles.historicoBarDate}>{data}</Text> : null}
                            <TouchableOpacity
                              style={styles.historicoDeleteBtn}
                              onPress={() => setConfirmDelete({
                                titulo: 'Excluir registro de preço',
                                nome: `${data || 'Registro'} — ${formatCurrency(p)}`,
                                onConfirm: async () => {
                                  try {
                                    const db = await getDatabase();
                                    await db.runAsync('DELETE FROM historico_precos WHERE id = ?', [h.id]);
                                    setHistoricoPrecos(prev => prev.filter(x => x.id !== h.id));
                                  } catch (e) {
                                    // F2-J2-03: catch antes era silencioso — log para diagnóstico
                                    if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.deleteHistorico]', e);
                                  }
                                  setConfirmDelete(null);
                                },
                              })}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                              {...(Platform.OS === 'web' ? { title: 'Excluir este registro de preço' } : {})}
                            >
                              <Feather name="x" size={9} color={colors.error + '80'} />
                            </TouchableOpacity>
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.historicoInfo}>
                      <Text style={[styles.historicoInfoText, {
                        color: variacao > 0 ? colors.error : variacao < 0 ? colors.success : colors.textSecondary
                      }]}>
                        {variacao > 0 ? '▲ Subiu' : variacao < 0 ? '▼ Caiu' : '= Estável'} {Math.abs(variacao).toFixed(1)}%
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
          <TouchableOpacity style={styles.btnSaveEdit} onPress={async () => {
            // Registrar histórico de preço ao salvar
            // F2-J2-03 / CR-1: parseNum c/ Number.isFinite + `?? 0` (preserva fallback ql=qb)
            const vp = parseNum(formRef.current.valor_pago) ?? 0;
            if (vp > 0) {
              try {
                const db = await getDatabase();
                const f = formRef.current;
                const qb = parseNum(f.quantidade_bruta) ?? 0;
                const qlParsed = parseNum(f.quantidade_liquida);
                const ql = qlParsed != null && qlParsed > 0 ? qlParsed : qb;
                const pb = ql > 0 ? vp / (ql / 1000) : 0;
                const lastHist = await db.getAllAsync('SELECT valor_pago FROM historico_precos WHERE materia_prima_id = ? ORDER BY data DESC LIMIT 1', [editId]);
                const lastPrice = lastHist?.[0]?.valor_pago;
                if (lastPrice === undefined || lastPrice === null || Math.abs(lastPrice - vp) > 0.001) {
                  await db.runAsync('INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)', [editId, vp, pb]);
                }
              } catch (e) {
                // F2-J2-03: catch antes era silencioso — log + status de erro
                if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.saveBackBtn]', e);
                setSaveStatus('error');
              }
            }
            allowExit.current = true;
            goBackSafe();
          }}>
            <Feather name="check" size={14} color={colors.primary} style={{ marginRight: 5 }} />
            <Text style={styles.btnSaveEditText}>Salvar e voltar</Text>
          </TouchableOpacity>
        )}

        {/* Duplicar + Excluir */}
        {editId && (
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: spacing.md, marginTop: spacing.sm }}>
            {isFormComplete(form) && <TouchableOpacity style={[styles.btnDelete, { borderColor: colors.primary + '30' }]} onPress={async () => {
              const f = formRef.current;
              // Salva o item atual antes de duplicar
              // F2-J2-03: catch antes era silencioso — log do erro de auto-save
              try { await autoSave(); } catch(e) {
                if (typeof console !== 'undefined' && console.error) console.error('[MateriaPrimaForm.duplicar.autoSave]', e);
              }
              const db = await getDatabase();
              // F2-J2-03 / CR-1: parseNum (Number.isFinite) com fallbacks `?? 0` / `|| 1`
              const result = await db.runAsync('INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
                [f.nome.trim() + ' (cópia)', f.marca, f.categoria_id, parseNum(f.quantidade_bruta) ?? 0, parseNum(f.quantidade_liquida) ?? 0, parseNum(f.fator_correcao) ?? 1, f.unidade_medida, parseNum(f.valor_pago) ?? 0, parseNum(f.preco_por_kg) ?? 0]);
              if (result?.lastInsertRowId) { allowExit.current = true; navigation.replace('MateriaPrimaForm', { id: result.lastInsertRowId }); }
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

        {/* Auto-save status (edição) */}
        {editId && saveStatus && (
          <View style={styles.autoSaveInline}>
            <SaveStatus status={saveStatus} variant="badge" />
          </View>
        )}

        {/* Botão salvar (novo) */}
        {!editId && (
          <TouchableOpacity
            style={[
              styles.btnSave,
              { minHeight: buttonHeight, paddingVertical: isCompact ? spacing.sm : spacing.md },
              isDesktop && { maxWidth: 360, alignSelf: 'center', width: '100%' },
            ]}
            onPress={salvarNovo}
          >
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
                    if (!novaCatNome.trim()) return Alert.alert(t.alertAttention, t.validation.requiredSubcategoryName);
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
    </ModalFormWrapper>
  );
}
