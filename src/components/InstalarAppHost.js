/**
 * "Instale o app" para quem chega pelo anúncio (16/10/2026).
 * Montado uma vez em App.js; só web, só celular.
 *
 * 1. Dentro do navegador do Instagram/Facebook: faixa "Instale o app
 *    Precificaí" com o botão "Instalar", que abre a MESMA página no Chrome
 *    (intent://, ver src/utils/navegadorInterno.js). Não bloqueia: dá para
 *    se cadastrar ali mesmo, e o ✕ esconde até fechar a aba.
 * 2. No Chrome, aberto por esse botão (?instalar=1): a mesma faixa no topo,
 *    agora chamando o pedido de instalação do próprio Chrome
 *    (src/utils/pwaInstall.js). Se o Chrome ainda não liberou, explica o
 *    caminho pelo menu.
 * 3. iPhone: dentro do Instagram/Facebook o botão tenta abrir no Safari
 *    (x-safari-https://); se não abrir, ensina pelo menu ⋯. No Safari
 *    (?instalar=1), ensina "Compartilhar → Adicionar à Tela de Início"
 *    (a Apple não deixa instalar com um toque).
 *
 * 4. Lembrete: no celular, quem ainda não instalou vê o aviso em toda visita;
 *    fechou no ✕, volta em DIAS_LEMBRETE dias.
 *
 * 5. Logado, só aparece depois do primeiro preço (nunca no meio do perfil /
 *    Preço rápido). Sem conta, aparece no cadastro/login.
 *
 * Eventos no Meta: AbrirNoChrome, AbrirNoSafari e InstalouApp.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import { deveOferecerChrome, deveOferecerSafari, ehIPhone, urlAbrirNoChrome, urlAbrirNoSafari, pedeInstalar, comParametroInstalar, semParametroInstalar, lembreteLiberado, proximoLembrete } from '../utils/navegadorInterno';
import { canInstall, isInstalled, promptInstall, subscribe } from '../utils/pwaInstall';
import { trackEvent } from '../utils/marketing';
import { useAuth } from '../contexts/AuthContext';
import { avisoInstalarPermitido, avisoInstalarLiberado, assinarAvisoInstalar } from '../utils/avisoInstalar';

const CHAVE_SESSAO_FECHOU = 'pcf_instalar_fechado';
const CHAVE_SESSAO_PEDIU = 'pcf_instalar_pedido';
const CHAVE_LEMBRETE_ATE = 'pcf_instalar_lembrete_ate';

function lerSessao(k) { try { return window.sessionStorage.getItem(k); } catch { return null; } }
function gravarSessao(k, v) { try { window.sessionStorage.setItem(k, v); } catch {} }
function lerLocal(k) { try { return window.localStorage.getItem(k); } catch { return null; } }
function gravarLocal(k, v) { try { window.localStorage.setItem(k, v); } catch {} }

const TEXTO_GRATIS = 'Grátis. Fica na sua tela inicial e você não perde o acesso.';

export default function InstalarAppHost() {
  // 'chrome' | 'safari' (dentro do Instagram/Facebook) | 'instalar' (Chrome) | 'iphone' (Safari) | null
  const [modo, setModo] = useState(null);
  const [podeInstalar, setPodeInstalar] = useState(false);
  const [semPedido, setSemPedido] = useState(false);
  const [safariNaoAbriu, setSafariNaoAbriu] = useState(false);
  // Logado: só depois do primeiro preço (src/utils/avisoInstalar.js).
  const { user, loading: authCarregando } = useAuth() || {};
  const [liberado, setLiberado] = useState(() => avisoInstalarLiberado());
  useEffect(() => assinarAvisoInstalar(setLiberado), []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const ua = window.navigator?.userAgent || '';
    if (lerSessao(CHAVE_SESSAO_FECHOU) === '1') return undefined;
    const iphone = ehIPhone(ua);
    if (!iphone && !/Android/i.test(ua)) return undefined; // só celular
    if (isInstalled()) return undefined;

    // Chegou ao navegador pelo botão: guarda o pedido e limpa a URL.
    if (pedeInstalar(window.location.search)) {
      gravarSessao(CHAVE_SESSAO_PEDIU, '1');
      try { window.history.replaceState(window.history.state, '', semParametroInstalar(window.location.href)); } catch {}
    }
    // Quem ainda não instalou vê o aviso; fechou no ✕, volta em alguns dias.
    if (lerSessao(CHAVE_SESSAO_PEDIU) !== '1' && !lembreteLiberado(lerLocal(CHAVE_LEMBRETE_ATE))) return undefined;

    const noChrome = deveOferecerChrome(ua);
    if (noChrome || deveOferecerSafari(ua)) {
      // Quem sai pelo menu do Instagram ("Abrir no navegador externo") leva a
      // URL atual: já deixa o pedido de instalação nela.
      try { window.history.replaceState(window.history.state, '', comParametroInstalar(window.location.href)); } catch {}
      setModo(noChrome ? 'chrome' : 'safari');
      return undefined;
    }

    if (iphone) { setModo('iphone'); return undefined; }

    setModo('instalar');
    setPodeInstalar(canInstall());
    const desinscrever = subscribe((s) => {
      setPodeInstalar(s.canInstall);
      if (s.installed) setModo(null);
    });
    // O Chrome às vezes demora a liberar o pedido; passado um tempo, explica pelo menu.
    const t = setTimeout(() => setSemPedido(!canInstall()), 4000);
    return () => { desinscrever(); clearTimeout(t); };
  }, []);

  if (!modo) return null;
  if (authCarregando || !avisoInstalarPermitido({ logado: !!user, liberado })) return null;

  function fechar() {
    gravarSessao(CHAVE_SESSAO_FECHOU, '1');
    gravarLocal(CHAVE_LEMBRETE_ATE, String(proximoLembrete()));
    setModo(null);
  }

  function abrirNoChrome() {
    trackEvent('AbrirNoChrome', { content_name: 'instalar_app' });
    window.location.href = urlAbrirNoChrome(window.location.href);
  }

  function abrirNoSafari() {
    trackEvent('AbrirNoSafari', { content_name: 'instalar_app' });
    window.location.href = urlAbrirNoSafari(window.location.href);
    // Se a página continua na tela, o Instagram não deixou abrir: ensina pelo menu.
    setTimeout(() => {
      if (document.visibilityState === 'visible') setSafariNaoAbriu(true);
    }, 1500);
  }

  async function instalar() {
    const r = await promptInstall();
    if (r === 'accepted') {
      trackEvent('InstalouApp', { content_name: 'instalar_app' });
      setModo(null);
    } else if (r === 'unavailable') {
      setSemPedido(true);
    }
  }

  let texto = TEXTO_GRATIS;
  let acao = null;
  if (modo === 'chrome') {
    acao = abrirNoChrome;
  } else if (modo === 'safari') {
    if (safariNaoAbriu) texto = 'Toque em ⋯ no canto de cima e em "Abrir no navegador externo". No Safari, a gente mostra o resto.';
    else acao = abrirNoSafari;
  } else if (modo === 'iphone') {
    texto = 'Toque em Compartilhar (no Safari novo, fica no ⋯) e em "Adicionar à Tela de Início".';
  } else if (podeInstalar) {
    acao = instalar;
  } else if (semPedido) {
    texto = 'Toque no menu ⋮ do Chrome e em "Instalar app" ou "Adicionar à tela inicial".';
  }

  return (
    <View style={[styles.faixa, styles.topo]} accessibilityRole="alert">
      <View style={styles.icone}><Feather name="smartphone" size={18} color="#fff" /></View>
      <View style={{ flex: 1 }}>
        <Text style={styles.titulo}>Instale o app Precificaí</Text>
        <Text style={styles.texto}>{texto}</Text>
      </View>
      {acao ? (
        <TouchableOpacity style={styles.botao} onPress={acao} accessibilityRole="button" accessibilityLabel="Instalar o app">
          <Text style={styles.botaoTexto}>Instalar</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity onPress={fechar} style={styles.fechar} accessibilityRole="button" accessibilityLabel="Fechar aviso" hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Feather name="x" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  faixa: {
    position: 'absolute', left: spacing.sm, right: spacing.sm, zIndex: 9999,
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface, borderRadius: borderRadius.md, borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm + 2,
    shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    maxWidth: 560, alignSelf: 'center',
  },
  topo: { top: spacing.sm },
  icone: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  titulo: { color: colors.text, fontSize: fonts.small, fontFamily: fontFamily.bold },
  texto: { color: colors.textSecondary, fontSize: fonts.tiny, lineHeight: 16, fontFamily: fontFamily.regular, marginTop: 1 },
  botao: { backgroundColor: colors.primary, borderRadius: borderRadius.sm, paddingVertical: 8, paddingHorizontal: 14 },
  botaoTexto: { color: '#fff', fontSize: fonts.small, fontFamily: fontFamily.bold },
  fechar: { padding: 2 },
});
