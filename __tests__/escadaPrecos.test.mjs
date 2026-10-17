/**
 * Testes — escada dos 3 preços (17/10/2026), src/utils/escadaPrecos.js.
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/escadaPrecos.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  etapaEscada, mostrarInicioSimples, mostrarEscadaNoPainel, textoTabelaPrecos,
  numerosDoMes, valorParaCampo, META_ESCADA,
} from '../src/utils/escadaPrecos.js';
import { markErrorResult } from '../src/database/dbResult.js';
import { parseValorBR, calcularPrecoRapido } from '../src/utils/precoRapido.js';

test('etapaEscada conta os produtos com preço até a meta de 3', () => {
  assert.equal(META_ESCADA, 3);
  assert.deepEqual(etapaEscada(0), { feitos: 0, meta: 3, completa: false });
  assert.deepEqual(etapaEscada(1), { feitos: 1, meta: 3, completa: false });
  assert.deepEqual(etapaEscada(2), { feitos: 2, meta: 3, completa: false });
  assert.deepEqual(etapaEscada(3), { feitos: 3, meta: 3, completa: true });
  assert.deepEqual(etapaEscada(7), { feitos: 3, meta: 3, completa: true });
  assert.deepEqual(etapaEscada([{}, {}]), { feitos: 2, meta: 3, completa: false });
  assert.deepEqual(etapaEscada(undefined), { feitos: 0, meta: 3, completa: false });
  assert.deepEqual(etapaEscada(-2), { feitos: 0, meta: 3, completa: false });
});

test('Home simples: 0 sempre; 1 e 2 até escolher o painel; 3 nunca', () => {
  for (const escolheuPainel of [false, true]) {
    assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 0, escolheuPainel }), true);
    assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 3, escolheuPainel }), false);
    assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 5, escolheuPainel }), false);
  }
  assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 1, escolheuPainel: false }), true);
  assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 2, escolheuPainel: false }), true);
  assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 1, escolheuPainel: true }), false);
  assert.equal(mostrarInicioSimples({ dadosOk: true, prodsComPreco: 2, escolheuPainel: true }), false);
});

test('Home simples nunca decide com erro de carga ou carregando', () => {
  assert.equal(mostrarInicioSimples({ dadosOk: false, prodsComPreco: 0, escolheuPainel: false }), false);
  assert.equal(mostrarInicioSimples({ dadosOk: false, prodsComPreco: 1, escolheuPainel: false }), false);
  assert.equal(mostrarEscadaNoPainel({ dadosOk: false, prodsComPreco: 1, escolheuPainel: true }), false);
});

test('escolheu o painel com 1 ou 2: escada vira card no topo', () => {
  assert.equal(mostrarEscadaNoPainel({ dadosOk: true, prodsComPreco: 1, escolheuPainel: true }), true);
  assert.equal(mostrarEscadaNoPainel({ dadosOk: true, prodsComPreco: 2, escolheuPainel: true }), true);
  assert.equal(mostrarEscadaNoPainel({ dadosOk: true, prodsComPreco: 0, escolheuPainel: true }), false);
  assert.equal(mostrarEscadaNoPainel({ dadosOk: true, prodsComPreco: 3, escolheuPainel: true }), false);
  assert.equal(mostrarEscadaNoPainel({ dadosOk: true, prodsComPreco: 2, escolheuPainel: false }), false);
});

test('texto da tabela: nome do negócio, R$ no padrão brasileiro e acentos', () => {
  const t = textoTabelaPrecos('Doces da Conceição', [
    { nome: 'Pão de mel', preco: 4.5 },
    { nome: 'Bolo de chocolate', preco: 1234.5 },
    { nome: 'Sem preço', preco: 0 },
    { nome: '  Brigadeiro gourmet ', preco: 2 },
  ]);
  assert.equal(t, '*Doces da Conceição*\nTabela de preços\n\nPão de mel: R$ 4,50\nBolo de chocolate: R$ 1.234,50\nBrigadeiro gourmet: R$ 2,00');
  assert.ok(!t.includes('—'), 'sem travessão');
});

test('texto da tabela sem nome do negócio', () => {
  assert.equal(textoTabelaPrecos('  ', [{ nome: 'Coxinha', preco: 7 }]), '*Tabela de preços*\n\nCoxinha: R$ 7,00');
  assert.equal(textoTabelaPrecos(null, null), '*Tabela de preços*\n\n');
});

test('números do mês: soma das despesas fixas e média das vendas com valor', () => {
  const r = numerosDoMes(
    [{ valor: 1500 }, { valor: 500 }],
    [{ valor: 8000 }, { valor: 0 }, { valor: 10000 }, { valor: null }],
  );
  assert.deepEqual(r, { gastoMes: 2000, vendaMes: 9000, completo: true });
});

test('números do mês: leitura com erro volta a perguntar (nunca zero por engano)', () => {
  const erroFixas = numerosDoMes(markErrorResult([]), [{ valor: 8000 }]);
  assert.equal(erroFixas.gastoMes, null);
  assert.equal(erroFixas.vendaMes, 8000);
  assert.equal(erroFixas.completo, false);
  const erroFat = numerosDoMes([{ valor: 2000 }], markErrorResult([]));
  assert.equal(erroFat.vendaMes, null);
  assert.equal(erroFat.completo, false);
  const nulos = numerosDoMes(null, undefined);
  assert.deepEqual(nulos, { gastoMes: null, vendaMes: null, completo: false });
});

test('números do mês: nada salvo pergunta de novo', () => {
  assert.deepEqual(numerosDoMes([], []), { gastoMes: null, vendaMes: null, completo: false });
  assert.deepEqual(numerosDoMes([], [{ valor: 0 }]), { gastoMes: null, vendaMes: null, completo: false });
});

test('valor do campo volta ao mesmo número no Preço rápido', () => {
  assert.equal(valorParaCampo(2000), '2.000');
  assert.equal(valorParaCampo(8500.5), '8.500,50');
  assert.equal(valorParaCampo(0), '0');
  assert.equal(valorParaCampo(null), '');
  assert.equal(valorParaCampo(NaN), '');
  for (const n of [0, 350, 2000, 8500.5, 12345.67, 1000000]) {
    assert.equal(parseValorBR(valorParaCampo(n)), n);
  }
  // Mesmo preço com os números salvos ou digitados.
  const salvo = numerosDoMes([{ valor: 2000 }], [{ valor: 8000 }]);
  const a = calcularPrecoRapido({ custoReceita: '40', rendimento: '20', gastoMes: valorParaCampo(salvo.gastoMes), vendaMes: valorParaCampo(salvo.vendaMes) });
  const b = calcularPrecoRapido({ custoReceita: '40', rendimento: '20', gastoMes: '2000', vendaMes: '8000' });
  assert.equal(a.preco, b.preco);
});
