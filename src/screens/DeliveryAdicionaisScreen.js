import React, { useState, useCallback } from 'react';
import { ScrollView, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import ConfirmDeleteModal from '../components/ConfirmDeleteModal';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { getDatabase } from '../database/database';
import Card from '../components/Card';
import InputField from '../components/InputField';
import InfoTooltip from '../components/InfoTooltip';
import { colors, spacing, fonts, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';

export default function DeliveryAdicionaisScreen() {
  const isFocused = useIsFocused();
  const [adicionais, setAdicionais] = useState([]);
  const [novoAdicional, setNovoAdicional] = useState({ nome: '', custo: '', preco_cobrado: '' });
  const [confirmRemove, setConfirmRemove] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({ nome: '', custo: '', preco_cobrado: '' });

  useFocusEffect(
    useCallback(() => {
      loadData();
      return () => { setConfirmRemove(null); setEditingId(null); };
    }, [])
  );

  async function loadData() {
    const db = await getDatabase();
    const adds = await db.getAllAsync('SELECT * FROM delivery_adicionais ORDER BY nome');
    setAdicionais(adds);
  }

  function parseInputValue(text) {
    return parseFloat(text.replace(',', '.')) || 0;
  }

  async function adicionarAdicional() {
    if (!novoAdicional.nome.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'INSERT INTO delivery_adicionais (nome, custo, preco_cobrado) VALUES (?, ?, ?)',
      [novoAdicional.nome.trim(), parseInputValue(novoAdicional.custo), parseInputValue(novoAdicional.preco_cobrado)]
    );
    setNovoAdicional({ nome: '', custo: '', preco_cobrado: '' });
    loadData();
  }

  function removerAdicional(id, nome) {
    setConfirmRemove({
      id, nome,
      onConfirm: async () => {
        const db = await getDatabase();
        await db.runAsync('DELETE FROM delivery_adicionais WHERE id = ?', [id]);
        setConfirmRemove(null);
        setEditingId(null);
        loadData();
      },
    });
  }

  function iniciarEdicao(add) {
    setEditingId(add.id);
    setEditValues({
      nome: add.nome,
      custo: add.custo > 0 ? String(add.custo).replace('.', ',') : '',
      preco_cobrado: add.preco_cobrado > 0 ? String(add.preco_cobrado).replace('.', ',') : '',
    });
  }

  function cancelarEdicao() {
    setEditingId(null);
    setEditValues({ nome: '', custo: '', preco_cobrado: '' });
  }

  async function salvarEdicao() {
    if (!editValues.nome.trim()) return;
    const db = await getDatabase();
    await db.runAsync(
      'UPDATE delivery_adicionais SET nome = ?, custo = ?, preco_cobrado = ? WHERE id = ?',
      [editValues.nome.trim(), parseInputValue(editValues.custo), parseInputValue(editValues.preco_cobrado), editingId]
    );
    setEditingId(null);
    setEditValues({ nome: '', custo: '', preco_cobrado: '' });
    loadData();
  }

  return (
    <>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
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
            <View style={styles.emptyState}>
              <Text style={styles.emptyIcon}>🧂</Text>
              <Text style={styles.emptyTitle}>Nenhum adicional cadastrado</Text>
              <Text style={styles.emptyDesc}>
                Cadastre itens extras como sachês, molhos e talheres que acompanham seus pedidos delivery.
              </Text>
            </View>
          ) : (
            adicionais.map((add) => {
              const isEditing = editingId === add.id;
              const lucro = add.preco_cobrado - add.custo;
              const margem = add.preco_cobrado > 0 ? (lucro / add.preco_cobrado) * 100 : 0;

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
                      <Text style={styles.itemMetaText}>Custo: {formatCurrency(add.custo)}</Text>
                      <Text style={styles.itemMetaSep}> · </Text>
                      <Text style={styles.itemMetaText}>Preço: {formatCurrency(add.preco_cobrado)}</Text>
                    </View>
                  </View>
                  <View style={styles.itemRight}>
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
              <TouchableOpacity style={styles.addBtn} onPress={adicionarAdicional}>
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
