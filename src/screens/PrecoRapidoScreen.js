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
 *
 * Modo "próximo" (`{ proximo: true }`, escada dos 3 preços, 17/10/2026): o 2º
 * e o 3º produto. Pergunta só produto, receita e quanto cobra hoje; os gastos
 * e as vendas do mês vêm do que já está salvo (src/utils/escadaPrecos.js).
 * No 3º produto com preço, abre a tabela de preços (TabelaPrecosScreen).
 *
 * Primeiro preço (19/10/2026): o nome do produto já vem preenchido com um
 * produto típico do segmento do perfil (src/utils/primeiroPreco.js), o
 * "Pular por agora" virou um link discreto no fim da página e, ao salvar, a
 * pessoa vê o "momento de valor" (PrimeiroPrecoScreen) em vez da Home.
 */
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency, buildPricingConfig } from '../utils/calculations';
import { calcularPrecoRapido, parseValorBR, LUCRO_PADRAO } from '../utils/precoRapido';
import { numerosDoMes, valorParaCampo, META_ESCADA } from '../utils/escadaPrecos';
import { mensagemErroSalvar } from '../utils/planGate';
import { countOrThrow, isErrorResult as isDbErrorResult } from '../database/dbResult';
import { salvarPrecoRapido } from '../services/precoRapidoService';
import { salvarPrecoMontado } from '../services/montarReceitaService';
import { getDatabase } from '../database/database';
import { clearQueryCache } from '../database/supabaseDb';
import { notifyDataChanged } from '../utils/dataSync';
import { trackEvent } from '../utils/marketing';
import { CHAVE_PRECO_RAPIDO } from '../utils/initialRoute';
import { SUGESTOES_PADRAO, sugestoesDeProduto, produtoDoSegmento } from '../utils/primeiroPreco';

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

export default function PrecoRapidoScreen({ navigation, route }) {
  const proximo = !!route?.params?.proximo;
  const [nome, setNome] = useState('');
  const [custoReceita, setCustoReceita] = useState('');
  const [rendimento, setRendimento] = useState('');
  const [gastoMes, setGastoMes] = useState('');
  const [vendaMes, setVendaMes] = useState('');
  const [cobraHoje, setCobraHoje] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [sugestoes, setSugestoes] = useState(SUGESTOES_PADRAO);
  // Receita montada tocando nos ingredientes (MontarReceitaScreen, 21/10/2026).
  const [montada, setMontada] = useState(null);
  const [segmento, setSegmento] = useState('');
  const salvandoRef = useRef(false);
  // A pessoa já mexeu no nome: a sugestão do segmento (que chega depois) não sobrescreve.
  const nomeTocadoRef = useRef(false);
  // Modo próximo: 'carregando' | 'salvos' (linha "Usando seus gastos…") | 'perguntar'
  const [numerosMes, setNumerosMes] = useState(proximo ? 'carregando' : 'perguntar');
  // 2º produto em diante: lucro, taxas e margem de segurança do Financeiro da
  // conta (o 1º usa o lucro padrão: a conta ainda não tem configuração).
  const [contaCfg, setContaCfg] = useState({ lucro: LUCRO_PADRAO, taxasPerc: 0, margemSeguranca: 0 });

  useEffect(() => {
    if (proximo) return;
    AsyncStorage.setItem(CHAVE_PRECO_RAPIDO, 'true').catch(() => {});
    // Funil do primeiro acesso: quantos chegam a esta tela (vs. salvam/pulam).
    trackEvent('PrecoRapidoVisto', { content_name: 'preco_rapido' });
  }, [proximo]);

  // 1º preço: produto típico do segmento do perfil já no campo (pode trocar).
  // Falhou a leitura ou o segmento não diz nada: campo vazio, chips padrão.
  useEffect(() => {
    if (proximo) return undefined;
    let vivo = true;
    (async () => {
      try {
        const db = await getDatabase();
        const rows = await db.getAllAsync('SELECT segmento FROM perfil LIMIT 1');
        if (!vivo || !Array.isArray(rows) || isDbErrorResult(rows)) return;
        const seg = rows[0]?.segmento || '';
        setSegmento(seg);
        setSugestoes(sugestoesDeProduto(seg));
        const produto = produtoDoSegmento(seg);
        if (produto && !nomeTocadoRef.current) setNome((atual) => atual || produto);
      } catch (_) { /* fica sem sugestão do segmento */ }
    })();
    return () => { vivo = false; };
  }, [proximo]);

  // Volta da tela de montar: custo e rendimento vêm da receita.
  useEffect(() => {
    const m = route?.params?.montada;
    if (!m || !Array.isArray(m.itens) || !m.itens.length) return;
    setMontada(m);
    setCustoReceita(valorParaCampo(Math.round(Number(m.custoReceita) * 100) / 100));
    setRendimento(String(m.rende || 1));
    setErro(null);
  }, [route?.params?.montada]);

  function abrirMontar() {
    trackEvent('MontarReceitaAbriu', { content_name: proximo ? 'proximo' : 'primeiro' });
    navigation.navigate('MontarReceita', { nome: nome.trim(), segmento, gastoMes, vendaMes, contaCfg, montada });
  }

  function digitarCusto() {
    setMontada(null);
    setCustoReceita('');
    setRendimento('');
    navigation.setParams({ montada: undefined });
  }

  function mudarNome(v) {
    nomeTocadoRef.current = true;
    setNome(v);
  }

  // 1º preço de quem já tem Financeiro (conta antiga, outro aparelho): usa o
  // lucro/taxas/margem de segurança da conta. Conta nova (sem configuração)
  // fica no padrão de 15%.
  useEffect(() => {
    if (proximo) return undefined; // o efeito abaixo já carrega
    let vivo = true;
    (async () => {
      try {
        const db = await getDatabase();
        const [cfgs, vars] = await Promise.all([
          db.getAllAsync('SELECT lucro_desejado, margem_seguranca FROM configuracao LIMIT 1'),
          db.getAllAsync('SELECT percentual FROM despesas_variaveis'),
        ]);
        if (!vivo || !Array.isArray(cfgs) || isDbErrorResult(cfgs) || cfgs.length === 0) return;
        if (!Array.isArray(vars) || isDbErrorResult(vars)) return;
        const pc = buildPricingConfig({ cfgs, vars, fixas: [], fat: [] });
        setContaCfg({ lucro: pc.lucroDesejado, taxasPerc: pc.despVarPerc, margemSeguranca: pc.margemSeguranca });
      } catch (_) { /* fica o padrão */ }
    })();
    return () => { vivo = false; };
  }, [proximo]);

  // Próximo produto: gastos e vendas do mês salvos. Falhou a leitura ou falta
  // algum: volta a perguntar, já com o que tiver (nunca calcula com zero).
  useEffect(() => {
    if (!proximo) return undefined;
    let vivo = true;
    (async () => {
      let n = { gastoMes: null, vendaMes: null, completo: false };
      try {
        const db = await getDatabase();
        const [fixas, fat, cfgs, vars] = await Promise.all([
          db.getAllAsync('SELECT valor FROM despesas_fixas'),
          db.getAllAsync('SELECT valor FROM faturamento_mensal'),
          db.getAllAsync('SELECT lucro_desejado, margem_seguranca FROM configuracao LIMIT 1'),
          db.getAllAsync('SELECT percentual FROM despesas_variaveis'),
        ]);
        n = numerosDoMes(fixas, fat);
        // Leitura falhou: fica o padrão (lucro 15%, sem taxas), nunca zero de lucro.
        if (Array.isArray(cfgs) && !isDbErrorResult(cfgs) && Array.isArray(vars) && !isDbErrorResult(vars)) {
          const pc = buildPricingConfig({ cfgs, vars, fixas: [], fat: [] });
          if (vivo) setContaCfg({ lucro: pc.lucroDesejado, taxasPerc: pc.despVarPerc, margemSeguranca: pc.margemSeguranca });
        }
      } catch (_) { /* pergunta os dois */ }
      if (!vivo) return;
      setGastoMes(valorParaCampo(n.gastoMes));
      setVendaMes(valorParaCampo(n.vendaMes));
      setNumerosMes(n.completo ? 'salvos' : 'perguntar');
    })();
    return () => { vivo = false; };
  }, [proximo]);

  const r = useMemo(
    () => calcularPrecoRapido({ custoReceita, rendimento, gastoMes, vendaMes, cobraHoje, ...contaCfg }),
    [custoReceita, rendimento, gastoMes, vendaMes, cobraHoje, contaCfg]
  );
  const preenchido = custoReceita && rendimento && gastoMes !== '' && vendaMes;
  const nomeProduto = nome.trim() || 'seu produto';
  const lucroPct = String(Math.round(contaCfg.lucro * 1000) / 10).replace('.', ',');

  function pular() {
    trackEvent('PrecoRapidoPulou', { content_name: 'preco_rapido' });
    irParaApp();
  }

  async function irParaApp(tabelaPronta = false, primeiroPreco = null) {
    try { await AsyncStorage.setItem('onboarding_done', 'true'); } catch (_) {}
    const routes = [{ name: 'MainTabs', params: { initialTab: 'Início' } }];
    if (tabelaPronta) routes.push({ name: 'TabelaPrecos', params: { pronta: true } });
    // 1º preço: o "momento de valor" por cima da Home (voltar cai no app).
    if (primeiroPreco) routes.push({ name: 'PrimeiroPreco', params: primeiroPreco });
    navigation.dispatch(CommonActions.reset({ index: routes.length - 1, routes }));
  }

  function voltar() {
    if (navigation.canGoBack()) navigation.goBack();
    else irParaApp();
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
      const res = montada
        ? await salvarPrecoMontado(db, { nome, itens: montada.itens, rende: montada.rende, custoReceita, gastoMes, vendaMes, cobraHoje, ...contaCfg })
        : await salvarPrecoRapido(db, { nome, custoReceita, rendimento, gastoMes, vendaMes, cobraHoje, ...contaCfg });
      try { clearQueryCache(); } catch (_) {}
      notifyDataChanged('materias_primas');
      if (montada) notifyDataChanged('embalagens');
      notifyDataChanged('produtos');
      notifyDataChanged('faturamento_mensal');
      notifyDataChanged('despesas_fixas');
      if (!proximo) {
        trackEvent('PrecoRapido', { content_name: montada ? 'receita_montada' : 'preco_rapido', value: res.preco, currency: 'BRL' });
        // O aviso "Instale o app" agora é liberado na tabela de preços (3º preço).
        await irParaApp(false, { nome: nome.trim(), preco: res.preco, lucro: contaCfg.lucro });
        return;
      }
      // 2º e 3º produto. Contagem falhou: a Home decide (mostra a escada).
      let comPreco = 0;
      try { comPreco = await countOrThrow(db, 'SELECT COUNT(*) as n FROM produtos WHERE preco_venda > 0'); } catch (_) {}
      trackEvent('PrecoRapidoProximo', { content_name: `produto_${comPreco || 'n'}`, value: res.preco, currency: 'BRL' });
      await irParaApp(comPreco >= META_ESCADA);
    } catch (e) {
      console.error('[PrecoRapido.salvar]', e);
      // Limite do Grátis (5 produtos) vem do servidor com a mensagem do plano.
      setErro(mensagemErroSalvar(e, 'Não conseguimos salvar. Verifique a internet e tente de novo.'));
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.coluna}>
          {proximo ? (
            <>
              <Text style={styles.titulo}>Próximo produto</Text>
              <Text style={[styles.subtitulo, { marginBottom: spacing.md }]}>Seus números do mês já estão salvos. Falta só o produto e a receita.</Text>
            </>
          ) : (
            <>
              <Text style={styles.titulo}>Seu preço em 30 segundos</Text>
              <Text style={styles.subtitulo}>Só números que você sabe de cabeça. Não sabe o custo? O app monta a receita com você.</Text>
              <TouchableOpacity style={styles.videoLink} onPress={() => navigation.navigate('ComoFunciona')} accessibilityRole="button">
                <Feather name="play-circle" size={15} color={colors.primary} style={{ marginRight: 6 }} />
                <Text style={styles.linkTexto}>Ver como funciona (1 min)</Text>
              </TouchableOpacity>
            </>
          )}

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>1. Qual produto?</Text>
            <TextInput
              style={styles.inputLargo}
              value={nome}
              onChangeText={mudarNome}
              placeholder="Ex.: Bolo de chocolate"
              placeholderTextColor={colors.placeholder}
              accessibilityLabel="Nome do produto"
            />
            <View style={styles.chips}>
              {sugestoes.map((s) => (
                <TouchableOpacity key={s} style={[styles.chip, nome === s && styles.chipAtivo]} onPress={() => mudarNome(s)} accessibilityRole="button">
                  <Text style={[styles.chipTexto, nome === s && { color: '#fff' }]}>{s}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>2. Quanto custa fazer?</Text>
            {montada ? (
              <View style={styles.montada}>
                <Text style={styles.montadaTitulo}>Sua receita: {montada.itens.length} {montada.itens.length === 1 ? 'ingrediente' : 'ingredientes'}</Text>
                <Text style={styles.montadaTexto}>Custa {formatCurrency(Number(montada.custoReceita) || 0)} e rende {montada.rende} {montada.rende === 1 ? (montada.porcao?.[0] || 'unidade') : (montada.porcao?.[1] || 'unidades')}.{montada.semPreco ? ` ${montada.semPreco} sem preço.` : ''}</Text>
                <View style={styles.montadaAcoes}>
                  <TouchableOpacity onPress={abrirMontar} style={styles.montadaLink} accessibilityRole="button"><Text style={styles.linkTexto}>Ver ou mudar a receita</Text></TouchableOpacity>
                  <TouchableOpacity onPress={digitarCusto} style={styles.montadaLink} accessibilityRole="button"><Text style={styles.pularTexto}>Prefiro digitar o custo</Text></TouchableOpacity>
                </View>
              </View>
            ) : (
            <>
            <TouchableOpacity style={styles.montar} onPress={abrirMontar} accessibilityRole="button" accessibilityLabel="Não sei o custo. Montar a receita tocando nos ingredientes">
              <Feather name="list" size={18} color="#fff" style={{ marginRight: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={styles.montarTitulo}>Não sei. Montar a receita</Text>
                <Text style={styles.montarSub}>Toque nos ingredientes que você usa. O preço aparece na hora.</Text>
              </View>
              <Feather name="chevron-right" size={18} color="#fff" />
            </TouchableOpacity>
            <Text style={[styles.dica, { marginTop: spacing.sm }]}>Ou, se você já sabe:</Text>
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
            </>
            )}
          </View>

          {numerosMes === 'carregando' ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.sm }} />
          ) : numerosMes === 'salvos' ? (
            <Text style={styles.usando}>
              Usando seus gastos do mês: {formatCurrency(parseValorBR(gastoMes))} · vendas: {formatCurrency(parseValorBR(vendaMes))}{' '}
              <Text style={styles.linkTexto} onPress={() => setNumerosMes('perguntar')} accessibilityRole="button">(alterar)</Text>
            </Text>
          ) : (
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
          )}

          <View style={styles.cartao}>
            <Text style={styles.pergunta}>{numerosMes === 'perguntar' ? '4' : '3'}. Quanto você cobra hoje? <Text style={styles.opcional}>(opcional)</Text></Text>
            <View style={styles.frase}>
              <Text style={styles.palavra}>R$</Text>
              <Campo valor={cobraHoje} onChange={setCobraHoje} placeholder="3,50" label="Quanto cobra hoje" />
              <Text style={styles.palavra}>por unidade</Text>
            </View>
          </View>

          {r.ok ? (
            <View style={[styles.cartao, styles.resultado]}>
              <Text style={styles.resultadoLabel}>Preço certo: {nomeProduto}</Text>
              <Text style={styles.resultadoValor}>{formatCurrency(r.preco)} <Text style={styles.resultadoUnidade}>por unidade</Text></Text>
              <LinhaParte cor="#ffffff" texto="Custo de fazer" valor={r.partes.custo} />
              {r.partes.seguranca > 0.005 ? <LinhaParte cor="#ffffff" texto="Margem de segurança" valor={r.partes.seguranca} /> : null}
              <LinhaParte cor={colors.yellow} texto="Gastos do mês" valor={r.partes.gastos} />
              {r.partes.taxas > 0.005 ? <LinhaParte cor={colors.yellow} texto="Taxas e impostos" valor={r.partes.taxas} /> : null}
              <LinhaParte cor={colors.success} texto={`Seu lucro (${lucroPct}%)`} valor={r.partes.lucro} />
              {r.comparacao ? (
                <Text style={styles.comparacao}>
                  {r.comparacao.situacao === 'abaixo'
                    ? `Hoje você cobra ${formatCurrency(r.comparacao.hoje)}. Para pagar o custo, os gastos do mês e ainda ter ${lucroPct}% de lucro, cobre ${formatCurrency(r.preco)}.`
                    : `Hoje você cobra ${formatCurrency(r.comparacao.hoje)}: já paga o custo, os gastos do mês e deixa pelo menos ${lucroPct}% de lucro.`}
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
                <Text style={styles.botaoTexto}>{proximo ? 'Salvar o preço' : 'Salvar e entrar no app'}</Text>
                <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
              </>
            )}
          </TouchableOpacity>
          {proximo ? (
            <TouchableOpacity style={styles.pular} onPress={voltar} accessibilityRole="button">
              <Text style={styles.pularTexto}>Voltar</Text>
            </TouchableOpacity>
          ) : (
            // Discreto e no fim da página (48% pulavam), mas sempre acessível.
            <TouchableOpacity style={styles.pularDiscreto} onPress={pular} accessibilityRole="button" accessibilityLabel="Pular por agora e ir para o app">
              <Text style={styles.pularDiscretoTexto}>Pular por agora</Text>
            </TouchableOpacity>
          )}
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
  usando: { fontSize: fonts.small, lineHeight: 21, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.sm + 4, paddingHorizontal: 2 },
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
  montar: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, padding: 14, minHeight: 56 },
  montarTitulo: { color: '#fff', fontSize: fonts.regular, fontFamily: fontFamily.bold },
  montarSub: { color: '#ffffffd9', fontSize: fonts.small, fontFamily: fontFamily.regular, marginTop: 2 },
  montada: { backgroundColor: colors.surfaceTint, borderRadius: borderRadius.md, padding: 12, gap: 4 },
  montadaTitulo: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },
  montadaTexto: { fontSize: fonts.small + 1, fontFamily: fontFamily.regular, color: colors.textSecondary },
  montadaAcoes: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  montadaLink: { minHeight: 40, justifyContent: 'center' },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
  pular: { alignItems: 'center', paddingVertical: spacing.md },
  pularTexto: { color: colors.textSecondary, fontSize: fonts.small, fontFamily: fontFamily.medium, textDecorationLine: 'underline' },
  pularDiscreto: { alignSelf: 'center', justifyContent: 'center', minHeight: 44, paddingHorizontal: spacing.md, marginTop: spacing.xl },
  pularDiscretoTexto: { color: colors.textSecondary, fontSize: fonts.tiny + 1, fontFamily: fontFamily.regular, textDecorationLine: 'underline' },
});
