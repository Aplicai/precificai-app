/**
 * Testes — src/utils/compraSentence.js (frase "Comprei [5] [kg] por R$ [25,00]").
 * Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  UNIDADE_PADRAO_NOVO,
  MSG_QUANTIDADE_OBRIGATORIA,
  MSG_VALOR_OBRIGATORIO,
  deveAbrirPerda,
  sufixoPrecoBase,
  fraseCustoResultado,
  mensagensErroCompra,
} from '../src/utils/compraSentence.js';

test('unidade padrão de ingrediente novo é kg', () => {
  assert.equal(UNIDADE_PADRAO_NOVO, 'kg');
});

// ---------- deveAbrirPerda ----------

test('deveAbrirPerda — abre quando líquida difere da bruta (number)', () => {
  assert.equal(deveAbrirPerda(1000, 800), true);
  assert.equal(deveAbrirPerda(1, 0.35), true);
});

test('deveAbrirPerda — fechado quando líquida == bruta ou vazia/0', () => {
  assert.equal(deveAbrirPerda(1000, 1000), false);
  assert.equal(deveAbrirPerda(1000, null), false);
  assert.equal(deveAbrirPerda(1000, undefined), false);
  assert.equal(deveAbrirPerda(1000, 0), false);
  assert.equal(deveAbrirPerda(1000, ''), false);
  assert.equal(deveAbrirPerda(0, 500), false);
  assert.equal(deveAbrirPerda(null, null), false);
});

test('deveAbrirPerda — aceita strings PT-BR ("1.000,50")', () => {
  assert.equal(deveAbrirPerda('1.000,50', '800'), true);
  assert.equal(deveAbrirPerda('1.000,50', '1000,5'), false);
  assert.equal(deveAbrirPerda('abc', '800'), false);
});

// ---------- sufixoPrecoBase / fraseCustoResultado ----------

test('sufixoPrecoBase — peso/volume/unidade', () => {
  assert.equal(sufixoPrecoBase('kg'), 'por kg');
  assert.equal(sufixoPrecoBase('g'), 'por kg');
  assert.equal(sufixoPrecoBase('L'), 'por litro');
  assert.equal(sufixoPrecoBase('mL'), 'por litro');
  assert.equal(sufixoPrecoBase('un'), 'por unidade');
});

test('fraseCustoResultado — "Isso dá R$ 5,00 por kg"', () => {
  assert.equal(fraseCustoResultado(5, 'kg'), 'Isso dá R$ 5,00 por kg');
  assert.equal(fraseCustoResultado(1234.5, 'g'), 'Isso dá R$ 1.234,50 por kg');
  assert.equal(fraseCustoResultado(0.75, 'mL'), 'Isso dá R$ 0,75 por litro');
  assert.equal(fraseCustoResultado(1.5, 'un'), 'Isso dá R$ 1,50 por unidade');
});

test('fraseCustoResultado — vazio pra preço inválido ou zero', () => {
  assert.equal(fraseCustoResultado(0, 'kg'), '');
  assert.equal(fraseCustoResultado(null, 'kg'), '');
  assert.equal(fraseCustoResultado(NaN, 'kg'), '');
  assert.equal(fraseCustoResultado(-1, 'kg'), '');
});

// ---------- mensagensErroCompra ----------

test('mensagensErroCompra — aponta pra nova frase, na ordem quantidade → valor', () => {
  assert.deepEqual(mensagensErroCompra({}), []);
  assert.deepEqual(mensagensErroCompra(null), []);
  assert.deepEqual(mensagensErroCompra({ quantidade_bruta: true }), [MSG_QUANTIDADE_OBRIGATORIA]);
  assert.deepEqual(mensagensErroCompra({ valor_pago: true }), [MSG_VALOR_OBRIGATORIO]);
  assert.deepEqual(
    mensagensErroCompra({ nome: true, quantidade_bruta: true, valor_pago: true }),
    ['Diga quanto você comprou', 'Diga quanto pagou'],
  );
});
