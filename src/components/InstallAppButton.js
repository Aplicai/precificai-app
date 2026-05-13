/**
 * InstallAppButton — botão de instalar app (PWA) na tela de Configurações.
 *
 * Por que existe: depois que o usuário desinstala uma PWA, o browser NÃO
 * dispara `beforeinstallprompt` automaticamente de novo (Chrome só mostra
 * na 1ª visita ou após resetar heurística). Esse botão é uma reentrada
 * manual — sempre disponível em Configurações.
 *
 * Estados:
 *  - installed: rodando como standalone → mostra "✓ App instalado".
 *  - installable: `window.__pwaInstallPrompt` populado (mesmo evento usado
 *    pelo InstallPWABanner) → botão verde dispara prompt nativo.
 *  - unavailable: nem instalado nem com prompt disponível (caso comum após
 *    desinstalar no Chrome, ou Firefox/Safari) → botão "Como instalar"
 *    abre modal com instruções por navegador/SO.
 *
 * Eventos consumidos (registrados em index.js):
 *  - `pwa-install-available`  → o evento beforeinstallprompt foi capturado
 *  - `pwa-installed`          → o app acabou de ser instalado
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, ScrollView, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';

function detectPlatform() {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = (navigator.userAgent || '').toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(ua) ||
    (ua.includes('mac') && typeof document !== 'undefined' && 'ontouchend' in document);
  if (isIOS) return 'ios';
  if (ua.includes('android')) return 'android';
  if (ua.includes('edg/')) return 'edge';
  if (ua.includes('firefox') || ua.includes('fxios')) return 'firefox';
  if (ua.includes('chrome') || ua.includes('crios')) return 'chrome';
  if (ua.includes('safari')) return 'safari';
  return 'unknown';
}

function isStandaloneNow() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true;
    if (typeof localStorage !== 'undefined' && localStorage.getItem('pwa_installed') === '1') return true;
  } catch (_) {}
  return false;
}

export default function InstallAppButton() {
  const [installed, setInstalled] = useState(false);
  const [installable, setInstallable] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [platform, setPlatform] = useState('unknown');

  useEffect(() => {
    if (Platform.OS !== 'web') return;

    setInstalled(isStandaloneNow());
    setPlatform(detectPlatform());

    if (typeof window === 'undefined') return;

    // Estado inicial: o index.js pode já ter capturado o evento
    if (window.__pwaInstallPrompt) setInstallable(true);

    const onAvail = () => setInstallable(true);
    const onInstalled = () => {
      setInstalled(true);
      setInstallable(false);
    };
    window.addEventListener('pwa-install-available', onAvail);
    window.addEventListener('pwa-installed', onInstalled);

    // Detecta também mudança de display-mode (entrou/saiu de standalone)
    let mql = null;
    let mqlHandler = null;
    try {
      mql = window.matchMedia('(display-mode: standalone)');
      mqlHandler = (e) => setInstalled(e.matches || isStandaloneNow());
      if (mql.addEventListener) mql.addEventListener('change', mqlHandler);
      else if (mql.addListener) mql.addListener(mqlHandler);
    } catch (_) {}

    return () => {
      window.removeEventListener('pwa-install-available', onAvail);
      window.removeEventListener('pwa-installed', onInstalled);
      try {
        if (mql && mqlHandler) {
          if (mql.removeEventListener) mql.removeEventListener('change', mqlHandler);
          else if (mql.removeListener) mql.removeListener(mqlHandler);
        }
      } catch (_) {}
    };
  }, []);

  // Não renderiza em iOS/Android nativo
  if (Platform.OS !== 'web') return null;

  const triggerInstall = async () => {
    if (typeof window === 'undefined' || !window.__pwaInstallPrompt) {
      // Sumiu entre o render e o clique — fallback pras instruções manuais
      setShowHowTo(true);
      return;
    }
    try {
      const promptEvent = window.__pwaInstallPrompt;
      promptEvent.prompt();
      const result = await promptEvent.userChoice;
      if (result?.outcome === 'accepted') {
        setInstalled(true);
      }
      window.__pwaInstallPrompt = null;
      setInstallable(false);
    } catch (e) {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[InstallAppButton] prompt failed', e?.message || e);
      }
      setShowHowTo(true);
    }
  };

  return (
    <>
      <View style={styles.section}>
        <View style={styles.header}>
          <View style={[styles.iconBox, { backgroundColor: colors.primary + '12' }]}>
            <Feather name="download" size={18} color={colors.primary} />
          </View>
          <View style={styles.headerBody}>
            <Text style={styles.title}>Aplicativo</Text>
            <Text style={styles.desc}>
              {installed
                ? 'Você está usando o Precificaí instalado.'
                : 'Instale o Precificaí na tela inicial ou área de trabalho.'}
            </Text>
          </View>
        </View>

        {installed ? (
          <>
            <View style={styles.installedBox}>
              <Feather name="check-circle" size={16} color={colors.success} style={{ marginRight: 6 }} />
              <Text style={styles.installedText}>App instalado</Text>
            </View>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => setShowHowTo(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Como desinstalar o app"
            >
              <Feather name="help-circle" size={14} color={colors.primary} style={{ marginRight: 6 }} />
              <Text style={styles.secondaryBtnText}>Como desinstalar</Text>
            </TouchableOpacity>
          </>
        ) : installable ? (
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={triggerInstall}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Instalar app"
          >
            <Feather name="download" size={16} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.primaryBtnText}>Instalar app</Text>
          </TouchableOpacity>
        ) : (
          <>
            <Text style={styles.unavailableNote}>
              O navegador não está oferecendo a instalação automática agora
              (comum depois de já ter desinstalado uma vez).
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => setShowHowTo(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Ver como instalar manualmente"
            >
              <Feather name="info" size={16} color="#fff" style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Como instalar</Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      <Modal
        visible={showHowTo}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHowTo(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={[styles.iconBox, { backgroundColor: colors.primary + '12' }]}>
                <Feather name={installed ? 'log-out' : 'smartphone'} size={16} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>
                {installed ? 'Como desinstalar' : 'Como instalar o Precificaí'}
              </Text>
              <TouchableOpacity
                onPress={() => setShowHowTo(false)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Fechar"
              >
                <Feather name="x" size={18} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: spacing.md }}>
              {installed ? (
                <UninstallInstructions platform={platform} />
              ) : (
                <InstallInstructions platform={platform} />
              )}
            </ScrollView>

            <TouchableOpacity
              style={styles.modalOkBtn}
              onPress={() => setShowHowTo(false)}
              activeOpacity={0.85}
            >
              <Text style={styles.modalOkText}>Entendi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

function Section({ title, children }) {
  return (
    <View style={{ marginBottom: spacing.md }}>
      <Text style={styles.instrTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Step({ n, text, hint }) {
  return (
    <View style={styles.step}>
      <Text style={styles.stepNum}>{n}</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.stepText}>{text}</Text>
        {hint ? <Text style={styles.stepHint}>{hint}</Text> : null}
      </View>
    </View>
  );
}

function InstallInstructions({ platform }) {
  if (platform === 'ios') {
    return (
      <Section title="iPhone / iPad (Safari)">
        <Step n="1" text="Toque no botão Compartilhar do Safari." hint="Quadrado com seta pra cima, no rodapé do navegador." />
        <Step n="2" text='Role para baixo e toque em "Adicionar à Tela de Início".' />
        <Step n="3" text='Confirme o nome "Precificaí" e toque em Adicionar.' />
        <View style={styles.tip}>
          <Feather name="alert-circle" size={12} color={colors.warning} style={{ marginRight: 6 }} />
          <Text style={styles.tipText}>
            Precisa ser o <Text style={{ fontWeight: '700' }}>Safari</Text>. O Chrome no iPhone não instala PWA.
          </Text>
        </View>
      </Section>
    );
  }

  if (platform === 'android') {
    return (
      <Section title="Android (Chrome)">
        <Step n="1" text="Toque no menu (⋮) no canto superior direito do Chrome." />
        <Step n="2" text='Toque em "Instalar app" ou "Adicionar à tela inicial".' />
        <Step n="3" text="Confirme. O ícone aparece na tela inicial do celular." />
      </Section>
    );
  }

  if (platform === 'edge') {
    return (
      <Section title="Edge (Windows / Mac)">
        <Step n="1" text="Procure o ícone de instalação (+ ou monitor) à direita da barra de endereço." hint='Ou abra o menu (...) → "Apps" → "Instalar este site como app".' />
        <Step n="2" text='Clique em "Instalar".' />
        <Step n="3" text="O Precificaí abre em uma janela própria e ganha atalho no menu Iniciar." />
      </Section>
    );
  }

  if (platform === 'firefox') {
    return (
      <Section title="Firefox">
        <View style={styles.tip}>
          <Feather name="alert-circle" size={12} color={colors.warning} style={{ marginRight: 6 }} />
          <Text style={styles.tipText}>
            O Firefox no desktop não suporta instalação de PWA. Use o{' '}
            <Text style={{ fontWeight: '700' }}>Chrome</Text> ou{' '}
            <Text style={{ fontWeight: '700' }}>Edge</Text> para instalar.
          </Text>
        </View>
      </Section>
    );
  }

  // chrome / safari desktop / unknown
  return (
    <>
      <Section title="Chrome (Windows / Mac / Linux)">
        <Step n="1" text="Procure o ícone de instalação na barra de endereço (geralmente um monitor com seta para baixo)." hint='Se não aparecer: menu (⋮) → "Instalar Precificaí…" ou "Salvar e compartilhar" → "Instalar página como app".' />
        <Step n="2" text='Clique em "Instalar".' />
        <Step n="3" text="O Precificaí abre em uma janela própria e ganha atalho na área de trabalho." />
      </Section>
      <Section title="Edge">
        <Step n="1" text='Menu (...) → "Apps" → "Instalar este site como app".' />
        <Step n="2" text='Clique em "Instalar".' />
      </Section>
      <Section title="Safari (Mac)">
        <Step n="1" text='Menu "Arquivo" → "Adicionar ao Dock…" (Safari 17+).' hint="Em versões mais antigas do Safari a instalação não está disponível." />
      </Section>
      <View style={styles.tip}>
        <Feather name="info" size={12} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={styles.tipText}>
          Depois de instalar, o Precificaí aparece como aplicativo normal — sem barra de navegador.
        </Text>
      </View>
    </>
  );
}

function UninstallInstructions({ platform }) {
  if (platform === 'ios') {
    return (
      <Section title="iPhone / iPad">
        <Step n="1" text="Toque e segure no ícone do Precificaí na tela inicial." />
        <Step n="2" text='Toque em "Remover app" → "Excluir da Tela Inicial".' />
      </Section>
    );
  }
  if (platform === 'android') {
    return (
      <Section title="Android">
        <Step n="1" text="Toque e segure no ícone do Precificaí." />
        <Step n="2" text='Arraste para "Desinstalar" ou toque em "Remover".' />
      </Section>
    );
  }
  return (
    <>
      <Section title="Chrome / Edge (desktop)">
        <Step n="1" text="Abra o Precificaí (já instalado)." />
        <Step n="2" text='Clique no menu (⋮ ou ...) da janela do app → "Desinstalar Precificaí".' hint='Ou acesse chrome://apps (Chrome) ou edge://apps (Edge), clique direito no ícone → "Remover".' />
      </Section>
      <View style={styles.tip}>
        <Feather name="info" size={12} color={colors.warning} style={{ marginRight: 6 }} />
        <Text style={styles.tipText}>
          Depois de desinstalar, o navegador pode não oferecer a instalação automática de novo.
          Volte aqui e use <Text style={{ fontWeight: '700' }}>"Como instalar"</Text> se precisar reinstalar.
        </Text>
      </View>
    </>
  );
}

const styles = {
  section: {
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  headerBody: { flex: 1, marginLeft: spacing.sm },
  iconBox: {
    width: 40, height: 40, borderRadius: borderRadius.md,
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.text,
  },
  desc: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginTop: 2,
    lineHeight: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  primaryBtnText: {
    color: '#fff',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary + '10',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    marginTop: spacing.sm,
  },
  secondaryBtnText: {
    color: colors.primary,
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '600',
  },
  installedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.success + '14',
    borderRadius: borderRadius.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm + 2,
  },
  installedText: {
    fontSize: fonts.small,
    color: colors.success,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  unavailableNote: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginBottom: spacing.sm,
    lineHeight: 16,
  },
  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: borderRadius.lg,
    width: '100%',
    maxWidth: 480,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    flex: 1,
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.text,
    marginLeft: spacing.sm,
  },
  modalOkBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOkText: {
    color: '#fff',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  instrTitle: {
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.sm,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.sm + 2,
    gap: spacing.sm,
  },
  stepNum: {
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: colors.primary,
    color: '#fff',
    fontSize: 13,
    fontFamily: fontFamily.bold,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 24,
  },
  stepText: {
    fontSize: fonts.small,
    color: colors.text,
    fontFamily: fontFamily.medium,
    lineHeight: 18,
  },
  stepHint: {
    fontSize: fonts.tiny,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    marginTop: 2,
    lineHeight: 14,
  },
  tip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.primary + '10',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginTop: spacing.xs,
  },
  tipText: {
    flex: 1,
    fontSize: fonts.tiny,
    color: colors.text,
    lineHeight: 15,
  },
};
