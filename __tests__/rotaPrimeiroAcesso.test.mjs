/**
 * Testes — src/utils/rotaPrimeiroAcesso.js (rota de entrada, 15/10/2026).
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/rotaPrimeiroAcesso.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { decidirRotaInicial, podeIrDiretoParaApp } from '../src/utils/rotaPrimeiroAcesso.js';

const r = (o) => decidirRotaInicial({ onboardingDone: false, ofertaFeita: false, perfilOk: true, temInsumos: false, ...o });

test('conta nova: sem perfil → perfil; com perfil e sem ingrediente → primeiro produto', () => {
  assert.equal(r({ perfilOk: false }), 'ProfileSetup');
  assert.equal(r({}), 'PrimeiroProduto');
});

test('quem já tem ingrediente vai para o app', () => {
  assert.equal(r({ temInsumos: true }), 'MainTabs');
  assert.equal(r({ onboardingDone: true, temInsumos: true }), 'MainTabs');
});

test('quem pulou o Kit no setup antigo (sem ingrediente) recebe o passo a passo uma vez', () => {
  assert.equal(r({ onboardingDone: true }), 'PrimeiroProduto');
  assert.equal(r({ onboardingDone: true, ofertaFeita: true }), 'MainTabs');
});

test('onboarding feito sem perfil não volta para o perfil', () => {
  assert.equal(r({ onboardingDone: true, perfilOk: false }), 'MainTabs');
});

test('atalho sem ler o banco só com onboarding feito e oferta feita', () => {
  assert.equal(podeIrDiretoParaApp({ onboardingDone: true, ofertaFeita: true }), true);
  assert.equal(podeIrDiretoParaApp({ onboardingDone: true, ofertaFeita: false }), false);
  assert.equal(podeIrDiretoParaApp({ onboardingDone: false, ofertaFeita: true }), false);
});
