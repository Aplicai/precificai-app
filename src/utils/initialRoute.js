import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSetupStatus } from './setupStatus';

/**
 * Determina a rota inicial do RootStack para usuários autenticados.
 *
 * Fluxo (audit P1-07):
 *  1. WelcomeTour (4 slides) — apenas para usuários novos sem onboarding feito
 *  2. ProfileSetup — perfil de negócio incompleto
 *  3. MainTabs — usuário já tem dados (onboarding implicitamente completo)
 *  4. Onboarding — fluxo guiado de setup financeiro
 *  5. MainTabs — fallback default
 *
 * @param {Object} opts
 * @param {boolean} [opts.skipWelcomeTour=false] — pula o tour (usado APÓS terminar o tour)
 * @returns {Promise<'WelcomeTour'|'ProfileSetup'|'Onboarding'|'MainTabs'>}
 */
export async function determineInitialRoute({ skipWelcomeTour = false } = {}) {
  try {
    // Se o usuário já completou o onboarding, vai direto para o app
    const onboardingDone = await AsyncStorage.getItem('onboarding_done');
    if (onboardingDone === 'true') return 'MainTabs';

    // Tour interativo apenas para usuários novos.
    // Mostra no máximo 2 vezes (após isso é sempre pulado, mesmo que nunca
    // tenham completado — feedback do usuário: "tem que aparecer nas 2 primeiras vezes e só").
    if (!skipWelcomeTour) {
      const tourDone = await AsyncStorage.getItem('welcome_tour_done');
      if (tourDone === 'true') {
        // já completou: nunca mais mostrar
      } else {
        const rawCount = await AsyncStorage.getItem('welcome_tour_count');
        const count = Number(rawCount) || 0;
        if (count < 2) return 'WelcomeTour';
        // 2 exibições já consumidas → marca como done permanentemente
        await AsyncStorage.setItem('welcome_tour_done', 'true');
      }
    }

    const { getDatabase } = require('../database/database');
    const db = await getDatabase();

    // Perfil de negócio incompleto → ProfileSetup
    const perfil = await db.getFirstAsync('SELECT * FROM perfil LIMIT 1');
    if (!perfil || !perfil.nome_negocio || perfil.nome_negocio.trim() === '') {
      return 'ProfileSetup';
    }

    // Já tem insumos cadastrados → considera onboarding implícito
    const insumos = await db.getAllAsync('SELECT id FROM materias_primas LIMIT 1');
    if (insumos && insumos.length > 0) {
      await AsyncStorage.setItem('onboarding_done', 'true');
      return 'MainTabs';
    }

    // Verifica financeiro: se completo vai direto, senão guia pelo onboarding
    const status = await getSetupStatus();
    return status.financeiroCompleto ? 'MainTabs' : 'Onboarding';
  } catch (err) {
    // Audit P1: silent catch original lançava o usuário direto em MainTabs em
    // qualquer falha (DB não montada, perfil corrompido, etc.) — pior UX possível
    // pois mostra app vazio sem explicação. Loga a falha (Sentry capta via
    // global handler) e devolve ProfileSetup, que é benigno tanto para usuário
    // novo quanto para retornante (vai apenas re-confirmar nome).
    console.error('[determineInitialRoute]', err);
    return 'ProfileSetup';
  }
}
