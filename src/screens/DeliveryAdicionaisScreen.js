import React, { useState, useCallback, useRef } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import InputField from '../components/InputField';
import InfoTooltip from '../components/InfoTooltip';
import EmptyState from '../components/EmptyState';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

// ─── Numeric helpers (audit P0) ─────────────
function safeNum(v) {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function parseInputNumber(raw) {
  if (raw === null || raw === undefined) return null;
  const str = String(raw).trim().replace(',', '.');
  if (str === '') return null;
  const n = parseFloat(str);
  return Number.isFinite(n) ? n : null;
}

export default function DeliveryAdicionaisScreen() {
  const isFocused = useIsFocused();
  const [adicionais, setAdicionais] = useState([]);
  const [novoAdicional, setNovoAdicional] = useState({ nome: '', custo: '', preco_cobrado: '' });
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ nome: '', custo: '', preco_cobrado: '' });

  // Audit P0: error states + race-guard
  const [loadError, setLoadError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const isLoadingRef = useRef(false);
  const saveErrorTimerRef = useRef(null);

  function showSaveError(msg) {
    setSaveError(msg);
    if (saveErrorTimerRef.current) clearTimeout(saveErrorTimerRef.current);
    saveErrorTimerRef.current = setTimeout(() => setSaveError(null), 4000);
  }

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => { setConfirmRemove(null); setEditingId(null); };
    }, [])
  );

  async function loadData() {
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;
    setLoadError(null);
    try {
      const db = await getDatabase();
      const adds = await db.getAllAsync('SELECT * FROM delivery_adicionais ORDER BY nome');
      setAdicionais(adds);
    } catch (e) {
      console.error('[DeliveryAdicionaisScreen.loadData]', e);
      setLoadError('Não foi possível carregar os adicionais. Tente novamente.');
    } finally {
      isLoadingRef.current = false;
    }
  }

  function parseInputValue(text) {
    const n = parseInputNumber(text);
    return n !== null && n >= 0 ? n : 0;
  }

  async function adicionarAdicional() {
    const nome = novoAdicional.nome.trim();
    if (!nome) return;
    // Audit P1: dedupe case-insensitive
    const exists = adicionais.some(a => (a.nome || '').trim().toLowerCase() === nome.toLowerCase());
    if (exists) {
      showSaveError('Já existe um adicional com esse nome.');
      return;
    }
    try {
      const db = await getDatabase();
      await db.runAsync(
        'INSERT INTO delivery_adicionais (nome, custo, preco_cobrado) VALUES (?, ?, ?)',
        [nome, parseInputValue(novoAdicional.custo), parseInputValue(novoAdicional.preco_cobrado)]
      );
      setNovoAdicional({ nome: '', custo: '', preco_cobrado: '' });
      loadData();
    } catch (e) {
      console.error('[DeliveryAdicionaisScreen.adicionarAdicional]', e);
      showSaveError('Falha ao adicionar. Tente novamente.');
    }
  }

  function removerAdicional(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        try {
          const db = await getDatabase();
          await db.runAsync('DELETE FROM delivery_adicionais WHERE id = ?', [id]);
          setConfirmRemove(null);
          setEditingId(null);
          loadData();
        } catch (e) {
          console.error('[DeliveryAdicionaisScreen.removerAdicional]', e);
          setConfirmRemove(null);
          showSaveError('Falha ao remover. Tente novamente.');
        }
      },
    });
  }

  function iniciarEdicao(add) {
    setEditingId(add.id);
    setEditValues({
      nome: add.nome,
      custo: safeNum(add.custo) > 0 ? String(add.custo).replace('.', ',') : '',
      preco_cobrado: safeNum(add.preco_cobrado) > 0 ? String(add.preco_cobrado).replace('.', ',') : '',
    });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setEditValues({ nome: '', custo: '', preco_cobrado: '' });
  }

  async function salvarEdicao() {
    if (!editValues.nome.trim()) return;
    try {
      const db = await getDatabase();
      await db.runAsync(
        'UPDATE delivery_adicionais SET nome = ?, custo = ?, preco_cobrado = ? WHERE id = ?',
        [editValues.nome.trim(), parseInputValue(editValues.custo), parseInputValue(editValues.preco_cobrado), editingId]
      );
      setEditingId(null);
      setEditValues({ nome: '', custo: '', preco_cobrado: '' });
      loadData();
    } catch (e) {
      console.error('[DeliveryAdicionaisScreen.salvarEdicao]', e);
      showSaveError('Falha ao salvar edição. Tente novamente.');
    }
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Audit P0: error banners */}
        {loadError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorBannerText}>{loadError}</Text>
            <TouchableOpacity
              onPress={loadData}
              style={styles.errorRetryBtn}
              accessibilityRole="button"
              accessibilityLabel="Tentar carregar adicionais novamente"
            >
              <Text style={styles.errorRetryText}>Tentar novamente</Text>
            </TouchableOpacity>
          </View>
        )}
        {saveError && (
          <View
            style={styles.errorBanner}
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            <Text style={styles.errorBannerText}>{saveError}</Text>
          </View>
        )}

        <Card
          title="Adicionais por Pedido"
          headerRight={
            <InfoTooltip
              title="Adicionais"
              text="Itens extras que podem ser adicionados a pedidos de delivery, como sachês, molhos, etc."
              examples={[
                'Ketchup, mostarda, maionese',
                'Sachês de sal, pimenta',
                'Talheres descartáveis',
              ]}
            />
          }
        >
          {adicionais.length === 0 ? (
            <EmptyState
              icon="package"
              title="Nenhum adicional cadastrado"
              description="Cadastre itens extras como sachês, molhos e talheres que acompanham seus pedidos delivery."
            />
          ) : (
            adicionais.map((add) => {
              const isEditing = editingId === add.id;
              const custoNum = safeNum(add.custo);
              const precoNum = safeNum(add.preco_cobrado);
              const lucro = precoNum - custoNum;
              const margem = precoNum > 0 ? (lucro / precoNum) * 100 : 0;

              if (isEditing) {
                return (
                  <View key={add.id} style={styles.editRow}>
                    <InputField
                      value={editValues.nome}
                      onChangeText={(val) => setEditValues(prev => ({ ...prev, nome: val }))}
                      placeholder="Nome"
                      style={{ marginBottom: spacing.xs }}
                    />
                    <View style={{ flexDirection: 'row', marginBottom: spacing.xs }}>
                      <InputField
                        placeholder="Custo (R$)"
                        value={editValues.custo}
                        onChangeText={(val) => setEditValues(prev => ({ ...prev, custo: val }))}
                        keyboardType="numeric"
                        style={{ flex: 1, marginRight: spacing.xs, marginBottom: 0 }}
                      />
                      <InputField
                        placeholder="Preço (R$)"
                        value={editValues.preco_cobrado}
                        onChangeText={(val) => setEditValues(prev => ({ ...prev, preco_cobrado: val }))}
                        keyboardType="numeric"
                        style={{ flex: 1, marginLeft: spacing.xs, marginBottom: 0 }}
                      />
                    </View>
                    <View style={styles.editActions}>
                      <TouchableOpacity onPress={() => removerAdicional(add.id, add.nome)} style={styles.editDeleteBtn}>
                        <Text style={styles.editDeleteText}>Remover</Text>
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row' }}>
                        <TouchableOpacity onPress={cancelarEdicao} style={styles.editCancelBtn}>
                          <Text style={styles.editCancelText}>✕</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={salvarEdicao} style={styles.editSaveBtn}>
                          <Text style={styles.editSaveText}>✓</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              }

              return (
                <TouchableOpacity
                  key={add.id}
                  style={styles.itemRow}
                  onPress={() => iniciarEdicao(add)}
                  activeOpacity={0.7}
                >
                  <View style={styles.itemMain}>
                    <Text style={styles.itemName} numberOfLines={1}>{add.nome}</Text>
                    <View style={styles.itemMeta}>
                      <Text style={styles.itemMetaText}>Custo: {formatCurrency(custoNum)}</Text>
                      <Text style={styles.itemMetaSep}> · </Text>
                      <Text style={styles.itemMetaText}>Preço: {formatCurrency(precoNum)}</Text>
                    </View>
                  </View>
                  <View
                    style={styles.itemRight}
                    accessibilityRole="text"
                    accessibilityLabel={`Lucro ${formatCurrency(lucro)}, margem ${margem.toFixed(0)} por cento`}
                  >
                    <Text style={[styles.itemLucro, { color: lucro >= 0 ? colors.success : colors.error }]}>
                      {formatCurrency(lucro)}
                    </Text>
                    <Text style={[styles.itemMargem, { color: lucro >= 0 ? colors.success : colors.error }]}>
                      {margem.toFixed(0)}%
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => removerAdicional(add.id, add.nome)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Remover adicional ${add.nome}`}
                  >
                    <Text style={styles.deleteText}>✕</Text>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })
          )}

          <View style={styles.addForm}>
            <Text style={styles.addFormTitle}>Adicionar</Text>
            <InputField
              placeholder="Nome do adicional"
              value={novoAdicional.nome}
              onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, nome: val }))}
              style={{ marginBottom: spacing.xs }}
            />
            <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
              <InputField
                placeholder="Custo (R$)"
                value={novoAdicional.custo}
                onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, custo: val }))}
                keyboardType="numeric"
                style={{ flex: 1, marginRight: spacing.xs, marginBottom: 0 }}
              />
              <InputField
                placeholder="Preço cobrado (R$)"
                value={novoAdicional.preco_cobrado}
                onChangeText={(val) => setNovoAdicional(prev => ({ ...prev, preco_cobrado: val }))}
                keyboardType="numeric"
                style={{ flex: 1, marginRight: spacing.xs, marginBottom: 0 }}
              />
              <TouchableOpacity
                style={styles.addBtn}
                onPress={adicionarAdicional}
                accessibilityRole="button"
                accessibilityLabel="Adicionar novo adicional"
              >
                <Text style={styles.addBtnText}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Card>
      </ScrollView>

      <ConfirmDeleteModal
        visible={!!confirmRemove}
        isFocused={isFocused}
        titulo="Remover Adicional"
        nome={confirmRemove?.nome}
        onConfirm={confirmRemove?.onConfirm}
        onCancel={() => setConfirmRemove(null)}
        confirmLabel="Remover"
      />
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 40 },

  // Audit P0: error banners
  errorBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#fef2f2',
    borderLeftWidth: 3, borderLeftColor: '#dc2626',
    paddingVertical: spacing.xs, paddingHorizontal: spacing.sm,
    marginBottom: spacing.sm,
    borderRadius: 4,
  },
  errorBannerText: {
    flex: 1,
    color: '#991b1b',
    fontSize: fonts.small,
    fontFamily: fontFamily.medium,
    fontWeight: '500',
  },
  errorRetryBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: '#dc2626', borderRadius: 4, marginLeft: spacing.xs,
  },
  errorRetryText: {
    color: '#fff', fontSize: fonts.tiny, fontWeight: '700',
    fontFamily: fontFamily.bold,
  },

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: spacing.xl },
  emptyIcon: { fontSize: 48, marginBottom: spacing.sm },
  emptyTitle: { fontSize: fonts.regular, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  emptyDesc: { fontSize: fonts.small, color: colors.textSecondary, textAlign: 'center', lineHeight: 20, paddingHorizontal: spacing.md },

  // List items
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  itemMain: { flex: 1 },
  itemName: { fontSize: fonts.small, fontWeight: '600', color: colors.text, marginBottom: 2 },
  itemMeta: { flexDirection: 'row', alignItems: 'center' },
  itemMetaText: { fontSize: fonts.tiny, color: colors.textSecondary },
  itemMetaSep: { fontSize: fonts.tiny, color: colors.disabled },
  itemRight: { alignItems: 'flex-end', marginRight: spacing.sm },
  itemLucro: { fontSize: fonts.small, fontWeight: '700' },
  itemMargem: { fontSize: fonts.tiny },
  deleteBtn: { padding: spacing.xs },
  deleteText: { fontSize: fonts.regular, color: colors.disabled },

  // Edit row
  editRow: { backgroundColor: '#FFFDE7', borderWidth: 1, borderColor: '#FFF176', borderRadius: borderRadius.sm, padding: spacing.sm, marginBottom: 1 },
  editActions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  editDeleteBtn: { paddingVertical: spacing.xs, paddingHorizontal: spacing.sm },
  editDeleteText: { color: colors.error, fontSize: fonts.tiny, fontWeight: '600' },
  editCancelBtn: { backgroundColor: colors.border, borderRadius: borderRadius.sm, width: 34, height: 34, justifyContent: 'center', alignItems: 'center', marginRight: spacing.xs },
  editCancelText: { color: colors.text, fontSize: fonts.regular, fontWeight: '700' },
  editSaveBtn: { backgroundColor: colors.primary, borderRadius: borderRadius.sm, width: 34, height: 34, justifyContent: 'center', alignItems: 'center' },
  editSaveText: { color: colors.textLight, fontSize: fonts.regular, fontWeight: '700' },

  // Add form
  addForm: { marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: spacing.sm },
  addFormTitle: { fontSize: fonts.small, fontWeight: '700', color: colors.text, marginBottom: spacing.xs },
  addBtn: { backgroundColor: colors.primary, width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: colors.textLight, fontSize: 22, fontWeight: '300' },
});
