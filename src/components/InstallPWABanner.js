/**
 * InstallPWABanner — Sessão 28.61
 *
 * Banner discreto no mobile web que sugere "Adicionar à tela inicial".
 *
 * Comportamento:
 *  - Só renderiza em mobile web (não native, não desktop).
 *  - Só aparece a partir da 2ª visita (counter em localStorage).
 *  - Se o app já está rodando como PWA instalado (display-mode: standalone),
 *    não mostra nada.
 *  - Se `localStorage.pwa_installed === '1'`, idem.
 *  - Dismissível com X — não aparece de novo por 7 dias.
 *  - Android Chrome: tenta usar window.__pwaInstallPrompt (capturado em index.js)
 *    para mostrar o diálogo nativo.
 *  - iOS Safari: mostra instruções "Toque em ⎘ → Adicionar à Tela de Início".
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../utils/theme';
import useResponsiveLayout from '../hooks/useResponsiveLayout';

const VIEWS_KEY = 'pwa_banner_views';
const DISMISSED_UNTIL_KEY = 'pwa_banner_dismissed_until';
const SHOW_AFTER_VIEWS = 2; // aparece a partir da 2ª visita
const DISMISS_HOURS = 7 * 24; // 7 dias

function isIOSSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const isIOS = /iPad|iPhone|iPod/.test(ua) ||
    (ua.includes('Mac') && typeof document !== 'undefined' && 'ontouchend' in document);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  return isIOS && isSafari;
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone === true) return true; // iOS
    if (localStorage.getItem('pwa_installed') === '1') return true;
  } catch (_) {}
  return false;
}

export default function InstallPWABanner() {
  const { isMobile } = useResponsiveLayout();
  const [visible, setVisible] = useState(false);
  const [androidPromptAvailable, setAndroidPromptAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!isMobile) return;
    if (isStandalone()) return;

    (async () => {
      try {
        // Bump counter
        const rawViews = await AsyncStorage.getItem(VIEWS_KEY);
        const views = (rawViews ? parseInt(rawViews, 10) : 0) + 1;
        await AsyncStorage.setItem(VIEWS_KEY, String(views));
        if (views < SHOW_AFTER_VIEWS) return;

        // Check dismiss expiry
        const dismissUntil = await AsyncStorage.getItem(DISMISSED_UNTIL_KEY);
        if (dismissUntil && Date.now() < Number(dismissUntil)) return;

        setVisible(true);
      } catch (_) {}
    })();

    // Listen for Android beforeinstallprompt
    if (typeof window !== 'undefined') {
      if (window.__pwaInstallPrompt) setAndroidPromptAvailable(true);
      const onAvail = () => setAndroidPromptAvailable(true);
      const onInstalled = () => { setVisible(false); setAndroidPromptAvailable(false); };
      window.addEventListener('pwa-install-available', onAvail);
      window.addEventListener('pwa-installed', onInstalled);
      return () => {
        window.removeEventListener('pwa-install-available', onAvail);
        window.removeEventListener('pwa-installed', onInstalled);
      };
    }
  }, [isMobile]);

  const dismiss = async () => {
    try {
      const until = Date.now() + DISMISS_HOURS * 60 * 60 * 1000;
      await AsyncStorage.setItem(DISMISSED_UNTIL_KEY, String(until));
    } catch (_) {}
    setVisible(false);
  };

  const tryInstall = async () => {
    if (Platform.OS !== 'web') return;
    if (androidPromptAvailable && typeof window !== 'undefined' && window.__pwaInstallPrompt) {
      try {
        const promptEvent = window.__pwaInstallPrompt;
        promptEvent.prompt();
        const result = await promptEvent.userChoice;
        if (result?.outcome === 'accepted') {
          setVisible(false);
        }
        window.__pwaInstallPrompt = null;
        setAndroidPromptAvailable(false);
      } catch (_) {}
    }
    // iOS: não tem API; o banner mostra instruções (já visíveis abaixo)
  };

  if (Platform.OS !== 'web' || !isMobile || !visible) return null;

  const ios = isIOSSafari();

  return (
    <View style={styles.banner}>
      <View style={styles.iconBox}>
        <Feather name="download" size={16} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>Instalar o Precificaí no seu celular</Text>
        {ios ? (
          <Text style={styles.desc} numberOfLines={2}>
            Toque em <Feather name="share" size={12} color={colors.textSecondary} /> Compartilhar e depois em "Adicionar à Tela de Início".
          </Text>
        ) : (
          <Text style={styles.desc} numberOfLines={2}>
            Tenha acesso rápido sem abrir o navegador. {androidPromptAvailable ? 'Toque em Instalar abaixo.' : 'Use o menu do navegador (Instalar app).'}
          </Text>
        )}
      </View>
      {androidPromptAvailable && (
        <TouchableOpacity onPress={tryInstall} style={styles.installBtn} accessibilityRole="button" accessibilityLabel="Instalar">
          <Text style={styles.installBtnText}>Instalar</Text>
        </TouchableOpacity>
      )}
      <TouchableOpacity
        onPress={dismiss}
        style={styles.dismissBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel="Dispensar"
      >
        <Feather name="x" size={14} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = {
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.primary + '10',
    borderWidth: 1,
    borderColor: colors.primary + '30',
    borderRadius: borderRadius.sm,
    padding: spacing.sm,
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  iconBox: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: colors.primary + '20',
    alignItems: 'center', justifyContent: 'center',
  },
  title: {
    fontSize: fonts.small, fontWeight: '700', fontFamily: fontFamily.semiBold,
    color: colors.primary, marginBottom: 2,
  },
  desc: {
    fontSize: fonts.tiny, color: colors.textSecondary, fontFamily: fontFamily.regular,
    lineHeight: 15,
  },
  installBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 6,
    borderRadius: 6,
  },
  installBtnText: {
    color: '#fff', fontSize: fonts.tiny, fontFamily: fontFamily.semiBold, fontWeight: '700',
  },
  dismissBtn: {
    width: 24, height: 24,
    alignItems: 'center', justifyContent: 'center',
  },
};
