/**
 * EntradaEstoqueScreen (M1-10)
 *
 * Formulário para registrar uma entrada de estoque (recebimento de fornecedor,
 * compra spot, ajuste positivo). Atualiza saldo + custo médio ponderado
 * atomicamente via RPC `registrar_entrada_estoque`.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, Platform, KeyboardAvoidingView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { getDatabase } from '../database/database';
import { registrarEntrada } from '../services/estoque';
import { formatCurrency } from '../utils/calculations';
import PickerSelect from '../components/PickerSelect';
import EmptyState from '../components/EmptyState';
import ModalFormWrapper from '../components/ModalFormWrapper';

function parseNum(s) {
  if (s === null || s === undefined || s === '') return null;
  const n = Number(String(s).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export default function EntradaEstoqueScreen({ navigation, route }) {
  const presetTipo = route?.params?.entidadeTipo;
  const presetId = route?.params?.entidadeId;
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [insumos, setInsumos] = useState([]);
  const [embalagens, setEmbalagens] = useState([]);
  const [tipo, setTipo] = useState(presetTipo || 'materia_prima');
  const [itemId, setItemId] = useState(presetId || null);
  const [quantidade, setQuantidade] = useState('');
  const [custoUnitario, setCustoUnitario] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loadError, setLoadError] = useState(null);

  const carregar = useCallback(async () => {
    setLoadError(null);
    try {
      const db = await getDatabase();
      const mps = await db.getAllAsync('SELECT id, nome, marca, unidade_medida, custo_medio FROM materias_primas ORDER BY nome');
      const embs = await db.getAllAsync('SELECT id, nome, custo_medio FROM embalagens ORDER BY nome');
      setInsumos(mps);
      setEmbalagens(embs);
    } catch (e) {
      console.error('[EntradaEstoque.carregar]', e);
      setLoadError(e?.message || 'Não foi possível carregar a lista de itens.');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const opcoesItens = (tipo === 'materia_prima' ? insumos : embalagens).map((i) => ({
    value: i.id,
    // Sessão 25: marca incluída no label do picker para diferenciar SKUs
    // (ex.: dois "Açúcar Refinado" de marcas distintas).
    label: i.marca ? `${i.nome} — ${i.marca}` : i.nome,
  }));
  const itemSelecionado = (tipo === 'materia_prima' ? insumos : embalagens).find((i) => i.id === itemId);
  const unidade = tipo === 'embalagem' ? 'un' : (itemSelecionado?.unidade_medida || 'un');

  const qtdNum = parseNum(quantidade);
  const custoNum = parseNum(custoUnitario);
  const valorTotal = (qtdNum || 0) * (custoNum || 0);

  // Custo > 0: entrada (recebimento) sem custo positivo contaminaria o
  // custo médio ponderado. Para zerar custo use a tela de Ajuste.
  const podeSalvar = itemId && qtdNum && qtdNum > 0 && custoNum !== null && custoNum > 0 && !salvando;

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      await registrarEntrada({
        entidadeTipo: tipo,
        entidadeId: itemId,
        quantidade: qtdNum,
        custoUnitario: custoNum,
        motivo: motivo.trim() || null,
        origemTipo: 'recebimento',
      });
      // Web: Alert.alert com botão+onPress NÃO dispara o callback de forma
      // confiável → a tela ficava travada sem voltar. Em todas plataformas,
      // voltamos imediatamente; a tela de Insumos mostrará o saldo atualizado.
      setSalvando(false);
      if (Platform.OS === 'web') {
        // window.alert é síncrono no web → garante feedback antes de voltar
        try { window.alert('Entrada registrada com sucesso. Saldo e custo médio atualizados.'); } catch {}
      }
      navigation.goBack();
    } catch (e) {
      console.error('[EntradaEstoque.salvar]', e);
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
      <ModalFormWrapper title="Entrada de Estoque" onClose={() => navigation.goBack()}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ModalFormWrapper>
    );
  }

  if (insumos.length === 0 && embalagens.length === 0) {
    return (
      <ModalFormWrapper title="Entrada de Estoque" onClose={() => navigation.goBack()}>
        <EmptyState
          icon="package"
          title="Nenhum item cadastrado"
          description="Cadastre insumos ou embalagens primeiro para registrar uma entrada."
        />
      </ModalFormWrapper>
    );
  }

  // Validações específicas (mensagens explícitas em vez de só desabilitar botão)
  const qtdInvalida = quantidade !== '' && (qtdNum === null || qtdNum <= 0);
  const custoInvalido = custoUnitario !== '' && (custoNum === null || custoNum <= 0);

  return (
    <ModalFormWrapper title="Entrada de Estoque" onClose={() => navigation.goBack()}>
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

        {itemSelecionado && Number(itemSelecionado.custo_medio) > 0 && (
          <View style={styles.infoBox}>
            <Feather name="info" size={14} color={colors.info} />
            <Text style={styles.infoText}>
              Custo médio atual: {formatCurrency(Number(itemSelecionado.custo_medio))}/{unidade}
            </Text>
          </View>
        )}

        <Text style={styles.label}>Quantidade recebida ({unidade})</Text>
        <TextInput
          style={[styles.input, qtdInvalida && styles.inputError]}
          value={quantidade}
          onChangeText={setQuantidade}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.disabled}
        />
        {qtdInvalida && (
          <Text style={styles.fieldError}>Informe uma quantidade maior que zero.</Text>
        )}

        <Text style={styles.label}>Custo unitário (R$ / {unidade})</Text>
        <TextInput
          style={[styles.input, custoInvalido && styles.inputError]}
          value={custoUnitario}
          onChangeText={setCustoUnitario}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.disabled}
        />
        {custoInvalido && (
          <Text style={styles.fieldError}>Custo deve ser maior que zero. Para zerar custo use Ajuste de estoque.</Text>
        )}

        {valorTotal > 0 && (
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Valor da entrada</Text>
            <Text style={styles.totalValue}>{formatCurrency(valorTotal)}</Text>
          </View>
        )}

        <Text style={styles.label}>Motivo (opcional)</Text>
        <TextInput
          style={styles.input}
          value={motivo}
          onChangeText={setMotivo}
          placeholder='Ex.: "NF 1234", "Compra no atacado"'
          placeholderTextColor={colors.disabled}
          maxLength={200}
        />

        <TouchableOpacity
          style={[styles.btnPrimary, !podeSalvar && styles.btnDisabled]}
          onPress={salvar}
          disabled={!podeSalvar}
          activeOpacity={0.8}
        >
          {salvando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Feather name="check" size={18} color="#fff" />
              <Text style={styles.btnPrimaryText}>Registrar entrada</Text>
            </>
          )}
        </TouchableOpacity>

        <Text style={styles.helpText}>
          O sistema atualiza saldo + custo médio ponderado automaticamente. Cada entrada gera um movimento auditável no histórico.
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
    borderRadius: borderRadius.sm,
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
  infoBox: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, paddingHorizontal: spacing.sm,
  },
  infoText: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular,
  },
  totalCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: colors.primary + '10',
    padding: spacing.md, borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  totalLabel: {
    fontSize: fonts.small, color: colors.primary,
    fontFamily: fontFamily.semiBold, fontWeight: '600',
  },
  totalValue: {
    fontSize: fonts.large, color: colors.primary,
    fontFamily: fontFamily.bold, fontWeight: '700',
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
  inputError: { borderColor: colors.error },
  fieldError: {
    fontSize: fonts.tiny, color: colors.error,
    fontFamily: fontFamily.regular,
    marginTop: 4,
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
