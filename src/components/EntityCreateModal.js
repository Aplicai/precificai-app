/**
 * EntityCreateModal — Sessão 28.9 (rev. 2)
 *
 * Modal popup unificado para CRIAR ou EDITAR Produto OU Preparo.
 * Substitui a navegação para tela cheia em ambos os fluxos.
 *
 * UX inspirado no modal de combos:
 *  - 2 colunas no desktop, scroll vertical no mobile
 *  - Coluna esquerda: nome, categoria, "como vende" (produto) / rendimento (preparo),
 *    preço, lista de itens já adicionados
 *  - Coluna direita: SearchBar + chips de filtro + categorias COLAPSÁVEIS
 *  - Adicionar item = um toque na linha (com badge tipo)
 *
 * Props:
 *   visible:    bool
 *   mode:       'produto' | 'preparo'
 *   editId:     number | null  (null = criar, número = editar)
 *   onClose:    () => void
 *   onSaved:    (id) => void   (após save bem-sucedido)
 *   navigation: do React Navigation (não usado nesta rev., mantido pra compat)
 *   defaultCategoriaId: number | null
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Platform } from 'react-native';
// Sessão 28.29: styles extraídos pra arquivo dedicado (eram 611 linhas inline)
import { entityCreateModalStyles as styles } from './styles/entityCreateModal.styles';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import InputField from './InputField';
import SearchBar from './SearchBar';
import EmptyState from './EmptyState';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  formatCurrency, formatPercent,
  calcDespesasFixasPercentual, calcMarkup, calcPrecoSugerido,
  calcCustoIngrediente, calcCustoPreparo, calcCustoEmbalagem,
  calcLucroLiquido, calcCMVPercentual, calcMargem, calcMargemLiquida,
  safeNum,
} from '../utils/calculations';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
// Área 4 (Preparos) — toast de confirmação ao salvar preparo via modal
import { showToast } from '../utils/toastBus';

function parseInputValue(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).replace(',', '.').trim();
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

// Sessão 28.13: BUG fix — antes embalagem retornava 'un' SEMPRE (ignorando a unidade real)
// e insumos ficavam minúsculos ('ml', 'l') quebrando matching com VALID_UNITS=['g','kg','mL','L','un'].
function shortUnidade(rawUnidade, tipo) {
  const raw = String(rawUnidade || '').trim();
  // Match exato pra preservar caixa correta (mL ≠ ml, L ≠ l)
  if (raw === 'g' || raw === 'kg' || raw === 'mL' || raw === 'L' || raw === 'un') return raw;
  const u = raw.toLowerCase();
  if (u === 'g') return 'g';
  if (u === 'kg' || u.includes('quilo')) return 'kg';
  if (u === 'ml' || u.includes('mili')) return 'mL';
  if (u === 'l' || u.includes('litro')) return 'L';
  if (u === 'un' || u.includes('unid')) return 'un';
  if (u.includes('grama')) return 'g';
  return raw || 'un';
}

const TIPO_BADGE = {
  preparo:       { label: 'Preparo',    color: '#7c3aed' },
  materia_prima: { label: 'Insumo',     color: '#0891b2' },
  embalagem:     { label: 'Embalagem',  color: '#ea580c' },
};

// Mapas para "Como você vende" no produto
// Sessão 28.37: alinhado com CATEGORY_COLORS de MateriaPrimaFormScreen pra
// padronizar visual de categoria entre os formulários (insumo / preparo / produto).
const CATEGORY_COLORS = [
  colors.primary, colors.accent, colors.coral, colors.purple,
  colors.yellow, colors.success, colors.info, colors.red,
];

const TIPO_VENDA_MAP_TO_DB = { unidade: 'por_unidade', kg: 'por_kg', litro: 'por_litro' };
const TIPO_VENDA_MAP_FROM_DB = (db) => {
  if (db === 'por_kg' || db === 'kg') return 'kg';
  if (db === 'por_litro' || db === 'L' || db === 'litro') return 'litro';
  return 'unidade';
};

export default function EntityCreateModal({
  visible,
  mode,
  editId = null,
  onClose,
  onSaved,
  defaultCategoriaId = null,
  // Sessão 28.52: quando o modal é aberto como nested (ex.: preparo dentro
  // de produto), o pai passa seu próprio estado aqui. Usado pra preservar o
  // produto pai quando user fizer cascata "+ Insumo" / "+ Embalagem" de
  // dentro do nested preparo. Antes: produto pai era perdido nessa cascata.
  parentEntity = null,
}) {
  const { isDesktop, isMobile } = useResponsiveLayout();
  const navigation = useNavigation();
  const isProduto = mode === 'produto';
  const isEditing = !!editId;

  // Form state
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState(defaultCategoriaId);
  const [precoVenda, setPrecoVenda] = useState('');
  // Produto-specific
  const [tipoVenda, setTipoVenda] = useState('unidade'); // 'unidade' | 'kg' | 'litro'
  const [rendimentoUnidades, setRendimentoUnidades] = useState('1');
  const [rendimentoTotalProd, setRendimentoTotalProd] = useState('');
  // Preparo-specific
  const [rendimentoTotalPrep, setRendimentoTotalPrep] = useState('');
  const [unidadeMedidaPrep, setUnidadeMedidaPrep] = useState('g');
  // Itens
  const [itens, setItens] = useState([]);

  // Categoria picker
  const [categorias, setCategorias] = useState([]);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [novaCatNome, setNovaCatNome] = useState('');
  const [novaCatMode, setNovaCatMode] = useState(false);

  // Picker
  const [allMaterias, setAllMaterias] = useState([]);
  const [allPreparos, setAllPreparos] = useState([]);
  const [allEmbalagens, setAllEmbalagens] = useState([]);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState(null);
  const [catExpanded, setCatExpanded] = useState({
    preparo: false,
    materia_prima: false,
    embalagem: false,
  });
  const toggleCat = (k) => setCatExpanded(p => ({ ...p, [k]: !p[k] }));

  // Sessão 28.9 — quando usuário seleciona um filtro específico (Preparos/Insumos/Embalagens),
  // expande automaticamente a categoria correspondente. Filtro "Tudo" mantém tudo recolhido.
  useEffect(() => {
    if (!filtroTipo) return; // "Tudo" — não força nada
    setCatExpanded(p => ({ ...p, [filtroTipo]: true }));
  }, [filtroTipo]);

  // Sessão 28.38 BUG FIX: pré-seleciona embalagem padrão da categoria
  // (configurada via "Definir como padrão para [categoria]" em EmbalagemForm).
  // Antes: feature existia em getEmbalagemPadrao() mas EntityCreateModal nunca
  // chamava. Agora: ao trocar categoria em produto NOVO (não edição), busca
  // a embalagem padrão da categoria + canal balcão e adiciona aos itens
  // se ainda não estiver lá.
  useEffect(() => {
    if (!visible || !isProduto || isEditing || !categoriaId) return;
    let cancelled = false;
    (async () => {
      try {
        const { getEmbalagemPadrao } = await import('../services/embalagemPadrao');
        const db = await getDatabase();
        const embalagemId = await getEmbalagemPadrao(db, categoriaId, 'balcao');
        if (cancelled || !embalagemId) return;
        // Já tem essa embalagem nos itens? Não duplica.
        if (itens.some(i => i.tipo === 'embalagem' && i.id === embalagemId)) return;
        // Busca info da embalagem pra montar o item
        const embRow = await db.getFirstAsync(
          'SELECT id, nome, preco_unitario, unidade_medida FROM embalagens WHERE id = ?',
          [embalagemId]
        );
        if (cancelled || !embRow) return;
        const novoItem = {
          tipo: 'embalagem',
          id: embRow.id,
          nome: embRow.nome,
          quantidade: 1,
          custoUnit: safeNum(embRow.preco_unitario),
          unidade: embRow.unidade_medida || 'un',
          fromPadrao: true,
        };
        setItens(prev => [...prev, novoItem]);
      } catch (e) { /* silencioso — feature opcional */ }
    })();
    return () => { cancelled = true; };
  }, [visible, isProduto, isEditing, categoriaId]);

  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);
  const [loading, setLoading] = useState(false);

  // Sessão 28.38: cascata de popups — produto pode abrir modal de preparo
  // empilhado em cima sem fechar nem perder estado.
  const [nestedPreparoVisible, setNestedPreparoVisible] = useState(false);

  // Config de markup/precificação (carregado do banco — só relevante pra Produto)
  const [pricingConfig, setPricingConfig] = useState({
    despFixasPerc: 0,
    despVarPerc: 0,
    lucroDesejado: 0.15,
    markup: 0,
  });

  // Reset / load on open
  useEffect(() => {
    if (!visible) return;
    setBusca('');
    setFiltroTipo(null);
    // Preparo só tem 1 categoria (insumos) → começa expandida.
    // Produto começa com tudo recolhido (filtro "Tudo"); expansão muda c/ filtro.
    // Sessão 28.14: TODAS as categorias começam colapsadas — usuário vê os contadores
    // (Insumos 35, Embalagens 12) e clica pra expandir a que precisa.
    setCatExpanded({
      preparo: false,
      materia_prima: false,
      embalagem: false,
    });
    setErro(null);
    setNovaCatMode(false);
    setNovaCatNome('');
    if (isEditing) {
      loadForEdit();
    } else {
      // Sessão 28.25 BUG FIX (B3 do auditor): antes resetava SYNC (linhas 209-217)
      // e DEPOIS o async tentava restaurar draft → flash visual de form vazio
      // antes do draft aparecer, e race condition se a tab era trocada rápido.
      // Agora: reset síncrono UMA vez (preenche imediato pra evitar flash de
      // valores antigos do render anterior), e o async APENAS restaura se houver
      // draft válido — se não houver, mantém o reset que já foi aplicado.
      setNome('');
      setCategoriaId(defaultCategoriaId);
      setPrecoVenda('');
      setTipoVenda('unidade');
      setRendimentoUnidades('1');
      setRendimentoTotalProd('');
      setRendimentoTotalPrep('');
      setUnidadeMedidaPrep('g');
      setItens([]);

      // Sessão 28.19: restaura draft do AsyncStorage (se voltou de editar item)
      // — antes os itens digitados eram perdidos quando user clicava em editar
      // um insumo/preparo durante a CRIAÇÃO de um novo produto.
      let cancelled = false;
      (async () => {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const raw = await AsyncStorage.getItem('entityDraftToRestore');
          if (cancelled) return; // user fechou o modal antes do read
          if (raw) {
            const info = JSON.parse(raw);
            await AsyncStorage.removeItem('entityDraftToRestore');
            if (cancelled) return;
            if (info?.mode === mode && info?.draft && info?.ts && (Date.now() - info.ts) < 5 * 60 * 1000) {
              const d = info.draft;
              setNome(d.nome || '');
              setCategoriaId(d.categoriaId || defaultCategoriaId);
              setPrecoVenda(d.precoVenda || '');
              setTipoVenda(d.tipoVenda || 'unidade');
              setRendimentoUnidades(d.rendimentoUnidades || '1');
              setRendimentoTotalProd(d.rendimentoTotalProd || '');
              setRendimentoTotalPrep(d.rendimentoTotalPrep || '');
              setUnidadeMedidaPrep(d.unidadeMedidaPrep || 'g');
              setItens(d.itens || []);
            }
          }
          // Sessão 28.52: cascata 3 níveis — se houver flag de reabrir nested
          // preparo (vindo de fluxo produto > preparo > insumo/embalagem), abre
          // automaticamente o nested após restaurar o produto.
          if (isProduto) {
            try {
              const rawNested = await AsyncStorage.getItem('reopenNestedPreparoOnMount');
              if (rawNested) {
                const nestedInfo = JSON.parse(rawNested);
                await AsyncStorage.removeItem('reopenNestedPreparoOnMount');
                if (nestedInfo?.draft && nestedInfo?.ts && (Date.now() - nestedInfo.ts) < 5 * 60 * 1000) {
                  // Persiste o draft do preparo nested pra o modal nested ler
                  await AsyncStorage.setItem('entityDraftToRestore', JSON.stringify({
                    mode: 'preparo',
                    editId: nestedInfo.editId || null,
                    draft: nestedInfo.draft,
                    ts: Date.now(),
                  }));
                  // Dá um tempo pro produto montar, depois abre nested
                  setTimeout(() => { if (!cancelled) setNestedPreparoVisible(true); }, 150);
                }
              }
            } catch {}
          }
        } catch {}
      })();
      loadPickerAndCategorias();
      return () => { cancelled = true; };
    }
    loadPickerAndCategorias();
  }, [visible, editId]);

  async function loadPickerAndCategorias() {
    try {
      // Sessão 28.20: clear cache do supabaseDb wrapper antes de ler — garante que
      // edições recentes em insumos/preparos/embalagens (ex: usuário editou unidade
      // do leite) sejam vistas pelo modal ao reabrir, não o cache stale de 2s.
      try {
        const { clearQueryCache } = await import('../database/supabaseDb');
        clearQueryCache();
      } catch (_) {}
      const db = await getDatabase();
      const materias = await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome');
      const preparos = await db.getAllAsync('SELECT * FROM preparos ORDER BY nome');
      setAllMaterias(materias || []);
      setAllPreparos(preparos || []);
      // D-20 (sessão 28.13): embalagens carregadas em ambos os modos (preparo precisa pra armazenamento)
      const embalagens = await db.getAllAsync('SELECT * FROM embalagens ORDER BY nome');
      setAllEmbalagens(embalagens || []);
      if (isProduto) {
        const cats = await db.getAllAsync('SELECT * FROM categorias_produtos ORDER BY nome');
        setCategorias(cats || []);
        // Sessão 28.9 — config de markup pra análise de preço (mesma lógica do ProdutoFormScreen)
        try {
          const [cfgs, fixas, variaveis, fat] = await Promise.all([
            db.getAllAsync('SELECT * FROM configuracao'),
            db.getAllAsync('SELECT * FROM despesas_fixas'),
            db.getAllAsync('SELECT * FROM despesas_variaveis'),
            db.getAllAsync('SELECT * FROM faturamento_mensal'),
          ]);
          const cfg = cfgs && cfgs[0];
          const totalFixas = (fixas || []).reduce((a, d) => a + (d.valor || 0), 0);
          const totalVar = (variaveis || []).reduce((a, d) => a + (d.percentual || 0), 0);
          const mesesComFat = (fat || []).filter(f => f.valor > 0);
          const fatMedio = mesesComFat.length > 0
            ? mesesComFat.reduce((a, f) => a + f.valor, 0) / mesesComFat.length
            : 0;
          const dfPerc = calcDespesasFixasPercentual(totalFixas, fatMedio);
          const lucro = (cfg && cfg.lucro_desejado) || 0.15;
          const mk = calcMarkup(dfPerc, totalVar, lucro);
          setPricingConfig({ despFixasPerc: dfPerc, despVarPerc: totalVar, lucroDesejado: lucro, markup: mk });
        } catch (e2) {
          if (typeof console !== 'undefined' && console.warn) console.warn('[EntityCreateModal.loadConfig]', e2);
        }
      } else {
        const cats = await db.getAllAsync('SELECT * FROM categorias_preparos ORDER BY nome');
        setCategorias(cats || []);
      }
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[EntityCreateModal.loadPicker]', e);
    }
  }

  async function loadForEdit() {
    setLoading(true);
    try {
      // Sessão 28.20: ANTES de carregar do DB, checa se tem draft em memória
      // de uma navegação anterior pra editar item (insumo/preparo/embalagem).
      // Sessão 28.21: ao restaurar, refresca custoUnit/unidade dos itens do DB
      // (porque o user pode ter editado preço ou unidade do insumo enquanto fora,
      // e o draft tem só snapshot stale).
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        const raw = await AsyncStorage.getItem('entityDraftToRestore');
        if (raw) {
          const info = JSON.parse(raw);
          if (info?.mode === mode && info?.draft && info?.editId === editId && (Date.now() - info.ts) < 5 * 60 * 1000) {
            await AsyncStorage.removeItem('entityDraftToRestore');
            const d = info.draft;
            // Refresh custos/unidades dos itens do draft com dados atualizados do DB
            let refreshedItens = d.itens || [];
            try {
              const db = await getDatabase();
              const itensIds = { mp: [], pr: [], em: [] };
              refreshedItens.forEach(it => {
                if (it.tipo === 'materia_prima') itensIds.mp.push(it.id);
                else if (it.tipo === 'preparo') itensIds.pr.push(it.id);
                else if (it.tipo === 'embalagem') itensIds.em.push(it.id);
              });
              const fresh = { mp: {}, pr: {}, em: {} };
              if (itensIds.mp.length) {
                const rows = await db.getAllAsync(`SELECT id, nome, preco_por_kg, unidade_medida FROM materias_primas WHERE id IN (${itensIds.mp.map(()=>'?').join(',')})`, itensIds.mp);
                (rows || []).forEach(r => { fresh.mp[r.id] = r; });
              }
              if (itensIds.pr.length) {
                const rows = await db.getAllAsync(`SELECT id, nome, custo_por_kg, custo_total, unidade_medida FROM preparos WHERE id IN (${itensIds.pr.map(()=>'?').join(',')})`, itensIds.pr);
                (rows || []).forEach(r => { fresh.pr[r.id] = r; });
              }
              if (itensIds.em.length) {
                const rows = await db.getAllAsync(`SELECT id, nome, preco_unitario, unidade_medida FROM embalagens WHERE id IN (${itensIds.em.map(()=>'?').join(',')})`, itensIds.em);
                (rows || []).forEach(r => { fresh.em[r.id] = r; });
              }
              refreshedItens = refreshedItens.map(it => {
                if (it.tipo === 'materia_prima' && fresh.mp[it.id]) {
                  const r = fresh.mp[it.id];
                  return { ...it, custoUnit: calcCustoUnit('materia_prima', { preco_por_kg: r.preco_por_kg, unidade_medida: r.unidade_medida }), unidade: shortUnidade(r.unidade_medida, 'materia_prima') };
                }
                if (it.tipo === 'preparo' && fresh.pr[it.id]) {
                  const r = fresh.pr[it.id];
                  return { ...it, custoUnit: calcCustoUnit('preparo', { custo_por_kg: r.custo_por_kg, custo_total: r.custo_total }), unidade: shortUnidade(r.unidade_medida, 'preparo') };
                }
                if (it.tipo === 'embalagem' && fresh.em[it.id]) {
                  const r = fresh.em[it.id];
                  return { ...it, custoUnit: calcCustoUnit('embalagem', { preco_unitario: r.preco_unitario }), unidade: shortUnidade(r.unidade_medida, 'embalagem') || 'un' };
                }
                return it;
              });
            } catch (e) {
              if (typeof console !== 'undefined') console.warn('[EntityCreateModal.draftRefresh]', e?.message || e);
            }
            setNome(d.nome || '');
            setCategoriaId(d.categoriaId || null);
            setPrecoVenda(d.precoVenda || '');
            setTipoVenda(d.tipoVenda || 'unidade');
            setRendimentoUnidades(d.rendimentoUnidades || '1');
            setRendimentoTotalProd(d.rendimentoTotalProd || '');
            setRendimentoTotalPrep(d.rendimentoTotalPrep || '');
            setUnidadeMedidaPrep(d.unidadeMedidaPrep || 'g');
            setItens(refreshedItens);
            setLoading(false);
            return;
          }
        }
      } catch {}
      const db = await getDatabase();
      if (isProduto) {
        const rows = await db.getAllAsync('SELECT * FROM produtos WHERE id = ?', [editId]);
        const p = rows && rows[0];
        if (!p) {
          setErro('Produto não encontrado');
          setLoading(false);
          return;
        }
        setNome(p.nome || '');
        setCategoriaId(p.categoria_id || null);
        setPrecoVenda(p.preco_venda != null ? String(p.preco_venda) : '');
        setTipoVenda(TIPO_VENDA_MAP_FROM_DB(p.unidade_rendimento));
        setRendimentoUnidades(p.rendimento_unidades != null ? String(p.rendimento_unidades) : '1');
        setRendimentoTotalProd(p.rendimento_total != null ? String(p.rendimento_total) : '');
        // Carregar itens — uso pi.* + aliases nas joins (compat com supabaseDb wrapper)
        const ings = await db.getAllAsync(
          `SELECT pi.*, mp.nome as mp_nome, mp.preco_por_kg, mp.unidade_medida as mp_unidade
           FROM produto_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id
           WHERE pi.produto_id = ?`, [editId]);
        const preps = await db.getAllAsync(
          `SELECT pp.*, pr.nome as pr_nome, pr.custo_por_kg, pr.custo_total, pr.unidade_medida as pr_unidade
           FROM produto_preparos pp JOIN preparos pr ON pr.id = pp.preparo_id
           WHERE pp.produto_id = ?`, [editId]);
        const embs = await db.getAllAsync(
          `SELECT pe.*, e.nome as e_nome, e.preco_unitario, e.unidade_medida as e_unidade
           FROM produto_embalagens pe JOIN embalagens e ON e.id = pe.embalagem_id
           WHERE pe.produto_id = ?`, [editId]);
        const next = [];
        (ings || []).forEach(i => next.push({
          tipo: 'materia_prima',
          id: i.materia_prima_id,
          nome: i.mp_nome || i.nome,
          quantidade: i.quantidade_utilizada,
          custoUnit: calcCustoUnit('materia_prima', { preco_por_kg: i.preco_por_kg, unidade_medida: i.mp_unidade }),
          unidade: shortUnidade(i.mp_unidade, 'materia_prima'),
        }));
        (preps || []).forEach(p => next.push({
          tipo: 'preparo',
          id: p.preparo_id,
          nome: p.pr_nome || p.nome,
          quantidade: p.quantidade_utilizada,
          custoUnit: calcCustoUnit('preparo', { custo_por_kg: p.custo_por_kg, custo_total: p.custo_total }),
          unidade: shortUnidade(p.pr_unidade, 'preparo'),
        }));
        (embs || []).forEach(e => next.push({
          tipo: 'embalagem',
          id: e.embalagem_id,
          nome: e.e_nome || e.nome,
          quantidade: e.quantidade_utilizada,
          custoUnit: calcCustoUnit('embalagem', { preco_unitario: e.preco_unitario }),
          // Sessão 28.13: usa a unidade REAL da embalagem (não força 'un')
          unidade: shortUnidade(e.e_unidade, 'embalagem') || 'un',
        }));
        setItens(next);
      } else {
        const rows = await db.getAllAsync('SELECT * FROM preparos WHERE id = ?', [editId]);
        const p = rows && rows[0];
        if (!p) {
          setErro('Preparo não encontrado');
          setLoading(false);
          return;
        }
        setNome(p.nome || '');
        setCategoriaId(p.categoria_id || null);
        setRendimentoTotalPrep(p.rendimento_total != null ? String(p.rendimento_total) : '');
        setUnidadeMedidaPrep(shortUnidade(p.unidade_medida, 'preparo'));
        const ings = await db.getAllAsync(
          `SELECT pi.*, mp.nome as mp_nome, mp.preco_por_kg, mp.unidade_medida as mp_unidade
           FROM preparo_ingredientes pi JOIN materias_primas mp ON mp.id = pi.materia_prima_id
           WHERE pi.preparo_id = ?`, [editId]);
        // D-20 (sessão 28.13): também carrega embalagens (silencioso se schema não existir)
        let embsPrep = [];
        try {
          embsPrep = await db.getAllAsync(
            `SELECT pe.*, em.nome as em_nome, em.preco_unitario, em.unidade_medida as em_unidade
             FROM preparo_embalagens pe JOIN embalagens em ON em.id = pe.embalagem_id
             WHERE pe.preparo_id = ?`, [editId]) || [];
        } catch (e) {
          if (typeof console !== 'undefined') console.warn('[EntityCreateModal preparo_embalagens load]', e?.message || e);
        }
        const nextPrep = (ings || []).map(i => ({
          tipo: 'materia_prima',
          id: i.materia_prima_id,
          nome: i.mp_nome || i.nome,
          quantidade: i.quantidade_utilizada,
          custoUnit: calcCustoUnit('materia_prima', { preco_por_kg: i.preco_por_kg, unidade_medida: i.mp_unidade }),
          unidade: shortUnidade(i.mp_unidade, 'materia_prima'),
        }));
        embsPrep.forEach(e => nextPrep.push({
          tipo: 'embalagem',
          id: e.embalagem_id,
          nome: e.em_nome || e.nome,
          quantidade: e.quantidade_utilizada || 1,
          custoUnit: calcCustoUnit('embalagem', { preco_unitario: e.preco_unitario }),
          unidade: shortUnidade(e.em_unidade, 'embalagem') || 'un',
        }));
        setItens(nextPrep);
      }
    } catch (e) {
      setErro('Erro ao carregar');
      if (typeof console !== 'undefined' && console.error) console.error('[EntityCreateModal.loadForEdit]', e);
    }
    setLoading(false);
  }

  // Sessão 28.9 — Auditoria P0-01: usa funções centrais de calculations.js
  // pra garantir consistência com o resto do app (ProdutoFormScreen, DeliveryHub etc).
  // Custo unitário = custo de 1 unidade base do item (g/mL/un).
  function calcCustoUnit(tipo, item) {
    if (tipo === 'materia_prima') {
      // calcCustoIngrediente(precoBase, qtd=1, unidadeIngrediente, unidadeUso)
      // Retorna custo de 1 unidade na mesma unidade do insumo.
      return calcCustoIngrediente(
        safeNum(item.preco_por_kg),
        1,
        item.unidade_medida || 'g',
        item.unidade_medida || 'g'
      );
    }
    if (tipo === 'preparo') {
      // calcCustoPreparo(custoKg, qtd=1, unidadeUso)
      return calcCustoPreparo(
        safeNum(item.custo_por_kg),
        1,
        item.unidade_medida || 'g'
      );
    }
    if (tipo === 'embalagem') {
      return calcCustoEmbalagem(safeNum(item.preco_unitario), 1);
    }
    return 0;
  }

  function buildItem(tipo, item, quantidade = 1) {
    return {
      tipo,
      id: item.id,
      nome: item.nome,
      quantidade,
      custoUnit: calcCustoUnit(tipo, item),
      unidade: shortUnidade(item.unidade_medida || item.unidade_padrao, tipo),
      original: item,
    };
  }

  function adicionarItem(tipo, item) {
    setItens(prev => {
      const idx = prev.findIndex(i => i.tipo === tipo && i.id === item.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantidade: safeNum(next[idx].quantidade) + 1 };
        return next;
      }
      return [...prev, buildItem(tipo, item, 1)];
    });
  }

  function alterarQuantidade(idx, val) {
    // Sessão 28.9 — APP-07: aceitar decimais ('0,25', '1.5', '12').
    // Mantém o valor cru como STRING enquanto o usuário digita pra não
    // bloquear vírgulas e pontos durante a digitação. parseInputValue
    // só é chamado pra cálculos (custo total).
    setItens(prev => {
      const next = [...prev];
      // Limpa caracteres inválidos mas preserva vírgula/ponto:
      const cleaned = String(val).replace(/[^0-9.,]/g, '');
      next[idx] = { ...next[idx], quantidade: cleaned };
      return next;
    });
  }

  function removerItem(idx) {
    setItens(prev => prev.filter((_, i) => i !== idx));
  }

  // Área 4 (Preparos) — render dos itens + resumo extraído pra função;
  // no desktop é chamado dentro da coluna esquerda; no mobile, é
  // renderizado depois da coluna "Adicionar" pra ordem ficar:
  // form → adicionar → lista de itens → resumo.
  function renderItensEResumoBlock() {
    return (
      <View>
        <View style={styles.itensHeader}>
          <Text style={styles.subtitle}>{isProduto ? `Itens (${itens.length})` : `Ingredientes (${itens.length})`}</Text>
          {itens.length > 0 && (
            <Text style={styles.itensHint}>Ajuste a quantidade de cada item ↓</Text>
          )}
        </View>
        {itens.length === 0 && (
          <EmptyState
            compact
            icon="package"
            title={isProduto ? 'Nenhum item ainda' : 'Sem ingredientes'}
            description="Use a busca acima para adicionar."
          />
        )}
        {itens.map((it, index) => {
          const badge = TIPO_BADGE[it.tipo];
          const qtd = safeNum(it.quantidade) || 0;
          const total = safeNum(it.custoUnit) * qtd;
          return (
            <View key={`${it.tipo}-${it.id}-${index}`} style={styles.itemRow}>
              <View style={styles.itemRowHeader}>
                <View style={[styles.itemTipoBadge, { backgroundColor: badge.color + '15' }]}>
                  <Text style={[styles.itemTipoBadgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
                <TouchableOpacity
                  style={{ flex: 1 }}
                  onPress={() => {
                    if (!navigation) return;
                    try {
                      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                      const reopenInfo = {
                        mode, editId, ts: Date.now(),
                        draft: {
                          nome, categoriaId, precoVenda,
                          tipoVenda, rendimentoUnidades, rendimentoTotalProd,
                          rendimentoTotalPrep, unidadeMedidaPrep, itens,
                        },
                      };
                      AsyncStorage.setItem('reopenEntityModalAfterEdit', JSON.stringify(reopenInfo));
                    } catch {}
                    try { onClose && onClose(); } catch {}
                    setTimeout(() => {
                      try {
                        if (it.tipo === 'preparo') navigation.navigate('Preparos', { screen: 'PreparosMain', params: { openPreparoEdit: it.id } });
                        else if (it.tipo === 'materia_prima') navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { id: it.id, returnToEntityModal: true } });
                        else if (it.tipo === 'embalagem') navigation.navigate('Embalagens', { screen: 'EmbalagemForm', params: { id: it.id, returnToEntityModal: true } });
                      } catch (e) {
                        try {
                          if (it.tipo === 'preparo') navigation.navigate('Preparos', { params: { openPreparoEdit: it.id } });
                          else if (it.tipo === 'materia_prima') navigation.navigate('MateriaPrimaForm', { id: it.id, returnToEntityModal: true });
                          else if (it.tipo === 'embalagem') navigation.navigate('EmbalagemForm', { id: it.id, returnToEntityModal: true });
                        } catch {}
                      }
                    }, 120);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`Editar ${it.nome}`}
                  activeOpacity={0.6}
                >
                  <Text style={styles.itemNome} numberOfLines={1}>{it.nome} <Feather name="edit-2" size={10} color={colors.primary} /></Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => removerItem(index)}
                  style={styles.itemDeleteBtn}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Remover ${it.nome}`}
                >
                  <Feather name="trash-2" size={15} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>
              <View style={styles.itemRowFooter}>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => alterarQuantidade(index, String(Math.max(0, qtd - 1)).replace('.', ','))}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Feather name="minus" size={14} color={colors.text} />
                  </TouchableOpacity>
                  <TextInput
                    value={String(it.quantidade)}
                    onChangeText={(v) => alterarQuantidade(index, v)}
                    keyboardType="decimal-pad"
                    style={styles.stepperInput}
                    placeholder="0,25"
                  />
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => alterarQuantidade(index, String(qtd + 1).replace('.', ','))}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Feather name="plus" size={14} color={colors.text} />
                  </TouchableOpacity>
                </View>
                <View style={styles.unidadeBadge}>
                  <Text style={styles.unidadeBadgeText}>{(() => {
                    if (it.tipo === 'materia_prima') {
                      const mp = allMaterias.find(m => m.id === it.id);
                      return shortUnidade(mp?.unidade_medida || it.unidade, 'materia_prima');
                    }
                    if (it.tipo === 'embalagem') {
                      const em = allEmbalagens.find(e => e.id === it.id);
                      return shortUnidade(em?.unidade_medida || it.unidade, 'embalagem') || 'un';
                    }
                    if (it.tipo === 'preparo') {
                      const pr = allPreparos.find(p => p.id === it.id);
                      return shortUnidade(pr?.unidade_medida || it.unidade, 'preparo');
                    }
                    return it.unidade;
                  })()}</Text>
                </View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}>
                  <Text style={styles.itemCustoTotal}>{formatCurrency(total)}</Text>
                </View>
              </View>
            </View>
          );
        })}

        {(itens.length > 0 || isProduto) && (
          <View style={styles.resumo}>
            <View style={styles.resumoHeader}>
              <Feather name="dollar-sign" size={14} color={colors.primary} />
              <Text style={styles.resumoTitle}>Resumo de Custos</Text>
            </View>
            {isProduto ? (
              <>
                <View style={styles.resumoGrid}>
                  <View style={styles.resumoCell}>
                    <Text style={styles.resumoLabel}>CMV {tipoVenda === 'unidade' ? 'unit.' : `/${tipoVenda === 'kg' ? 'kg' : 'L'}`}</Text>
                    <Text style={styles.resumoValue}>{formatCurrency(cmvUnitario)}</Text>
                  </View>
                  <View style={styles.resumoCell}>
                    <Text style={styles.resumoLabel}>Sugerido</Text>
                    <Text style={[styles.resumoValue, { color: colors.textSecondary }]}>
                      {precoSugerido > 0 ? formatCurrency(precoSugerido) : '—'}
                    </Text>
                  </View>
                  <View style={styles.resumoCell}>
                    <Text style={styles.resumoLabel}>Lucro</Text>
                    <Text style={[styles.resumoValue, { color: lucroUnit >= 0 ? colors.primary : colors.error }]}>{formatCurrency(lucroUnit)}</Text>
                  </View>
                  <View style={styles.resumoCell}>
                    <Text style={styles.resumoLabel}>Margem</Text>
                    <Text style={[styles.resumoValue, {
                      color: margem >= 25 ? colors.success : margem >= 15 ? colors.accent : colors.error,
                    }]}>
                      {precoVendaNum > 0 ? `${margem.toFixed(1)}%` : '—'}
                    </Text>
                  </View>
                </View>
                {precoVendaNum > 0 && precoSugerido > 0 && Math.abs(diffSugerido) > 0.005 && (
                  <Text style={[styles.resumoComparacao, {
                    color: diffSugerido > 0 ? colors.success : colors.accent,
                  }]}>
                    {diffSugerido > 0
                      ? `▲ Acima do sugerido (+${formatCurrency(diffSugerido)})`
                      : `▼ Abaixo do sugerido (${formatCurrency(diffSugerido)})`}
                  </Text>
                )}
                {(custoInsumos > 0 || custoPreparos > 0 || custoEmbalagens > 0) && (
                  <View style={styles.resumoBreakdown}>
                    {custoInsumos > 0 && <Text style={styles.resumoBreakdownItem}>Insumos {formatCurrency(custoInsumos / divisor)}</Text>}
                    {custoInsumos > 0 && custoPreparos > 0 && <Text style={styles.resumoBreakdownSep}>·</Text>}
                    {custoPreparos > 0 && <Text style={styles.resumoBreakdownItem}>Preparos {formatCurrency(custoPreparos / divisor)}</Text>}
                    {(custoInsumos > 0 || custoPreparos > 0) && custoEmbalagens > 0 && <Text style={styles.resumoBreakdownSep}>·</Text>}
                    {custoEmbalagens > 0 && <Text style={styles.resumoBreakdownItem}>Emb. {formatCurrency(custoEmbalagens / divisor)}</Text>}
                  </View>
                )}
                {precoEfetivo > 0 && (pricingConfig.despFixasPerc > 0 || pricingConfig.despVarPerc > 0) && (
                  <View style={styles.analiseBox}>
                    <Text style={styles.analiseTitulo}>Composição por unidade vendida</Text>
                    <View style={styles.analiseLinha}>
                      <Text style={styles.analiseLabel}>CMV</Text>
                      <Text style={styles.analiseValor}>{formatCurrency(cmvUnitario)} <Text style={styles.analisePerc}>({formatPercent(cmvPerc)})</Text></Text>
                    </View>
                    {pricingConfig.despFixasPerc > 0 && (
                      <View style={styles.analiseLinha}>
                        <Text style={styles.analiseLabel}>Custos do mês</Text>
                        <Text style={styles.analiseValor}>{formatCurrency(despFixasValor)} <Text style={styles.analisePerc}>({formatPercent(pricingConfig.despFixasPerc)})</Text></Text>
                      </View>
                    )}
                    {pricingConfig.despVarPerc > 0 && (
                      <View style={styles.analiseLinha}>
                        <Text style={styles.analiseLabel}>Custos por venda</Text>
                        <Text style={styles.analiseValor}>{formatCurrency(despVarValor)} <Text style={styles.analisePerc}>({formatPercent(pricingConfig.despVarPerc)})</Text></Text>
                      </View>
                    )}
                    <View style={[styles.analiseLinha, styles.analiseLinhaTotal]}>
                      <Text style={[styles.analiseLabel, styles.analiseLabelTotal]}>Lucro Líquido</Text>
                      <Text style={[styles.analiseValor, {
                        color: lucroLiquido >= 0 ? colors.success : colors.error,
                        fontWeight: '700',
                      }]}>
                        {formatCurrency(lucroLiquido)} <Text style={styles.analisePerc}>({formatPercent(lucroLiquidoPerc)})</Text>
                      </Text>
                    </View>
                  </View>
                )}
                {pricingConfig.despFixasPerc === 0 && pricingConfig.despVarPerc === 0 && (
                  <View style={styles.analiseHint}>
                    <Feather name="info" size={11} color={colors.textSecondary} />
                    <Text style={styles.analiseHintText}>
                      Cadastre despesas fixas, variáveis e faturamento em "Configurações" para ver a análise completa de preço sugerido.
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.resumoGrid}>
                <View style={styles.resumoCell}>
                  <Text style={styles.resumoLabel}>Custo total</Text>
                  <Text style={styles.resumoValue}>{formatCurrency(custoTotal)}</Text>
                </View>
                <View style={styles.resumoCell}>
                  <Text style={styles.resumoLabel}>Custo / {unidadeMedidaPrep}</Text>
                  <Text style={styles.resumoValue}>
                    {parseInputValue(rendimentoTotalPrep) > 0
                      ? formatCurrency(custoTotal / parseInputValue(rendimentoTotalPrep))
                      : '—'}
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}
      </View>
    );
  }

  // Custos
  const custoTotal = itens.reduce((acc, it) => acc + safeNum(it.custoUnit) * safeNum(it.quantidade), 0);
  const custoInsumos = itens.filter(i => i.tipo === 'materia_prima').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const custoPreparos = itens.filter(i => i.tipo === 'preparo').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const custoEmbalagens = itens.filter(i => i.tipo === 'embalagem').reduce((a, i) => a + safeNum(i.custoUnit) * safeNum(i.quantidade), 0);
  const precoVendaNum = parseInputValue(precoVenda);
  // Para produto unidade: custo por unidade = custoTotal / rendimento_unidades; pra kg/litro: por kg/L
  const divisor = isProduto
    ? (tipoVenda === 'unidade'
        ? Math.max(1, parseInputValue(rendimentoUnidades))
        : Math.max(0.001, parseInputValue(rendimentoTotalProd)))
    : 1;
  const cmvUnitario = isProduto ? custoTotal / divisor : custoTotal;
  // Preço sugerido baseado no markup configurado (despesas + lucro desejado)
  const precoSugerido = isProduto && pricingConfig.markup > 0
    ? calcPrecoSugerido(cmvUnitario, pricingConfig.markup)
    : 0;
  // Análise sobre o preço de venda informado (ou sugerido se vazio)
  // Sessão 28.9 — Auditoria P0-02: usar funções centrais (mesma fonte que telas)
  const precoEfetivo = precoVendaNum > 0 ? precoVendaNum : precoSugerido;
  const despFixasValor = precoEfetivo * pricingConfig.despFixasPerc;
  const despVarValor = precoEfetivo * pricingConfig.despVarPerc;
  const lucroLiquido = calcLucroLiquido(precoEfetivo, cmvUnitario, despFixasValor, despVarValor);
  const lucroLiquidoPerc = calcMargemLiquida(precoEfetivo, cmvUnitario, despFixasValor, despVarValor);
  const cmvPerc = calcCMVPercentual(cmvUnitario, precoEfetivo);
  const lucroUnit = isProduto ? precoVendaNum - cmvUnitario : 0;
  // margem bruta (sem despesas) — usada no header do Resumo. Em %.
  const margem = isProduto ? calcMargem(precoVendaNum, cmvUnitario) * 100 : 0;
  const diffSugerido = precoVendaNum - precoSugerido;

  // Salvar
  async function salvar() {
    if (!nome.trim()) {
      setErro('Nome é obrigatório');
      return;
    }
    setSaving(true);
    setErro(null);
    try {
      const db = await getDatabase();
      let savedId = editId;

      if (isProduto) {
        const unidadeRendimentoDb = TIPO_VENDA_MAP_TO_DB[tipoVenda];
        const rendTotal = tipoVenda === 'unidade' ? 1 : parseInputValue(rendimentoTotalProd) || 0;
        const rendUn = tipoVenda === 'unidade' ? (parseInputValue(rendimentoUnidades) || 1) : 1;

        if (isEditing) {
          await db.runAsync(
            `UPDATE produtos SET nome=?, categoria_id=?, rendimento_total=?, unidade_rendimento=?, rendimento_unidades=?,
             preco_venda=? WHERE id=?`,
            [nome.trim(), categoriaId, rendTotal, unidadeRendimentoDb, rendUn, precoVendaNum, editId]
          );
          await db.runAsync('DELETE FROM produto_ingredientes WHERE produto_id = ?', [editId]);
          await db.runAsync('DELETE FROM produto_preparos WHERE produto_id = ?', [editId]);
          await db.runAsync('DELETE FROM produto_embalagens WHERE produto_id = ?', [editId]);
        } else {
          const result = await db.runAsync(
            `INSERT INTO produtos (nome, categoria_id, rendimento_total, unidade_rendimento, rendimento_unidades,
             tempo_preparo, preco_venda, margem_lucro_produto, validade_dias, temp_congelado, tempo_congelado,
             temp_refrigerado, tempo_refrigerado, temp_ambiente, tempo_ambiente,
             modo_preparo, observacoes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [
              nome.trim(), categoriaId, rendTotal, unidadeRendimentoDb, rendUn,
              0, precoVendaNum, 0, 0, 0, 0,
              0, 0, 0, 0,
              '', '',
            ]
          );
          savedId = result.lastInsertRowId;
        }

        for (const it of itens) {
          if (it.tipo === 'materia_prima') {
            await db.runAsync('INSERT INTO produto_ingredientes (produto_id, materia_prima_id, quantidade_utilizada) VALUES (?,?,?)',
              [savedId, it.id, safeNum(it.quantidade)]);
          } else if (it.tipo === 'preparo') {
            await db.runAsync('INSERT INTO produto_preparos (produto_id, preparo_id, quantidade_utilizada) VALUES (?,?,?)',
              [savedId, it.id, safeNum(it.quantidade)]);
          } else if (it.tipo === 'embalagem') {
            await db.runAsync('INSERT INTO produto_embalagens (produto_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)',
              [savedId, it.id, safeNum(it.quantidade)]);
          }
        }
      } else {
        const rend = parseInputValue(rendimentoTotalPrep) || 1;
        const custoPorKg = rend > 0 ? (custoTotal / rend) * 1000 : 0;
        if (isEditing) {
          await db.runAsync(
            `UPDATE preparos SET nome=?, categoria_id=?, rendimento_total=?, unidade_medida=?, custo_total=?, custo_por_kg=? WHERE id=?`,
            [nome.trim(), categoriaId, rend, unidadeMedidaPrep, custoTotal, custoPorKg, editId]
          );
          await db.runAsync('DELETE FROM preparo_ingredientes WHERE preparo_id = ?', [editId]);
          // D-20 (sessão 28.13): também limpa embalagens (silencioso se schema não existir)
          try { await db.runAsync('DELETE FROM preparo_embalagens WHERE preparo_id = ?', [editId]); } catch (e) {}
        } else {
          const result = await db.runAsync(
            `INSERT INTO preparos (nome, categoria_id, rendimento_total, unidade_medida, custo_total, custo_por_kg,
             modo_preparo, observacoes, validade_dias) VALUES (?,?,?,?,?,?,?,?,?)`,
            [nome.trim(), categoriaId, rend, unidadeMedidaPrep, custoTotal, custoPorKg, '', '', 0]
          );
          savedId = result.lastInsertRowId;
        }
        for (const it of itens) {
          if (it.tipo === 'materia_prima') {
            const cIng = safeNum(it.custoUnit) * safeNum(it.quantidade);
            await db.runAsync('INSERT INTO preparo_ingredientes (preparo_id, materia_prima_id, quantidade_utilizada, custo) VALUES (?,?,?,?)',
              [savedId, it.id, safeNum(it.quantidade), cIng]);
          } else if (it.tipo === 'embalagem') {
            // D-20: salva embalagens do preparo (silencioso se schema não existir)
            try {
              await db.runAsync('INSERT INTO preparo_embalagens (preparo_id, embalagem_id, quantidade_utilizada) VALUES (?,?,?)',
                [savedId, it.id, safeNum(it.quantidade)]);
            } catch (e) {
              if (typeof console !== 'undefined') console.warn('[EntityCreateModal preparo_embalagens]', e?.message || e);
            }
          }
        }
      }

      setSaving(false);
      // Sessão 28.36: se o preparo recém-criado veio de "+ Preparo" dentro de
      // um produto pai, anexa o preparo ao draft do produto. Só roda quando
      // estamos no MODO PREPARO e tem um produto pai esperando.
      if (savedId && !isProduto && mode === 'preparo') {
        try {
          const AsyncStorage = require('@react-native-async-storage/async-storage').default;
          const raw = await AsyncStorage.getItem('reopenEntityModalAfterEdit');
          if (raw) {
            const info = JSON.parse(raw);
            if (info?.draft && info?.mode === 'produto' && info?.pendingAddType === 'preparo') {
              const existingItens = info.draft.itens || [];
              // 28.38 BUG FIX: custoUnit pra preparo = custo_por_kg * 1g = custo por 1 unidade.
              // Usa calcCustoPreparo pra fazer a conversão correta.
              const custoPorKg = rend > 0 ? (custoTotal / rend) * 1000 : 0;
              const custoUnit = calcCustoPreparo(custoPorKg, 1, unidadeMedidaPrep || 'g');
              const novoItem = {
                tipo: 'preparo',
                id: savedId,
                nome: nome.trim(),
                quantidade: 0,
                custoUnit,
                unidade: unidadeMedidaPrep || 'g',
              };
              const updated = {
                ...info,
                draft: { ...info.draft, itens: [...existingItens, novoItem] },
                pendingAddType: undefined,
              };
              await AsyncStorage.setItem('reopenEntityModalAfterEdit', JSON.stringify(updated));
            }
          }
        } catch (e) { console.warn('[EntityCreateModal.preparo.autoAddToProductDraft]', e); }
      }
      // Área 4 — toast de confirmação após salvar preparo (cobre tanto criação
      // quanto edição via EntityCreateModal mode='preparo'). Produto fica
      // a cargo da Área que cuida dele.
      if (!isProduto) {
        try { showToast('Preparo salvo', 'check-circle'); } catch (_) {}
      }
      onSaved && onSaved(savedId);
      onClose && onClose();
    } catch (e) {
      setSaving(false);
      const msg = (e && e.message) ? e.message : 'Erro ao salvar';
      setErro(msg);
      if (typeof console !== 'undefined' && console.error) console.error('[EntityCreateModal.salvar]', e);
    }
  }

  async function criarCategoria() {
    if (!novaCatNome.trim()) return;
    try {
      const db = await getDatabase();
      const tabela = isProduto ? 'categorias_produtos' : 'categorias_preparos';
      const result = await db.runAsync(`INSERT INTO ${tabela} (nome, icone) VALUES (?, ?)`, [novaCatNome.trim(), 'tag']);
      const newId = result.lastInsertRowId;
      const cats = await db.getAllAsync(`SELECT * FROM ${tabela} ORDER BY nome`);
      setCategorias(cats || []);
      setCategoriaId(newId);
      setNovaCatMode(false);
      setNovaCatNome('');
      setShowCatPicker(false);
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) console.error('[EntityCreateModal.criarCategoria]', e);
    }
  }

  // Picker filter
  // Sessão 28.19: normaliza busca pra ignorar acentos e cedilha (açaí ↔ acai, ç ↔ c, etc)
  const _normalize = (s) => String(s || '').replace(/[çÇ]/g, (c) => (c === 'Ç' ? 'C' : 'c')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const termo = _normalize(busca);
  const tipoOn = (t) => !filtroTipo || filtroTipo === t;
  const filteredMaterias = tipoOn('materia_prima') ? allMaterias.filter(m => !termo || _normalize(m.nome).includes(termo) || _normalize(m.marca || '').includes(termo)) : [];
  const filteredPreparos = (isProduto && tipoOn('preparo')) ? allPreparos.filter(p => !termo || _normalize(p.nome).includes(termo)) : [];
  // D-20 (sessão 28.13): embalagens disponíveis em produto E preparo (preparos que precisam armazenar — pote, saco, etc)
  const filteredEmbalagens = (tipoOn('embalagem')) ? allEmbalagens.filter(e => !termo || _normalize(e.nome).includes(termo)) : [];

  function renderRow(item, key, tipo, custoFn) {
    const badge = TIPO_BADGE[tipo];
    const custo = custoFn ? custoFn(item) : 0;
    return (
      <TouchableOpacity
        key={key}
        style={styles.addItemRow}
        onPress={() => adicionarItem(tipo, item)}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityLabel={`Adicionar ${item.nome}`}
      >
        <View style={[styles.addItemBadge, { backgroundColor: badge.color + '15' }]}>
          <Text style={[styles.addItemBadgeText, { color: badge.color }]}>{badge.label}</Text>
        </View>
        <Text style={styles.addItemName} numberOfLines={1}>{item.nome}</Text>
        {custo > 0 && (
          <Text style={styles.addItemCusto}>{formatCurrency(custo)}</Text>
        )}
        <View style={styles.addItemPlusBtn}>
          <Feather name="plus" size={14} color={colors.primary} />
        </View>
      </TouchableOpacity>
    );
  }

  function renderCatBlock(key, label, items, mapFn) {
    if (!items || items.length === 0) return null;
    const expanded = !!termo || catExpanded[key];
    return (
      <View style={styles.catBlock}>
        <TouchableOpacity
          style={styles.catHeader}
          onPress={() => toggleCat(key)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityState={{ expanded }}
        >
          <Feather name={expanded ? 'chevron-down' : 'chevron-right'} size={14} color={colors.textSecondary} />
          <Text style={styles.catHeaderLabel}>{label}</Text>
          <View style={styles.catHeaderCount}>
            <Text style={styles.catHeaderCountText}>{items.length}</Text>
          </View>
        </TouchableOpacity>
        {expanded && items.map(mapFn)}
      </View>
    );
  }

  const catObj = categorias.find(c => c.id === categoriaId);
  const catLabel = catObj ? catObj.nome : 'Selecione uma categoria';

  const tituloModal = isEditing
    ? (nome ? nome : (isProduto ? 'Editar produto' : 'Editar preparo'))
    : (isProduto ? 'Novo produto' : 'Novo preparo');
  const iconModal = isProduto ? 'tag' : 'pot-steam-outline';
  const usaMaterialIcon = !isProduto;

  // Sessão 28.50 — proteção contra perda de dados:
  // se o user tem algo preenchido e clica FORA do modal, pergunta antes de descartar.
  const hasUnsavedDraft = !!(
    (nome && nome.trim()) ||
    categoriaId != null ||
    (precoVenda && String(precoVenda).trim()) ||
    (itens && itens.length > 0)
  );
  const handleBackdropPress = () => {
    if (!hasUnsavedDraft) { onClose && onClose(); return; }
    const msg = 'Você tem mudanças não salvas. Deseja descartar?';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && window.confirm(msg)) onClose && onClose();
    } else {
      onClose && onClose();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
    >
      <TouchableOpacity
        style={[styles.overlay, !isDesktop && styles.overlayMobile]}
        activeOpacity={1}
        onPress={handleBackdropPress}
      >
        <TouchableOpacity
          activeOpacity={1}
          style={[styles.content, isDesktop ? styles.contentDesktop : styles.contentMobile]}
          onPress={() => {}}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerIcon}>
              {usaMaterialIcon ? (
                <MaterialCommunityIcons name={iconModal} size={18} color={colors.primary} />
              ) : (
                <Feather name={iconModal} size={18} color={colors.primary} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>{tituloModal}</Text>
              {isEditing && <Text style={styles.subtitleHeader}>{isProduto ? 'Editar produto' : 'Editar preparo'}</Text>}
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Fechar"
            >
              <Feather name="x" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Body */}
          <ScrollView
            style={styles.body}
            contentContainerStyle={[
              { paddingBottom: spacing.md },
              isDesktop && styles.bodyTwoCol,
            ]}
            showsVerticalScrollIndicator={false}
          >
            {/* Coluna esquerda — Form */}
            <View style={isDesktop ? styles.colLeft : null}>
              <InputField
                label={isProduto ? 'Nome do produto' : 'Nome do preparo'}
                value={nome}
                onChangeText={setNome}
                placeholder={isProduto ? 'Ex: Bolo de chocolate' : 'Ex: Massa de pizza'}
              />

              {/* Categoria — Sessão 28.37: mostra dot colorido pra padronizar com MateriaPrimaForm */}
              <Text style={styles.fieldLabel}>Categoria</Text>
              <TouchableOpacity
                style={styles.catSelect}
                onPress={() => setShowCatPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Selecionar categoria"
              >
                {(() => {
                  if (!catObj) return null;
                  const idx = categorias.findIndex(c => c.id === catObj.id);
                  const dotColor = idx >= 0 ? CATEGORY_COLORS[idx % CATEGORY_COLORS.length] : colors.disabled;
                  return <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, marginRight: 8 }} />;
                })()}
                <Text style={[styles.catSelectText, !catObj && { color: colors.textSecondary }, { flex: 1 }]}>
                  {catLabel}
                </Text>
                <Feather name="chevron-down" size={16} color={colors.textSecondary} />
              </TouchableOpacity>

              {isProduto ? (
                <>
                  {/* Como você vende? */}
                  <Text style={styles.fieldLabel}>Como você vende?</Text>
                  <View style={styles.vendaChipsRow}>
                    {[
                      { label: 'Por unidade', value: 'unidade', icon: 'box' },
                      { label: 'Por kg',      value: 'kg',      icon: 'package' },
                      { label: 'Por litro',   value: 'litro',   icon: 'droplet' },
                    ].map(opt => {
                      const active = tipoVenda === opt.value;
                      return (
                        <TouchableOpacity
                          key={opt.value}
                          style={[styles.vendaChip, active && styles.vendaChipActive]}
                          onPress={() => setTipoVenda(opt.value)}
                          activeOpacity={0.7}
                          accessibilityRole="button"
                          accessibilityState={{ selected: active }}
                        >
                          <Feather name={opt.icon} size={13} color={active ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                          <Text style={[styles.vendaChipText, active && styles.vendaChipTextActive]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {tipoVenda === 'unidade' ? (
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <InputField
                          label="Unidades por receita"
                          value={rendimentoUnidades}
                          onChangeText={setRendimentoUnidades}
                          keyboardType="decimal-pad"
                          placeholder="Ex: 10"
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <InputField
                          label="Preço de venda /un (R$)"
                          value={precoVenda}
                          onChangeText={setPrecoVenda}
                          keyboardType="decimal-pad"
                          placeholder={precoSugerido > 0 ? precoSugerido.toFixed(2).replace('.', ',') : '0,00'}
                        />
                      </View>
                    </View>
                  ) : (
                    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                      <View style={{ flex: 1 }}>
                        <InputField
                          label={`Rendimento total (${tipoVenda === 'kg' ? 'kg' : 'L'})`}
                          value={rendimentoTotalProd}
                          onChangeText={setRendimentoTotalProd}
                          keyboardType="decimal-pad"
                          placeholder={tipoVenda === 'kg' ? 'Ex: 1,2' : 'Ex: 5'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <InputField
                          label={`Preço por ${tipoVenda === 'kg' ? 'kg' : 'litro'} (R$)`}
                          value={precoVenda}
                          onChangeText={setPrecoVenda}
                          keyboardType="decimal-pad"
                          placeholder={precoSugerido > 0 ? precoSugerido.toFixed(2).replace('.', ',') : '0,00'}
                        />
                      </View>
                    </View>
                  )}
                </>
              ) : (
                <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                  <View style={{ flex: 2 }}>
                    <InputField
                      label="Rendimento total"
                      value={rendimentoTotalPrep}
                      onChangeText={setRendimentoTotalPrep}
                      keyboardType="decimal-pad"
                      placeholder="0"
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Unidade</Text>
                    <View style={styles.unidadeChipsRow}>
                      {[{ k: 'g', l: 'g' }, { k: 'ml', l: 'ml' }, { k: 'un', l: 'un' }].map(u => (
                        <TouchableOpacity
                          key={u.k}
                          style={[styles.unidadeChip, unidadeMedidaPrep === u.k && styles.unidadeChipActive]}
                          onPress={() => setUnidadeMedidaPrep(u.k)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: unidadeMedidaPrep === u.k }}
                        >
                          <Text style={[styles.unidadeChipText, unidadeMedidaPrep === u.k && styles.unidadeChipTextActive]}>{u.l}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                </View>
              )}

              {/* Itens já adicionados — vêm ANTES do resumo pra deixar claro que
                  é preciso preencher quantidade de cada item antes de avaliar custos.
                  Área 4 (mobile): no mobile esse bloco é renderizado APÓS o picker
                  "Adicionar" (coluna direita), pra ordem ficar: form → adicionar → lista.
                  Aqui só renderiza no desktop. O bloco mobile fica no final. */}
              {!isMobile && renderItensEResumoBlock()}
            </View>

            {/* Coluna direita — Picker */}
            <View style={isDesktop ? styles.colRight : null}>
              <Text style={styles.subtitle}>Adicionar</Text>
              {/* Sessão 28.32: botões pra CADASTRAR novo item (insumo, preparo, embalagem)
                  diretamente daqui. Antes user só podia escolher itens já cadastrados;
                  pra criar um novo precisava sair do modal, perder o draft e voltar.
                  Agora salva draft no AsyncStorage e navega — `reopenEntityModalAfterEdit`
                  já existe e o modal restaura automaticamente quando volta (Sessão 28.19). */}
              {(() => {
                const saveDraftAndNavigate = (target, params = {}) => {
                  // Sessão 28.36: marca pendingAddType pra que o form de cadastro
                  // (MateriaPrimaForm/EmbalagemForm/EntityCreateModal preparo) saiba
                  // adicionar o item recém-criado no draft do produto/preparo pai.
                  let pendingAddType = null;
                  if (target === 'MateriaPrimaForm') pendingAddType = 'materia_prima';
                  else if (target === 'EmbalagemForm') pendingAddType = 'embalagem';
                  else if (target === 'NovoPreparo') pendingAddType = 'preparo';
                  try {
                    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
                    const currentDraft = {
                      nome, categoriaId, precoVenda,
                      tipoVenda, rendimentoUnidades, rendimentoTotalProd,
                      rendimentoTotalPrep, unidadeMedidaPrep, itens,
                    };
                    // Sessão 28.52: cascata 3 níveis (produto → preparo nested → insumo/embalagem).
                    // Se temos parentEntity (somos um nested), salvamos o PRODUTO PAI como o reopen
                    // e marcamos `reopenNestedPreparo` pra reabrir o preparo nested também.
                    let reopenInfo;
                    if (parentEntity && parentEntity.mode === 'produto') {
                      reopenInfo = {
                        mode: parentEntity.mode,
                        editId: parentEntity.editId || null,
                        ts: Date.now(),
                        pendingAddType: null, // o produto pai não recebe o novo item; o preparo nested recebe ao reabrir
                        draft: parentEntity.draft || {},
                        // Quando ProdutosListScreen reabrir o produto, este flag faz o
                        // EntityCreateModal abrir automaticamente o nested preparo restaurado.
                        reopenNestedPreparo: {
                          mode: 'preparo',
                          editId: editId || null,
                          draft: currentDraft,
                          pendingAddType,
                        },
                      };
                    } else {
                      reopenInfo = {
                        mode, editId: editId || null, ts: Date.now(),
                        pendingAddType,
                        draft: currentDraft,
                      };
                    }
                    AsyncStorage.setItem('reopenEntityModalAfterEdit', JSON.stringify(reopenInfo));
                  } catch {}
                  try { onClose && onClose(); } catch {}
                  setTimeout(() => {
                    try {
                      if (target === 'MateriaPrimaForm') {
                        navigation.navigate('Insumos', { screen: 'MateriaPrimaForm', params: { ...params, returnToEntityModal: true } });
                      } else if (target === 'EmbalagemForm') {
                        navigation.navigate('Embalagens', { screen: 'EmbalagemForm', params: { ...params, returnToEntityModal: true } });
                      } else if (target === 'NovoPreparo') {
                        // Reabre EntityCreateModal em mode="preparo" pra criar novo preparo
                        navigation.navigate('Preparos', { screen: 'PreparosMain', params: { abrirNovoPreparo: true } });
                      }
                    } catch (e) {
                      // Fallback sem nested screen
                      try {
                        if (target === 'MateriaPrimaForm') navigation.navigate('MateriaPrimaForm', { ...params, returnToEntityModal: true });
                        else if (target === 'EmbalagemForm') navigation.navigate('EmbalagemForm', { ...params, returnToEntityModal: true });
                      } catch {}
                    }
                  }, 120);
                };
                return (
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' }}
                      // Sessão 28.45: navega pra página completa do MateriaPrimaForm
                      // (revertido o popup simplificado da Sessão 28.39 — user pediu
                      // a página normal com todos os campos: estoque, fornecedor,
                      // fator de perda, etc). Draft do produto é salvo em AsyncStorage
                      // e restaurado ao voltar; insumo recém-criado é auto-adicionado.
                      onPress={() => saveDraftAndNavigate('MateriaPrimaForm')}
                      accessibilityLabel="Cadastrar novo insumo"
                    >
                      <Feather name="plus" size={11} color={colors.primary} />
                      <Feather name="shopping-bag" size={11} color={colors.primary} />
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.primary }}>Insumo</Text>
                    </TouchableOpacity>
                    {isProduto && (
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' }}
                        // Sessão 28.38: cascata — abre modal de preparo EMPILHADO
                        // (sem fechar este). Antes navegava pra Preparos screen.
                        onPress={() => setNestedPreparoVisible(true)}
                        accessibilityLabel="Cadastrar novo preparo"
                      >
                        <Feather name="plus" size={11} color={colors.primary} />
                        <MaterialCommunityIcons name="pot-steam-outline" size={11} color={colors.primary} />
                        <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.primary }}>Preparo</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6, borderWidth: 1, borderColor: colors.primary + '40', backgroundColor: colors.primary + '10' }}
                      // Sessão 28.45: navega pra página completa do EmbalagemForm
                      // (revertido popup da Sessão 28.39 — mesmo motivo do "+ Insumo").
                      onPress={() => saveDraftAndNavigate('EmbalagemForm')}
                      accessibilityLabel="Cadastrar nova embalagem"
                    >
                      <Feather name="plus" size={11} color={colors.primary} />
                      <Feather name="package" size={11} color={colors.primary} />
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: colors.primary }}>Embalagem</Text>
                    </TouchableOpacity>
                  </View>
                );
              })()}
              <SearchBar
                value={busca}
                onChangeText={setBusca}
                placeholder="Buscar..."
                inset="modal"
              />

              {isProduto && (
                <View style={styles.tipoFilterRow}>
                  {[
                    { key: 'todos', label: 'Tudo', icon: 'grid' },
                    { key: 'preparo', label: 'Preparos', icon: 'pot-steam-outline', material: true },
                    { key: 'materia_prima', label: 'Insumos', icon: 'shopping-bag' },
                    { key: 'embalagem', label: 'Embalagens', icon: 'package' },
                  ].map(opt => {
                    const isActive = (filtroTipo || 'todos') === opt.key;
                    return (
                      <TouchableOpacity
                        key={opt.key}
                        style={[styles.tipoFilterChip, isActive && styles.tipoFilterChipActive]}
                        onPress={() => setFiltroTipo(opt.key === 'todos' ? null : opt.key)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityState={{ selected: isActive }}
                      >
                        {opt.material ? (
                          <MaterialCommunityIcons name={opt.icon} size={12} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                        ) : (
                          <Feather name={opt.icon} size={12} color={isActive ? '#fff' : colors.textSecondary} style={{ marginRight: 4 }} />
                        )}
                        <Text style={[styles.tipoFilterChipText, isActive && styles.tipoFilterChipTextActive]}>{opt.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {(() => {
                const total = filteredMaterias.length + filteredPreparos.length + filteredEmbalagens.length;
                if (total === 0) {
                  return (
                    <Text style={styles.emptyResults}>
                      {termo ? `Nenhum resultado para "${busca}"` : 'Nenhum item disponível'}
                    </Text>
                  );
                }
                return (
                  <>
                    {renderCatBlock('preparo', 'Preparos', filteredPreparos, (p) => renderRow(p, `prep-${p.id}`, 'preparo', (x) => safeNum(x.custo_total)))}
                    {renderCatBlock('materia_prima', 'Insumos', filteredMaterias, (m) => renderRow(m, `mp-${m.id}`, 'materia_prima', (x) => safeNum(x.preco_por_kg)))}
                    {renderCatBlock('embalagem', 'Embalagens', filteredEmbalagens, (e) => renderRow(e, `emb-${e.id}`, 'embalagem', (x) => safeNum(x.preco_unitario)))}
                  </>
                );
              })()}
            </View>

            {/* Área 4 (mobile): lista de itens + resumo vai aqui no fim pra
                seguir ordem: form → adicionar → lista. */}
            {isMobile && renderItensEResumoBlock()}
          </ScrollView>

          {/* Footer */}
          {erro && (
            <View style={styles.errorBanner}>
              <Feather name="alert-circle" size={14} color={colors.error} />
              <Text style={styles.errorText}>{erro}</Text>
            </View>
          )}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.btnSecondary}
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Cancelar"
              disabled={saving}
            >
              <Text style={styles.btnSecondaryText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.btnPrimary}
              onPress={salvar}
              accessibilityRole="button"
              accessibilityLabel="Salvar"
              disabled={saving || loading}
            >
              <Feather name="check" size={14} color="#fff" />
              <Text style={styles.btnPrimaryText}>
                {saving ? 'Salvando...' : (isEditing ? 'Salvar alterações' : 'Salvar')}
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Modal de seleção/criação de categoria */}
      <Modal visible={showCatPicker} transparent animationType="fade">
        <TouchableOpacity
          style={styles.catModalOverlay}
          activeOpacity={1}
          onPress={() => { setShowCatPicker(false); setNovaCatMode(false); }}
        >
          <TouchableOpacity activeOpacity={1} style={styles.catModalContent} onPress={() => {}}>
            {!novaCatMode ? (
              <>
                <Text style={styles.catModalTitle}>Categoria</Text>
                <ScrollView style={{ maxHeight: 300 }}>
                  <TouchableOpacity
                    style={[styles.catRow, !categoriaId && styles.catRowActive]}
                    onPress={() => { setCategoriaId(null); setShowCatPicker(false); }}
                  >
                    {/* Sessão 28.37: padroniza com layout colorido do MateriaPrimaForm */}
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.disabled, marginRight: 4 }} />
                    <Text style={[styles.catRowText, !categoriaId && { color: colors.primary, fontFamily: fontFamily.bold }]}>Sem categoria</Text>
                    {!categoriaId && <Feather name="check" size={14} color={colors.primary} style={{ marginLeft: 'auto' }} />}
                  </TouchableOpacity>
                  {categorias.map((c, idx) => {
                    const dotColor = CATEGORY_COLORS[idx % CATEGORY_COLORS.length];
                    const isActive = categoriaId === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.catRow, isActive && styles.catRowActive]}
                        onPress={() => { setCategoriaId(c.id); setShowCatPicker(false); }}
                      >
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: dotColor, marginRight: 4 }} />
                        <Text style={[styles.catRowText, { flex: 1 }, isActive && { color: colors.primary, fontFamily: fontFamily.bold }]}>{c.nome}</Text>
                        {isActive && <Feather name="check" size={14} color={colors.primary} />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                <TouchableOpacity style={styles.catNovaBtn} onPress={() => setNovaCatMode(true)}>
                  <Feather name="plus" size={14} color={colors.primary} />
                  <Text style={styles.catNovaBtnText}>Nova categoria</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.catModalTitle}>Nova categoria</Text>
                <TextInput
                  style={styles.catNovaInput}
                  value={novaCatNome}
                  onChangeText={setNovaCatNome}
                  placeholder="Nome da categoria"
                  autoFocus
                />
                <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                  <TouchableOpacity style={[styles.btnSecondary, { flex: 1 }]} onPress={() => { setNovaCatMode(false); setNovaCatNome(''); }}>
                    <Text style={styles.btnSecondaryText}>Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.btnPrimary, { flex: 1 }]} onPress={criarCategoria}>
                    <Text style={styles.btnPrimaryText}>Criar</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Sessão 28.38: cascata — modal de preparo empilhado em cima do produto.
          Quando o user salva, o preparo recém-criado é adicionado aos itens
          do produto E o modal nested fecha. Se cancela, só fecha (produto
          permanece igual). */}
      {isProduto && (
        <EntityCreateModal
          visible={nestedPreparoVisible}
          mode="preparo"
          editId={null}
          onClose={() => setNestedPreparoVisible(false)}
          // Sessão 28.52: passa estado do produto pai pro nested preparo.
          // Se user fizer cascata "+ Insumo"/"+ Embalagem" lá, o produto é preservado.
          parentEntity={{
            mode: 'produto',
            editId,
            draft: {
              nome, categoriaId, precoVenda,
              tipoVenda, rendimentoUnidades, rendimentoTotalProd,
              rendimentoTotalPrep, unidadeMedidaPrep, itens,
            },
          }}
          onSaved={async (novoPreparoId) => {
            setNestedPreparoVisible(false);
            if (!novoPreparoId) return;
            // Busca o preparo recém-criado pra montar o item corretamente
            try {
              const db = await getDatabase();
              const prep = await db.getFirstAsync(
                'SELECT id, nome, custo_total, custo_por_kg, rendimento_total, unidade_medida FROM preparos WHERE id = ?',
                [novoPreparoId]
              );
              if (!prep) return;
              const custoUnit = calcCustoPreparo(safeNum(prep.custo_por_kg), 1, prep.unidade_medida || 'g');
              setItens(prev => {
                if (prev.some(i => i.tipo === 'preparo' && i.id === prep.id)) return prev;
                return [...prev, {
                  tipo: 'preparo',
                  id: prep.id,
                  nome: prep.nome,
                  quantidade: 0,
                  custoUnit,
                  unidade: shortUnidade(prep.unidade_medida, 'preparo'),
                }];
              });
            } catch (e) { console.warn('[EntityCreateModal.nestedPreparo.onSaved]', e); }
          }}
        />
      )}

      {/* Sessão 28.45: QuickInsumoForm popup removido. "+ Insumo" e "+ Embalagem"
          navegam pras páginas completas (MateriaPrimaForm / EmbalagemForm) que têm
          campos completos (estoque, fornecedor, fator de perda etc). Draft do
          produto é salvo em AsyncStorage e restaurado ao voltar — o item recém
          criado é auto-adicionado via flag pendingAddType. */}
    </Modal>
  );
}
