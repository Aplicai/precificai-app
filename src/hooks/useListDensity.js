import { useEffect, useState, useCallback } from 'react';
import { Platform, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useListDensity — preferência GLOBAL de densidade da UI mobile-web.
 *
 * Sessão 28.6 — densidade reformulada para virar a base visual real do mobile.
 *
 * Default por plataforma (Sessão 28.6):
 *  - mobile (web < 1024 OU iOS/Android): `compact` (UI real mobile)
 *  - desktop web (≥ 1024): `comfortable` (mais ar, leitura confortável)
 *
 * O usuário pode sobrescrever em Configurações; a preferência persiste.
 *
 * Lê/escreve em AsyncStorage (`@pref:listDensity`). Valores: 'comfortable'|'compact'.
 *
 * Module-level store + listeners broadcast: TODAS as telas montadas re-renderizam
 * quando a densidade muda em qualquer ponto. Sem isso, mudar em Configurações
 * não reflete nas telas já montadas.
 *
 * Tokens expostos (para spread inline em componentes):
 *  - density: 'comfortable' | 'compact'
 *  - isCompact: bool
 *  - rowOverride: { paddingVertical } | null      → linhas de lista
 *  - nameOverride: { fontSize } | null            → nome principal em rows
 *  - avatarSize: number                           → avatar/ícone redondo
 *  - cardPadding: number                          → padding interno de cards
 *  - sectionGap: number                           → gap entre seções
 *  - headerHeight: number                         → altura de WebHeader
 *  - inputHeight: number                          → altura de inputs/selects
 *  - buttonHeight: number                         → altura de primary buttons
 *  - chipHeight: number                           → altura de chips/tags
 *  - iconSize: number                             → ícones de ações
 *  - rowMinHeight: number                         → minHeight de cell de lista
 *  - listItemFontSize: number                     → font da lista
 *  - listItemSubtitleFontSize: number             → font do subtítulo
 *  - titleFontSize: number                        → font de section title
 *  - bodyLineHeight: number                       → line-height base
 */

const STORAGE_KEY = '@pref:listDensity';

// Detecta default por plataforma. Mobile (RN nativo OU web < 1024) → compact.
function _detectDefault() {
  if (Platform.OS !== 'web') return 'compact';
  try {
    const w = Dimensions.get('window').width;
    return w < 1024 ? 'compact' : 'comfortable';
  } catch {
    return 'compact';
  }
}

let _value = _detectDefault();
let _loaded = false;
let _loadingPromise = null;
const _listeners = new Set();

function _notify() {
  for (const fn of _listeners) {
    try { fn(_value); } catch {}
  }
}

async function _ensureLoaded() {
  if (_loaded) return _value;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw != null) {
        try {
          const parsed = JSON.parse(raw);
          if (parsed === 'comfortable' || parsed === 'compact') {
            _value = parsed;
          }
        } catch {
          if (raw === 'comfortable' || raw === 'compact') _value = raw;
        }
      }
    } catch {
      // mantém default detectado
    } finally {
      _loaded = true;
      _notify();
    }
    return _value;
  })();
  return _loadingPromise;
}

export async function setListDensity(next) {
  if (next !== 'comfortable' && next !== 'compact') return;
  if (_value === next) return;
  _value = next;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {}
  _notify();
}

// Tokens dimensionados — compact é base mobile, comfortable é ar adicional desktop.
const TOKENS = {
  compact: {
    rowPaddingVertical: 8,
    rowMinHeight: 48,
    nameFontSize: 13,
    avatarSize: 32,
    cardPadding: 12,
    sectionGap: 16,
    headerHeight: 52,
    inputHeight: 42,
    buttonHeight: 44,
    chipHeight: 28,
    iconSize: 18,
    listItemFontSize: 13,
    listItemSubtitleFontSize: 11,
    titleFontSize: 14,
    bodyLineHeight: 18,
  },
  comfortable: {
    rowPaddingVertical: 14,
    rowMinHeight: 60,
    nameFontSize: 15,
    avatarSize: 44,
    cardPadding: 18,
    sectionGap: 24,
    headerHeight: 64,
    inputHeight: 50,
    buttonHeight: 52,
    chipHeight: 36,
    iconSize: 22,
    listItemFontSize: 15,
    listItemSubtitleFontSize: 13,
    titleFontSize: 16,
    bodyLineHeight: 22,
  },
};

export default function useListDensity() {
  const [density, setDensityLocal] = useState(_value);

  useEffect(() => {
    let cancelled = false;
    const listener = (val) => {
      if (!cancelled) setDensityLocal(val);
    };
    _listeners.add(listener);
    _ensureLoaded().then((val) => {
      if (!cancelled) setDensityLocal(val);
    });
    return () => {
      cancelled = true;
      _listeners.delete(listener);
    };
  }, []);

  const setDensity = useCallback((next) => {
    setListDensity(next);
  }, []);

  const isCompact = density === 'compact';
  const t = TOKENS[density] || TOKENS.compact;

  return {
    density,
    setDensity,
    isCompact,
    // Legado — mantém API antiga p/ não quebrar consumers existentes
    rowOverride: { paddingVertical: t.rowPaddingVertical },
    nameOverride: { fontSize: t.nameFontSize },
    avatarSize: t.avatarSize,
    // Tokens novos
    cardPadding: t.cardPadding,
    sectionGap: t.sectionGap,
    headerHeight: t.headerHeight,
    inputHeight: t.inputHeight,
    buttonHeight: t.buttonHeight,
    chipHeight: t.chipHeight,
    iconSize: t.iconSize,
    rowMinHeight: t.rowMinHeight,
    listItemFontSize: t.listItemFontSize,
    listItemSubtitleFontSize: t.listItemSubtitleFontSize,
    titleFontSize: t.titleFontSize,
    bodyLineHeight: t.bodyLineHeight,
  };
}
