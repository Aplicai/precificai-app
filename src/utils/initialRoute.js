import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSetupStatus } from './setupStatus';
import { CHAVE_PERFIL_SETUP, rotaInicialDoPerfil } from './perfilSetup';
import { isDbErrorResult } from '../database/supabaseDb';

/** Marcado pela ComoFuncionaScreen (vídeo de 1 min). */
export const CHAVE_COMO_FUNCIONA = 'como_funciona_visto';
/** Marcado pela PrecoRapidoScreen: aparece sozinho uma vez só. */
export const CHAVE_PRECO_RAPIDO = 'preco_rapido_visto';

async function flagVista(chave) {
  try {
    return (await AsyncStorage.getItem(chave)) === 'true';
  } catch (_) {
    return false;
  }
}

/**
 * Perfil + ingrediente → rota, pela regra pura `rotaInicialDoPerfil`
 * (31/10/2026: a tela de perfil só aparece para conta sem segmento, sem nome
 * e que nunca a viu; "Continuar"/"Pular" marcam `perfil_setup_visto`).
 * Perfil pronto e nenhum ingrediente (16/10/2026): Preço rápido uma vez,
 * depois Home (que oferece de novo). Nunca mais a tela "Configure seu app"
 * com o Financeiro na frente, onde quem caía não cadastrava nada.
 * Devolve null quando a leitura falhou (quem chama decide: MainTabs).
 */
async function rotaPeloPerfil(db) {
  const perfilRows = await db.getAllAsync('SELECT * FROM perfil LIMIT 1');
  if (isDbErrorResult(perfilRows)) return null;
  const insumos = await db.getAllAsync('SELECT id FROM materias_primas LIMIT 1');
  if (isDbErrorResult(insumos)) return null;
  const temIngredientes = Array.isArray(insumos) && insumos.length > 0;
  if (temIngredientes) await AsyncStorage.setItem('onboarding_done', 'true');
  return rotaInicialDoPerfil({
    perfil: perfilRows?.[0] || null,
    temIngredientes,
    setupVisto: await flagVista(CHAVE_PERFIL_SETUP),
    precoRapidoVisto: await flagVista(CHAVE_PRECO_RAPIDO),
  });
}

/**
 * Determina a rota inicial do RootStack para usuários autenticados.
 *
 * Fluxo (31/10/2026, sem o tour de boas-vindas: conta nova vai direto ao
 * "O que você vende?"):
 *  1. MainTabs — `onboarding_done` ou já tem ingrediente
 *  2. ProfileSetup — conta sem segmento, sem nome e que nunca viu o setup
 *  3. PrecoRapido uma vez, depois MainTabs
 *
 * `skipWelcomeTour` é aceito por compatibilidade (WelcomeTourScreen) e ignorado.
 *
 * @returns {Promise<'ProfileSetup'|'PrecoRapido'|'MainTabs'>}
 */
export async function determineInitialRoute() {
  try {
    // Se o usuário já completou o onboarding, vai direto para o app
    const onboardingDone = await AsyncStorage.getItem('onboarding_done');
    if (onboardingDone === 'true') return 'MainTabs';

    const { getDatabase } = require('../database/database');
    const db = await getDatabase();

    // Audit M5: `[]`/null por ERRO de rede não é "sem perfil" — um usuário maduro
    // caía no onboarding a cada falha transitória. Erro → MainTabs (seguro).
    return (await rotaPeloPerfil(db)) || 'MainTabs';
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
 * @returns {Promise<{route: 'ProfileSetup'|'PrecoRapido'|'MainTabs', routeError: Error|null}>}
 */
export async function determineInitialRouteWithError() {
  try {
    const route = await determineInitialRoute();
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
export async function determineInitialRouteSafe() {
  try {
    const onboardingDone = await AsyncStorage.getItem('onboarding_done');
    if (onboardingDone === 'true') return { route: 'MainTabs', routeError: null };

    const { getDatabase } = require('../database/database');
    const db = await getDatabase();

    // 31/10/2026: sem tour de boas-vindas. Conta nova cai direto no
    // "O que você vende?" (ProfileSetup) e dali no Preço rápido.
    const rota = await rotaPeloPerfil(db);
    if (rota === null || rota === 'MainTabs' || rota === 'ProfileSetup') {
      return { route: rota || 'MainTabs', routeError: null };
    }

    // Erro aqui significa DB acessível mas getSetupStatus quebrou — caso
    // que o `determineInitialRoute` original mascarava. Expomos para a UI.
    try {
      // Continua lendo o status: falha de leitura vira routeError (abaixo).
      await getSetupStatus();
      return { route: rota, routeError: null };
    } catch (statusErr) {
      console.error('[determineInitialRouteSafe.getSetupStatus]', statusErr);
      return { route: 'ProfileSetup', routeError: statusErr };
    }
  } catch (err) {
    console.error('[determineInitialRouteSafe]', err);
    return { route: 'ProfileSetup', routeError: err };
  }
}
