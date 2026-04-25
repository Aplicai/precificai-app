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

export default function AjusteEstoqueScreen({ navigation, route }) {
  // Sessão 25: pré-seleção via params (clique no card de Insumo deve
  // abrir o modal já com o insumo escolhido — antes obrigava o usuário a
  // selecionar de novo).
  const presetTipo = route?.params?.entidadeTipo;
  const presetId = route?.params?.entidadeId;
  const returnTo = route?.params?.returnTo;

  // Sessão 27 — respeita returnTo. Sem ele, goBack() pode levar pra tela errada
  // (ex: Configurações se foi de lá que o flag foi ligado).
  function voltar() {
    if (returnTo?.tab) {
      try {
        navigation.navigate(returnTo.tab, returnTo.screen ? { screen: returnTo.screen } : undefined);
        return;
      } catch (_) { /* fallback abaixo */ }
    }
    navigation.goBack();
  }

  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [insumos, setInsumos] = useState([]);
  const [embalagens, setEmbalagens] = useState([]);
  const [tipo, setTipo] = useState(presetTipo || 'materia_prima');
  const [itemId, setItemId] = useState(presetId || null);
  // Sprint 4 F2 — default 'saldo' (modo absoluto). Contagem física é o caso
  // mais comum: padeiro conta 5kg, digita 5. Antes forçava matemática mental
  // (sistema 7kg, contou 5kg → digitar -2). Agora delta é calculado p/ ele.
  const [modo, setModo] = useState('saldo'); // 'saldo' | 'diferenca'
  const [direcao, setDirecao] = useState('saida'); // só usado em modo='diferenca'
  const [quantidade, setQuantidade] = useState('');
  const [motivo, setMotivo] = useState('');
  const [loadError, setLoadError] = useState(null);

  const carregar = useCallback(async () => {
    setLoadError(null);
    try {
      const db = await getDatabase();
      const mps = await db.getAllAsync('SELECT id, nome, marca, unidade_medida, quantidade_estoque, custo_medio FROM materias_primas ORDER BY nome');
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
    // Sessão 25: marca incluída para diferenciar SKUs com nomes parecidos
    label: `${i.nome}${i.marca ? ` — ${i.marca}` : ''}  (saldo ${Number(i.quantidade_estoque || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })})`,
  }));
  const itemSelecionado = (tipo === 'materia_prima' ? insumos : embalagens).find((i) => i.id === itemId);
  const unidade = tipo === 'embalagem' ? 'un' : (itemSelecionado?.unidade_medida || 'un');

  const qtdNum = parseNum(quantidade);
  const motivoOk = motivo.trim().length >= 3;

  // Pré-cálculo do saldo resultante (mostra ao usuário antes de confirmar)
  const saldoAtual = Number(itemSelecionado?.quantidade_estoque) || 0;

  // Sprint 4 F2 — calculo unificado entre modos.
  // modo='saldo'    → qtdNum é o novo saldo absoluto; delta derivado.
  // modo='diferenca' → qtdNum é a diferença (entrada/saida); saldoNovo derivado.
  let delta, saldoNovo;
  if (modo === 'saldo') {
    saldoNovo = qtdNum != null ? qtdNum : saldoAtual;
    delta = saldoNovo - saldoAtual;
  } else {
    delta = (qtdNum || 0) * (direcao === 'saida' ? -1 : 1);
    saldoNovo = saldoAtual + delta;
  }
  const saldoNegativo = saldoNovo < 0;

  // Regra de habilitar o botão:
  // - saldo  : precisa ter qtd (saldo final) ≥ 0 e delta ≠ 0.
  // - diferença: precisa ter qtd > 0.
  const qtdValidaParaSalvar = modo === 'saldo'
    ? (qtdNum != null && qtdNum >= 0 && delta !== 0)
    : (qtdNum != null && qtdNum > 0);
  const podeSalvar = itemId && qtdValidaParaSalvar && motivoOk && !salvando;

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
    const deltaAbs = Math.abs(delta);
    const verbo = delta < 0 ? 'reduzir' : 'aumentar';
    const aviso = saldoNegativo
      ? `\n\n⚠ ATENÇÃO: o saldo final ficará NEGATIVO (${fmt(saldoNovo)} ${unidade}). Continuar mesmo assim?`
      : '';
    const resumo = modo === 'saldo'
      ? `Vamos ajustar o saldo de "${itemSelecionado?.nome}" para ${fmt(saldoNovo)} ${unidade} (${verbo} ${fmt(deltaAbs)} ${unidade}).`
      : `Vamos ${verbo} ${fmt(deltaAbs)} ${unidade} de "${itemSelecionado?.nome}".`;
    confirmar(
      `${resumo}\n\nSaldo atual: ${fmt(saldoAtual)} ${unidade}\nSaldo novo:  ${fmt(saldoNovo)} ${unidade}${aviso}`,
      salvar,
    );
  }

  async function salvar() {
    if (!podeSalvar) return;
    setSalvando(true);
    try {
      // Sprint 4 F2 — ambos modos acabam em baixar/registrar, mas o delta
      // é que define a direção. Em modo 'saldo', derivamos direção do sinal.
      const deltaAbs = Math.abs(delta);
      const ehSaida = delta < 0;
      if (ehSaida) {
        await baixarEstoque({
          entidadeTipo: tipo,
          entidadeId: itemId,
          quantidade: deltaAbs,
          motivo: motivo.trim(),
          origemTipo: 'ajuste',
        });
      } else {
        // entrada via ajuste mantém custo médio atual
        const custoAtual = Number(itemSelecionado?.custo_medio) || 0;
        await registrarEntrada({
          entidadeTipo: tipo,
          entidadeId: itemId,
          quantidade: deltaAbs,
          custoUnitario: custoAtual,
          motivo: `[Ajuste] ${motivo.trim()}`,
          origemTipo: 'ajuste',
        });
      }
      setSalvando(false);
      if (Platform.OS === 'web') {
        try { window.alert('Ajuste registrado. Saldo atualizado.'); } catch {}
      }
      voltar();
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
      <ModalFormWrapper title="Ajuste de Estoque" onClose={() => voltar()}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </ModalFormWrapper>
    );
  }

  return (
    <ModalFormWrapper title="Ajuste de Estoque" onClose={() => voltar()}>
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

        {/* Sprint 4 F2 — modo 'saldo' (default) vs 'diferenca'. */}
        <Text style={styles.label}>Modo do ajuste</Text>
        <View style={styles.toggle}>
          {[
            { v: 'saldo', l: 'Saldo final', icon: 'target' },
            { v: 'diferenca', l: 'Diferença', icon: 'plus-minus' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.v}
              style={[styles.toggleOpt, modo === opt.v && styles.toggleOptActive]}
              onPress={() => { setModo(opt.v); setQuantidade(''); }}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`Modo ${opt.l}`}
            >
              <Feather name={opt.icon === 'plus-minus' ? 'repeat' : opt.icon} size={14} color={modo === opt.v ? colors.primary : colors.textSecondary} />
              <Text style={[styles.toggleText, modo === opt.v && styles.toggleTextActive, { marginLeft: 4 }]}>{opt.l}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text numberOfLines={2} style={styles.hint}>
          {modo === 'saldo'
            ? `Digite quanto tem agora. A diferença é calculada automaticamente.${itemSelecionado ? ` Saldo atual: ${Number(saldoAtual).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} ${unidade}.` : ''}`
            : 'Digite só a diferença (quanto entrou ou saiu).'}
        </Text>

        {modo === 'diferenca' && (
          <>
            <Text style={styles.label}>Direção</Text>
            <View style={styles.toggle}>
              {[
                { v: 'saida', l: 'Reduzir', icon: 'arrow-down' },
                { v: 'entrada', l: 'Aumentar', icon: 'arrow-up' },
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
          </>
        )}

        <Text style={styles.label}>
          {modo === 'saldo' ? `Saldo agora (${unidade})` : `Quantidade (${unidade})`}
        </Text>
        <TextInput
          style={styles.input}
          value={quantidade}
          onChangeText={setQuantidade}
          keyboardType="decimal-pad"
          placeholder="0,00"
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={modo === 'saldo' ? 'Saldo atual em unidades' : 'Quantidade da diferença'}
        />

        <Text style={styles.label}>Motivo *</Text>
        <TextInput
          style={[styles.input, { minHeight: 60, textAlignVertical: 'top' }]}
          value={motivo}
          onChangeText={setMotivo}
          placeholder='Ex: "perda no preparo"'
          placeholderTextColor={colors.placeholder}
          multiline
          numberOfLines={3}
          maxLength={200}
        />
        {motivo.length > 0 && !motivoOk && (
          <Text style={styles.errText}>Mínimo 3 caracteres.</Text>
        )}

        {qtdNum != null && itemSelecionado && delta !== 0 && (
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
    fontSize: 13, color: colors.textSecondary,
    fontFamily: fontFamily.semiBold, fontWeight: '500',
    marginBottom: 6, marginTop: 14,
  },
  input: {
    minHeight: 44, // Sessão Forms-Mobile — WCAG touch target 44pt mínimo
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
    fontSize: 12, color: colors.error,
    fontFamily: fontFamily.regular, marginTop: 4, flexShrink: 1,
  },
  hint: {
    fontSize: 12, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 6,
    lineHeight: 16, flexShrink: 1,
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
