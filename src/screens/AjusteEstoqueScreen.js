/**
 * AjusteEstoqueScreen (M1-12)
 *
 * Ajuste manual de saldo (perda, contagem de inventário, correção). Sempre
 * exige motivo. Pode ser positivo (igual entrada, mas tipado como 'ajuste')
 * ou negativo (saída sem venda associada).
 *
 * Para ajustes positivos com custo conhecido, prefira usar EntradaEstoqueScreen
 * — esta tela é para correções "rápidas" sem alterar custo médio.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { getDatabase } from '../database/database';
import { baixarEstoque, registrarEntrada } from '../services/estoque';
import PickerSelect from '../components/PickerSelect';
import ModalFormWrapper from '../components/ModalFormWrapper';

function parseNum(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function AjusteEstoqueScreen({ navigation }) {
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [insumos, setInsumos] = useState([]);
  const [embalagens, setEmbalagens] = useState([]);
  const [tipo, setTipo] = useState('materia_prima');
  const [itemId, setItemId] = useState(null);
  const [direcao, setDirecao] = useState('saida'); // 'entrada' | 'saida'
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loadError, setLoadError] = useState(null);

  const carregar = useCallback(async () => {
    setLoadError(null);
    try {
      const db = await getDatabase();
      const mps = await db.getAllAsync('SELECT id, nome, unidade_medida, quantidade_estoque, custo_medio FROM materias_primas ORDER BY nome');
      const embs = await db.getAllAsync('SELECT id, nome, quantidade_estoque, custo_medio FROM embalagens ORDER BY nome');
      setInsumos(mps);
      setEmbalagens(embs);
    } catch (e) {
      console.error('[AjusteEstoque.carregar]', e);
      setLoadError(e?.message || 'Não foi possível carregar a lista de itens.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const opcoesItens = (tipo === 'materia_prima' ? insumos : embalagens).map((i) => ({
    value: i.id,
    label: `${i.nome}  (saldo ${Number(i.quantidade_estoque || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })})`,
  }));
  const itemSelecionado = (tipo === 'materia_prima' ? insumos : embalagens).find((i) => i.id === itemId);
  const unidade = tipo === 'embalagem' ? 'un' : (itemSelecionado?.unidade_medida || 'un');

  const qtdNum = parseNum(quantidade);
  const motivoOk = motivo.trim().length >= 3;
  const podeSalvar = itemId && qtdNum && qtdNum > 0 && motivoOk && !salvando;

  // Pré-cálculo do saldo resultante (mostra ao usuário antes de confirmar)
  const saldoAtual = Number(itemSelecionado?.quantidade_estoque) || 0;
  const delta = (qtdNum || 0) * (direcao === 'saida' ? -1 : 1);
  const saldoNovo = saldoAtual + delta;
  const saldoNegativo = direcao === 'saida' && qtdNum && saldoNovo < 0;

  function confirmar(msg, onYes) {
    if (Platform.OS === 'web') {
      try {
        if (window.confirm(msg)) onYes();
      } catch { onYes(); }
    } else {
      Alert.alert('Confirmar ajuste', msg, [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Confirmar', onPress: onYes },
      ]);
    }
  }

  function pedirConfirmacao() {
    if (!podeSalvar) return;
    const fmt = (n) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const verbo = direcao === 'saida' ? 'reduzir' : 'aumentar';
    const aviso = saldoNegativo
      ? `\n\n⚠ ATENÇÃO: o saldo final ficará NEGATIVO (${fmt(saldoNovo)} ${unidade}). Continuar mesmo assim?`
      : '';
    confirmar(
      `Vamos ${verbo} ${fmt(qtdNum)} ${unidade} de "${itemSelecionado?.nome}".\n\nSaldo atual: ${fmt(saldoAtual)} ${unidade}\nSaldo novo:  ${fmt(saldoNovo)} ${unidade}${aviso}`,
      salvar,
    );
  }

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      if (direcao === 'saida') {
        await baixarEstoque({
          entidadeTipo: tipo,
          entidadeId: itemId,
          quantidade: qtdNum,
          motivo: motivo.trim(),
          origemTipo: 'ajuste',
        });
      } else {
        // entrada via ajuste mantém custo médio atual
        const custoAtual = Number(itemSelecionado?.custo_medio) || 0;
        await registrarEntrada({
          entidadeTipo: tipo,
          entidadeId: itemId,
          quantidade: qtdNum,
          custoUnitario: custoAtual,
          motivo: `[Ajuste] ${motivo.trim()}`,
          origemTipo: 'ajuste',
        });
      }
      setSalvando(false);
      if (Platform.OS === 'web') {
        try { window.alert('Ajuste registrado. Saldo atualizado.'); } catch {}
      }
      navigation.goBack();
    } catch (e) {
      console.error('[AjusteEstoque.salvar]', e);
      setSalvando(false);
      const msg = e?.message || 'Tente novamente.';
      if (Platform.OS === 'web') {
        try { window.alert('Erro ao registrar: ' + msg); } catch {}
      } else {
        Alert.alert('Erro ao registrar', msg);
      }
    }
  }

  if (carregando) {
    return (
      <ModalFormWrapper title="Ajuste de Estoque" onClose={() => navigation.goBack()}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ModalFormWrapper>
    );
  }

  return (
    <ModalFormWrapper title="Ajuste de Estoque" onClose={() => navigation.goBack()}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content}>
        {loadError && (
          <View style={styles.errorBanner}>
            <Feather name="alert-triangle" size={16} color={colors.error} style={{ marginRight: 8 }} />
            <Text style={styles.errorBannerText}>{loadError}</Text>
            <TouchableOpacity onPress={carregar} style={styles.errorBannerBtn} activeOpacity={0.7}>
              <Text style={styles.errorBannerBtnText}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        )}
        <Text style={styles.label}>Tipo de item</Text>
        <View style={styles.toggle}>
          {[
            { v: 'materia_prima', l: 'Insumo' },
            { v: 'embalagem', l: 'Embalagem' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.v}
              style={[styles.toggleOpt, tipo === opt.v && styles.toggleOptActive]}
              onPress={() => { setTipo(opt.v); setItemId(null); }}
              activeOpacity={0.7}
            >
              <Text style={[styles.toggleText, tipo === opt.v && styles.toggleTextActive]}>{opt.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <PickerSelect
          label="Item"
          value={itemId}
          options={opcoesItens}
          onValueChange={setItemId}
          placeholder={`Escolha ${tipo === 'embalagem' ? 'uma embalagem' : 'um insumo'}…`}
        />

        <Text style={styles.label}>Direção do ajuste</Text>
        <View style={styles.toggle}>
          {[
            { v: 'saida', l: 'Reduzir saldo', icon: 'arrow-down' },
            { v: 'entrada', l: 'Aumentar saldo', icon: 'arrow-up' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.v}
              style={[styles.toggleOpt, direcao === opt.v && styles.toggleOptActive]}
              onPress={() => setDirecao(opt.v)}
              activeOpacity={0.7}
            >
              <Feather name={opt.icon} size={14} color={direcao === opt.v ? colors.primary : colors.textSecondary} />
              <Text style={[styles.toggleText, direcao === opt.v && styles.toggleTextActive, { marginLeft: 4 }]}>{opt.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.label}>Quantidade ({unidade})</Text>
        <TextInput
          style={styles.input}
          value={quantidade}
          onChangeText={setQuantidade}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.disabled}
        />

        <Text style={styles.label}>Motivo *</Text>
        <TextInput
          style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
          value={motivo}
          onChangeText={setMotivo}
          placeholder='Obrigatório. Ex.: "perda no preparo", "inventário 22/04"'
          placeholderTextColor={colors.disabled}
          multiline
          numberOfLines={3}
          maxLength={200}
        />
        {motivo.length > 0 && !motivoOk && (
          <Text style={styles.errText}>Mínimo 3 caracteres.</Text>
        )}

        {qtdNum > 0 && itemSelecionado && (
          <View style={[styles.previewCard, saldoNegativo && styles.previewCardWarn]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Feather
                name={saldoNegativo ? 'alert-triangle' : 'arrow-right-circle'}
                size={14}
                color={saldoNegativo ? colors.error : colors.primary}
              />
              <Text style={[styles.previewLabel, saldoNegativo && { color: colors.error }]}>
                {saldoNegativo ? 'Saldo ficará negativo' : 'Saldo após o ajuste'}
              </Text>
            </View>
            <Text style={[styles.previewValue, saldoNegativo && { color: colors.error }]}>
              {Number(saldoAtual).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} → {Number(saldoNovo).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {unidade}
            </Text>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btnPrimary, !podeSalvar && styles.btnDisabled]}
          onPress={pedirConfirmacao}
          disabled={!podeSalvar}
          activeOpacity={0.8}
        >
          {salvando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Registrar ajuste</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.helpText}>
          Ajustes ficam registrados no histórico com seu motivo. Use para perdas,
          inventário ou correções de saldo.
        </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </ModalFormWrapper>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  loadingContainer: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  content: { padding: spacing.md, paddingBottom: 60 },
  label: {
    fontSize: fonts.small, color: colors.text,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
    marginBottom: spacing.xs, marginTop: spacing.md,
  },
  input: {
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm + 2,
    fontSize: fonts.regular, color: colors.text,
    borderWidth: 1, borderColor: colors.border,
    fontFamily: fontFamily.regular,
  },
  toggle: {
    flexDirection: 'row', backgroundColor: colors.inputBg,
    borderRadius: borderRadius.md, padding: 4,
  },
  toggleOpt: {
    flex: 1, paddingVertical: spacing.sm + 2, alignItems: 'center',
    borderRadius: borderRadius.sm, flexDirection: 'row', justifyContent: 'center',
  },
  toggleOptActive: {
    backgroundColor: colors.surface,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08, shadowRadius: 2, elevation: 1,
  },
  toggleText: {
    fontSize: fonts.small, color: colors.textSecondary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  toggleTextActive: { color: colors.primary },
  errText: {
    fontSize: fonts.tiny, color: colors.error,
    fontFamily: fontFamily.regular, marginTop: 4,
  },
  btnPrimary: {
    backgroundColor: colors.primary,
    borderRadius: borderRadius.md,
    paddingVertical: spacing.md,
    alignItems: 'center', justifyContent: 'center',
    flexDirection: 'row', gap: 8,
    marginTop: spacing.lg,
  },
  btnDisabled: { opacity: 0.4 },
  btnPrimaryText: {
    color: '#fff', fontSize: fonts.regular,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
  helpText: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginTop: spacing.md, lineHeight: 16, textAlign: 'center',
  },
  previewCard: {
    backgroundColor: colors.primary + '10',
    padding: spacing.md, borderRadius: borderRadius.md,
    marginTop: spacing.md, gap: 4,
  },
  previewCardWarn: {
    backgroundColor: '#fee2e2',
    borderLeftWidth: 3, borderLeftColor: colors.error,
  },
  previewLabel: {
    fontSize: fonts.small, color: colors.primary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  previewValue: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
  errorBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fee2e2',
    borderLeftWidth: 3, borderLeftColor: colors.error,
    padding: spacing.sm, borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorBannerText: {
    flex: 1, fontSize: fonts.small, color: colors.error,
    fontFamily: fontFamily.regular,
  },
  errorBannerBtn: {
    paddingHorizontal: spacing.sm, paddingVertical: 4,
    backgroundColor: colors.error, borderRadius: borderRadius.sm,
    marginLeft: 8,
  },
  errorBannerBtnText: {
    fontSize: fonts.tiny, color: '#fff',
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
});
