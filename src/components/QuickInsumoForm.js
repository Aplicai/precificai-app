/**
 * QuickInsumoForm — Sessão 28.39
 *
 * Mini-form popup pra cadastrar insumo OU embalagem rapidamente DENTRO do
 * EntityCreateModal (cascata de popups). Só os campos essenciais — pra
 * edição completa o user vai pra MateriaPrimaForm/EmbalagemForm via tela.
 *
 * Props:
 *   visible       bool
 *   tipo          'materia_prima' | 'embalagem'
 *   onClose       () => void
 *   onSaved       (id, nome, custoUnit, unidade) => void  // callback com dados pra adicionar no draft
 */

import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Platform, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getDatabase } from '../database/database';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import {
  UNIDADES_MEDIDA, calcPrecoBase, calcCustoIngrediente, calcPrecoUnitarioEmbalagem,
} from '../utils/calculations';

function _safeNum(v) {
  if (v == null) return 0;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

export default function QuickInsumoForm({ visible, tipo, onClose, onSaved }) {
  const isInsumo = tipo === 'materia_prima';
  const [nome, setNome] = useState('');
  const [categoriaId, setCategoriaId] = useState(null);
  const [categorias, setCategorias] = useState([]);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [unidade, setUnidade] = useState(isInsumo ? 'g' : 'un');
  const [qtBruta, setQtBruta] = useState(isInsumo ? '1000' : '1');
  const [valorPago, setValorPago] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setNome('');
    setCategoriaId(null);
    setUnidade(isInsumo ? 'g' : 'un');
    setQtBruta(isInsumo ? '1000' : '1');
    setValorPago('');
    (async () => {
      try {
        const db = await getDatabase();
        const tabela = isInsumo ? 'categorias_insumos' : 'categorias_embalagens';
        const cats = await db.getAllAsync(`SELECT * FROM ${tabela} ORDER BY nome`);
        setCategorias(cats || []);
      } catch {}
    })();
  }, [visible, isInsumo]);

  async function salvar() {
    if (!nome.trim()) {
      if (Platform.OS === 'web') window.alert('Preencha o nome');
      else Alert.alert('Campo obrigatório', 'Preencha o nome');
      return;
    }
    const qb = _safeNum(qtBruta);
    const vp = _safeNum(valorPago);
    if (qb <= 0) {
      if (Platform.OS === 'web') window.alert('Quantidade inválida');
      else Alert.alert('Campo obrigatório', 'Quantidade inválida');
      return;
    }
    setSaving(true);
    try {
      const db = await getDatabase();
      let newId;
      let custoUnit;
      if (isInsumo) {
        const pb = calcPrecoBase(vp, qb, unidade);
        const result = await db.runAsync(
          'INSERT INTO materias_primas (nome, marca, categoria_id, quantidade_bruta, quantidade_liquida, fator_correcao, unidade_medida, valor_pago, preco_por_kg) VALUES (?,?,?,?,?,?,?,?,?)',
          [nome.trim(), '', categoriaId, qb, qb, 1, unidade, vp, pb]
        );
        newId = result?.lastInsertRowId;
        // Histórico inicial
        if (vp > 0 && newId) {
          try {
            await db.runAsync(
              'INSERT INTO historico_precos (materia_prima_id, valor_pago, preco_por_kg) VALUES (?,?,?)',
              [newId, vp, pb]
            );
          } catch {}
        }
        custoUnit = calcCustoIngrediente(pb, 1, unidade, unidade);
      } else {
        // Embalagem: preco_unitario = preço total / quantidade
        const precoUn = calcPrecoUnitarioEmbalagem(vp, qb);
        const result = await db.runAsync(
          'INSERT INTO embalagens (nome, marca, categoria_id, quantidade, unidade_medida, preco_embalagem, preco_unitario) VALUES (?,?,?,?,?,?,?)',
          [nome.trim(), '', categoriaId, qb, unidade, vp, precoUn]
        );
        newId = result?.lastInsertRowId;
        custoUnit = precoUn;
      }
      // Limpa cache pra outras telas verem o novo item
      try {
        const { clearQueryCache } = await import('../database/supabaseDb');
        clearQueryCache?.();
      } catch {}
      if (newId && onSaved) {
        onSaved(newId, nome.trim(), custoUnit, unidade);
      }
      onClose && onClose();
    } catch (e) {
      console.error('[QuickInsumoForm.salvar]', e);
      if (Platform.OS === 'web') window.alert('Erro ao salvar: ' + (e?.message || 'desconhecido'));
      else Alert.alert('Erro', 'Erro ao salvar: ' + (e?.message || 'desconhecido'));
    } finally {
      setSaving(false);
    }
  }

  const labelTipo = isInsumo ? 'Novo insumo' : 'Nova embalagem';
  const catLabel = categoriaId ? (categorias.find(c => c.id === categoriaId)?.nome || 'Selecionar') : 'Sem categoria';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <View style={{ backgroundColor: colors.surface, borderRadius: 16, width: '100%', maxWidth: 480, maxHeight: '92%', overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', padding: spacing.md, borderBottomWidth: 1, borderBottomColor: colors.border, gap: spacing.sm }}>
            <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary + '15', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name={isInsumo ? 'shopping-bag' : 'package'} size={16} color={colors.primary} />
            </View>
            <Text style={{ flex: 1, fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text }}>{labelTipo}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Feather name="x" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 500 }} contentContainerStyle={{ padding: spacing.md }}>
            <Text style={{ fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4 }}>Nome *</Text>
            <TextInput
              value={nome}
              onChangeText={setNome}
              placeholder={isInsumo ? 'Ex: Farinha de trigo' : 'Ex: Caixa para bolo'}
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: fonts.regular, marginBottom: spacing.sm }}
            />

            <Text style={{ fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4 }}>Categoria</Text>
            <TouchableOpacity
              onPress={() => setShowCatPicker(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, marginBottom: spacing.sm }}
            >
              <Text style={{ color: categoriaId ? colors.text : colors.textSecondary, fontSize: fonts.regular }}>{catLabel}</Text>
              <Feather name="chevron-down" size={14} color={colors.textSecondary} />
            </TouchableOpacity>

            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4 }}>{isInsumo ? 'Qtd. comprada *' : 'Qtd. no pacote *'}</Text>
                <TextInput
                  value={qtBruta}
                  onChangeText={setQtBruta}
                  keyboardType="decimal-pad"
                  style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: fonts.regular, marginBottom: spacing.sm }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4 }}>Unidade</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                  {UNIDADES_MEDIDA.map(u => (
                    <TouchableOpacity
                      key={u.value}
                      onPress={() => setUnidade(u.value)}
                      style={{
                        paddingVertical: 6, paddingHorizontal: 10, borderRadius: 6,
                        borderWidth: 1, borderColor: unidade === u.value ? colors.primary : colors.border,
                        backgroundColor: unidade === u.value ? colors.primary + '12' : 'transparent',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontFamily: fontFamily.semiBold, color: unidade === u.value ? colors.primary : colors.textSecondary }}>{u.value}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>

            <Text style={{ fontSize: fonts.tiny, fontFamily: fontFamily.medium, color: colors.textSecondary, marginBottom: 4 }}>{isInsumo ? 'Quanto pagou (R$)' : 'Preço pago (R$)'}</Text>
            <TextInput
              value={valorPago}
              onChangeText={setValorPago}
              keyboardType="decimal-pad"
              placeholder="0,00"
              style={{ borderWidth: 1, borderColor: colors.border, borderRadius: 8, padding: 10, fontSize: fonts.regular, marginBottom: spacing.md }}
            />

            <Text style={{ fontSize: fonts.tiny, color: colors.textSecondary, fontStyle: 'italic', marginBottom: spacing.sm }}>
              Dica: você pode editar mais detalhes (estoque, fornecedor, fator de perda) depois em Insumos / Embalagens.
            </Text>
          </ScrollView>

          <View style={{ flexDirection: 'row', gap: spacing.sm, padding: spacing.md, borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              onPress={onClose}
              style={{ flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
            >
              <Text style={{ color: colors.textSecondary, fontFamily: fontFamily.medium }}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={salvar}
              disabled={saving}
              style={{ flex: 2, paddingVertical: 12, borderRadius: 8, alignItems: 'center', backgroundColor: colors.primary, opacity: saving ? 0.6 : 1 }}
            >
              <Text style={{ color: '#fff', fontFamily: fontFamily.bold }}>{saving ? 'Salvando...' : 'Salvar e voltar'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Categoria picker — modal nested */}
        <Modal visible={showCatPicker} transparent animationType="fade" onRequestClose={() => setShowCatPicker(false)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}
            activeOpacity={1}
            onPress={() => setShowCatPicker(false)}
          >
            <View style={{ backgroundColor: colors.surface, borderRadius: 12, width: '90%', maxWidth: 360, maxHeight: '80%', padding: spacing.md }}>
              <Text style={{ fontSize: fonts.regular, fontFamily: fontFamily.bold, marginBottom: spacing.sm }}>Categoria</Text>
              <ScrollView style={{ maxHeight: 320 }}>
                <TouchableOpacity
                  onPress={() => { setCategoriaId(null); setShowCatPicker(false); }}
                  style={{ paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6, backgroundColor: !categoriaId ? colors.primary + '15' : 'transparent' }}
                >
                  <Text style={{ color: !categoriaId ? colors.primary : colors.text, fontFamily: !categoriaId ? fontFamily.bold : fontFamily.regular }}>Sem categoria</Text>
                </TouchableOpacity>
                {categorias.map(c => (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => { setCategoriaId(c.id); setShowCatPicker(false); }}
                    style={{ paddingVertical: 10, paddingHorizontal: 8, borderRadius: 6, backgroundColor: categoriaId === c.id ? colors.primary + '15' : 'transparent' }}
                  >
                    <Text style={{ color: categoriaId === c.id ? colors.primary : colors.text, fontFamily: categoriaId === c.id ? fontFamily.bold : fontFamily.regular }}>{c.nome}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          </TouchableOpacity>
        </Modal>
      </View>
    </Modal>
  );
}
