/**
 * InstallPrompt — CTA flutuante para instalar a PWA.
 *
 * Mostra quando o navegador disparou `beforeinstallprompt` (Chromium-based em
 * Android/desktop; iOS Safari não dispara — para iOS mostramos instrução
 * "Compartilhar > Adicionar à Tela Inicial").
 *
 * O usuário pode dispensar localmente; persiste em localStorage por 30 dias.
 */
import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { colors, spacing, fonts, fontFamily, borderRadius } from '../../utils/theme';

const DISMISS_KEY = 'pwa_install_dismissed_until';

function isIOSSafari() {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
  return isIOS && isSafari;
}

function isStandalone() {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [available, setAvailable] = useState(false);
  const [showIosHint, setShowIosHint] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (isStandalone()) return;

    // Check dismissal
    try {
      const until = parseInt(localStorage.getItem(DISMISS_KEY) || '0', 10);
      if (until && Date.now() < until) { setDismissed(true); return; }
    } catch {}

    if (window.__pwaInstallPrompt) setAvailable(true);
    if (isIOSSafari()) setShowIosHint(true);

    const onAvailable = () => setAvailable(true);
    const onInstalled = () => { setAvailable(false); setShowIosHint(false); };
    window.addEventListener('pwa-install-available', onAvailable);
    window.addEventListener('pwa-installed', onInstalled);
    return () => {
      window.removeEventListener('pwa-install-available', onAvailable);
      window.removeEventListener('pwa-installed', onInstalled);
    };
  }, []);

  function dismiss() {
    setDismissed(true);
    try {
      const until = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
      localStorage.setItem(DISMISS_KEY, String(until));
    } catch {}
  }

  async function install() {
    const ev = window.__pwaInstallPrompt;
    if (!ev) return;
    ev.prompt();
    try { await ev.userChoice; } catch {}
    window.__pwaInstallPrompt = null;
    setAvailable(false);
  }

  if (Platform.OS !== 'web') return null;
  if (dismissed) return null;
  if (!available && !showIosHint) return null;

  if (showIosHint) {
    return (
      <View style={styles.card}>
        <Feather name="share" size={20} color={colors.primary} />
        <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
          <Text style={styles.title}>Instalar Precificaí</Text>
          <Text style={styles.desc}>Toque em Compartilhar e depois "Adicionar à Tela de Início".</Text>
        </View>
        <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
          <Feather name="x" size={16} color={colors.textSecondary} />
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Feather name="download" size={20} color={colors.primary} />
      <View style={{ flex: 1, marginHorizontal: spacing.sm }}>
        <Text style={styles.title}>Instalar app</Text>
        <Text style={styles.desc}>Acesse Precificaí direto da sua tela inicial.</Text>
      </View>
      <TouchableOpacity onPress={install} style={styles.btn}>
        <Text style={styles.btnText}>Instalar</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={dismiss} style={styles.closeBtn}>
        <Feather name="x" size={16} color={colors.textSecondary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    bottom: 16, left: 16, right: 16,
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: colors.surface,
    padding: spacing.md, borderRadius: borderRadius.md,
    shadowColor: colors.shadow, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15, shadowRadius: 12, elevation: 6,
    zIndex: 9999,
    maxWidth: 480, alignSelf: 'center',
  },
  title: {
    fontSize: fonts.regular, color: colors.text,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
  desc: {
    fontSize: fonts.tiny, color: colors.textSecondary,
    fontFamily: fontFamily.regular, marginTop: 2,
  },
  btn: {
    backgroundColor: colors.primary, paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm, borderRadius: borderRadius.sm,
  },
  btnText: {
    color: '#fff', fontSize: fonts.small,
    fontFamily: fontFamily.bold, fontWeight: '700',
  },
  closeBtn: { marginLeft: 8, padding: 4 },
});
