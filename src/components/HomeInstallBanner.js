/**
 * HomeInstallBanner — o ÚNICO card "Instalar app" da Home (web).
 *
 * UX audit 2026-09-09 (item 15): "Instalar app" aparecia em 4 lugares (card
 * flutuante no WebLayout, 2 cards na Home mobile, Configurações). Ficou:
 *   - este card na Home, dispensável por 30 dias;
 *   - `InstallAppButton` em Configurações (entrada permanente).
 *
 * Comportamento:
 *  - Só no web. Native iOS/Android = null.
 *  - Não renderiza se já roda como app instalado, nem se foi dispensado nos
 *    últimos 30 dias (localStorage, via `pwaInstall.isDismissed`).
 *  - Mobile: sempre oferece — prompt nativo quando disponível (Chrome/Android),
 *    senão "Ver como instalar" (iOS Safari: Compartilhar → Adicionar à Tela de
 *    Início; outros: menu do navegador).
 *  - Desktop: só aparece quando o navegador ofereceu o prompt nativo
 *    (`beforeinstallprompt`). Sem prompt, a entrada é Configurações.
 *  - Usuário recém-cadastrado (tour concluído nos últimos 7 dias) vê o eyebrow
 *    "Bem-vindo ao Precificaí".
 *
 * Toda a lógica de prompt/estado vive em `src/utils/pwaInstall.js`.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform, Modal, ScrollView } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';
import {
  canInstall, isInstalled, promptInstall, subscribe,
  isDismissed, dismissFor, detectPlatform, DEFAULT_DISMISS_DAYS,
} from '../utils/pwaInstall';

const FIRST_SEEN_KEY = 'home_install_banner_first_seen_at';
// Janela em que ainda mostramos o eyebrow "Bem-vindo" para usuários novos.
const NEW_USER_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

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

    setInstalled(isInstalled());
    setInstallable(canInstall());
    setPlatform(detectPlatform());
    setDismissed(isDismissed());

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

    // Heurística "novo user": tour concluído E 1ª exibição deste card recente.
    (async () => {
      try {
        const tourDone = await AsyncStorage.getItem('welcome_tour_done');
        if (tourDone !== 'true') return;
        const firstSeenRaw = await AsyncStorage.getItem(FIRST_SEEN_KEY);
        if (!firstSeenRaw) return;
        const firstSeen = Number(firstSeenRaw);
        if (Number.isFinite(firstSeen) && Date.now() - firstSeen < NEW_USER_WINDOW_MS) {
          setIsNewUser(true);
        }
      } catch (_) {}
    })();

    return subscribe((state) => {
      setInstallable(state.canInstall);
      setInstalled(state.installed);
    });
  }, []);

  // Guards de render (todos os hooks já rodaram acima).
  if (Platform.OS !== 'web') return null;
  if (installed) return null;
  if (dismissed) return null;
  // Desktop: só com prompt nativo. Sem ele, a entrada é Configurações.
  if (!isMobile && !installable) return null;

  const handleDismiss = () => {
    dismissFor(DEFAULT_DISMISS_DAYS);
    setDismissed(true);
  };

  const handleInstall = async () => {
    const outcome = await promptInstall();
    if (outcome === 'accepted') {
      setInstalled(true);
      return;
    }
    if (outcome === 'unavailable') setShowHowTo(true);
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
            <Text style={styles.title}>{isMobile ? 'Use no celular como app' : 'Instale como app no computador'}</Text>
          </View>
          <TouchableOpacity
            onPress={handleDismiss}
            style={styles.dismissBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Dispensar por 30 dias"
          >
            <Feather name="x" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>

        <Text style={styles.desc}>
          {isMobile
            ? 'Abre mais rápido, em tela cheia e sem precisar do navegador.'
            : 'Fica na sua barra de tarefas e abre em janela própria, sem abas.'}
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
