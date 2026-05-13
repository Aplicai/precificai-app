import { useEffect, useRef, useState, useCallback } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * usePersistedState — hook para estado serializável persistido em AsyncStorage.
 *
 * Carrega o valor do storage no mount; salva sempre que o valor muda.
 * Útil para preferências de UI (sortBy, filtros, view mode, feature toggles, etc.).
 *
 * BROADCAST CROSS-COMPONENT (Sessão fix):
 *   Hooks `useState` por componente NÃO sincronizam entre instâncias. Para que
 *   um toggle alterado em Configurações reflita instantaneamente em Sidebar/
 *   demais telas montadas, mantemos um pub-sub a nível de módulo, indexado por
 *   `storageKey`. Quando QUALQUER instância chama `setValue`, todas as outras
 *   que escutam a mesma chave recebem o novo valor e re-renderizam.
 *
 *   No web também escutamos o evento nativo `storage` p/ propagar mudanças
 *   feitas em OUTRA aba/janela.
 *
 *   Padrão idêntico ao usado em `src/hooks/useListDensity.js`.
 *
 * @param {string} key — chave única no AsyncStorage (prefixo "@pref:" automático)
 * @param {*} defaultValue — valor inicial enquanto o storage carrega
 * @returns {[value, setValue, loaded]}
 */

// storageKey -> Set<(val) => void>
const listenersByKey = new Map();

function _subscribe(storageKey, fn) {
  let set = listenersByKey.get(storageKey);
  if (!set) {
    set = new Set();
    listenersByKey.set(storageKey, set);
  }
  set.add(fn);
  return () => {
    const s = listenersByKey.get(storageKey);
    if (s) {
      s.delete(fn);
      if (s.size === 0) listenersByKey.delete(storageKey);
    }
  };
}

function _notify(storageKey, val, except) {
  const set = listenersByKey.get(storageKey);
  if (!set) return;
  for (const fn of set) {
    if (fn === except) continue;
    try { fn(val); } catch {}
  }
}

export default function usePersistedState(key, defaultValue) {
  const [value, _setValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const storageKey = `@pref:${key}`;
  const skipSaveRef = useRef(true);
  // Ref ao valor atual — evita closure stale dentro do setValue (caso functional update).
  const valueRef = useRef(defaultValue);
  // Identidade do listener desta instância — usada p/ "não notificar a si mesma".
  const listenerRef = useRef(null);

  // Mantém valueRef sincronizado a cada render.
  useEffect(() => { valueRef.current = value; }, [value]);

  // Load from storage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!cancelled && raw != null) {
          let parsed;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw; // fallback: string crua
          }
          _setValue(parsed);
          valueRef.current = parsed;
        }
      } catch {
        // silencioso: usa defaultValue
      } finally {
        if (!cancelled) {
          setLoaded(true);
          // Permite salvar a partir do próximo tick
          setTimeout(() => { skipSaveRef.current = false; }, 0);
        }
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Subscribe to other instances' updates (mesma chave).
  useEffect(() => {
    const listener = (next) => {
      // Atualiza só se diferente — evita renders redundantes.
      if (valueRef.current !== next) {
        valueRef.current = next;
        _setValue(next);
      }
    };
    listenerRef.current = listener;
    const unsub = _subscribe(storageKey, listener);
    return () => {
      listenerRef.current = null;
      unsub();
    };
  }, [storageKey]);

  // Web: escuta evento `storage` (mudanças em outras abas/janelas).
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || !window.addEventListener) return;
    const onStorage = (e) => {
      if (!e || e.key !== storageKey) return;
      try {
        const next = e.newValue == null ? defaultValue : JSON.parse(e.newValue);
        if (valueRef.current !== next) {
          valueRef.current = next;
          _setValue(next);
          // Propaga p/ demais instâncias na MESMA aba também.
          _notify(storageKey, next, listenerRef.current);
        }
      } catch {
        // valor não-JSON: ignora
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Setter público — atualiza local, persiste, e faz broadcast pras outras instâncias.
  const setValue = useCallback((next) => {
    const resolved = typeof next === 'function' ? next(valueRef.current) : next;
    valueRef.current = resolved;
    _setValue(resolved);
    // Persiste mesmo antes do load? Mantém comportamento antigo: NÃO salva antes
    // de carregar pra não sobrescrever valor remoto com defaultValue.
    if (!skipSaveRef.current) {
      AsyncStorage.setItem(storageKey, JSON.stringify(resolved)).catch(() => {});
    }
    // Broadcast pras demais instâncias (exceto a própria).
    _notify(storageKey, resolved, listenerRef.current);
  }, [storageKey]);

  // Mantém o efeito legado de "salvar quando value muda" — cobre o caso de
  // value mudar via broadcast de outra instância antes do load completar.
  // É idempotente: se setValue já salvou, o write é o mesmo.
  useEffect(() => {
    if (skipSaveRef.current) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(value)).catch(() => {});
  }, [storageKey, value]);

  return [value, setValue, loaded];
}
