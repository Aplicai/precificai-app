import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * usePersistedState — hook para estado serializável persistido em AsyncStorage.
 *
 * Carrega o valor do storage no mount; salva sempre que o valor muda.
 * Útil para preferências de UI (sortBy, filtros, view mode, etc.).
 *
 * @param {string} key — chave única no AsyncStorage (prefixo "@pref:" automático)
 * @param {*} defaultValue — valor inicial enquanto o storage carrega
 * @returns {[value, setValue, loaded]}
 */
export default function usePersistedState(key, defaultValue) {
  const [value, setValue] = useState(defaultValue);
  const [loaded, setLoaded] = useState(false);
  const storageKey = `@pref:${key}`;
  const skipSaveRef = useRef(true);

  // Load from storage on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(storageKey);
        if (!cancelled && raw != null) {
          try {
            setValue(JSON.parse(raw));
          } catch {
            // fallback: tratar como string crua
            setValue(raw);
          }
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

  // Save on change (após carga inicial)
  useEffect(() => {
    if (skipSaveRef.current) return;
    AsyncStorage.setItem(storageKey, JSON.stringify(value)).catch(() => {});
  }, [storageKey, value]);

  return [value, setValue, loaded];
}
