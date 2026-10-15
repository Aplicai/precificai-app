/**
 * Decide a rota de entrada depois do tour (regra pura, testada em
 * __tests__/rotaPrimeiroAcesso.test.mjs). Usada pelas duas funções de
 * src/utils/initialRoute.js, que antes divergiam.
 *
 * Primeiro acesso guiado (15/10/2026): conta com perfil e sem nenhum
 * ingrediente vai para o PrimeiroProduto ("Qual produto você mais vende?").
 * Inclui quem já tinha passado pelo setup antigo e pulado o Kit
 * (onboarding_done = 'true'), mas só UMA vez por aparelho: a tela grava
 * CHAVE_OFERTA_PRIMEIRO_PRODUTO ao abrir, e daí em diante a Home oferece o
 * passo a passo num cartão.
 */
export const CHAVE_OFERTA_PRIMEIRO_PRODUTO = 'primeiro_produto_oferecido';

/**
 * @param {{ onboardingDone: boolean, ofertaFeita: boolean, perfilOk: boolean, temInsumos: boolean }} s
 * @returns {'ProfileSetup'|'PrimeiroProduto'|'MainTabs'}
 */
export function decidirRotaInicial({ onboardingDone, ofertaFeita, perfilOk, temInsumos }) {
  if (onboardingDone) {
    return !ofertaFeita && perfilOk && !temInsumos ? 'PrimeiroProduto' : 'MainTabs';
  }
  if (!perfilOk) return 'ProfileSetup';
  if (temInsumos) return 'MainTabs';
  return 'PrimeiroProduto';
}

/** onboarding_done já marcado e a oferta já feita: nem precisa ler o banco. */
export function podeIrDiretoParaApp({ onboardingDone, ofertaFeita }) {
  return !!onboardingDone && !!ofertaFeita;
}
