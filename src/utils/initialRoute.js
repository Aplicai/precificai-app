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

/**
 * F1-J1-03: variante de `determineInitialRoute` que devolve a rota e, se
 * houve falha, expõe o objeto de erro para a camada de navegação poder
 * mostrar uma tela de erro com retry em vez de jogar o usuário num app
 * silencioso/vazio. Mantém compat: rota fallback continua sendo
 * `ProfileSetup` em caso de erro.
 *
 * @param {Object} opts — mesmo shape de `determineInitialRoute`.
 * @returns {Promise<{route: 'WelcomeTour'|'ProfileSetup'|'Onboarding'|'MainTabs', routeError: Error|null}>}
 */
export async function determineInitialRouteWithError(opts = {}) {
  try {
    const route = await determineInitialRoute(opts);
    return { route, routeError: null };
  } catch (err) {
    // `determineInitialRoute` já tem catch interno e devolve 'ProfileSetup',
    // então isso só é alcançado em falhas catastróficas (require quebrado, etc).
    console.error('[determineInitialRouteWithError]', err);
    return { route: 'ProfileSetup', routeError: err };
  }
}

/**
 * F1-J1-03: variante explícita que detecta falha de `getSetupStatus` (DB).
 * Diferente de `determineInitialRoute`, não engole o erro — devolve a rota
 * fallback (`ProfileSetup`) E o erro original para a UI exibir retry.
 *
 * Quando há sucesso, `routeError` é `null` e `route` é a rota normal.
 *
 * Esta função duplica a lógica de `determineInitialRoute` com tratamento de
 * erro mais granular para que possamos distinguir "fluxo normal" de
 * "DB falhou — não sei se você tem dados". A duplicação é intencional para
 * manter `determineInitialRoute` (callers existentes) com signature String.
 */
export async function determineInitialRouteSafe({ skipWelcomeTour = false } = {}) {
  try {
    const AsyncStorage = require('@react-native-async-storage/async-storage').default;
    const onboardingDone = await AsyncStorage.getItem('onboarding_done');
    if (onboardingDone === 'true') return { route: 'MainTabs', routeError: null };

    if (!skipWelcomeTour) {
      const tourDone = await AsyncStorage.getItem('welcome_tour_done');
      if (tourDone !== 'true') {
        const rawCount = await AsyncStorage.getItem('welcome_tour_count');
        const count = Number(rawCount) || 0;
        if (count < 2) return { route: 'WelcomeTour', routeError: null };
        await AsyncStorage.setItem('welcome_tour_done', 'true');
      }
    }

    const { getDatabase } = require('../database/database');
    const db = await getDatabase();

    const perfil = await db.getFirstAsync('SELECT * FROM perfil LIMIT 1');
    if (!perfil || !perfil.nome_negocio || perfil.nome_negocio.trim() === '') {
      return { route: 'ProfileSetup', routeError: null };
    }

    const insumos = await db.getAllAsync('SELECT id FROM materias_primas LIMIT 1');
    if (insumos && insumos.length > 0) {
      await AsyncStorage.setItem('onboarding_done', 'true');
      return { route: 'MainTabs', routeError: null };
    }

    // Erro aqui significa DB acessível mas getSetupStatus quebrou — caso
    // que o `determineInitialRoute` original mascarava. Expomos para a UI.
    try {
      const status = await getSetupStatus();
      return {
        route: status.financeiroCompleto ? 'MainTabs' : 'Onboarding',
        routeError: null,
      };
    } catch (statusErr) {
      console.error('[determineInitialRouteSafe.getSetupStatus]', statusErr);
      return { route: 'ProfileSetup', routeError: statusErr };
    }
  } catch (err) {
    console.error('[determineInitialRouteSafe]', err);
    return { route: 'ProfileSetup', routeError: err };
  }
}
