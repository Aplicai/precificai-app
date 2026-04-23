/**
 * EstoqueHubScreen — Hub central de estoque (M1-10/11/12).
 *
 * Por que isso existe num app de PRECIFICAÇÃO?
 * → Cada entrada de recebimento atualiza o custo médio ponderado do insumo.
 *   Esse custo médio é a base do cálculo de preço de venda. Sem isso, seu preço
 *   fica travado num custo antigo.
 *
 * Layout (tabs):
 *  - Saldos:     lista de insumos+embalagens (clicáveis → ActionSheet com opções)
 *  - Movimentos: histórico filtrável por período (7d / 30d / tudo)
 *  - Inventário: visão consolidada (valor total + composição)
 *
 * Aberto via Mais → Estoque ou banner do Home.
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform, Alert,
  RefreshControl, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { getDatabase } from '../database/database';
import { supabase } from '../config/supabase';
import { listarSaldosConsolidados } from '../services/estoque';
import { formatCurrency } from '../utils/calculations';
import { formatTimeAgo } from '../utils/timeAgo';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import FAB from '../components/FAB';
import SearchBar from '../components/SearchBar';

const TABS = [
  { key: 'saldos',     label: 'Saldos',     icon: 'package' },
  { key: 'movimentos', label: 'Movimentos', icon: 'list' },
  { key: 'inventario', label: 'Inventário', icon: 'pie-chart' },
];

const STATUS_STYLE = {
  ok:     { label: 'OK',     bg: '#E8F5E9', fg: colors.success },
  baixo:  { label: 'Baixo',  bg: '#FFF4E5', fg: colors.warning },
  zerado: { label: 'Zerado', bg: '#FDECEC', fg: colors.error },
};

const PERIODOS = [
  { key: '7',   label: '7 dias',  ms: 7 * 24 * 60 * 60 * 1000 },
  { key: '30',  label: '30 dias', ms: 30 * 24 * 60 * 60 * 1000 },
  { key: '90',  label: '90 dias', ms: 90 * 24 * 60 * 60 * 1000 },
  { key: 'all', label: 'Tudo',    ms: null },
];

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.ok;
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export default function EstoqueHubScreen({ navigation }) {
  const [tab, setTab] = useState('saldos');
  const [busca, setBusca] = useState('');
  const [periodo, setPeriodo] = useState('30'); // filtro de movimentos
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [erro, setErro] = useState(null);

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const db = await getDatabase();
      const items = await listarSaldosConsolidados(db);
      setSaldos(items);

      const { data: movs, error } = await supabase
        .from('estoque_movimentos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      if (Array.isArray(movs)) setMovimentos(movs);
    } catch (e) {
      setErro(e?.message || 'Não foi possível carregar o estoque.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const onRefresh = () => { setRefreshing(true); carregar(); };

  const saldosFiltrados = useMemo(() => {
    const q = (busca || '').toLowerCase().trim();
    if (!q) return saldos;
    return saldos.filter((i) => (i.nome || '').toLowerCase().includes(q));
  }, [saldos, busca]);

  const movimentosFiltrados = useMemo(() => {
    const p = PERIODOS.find((x) => x.key === periodo);
    if (!p?.ms) return movimentos;
    const corte = Date.now() - p.ms;
    return movimentos.filter((m) => {
      const t = new Date(m.created_at).getTime();
      return Number.isFinite(t) && t >= corte;
    });
  }, [movimentos, periodo]);

  const stats = useMemo(() => {
    let zerado = 0, baixo = 0, ok = 0, valorTotal = 0;
    for (const i of saldos) {
      if (i._status === 'zerado') zerado++;
      else if (i._status === 'baixo') baixo++;
      else ok++;
      const q = Number(i.quantidade_estoque) || 0;
      const c = Number(i.custo_medio) || 0;
      valorTotal += q * c;
    }
    return { zerado, baixo, ok, valorTotal };
  }, [saldos]);

  // ActionSheet: ao tocar num item, abre as opções (entrada/ajuste/edit).
  const onItemPress = useCallback((item) => {
    const isEmb = item._tipo === 'embalagem';
    const editScreen = isEmb ? 'EmbalagemForm' : 'MateriaPrimaForm';
    const opcoes = [
      {
        text: 'Dar entrada (atualiza custo)',
        onPress: () => navigation.navigate('EntradaEstoque', {
          entidadeTipo: item._tipo,
          entidadeId: item.id,
        }),
      },
      {
        text: 'Ajustar saldo',
        onPress: () => navigation.navigate('AjusteEstoque', {
          entidadeTipo: item._tipo,
          entidadeId: item.id,
        }),
      },
      {
        text: `Editar ${isEmb ? 'embalagem' : 'insumo'}`,
        onPress: () => navigation.navigate(editScreen, { id: item.id }),
      },
      { text: 'Cancelar', style: 'cancel' },
    ];
    Alert.alert(item.nome, 'O que deseja fazer?', opcoes);
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Tabs */}
      <View style={styles.tabBar}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tab, active && styles.tabActive]}
              activeOpacity={0.7}
              onPress={() => setTab(t.key)}
            >
              <Feather name={t.icon} size={15} color={active ? colors.primary : colors.textSecondary} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Banner de erro */}
      {erro && (
        <View style={styles.errorBanner}>
          <Feather name="alert-triangle" size={16} color={colors.error} />
          <Text style={styles.errorBannerText} numberOfLines={2}>{erro}</Text>
          <TouchableOpacity onPress={carregar} style={styles.errorBannerBtn}>
            <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Stats strip — visíveis em todas as abas */}
      {!loading && (
        <View style={styles.statsStrip}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.ok}</Text>
            <Text style={styles.statLabel}>OK</Text>
          </View>
          <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.warning }]}>{stats.baixo}</Text>
            <Text style={styles.statLabel}>Baixo</Text>
          </View>
          <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
            <Text style={[styles.statValue, { color: colors.error }]}>{stats.zerado}</Text>
            <Text style={styles.statLabel}>Zerado</Text>
          </View>
          <View style={[styles.statItem, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
            <Text style={styles.statValue}>{formatCurrency(stats.valorTotal)}</Text>
            <Text style={styles.statLabel}>Valor</Text>
          </View>
        </View>
      )}

      {tab === 'saldos' && (
        <SaldosTab
          loading={loading} items={saldosFiltrados} busca={busca} setBusca={setBusca}
          refreshing={refreshing} onRefresh={onRefresh} onItemPress={onItemPress}
        />
      )}
      {tab === 'movimentos' && (
        <MovimentosTab
          loading={loading} items={movimentosFiltrados} saldos={saldos}
          refreshing={refreshing} onRefresh={onRefresh}
          periodo={periodo} setPeriodo={setPeriodo}
        />
      )}
      {tab === 'inventario' && (
        <InventarioTab
          stats={stats} items={saldos}
          refreshing={refreshing} onRefresh={onRefresh}
        />
      )}

      <FAB
        iconName="plus"
        label={tab === 'movimentos' ? 'Ajuste' : 'Entrada'}
        onPress={() => navigation.navigate(
          tab === 'movimentos' ? 'AjusteEstoque' : 'EntradaEstoque'
        )}
      />
    </View>
  );
}

function SaldosTab({ loading, items, busca, setBusca, refreshing, onRefresh, onItemPress }) {
  return (
    <View style={{ flex: 1 }}>
      {/* Cabeçalho explicativo — por que estoque importa pra precificação */}
      <View style={styles.infoCard}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={styles.infoCardText}>
          Toque em um item para <Text style={{ fontFamily: fontFamily.semiBold }}>dar entrada</Text> (atualiza o custo médio que vira base do preço), <Text style={{ fontFamily: fontFamily.semiBold }}>ajustar saldo</Text> ou editar.
        </Text>
      </View>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.xs }}>
        <SearchBar value={busca} onChangeText={setBusca} placeholder="Buscar item…" />
      </View>
      {loading ? (
        <View style={{ padding: spacing.md }}>
          <Skeleton height={64} style={{ marginBottom: 8 }} />
          <Skeleton height={64} style={{ marginBottom: 8 }} />
          <Skeleton height={64} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="package"
          title="Sem itens em estoque"
          description="Cadastre insumos/embalagens primeiro e depois registre uma entrada de recebimento."
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => `${i._tipo}:${i.id}`}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => <SaldoRow item={item} onPress={() => onItemPress(item)} />}
        />
      )}
    </View>
  );
}

function SaldoRow({ item, onPress }) {
  const qtd = Number(item.quantidade_estoque) || 0;
  const min = Number(item.estoque_minimo) || 0;
  const cm  = Number(item.custo_medio) || 0;
  const valor = qtd * cm;
  return (
    <TouchableOpacity style={styles.row} activeOpacity={0.65} onPress={onPress}>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
          <Text style={styles.rowTitle} numberOfLines={1}>{item.nome}</Text>
          <View style={[styles.tagTipo, { backgroundColor: item._tipo === 'embalagem' ? colors.purple + '14' : colors.primary + '14' }]}>
            <Text style={[styles.tagTipoText, { color: item._tipo === 'embalagem' ? colors.purple : colors.primary }]}>
              {item._label}
            </Text>
          </View>
        </View>
        <Text style={styles.rowMeta}>
          {qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade_medida || 'un'}
          {min > 0 ? ` · mín ${min.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}` : ''}
          {cm > 0 ? ` · ${formatCurrency(cm)}/${item.unidade_medida || 'un'}` : ''}
        </Text>
        {valor > 0 && <Text style={styles.rowValor}>{formatCurrency(valor)} em estoque</Text>}
      </View>
      <StatusChip status={item._status} />
      <Feather name="chevron-right" size={18} color={colors.disabled} style={{ marginLeft: 4 }} />
    </TouchableOpacity>
  );
}

function MovimentosTab({ loading, items, saldos, refreshing, onRefresh, periodo, setPeriodo }) {
  const nomePorChave = useMemo(() => {
    const m = new Map();
    for (const s of saldos || []) m.set(`${s._tipo}:${s.id}`, s.nome);
    return m;
  }, [saldos]);

  return (
    <View style={{ flex: 1 }}>
      {/* Filtro de período */}
      <View style={styles.filtroRow}>
        {PERIODOS.map((p) => {
          const active = periodo === p.key;
          return (
            <TouchableOpacity
              key={p.key}
              style={[styles.filtroChip, active && styles.filtroChipActive]}
              activeOpacity={0.7}
              onPress={() => setPeriodo(p.key)}
            >
              <Text style={[styles.filtroChipText, active && styles.filtroChipTextActive]}>{p.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {loading ? (
        <View style={{ padding: spacing.md }}>
          <Skeleton height={56} style={{ marginBottom: 8 }} />
          <Skeleton height={56} style={{ marginBottom: 8 }} />
          <Skeleton height={56} />
        </View>
      ) : !items.length ? (
        <EmptyState
          icon="list"
          title={periodo === 'all' ? 'Nenhum movimento registrado' : 'Sem movimentos no período'}
          description={periodo === 'all'
            ? 'Quando você registrar uma entrada, ajuste ou venda, ela aparecerá aqui.'
            : 'Tente um período maior ou registre uma nova entrada/ajuste.'}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          renderItem={({ item }) => (
            <MovimentoRow
              mov={item}
              itemNome={nomePorChave.get(`${item.entidade_tipo}:${item.entidade_id}`)}
            />
          )}
        />
      )}
    </View>
  );
}

function MovimentoRow({ mov, itemNome }) {
  const isEntrada = mov.tipo === 'entrada';
  const isSaida   = mov.tipo === 'saida';
  const color = isEntrada ? colors.success : isSaida ? colors.error : colors.warning;
  const icon  = isEntrada ? 'arrow-down-circle' : isSaida ? 'arrow-up-circle' : 'edit-3';
  const sinal = isSaida ? '-' : isEntrada ? '+' : '±';
  const qtd = Number(mov.quantidade) || 0;
  const tipoLabel = mov.entidade_tipo === 'embalagem' ? 'Embalagem' : 'Insumo';
  const itemDescr = itemNome
    ? `${tipoLabel}: ${itemNome}`
    : `${tipoLabel} #${mov.entidade_id}`;
  // Data formatada absoluta (curta) + relativa
  let dataAbs = '';
  try {
    const d = new Date(mov.created_at);
    if (!Number.isNaN(d.getTime())) {
      dataAbs = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    }
  } catch {}
  return (
    <View style={styles.row}>
      <Feather name={icon} size={22} color={color} style={{ marginRight: spacing.sm }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {mov.motivo || (isEntrada ? 'Recebimento' : isSaida ? 'Saída' : 'Ajuste')}
        </Text>
        <Text style={styles.rowMeta} numberOfLines={1}>
          {itemDescr} · {dataAbs && `${dataAbs} · `}{formatTimeAgo(mov.created_at)}
          {mov.origem_tipo ? ` · ${mov.origem_tipo}` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={[styles.rowQtd, { color }]}>
          {sinal}{qtd.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}
        </Text>
        <Text style={styles.rowMeta}>saldo {Number(mov.saldo_apos).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</Text>
      </View>
    </View>
  );
}

function InventarioTab({ stats, items, refreshing, onRefresh }) {
  const insumos    = items.filter((i) => i._tipo === 'materia_prima');
  const embalagens = items.filter((i) => i._tipo === 'embalagem');
  const valorInsumos    = insumos.reduce((s, i) => s + (Number(i.quantidade_estoque) || 0) * (Number(i.custo_medio) || 0), 0);
  const valorEmbalagens = embalagens.reduce((s, i) => s + (Number(i.quantidade_estoque) || 0) * (Number(i.custo_medio) || 0), 0);

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Cabeçalho explicativo — por que estoque importa pra precificação */}
      <View style={[styles.infoCard, { marginTop: 0, marginBottom: spacing.md }]}>
        <Feather name="info" size={14} color={colors.primary} />
        <Text style={styles.infoCardText}>
          Cada entrada recalcula o <Text style={{ fontFamily: fontFamily.semiBold }}>custo médio ponderado</Text>, que é a base do preço sugerido nos seus produtos.
        </Text>
      </View>

      <View style={styles.cardBig}>
        <Text style={styles.cardBigLabel}>Valor total em estoque</Text>
        <Text style={styles.cardBigValue}>{formatCurrency(stats.valorTotal)}</Text>
        <Text style={styles.cardBigMeta}>
          Insumos: {formatCurrency(valorInsumos)} · Embalagens: {formatCurrency(valorEmbalagens)}
        </Text>
      </View>

      <View style={styles.cardRow}>
        <View style={[styles.cardSmall, { backgroundColor: '#E8F5E9' }]}>
          <Text style={[styles.cardSmallValue, { color: colors.success }]}>{stats.ok}</Text>
          <Text style={styles.cardSmallLabel}>itens OK</Text>
        </View>
        <View style={[styles.cardSmall, { backgroundColor: '#FFF4E5' }]}>
          <Text style={[styles.cardSmallValue, { color: colors.warning }]}>{stats.baixo}</Text>
          <Text style={styles.cardSmallLabel}>baixo</Text>
        </View>
        <View style={[styles.cardSmall, { backgroundColor: '#FDECEC' }]}>
          <Text style={[styles.cardSmallValue, { color: colors.error }]}>{stats.zerado}</Text>
          <Text style={styles.cardSmallLabel}>zerado</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Composição</Text>
      <View style={styles.cardSimple}>
        <Text style={styles.composItem}>
          {insumos.length} insumos · {embalagens.length} embalagens
        </Text>
        <Text style={styles.composHelp}>
          Toque em "Entrada" no canto inferior para registrar um recebimento — o custo médio é recalculado automaticamente.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: {
    flexDirection: 'row', backgroundColor: colors.surface,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  tab: {
    flex: 1, paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
    alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6,
    borderBottomWidth: 2, borderBottomColor: 'transparent',
  },
  tabActive: { borderBottomColor: colors.primary },
  tabLabel: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  tabLabelActive: { color: colors.primary },
  statsStrip: {
    flexDirection: 'row', backgroundColor: colors.surface,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  statItem: { flex: 1, alignItems: 'center', paddingHorizontal: spacing.xs },
  statValue: {
    fontSize: fonts.medium, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
  statLabel: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 2,
  },
  infoCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 8,
    backgroundColor: colors.primary + '0E',
    borderLeftWidth: 3, borderLeftColor: colors.primary,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginHorizontal: spacing.md, marginTop: spacing.sm,
    borderRadius: borderRadius.sm,
  },
  infoCardText: {
    flex: 1, fontSize: fonts.tiny, color: colors.text,
    fontFamily: fontFamily.regular, lineHeight: 16,
  },
  filtroRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: spacing.md, paddingTop: spacing.sm,
  },
  filtroChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 16, borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  filtroChipActive: {
    backgroundColor: colors.primary + '14', borderColor: colors.primary,
  },
  filtroChipText: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  filtroChipTextActive: { color: colors.primary },
  row: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.md, marginBottom: spacing.sm,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 2, elevation: 1,
  },
  rowTitle: {
    flex: 1, fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  rowMeta: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 2,
  },
  rowValor: {
    fontSize: fonts.tiny, color: colors.primary,
    fontFamily: fontFamily.semiBold, fontWeight: '600', marginTop: 2,
  },
  rowQtd: {
    fontSize: fonts.medium, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  chip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 12, marginLeft: spacing.sm,
  },
  chipText: {
    fontSize: fonts.tiny, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  tagTipo: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, marginLeft: 6 },
  tagTipoText: { fontSize: 10, fontFamily: fontFamily.bold, fontWeight: '700' },
  cardBig: {
    backgroundColor: colors.surface, padding: spacing.lg,
    borderRadius: borderRadius.lg, marginBottom: spacing.md,
  },
  cardBigLabel: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  cardBigValue: {
    fontSize: fonts.header, color: colors.primary,
    fontFamily: fontFamily.bold, fontWeight: '700', marginVertical: 6,
  },
  cardBigMeta: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  cardRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
  cardSmall: {
    flex: 1, padding: spacing.md, borderRadius: borderRadius.md,
    alignItems: 'center',
  },
  cardSmallValue: {
    fontSize: fonts.title, fontFamily: fontFamily.bold, fontWeight: '700',
  },
  cardSmallLabel: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 2,
  },
  sectionTitle: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
    marginTop: spacing.md, marginBottom: spacing.sm, marginLeft: spacing.xs,
  },
  cardSimple: {
    backgroundColor: colors.surface, padding: spacing.md, borderRadius: borderRadius.md,
  },
  composItem: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  composHelp: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: spacing.xs, lineHeight: 18,
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
    backgroundColor: '#FDECEC', paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small, color: colors.error,
    fontFamily: fontFamily.regular,
  },
  errorBannerBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
  },
  errorBannerBtnText: {
    color: '#fff', fontSize: fonts.tiny,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
});
