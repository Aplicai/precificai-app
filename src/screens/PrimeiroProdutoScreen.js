/**
 * Primeiro acesso guiado (15/10/2026): substitui o Kit de Início.
 *
 * Dados de 14–15/10: de 43 cadastros, 1 chegou a um produto com preço. O Kit
 * jogava ~90 ingredientes sem preço na tela e o Financeiro vinha na frente;
 * quem saía não voltava. Aqui a pessoa monta UM produto em 3 passos e vê o
 * preço na primeira visita:
 *   1. "Qual produto você mais vende?" (nome + quanto a receita rende)
 *   2. "O que vai nele?" (ingredientes: "Comprei 5 kg por R$ 25", "Uso 300 g")
 *   3. Custo e preço sugerido → "Salvar com esse preço"
 *   4. Financeiro como "Deixe esse preço mais certo" (pode pular)
 *
 * Cálculos e SQL: src/utils/primeiroProduto.js (puro, testado) e
 * src/services/primeiroProdutoService.js (mesmo SQL dos formulários).
 * Os subcomponentes ficam FORA da função da tela: definidos dentro, o
 * TextInput perde o foco a cada tecla (ver FinanceiroConfig, Sessão 28.50).
 */
import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, BackHandler,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions } from '@react-navigation/native';
import PickerSelect from '../components/PickerSelect';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { useAuth } from '../contexts/AuthContext';
import { getDatabase } from '../database/database';
import { rowsOrThrow } from '../database/dbResult';
import { clearQueryCache } from '../database/supabaseDb';
import { notifyDataChanged } from '../utils/dataSync';
import { buildPricingConfig, formatCurrency, parseDecimalBR, UNIDADES_MEDIDA } from '../utils/calculations';
import {
  segmentoKeyDoTexto, sugestoesIngredientes, filtrarSugestoes, sugestoesProduto,
  prefillCompraDeTemplate, unidadesUsoPara, unidadeUsoPadrao, calcularLinha,
  resumoReceita, montarPayloadPrimeiroProduto, linhaVazia, MAX_LINHAS, LINHAS_INICIAIS,
} from '../utils/primeiroProduto';
import { salvarPrimeiroProduto } from '../services/primeiroProdutoService';
import { CHAVE_OFERTA_PRIMEIRO_PRODUTO } from '../utils/rotaPrimeiroAcesso';
import { trackPrimeiroPrecoOnce } from '../utils/marketing';

const PASSOS = ['produto', 'ingredientes', 'resultado'];
const RENDIMENTO_TIPOS = [
  { key: 'unidade', label: 'unidades' },
  { key: 'kg', label: 'kg' },
  { key: 'litro', label: 'litros' },
];
const SUFIXO_RENDIMENTO = { unidade: 'por unidade', kg: 'por kg', litro: 'por litro' };
const OPCOES_COMPRA = UNIDADES_MEDIDA.map((u) => ({ label: u.label, value: u.value }));
const LABEL_UNIDADE = { g: 'Grama (g)', kg: 'Quilograma (kg)', mL: 'Mililitro (mL)', L: 'Litro (L)', un: 'Unidade (un)' };

const chaveRascunho = (uid) => `primeiro_produto_draft_v1_${uid || 'anon'}`;

function precoParaCampo(n) {
  if (!(n > 0)) return '';
  return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',');
}

// ---------- subcomponentes (módulo) ----------

function Cabecalho({ passo, onVoltar }) {
  const idx = PASSOS.indexOf(passo);
  return (
    <View style={styles.cabecalho}>
      <View style={styles.cabecalhoLinha}>
        {idx > 0 ? (
          <TouchableOpacity onPress={onVoltar} style={styles.voltarBtn} accessibilityRole="button" accessibilityLabel="Voltar" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="arrow-left" size={20} color={colors.text} />
          </TouchableOpacity>
        ) : <View style={styles.voltarBtn} />}
        <Text style={styles.passoTexto}>{idx >= 0 ? `Passo ${idx + 1} de ${PASSOS.length}` : 'Pronto'}</Text>
        <View style={styles.voltarBtn} />
      </View>
      <View style={styles.progressoFundo}>
        <View style={[styles.progressoBarra, { width: `${idx >= 0 ? ((idx + 1) / PASSOS.length) * 100 : 100}%` }]} />
      </View>
    </View>
  );
}

function Chips({ itens, onPress, selecionado }) {
  if (!itens?.length) return null;
  return (
    <View style={styles.chips}>
      {itens.map((t) => {
        const ativo = selecionado === t;
        return (
          <TouchableOpacity key={t} style={[styles.chip, ativo && styles.chipAtivo]} onPress={() => onPress(t)} activeOpacity={0.7} accessibilityRole="button">
            <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{t}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function PassoProduto({ nome, setNome, rendimento, setRendimento, sugestoes, onContinuar, onExplorar, podeContinuar }) {
  return (
    <View>
      <Text style={styles.titulo}>Qual produto você mais vende?</Text>
      <Text style={styles.subtitulo}>Vamos calcular o preço dele agora, com os valores que você paga.</Text>

      <Text style={styles.label}>Nome do produto</Text>
      <TextInput
        style={styles.input}
        value={nome}
        onChangeText={setNome}
        placeholder={sugestoes[0] ? `Ex.: ${sugestoes[0]}` : 'Ex.: Bolo de cenoura'}
        placeholderTextColor={colors.placeholder}
        accessibilityLabel="Nome do produto"
        returnKeyType="next"
      />
      <Chips itens={sugestoes.slice(0, 6)} onPress={setNome} selecionado={nome} />

      <Text style={[styles.label, { marginTop: spacing.lg }]}>Essa receita rende</Text>
      <View style={styles.linhaFrase}>
        <TextInput
          style={[styles.input, styles.inputCurto]}
          value={rendimento.qtd}
          onChangeText={(v) => setRendimento((r) => ({ ...r, qtd: v }))}
          placeholderTextColor={colors.placeholder}
          keyboardType="decimal-pad"
          inputMode="decimal"
          accessibilityLabel="Quanto a receita rende"
        />
        {RENDIMENTO_TIPOS.map((t) => {
          const ativo = rendimento.tipo === t.key;
          return (
            <TouchableOpacity key={t.key} style={[styles.chip, ativo && styles.chipAtivo]} onPress={() => setRendimento((r) => ({ ...r, tipo: t.key }))} accessibilityRole="button" accessibilityState={{ selected: ativo }}>
              <Text style={[styles.chipTexto, ativo && styles.chipTextoAtivo]}>{t.label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.dica}>Ex.: 1 bolo inteiro, 20 fatias, 30 brigadeiros ou 2 kg.</Text>

      <TouchableOpacity style={[styles.botao, !podeContinuar && styles.botaoDesabilitado]} onPress={onContinuar} disabled={!podeContinuar} accessibilityRole="button" accessibilityState={{ disabled: !podeContinuar }}>
        <Text style={styles.botaoTexto}>Continuar</Text>
        <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={onExplorar} accessibilityRole="button">
        <Text style={styles.linkTexto}>Prefiro explorar o app sozinho</Text>
      </TouchableOpacity>
    </View>
  );
}

function LinhaIngrediente({ linha, indice, onChange, onRemover, podeRemover, sugestoesBase, nomesUsados, mostrarErros }) {
  const [focado, setFocado] = useState(false);
  const calc = useMemo(() => calcularLinha(linha), [linha]);
  const sugestoes = focado ? filtrarSugestoes(sugestoesBase, linha.nome, nomesUsados.filter((n, i) => i !== indice), 5) : [];
  const set = (campo, valor) => onChange(indice, { [campo]: valor });
  // Exemplo em cinza só na 1ª linha: repetido em todas parecia já preenchido.
  const exemplo = indice === 0;

  function escolherSugestao(s) {
    const mudanca = { nome: s.nome };
    if (!String(linha.qtdCompra || '').trim()) {
      const p = prefillCompraDeTemplate(s);
      mudanca.qtdCompra = p.qtdCompra;
      mudanca.unCompra = p.unCompra;
      mudanca.unUso = unidadeUsoPadrao(p.unCompra);
    }
    onChange(indice, mudanca);
    setFocado(false);
  }

  function mudarUnidadeCompra(v) {
    const usos = unidadesUsoPara(v);
    onChange(indice, { unCompra: v, unUso: usos.includes(linha.unUso) ? linha.unUso : unidadeUsoPadrao(v) });
  }

  const erro = mostrarErros && calc.status === 'incompleta' ? Object.values(calc.erros)[0] : null;

  return (
    <View style={styles.cartao}>
      <View style={styles.cartaoTopo}>
        <TextInput
          style={[styles.input, { flex: 1 }]}
          value={linha.nome}
          onChangeText={(v) => set('nome', v)}
          onFocus={() => setFocado(true)}
          onBlur={() => setTimeout(() => setFocado(false), 200)}
          placeholder={indice === 0 ? 'Ex.: Farinha de trigo' : 'Ingrediente'}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={`Ingrediente ${indice + 1}`}
        />
        {podeRemover ? (
          <TouchableOpacity onPress={() => onRemover(indice)} style={styles.removerBtn} accessibilityRole="button" accessibilityLabel={`Remover ingrediente ${indice + 1}`} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={18} color={colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
      </View>
      {sugestoes.length ? (
        <View style={styles.chips}>
          {sugestoes.map((s) => (
            <TouchableOpacity key={s.nome} style={styles.chip} onPress={() => escolherSugestao(s)} accessibilityRole="button">
              <Text style={styles.chipTexto}>{s.nome}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.linhaFrase}>
        <Text style={styles.palavra}>Comprei</Text>
        <TextInput style={[styles.input, styles.inputCurto]} value={linha.qtdCompra} onChangeText={(v) => set('qtdCompra', v)} placeholder={exemplo ? '5' : ''} placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Quantidade comprada" />
        <PickerSelect value={linha.unCompra} displayValue={linha.unCompra} onValueChange={mudarUnidadeCompra} options={OPCOES_COMPRA} style={styles.picker} />
        <Text style={styles.palavra}>por R$</Text>
        <TextInput style={[styles.input, styles.inputMedio]} value={linha.valor} onChangeText={(v) => set('valor', v)} placeholder={exemplo ? '25,00' : ''} placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Valor pago" />
      </View>
      <View style={styles.linhaFrase}>
        <Text style={styles.palavra}>Uso</Text>
        <TextInput style={[styles.input, styles.inputCurto]} value={linha.qtdUso} onChangeText={(v) => set('qtdUso', v)} placeholder={exemplo ? '300' : ''} placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Quantidade usada na receita" />
        <PickerSelect value={linha.unUso} displayValue={linha.unUso} onValueChange={(v) => set('unUso', v)} options={unidadesUsoPara(linha.unCompra).map((u) => ({ label: LABEL_UNIDADE[u] || u, value: u }))} style={styles.picker} />
        <Text style={styles.palavra}>na receita</Text>
      </View>

      {calc.status === 'valida' ? (
        <Text style={styles.resultadoLinha}>{calc.fraseCusto} · na receita {formatCurrency(calc.custoNaReceita)}</Text>
      ) : calc.fraseCusto ? (
        <Text style={styles.resultadoLinha}>{calc.fraseCusto}</Text>
      ) : null}
      {erro ? <Text style={styles.erro} accessibilityLiveRegion="polite">{erro}</Text> : null}
    </View>
  );
}

function PassoIngredientes({ nome, linhas, onChange, onRemover, onAdicionar, sugestoesBase, resumo, onContinuar, tentouContinuar }) {
  const nomesUsados = linhas.map((l) => l.nome);
  const pode = resumo.bloqueios.length === 0;
  return (
    <View>
      <Text style={styles.titulo}>O que vai {nome ? `no ${nome}` : 'na receita'}?</Text>
      <Text style={styles.subtitulo}>Coloque os principais ingredientes, do jeito que você compra. 3 ou 4 já dão um bom preço.</Text>
      {linhas.map((l, i) => (
        <LinhaIngrediente
          key={i}
          linha={l}
          indice={i}
          onChange={onChange}
          onRemover={onRemover}
          podeRemover={linhas.length > 1}
          sugestoesBase={sugestoesBase}
          nomesUsados={nomesUsados}
          mostrarErros={tentouContinuar}
        />
      ))}
      {linhas.length < MAX_LINHAS ? (
        <TouchableOpacity style={styles.adicionar} onPress={onAdicionar} accessibilityRole="button">
          <Feather name="plus" size={16} color={colors.primary} style={{ marginRight: 6 }} />
          <Text style={styles.adicionarTexto}>Adicionar ingrediente</Text>
        </TouchableOpacity>
      ) : null}

      <View style={styles.rodape}>
        <Text style={styles.rodapeTexto}>Custo da receita: <Text style={styles.rodapeValor}>{formatCurrency(resumo.custoTotal)}</Text></Text>
        {tentouContinuar && !pode ? <Text style={styles.erro}>{resumo.bloqueios[0]}</Text> : null}
        <TouchableOpacity style={styles.botao} onPress={onContinuar} accessibilityRole="button">
          <Text style={styles.botaoTexto}>Ver o preço</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PassoResultado({ nome, rendimento, resumo, precoInput, setPrecoInput, onSalvar, salvando, erroSalvar, pricingErro, onTentarPricing }) {
  const sufixo = SUFIXO_RENDIMENTO[rendimento.tipo] || 'por unidade';
  const preco = parseDecimalBR(precoInput);
  const pode = (Number.isFinite(preco) && preco > 0) || resumo.precoSugerido > 0;
  return (
    <View>
      <Text style={[styles.titulo, { marginBottom: spacing.md }]}>O preço do seu {nome || 'produto'}</Text>

      <View style={styles.cartao}>
        <Text style={styles.resumoLabel}>Custo dos ingredientes {sufixo}</Text>
        <Text style={styles.resumoValor}>{formatCurrency(resumo.cmvUnitario)}</Text>
      </View>

      <View style={[styles.cartao, styles.cartaoDestaque]}>
        <Text style={[styles.resumoLabel, { color: '#fff' }]}>Preço sugerido {sufixo}</Text>
        {pricingErro ? (
          <View>
            <Text style={[styles.dica, { color: '#fff' }]}>Não conseguimos calcular o preço sugerido agora.</Text>
            <TouchableOpacity onPress={onTentarPricing} accessibilityRole="button"><Text style={[styles.linkTexto, { color: '#fff' }]}>Tentar de novo</Text></TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.sugeridoValor}>{formatCurrency(resumo.precoSugerido)}</Text>
        )}
        {resumo.semFixos ? (
          <Text style={styles.sugeridoDica}>Cobre os ingredientes e deixa 15% de lucro. Ainda sem seus custos do mês (aluguel, luz, embalagem): no próximo passo você inclui.</Text>
        ) : null}
      </View>

      <Text style={styles.label}>Vou cobrar</Text>
      <View style={styles.linhaFrase}>
        <Text style={styles.palavra}>R$</Text>
        <TextInput style={[styles.input, styles.inputMedio]} value={precoInput} onChangeText={setPrecoInput} placeholder={precoParaCampo(resumo.precoSugerido) || '0,00'} placeholderTextColor={colors.placeholder} keyboardType="decimal-pad" inputMode="decimal" accessibilityLabel="Preço de venda" />
        <Text style={styles.palavra}>{sufixo}</Text>
      </View>
      <Text style={styles.dica}>Pode mudar quando quiser. Deixe em branco para usar o sugerido.</Text>

      {erroSalvar ? <Text style={styles.erro} accessibilityLiveRegion="polite">{erroSalvar}</Text> : null}
      <TouchableOpacity style={[styles.botao, (!pode || salvando) && styles.botaoDesabilitado]} onPress={onSalvar} disabled={!pode || salvando} accessibilityRole="button">
        {salvando ? <ActivityIndicator color="#fff" /> : (
          <>
            <Feather name="check" size={18} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.botaoTexto}>Salvar com esse preço</Text>
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

function PassoFinanceiro({ salvo, onAjustar, onPular }) {
  return (
    <View>
      <View style={styles.sucessoIcone}><Feather name="check" size={28} color="#fff" /></View>
      <Text style={[styles.titulo, { textAlign: 'center' }]}>Seu primeiro preço está pronto!</Text>
      <Text style={[styles.subtitulo, { textAlign: 'center' }]}>
        {salvo.nome} salvo a {formatCurrency(salvo.preco)} {salvo.sufixo}. Ele já aparece em Produtos.
      </Text>
      {salvo.temFinanceiro ? (
        <TouchableOpacity style={styles.botao} onPress={onPular} accessibilityRole="button">
          <Text style={styles.botaoTexto}>Ir para o app</Text>
          <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      ) : (
        <>
          <View style={styles.cartao}>
            <Text style={styles.cartaoTitulo}>Deixe esse preço mais certo</Text>
            <Text style={styles.dica}>
              Hoje o preço cobre os ingredientes e 15% de lucro. Com seus custos do mês (aluguel, luz, taxas do cartão e do iFood), ele fica certo de verdade. São 4 perguntas rápidas.
            </Text>
          </View>
          <TouchableOpacity style={styles.botao} onPress={onAjustar} accessibilityRole="button">
            <Text style={styles.botaoTexto}>Ajustar agora</Text>
            <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.link} onPress={onPular} accessibilityRole="button">
            <Text style={styles.linkTexto}>Agora não, ir para o app</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

// ---------- tela ----------

export default function PrimeiroProdutoScreen({ navigation, route }) {
  const { user } = useAuth();
  const [passo, setPasso] = useState('produto');
  const [nome, setNome] = useState('');
  const [rendimento, setRendimento] = useState({ tipo: 'unidade', qtd: '' });
  const [linhas, setLinhas] = useState(() => Array.from({ length: LINHAS_INICIAIS }, linhaVazia));
  const [precoInput, setPrecoInput] = useState('');
  const [segKey, setSegKey] = useState(() => segmentoKeyDoTexto(route?.params?.segmento));
  const [pricingConfig, setPricingConfig] = useState(null);
  const [pricingErro, setPricingErro] = useState(false);
  const [tentouContinuar, setTentouContinuar] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erroSalvar, setErroSalvar] = useState(null);
  const [salvo, setSalvo] = useState(null);
  const salvandoRef = useRef(false);
  const rascunhoCarregado = useRef(false);
  const scrollRef = useRef(null);

  const sugestoesBase = useMemo(() => sugestoesIngredientes(segKey), [segKey]);
  const sugestoesNome = useMemo(() => sugestoesProduto(segKey), [segKey]);
  const resumo = useMemo(() => resumoReceita(linhas, rendimento, pricingConfig), [linhas, rendimento, pricingConfig]);

  const carregarPricing = useCallback(async () => {
    setPricingErro(false);
    try {
      const db = await getDatabase();
      const [cfgs, fixas, vars, fat] = (await Promise.all([
        db.getAllAsync('SELECT * FROM configuracao'),
        db.getAllAsync('SELECT * FROM despesas_fixas'),
        db.getAllAsync('SELECT * FROM despesas_variaveis'),
        db.getAllAsync('SELECT * FROM faturamento_mensal'),
      ])).map(rowsOrThrow);
      setPricingConfig(buildPricingConfig({ cfgs, fixas, vars, fat }));
    } catch (e) {
      console.warn('[PrimeiroProduto.carregarPricing]', e);
      setPricingErro(true);
    }
  }, []);

  // Abertura: marca a oferta como feita (a rota de entrada não traz de novo),
  // lê o segmento se não veio do perfil, carrega o Financeiro e o rascunho.
  useEffect(() => {
    AsyncStorage.setItem(CHAVE_OFERTA_PRIMEIRO_PRODUTO, 'true').catch(() => {});
    carregarPricing();
    (async () => {
      if (!segKey) {
        try {
          const db = await getDatabase();
          const rows = await db.getAllAsync('SELECT segmento FROM perfil LIMIT 1');
          const k = segmentoKeyDoTexto(rows?.[0]?.segmento);
          if (k) setSegKey(k);
        } catch (_) { /* sugestões gerais servem */ }
      }
      try {
        const raw = await AsyncStorage.getItem(chaveRascunho(user?.id));
        const r = raw ? JSON.parse(raw) : null;
        if (r && typeof r === 'object') {
          if (typeof r.nome === 'string') setNome(r.nome);
          if (r.rendimento?.tipo) setRendimento(r.rendimento);
          if (Array.isArray(r.linhas) && r.linhas.length) setLinhas(r.linhas.slice(0, MAX_LINHAS).map((l) => ({ ...linhaVazia(), ...l })));
          if (PASSOS.includes(r.passo)) setPasso(r.passo);
        }
      } catch (_) { /* rascunho é conveniência */ }
      rascunhoCarregado.current = true;
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rascunho: quem sai no meio volta de onde parou.
  useEffect(() => {
    if (!rascunhoCarregado.current || salvo) return undefined;
    const t = setTimeout(() => {
      AsyncStorage.setItem(chaveRascunho(user?.id), JSON.stringify({ passo, nome, rendimento, linhas })).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [passo, nome, rendimento, linhas, salvo, user?.id]);

  const irPara = useCallback((p) => {
    setPasso(p);
    setTentouContinuar(false);
    setTimeout(() => scrollRef.current?.scrollTo?.({ y: 0, animated: false }), 0);
  }, []);

  const voltar = useCallback(() => {
    const idx = PASSOS.indexOf(passo);
    if (idx > 0) { irPara(PASSOS[idx - 1]); return true; }
    return false;
  }, [passo, irPara]);

  // Android: o botão voltar volta um passo.
  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', voltar);
    return () => sub.remove();
  }, [voltar]);

  const abrirApp = useCallback(async (destino) => {
    try { await AsyncStorage.setItem('onboarding_done', 'true'); } catch (_) {}
    const routes = destino === 'financeiro'
      ? [{ name: 'MainTabs', params: { initialTab: 'Mais' }, state: { index: 0, routes: [{ name: 'Mais', state: { index: 1, routes: [{ name: 'MaisMain' }, { name: 'FinanceiroMain' }] } }] } }]
      : [{ name: 'MainTabs', params: { initialTab: 'Início' } }];
    navigation.dispatch(CommonActions.reset({ index: 0, routes }));
  }, [navigation]);

  const podeContinuarProduto = !!nome.trim() && parseDecimalBR(rendimento.qtd) > 0;

  function mudarLinha(i, mudanca) {
    setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...mudanca } : l)));
  }
  function removerLinha(i) {
    setLinhas((ls) => (ls.length > 1 ? ls.filter((_, j) => j !== i) : ls));
  }
  function adicionarLinha() {
    setLinhas((ls) => (ls.length < MAX_LINHAS ? [...ls, linhaVazia()] : ls));
  }

  function continuarIngredientes() {
    setTentouContinuar(true);
    if (resumo.bloqueios.length) return;
    irPara('resultado');
  }

  async function salvar() {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSalvando(true);
    setErroSalvar(null);
    try {
      const payload = montarPayloadPrimeiroProduto({ nome, rendimento, linhas }, pricingConfig, precoInput);
      if (!(payload.preco.preco > 0)) {
        setErroSalvar('Diga quanto vai cobrar.');
        return;
      }
      const db = await getDatabase();
      await salvarPrimeiroProduto(db, payload);
      try { await AsyncStorage.setItem('onboarding_done', 'true'); } catch (_) {}
      try { await AsyncStorage.removeItem(chaveRascunho(user?.id)); } catch (_) {}
      try { clearQueryCache(); } catch (_) {}
      notifyDataChanged('materias_primas');
      notifyDataChanged('produtos');
      trackPrimeiroPrecoOnce(user, payload.preco.preco);
      setSalvo({
        nome: payload.produto.nome,
        preco: payload.preco.preco,
        sufixo: SUFIXO_RENDIMENTO[rendimento.tipo] || 'por unidade',
        temFinanceiro: resumo.temFinanceiro,
      });
      setPasso('financeiro');
    } catch (e) {
      console.error('[PrimeiroProduto.salvar]', e);
      setErroSalvar('Não conseguimos salvar. Verifique a internet e tente de novo.');
    } finally {
      salvandoRef.current = false;
      setSalvando(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Cabecalho passo={passo} onVoltar={voltar} />
      <ScrollView ref={scrollRef} contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.coluna}>
          {passo === 'produto' && (
            <PassoProduto
              nome={nome}
              setNome={setNome}
              rendimento={rendimento}
              setRendimento={setRendimento}
              sugestoes={sugestoesNome}
              podeContinuar={podeContinuarProduto}
              onContinuar={() => irPara('ingredientes')}
              onExplorar={() => abrirApp('inicio')}
            />
          )}
          {passo === 'ingredientes' && (
            <PassoIngredientes
              nome={nome.trim()}
              linhas={linhas}
              onChange={mudarLinha}
              onRemover={removerLinha}
              onAdicionar={adicionarLinha}
              sugestoesBase={sugestoesBase}
              resumo={resumo}
              onContinuar={continuarIngredientes}
              tentouContinuar={tentouContinuar}
            />
          )}
          {passo === 'resultado' && (
            <PassoResultado
              nome={nome.trim()}
              rendimento={rendimento}
              resumo={resumo}
              precoInput={precoInput}
              setPrecoInput={setPrecoInput}
              onSalvar={salvar}
              salvando={salvando}
              erroSalvar={erroSalvar}
              pricingErro={pricingErro}
              onTentarPricing={carregarPricing}
            />
          )}
          {passo === 'financeiro' && salvo && (
            <PassoFinanceiro salvo={salvo} onAjustar={() => abrirApp('financeiro')} onPular={() => abrirApp('inicio')} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.background },
  cabecalho: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, paddingTop: Platform.OS === 'ios' ? 48 : spacing.sm },
  cabecalhoLinha: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, maxWidth: 560, width: '100%', alignSelf: 'center' },
  voltarBtn: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  passoTexto: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.textSecondary },
  progressoFundo: { height: 4, backgroundColor: colors.border },
  progressoBarra: { height: 4, backgroundColor: colors.primary },
  conteudo: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  coluna: { maxWidth: 560, width: '100%', alignSelf: 'center' },
  titulo: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.bold, color: colors.text, marginTop: spacing.sm, marginBottom: spacing.xs },
  subtitulo: { fontSize: fonts.regular, lineHeight: 22, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.lg },
  label: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: spacing.xs },
  input: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: fonts.regular, fontFamily: fontFamily.regular, color: colors.text, minHeight: 44 },
  inputCurto: { width: 80, textAlign: 'center' },
  inputMedio: { width: 104 },
  picker: { marginBottom: 0, width: 92 },
  linhaFrase: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  palavra: { fontSize: fonts.regular, fontFamily: fontFamily.medium, color: colors.text },
  dica: { fontSize: fonts.tiny + 1, lineHeight: 18, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.xs },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs + 2, marginTop: spacing.sm },
  chip: { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: borderRadius.full, paddingHorizontal: 12, paddingVertical: 7 },
  chipAtivo: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipTexto: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.text },
  chipTextoAtivo: { color: '#fff' },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 52, paddingHorizontal: spacing.lg, marginTop: spacing.lg },
  botaoDesabilitado: { opacity: 0.45 },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
  link: { alignItems: 'center', paddingVertical: spacing.md },
  linkTexto: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
  cartao: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.md },
  cartaoTopo: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cartaoTitulo: { fontSize: fonts.medium, fontFamily: fontFamily.bold, color: colors.text },
  cartaoDestaque: { backgroundColor: colors.primary, borderColor: colors.primary },
  removerBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  resultadoLinha: { marginTop: spacing.sm, fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.primary },
  erro: { marginTop: spacing.xs, fontSize: fonts.tiny + 1, fontFamily: fontFamily.medium, color: colors.error },
  adicionar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.primary, borderRadius: borderRadius.md },
  adicionarTexto: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold },
  rodape: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.border },
  rodapeTexto: { fontSize: fonts.regular, fontFamily: fontFamily.medium, color: colors.text },
  rodapeValor: { fontFamily: fontFamily.bold, color: colors.primary },
  resumoLabel: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.textSecondary },
  resumoValor: { fontSize: 22, fontFamily: fontFamily.bold, color: colors.text, marginTop: 2 },
  sugeridoValor: { fontSize: 34, fontFamily: fontFamily.extraBold, color: '#fff', marginTop: 2 },
  sugeridoDica: { fontSize: fonts.tiny + 1, lineHeight: 18, fontFamily: fontFamily.regular, color: '#ffffffd9', marginTop: spacing.sm },
  sucessoIcone: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginTop: spacing.lg, marginBottom: spacing.sm },
});
