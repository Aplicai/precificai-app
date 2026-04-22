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

    // Tour interativo apenas para usuários novos que ainda não viram
    if (!skipWelcomeTour) {
      const tourDone = await AsyncStorage.getItem('welcome_tour_done');
      if (tourDone !== 'true') return 'WelcomeTour';
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
  } catch {
    return 'MainTabs';
  }
}
