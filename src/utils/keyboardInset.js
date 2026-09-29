/**
 * keyboardInset — quanto o teclado virtual cobre da janela, em pixels.
 *
 * Por que isto existe: `KeyboardAvoidingView` é NO-OP no react-native-web
 * (0.21.2: `onKeyboardChange` vazio, `render` devolve uma View pura). Como os
 * clientes usam a PWA no navegador do celular, o padrão do app
 * (`behavior={Platform.OS === 'ios' ? 'padding' : undefined}`) não faz nada ali.
 *
 * No navegador do celular o teclado encolhe o *visual viewport* sem mexer no
 * *layout viewport*. Um overlay `position: fixed` — que é como o Modal do RNW
 * renderiza — continua sendo desenhado com a altura toda, atrás do teclado. O
 * conserto é medir a diferença entre os dois viewports e levantar o conteúdo.
 *
 * Funções puras pra dar pra testar sem DOM. O hook fica em
 * `src/hooks/useKeyboardInset.js`.
 */

// Esconder/mostrar a barra de endereço mexe no visual viewport em ~50-100 px.
// Teclado de celular passa de 200 px. O piso evita tratar barra como teclado.
export const MIN_KEYBOARD_PX = 120;

// Teclado nenhum ocupa mais que isto. Protege contra medida absurda.
export const MAX_KEYBOARD_RATIO = 0.6;

// Abaixo disto a folha vira uma fresta inútil — melhor não encolher mais.
export const MIN_SHEET_PX = 200;

const isPositive = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;

/**
 * @param {object} m
 * @param {number} m.innerHeight        window.innerHeight (layout viewport)
 * @param {number} m.viewportHeight     window.visualViewport.height
 * @param {number} [m.viewportOffsetTop] window.visualViewport.offsetTop
 * @returns {number} pixels cobertos pelo teclado; 0 quando não há teclado.
 *
 * Falha fechado: qualquer medida ausente ou estranha devolve 0, e aí a tela
 * se comporta exatamente como antes deste arquivo existir.
 */
export function calcKeyboardInset({ innerHeight, viewportHeight, viewportOffsetTop = 0 } = {}) {
  if (!isPositive(innerHeight) || !isPositive(viewportHeight)) return 0;
  const offset = Number.isFinite(viewportOffsetTop) && viewportOffsetTop > 0 ? viewportOffsetTop : 0;

  const inset = innerHeight - (viewportHeight + offset);
  if (!Number.isFinite(inset) || inset < MIN_KEYBOARD_PX) return 0;

  return Math.min(inset, innerHeight * MAX_KEYBOARD_RATIO);
}

/**
 * Altura máxima da folha (bottom sheet) com o teclado aberto.
 *
 * @returns {number|null} `null` = não sobrepor nada, deixa o estilo declarado
 * (`maxHeight: '92%'`) valer. É o caminho sem teclado, e por isso o
 * comportamento atual fica byte-a-byte idêntico.
 */
export function calcSheetMaxHeight(innerHeight, inset, ratio = 0.92) {
  if (!isPositive(inset)) return null;
  if (!isPositive(innerHeight)) return null;

  const disponivel = (innerHeight - inset) * ratio;
  return Math.max(MIN_SHEET_PX, disponivel);
}
