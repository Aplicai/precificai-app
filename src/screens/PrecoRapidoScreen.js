/**
 * Preço rápido (primeiro acesso, 16/10/2026): o preço em ~30 s, sem cadastrar
 * ingredientes. Uma página, resultado ao vivo enquanto a pessoa digita.
 *
 * Por quê: cadastrar ingredientes, receitas e produtos antes de ver qualquer
 * resultado afugentava (1 de 34 cadastros chegou a um preço). Aqui a pessoa vê
 * o preço com os custos do mês na primeira visita; detalhar a receita fica
 * para depois ("deixe o custo exato").
 *
 * Conta: src/utils/precoRapido.js (mesma do Financeiro). Gravação:
 * src/services/precoRapidoService.js.
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';
import { calcularPrecoRapido, LUCRO_PADRAO } from '../utils/precoRapido';
import { salvarPrecoRapido } from '../services/precoRapidoService';
import { getDatabase } from '../database/database';
import { clearQueryCache } from '../database/supabaseDb';
import { notifyDataChanged } from '../utils/dataSync';
import { trackEvent } from '../utils/marketing';
import { CHAVE_PRECO_RAPIDO } from '../utils/initialRoute';

const SUGESTOES = ['Bolo de chocolate', 'Brigadeiro', 'Marmita', 'Hambúrguer', 'Pizza', 'Coxinha'];

function Campo({ valor, onChange, placeholder, largura = 110, label }) {
  return (
    <TextInput
      style={[styles.input, { width: largura }]}
      value={valor}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={colors.placeholder}
      keyboardType="decimal-pad"
      inputMode="decimal"
      accessibilityLabel={label}
    />
  );
}

function LinhaParte({ cor, texto, valor }) {
  return (
    <View style={styles.parte}>
      <View style={[styles.parteCor, { backgroundColor: cor }]} />
      <Text style={styles.parteTexto}>{texto}</Text>
      <Text style={styles.parteValor}>{formatCurrency(valor)}</Text>
    </View>
  );
}

export default function PrecoRapidoScreen({ navigation }) {
  const [nome, setNome] = useState('');
  const [custoReceita, setCustoReceita] = useState('');
  const [rendimento, setRendimento] = useState('');
  const [gastoMes, setGastoMes] = useState('');
  const [vendaMes, setVendaMes] = useState('');
  const [cobraHoje, setCobraHoje] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const salvandoRef = useRef(false);

  useEffect(() => {
    AsyncStorage.setItem(CHAVE_PRECO_RAPIDO, 'true').catch(() => {});
  }, []);

  const r = useMemo(
    () => calcularPrecoRapido({ custoReceita, rendimento, gastoMes, vendaMes, cobraHoje }),
    [custoReceita, rendimento, gastoMes, vendaMes, cobraHoje]
  );
  const preenchido = custoReceita && rendimento && gastoMes !== '' && vendaMes;
  const nomeProduto = nome.trim() || 'seu produto';

  async function irParaApp() {
    try { await AsyncStorage.setItem('onboarding_done', 'true'); } catch (_) {}
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab: 'Início' } }] }));
  }

  async function salvar() {
    if (salvandoRef.current) return;
    if (!nome.trim()) { setErro('Diga o nome do produto lá em cima.'); return; }
    if (!r.ok) { setErro(Object.values(r.erros)[0] || 'Complete os números.'); return; }
    salvandoRef.current = true;
    setSalvando(true);
    setErro(null);
    try {
      const db = await getDatabase();
      const res = await salvarPrecoRapido(db, { nome, custoReceita, rendimento, gastoMes, vendaMes, cobraHoje });
      try { clearQueryCache(); } catch (_) {}
      notifyDataChanged('materias_primas');
      notifyDataChanged('produtos');
      notifyDataChanged('faturamento_mensal');
      notifyDataChanged('despesas_fixas');
      trackEvent('PrecoRapido', { content_name: 'preco_rapido', value: res.preco, currency: 'BRL' });
      await irParaApp();
    } catch (e) {
      console.error('[PrecoRapido.salvar]', e);
      setErro('Não conseguimos salvar. Verifique a internet e tente de novo.');
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.coluna}>
          <Text style={styles.titulo}>Seu preço em 30 segundos</Text>
          <Text style={styles.subtitulo}>Só números que você sabe de cabeça. Detalhar a receita fica para depois.</Text>
          <TouchableOpacity style={styles.videoLink} onPress={() => navigation.navigate('ComoFunciona')} accessibilityRole="button">
            <Feather name="play-circle" size={15} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.linkTexto}>Ver como funciona (1 min)</Text>
          </TouchableOpacity>

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>1. Qual produto?</Text>
            <TextInput
              style={styles.inputLargo}
              value={nome}
              onChangeText={setNome}
              placeholder="Ex.: Bolo de chocolate"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Nome do produto"
            />
            <View style={styles.chips}>
              {SUGESTOES.map((s) => (
                <TouchableOpacity key={s} style={[styles.chip, nome === s && styles.chipAtivo]} onPress={() => setNome(s)} accessibilityRole="button">
                  <Text style={[styles.chipTexto, nome === s && { color: '#fff' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>2. Quanto custa fazer?</Text>
            <View style={styles.frase}>
              <Text style={styles.palavra}>A receita custa R$</Text>
              <Campo valor={custoReceita} onChange={setCustoReceita} placeholder="40,00" label="Custo da receita" />
            </View>
            <View style={styles.frase}>
              <Text style={styles.palavra}>e rende</Text>
              <Campo valor={rendimento} onChange={setRendimento} placeholder="20" largura={80} label="Quantas unidades a receita rende" />
              <Text style={styles.palavra}>unidades</Text>
            </View>
            <Text style={styles.dica}>Some ingredientes e embalagem de uma receita. Uma estimativa já serve.</Text>
          </View>

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>3. Seus números do mês</Text>
            <View style={styles.frase}>
              <Text style={styles.palavra}>Gasto por mês R$</Text>
              <Campo valor={gastoMes} onChange={setGastoMes} placeholder="2.000" label="Gasto por mês para funcionar" />
            </View>
            <Text style={styles.dica}>Aluguel, luz, gás, internet, salários (o seu também). Sem os ingredientes.</Text>
            <View style={styles.frase}>
              <Text style={styles.palavra}>Vendo por mês R$</Text>
              <Campo valor={vendaMes} onChange={setVendaMes} placeholder="8.000" label="Quanto vende por mês" />
            </View>
          </View>

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>4. Quanto você cobra hoje? <Text style={styles.opcional}>(opcional)</Text></Text>
            <View style={styles.frase}>
              <Text style={styles.palavra}>R$</Text>
              <Campo valor={cobraHoje} onChange={setCobraHoje} placeholder="3,50" label="Quanto cobra hoje" />
              <Text style={styles.palavra}>por unidade</Text>
            </View>
          </View>

          {r.ok ? (
            <View style={[styles.cartao, styles.resultado]}>
              <Text style={styles.resultadoLabel}>Preço certo do {nomeProduto}</Text>
              <Text style={styles.resultadoValor}>{formatCurrency(r.preco)} <Text style={styles.resultadoUnidade}>por unidade</Text></Text>
              <LinhaParte cor="#ffffff" texto="Custo de fazer" valor={r.partes.custo} />
              <LinhaParte cor={colors.yellow} texto="Gastos do mês" valor={r.partes.gastos} />
              <LinhaParte cor={colors.success} texto={`Seu lucro (${Math.round(LUCRO_PADRAO * 100)}%)`} valor={r.partes.lucro} />
              {r.comparacao ? (
                <Text style={styles.comparacao}>
                  {r.comparacao.situacao === 'abaixo'
                    ? `Hoje você cobra ${formatCurrency(r.comparacao.hoje)}. Para pagar o custo, os gastos do mês e ainda ter ${Math.round(LUCRO_PADRAO * 100)}% de lucro, cobre ${formatCurrency(r.preco)}.`
                    : `Hoje você cobra ${formatCurrency(r.comparacao.hoje)}: já paga o custo, os gastos do mês e deixa pelo menos ${Math.round(LUCRO_PADRAO * 100)}% de lucro.`}
                </Text>
              ) : null}
            </View>
          ) : preenchido ? (
            <Text style={styles.erro}>{Object.values(r.erros)[0]}</Text>
          ) : null}

          {erro ? <Text style={styles.erro} accessibilityLiveRegion="polite">{erro}</Text> : null}
          <TouchableOpacity style={[styles.botao, (!r.ok || salvando) && styles.botaoApagado]} onPress={salvar} disabled={salvando} accessibilityRole="button">
            {salvando ? <ActivityIndicator color="#fff" /> : (
              <>
                <Text style={styles.botaoTexto}>Salvar e entrar no app</Text>
                <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.pular} onPress={irParaApp} accessibilityRole="button">
            <Text style={styles.pularTexto}>Pular por agora</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.background },
  conteudo: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  coluna: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.bold, color: colors.text, marginTop: spacing.md },
  subtitulo: { fontSize: fonts.regular, lineHeight: 22, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.xs },
  videoLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: spacing.sm, marginBottom: spacing.sm },
  linkTexto: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
  cartao: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm + 4 },
  pergunta: { fontSize: fonts.medium, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.sm },
  opcional: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary },
  frase: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  palavra: { fontSize: fonts.regular, fontFamily: fontFamily.medium, color: colors.text },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text, minHeight: 44, textAlign: 'center' },
  inputLargo: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: fonts.regular, fontFamily: fontFamily.regular, color: colors.text, minHeight: 44 },
  dica: { fontSize: fonts.tiny + 1, lineHeight: 18, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.full, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: colors.surface },
  chipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexto: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  resultado: { backgroundColor: colors.primary, borderColor: colors.primary },
  resultadoLabel: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: '#ffffffcc' },
  resultadoValor: { fontSize: 34, fontFamily: fontFamily.extraBold, color: '#fff', marginTop: 2, marginBottom: spacing.sm },
  resultadoUnidade: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: '#ffffffcc' },
  parte: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  parteCor: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  parteTexto: { flex: 1, fontSize: fonts.small, fontFamily: fontFamily.regular, color: '#fff' },
  parteValor: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: '#fff' },
  comparacao: { marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#ffffff33', fontSize: fonts.small, lineHeight: 20, fontFamily: fontFamily.medium, color: '#fff' },
  erro: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.error, marginBottom: spacing.sm },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 52, marginTop: spacing.sm },
  botaoApagado: { opacity: 0.5 },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
  pular: { alignItems: 'center', paddingVertical: spacing.md },
  pularTexto: { color: colors.textSecondary, fontSize: fonts.small, fontFamily: fontFamily.medium, textDecorationLine: 'underline' },
});
