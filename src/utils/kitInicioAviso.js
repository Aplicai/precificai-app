/**
 * Texto do aviso vermelho do Kit de Início (KitInicioScreen).
 *
 * Bug do tutorial: o card dizia sempre que trocar o segmento APAGA tudo, mas
 * com "Sobrescrever dados existentes" desmarcado (padrão) o kit só ADICIONA.
 * O aviso agora só aparece quando a ação escolhida apaga dados de verdade:
 *  - "Começar do zero" (segmento 'outro') fora do setup inicial;
 *  - qualquer kit com "Sobrescrever" marcado fora do setup inicial.
 * No setup inicial (banco vazio) nada é apagado. Devolve null = sem aviso.
 */
export function avisoApagarKit({ isSetup, selected, sobrescrever }) {
  if (isSetup || !selected) return null;
  if (selected === 'outro') {
    return 'Começar do zero APAGA todos os ingredientes, receitas base, embalagens, produtos e categorias atuais.';
  }
  if (sobrescrever) {
    return 'Com "Sobrescrever dados existentes" marcado, o kit APAGA todos os ingredientes, receitas base, embalagens, produtos e categorias atuais antes de aplicar.';
  }
  return null;
}
