import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { hasFeature } from '../utils/featureFlags';

/**
 * Hook reativo para feature flags por email.
 *
 * Retorna um objeto com booleanos pré-computados pra cada flag conhecida e
 * uma função `has(name)` para checagens ad-hoc.
 *
 * As flags refletem PERMISSÃO (whitelist) — não estado de ativação do user.
 * Para o estado de ativação (toggle dentro de Configurações), combine com
 * `usePersistedState`/AsyncStorage.
 */
export default function useFeatureFlags() {
  const { user } = useAuth();
  const email = user?.email;
  return useMemo(() => ({
    dreFluxoCaixa: hasFeature('dre_fluxo_caixa', email),
    has: (name) => hasFeature(name, email),
  }), [email]);
}
