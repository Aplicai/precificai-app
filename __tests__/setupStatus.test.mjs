/**
 * UX audit 09/09 (Fase B, item 16): a barra "Configuração do app 83% —
 * Próxima: Delivery" ficava na Home pra sempre pra quem não usa delivery.
 * Regra: se TODAS as etapas pendentes são opcionais, o banner não aparece.
 *
 * `setupStatus.js` importa `getDatabase` (stub via loader) — o helper é puro.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

const { soFaltamEtapasOpcionais } = await import('../src/utils/setupStatus.js');

const etapa = (key, done, extra = {}) => ({ key, label: key, done, ...extra });

test('soFaltamEtapasOpcionais: false quando falta etapa obrigatória', () => {
  const etapas = [
    etapa('financeiro', false, { obrigatoria: true }),
    etapa('insumos', true),
    etapa('delivery', false, { opcional: true }),
  ];
  assert.equal(soFaltamEtapasOpcionais(etapas), false);
});

test('soFaltamEtapasOpcionais: false quando falta etapa sem flag (insumos/produtos são núcleo)', () => {
  const etapas = [
    etapa('financeiro', true, { obrigatoria: true }),
    etapa('insumos', true),
    etapa('produtos', false),
    etapa('delivery', false, { opcional: true }),
  ];
  assert.equal(soFaltamEtapasOpcionais(etapas), false);
});

test('soFaltamEtapasOpcionais: true quando só Delivery (opcional) está pendente', () => {
  const etapas = [
    etapa('financeiro', true, { obrigatoria: true }),
    etapa('insumos', true),
    etapa('embalagens', true, { opcional: true }),
    etapa('preparos', true, { opcional: true }),
    etapa('produtos', true),
    etapa('delivery', false, { opcional: true }),
  ];
  assert.equal(soFaltamEtapasOpcionais(etapas), true);
});

test('soFaltamEtapasOpcionais: true quando só Embalagens + Preparos (opcionais) pendentes', () => {
  const etapas = [
    etapa('financeiro', true, { obrigatoria: true }),
    etapa('insumos', true),
    etapa('embalagens', false, { opcional: true }),
    etapa('preparos', false, { opcional: true }),
    etapa('produtos', true),
  ];
  assert.equal(soFaltamEtapasOpcionais(etapas), true);
});

test('soFaltamEtapasOpcionais: true quando tudo concluído (nada pendente = nada a mostrar)', () => {
  const etapas = [etapa('financeiro', true, { obrigatoria: true }), etapa('produtos', true)];
  assert.equal(soFaltamEtapasOpcionais(etapas), true);
});

test('soFaltamEtapasOpcionais: tolera lista vazia/nula', () => {
  assert.equal(soFaltamEtapasOpcionais([]), true);
  assert.equal(soFaltamEtapasOpcionais(null), true);
  assert.equal(soFaltamEtapasOpcionais(undefined), true);
});
