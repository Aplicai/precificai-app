/**
 * PrecosPlataformaScreen — Sessão 28.19
 *
 * Lista TODOS os produtos do usuário e permite cadastrar o "preço DE VENDA"
 * que ele cobra hoje em uma plataforma específica. Persistido em
 * `produto_preco_delivery` (tabela criada na rodada 2 / D-22).
 *
 * Abre ao tocar em "Cadastrar preços de venda dos produtos" dentro da expansão
 * de cada plataforma na aba Plataformas.
 *
 * Use case: usuária quer comparar o que ela JÁ COBRA no iFood vs o que o
 * sistema sugere (Visão Geral / Lote já mostra ambos lado a lado).
 */
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, normalizeSearch } from '../utils/calculations';

const safe = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export default function PrecosPlataformaScreen({ route, navigation }) {
  const plataformaId = route?.params?.plataformaId;
  const plataformaNome = route?.params?.plataformaNome || 'Plataforma';

  const [loading, setLoading] = useState(true);
  const [produtos, setProdutos] = useState([]);
  const [precos, setPrecos] = useState({}); // { produtoId: precoDelivery }
  const [busca, setBusca] = useState('');
  const [savingId, setSavingId] = useState(null);
  const saveTimers = useRef({});

  useFocusEffect(useCallback(() => { carregar(); }, [plataformaId]));

  async function carregar() {
    if (!plataformaId) return;
    setLoading(true);
    try {
      const db = await getDatabase();
      const [prods, ppds] = await Promise.all([
        db.getAllAsync('SELECT id, nome, preco_venda FROM produtos ORDER BY nome'),
        db.getAllAsync('SELECT produto_id, preco_venda FROM produto_preco_delivery WHERE plataforma_id = ?', [plataformaId])
          .catch(() => []),
      ]);
      setProdutos(prods || []);
      const map = {};
      (ppds || []).forEach(r => { map[r.produto_id] = String(safe(r.preco_venda).toFixed(2)).replace('.', ','); });
      setPrecos(map);
    } catch (e) {
      console.error('[PrecosPlataforma.carregar]', e);
    } finally {
      setLoading(false);
    }
  }

  async function salvarPreco(produtoId, valor) {
    setSavingId(produtoId);
    const num = parseFloat(String(valor).replace(',', '.'));
    try {
      const db = await getDatabase();
      if (Number.isFinite(num) && num > 0) {
        // Upsert: tenta UPDATE primeiro, se 0 rows, INSERT
        const res = await db.runAsync(
          'UPDATE produto_preco_delivery SET preco_venda = ?, updated_at = NOW() WHERE produto_id = ? AND plataforma_id = ?',
          [num, produtoId, plataformaId]
        );
        if (!res?.changes) {
          await db.runAsync(
            'INSERT INTO produto_preco_delivery (produto_id, plataforma_id, preco_venda) VALUES (?,?,?)',
            [produtoId, plataformaId, num]
          );
        }
      } else {
        // Apaga se valor zerado/inválido
        await db.runAsync('DELETE FROM produto_preco_delivery WHERE produto_id = ? AND plataforma_id = ?', [produtoId, plataformaId]);
      }
    } catch (e) {
      if (typeof console !== 'undefined') console.warn('[PrecosPlataforma.salvarPreco]', e?.message || e);
    } finally {
      setTimeout(() => setSavingId((x) => (x === produtoId ? null : x)), 600);
    }
  }

  function handleChange(produtoId, valor) {
    setPrecos(prev => ({ ...prev, [produtoId]: valor }));
    if (saveTimers.current[produtoId]) clearTimeout(saveTimers.current[produtoId]);
    saveTimers.current[produtoId] = setTimeout(() => salvarPreco(produtoId, valor), 800);
  }

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator color={colors.primary} size="large" />
      </View>
    );
  }

  const termo = normalizeSearch(busca);
  const filtrados = !termo ? produtos : produtos.filter(p => normalizeSearch(p.nome).includes(termo));

  return (
    <View style={styles.container}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Preços de venda — {plataformaNome}</Text>
          <Text style={styles.subtitle}>
            Quanto você cobra HOJE de cada produto nesta plataforma. A Visão Geral usa esse valor pra comparar com o sugerido. Salvo automaticamente.
          </Text>
        </View>

        <View style={styles.searchBox}>
          <Feather name="search" size={14} color={colors.textSecondary} style={{ marginRight: 6 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar produto..."
            placeholderTextColor={colors.disabled}
            value={busca}
            onChangeText={setBusca}
          />
        </View>

        {produtos.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="package" size={32} color={colors.disabled} />
            <Text style={styles.emptyTitle}>Sem produtos cadastrados</Text>
            <Text style={styles.emptyDesc}>
              Cadastre produtos primeiro pra definir os preços de venda em cada plataforma.
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            <View style={styles.listHeader}>
              <Text style={[styles.listHeaderText, { flex: 2 }]}>Produto</Text>
              <Text style={[styles.listHeaderText, { flex: 1, textAlign: 'right' }]}>Preço balcão</Text>
              <Text style={[styles.listHeaderText, { flex: 1.2, textAlign: 'right' }]}>Cobro nesta plat.</Text>
            </View>
            {filtrados.map(p => (
              <View key={p.id} style={styles.row}>
                <Text style={[styles.cell, { flex: 2 }]} numberOfLines={2}>{p.nome}</Text>
                <Text style={[styles.cellMuted, { flex: 1, textAlign: 'right' }]}>
                  {formatCurrency(safe(p.preco_venda))}
                </Text>
                <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Text style={{ fontSize: fonts.small, color: colors.text }}>R$</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0,00"
                    placeholderTextColor={colors.disabled}
                    keyboardType="numeric"
                    value={precos[p.id] || ''}
                    onChangeText={(v) => handleChange(p.id, v)}
                  />
                  {savingId === p.id && (
                    <ActivityIndicator size="small" color={colors.success} />
                  )}
                </View>
              </View>
            ))}
            {filtrados.length === 0 && (
              <Text style={{ padding: spacing.md, textAlign: 'center', color: colors.textSecondary }}>
                Nenhum produto bate com a busca.
              </Text>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, maxWidth: 720, alignSelf: 'center', width: '100%' },
  header: { marginBottom: spacing.md },
  title: { fontSize: fonts.large, fontFamily: fontFamily.bold, color: colors.text, marginBottom: 4 },
  subtitle: { fontSize: fonts.small, color: colors.textSecondary, lineHeight: 18 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface, paddingHorizontal: spacing.sm, paddingVertical: 8,
    borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    marginBottom: spacing.md,
  },
  searchInput: { flex: 1, fontSize: fonts.regular, color: colors.text },
  empty: { alignItems: 'center', padding: spacing.lg, backgroundColor: colors.surface, borderRadius: borderRadius.md },
  emptyTitle: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text, marginTop: 8 },
  emptyDesc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', marginTop: 4 },
  list: { backgroundColor: colors.surface, borderRadius: borderRadius.md, overflow: 'hidden' },
  listHeader: {
    flexDirection: 'row', padding: spacing.sm, paddingHorizontal: spacing.md,
    backgroundColor: colors.background, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  listHeaderText: { fontSize: fonts.tiny, fontFamily: fontFamily.bold, color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: {
    flexDirection: 'row', alignItems: 'center', padding: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border, gap: 8,
  },
  cell: { fontSize: fonts.small, color: colors.text },
  cellMuted: { fontSize: fonts.small, color: colors.textSecondary },
  input: {
    flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm,
    paddingHorizontal: 8, paddingVertical: 6, fontSize: fonts.regular, color: colors.text,
    backgroundColor: '#fff', textAlign: 'right',
  },
});
