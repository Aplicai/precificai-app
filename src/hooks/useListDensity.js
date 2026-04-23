import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useListDensity — preferência GLOBAL de densidade das linhas das listas.
 *
 * Lê/escreve em AsyncStorage (`@pref:listDensity`). Valores: 'comfortable'|'compact'.
 *
 * IMPORTANTE: usa um "store" em memória + listeners para que TODAS as telas
 * que consomem o hook re-renderizem instantaneamente quando a densidade
 * for alterada em qualquer lugar do app. Sem isso, mudar a densidade nas
 * Configurações não reflete nas telas já montadas (Insumos, Produtos, etc.).
 *
 * Retorna estilos prontos para spread nos rowItem/gridCard:
 *   - rowOverride: { paddingVertical } | null
 *   - nameOverride: { fontSize } | null
 *   - avatarSize: number (px)
 */

const STORAGE_KEY = '@pref:listDensity';
let _value = 'comfortable';
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
        // Pode estar serializado como JSON ("\"compact\"") ou crú ("compact")
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
      // mantém default
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
  return {
    density,
    setDensity,
    isCompact,
    rowOverride: isCompact ? { paddingVertical: 8 } : null,
    nameOverride: isCompact ? { fontSize: 13 } : null,
    avatarSize: isCompact ? 32 : 40,
  };
}
