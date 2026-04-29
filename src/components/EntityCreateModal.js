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
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Platform } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
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
} from '../utils/calculations';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

function safeNum(v) {
  // APP-07: aceitar string com vírgula ('0,25') tanto quanto ponto ('0.25')
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || v === undefined) return 0;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

function parseInputValue(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).replace(',', '.').trim();
  if (!s) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function shortUnidade(rawUnidade, tipo) {
  if (tipo === 'embalagem') return 'un';
  const u = String(rawUnidade || '').toLowerCase();
  if (u === 'g' || u === 'ml' || u === 'un') return u;
  if (u.includes('grama')) return 'g';
  if (u.includes('mili')) return 'ml';
  if (u.includes('litro')) return 'L';
  if (u.includes('unid')) return 'un';
  if (u.includes('kg') || u.includes('quilo')) return 'kg';
  return u || 'un';
}

const TIPO_BADGE = {
  preparo:       { label: 'Preparo',    color: '#7c3aed' },
  materia_prima: { label: 'Insumo',     color: '#0891b2' },
  embalagem:     { label: 'Embalagem',  color: '#ea580c' },
};

// Mapas para "Como você vende" no produto
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
}) {
  const { isDesktop } = useResponsiveLayout();
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

  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState(null);
  const [loading, setLoading] = useState(false);

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
    setCatExpanded({
      preparo: false,
      materia_prima: !isProduto,
      embalagem: false,
    });
    setErro(null);
    setNovaCatMode(false);
    setNovaCatNome('');
    if (isEditing) {
      loadForEdit();
    } else {
      // criar
      setNome('');
      setCategoriaId(defaultCategoriaId);
      setPrecoVenda('');
      setTipoVenda('unidade');
      setRendimentoUnidades('1');
      setRendimentoTotalProd('');
      setRendimentoTotalPrep('');
      setUnidadeMedidaPrep('g');
      setItens([]);
    }
    loadPickerAndCategorias();
  }, [visible, editId]);

  async function loadPickerAndCategorias() {
    try {
      const db = await getDatabase();
      const materias = await db.getAllAsync('SELECT * FROM materias_primas ORDER BY nome');
      const preparos = await db.getAllAsync('SELECT * FROM preparos ORDER BY nome');
      setAllMaterias(materias || []);
      setAllPreparos(preparos || []);
      if (isProduto) {
        const embalagens = await db.getAllAsync('SELECT * FROM embalagens ORDER BY nome');
        setAllEmbalagens(embalagens || []);
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
          unidade: 'un',
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
        setItens((ings || []).map(i => ({
          tipo: 'materia_prima',
          id: i.materia_prima_id,
          nome: i.mp_nome || i.nome,
          quantidade: i.quantidade_utilizada,
          custoUnit: calcCustoUnit('materia_prima', { preco_por_kg: i.preco_por_kg, unidade_medida: i.mp_unidade }),
          unidade: shortUnidade(i.mp_unidade, 'materia_prima'),
        })));
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
          }
        }
      }

      setSaving(false);
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
  const termo = busca.trim().toLowerCase();
  const tipoOn = (t) => !filtroTipo || filtroTipo === t;
  const filteredMaterias = tipoOn('materia_prima') ? allMaterias.filter(m => !termo || (m.nome || '').toLowerCase().includes(termo)) : [];
  const filteredPreparos = (isProduto && tipoOn('preparo')) ? allPreparos.filter(p => !termo || (p.nome || '').toLowerCase().includes(termo)) : [];
  const filteredEmbalagens = (isProduto && tipoOn('embalagem')) ? allEmbalagens.filter(e => !termo || (e.nome || '').toLowerCase().includes(termo)) : [];

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

  return (
    <Modal
      visible={visible}
      transparent
      animationType={isDesktop ? 'fade' : 'slide'}
    >
      <TouchableOpacity
        style={[styles.overlay, !isDesktop && styles.overlayMobile]}
        activeOpacity={1}
        onPress={onClose}
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

              {/* Categoria */}
              <Text style={styles.fieldLabel}>Categoria</Text>
              <TouchableOpacity
                style={styles.catSelect}
                onPress={() => setShowCatPicker(true)}
                accessibilityRole="button"
                accessibilityLabel="Selecionar categoria"
              >
                <Text style={[styles.catSelectText, !catObj && { color: colors.textSecondary }]}>
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
                  é preciso preencher quantidade de cada item antes de avaliar custos */}
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
                  description="Use a busca ao lado para adicionar."
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
                      <Text style={styles.itemNome} numberOfLines={1}>{it.nome}</Text>
                      {/* Sessão 28.9 — APP-06: botão "trocar" preserva quantidade/unidade
                          mas permite escolher outro insumo do picker (atalho: foca filtro do tipo correto) */}
                      <TouchableOpacity
                        onPress={() => {
                          // Foca o filtro do mesmo tipo do item, abre o picker (já visível)
                          setFiltroTipo(it.tipo);
                          // Marca este item como "pendente de troca": remove ele e
                          // o user clica num novo item da coluna direita pra adicionar.
                          // Mantém a quantidade no clipboard mental do user (mostra hint).
                          if (Platform.OS === 'web') {
                            window.alert(`Selecione o novo item à direita. A quantidade (${it.quantidade} ${it.unidade}) e tipo (${badge.label}) serão preservados.`);
                          }
                          removerItem(index);
                        }}
                        style={styles.itemEditBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Trocar ${it.nome}`}
                      >
                        <Feather name="repeat" size={14} color={colors.primary} />
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
                      {/* Sessão 28.9 — Unidade fora do stepper, em badge clara */}
                      <View style={styles.unidadeBadge}>
                        <Text style={styles.unidadeBadgeText}>{it.unidade}</Text>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={styles.itemCustoTotal}>{formatCurrency(total)}</Text>
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* Resumo de Custos — vem APÓS os itens pra reforçar a ordem natural:
                  primeiro adiciona itens + quantidades, depois vê o resultado */}
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

                      {/* Comparação preço de venda vs sugerido */}
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

                      {/* Análise detalhada (composição do preço) */}
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

                      {/* Hint quando config não está preenchida */}
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

            {/* Coluna direita — Picker */}
            <View style={isDesktop ? styles.colRight : null}>
              <Text style={styles.subtitle}>Adicionar</Text>
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
                    <Feather name="x" size={14} color={colors.textSecondary} />
                    <Text style={styles.catRowText}>Sem categoria</Text>
                  </TouchableOpacity>
                  {categorias.map(c => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.catRow, categoriaId === c.id && styles.catRowActive]}
                      onPress={() => { setCategoriaId(c.id); setShowCatPicker(false); }}
                    >
                      <Feather name="folder" size={14} color={colors.primary} />
                      <Text style={styles.catRowText}>{c.nome}</Text>
                    </TouchableOpacity>
                  ))}
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
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlayMobile: {
    justifyContent: 'flex-end',
    alignItems: 'stretch',
  },
  content: {
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(0,0,0,0.18)' },
      default: { elevation: 12 },
    }),
  },
  contentDesktop: {
    width: '92%',
    maxWidth: 920,
    maxHeight: '88%',
    borderRadius: borderRadius.lg,
  },
  contentMobile: {
    width: '100%',
    maxHeight: '92%',
    borderTopLeftRadius: borderRadius.lg,
    borderTopRightRadius: borderRadius.lg,
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.sm,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: colors.primary + '12',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  subtitleHeader: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.background,
  },

  body: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  bodyTwoCol: {
    flexDirection: 'row',
    gap: spacing.lg,
    alignItems: 'flex-start',
  },
  colLeft: { flex: 1, minWidth: 0 },
  colRight: { flex: 1, minWidth: 0 },

  fieldLabel: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
    marginBottom: 4,
    marginTop: spacing.xs,
  },

  // Categoria selector
  catSelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    backgroundColor: colors.surface,
    marginBottom: spacing.sm,
  },
  catSelectText: {
    fontSize: fonts.regular,
    color: colors.text,
    fontFamily: fontFamily.regular,
  },

  // Como você vende
  vendaChipsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: spacing.sm,
    flexWrap: 'wrap',
  },
  vendaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  vendaChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  vendaChipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  vendaChipTextActive: { color: '#fff' },

  // Unidade preparo
  unidadeChipsRow: {
    flexDirection: 'row',
    gap: 4,
    marginTop: 2,
  },
  unidadeChip: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  unidadeChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  unidadeChipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  unidadeChipTextActive: { color: '#fff' },

  // Resumo
  resumo: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginTop: spacing.sm,
  },
  resumoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 6,
  },
  resumoTitle: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    textTransform: 'uppercase',
  },
  resumoGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  resumoCell: { flex: 1 },
  resumoLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  resumoValue: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.text,
    marginTop: 1,
  },
  resumoBreakdown: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  resumoBreakdownItem: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  resumoBreakdownSep: {
    fontSize: 10,
    color: colors.textSecondary + '60',
  },
  resumoComparacao: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    marginTop: 6,
  },

  // Análise composição do preço
  analiseBox: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  analiseTitulo: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  analiseLinha: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  analiseLinhaTotal: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  analiseLabel: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
  },
  analiseLabelTotal: {
    color: colors.text,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  analiseValor: {
    fontSize: fonts.tiny,
    color: colors.text,
    fontFamily: fontFamily.semiBold,
  },
  analisePerc: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  analiseHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    marginTop: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  analiseHintText: {
    flex: 1,
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
  },

  subtitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
  },
  itensHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 4,
  },
  itensHint: {
    fontSize: 10,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontStyle: 'italic',
    marginTop: spacing.md,
  },

  // Item já adicionado
  itemRow: {
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
    padding: spacing.sm,
    marginBottom: 6,
  },
  itemRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  itemTipoBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  itemTipoBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  itemNome: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    color: colors.text,
  },
  itemDeleteBtn: { padding: 4 },
  itemEditBtn: { padding: 4, marginRight: 2 },
  itemRowFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
  },
  stepperInput: {
    minWidth: 44,
    paddingHorizontal: 4,
    textAlign: 'center',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.text,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.border,
    height: 28,
  },
  // Sessão 28.9 — Badge da unidade, separada do stepper para legibilidade
  unidadeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: colors.primary + '12',
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unidadeBadgeText: {
    fontSize: 12,
    color: colors.primary,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  itemCustoTotal: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
  },

  // Picker
  tipoFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 6,
    marginBottom: 6,
  },
  tipoFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 30,
  },
  tipoFilterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  tipoFilterChipText: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  tipoFilterChipTextActive: { color: '#fff' },

  catBlock: { marginTop: spacing.sm },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: colors.background,
    gap: 6,
    minHeight: 36,
  },
  catHeaderLabel: {
    flex: 1,
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
  },
  catHeaderCount: {
    minWidth: 22, height: 18,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  catHeaderCountText: {
    fontSize: 11,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
  },

  addItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 6,
    minHeight: 40,
  },
  addItemBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  addItemBadgeText: {
    fontSize: 10,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  addItemName: {
    flex: 1,
    fontSize: fonts.small,
    color: colors.text,
    fontFamily: fontFamily.medium,
  },
  addItemCusto: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.semiBold,
  },
  addItemPlusBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: colors.primary + '15',
    alignItems: 'center', justifyContent: 'center',
  },
  emptyResults: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    textAlign: 'center',
    paddingVertical: spacing.md,
    fontStyle: 'italic',
  },

  // Footer
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fef2f2',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#fecaca',
  },
  errorText: {
    flex: 1,
    fontSize: fonts.tiny,
    color: '#991b1b',
    fontFamily: fontFamily.medium,
  },
  footer: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  btnSecondaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.textSecondary,
  },
  btnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.primary,
  },
  btnPrimaryText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: '#fff',
  },

  // Categoria modal
  catModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  catModalContent: {
    width: '90%',
    maxWidth: 380,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.lg,
    padding: spacing.md,
    ...Platform.select({
      web: { boxShadow: '0 20px 60px rgba(0,0,0,0.18)' },
      default: { elevation: 12 },
    }),
  },
  catModalTitle: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  catRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  catRowActive: {
    backgroundColor: colors.primary + '15',
  },
  catRowText: {
    fontSize: fonts.regular,
    color: colors.text,
    fontFamily: fontFamily.medium,
  },
  catNovaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.sm,
    paddingVertical: 10,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.primary + '40',
    borderStyle: 'dashed',
  },
  catNovaBtnText: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    color: colors.primary,
  },
  catNovaInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 10,
    fontSize: fonts.regular,
    color: colors.text,
  },
});
