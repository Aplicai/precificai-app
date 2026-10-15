import AsyncStorage from '@react-native-async-storage/async-storage';
import { isDbErrorResult } from '../database/supabaseDb';
import {
  decidirRotaInicial, podeIrDiretoParaApp, CHAVE_OFERTA_PRIMEIRO_PRODUTO,
} from './rotaPrimeiroAcesso';

/**
 * Rota inicial do RootStack para usuários autenticados.
 *
 * Fluxo (15/10/2026, primeiro acesso guiado):
 *  1. WelcomeTour (4 slides): só nas 2 primeiras aberturas sem onboarding feito
 *  2. ProfileSetup: perfil do negócio sem nome
 *  3. PrimeiroProduto: perfil ok e nenhum ingrediente ("Qual produto você mais
 *     vende?"); também uma vez para quem pulou o Kit no setup antigo
 *  4. MainTabs: o resto
 * A decisão em si é pura (src/utils/rotaPrimeiroAcesso.js). Antes as duas
 * funções abaixo tinham cópias da lógica e divergiam (uma mandava para
 * 'Onboarding', a outra para 'MainTabs').
 *
 * Leitura do banco com ERRO não é "conta vazia": vai para MainTabs (audit M5).
 */
async function calcularRota({ skipWelcomeTour = false } = {}) {
  const onboardingDone = (await AsyncStorage.getItem('onboarding_done')) === 'true';
  const ofertaFeita = (await AsyncStorage.getItem(CHAVE_OFERTA_PRIMEIRO_PRODUTO)) === 'true';
  if (podeIrDiretoParaApp({ onboardingDone, ofertaFeita })) return 'MainTabs';

  // Tour só para quem ainda não fez o onboarding, no máximo 2 vezes.
  if (!onboardingDone && !skipWelcomeTour) {
    const tourDone = await AsyncStorage.getItem('welcome_tour_done');
    if (tourDone !== 'true') {
      const count = Number(await AsyncStorage.getItem('welcome_tour_count')) || 0;
      if (count < 2) return 'WelcomeTour';
      await AsyncStorage.setItem('welcome_tour_done', 'true');
    }
  }

  const { getDatabase } = require('../database/database');
  const db = await getDatabase();

  const perfilRows = await db.getAllAsync('SELECT * FROM perfil LIMIT 1');
  if (isDbErrorResult(perfilRows)) return 'MainTabs';
  const perfil = perfilRows?.[0];
  const perfilOk = !!(perfil && perfil.nome_negocio && perfil.nome_negocio.trim() !== '');

  let temInsumos = false;
  if (perfilOk) {
    const insumos = await db.getAllAsync('SELECT id FROM materias_primas LIMIT 1');
    if (isDbErrorResult(insumos)) return 'MainTabs';
    temInsumos = !!(insumos && insumos.length > 0);
  }

  const rota = decidirRotaInicial({ onboardingDone, ofertaFeita, perfilOk, temInsumos });
  if (temInsumos) {
    // Conta com dados: não precisa ler o banco de novo nas próximas aberturas.
    await AsyncStorage.setItem('onboarding_done', 'true');
    await AsyncStorage.setItem(CHAVE_OFERTA_PRIMEIRO_PRODUTO, 'true');
  }
  return rota;
}

/**
 * @param {Object} opts
 * @param {boolean} [opts.skipWelcomeTour=false]: pula o tour (usado APÓS terminar o tour)
 * @returns {Promise<'WelcomeTour'|'ProfileSetup'|'PrimeiroProduto'|'MainTabs'>}
 */
export async function determineInitialRoute(opts = {}) {
  try {
    return await calcularRota(opts);
  } catch (err) {
    // Audit P1: em falha inesperada, ProfileSetup é benigno para novo e
    // retornante (só re-confirma o nome). Sentry pega pelo handler global.
    console.error('[determineInitialRoute]', err);
    return 'ProfileSetup';
  }
}

/**
 * Mesma rota, com o erro exposto (F1-J1-03) para a navegação poder mostrar
 * tela de erro com "Tentar de novo".
 * @returns {Promise<{route: string, routeError: Error|null}>}
 */
export async function determineInitialRouteWithError(opts = {}) {
  try {
    return { route: await calcularRota(opts), routeError: null };
  } catch (err) {
    console.error('[determineInitialRouteWithError]', err);
    return { route: 'ProfileSetup', routeError: err };
  }
}

/** Nome usado pelo AppNavigator. */
export async function determineInitialRouteSafe(opts = {}) {
  return determineInitialRouteWithError(opts);
}
