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
  // Sessão 28.8 — Combos como recurso avançado opcional. Quando ON,
  // habilita CRUD de combos na Sidebar/MaisScreen e CTA de criação na
  // tab Combos de Atualizar Preços. Default OFF para manter UX simples
  // pra quem não precisa montar pacotes/kits.
  modo_avancado_combos: false,
};

/**
 * Sessão 27 — flags travadas em OFF (kill-switch).
 *
 * Mesmo que o usuário tenha o valor `true` salvo em AsyncStorage de uma sessão
 * anterior, leituras retornam `false` e setters não persistem. Isso esconde a
 * funcionalidade da UI sem deletar código nem migrar storage.
 *
 * Para reativar: tirar a chave deste objeto.
 */
const _forcedOff = {
  modo_avancado_estoque: true, // UX da Sessão 27 não fechou; código segue dormente
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
  // Sessão 27 — kill-switch: leitura sempre false, ignora storage.
  if (_forcedOff[name]) {
    _values[name] = false;
    _loaded.add(name);
    return false;
  }
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
  // Sessão 27 — kill-switch: setter no-op, valor permanece false.
  if (_forcedOff[name]) {
    _values[name] = false;
    _notify();
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
