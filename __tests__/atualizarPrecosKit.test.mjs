/**
 * Testes — bugs do tutorial nas telas "Atualizar Preços" e "Kit de Início".
 *
 * Atualizar Preços: trocar de aba durante o carregamento deixava a lista da
 * aba anterior com a aba nova ativa (o guard descartava o load NOVO), e o save
 * escolhia a tabela pela aba ativa → valor/id gravados na tabela errada.
 *
 * Kit de Início: o aviso vermelho dizia sempre que o kit APAGA tudo, mesmo
 * com "Sobrescrever dados existentes" desmarcado (padrão: só adiciona).
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { tabelaDaAba, createLatestOnly } from '../src/utils/atualizarPrecos.js';
import { avisoApagarKit } from '../src/utils/kitInicioAviso.js';
import { formatDecimalBR } from '../src/utils/insumoFormHelpers.js';
import { formatCurrency } from '../src/utils/calculations.js';

test('tabelaDaAba: cada aba grava na própria tabela; aba desconhecida não chuta', () => {
  assert.equal(tabelaDaAba('insumos'), 'materias_primas');
  assert.equal(tabelaDaAba('embalagens'), 'embalagens');
  assert.equal(tabelaDaAba('produtos'), 'produtos');
  assert.equal(tabelaDaAba('combos'), 'delivery_combos');
  assert.equal(tabelaDaAba('preparos'), '');
  assert.equal(tabelaDaAba(undefined), '');
});

test('createLatestOnly: load antigo que termina depois NÃO sobrescreve o da aba nova', async () => {
  const seq = createLatestOnly();
  let lista = null;
  const carregar = (aba, atrasoMs) => {
    const token = seq.next();
    return new Promise(r => setTimeout(r, atrasoMs)).then(() => {
      if (seq.isLatest(token)) lista = aba;
    });
  };
  // Usuário abre "insumos" (lento) e troca pra "produtos" (rápido) no meio.
  const a = carregar('insumos', 30);
  const b = carregar('produtos', 5);
  await Promise.all([a, b]);
  assert.equal(lista, 'produtos');
});

test('createLatestOnly: o load mais novo nunca é descartado, mesmo com outro em andamento', async () => {
  const seq = createLatestOnly();
  const t1 = seq.next();
  const t2 = seq.next();
  assert.equal(seq.isLatest(t1), false);
  assert.equal(seq.isLatest(t2), true);
});

test('variação em formato BR: 7.2 → "7,2"', () => {
  assert.equal(formatDecimalBR(7.2, 1), '7,2');
  assert.equal(formatDecimalBR(12.345, 1), '12,3');
});

test('preço de exemplo do kit em formato BR', () => {
  assert.equal(formatCurrency(0), 'R$ 0,00');
  assert.equal(formatCurrency(1234.5), 'R$ 1.234,50');
});

test('avisoApagarKit: sem "Sobrescrever" o kit só adiciona → sem aviso de exclusão', () => {
  assert.equal(avisoApagarKit({ isSetup: false, selected: 'confeitaria', sobrescrever: false }), null);
});

test('avisoApagarKit: com "Sobrescrever" marcado → aviso de exclusão', () => {
  const msg = avisoApagarKit({ isSetup: false, selected: 'confeitaria', sobrescrever: true });
  assert.match(msg, /APAGA/);
});

test('avisoApagarKit: "Começar do zero" fora do setup sempre apaga → aviso', () => {
  assert.match(avisoApagarKit({ isSetup: false, selected: 'outro', sobrescrever: false }), /APAGA/);
});

test('avisoApagarKit: setup inicial ou nada selecionado → sem aviso', () => {
  assert.equal(avisoApagarKit({ isSetup: true, selected: 'outro', sobrescrever: true }), null);
  assert.equal(avisoApagarKit({ isSetup: true, selected: 'confeitaria', sobrescrever: true }), null);
  assert.equal(avisoApagarKit({ isSetup: false, selected: null, sobrescrever: true }), null);
});
