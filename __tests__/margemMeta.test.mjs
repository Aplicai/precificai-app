/**
 * Testes — src/utils/margemMeta.js (fonte única da meta de margem).
 *
 * Bug: "margem baixa" tinha 3 cortes (10% no status da Home, 20% em Margem
 * Baixa, 15% em "Carteira saudável"), e a ficha completa usava 0% de margem
 * própria gravada pelo Kit (sugerido R$ 0,80) enquanto o cadastro rápido e o
 * PDF usavam a margem da conta (R$ 1,12).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const {
  MARGEM_META_PADRAO, resolverMargemMeta, margemDoProduto, classificarMargem, isMargemBaixa,
} = await import('../src/utils/margemMeta.js');

test('resolverMargemMeta: usa lucro_desejado válido, senão 15%', () => {
  assert.equal(resolverMargemMeta(0.2), 0.2);
  assert.equal(resolverMargemMeta('0.25'), 0.25);
  for (const v of [null, undefined, '', 0, -0.1, 1, 1.5, NaN, 'abc']) {
    assert.equal(resolverMargemMeta(v), MARGEM_META_PADRAO, `valor ${v}`);
  }
});

test('margemDoProduto: 0/vazio (Kit, cadastro rápido) = margem da conta; positivo = própria', () => {
  assert.equal(margemDoProduto(0, 0.2), 0.2); // Kit gravava 0 sem campo na tela
  assert.equal(margemDoProduto(null, 0.2), 0.2);
  assert.equal(margemDoProduto('', 0.2), 0.2);
  assert.equal(margemDoProduto(undefined, null), MARGEM_META_PADRAO);
  assert.equal(margemDoProduto(0.3, 0.2), 0.3);
  assert.equal(margemDoProduto(1.2, 0.2), 0.2); // >= 100% é impossível (markup infinito)
});

test('classificarMargem: faixas acima / medio (até 10 pontos abaixo) / abaixo da meta', () => {
  assert.equal(classificarMargem(0.2, 0.2), 'acima');
  assert.equal(classificarMargem(0.15, 0.2), 'medio');
  assert.equal(classificarMargem(0.1, 0.2), 'medio');
  assert.equal(classificarMargem(0.099, 0.2), 'abaixo');
  assert.equal(classificarMargem(-0.05, 0.2), 'abaixo');
  assert.equal(classificarMargem(NaN, 0.2), null);
  assert.equal(classificarMargem(undefined, 0.2), null);
});

test('isMargemBaixa: um único corte (a meta); 12% é baixa com meta 20%, mesmo acima dos antigos 10%', () => {
  assert.equal(isMargemBaixa(0.12, 0.2), true);
  assert.equal(isMargemBaixa(0.2, 0.2), false);
  assert.equal(isMargemBaixa(0.25, 0.2), false);
  // sem meta configurada: 15%
  assert.equal(isMargemBaixa(0.14, null), true);
  assert.equal(isMargemBaixa(0.15, null), false);
});
