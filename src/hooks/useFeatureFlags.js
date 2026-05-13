import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchUserFeatures, hasFeature } from '../utils/featureFlags';

/**
 * Hook reativo para feature flags BETA do usuario autenticado.
 *
 * Le a tabela `beta_features` no Supabase (RLS garante isolamento por user).
 * O fetch eh async, entao no primeiro render todas as flags vem `false`.
 * Quando o fetch resolve, o state atualiza e os consumidores re-renderizam.
 *
 * Contrato preservado pros consumidores existentes (Sidebar, MaisScreen,
 * ConfiguracoesScreen):
 *   - `dreFluxoCaixa: boolean`
 *   - `has(name): boolean`
 *
 * Extras:
 *   - `loading: boolean`  — true ate o primeiro fetch resolver
 *
 * Tratamento de erro: qualquer falha no fetch -> features = [] (sem crash).
 */
export default function useFeatureFlags() {
  const { user } = useAuth();
  const userId = user?.id || null;

  const [features, setFeatures] = useState([]);
  const [loading, setLoading] = useState(!!userId);

  useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setFeatures([]);
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    fetchUserFeatures(userId)
      .then((list) => {
        if (cancelled) return;
        setFeatures(Array.isArray(list) ? list : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setFeatures([]);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  return useMemo(() => ({
    loading,
    dreFluxoCaixa: hasFeature('dre_fluxo_caixa', features),
    has: (name) => hasFeature(name, features),
  }), [features, loading]);
}
