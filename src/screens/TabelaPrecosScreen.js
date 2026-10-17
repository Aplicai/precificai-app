/**
 * Tabela de preços (escada dos 3 preços, 17/10/2026): a recompensa do 3º
 * produto com preço e atalho em "Mais".
 *
 * Os produtos com preço num texto pronto para o WhatsApp (wa.me abre o app ou
 * o WhatsApp Web; "Copiar" é o plano B). Aqui também:
 *   - o aviso "Instale o app" é liberado (antes era no 1º preço);
 *   - no celular, o cartão "No computador você vê tudo" (copiar o link ou
 *     receber no próprio e-mail, edge function `enviar-link-computador`).
 *
 * Texto: src/utils/escadaPrecos.js.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Platform, Linking, Share } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CommonActions, useFocusEffect } from '@react-navigation/native';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { formatCurrency } from '../utils/calculations';
import { textoTabelaPrecos, etapaEscada, LINK_APP } from '../utils/escadaPrecos';
import { getDatabase } from '../database/database';
import { rowsOrThrow } from '../database/dbResult';
import { supabase } from '../config/supabase';
import { trackEvent } from '../utils/marketing';
import { showToast } from '../utils/toastBus';
import { liberarAvisoInstalar, ocultarAvisoTopo } from '../utils/avisoInstalar';
import { canInstall, isInstalled, promptInstall } from '../utils/pwaInstall';
import { ehIPhone, deveOferecerChrome, deveOferecerSafari, urlAbrirNoChrome } from '../utils/navegadorInterno';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

function userAgent() {
  try { return (typeof navigator !== 'undefined' && navigator.userAgent) || ''; } catch { return ''; }
}

/** Celular de verdade: app nativo ou navegador de iPhone/Android em tela estreita. */
function ehCelular(isMobile) {
  if (Platform.OS !== 'web') return true;
  const ua = userAgent();
  return isMobile && (ehIPhone(ua) || /Android/i.test(ua));
}

/** Copia no web; no app nativo (sem área de transferência instalada) abre o compartilhar. */
async function copiarTexto(texto) {
  if (Platform.OS !== 'web') {
    try { await Share.share({ message: texto }); return true; } catch { return false; }
  }
  try {
    if (navigator?.clipboard?.writeText) { await navigator.clipboard.writeText(texto); return true; }
  } catch { /* tenta o jeito antigo */ }
  try {
    const el = document.createElement('textarea');
    el.value = texto;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch { return false; }
}

export default function TabelaPrecosScreen({ navigation, route }) {
  const pronta = !!route?.params?.pronta;
  const { isMobile } = useResponsiveLayout();
  const celular = ehCelular(isMobile);
  const [produtos, setProdutos] = useState([]);
  const [nomeNegocio, setNomeNegocio] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState(false);
  const [email, setEmail] = useState({ estado: 'livre', texto: null }); // livre | enviando | feito | erro
  const [instalar, setInstalar] = useState(() => Platform.OS === 'web' && !isInstalled());
  const [instalarAjuda, setInstalarAjuda] = useState(null);

  // Esta tela tem o próprio cartão "Salve o app": sem o aviso do topo.
  useEffect(() => ocultarAvisoTopo(), []);

  useEffect(() => {
    // O aviso "Instale o app" sai do 1º preço e passa para cá.
    liberarAvisoInstalar();
    if (pronta) trackEvent('TabelaPrecosPronta', { content_name: 'tabela_precos' });
  }, [pronta]);

  const carregar = useCallback(async () => {
    setErroCarga(false);
    try {
      const db = await getDatabase();
      const [prods, perfil] = await Promise.all([
        db.getAllAsync('SELECT id, nome, preco_venda FROM produtos WHERE preco_venda > 0 ORDER BY nome'),
        db.getAllAsync('SELECT nome_negocio FROM perfil LIMIT 1'),
      ]);
      setProdutos(rowsOrThrow(prods).map((p) => ({ id: p.id, nome: p.nome, preco: Number(p.preco_venda) || 0 })));
      setNomeNegocio((Array.isArray(perfil) && perfil[0]?.nome_negocio ? String(perfil[0].nome_negocio) : '').trim());
    } catch (e) {
      console.error('[TabelaPrecos.carregar]', e);
      setErroCarga(true);
    } finally {
      setCarregando(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const texto = textoTabelaPrecos(nomeNegocio, produtos);
  const escada = etapaEscada(produtos.length);

  function irParaPainel() {
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'MainTabs', params: { initialTab: 'Início' } }] }));
  }

  async function enviarWhatsApp() {
    trackEvent('TabelaPrecosEnviada', { content_name: 'whatsapp' });
    try {
      await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(texto)}`);
    } catch {
      showToast('Não abriu o WhatsApp. Toque em Copiar e cole na conversa.', 'alert-circle', 3500);
    }
  }

  async function copiarTabela() {
    trackEvent('TabelaPrecosEnviada', { content_name: 'copiar' });
    const ok = await copiarTexto(texto);
    if (Platform.OS === 'web') showToast(ok ? 'Tabela copiada. Cole no WhatsApp.' : 'Não deu para copiar. Selecione o texto e copie.', ok ? 'check-circle' : 'alert-circle');
  }

  async function copiarLink() {
    trackEvent('LinkComputadorPedido', { content_name: 'copiar' });
    const ok = await copiarTexto(LINK_APP);
    if (Platform.OS === 'web') showToast(ok ? 'Link copiado.' : `Não deu para copiar. O link é ${LINK_APP.replace('https://', '')}`, ok ? 'check-circle' : 'alert-circle', 3500);
  }

  async function mandarLinkEmail() {
    if (email.estado === 'enviando') return;
    trackEvent('LinkComputadorPedido', { content_name: 'email' });
    setEmail({ estado: 'enviando', texto: null });
    try {
      const { data, error } = await supabase.functions.invoke('enviar-link-computador', { body: {} });
      let corpo = data;
      if (error) {
        try { corpo = error.context && (await error.context.json?.()); } catch (_) { corpo = null; }
      }
      if (corpo?.ok) {
        setEmail({ estado: 'feito', texto: corpo.email ? `Enviamos o link para ${corpo.email}.` : 'Enviamos o link para o seu e-mail.' });
      } else if (corpo?.error === 'limite') {
        setEmail({ estado: 'feito', texto: 'Já enviamos o link hoje. Procure no seu e-mail (veja também o spam).' });
      } else {
        setEmail({ estado: 'erro', texto: 'Não deu para enviar agora. Copie o link.' });
      }
    } catch {
      setEmail({ estado: 'erro', texto: 'Não deu para enviar agora. Copie o link.' });
    }
  }

  async function salvarApp() {
    const ua = userAgent();
    // Dentro do Instagram/Facebook não dá para instalar: Android abre no Chrome.
    if (deveOferecerChrome(ua)) {
      trackEvent('AbrirNoChrome', { content_name: 'tabela_precos' });
      window.location.href = urlAbrirNoChrome(window.location.href);
      return;
    }
    if (deveOferecerSafari(ua)) {
      setInstalarAjuda('Toque em ⋯ no canto de cima e em "Abrir no navegador externo". No Safari, toque em Compartilhar e em "Adicionar à Tela de Início".');
      return;
    }
    if (canInstall()) {
      const r = await promptInstall();
      if (r === 'accepted') {
        trackEvent('InstalouApp', { content_name: 'tabela_precos' });
        setInstalar(false);
        return;
      }
      if (r === 'dismissed') return;
    }
    setInstalarAjuda(ehIPhone(userAgent())
      ? 'No Safari, toque em Compartilhar e em "Adicionar à Tela de Início".'
      : 'Toque no menu ⋮ do navegador e em "Instalar app" ou "Adicionar à tela inicial".');
  }

  return (
    <ScrollView style={styles.tela} contentContainerStyle={styles.conteudo}>
      <View style={styles.coluna}>
        {!pronta && navigation.canGoBack() ? (
          <TouchableOpacity style={styles.voltar} onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel="Voltar">
            <Feather name="arrow-left" size={18} color={colors.primary} style={{ marginRight: 6 }} />
            <Text style={styles.linkTexto}>Voltar</Text>
          </TouchableOpacity>
        ) : null}

        {pronta ? <View style={styles.selo}><Feather name="award" size={14} color={colors.primary} style={{ marginRight: 6 }} /><Text style={styles.seloTexto}>{escada.meta} de {escada.meta} preços</Text></View> : null}
        <Text style={styles.titulo}>{pronta ? 'Sua tabela de preços está pronta' : 'Sua tabela de preços'}</Text>
        <Text style={styles.subtitulo}>Mande para seus clientes no WhatsApp ou copie e cole onde quiser.</Text>

        {carregando ? (
          <ActivityIndicator color={colors.primary} style={{ marginVertical: spacing.xl }} />
        ) : erroCarga ? (
          <View style={styles.cartao}>
            <Text style={styles.erro}>Não conseguimos carregar seus produtos. Verifique a internet.</Text>
            <TouchableOpacity style={styles.botaoSecundario} onPress={() => { setCarregando(true); carregar(); }} accessibilityRole="button">
              <Text style={styles.botaoSecundarioTexto}>Tentar de novo</Text>
            </TouchableOpacity>
          </View>
        ) : produtos.length === 0 ? (
          <View style={styles.cartao}>
            <Text style={styles.cartaoTexto}>Nenhum produto tem preço ainda. Calcule o primeiro e ele entra na tabela.</Text>
            <TouchableOpacity style={styles.botao} onPress={() => navigation.navigate('PrecoRapido', { proximo: true })} accessibilityRole="button">
              <Text style={styles.botaoTexto}>Calcular um preço</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.cartao}>
              {nomeNegocio ? <Text style={styles.negocio}>{nomeNegocio}</Text> : null}
              {produtos.map((p, i) => (
                <View key={p.id} style={[styles.linha, i > 0 && styles.linhaBorda]}>
                  <Text style={styles.linhaNome} numberOfLines={2}>{p.nome}</Text>
                  <Text style={styles.linhaPreco}>{formatCurrency(p.preco)}</Text>
                </View>
              ))}
            </View>

            <TouchableOpacity style={[styles.botao, styles.botaoWhats]} onPress={enviarWhatsApp} accessibilityRole="button">
              <Feather name="send" size={18} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.botaoTexto}>Enviar no WhatsApp</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.botaoSecundario} onPress={copiarTabela} accessibilityRole="button">
              <Feather name="copy" size={16} color={colors.primary} style={{ marginRight: 8 }} />
              <Text style={styles.botaoSecundarioTexto}>Copiar</Text>
            </TouchableOpacity>
          </>
        )}

        {instalar && celular ? (
          <View style={styles.aviso}>
            <Feather name="smartphone" size={18} color={colors.primary} style={{ marginRight: spacing.sm, marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.avisoTexto}>Salve o app para atualizar sua tabela quando os preços mudarem.</Text>
              {instalarAjuda ? <Text style={styles.avisoAjuda}>{instalarAjuda}</Text> : (
                <TouchableOpacity onPress={salvarApp} accessibilityRole="button" style={{ marginTop: 6 }}>
                  <Text style={styles.linkTexto}>Salvar o app</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        ) : null}

        {celular ? (
          <View style={styles.computador}>
            <View style={styles.computadorTopo}>
              <Feather name="monitor" size={18} color={colors.primary} style={{ marginRight: spacing.sm }} />
              <Text style={styles.computadorTitulo}>No computador você vê tudo</Text>
            </View>
            <Text style={styles.cartaoTexto}>Painel completo, relatórios e a receita com cada ingrediente, numa tela maior. Entre com o mesmo e-mail em {LINK_APP.replace('https://', '')}.</Text>
            <View style={styles.computadorBotoes}>
              <TouchableOpacity style={[styles.botaoSecundario, styles.botaoMetade]} onPress={copiarLink} accessibilityRole="button">
                <Text style={styles.botaoSecundarioTexto}>Copiar link</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.botaoSecundario, styles.botaoMetade]} onPress={mandarLinkEmail} disabled={email.estado === 'enviando' || email.estado === 'feito'} accessibilityRole="button">
                {email.estado === 'enviando'
                  ? <ActivityIndicator color={colors.primary} />
                  : <Text style={styles.botaoSecundarioTexto}>Me mandar o link por e-mail</Text>}
              </TouchableOpacity>
            </View>
            {email.texto ? (
              <Text style={[styles.emailRetorno, email.estado === 'erro' && { color: colors.error }]} accessibilityLiveRegion="polite">{email.texto}</Text>
            ) : null}
          </View>
        ) : null}

        <TouchableOpacity style={styles.painel} onPress={irParaPainel} accessibilityRole="button">
          <Text style={styles.painelTexto}>Ir para o painel</Text>
          <Feather name="arrow-right" size={16} color={colors.primary} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  tela: { flex: 1, backgroundColor: colors.background },
  conteudo: { padding: spacing.md, paddingBottom: spacing.xl * 2 },
  coluna: { maxWidth: 520, width: '100%', alignSelf: 'center' },
  voltar: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', paddingVertical: spacing.sm },
  selo: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: colors.primary + '14', borderRadius: borderRadius.full, paddingHorizontal: 10, paddingVertical: 4, marginTop: spacing.md },
  seloTexto: { fontSize: fonts.tiny + 1, fontFamily: fontFamily.semiBold, color: colors.primary },
  titulo: { fontSize: 24, lineHeight: 30, fontFamily: fontFamily.bold, color: colors.text, marginTop: spacing.sm },
  subtitulo: { fontSize: fonts.regular, lineHeight: 22, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: spacing.xs, marginBottom: spacing.md },
  cartao: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginBottom: spacing.sm + 4 },
  cartaoTexto: { fontSize: fonts.small + 1, lineHeight: 21, fontFamily: fontFamily.regular, color: colors.textSecondary, marginBottom: spacing.sm },
  negocio: { fontSize: fonts.medium, fontFamily: fontFamily.bold, color: colors.text, marginBottom: spacing.xs },
  linha: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  linhaBorda: { borderTopWidth: 1, borderTopColor: colors.border },
  linhaNome: { flex: 1, fontSize: fonts.regular, fontFamily: fontFamily.medium, color: colors.text, marginRight: spacing.sm },
  linhaPreco: { fontSize: fonts.regular, fontFamily: fontFamily.bold, color: colors.primary },
  erro: { fontSize: fonts.small, fontFamily: fontFamily.medium, color: colors.error, marginBottom: spacing.sm },
  botao: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: borderRadius.md, minHeight: 52, paddingHorizontal: spacing.md },
  botaoWhats: { backgroundColor: '#1f8f4e' },
  botaoTexto: { color: '#fff', fontSize: fonts.medium, fontFamily: fontFamily.bold },
  botaoSecundario: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.primary, borderRadius: borderRadius.md, minHeight: 46, paddingHorizontal: spacing.sm, marginTop: spacing.sm },
  botaoSecundarioTexto: { color: colors.primary, fontSize: fonts.small + 1, fontFamily: fontFamily.semiBold, textAlign: 'center' },
  botaoMetade: { flex: 1, minWidth: 140 },
  aviso: { flexDirection: 'row', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md },
  avisoTexto: { fontSize: fonts.small + 1, lineHeight: 21, fontFamily: fontFamily.medium, color: colors.text },
  avisoAjuda: { fontSize: fonts.small, lineHeight: 20, fontFamily: fontFamily.regular, color: colors.textSecondary, marginTop: 6 },
  computador: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: borderRadius.lg, padding: spacing.md, marginTop: spacing.md },
  computadorTopo: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  computadorTitulo: { fontSize: fonts.medium, fontFamily: fontFamily.bold, color: colors.text },
  computadorBotoes: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  emailRetorno: { fontSize: fonts.small, lineHeight: 20, fontFamily: fontFamily.medium, color: colors.primary, marginTop: spacing.sm },
  painel: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: spacing.md, marginTop: spacing.md },
  painelTexto: { color: colors.primary, fontSize: fonts.regular, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
  linkTexto: { color: colors.primary, fontSize: fonts.small, fontFamily: fontFamily.semiBold, textDecorationLine: 'underline' },
});
