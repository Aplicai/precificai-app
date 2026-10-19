/**
 * Primeiro preço (19/10/2026): o "momento de valor" logo depois do 1º Preço
 * rápido salvo. Antes a pessoa caía direto na Home; só 1 em 3 fazia o 2º
 * preço e ninguém que começou no navegador do Instagram voltou outro dia.
 *
 * Nesta ordem:
 *   a) "Preço salvo ✓": produto, preço e o que ele cobre;
 *   b) "Calcular o 2º produto (15 s)": Preço rápido em modo próximo, sem
 *      passar pela Home;
 *   c) WhatsApp: aceite explícito (LGPD) para receber preços e lembretes.
 *      Grava `perfil.telefone` e `perfil.whatsapp_lembretes` (migration
 *      20261019120000). O app não manda mensagem nenhuma: só guarda o aceite;
 *   d) só dentro do Instagram/Facebook: "Salve seu preço fora do Instagram".
 *      Android abre no Chrome já logado pelo link de acesso de uso único
 *      (edge function `link-acesso`); iPhone tenta o Safari e ensina pelo menu.
 *      Falhou o link: abre sem login, como o aviso do topo;
 *   e) "Ir para o app".
 *
 * Eventos Meta: PrimeiroPrecoVisto, WhatsAppLembretesOk, AbrirNoChrome /
 * AbrirNoSafari (content_name 'primeiro_preco').
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, KeyboardAvoidingView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CommonActions } from '@react-navigation/native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';
import { LUCRO_PADRAO } from '../utils/precoRapido';
import { linhaCobertura } from '../utils/primeiroPreco';
import { formatarTelefoneBR, consentimentoWhatsApp } from '../utils/telefoneBR';
import { deveOferecerChrome, deveOferecerSafari, urlAbrirNoChrome, urlAbrirNoSafari } from '../utils/navegadorInterno';
import { isErrorResult as isDbErrorResult } from '../database/dbResult';
import { getDatabase } from '../database/database';
import { supabase } from '../config/supabase';
import { notifyDataChanged } from '../utils/dataSync';
import { trackEvent } from '../utils/marketing';
import { ocultarAvisoTopo } from '../utils/avisoInstalar';

function userAgent() {
  try { return (typeof navigator !== 'undefined' && navigator.userAgent) || ''; } catch { return ''; }
}

const AJUDA_IPHONE = 'Se não abriu, toque em ⋯ no canto de cima e em "Abrir no navegador externo". Lá, entre com o mesmo Google ou e-mail.';

/** Link de acesso de uso único para abrir o app já logado fora do Instagram. */
async function pedirLinkAcesso() {
  try {
    const { data, error } = await supabase.functions.invoke('link-acesso', { body: {} });
    if (error || !data?.ok || typeof data.link !== 'string' || !data.link.startsWith('https://')) return null;
    return data.link;
  } catch {
    return null;
  }
}

export default function PrimeiroPrecoScreen({ navigation, route }) {
  const params = route?.params || {};
  const [produto, setProduto] = useState(() => (
    params.nome && Number(params.preco) > 0 ? { nome: String(params.nome), preco: Number(params.preco) } : null
  ));
  const lucro = Number(params.lucro) > 0 ? Number(params.lucro) : LUCRO_PADRAO;

  const [perfilId, setPerfilId] = useState(null);
  const [telefone, setTelefone] = useState('');
  // livre | salvando | feito | erro
  const [whats, setWhats] = useState({ estado: 'livre', texto: null });

  const ua = Platform.OS === 'web' ? userAgent() : '';
  const noChrome = deveOferecerChrome(ua);
  const noSafari = deveOferecerSafari(ua);
  const [abrindo, setAbrindo] = useState(false);
  const [ajudaFora, setAjudaFora] = useState(null);

  // Esta tela tem o próprio cartão "fora do Instagram": sem o aviso do topo.
  useEffect(() => ocultarAvisoTopo(), []);

  useEffect(() => {
    trackEvent('PrimeiroPrecoVisto', { content_name: 'primeiro_preco' });
  }, []);

  // Telefone do perfil (e se já aceitou). Sem params (recarregou a página):
  // o último produto com preço.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const db = await getDatabase();
        const perfis = await db.getAllAsync('SELECT * FROM perfil LIMIT 1');
        if (vivo && Array.isArray(perfis) && !isDbErrorResult(perfis) && perfis[0]) {
          const p = perfis[0];
          setPerfilId(p.id ?? null);
          if (p.telefone) setTelefone(formatarTelefoneBR(p.telefone));
          if (p.whatsapp_lembretes === true) setWhats({ estado: 'feito', texto: 'Combinado. Você vai receber seus preços e lembretes no WhatsApp.' });
        }
        if (!produto) {
          const prods = await db.getAllAsync('SELECT nome, preco_venda FROM produtos WHERE preco_venda > 0 ORDER BY id DESC LIMIT 1');
          if (vivo && Array.isArray(prods) && !isDbErrorResult(prods) && prods[0]) {
            setProduto({ nome: String(prods[0].nome || ''), preco: Number(prods[0].preco_venda) || 0 });
          }
        }
      } catch (_) { /* a tela funciona sem: telefone em branco */ }
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function irParaApp() {
    if (navigation.canGoBack()) navigation.goBack();
    else navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab: 'Início' } }] }));
  }

  function calcularSegundo() {
    navigation.navigate('PrecoRapido', { proximo: true });
  }

  async function quererReceber() {
    if (whats.estado === 'salvando') return;
    const c = consentimentoWhatsApp(telefone);
    if (!c.ok) { setWhats({ estado: 'erro', texto: c.erro }); return; }
    setWhats({ estado: 'salvando', texto: null });
    try {
      const db = await getDatabase();
      let id = perfilId;
      if (id == null) {
        const perfis = await db.getAllAsync('SELECT id FROM perfil LIMIT 1');
        if (!Array.isArray(perfis) || isDbErrorResult(perfis) || !perfis[0]) throw new Error('perfil indisponível');
        id = perfis[0].id;
        setPerfilId(id);
      }
      const { telefone: tel, whatsapp_lembretes: aceite, whatsapp_lembretes_em: em } = c.campos;
      await db.runAsync(
        'UPDATE perfil SET telefone = ?, whatsapp_lembretes = ?, whatsapp_lembretes_em = ? WHERE id = ?',
        [tel, aceite, em, id]
      );
      notifyDataChanged('perfil');
      setTelefone(tel);
      trackEvent('WhatsAppLembretesOk', { content_name: 'primeiro_preco' });
      setWhats({ estado: 'feito', texto: 'Combinado. Você vai receber seus preços e lembretes no WhatsApp.' });
    } catch (e) {
      console.error('[PrimeiroPreco.whatsapp]', e?.message || e);
      setWhats({ estado: 'erro', texto: 'Não deu para salvar agora. Verifique a internet e tente de novo.' });
    }
  }

  async function abrirFora() {
    if (abrindo) return;
    setAbrindo(true);
    setAjudaFora(null);
    trackEvent(noChrome ? 'AbrirNoChrome' : 'AbrirNoSafari', { content_name: 'primeiro_preco' });
    const link = await pedirLinkAcesso();
    try {
      if (noChrome) {
        // Com o link: o Chrome abre já logado. Sem: abre a mesma página (pede login lá).
        window.location.href = link ? urlAbrirNoChrome(link, { marcarInstalar: false }) : urlAbrirNoChrome(window.location.href);
      } else {
        window.location.href = link ? urlAbrirNoSafari(link, { marcarInstalar: false }) : urlAbrirNoSafari(window.location.href);
        // A página continua na tela: o Instagram não deixou abrir. Ensina pelo menu.
        setTimeout(() => {
          try { if (document.visibilityState === 'visible') setAjudaFora(AJUDA_IPHONE); } catch (_) { setAjudaFora(AJUDA_IPHONE); }
        }, 1500);
      }
    } catch (_) {
      setAjudaFora(AJUDA_IPHONE);
    } finally {
      setTimeout(() => setAbrindo(false), 1500);
    }
  }

  const salvandoWhats = whats.estado === 'salvando';

  return (
    <KeyboardAvoidingView style={styles.tela} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.conteudo} keyboardShouldPersistTaps="handled">
        <View style={styles.coluna}>
          {/* a) Preço salvo */}
          <View style={styles.salvo}>
            <Text style={styles.salvoTitulo}>Preço salvo ✓</Text>
            {produto ? (
              <>
                <Text style={styles.salvoProduto} numberOfLines={2}>{produto.nome}</Text>
                <Text style={styles.salvoPreco}>{formatCurrency(produto.preco)} <Text style={styles.salvoUnidade}>por unidade</Text></Text>
              </>
            ) : null}
            <Text style={styles.salvoLinha}>{linhaCobertura(lucro)}</Text>
          </View>

          {/* b) 2º produto, sem passar pela Home */}
          <TouchableOpacity style={styles.botao} onPress={calcularSegundo} accessibilityRole="button">
            <Text style={styles.botaoTexto}>Calcular o 2º produto (15 s)</Text>
            <Feather name="arrow-right" size={18} color="#fff" style={{ marginLeft: 8 }} />
          </TouchableOpacity>
          <Text style={styles.dicaBotao}>Seus gastos e vendas do mês já estão salvos. Com 3 produtos, você ganha sua tabela de preços.</Text>

          {/* c) WhatsApp: aceite explícito */}
          <View style={styles.cartao}>
            <View style={styles.cartaoTopo}>
              <Feather name="message-circle" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
              <Text style={styles.cartaoTitulo}>Quer receber seus preços e lembretes no WhatsApp?</Text>
            </View>
            {whats.estado === 'feito' ? (
              <Text style={styles.feito} accessibilityLiveRegion="polite">{whats.texto}</Text>
            ) : (
              <>
                <Text style={styles.cartaoTexto}>Você recebe sua tabela de preços e lembretes para revisar os preços. Só mandamos com o seu aceite, e você pode parar quando quiser.</Text>
                <Text style={styles.label}>Seu WhatsApp</Text>
                <TextInput
                  style={styles.input}
                  value={telefone}
                  onChangeText={(v) => { setTelefone(formatarTelefoneBR(v)); if (whats.estado === 'erro') setWhats({ estado: 'livre', texto: null }); }}
                  placeholder="(00) 00000-0000"
                  placeholderTextColor={colors.placeholder}
                  keyboardType="phone-pad"
                  inputMode="tel"
                  autoComplete="tel"
                  accessibilityLabel="Seu número de WhatsApp com DDD"
                />
                {whats.estado === 'erro' && whats.texto ? <Text style={styles.erro} accessibilityLiveRegion="polite">{whats.texto}</Text> : null}
                <TouchableOpacity style={[styles.botaoWhats, salvandoWhats && { opacity: 0.6 }]} onPress={quererReceber} disabled={salvandoWhats} accessibilityRole="button">
                  {salvandoWhats ? <ActivityIndicator color="#fff" /> : <Text style={styles.botaoTexto}>Quero receber</Text>}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* d) Só no navegador do Instagram/Facebook */}
          {noChrome || noSafari ? (
            <View style={styles.cartao}>
              <View style={styles.cartaoTopo}>
                <Feather name="external-link" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
                <Text style={styles.cartaoTitulo}>Salve seu preço fora do Instagram</Text>
              </View>
              <Text style={styles.cartaoTexto}>
                {noChrome
                  ? 'Ao fechar o Instagram, esta página some. No Chrome você já entra logado e pode salvar o app na tela inicial.'
                  : 'Ao fechar o Instagram, esta página some. Abra no Safari e salve o app na tela de início.'}
              </Text>
              {ajudaFora ? <Text style={styles.ajuda} accessibilityLiveRegion="polite">{ajudaFora}</Text> : null}
              <TouchableOpacity style={[styles.botaoSecundario, abrindo && { opacity: 0.6 }]} onPress={abrirFora} disabled={abrindo} accessibilityRole="button">
                {abrindo ? <ActivityIndicator color={colors.primary} /> : (
                  <Text style={styles.botaoSecundarioTexto}>{noChrome ? 'Abrir no Chrome' : 'Abrir no Safari'}</Text>
                )}
              </TouchableOpacity>
            </View>
          ) : null}

          {/* e) Ir para o app */}
          <TouchableOpacity style={styles.irApp} onPress={irParaApp} accessibilityRole="button">
            <Text style={styles.irAppTexto}>Ir para o app</Text>
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
  salvo: { backgroundColor: colors.primary, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md, marginBottom: spacing.md },
  salvoTitulo: { fontSize: fonts.medium, fontFamily: fontFamily.bold, color: '#fff', marginBottom: spacing.sm },
  salvoProduto: { fontSize: fonts.regular, fontFamily: fontFamily.medium, color: '#ffffffcc' },
  salvoPreco: { fontSize: 34, fontFamily: fontFamily.extraBold, color: '#fff', marginTop: 2 },
  salvoUnidade: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: '#ffffffcc' },
  salvoLinha: { fontSize: fonts.small, lineHeight: 20, fontFamily: fontFamily.medium, color: '#fff', marginTop: spacing.sm, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#ffffff33' },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 52, paddingHorizontal: spacing.md },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
  dicaBotao: { fontSize: fonts.tiny + 1, lineHeight: 18, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md, textAlign: 'center' },
  cartao: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm + 4 },
  cartaoTopo: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: spacing.xs },
  cartaoTitulo: { flex: 1, fontSize: fonts.medium, lineHeight: 22, fontFamily: fontFamily.bold, color: colors.text },
  cartaoTexto: { fontSize: fonts.small + 1, lineHeight: 21, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.sm },
  label: { fontSize: fonts.small, fontFamily: fontFamily.semiBold, color: colors.text, marginBottom: 4 },
  input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.sm, paddingHorizontal: 12, paddingVertical: 10, fontSize: fonts.regular, fontFamily: fontFamily.semiBold, color: colors.text, minHeight: 44 },
  erro: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.error, marginTop: spacing.xs },
  botaoWhats: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#1f8f4e', borderRadius: borderRadius.md, minHeight: 48, marginTop: spacing.sm },
  feito: { fontSize: fonts.small + 1, lineHeight: 21, fontFamily: fontFamily.medium, color: colors.success },
  ajuda: { fontSize: fonts.small, lineHeight: 20, fontFamily: fontFamily.regular, color: colors.text, marginBottom: spacing.sm },
  botaoSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md, minHeight: 46, paddingHorizontal: spacing.sm },
  botaoSecundarioTexto: { color: colors.primary, fontSize: fonts.small + 1, fontFamily: fontFamily.semiBold, textAlign: 'center' },
  irApp: { alignItems: 'center', justifyContent: 'center', minHeight: 44, paddingVertical: spacing.md, marginTop: spacing.sm },
  irAppTexto: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
});
