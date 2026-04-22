/**
 * EstoqueHubScreen (M1-10/11/12)
 *
 * Hub central de estoque, com 3 tabs:
 *  - Saldos: lista insumos+embalagens com chip OK/Baixo/Zerado e custo médio.
 *  - Movimentos: histórico de entradas/saídas/ajustes.
 *  - Inventário: visão consolidada (valor total em estoque).
 *
 * Pode ser aberto como rota raiz pela Sidebar/MaisScreen ou via FAB do Home
 * (banner "Você tem N itens com estoque baixo").
 */
import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Platform,
  RefreshControl, ActivityIndicator, FlatList,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { getDatabase } from '../database/database';
import { supabase } from '../config/supabase';
import { listarSaldosConsolidados, statusEstoque } from '../services/estoque';
import { formatCurrency } from '../utils/calculations';
import { formatTimeAgo } from '../utils/timeAgo';
import EmptyState from '../components/EmptyState';
import Skeleton from '../components/Skeleton';
import FAB from '../components/FAB';
import SearchBar from '../components/SearchBar';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

const TABS = [
  { key: 'saldos', label: 'Saldos', icon: 'package' },
  { key: 'movimentos', label: 'Movimentos', icon: 'list' },
  { key: 'inventario', label: 'Inventário', icon: 'pie-chart' },
];

const STATUS_STYLE = {
  ok:      { label: 'OK',      bg: '#E8F5E9', fg: colors.success },
  baixo:   { label: 'Baixo',   bg: '#FFF4E5', fg: colors.warning },
  zerado:  { label: 'Zerado',  bg: '#FDECEC', fg: colors.error },
};

function StatusChip({ status }) {
  const s = STATUS_STYLE[status] || STATUS_STYLE.ok;
  return (
    <View style={[styles.chip, { backgroundColor: s.bg }]}>
      <Text style={[styles.chipText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

export default function EstoqueHubScreen({ navigation }) {
  const { isDesktop } = useResponsiveLayout();
  const [tab, setTab] = useState('saldos');
  const [busca, setBusca] = useState('');
  const [saldos, setSaldos] = useState([]);
  const [movimentos, setMovimentos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const carregar = useCallback(async () => {
    try {
      const db = await getDatabase();
      const items = await listarSaldosConsolidados(db);
      setSaldos(items);

      // Movimentos vêm direto do Supabase (RLS garante user-scoped)
      const { data: movs, error } = await supabase
        .from('estoque_movimentos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (!error && Array.isArray(movs)) setMovimentos(movs);
    } catch (e) {
      // silencioso — telas vazias mostram EmptyState
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

      {/* Stats strip */}
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
          refreshing={refreshing} onRefresh={onRefresh}
        />
      )}
      {tab === 'movimentos' && (
        <MovimentosTab
          loading={loading} items={movimentos}
          refreshing={refreshing} onRefresh={onRefresh}
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

function SaldosTab({ loading, items, busca, setBusca, refreshing, onRefresh }) {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: spacing.sm }}>
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
          renderItem={({ item }) => <SaldoRow item={item} />}
        />
      )}
    </View>
  );
}

function SaldoRow({ item }) {
  const qtd = Number(item.quantidade_estoque) || 0;
  const min = Number(item.estoque_minimo) || 0;
  const cm = Number(item.custo_medio) || 0;
  const valor = qtd * cm;
  return (
    <View style={styles.row}>
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
    </View>
  );
}

function MovimentosTab({ loading, items, refreshing, onRefresh }) {
  if (loading) {
    return (
      <View style={{ padding: spacing.md }}>
        <Skeleton height={56} style={{ marginBottom: 8 }} />
        <Skeleton height={56} style={{ marginBottom: 8 }} />
        <Skeleton height={56} />
      </View>
    );
  }
  if (!items.length) {
    return (
      <EmptyState
        icon="list"
        title="Nenhum movimento registrado"
        description="Quando você registrar uma entrada, ajuste ou venda, ela aparecerá aqui."
      />
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(m) => String(m.id)}
      contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      renderItem={({ item }) => <MovimentoRow mov={item} />}
    />
  );
}

function MovimentoRow({ mov }) {
  const isEntrada = mov.tipo === 'entrada';
  const isSaida = mov.tipo === 'saida';
  const color = isEntrada ? colors.success : isSaida ? colors.error : colors.warning;
  const icon = isEntrada ? 'arrow-down-circle' : isSaida ? 'arrow-up-circle' : 'edit-3';
  const sinal = isSaida ? '-' : isEntrada ? '+' : '±';
  const qtd = Number(mov.quantidade) || 0;
  return (
    <View style={styles.row}>
      <Feather name={icon} size={22} color={color} style={{ marginRight: spacing.sm }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {mov.motivo || (isEntrada ? 'Recebimento' : isSaida ? 'Saída' : 'Ajuste')}
        </Text>
        <Text style={styles.rowMeta}>
          {mov.entidade_tipo === 'embalagem' ? 'Embalagem' : 'Insumo'} #{mov.entidade_id} · {formatTimeAgo(mov.created_at)}
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
  // Agrupa por tipo
  const insumos = items.filter((i) => i._tipo === 'materia_prima');
  const embalagens = items.filter((i) => i._tipo === 'embalagem');
  const valorInsumos = insumos.reduce((s, i) => s + (Number(i.quantidade_estoque) || 0) * (Number(i.custo_medio) || 0), 0);
  const valorEmbalagens = embalagens.reduce((s, i) => s + (Number(i.quantidade_estoque) || 0) * (Number(i.custo_medio) || 0), 0);

  return (
    <ScrollView
      contentContainerStyle={{ padding: spacing.md, paddingBottom: 100 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
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
          Toque em "Entrada" no canto inferior para registrar um recebimento e atualizar o custo médio ponderado.
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
});
