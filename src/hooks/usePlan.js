import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  normalizePlan,
  planIncludesFeature,
  planAllowsCount,
  limitFor as limitForPlan,
  nextPlan,
} from '../config/plans';

/**
 * usePlan — plano de assinatura GLOBAL do usuário (Fase 0).
 *
 * Mesmo padrão de module-store + broadcast do useFeatureFlag: o plano mora num
 * store de módulo, e o useState só força re-render quando o listener dispara.
 * Assim, mudar o plano (ex.: simular upgrade pra testar, ou Fase 1 via Asaas)
 * reflete IMEDIATAMENTE em todas as telas montadas (menus, gates, badges).
 *
 * FASE 0: o plano é lido/escrito LOCALMENTE (AsyncStorage `@plan`, default 'free').
 * Dá pra testar todo o funil (cadeados, popups, limites) sem o Asaas.
 * FASE 1: `setPlan` passará a ser chamado pelo webhook/sync do Asaas.
 *
 * API:
 *   const { plano, loaded, hasFeature, limitFor, canAdd, upgradeTo, setPlan } = usePlan();
 *   hasFeature('delivery')      → bool
 *   limitFor('produtos')        → number (Infinity = ilimitado)
 *   canAdd('produtos', count)   → bool
 *   upgradeTo                   → próximo plano acima ('pro'|'ilimitado'|null)
 */

const STORAGE_KEY = '@plan';

let _plan = 'free';
let _loaded = false;
let _loadingPromise = null;
const _listeners = new Set();

function _notify() {
  for (const fn of _listeners) {
    try { fn(_plan); } catch {}
  }
}

async function _ensureLoaded() {
  if (_loaded) return _plan;
  if (_loadingPromise) return _loadingPromise;
  _loadingPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) _plan = normalizePlan(raw);
    } catch {
      // mantém default 'free'
    } finally {
      _loaded = true;
      _notify();
    }
    return _plan;
  })();
  return _loadingPromise;
}

/** Setter global (testes locais na Fase 0; Asaas na Fase 1). */
export async function setPlan(next) {
  const v = normalizePlan(next);
  if (_plan === v) return;
  _plan = v;
  try { await AsyncStorage.setItem(STORAGE_KEY, v); } catch {}
  _notify();
}

/** Leitura síncrona fora de componente (ex.: guards imperativos). */
export function getPlan() {
  return _plan;
}

export default function usePlan() {
  const [plano, setPlanoLocal] = useState(_plan);
  const [loaded, setLoadedLocal] = useState(_loaded);

  useEffect(() => {
    let cancelled = false;
    setPlanoLocal(_plan);
    setLoadedLocal(_loaded);
    const listener = (p) => { if (!cancelled) setPlanoLocal(p); };
    _listeners.add(listener);
    _ensureLoaded().then((p) => {
      if (cancelled) return;
      setPlanoLocal(p);
      setLoadedLocal(true);
    });
    return () => {
      cancelled = true;
      _listeners.delete(listener);
    };
  }, []);

  const hasFeature = useCallback((key) => planIncludesFeature(plano, key), [plano]);
  const limitFor = useCallback((entity) => limitForPlan(plano, entity), [plano]);
  const canAdd = useCallback((entity, count) => planAllowsCount(plano, entity, count), [plano]);

  return {
    plano,
    loaded,
    hasFeature,
    limitFor,
    canAdd,
    upgradeTo: nextPlan(plano),
    setPlan,
  };
}
