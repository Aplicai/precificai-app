/**
 * Testes — src/utils/keyboardInset.js
 *
 * Contexto: `KeyboardAvoidingView` é no-op no react-native-web, então o modal
 * de combo (e qualquer bottom sheet) ficava atrás do teclado no navegador do
 * celular. Estes testes travam as duas garantias que importam:
 *
 *   1. SEM teclado o resultado é sempre "não mexa em nada" (0 / null), pra que
 *      a tela se comporte exatamente como antes.
 *   2. COM teclado a folha cabe acima dele, sem virar uma fresta.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/keyboardInset.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  calcKeyboardInset,
  calcSheetMaxHeight,
  MIN_KEYBOARD_PX,
  MAX_KEYBOARD_RATIO,
  MIN_SHEET_PX,
} from '../src/utils/keyboardInset.js';

test('sem teclado: visual viewport igual ao layout viewport → 0', () => {
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: 844 }), 0);
});

test('barra de endereço recolhendo NÃO conta como teclado', () => {
  // iPhone Safari esconde ~90 px de barra ao rolar. Abaixo do piso de 120 px.
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: 754 }), 0);
  // Exatamente no piso ainda não conta (a comparação é estritamente menor).
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: 844 - MIN_KEYBOARD_PX + 1 }), 0);
});

test('teclado aberto no iPhone 14 (844 de altura, teclado ~336) → 336', () => {
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: 508 }), 336);
});

test('offsetTop conta junto (iOS desloca o visual viewport ao focar input)', () => {
  // viewport de 500 deslocado 150 pra baixo: sobra 844-650 = 194 de teclado.
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: 500, viewportOffsetTop: 150 }), 194);
});

test('medida absurda é limitada a 60% da janela', () => {
  const inset = calcKeyboardInset({ innerHeight: 800, viewportHeight: 50 });
  assert.equal(inset, 800 * MAX_KEYBOARD_RATIO);
});

test('falha fechado: medidas ausentes, zeradas ou inválidas → 0', () => {
  assert.equal(calcKeyboardInset(), 0);
  assert.equal(calcKeyboardInset({}), 0);
  assert.equal(calcKeyboardInset({ innerHeight: 0, viewportHeight: 0 }), 0);
  assert.equal(calcKeyboardInset({ innerHeight: 844 }), 0);
  assert.equal(calcKeyboardInset({ innerHeight: NaN, viewportHeight: 500 }), 0);
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: Infinity }), 0);
  // Visual viewport MAIOR que o layout (zoom out) não é teclado.
  assert.equal(calcKeyboardInset({ innerHeight: 844, viewportHeight: 1000 }), 0);
});

test('calcSheetMaxHeight devolve null sem teclado — estilo declarado continua valendo', () => {
  assert.equal(calcSheetMaxHeight(844, 0), null);
  assert.equal(calcSheetMaxHeight(844, null), null);
  assert.equal(calcSheetMaxHeight(0, 300), null);
});

test('com teclado a folha cabe no espaço que sobrou', () => {
  // 844 - 336 = 508 de espaço; 92% disso = 467,36.
  const max = calcSheetMaxHeight(844, 336);
  assert.ok(Math.abs(max - 467.36) < 1e-6, `obtido ${max}`);
  assert.ok(max + 336 < 844, 'a folha tem que terminar acima do teclado');
});

test('folha nunca colapsa abaixo do piso mínimo', () => {
  // Teclado gigante numa janela baixa (celular pequeno deitado).
  assert.equal(calcSheetMaxHeight(400, 380), MIN_SHEET_PX);
});
