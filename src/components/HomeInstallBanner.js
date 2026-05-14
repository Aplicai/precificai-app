/**
 * HomeInstallBanner — banner PROEMINENTE no topo da Home (web mobile).
 *
 * Por que existe (vs. InstallPWABanner antigo):
 *   O InstallPWABanner aparecia "discreto" depois da 1ª visita, com
 *   styling pequeno e baixa hierarquia visual. Usuário relatou que
 *   não vê o convite logo depois de criar a conta — perdendo conversão
 *   de instalação da PWA. Este componente é a versão "headline" para
 *   maximizar instalação: cartão verde, CTA grande, no topo da Home,
 *   visível desde o 1º render pós-signup.
 *
 * Comportamento:
 *  - Renderiza só em web + viewport mobile (< 1024px). Native iOS/Android = null.
 *  - Não renderiza se já está instalado (display-mode: standalone, navigator.standalone,
 *    flag pwa_installed).
 *  - Não renderiza se foi dispensado nos últimos 7 dias.
 *  - Chrome/Edge/Android Chrome: usa window.__pwaInstallPrompt (capturado em
 *    index.js via beforeinstallprompt) → botão "Instalar agora" dispara o prompt nativo.
 *  - iOS Safari (sem beforeinstallprompt): botão "Ver como instalar" abre modal
 *    de instruções (Compartilhar → Adicionar à Tela de Início).
 *  - Outros navegadores sem prompt nativo: também caem no modo "Ver como instalar"
 *    (modal genérico), mas pra esses o InstallAppButton em Configurações é a entrada
 *    principal — aqui mantemos visível pra reforçar.
 *  - Se o user fez signup recentemente (welcome_tour_done dentro dos últimos
 *    7 dias), mostra eyebrow "Bem-vindo ao Precificaí!" pra contextualizar.
 *
 * Eventos consumidos (registrados em index.js):
 *  - `pwa-install-available` → beforeinstallprompt foi capturado
 *  - `pwa-installed`         → app acabou de ser instalado
 *
 * Storage:
 *  - localStorage 'precificai_install_banner_dismissed_until' → epoch ms até reaparecer
 *  - AsyncStorage 'home_install_banner_first_seen_at' → epoch ms da 1ª exibição (telemetria interna)
 *  - Lê 'welcome_tour_done' p/ heurística "novo user".
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

const DISMISSED_UNTIL_KEY = 'precificai_install_banner_dismissed_until';
const FIRST_SEEN_KEY = 'home_install_banner_first_seen_at';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000; // 7 dias
// Janela em que ainda mostramos o eyebrow "Bem-vindo" para usuários novos.
const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

function readDismissedUntil() {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage?.getItem(DISMISSED_UNTIL_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  } catch (_) {
    return 0;
  }
}

function writeDismissedUntil(epochMs) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(DISMISSED_UNTIL_KEY, String(epochMs));
  } catch (_) {}
}

export default function HomeInstallBanner() {
  const { isMobile } = useResponsiveLayout();
  const [installable, setInstallable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [showHowTo, setShowHowTo] = useState(false);
  const [platform, setPlatform] = useState('unknown');
  const [isNewUser, setIsNewUser] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isMobile) return;

    setInstalled(isStandaloneNow());
    setPlatform(detectPlatform());

    // Estado de dismiss (localStorage síncrono)
    const until = readDismissedUntil();
    if (until && Date.now() < until) {
      setDismissed(true);
    }

    // Marca primeira exibição (telemetria local — útil pra debugging do
    // user dizendo "nunca apareceu"). Não bloqueia render.
    (async () => {
      try {
        const existing = await AsyncStorage.getItem(FIRST_SEEN_KEY);
        if (!existing) {
          await AsyncStorage.setItem(FIRST_SEEN_KEY, String(Date.now()));
        }
      } catch (_) {}
    })();

    // Heurística "novo user": welcome_tour_done existe E foi setado recente.
    // Como welcome_tour_done é só 'true' (sem timestamp), usamos o próprio
    // FIRST_SEEN_KEY desta tela como proxy: se foi setado nas últimas 24h
    // e o tour já está done, é provável que seja novo user.
    (async () => {
      try {
        const tourDone = await AsyncStorage.getItem('welcome_tour_done');
        if (tourDone !== 'true') return; // ainda nem fez tour, não é "post-signup"
        const firstSeenRaw = await AsyncStorage.getItem(FIRST_SEEN_KEY);
        if (!firstSeenRaw) return;
        const firstSeen = Number(firstSeenRaw);
        if (Number.isFinite(firstSeen) && Date.now() - firstSeen < NEW_USER_WINDOW_MS) {
          setIsNewUser(true);
        }
      } catch (_) {}
    })();

    if (typeof window === 'undefined') return;

    if (window.__pwaInstallPrompt) setInstallable(true);

    const onAvail = () => setInstallable(true);
    const onInstalled = () => {
      setInstalled(true);
      setInstallable(false);
    };
    window.addEventListener('pwa-install-available', onAvail);
    window.addEventListener('pwa-installed', onInstalled);

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
  }, [isMobile]);

  // Guards de render (todos os hooks já rodaram acima).
  if (Platform.OS !== 'web') return null;
  if (!isMobile) return null;
  if (installed) return null;
  if (dismissed) return null;

  const handleDismiss = () => {
    writeDismissedUntil(Date.now() + DISMISS_MS);
    setDismissed(true);
  };

  const handleInstall = async () => {
    if (typeof window === 'undefined') return;
    if (window.__pwaInstallPrompt) {
      try {
        const promptEvent = window.__pwaInstallPrompt;
        promptEvent.prompt();
        const result = await promptEvent.userChoice;
        if (result?.outcome === 'accepted') {
          setInstalled(true);
        }
        window.__pwaInstallPrompt = null;
        setInstallable(false);
      } catch (_) {
        setShowHowTo(true);
      }
    } else {
      setShowHowTo(true);
    }
  };

  const ctaLabel = installable
    ? 'Instalar agora'
    : 'Ver como instalar';

  return (
    <>
      <View style={styles.banner}>
        <View style={styles.headerRow}>
          <View style={styles.iconBox}>
            <Feather name="smartphone" size={18} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            {isNewUser && (
              <Text style={styles.eyebrow}>Bem-vindo ao Precificaí</Text>
            )}
            <Text style={styles.title}>Use no celular como app</Text>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dispensar por 7 dias"
          >
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.desc}>
          Instale o Precificaí na tela inicial pra abrir mais rápido,
          em tela cheia e sem precisar do navegador.
        </Text>

        <TouchableOpacity
          onPress={handleInstall}
          style={styles.installBtn}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={ctaLabel}
        >
          <Feather name="download" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.installBtnText}>{ctaLabel}</Text>
        </TouchableOpacity>
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
              <View style={styles.iconBox}>
                <Feather name="smartphone" size={16} color={colors.primary} />
              </View>
              <Text style={styles.modalTitle}>
                {platform === 'ios' ? 'Instalar no iPhone' : 'Como instalar o Precificaí'}
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
              <Instructions platform={platform} />
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

function Instructions({ platform }) {
  if (platform === 'ios') {
    return (
      <>
        <Step
          n="1"
          text="Toque no botão Compartilhar do Safari."
          hint="Quadrado com seta pra cima, geralmente no rodapé do iPhone."
        />
        <Step
          n="2"
          text='Role para baixo e toque em "Adicionar à Tela de Início".'
        />
        <Step
          n="3"
          text='Confirme o nome "Precificaí" e toque em Adicionar.'
          hint="Pronto! O ícone aparece na tela inicial."
        />
        <View style={styles.tip}>
          <Feather name="alert-circle" size={12} color={colors.warning} style={{ marginRight: 6 }} />
          <Text style={styles.tipText}>
            Importante: precisa estar no <Text style={{ fontWeight: '700' }}>Safari</Text>.
            O Chrome no iPhone não permite instalar PWA.
          </Text>
        </View>
      </>
    );
  }

  if (platform === 'android' || platform === 'chrome') {
    return (
      <>
        <Step
          n="1"
          text="Toque no menu (⋮) no canto superior direito do navegador."
        />
        <Step
          n="2"
          text='Toque em "Instalar app" ou "Adicionar à tela inicial".'
        />
        <Step
          n="3"
          text="Confirme. O ícone aparece na tela inicial do celular."
        />
      </>
    );
  }

  // Fallback genérico
  return (
    <>
      <Step
        n="1"
        text="Abra o menu do seu navegador."
        hint="Geralmente nos três pontinhos no topo ou no rodapé."
      />
      <Step
        n="2"
        text='Procure a opção "Instalar app" ou "Adicionar à tela inicial".'
      />
      <Step
        n="3"
        text="Confirme. O Precificaí ficará disponível como aplicativo."
      />
      <View style={styles.tip}>
        <Feather name="info" size={12} color={colors.primary} style={{ marginRight: 6 }} />
        <Text style={styles.tipText}>
          Se não encontrar a opção, abra esta página no <Text style={{ fontWeight: '700' }}>Chrome</Text>
          {' '}(Android) ou <Text style={{ fontWeight: '700' }}>Safari</Text> (iPhone).
        </Text>
      </View>
    </>
  );
}

const styles = {
  banner: {
    backgroundColor: colors.primary + '12',
    borderWidth: 1,
    borderColor: colors.primary + '40',
    borderRadius: borderRadius.md,
    padding: spacing.md,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
    // Sombra leve pra dar destaque sem ser agressivo
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  iconBox: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  eyebrow: {
    fontSize: fonts.tiny,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.primary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  title: {
    fontSize: fonts.regular,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
    color: colors.text,
  },
  desc: {
    fontSize: fonts.small,
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    lineHeight: 19,
    marginBottom: spacing.sm + 2,
  },
  installBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
  },
  installBtnText: {
    color: '#fff',
    fontSize: fonts.small,
    fontFamily: fontFamily.semiBold,
    fontWeight: '700',
  },
  dismissBtn: {
    width: 28, height: 28,
    alignItems: 'center', justifyContent: 'center',
    borderRadius: 14,
  },
  // Modal "Como instalar"
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
    maxWidth: 440,
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
  },
  step: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
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
};
