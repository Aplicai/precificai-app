import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../config/supabase';
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
 * FASE 1: a FONTE DA VERDADE é a tabela `subscriptions` (escrita pelo webhook
 * do Asaas). `syncPlanFromServer` lê de lá e sobrepõe o cache local. O local
 * vira apenas cache/offline + DEV switcher (quando o usuário não tem assinatura).
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
    // Não bloqueia o carregamento inicial: o cache local pinta a UI na hora,
    // e o servidor (fonte da verdade) reconcilia em seguida.
    syncPlanFromServer().catch(() => {});
    return _plan;
  })();
  return _loadingPromise;
}

/**
 * Lê o plano REAL da tabela `subscriptions` (escrita pelo webhook do Asaas) e
 * sobrepõe o cache local. Regras:
 *   - Sem usuário logado / sem linha → mantém o local (cache + DEV switcher).
 *   - status active|overdue e período não vencido → usa o plano do servidor.
 *   - status canceled / período vencido → cai pra 'free'.
 * Pode ser chamada de novo após o checkout ou quando o app volta ao foco.
 */
export async function syncPlanFromServer() {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return _plan; // anônimo → mantém local
    // A tabela usa colunas `plan` e `expires_at` (schema oficial).
    const { data, error } = await supabase
      .from('subscriptions')
      .select('plan,status,expires_at')
      .eq('user_id', user.id)
      .maybeSingle();
    if (error || !data) return _plan; // sem assinatura → mantém local
    const status = data.status;
    const now = new Date();
    const hasFutureEnd = !!data.expires_at && new Date(data.expires_at) > now;
    const notExpired = !data.expires_at || new Date(data.expires_at) > now;
    let entitled;
    if (status === 'active' || status === 'past_due') {
      // Ativo (ou em graça por atraso): expires_at NULL = vitalício (ex.: conta de teste).
      entitled = notExpired;
    } else if (status === 'canceled') {
      // Cancelado: mantém o plano só ATÉ o fim do período já pago.
      entitled = hasFutureEnd;
    } else {
      entitled = false;
    }
    const serverPlan = entitled ? normalizePlan(data.plan) : 'free';
    if (serverPlan !== _plan) {
      _plan = serverPlan;
      try { await AsyncStorage.setItem(STORAGE_KEY, serverPlan); } catch {}
      _notify();
    }
  } catch {
    // rede caiu / erro → mantém o que já tinha
  }
  return _plan;
}

// Re-sincroniza quando o usuário loga; reseta cache no logout.
try {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      syncPlanFromServer().catch(() => {});
    } else if (event === 'SIGNED_OUT') {
      _plan = 'free';
      AsyncStorage.removeItem(STORAGE_KEY).catch(() => {});
      _notify();
    }
  });
} catch {}

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
