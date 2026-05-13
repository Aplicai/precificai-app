/**
 * Feature flags BETA por usuario — backed por tabela `beta_features` no Supabase.
 *
 * Diferente de `useFeatureFlag` (que controla MODULOS opcionais ligados pelo
 * proprio usuario em Configuracoes), este modulo define quais features
 * BETA/SISTEMA o usuario tem PERMISSAO de ver no app, com base no perfil
 * autenticado.
 *
 * Antes (legado): whitelist hardcoded de emails -> emails vazavam no bundle
 * minificado + qualquer mudanca exigia redeploy + bypass via console.
 *
 * Agora: consulta a tabela `beta_features` (RLS: user so le os proprios rows).
 * Cache em memoria durante a sessao pra nao bater no DB toda hora.
 *
 * API:
 *   - fetchUserFeatures(userId): Promise<string[]>
 *   - hasFeature(flagName, features): boolean   // sincrono, recebe array
 *   - clearFeaturesCache(userId?): void          // limpa cache (sign-out)
 *
 * Robustez: qualquer erro de fetch retorna lista vazia (= sem features beta).
 * NUNCA crasha o app — feature beta indisponivel != app quebrado.
 */
import { supabase } from '../config/supabase';

// Cache em memoria: { userId -> { features: string[], time: number } }
// TTL longo: dentro da sessao basicamente nao revalidamos. A whitelist eh
// estavel (muda em dias, nao em segundos). Refetch acontece em sign-in/out.
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 min
const cache = new Map();

/**
 * Busca as feature keys habilitadas para o userId.
 * Retorna array de strings (feature_key). Erros -> [].
 */
export async function fetchUserFeatures(userId) {
  if (!userId) return [];

  const cached = cache.get(userId);
  if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
    return cached.features;
  }

  try {
    const { data, error } = await supabase
      .from('beta_features')
      .select('feature_key')
      .eq('user_id', userId)
      .eq('enabled', true);

    if (error) {
      // Logamos no console mas NAO propagamos. Feature beta indisponivel
      // nao pode quebrar o resto do app.
      // eslint-disable-next-line no-console
      console.warn('[featureFlags] fetch falhou:', error.message || error);
      // Cacheamos vazio com TTL curto pra evitar martelar o DB em caso de
      // erro recorrente, mas ainda permitir recuperacao.
      cache.set(userId, { features: [], time: Date.now() - (CACHE_TTL_MS - 30000) });
      return [];
    }

    const features = Array.isArray(data) ? data.map(r => r.feature_key).filter(Boolean) : [];
    cache.set(userId, { features, time: Date.now() });
    return features;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn('[featureFlags] exceção no fetch:', e?.message || e);
    return [];
  }
}

/**
 * Helper sincrono pra checar se uma flag esta presente na lista do user.
 * Aceita array de feature_keys (vindo de fetchUserFeatures).
 */
export function hasFeature(flagName, features) {
  if (!flagName || !Array.isArray(features)) return false;
  return features.includes(flagName);
}

/**
 * Limpa cache. Sem argumento limpa tudo (uso: sign-out).
 * Com userId limpa apenas a entrada daquele user (uso: refresh manual).
 */
export function clearFeaturesCache(userId) {
  if (userId) cache.delete(userId);
  else cache.clear();
}
