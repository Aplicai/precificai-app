/**
 * Montar a receita tocando (21/10/2026). Aberta pelo Preço rápido em
 * "Não sei o custo. Montar a receita". Desenho: .specs/plans/ia-monta-receita.design.md
 * Protótipo aprovado (v7): https://claude.ai/artifact/LUBhBFDrjRXf8ucyQUSxfF
 *
 * Os ingredientes sugeridos (biblioteca > IA > lista do nicho) aparecem como
 * botões; cada toque põe o ingrediente na receita e o preço do topo muda na
 * hora (aparece já no 1º). "Usar esta receita" volta ao Preço rápido com a
 * receita (params.montada); quem grava é o Preço rápido.
 *
 * Lógica pura: src/utils/montarReceita.js. Busca: src/services/montarReceitaService.js.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';
import { calcularPrecoRapido, parseValorBR, LUCRO_PADRAO } from '../utils/precoRapido';
import { custoReceita, custoLinha, lerOutro, precoMedio, normTexto } from '../utils/montarReceita';
import { buscarSugestao, nomesConhecidos } from '../services/montarReceitaService';
import { getDatabase } from '../database/database';
import { supabase } from '../config/supabase';
import { trackEvent } from '../utils/marketing';

// Sem os números do mês ainda: gastos médios (25% do que vende), só para o
// preço do topo. O Preço rápido pede os números da pessoa depois.
const MES_PADRAO = { gastoMes: '2000', vendaMes: '8000' };

const fmtQ = (q) => String(Math.round(Number(q) * 100) / 100).replace('.', ',');
const passo = (un, q) => (un === 'un' ? 1 : q < 30 ? 1 : q < 200 ? 5 : 10);
const porUnidade = (un) => (un === 'un' ? 'por unidade' : un === 'ml' ? 'por litro' : 'por kg');

/**
 * Campo numérico que não reescreve o texto enquanto a pessoa digita ("1," fica
 * "1,", apagar tudo deixa vazio). Manda o número a cada tecla válida; ao sair
 * do campo, mostra o valor formatado. vazio: o que mandar com o campo vazio.
 */
function CampoNumero({ valor, onValor, fmt, vazio, ...props }) {
  const [texto, setTexto] = useState(() => fmt(valor));
  const foco = useRef(false);
  useEffect(() => { if (!foco.current) setTexto(fmt(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <TextInput
      {...props}
      value={texto}
      onFocus={() => { foco.current = true; }}
      onChangeText={(v) => {
        setTexto(v);
        if (!v.trim()) { if (vazio !== undefined) onValor(vazio); return; }
        if (/[.,]$/.test(v.trim())) return;
        const x = parseValorBR(v);
        if (x !== null && x > 0) onValor(x);
      }}
      onBlur={() => { foco.current = false; setTexto(fmt(valor)); }}
    />
  );
}
const fmtPreco = (v) => (Number(v) > 0 ? Number(v).toFixed(2).replace('.', ',') : '');

export default function MontarReceitaScreen({ navigation, route }) {
  const p = route?.params || {};
  const nome = String(p.nome || '').trim() || 'Seu produto';
  const [carregando, setCarregando] = useState(true);
  const [sug, setSug] = useState({ porcao: ['unidade', 'unidades'], itens: [], fonte: 'nicho' });
  const [add, setAdd] = useState(() => (Array.isArray(p.montada?.itens) ? p.montada.itens : []));
  const [rende, setRende] = useState(() => Number(p.montada?.rende) || 0);
  const [aberto, setAberto] = useState(-1);
  const [outro, setOutro] = useState(null);
  const [msg, setMsg] = useState(null);
  const [erroVer, setErroVer] = useState(false);
  const primeiroRef = useRef(false);

  useEffect(() => {
    let vivo = true;
    trackEvent('MontarReceitaVisto', { content_name: 'montar_receita' });
    (async () => {
      let db = null;
      try { db = await getDatabase(); } catch (_) { /* segue só com preços médios */ }
      const invocar = (fn, opts) => supabase.functions.invoke(fn, opts);
      const s = await buscarSugestao({ db, nomeProduto: nome, segmento: p.segmento, invocar });
      if (!vivo) return;
      setSug(s);
      setRende((r) => r || s.rende || 1);
      if (p.montada?.porcao) setSug((x) => ({ ...x, porcao: p.montada.porcao }));
      setCarregando(false);
      trackEvent('MontarReceitaSugestao', { content_name: s.fonte, value: s.itens.length });
    })().catch(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [porcao, porcoes] = sug.porcao || ['unidade', 'unidades'];
  const faltam = useMemo(() => sug.itens.filter((s) => !add.some((a) => a.nome === s.nome)), [sug.itens, add]);
  const custo = useMemo(() => custoReceita(add, rende), [add, rende]);
  const mesSalvo = parseValorBR(p.vendaMes) > 0 && parseValorBR(p.gastoMes) !== null;
  const preco = useMemo(() => calcularPrecoRapido({
    custoReceita: custo.custoReceita,
    rendimento: rende,
    ...(mesSalvo ? { gastoMes: p.gastoMes, vendaMes: p.vendaMes } : MES_PADRAO),
    lucro: p.contaCfg?.lucro ?? LUCRO_PADRAO,
    taxasPerc: p.contaCfg?.taxasPerc ?? 0,
    margemSeguranca: p.contaCfg?.margemSeguranca ?? 0,
  }), [custo.custoReceita, rende, mesSalvo, p.gastoMes, p.vendaMes, p.contaCfg]);

  function adicionar(item) {
    setAdd((l) => (l.some((a) => a.nome === item.nome) ? l : [...l, { ...item }]));
    setAberto(-1); setMsg(null); setErroVer(false);
    if (!primeiroRef.current) { primeiroRef.current = true; trackEvent('MontarReceitaPrimeiroIngrediente', { content_name: sug.fonte }); }
  }
  function adicionarTodos() { faltam.forEach(adicionar); }
  function mudar(i, campo, valor) { setAdd((l) => l.map((a, j) => (j === i ? { ...a, [campo]: valor, estimado: campo === 'preco' ? false : a.estimado } : a))); }
  function tirar(i) {
    const it = add[i];
    setAdd((l) => l.filter((_, j) => j !== i));
    if (!sug.itens.some((s) => s.nome === it.nome)) setSug((s) => ({ ...s, itens: [...s.itens, it] }));
    setAberto(-1); setMsg(`Tirei ${it.nome} da receita.`);
  }
  function porOutro() {
    const l = lerOutro(outro || '', nomesConhecidos());
    if (!l) { setMsg('Escreva assim: 100 g de coco ralado.'); return; }
    const [n, q, un] = l;
    if (add.some((a) => normTexto(a.nome) === normTexto(n))) { setOutro(null); setMsg(`${n} já está na receita. Toque nele para mudar a quantidade.`); return; }
    // Mesmo ingrediente sugerido (chip) ou que a pessoa já tem: usa esse
    // (preço dela, "já é seu"), só com a quantidade digitada.
    const k = normTexto(n);
    const sugerido = sug.itens.find((x) => !x.emb && normTexto(x.nome) === k && x.un === un);
    const c = sug.conta instanceof Map ? sug.conta.get(k) : null;
    const daConta = !sugerido && c && c.tabela === 'materias_primas' && c.un === un && Number(c.preco) > 0;
    const preco1 = sugerido ? sugerido.preco : daConta ? Number(c.preco) : precoMedio(n, un);
    adicionar(sugerido ? { ...sugerido, q } : { nome: n, q, un, emb: false, preco: preco1, contaId: daConta ? c.id : null, contaTabela: daConta ? 'materias_primas' : null, estimado: !daConta && preco1 != null });
    setOutro(null);
    setMsg(preco1 == null ? `Coloquei ${n}. Toque nele para pôr quanto você paga.` : (sugerido?.contaId || daConta) ? `Coloquei ${n} com o preço que você já tem.` : `Coloquei ${n} com o preço médio do mercado.`);
  }
  function usar() {
    if (!add.length) { setErroVer(true); return; }
    trackEvent('MontarReceitaUsada', { content_name: sug.fonte, value: add.length });
    navigation.navigate({ name: 'PrecoRapido', params: { montada: { nome, itens: add, rende, porcao: sug.porcao, custoReceita: custo.custoReceita, semPreco: custo.semPreco } }, merge: true });
  }

  const n = add.length;
  return (
    <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.topo}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.voltar} accessibilityRole="button" accessibilityLabel="Voltar sem usar">
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.topoTitulo} numberOfLines={1}>{nome}</Text>
          <Text style={styles.topoSub}>Sua receita</Text>
        </View>
      </View>
      <View style={styles.live} accessibilityLiveRegion="polite">
        <View style={styles.liveDentro}>
          <View style={{ flex: 1 }}>
            <Text style={styles.liveLabel}>{n ? `Venda cada ${porcao} por (até agora)` : 'Seu preço aparece aqui'}</Text>
            <Text style={styles.liveValor}>{n && preco.ok ? formatCurrency(preco.preco) : '—'}</Text>
          </View>
          <Text style={styles.liveCont}>{n ? `${n} de ${n + faltam.length}\ningredientes` : 'Toque no 1º\ningrediente'}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.coluna}>
          {carregando ? (
            <View style={styles.carregando}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.carregandoTexto}>Separando os ingredientes de {nome}…</Text>
            </View>
          ) : (
            <>
              {faltam.length ? (
                <>
                  {sug.parecida && !n ? <Text style={styles.dica}>Não achei a receita exata de {nome}. Esta é a de {sug.parecida.toLowerCase()}: toque nos que você usa e ponha os outros em "+ Outro ingrediente".</Text> : null}
                  <Text style={styles.dica}>{n ? 'Continue tocando nos que você usa.' : 'Toque nos ingredientes que você usa.'}</Text>
                  <View style={styles.chips}>
                    {faltam.map((f) => (
                      <TouchableOpacity key={f.nome} style={styles.chip} onPress={() => adicionar(f)} accessibilityRole="button" accessibilityLabel={`Adicionar ${f.nome}`}>
                        <Text style={styles.chipMais}>+</Text>
                        <Text style={styles.chipTexto}>{f.nome}<Text style={styles.chipQtd}> · {f.emb ? `1 por ${porcao}` : `${fmtQ(f.q)} ${f.un}`}{f.contaId ? ' · já é seu' : ''}</Text></Text>
                      </TouchableOpacity>
                    ))}
                    {faltam.length > 1 ? (
                      <TouchableOpacity style={[styles.chip, styles.chipTodos]} onPress={adicionarTodos} accessibilityRole="button">
                        <Text style={[styles.chipTexto, { color: colors.primary }]}>Adicionar todos ({faltam.length})</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </>
              ) : null}

              {outro !== null ? (
                <View style={styles.outro}>
                  <TextInput style={styles.outroInput} value={outro} onChangeText={setOutro} onSubmitEditing={porOutro} autoFocus placeholder="100 g de coco ralado" placeholderTextColor={colors.placeholder} accessibilityLabel="Outro ingrediente com quantidade" />
                  <TouchableOpacity style={styles.outroBotao} onPress={porOutro} accessibilityRole="button"><Text style={styles.outroBotaoTexto}>Pôr</Text></TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity onPress={() => setOutro('')} style={styles.link} accessibilityRole="button"><Text style={styles.linkTexto}>+ Outro ingrediente</Text></TouchableOpacity>
              )}
              {msg ? <Text style={styles.msg} accessibilityLiveRegion="polite">{msg}</Text> : null}

              <View style={styles.lista}>
                <Text style={styles.listaTitulo}>NA SUA RECEITA ({n}) <Text style={styles.listaSub}>· quantidades da receita inteira</Text></Text>
                {n === 0 ? <Text style={styles.vazio}>Os ingredientes que você tocar aparecem aqui.</Text> : null}
                {add.map((it, i) => (
                  aberto === i ? (
                    <View key={it.nome} style={styles.itemAberto}>
                      <View style={styles.linhaTopo}>
                        <Text style={styles.itemNome}>{it.nome}</Text>
                        <TouchableOpacity onPress={() => tirar(i)} style={styles.lixeira} accessibilityRole="button" accessibilityLabel={`Tirar ${it.nome}`}><Feather name="trash-2" size={18} color={colors.textSecondary} /></TouchableOpacity>
                      </View>
                      <View style={styles.duas}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.campoLabel}>{it.emb ? `Em cada ${porcao}` : 'Na receita inteira'}</Text>
                          <View style={styles.stepper}>
                            <TouchableOpacity style={styles.stepBotao} onPress={() => mudar(i, 'q', Math.max(0, Math.round((it.q - passo(it.un, it.q - 0.001)) * 100) / 100))} accessibilityLabel="Menos"><Text style={styles.stepSinal}>−</Text></TouchableOpacity>
                            <CampoNumero style={styles.stepInput} valor={it.q} fmt={fmtQ} onValor={(x) => mudar(i, 'q', x)} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel={`Quantidade de ${it.nome}`} />
                            <Text style={styles.stepUn}>{it.un}</Text>
                            <TouchableOpacity style={styles.stepBotao} onPress={() => mudar(i, 'q', Math.round((it.q + passo(it.un, it.q)) * 100) / 100)} accessibilityLabel="Mais"><Text style={styles.stepSinal}>+</Text></TouchableOpacity>
                          </View>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.campoLabel}>Você paga {porUnidade(it.un)}{it.estimado ? ' (média)' : ''}</Text>
                          <View style={styles.dinheiro}>
                            <Text style={styles.cifrao}>R$</Text>
                            <CampoNumero style={styles.dinheiroInput} valor={it.preco} fmt={fmtPreco} vazio={null} onValor={(x) => mudar(i, 'preco', x)} placeholder="0,00" placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel={`Quanto você paga ${porUnidade(it.un)}`} />
                          </View>
                        </View>
                      </View>
                      {!(Number(it.preco) > 0) ? <Text style={styles.semPreco}>Sem preço: este ingrediente ainda não entra no custo.</Text> : null}
                      <TouchableOpacity style={styles.pronto} onPress={() => setAberto(-1)} accessibilityRole="button"><Text style={styles.prontoTexto}>Pronto</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity key={it.nome} style={styles.item} onPress={() => setAberto(i)} accessibilityRole="button" accessibilityLabel={`Mudar ${it.nome}`}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemNome}>{it.nome}{it.estimado ? <Text style={styles.ponto}>  ●</Text> : null}</Text>
                        <Text style={styles.itemSub}>{it.emb ? `1 por ${porcao}` : `${fmtQ(it.q)} ${it.un}`}{it.contaId ? ' · já é seu' : ''}{!(Number(it.preco) > 0) ? ' · sem preço' : ''}</Text>
                      </View>
                      <Text style={styles.itemValor}>{Number(it.preco) > 0 ? formatCurrency(it.emb ? custoLinha(it.preco, it.q, 'un') : custoLinha(it.preco, it.q, it.un)) : '—'}</Text>
                      <Feather name="chevron-right" size={18} color={colors.textSecondary} />
                    </TouchableOpacity>
                  )
                ))}
              </View>
              {custo.semPreco > 0 ? <Text style={styles.semPreco}>{custo.semPreco === 1 ? '1 ingrediente sem preço' : `${custo.semPreco} ingredientes sem preço`}: toque nele para pôr quanto você paga.</Text> : null}
              {add.some((a) => a.estimado) ? <Text style={styles.legenda}><Text style={styles.ponto}>●</Text> preço médio do mercado. Troque pelo que você paga quando quiser.</Text> : null}

              <View style={styles.rende}>
                <Text style={styles.rendeTexto}>A receita inteira rende</Text>
                <View style={[styles.stepper, { width: 190 }]}>
                  <TouchableOpacity style={styles.stepBotao} onPress={() => setRende((r) => Math.max(1, r - 1))} accessibilityLabel="Menos"><Text style={styles.stepSinal}>−</Text></TouchableOpacity>
                  <CampoNumero style={styles.stepInput} valor={rende} fmt={(v) => String(v || '')} onValor={(x) => { const r = Math.round(x); if (r >= 1) setRende(Math.min(r, 1000)); }} keyboardType="number-pad" inputMode="numeric" accessibilityLabel={`Quantas ${porcoes} a receita rende`} />
                  <Text style={styles.stepUn}>{porcoes}</Text>
                  <TouchableOpacity style={styles.stepBotao} onPress={() => setRende((r) => Math.min(1000, r + 1))} accessibilityLabel="Mais"><Text style={styles.stepSinal}>+</Text></TouchableOpacity>
                </View>
              </View>
              {!mesSalvo && n ? <Text style={styles.legenda}>Preço com gastos médios do mês. Na próxima tela você coloca os seus.</Text> : null}
            </>
          )}
        </View>
      </ScrollView>

      <View style={styles.rodape}>
        {erroVer ? <Text style={styles.erro}>Adicione pelo menos 1 ingrediente.</Text> : null}
        <TouchableOpacity style={[styles.botao, !n && styles.botaoApagado]} onPress={usar} accessibilityRole="button">
          <Text style={styles.botaoTexto}>Usar esta receita</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.background },
  topo: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm },
  voltar: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  topoTitulo: { fontSize: fonts.medium, fontFamily: fontFamily.bold, color: colors.text },
  topoSub: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary },
  live: { backgroundColor: colors.primary, paddingHorizontal: spacing.md, paddingVertical: 10 },
  liveDentro: { flexDirection: 'row', alignItems: 'center', maxWidth: 560, width: '100%', alignSelf: 'center' },
  liveLabel: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: '#ffffffd9' },
  liveValor: { fontSize: 26, fontFamily: fontFamily.extraBold || fontFamily.bold, color: '#fff' },
  liveCont: { fontSize: fonts.tiny + 1, fontFamily: fontFamily.medium, color: '#ffffffd9', textAlign: 'right' },
  conteudo: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  coluna: { maxWidth: 560, width: '100%', alignSelf: 'center', gap: spacing.sm + 2 },
  carregando: { alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.sm },
  carregandoTexto: { fontSize: fonts.regular, fontFamily: fontFamily.regular, color: colors.textSecondary, textAlign: 'center' },
  dica: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.warningDark || colors.text, backgroundColor: '#FBF3E2', borderRadius: borderRadius.sm, padding: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: 12, paddingVertical: 6, borderRadius: borderRadius.md, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#B9CFCB', backgroundColor: colors.surface },
  chipTodos: { borderStyle: 'solid', borderColor: colors.primary, backgroundColor: colors.surfaceTint },
  chipMais: { fontSize: 18, color: colors.primary, marginRight: 6, fontFamily: fontFamily.bold },
  chipTexto: { fontSize: fonts.small + 1, fontFamily: fontFamily.semiBold, color: colors.text },
  chipQtd: { fontFamily: fontFamily.regular, color: colors.textSecondary, fontSize: fonts.small },
  link: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  linkTexto: { color: colors.primary, fontSize: fonts.small + 1, fontFamily: fontFamily.bold },
  outro: { flexDirection: 'row', gap: 8 },
  outroInput: { flex: 1, minHeight: 46, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 12, fontSize: fonts.regular, fontFamily: fontFamily.regular, color: colors.text },
  outroBotao: { backgroundColor: colors.primary, borderRadius: borderRadius.sm, paddingHorizontal: 16, justifyContent: 'center' },
  outroBotaoTexto: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.regular },
  msg: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.primary, backgroundColor: colors.surfaceTint, borderRadius: borderRadius.sm, padding: 10 },
  lista: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, overflow: 'hidden' },
  listaTitulo: { fontSize: fonts.tiny + 1, fontFamily: fontFamily.bold, color: colors.textSecondary, paddingHorizontal: 12, paddingTop: 10, paddingBottom: 4, letterSpacing: 0.3 },
  listaSub: { fontFamily: fontFamily.regular, letterSpacing: 0 },
  vazio: { padding: 12, fontSize: fonts.small + 1, fontFamily: fontFamily.regular, color: colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 58, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  itemAberto: { borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surfaceTint, padding: 12, gap: 10 },
  linhaTopo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  itemNome: { fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text },
  itemSub: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 1 },
  itemValor: { fontSize: fonts.small + 1, fontFamily: fontFamily.semiBold, color: colors.text },
  ponto: { color: '#D99A17', fontSize: 10 },
  lixeira: { width: 40, height: 40, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  duas: { flexDirection: 'row', gap: 8 },
  campoLabel: { fontSize: fonts.tiny + 1, fontFamily: fontFamily.semiBold, color: colors.textSecondary, marginBottom: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', height: 44, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm },
  stepBotao: { width: 40, height: 42, alignItems: 'center', justifyContent: 'center' },
  stepSinal: { fontSize: 20, color: colors.text },
  stepInput: { flex: 1, minWidth: 0, height: 42, textAlign: 'center', fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },
  stepUn: { fontSize: fonts.small, color: colors.textSecondary, marginRight: 2 },
  dinheiro: { flexDirection: 'row', alignItems: 'center', height: 44, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 10 },
  cifrao: { fontSize: fonts.small, color: colors.textSecondary },
  dinheiroInput: { flex: 1, minWidth: 0, height: 42, textAlign: 'right', fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.text },
  semPreco: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.warningDark || colors.text },
  pronto: { alignSelf: 'flex-end', backgroundColor: colors.primary, borderRadius: borderRadius.sm, minHeight: 40, paddingHorizontal: 18, justifyContent: 'center' },
  prontoTexto: { color: '#fff', fontFamily: fontFamily.bold, fontSize: fonts.small + 1 },
  legenda: { fontSize: fonts.small, fontFamily: fontFamily.regular, color: colors.textSecondary },
  rende: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  rendeTexto: { fontSize: fonts.regular, fontFamily: fontFamily.medium, color: colors.text },
  rodape: { backgroundColor: colors.surfaceTint, borderTopWidth: 1, borderTopColor: colors.border, padding: spacing.sm + 4 },
  erro: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.error, marginBottom: 6, textAlign: 'center' },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 52, maxWidth: 560, width: '100%', alignSelf: 'center' },
  botaoApagado: { opacity: 0.5 },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
});
