import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * useFeatureFlag — preferência GLOBAL booleana persistida + cross-screen broadcast.
 *
 * Por que store próprio? Mudar uma flag em ConfiguracoesScreen precisa refletir
 * IMEDIATAMENTE em HomeScreen, MaisScreen, MateriasPrimasScreen etc. — telas que
 * podem já estar montadas atrás. Hooks como `usePersistedState` são por instância
 * e não fazem broadcast (mesmo gotcha resolvido em useListDensity).
 *
 * Convenção das chaves AsyncStorage: `@flag:<nome>`.
 *
 * Flags suportadas (registradas com seus defaults):
 *   - `modo_avancado_estoque` → false  (Sessão 26: Estoque some por default)
 *   - `usa_delivery`          → false  (Sessão 26: Delivery escondido até onboarding ligar)
 *   - `modo_avancado_analise` → false  (Sessão 26: BCG + Fornecedores escondidos)
 *
 * Uso típico:
 *   const [estoqueOn] = useFeatureFlag('modo_avancado_estoque');
 *   if (estoqueOn) { ... }
 *
 *   const [, setUsaDelivery] = useFeatureFlag('usa_delivery');
 *   await setUsaDelivery(true);
 */

export const FLAG_DEFAULTS = {
  modo_avancado_estoque: false,
  usa_delivery: false,
  modo_avancado_analise: false,
};

const _values = { ...FLAG_DEFAULTS };
const _loaded = new Set();
const _loadingPromises = {};
const _listeners = new Set();

function _storageKey(name) {
  return `@flag:${name}`;
}

function _notify() {
  // Snapshot leve do estado atual para listeners reagirem.
  for (const fn of _listeners) {
    try { fn(_values); } catch {}
  }
}

async function _ensureLoaded(name) {
  if (_loaded.has(name)) return _values[name];
  if (_loadingPromises[name]) return _loadingPromises[name];
  const def = FLAG_DEFAULTS[name] ?? false;
  _loadingPromises[name] = (async () => {
    try {
      const raw = await AsyncStorage.getItem(_storageKey(name));
      if (raw != null) {
        // Aceita JSON ("true"/"false") e cru ("true"/"false"/"1"/"0").
        let parsed;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        if (typeof parsed === 'boolean') {
          _values[name] = parsed;
        } else if (parsed === 'true' || parsed === '1' || parsed === 1) {
          _values[name] = true;
        } else if (parsed === 'false' || parsed === '0' || parsed === 0) {
          _values[name] = false;
        }
      } else {
        _values[name] = def;
      }
    } catch {
      _values[name] = def;
    } finally {
      _loaded.add(name);
      _notify();
    }
    return _values[name];
  })();
  return _loadingPromises[name];
}

export async function setFeatureFlag(name, next) {
  if (!(name in FLAG_DEFAULTS)) {
    if (__DEV__) console.warn('[useFeatureFlag] flag desconhecida:', name);
    return;
  }
  const v = !!next;
  if (_values[name] === v) return;
  _values[name] = v;
  try {
    await AsyncStorage.setItem(_storageKey(name), JSON.stringify(v));
  } catch {}
  _notify();
}

export async function getFeatureFlag(name) {
  return _ensureLoaded(name);
}

/**
 * Hook reativo. Retorna `[value, setValue, loaded]`.
 */
export default function useFeatureFlag(name) {
  const [value, setValueLocal] = useState(_values[name] ?? false);
  const [loaded, setLoadedLocal] = useState(_loaded.has(name));

  useEffect(() => {
    let cancelled = false;
    const listener = (snap) => {
      if (cancelled) return;
      setValueLocal(snap[name] ?? false);
    };
    _listeners.add(listener);
    _ensureLoaded(name).then((v) => {
      if (cancelled) return;
      setValueLocal(v);
      setLoadedLocal(true);
    });
    return () => {
      cancelled = true;
      _listeners.delete(listener);
    };
  }, [name]);

  const setValue = useCallback((next) => {
    setFeatureFlag(name, next);
  }, [name]);

  return [value, setValue, loaded];
}
