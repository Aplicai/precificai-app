/**
 * Testes de regressão: garantia de que a normalização de unidade entre o
 * dicionário (insumos_*.json) e o formulário de Insumos não regrida.
 *
 * BUG ORIGINAL (Vinho Branco): dicionário usa "ml" (lowercase) mas o app valida
 * só ['g','kg','mL','L','un']. Sem normalização, salvar item após aceitar a
 * sugestão automática (vinho branco, coca-cola, leites vegetais etc.) disparava
 * Alert "Unidade inválida" e bloqueava o save.
 *
 * Roda via Node 18+ test runner: `node --test __tests__/`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DICT_DIR = join(__dirname, '..', 'src', 'data', 'dicionario');

const DICT_FILES = [
  'insumos_universais',
  'insumos_carnes',
  'insumos_vegetais',
  'insumos_frutas',
  'insumos_temperos',
  'insumos_confeitaria',
  'insumos_lanchonete',
  'insumos_bebidas',
];

function loadDict(file) {
  return JSON.parse(readFileSync(join(DICT_DIR, file + '.json'), 'utf8'));
}

// Mapeamento espelha o que está em MateriaPrimaFormScreen.js — atualize ambos juntos.
const UNIT_CANONICAL_MAP = {
  'ml': 'mL', 'ML': 'mL', 'mL': 'mL',
  'l': 'L', 'L': 'L',
  'g': 'g', 'G': 'g',
  'kg': 'kg', 'KG': 'kg', 'Kg': 'kg',
  'un': 'un', 'UN': 'un', 'Un': 'un',
};
const VALID_UNITS = ['g', 'kg', 'mL', 'L', 'un'];

test('dicionário: toda unidade_padrao mapeia para uma unidade canônica válida', () => {
  const offenders = [];
  for (const f of DICT_FILES) {
    const items = loadDict(f);
    for (const item of items) {
      const canonical = UNIT_CANONICAL_MAP[item.unidade_padrao];
      if (!canonical || !VALID_UNITS.includes(canonical)) {
        offenders.push(`${f}: ${item.id} (${item.nome_canonico}) usa "${item.unidade_padrao}"`);
      }
    }
  }
  assert.equal(
    offenders.length, 0,
    `Itens com unidade não-canônica detectados:\n${offenders.join('\n')}`
  );
});

test('vinho branco: regressão — sugestão automática precisa produzir unidade canônica', () => {
  const bebidas = loadDict('insumos_bebidas');
  const vinhoBranco = bebidas.find(i => i.id === 'ins_vinho_branco');
  assert.ok(vinhoBranco, 'Vinho Branco deve existir no dicionário de bebidas');
  // O bug original: dicionário tinha "ml" mas o app só aceitava "mL"
  const canonical = UNIT_CANONICAL_MAP[vinhoBranco.unidade_padrao];
  assert.equal(canonical, 'mL', 'Vinho Branco precisa virar "mL" após normalização');
  assert.ok(VALID_UNITS.includes(canonical), 'Unidade canônica precisa estar na lista válida');
});

test('multi-word items (nome com espaço): nenhuma colisão de validação', () => {
  // Bug suspect: items com 2+ palavras (vinho branco, queijo branco, leite condensado)
  // foram apontados como potencialmente problemáticos.
  const todosFiles = DICT_FILES.map(f => loadDict(f)).flat();
  const multiWord = todosFiles.filter(i =>
    typeof i.nome_canonico === 'string' && i.nome_canonico.trim().split(/\s+/).length >= 2
  );
  assert.ok(multiWord.length > 50, 'Esperado dezenas de itens multi-palavra');
  for (const item of multiWord) {
    const canonical = UNIT_CANONICAL_MAP[item.unidade_padrao];
    assert.ok(
      canonical && VALID_UNITS.includes(canonical),
      `${item.nome_canonico} (${item.id}) com unidade "${item.unidade_padrao}" não normaliza`
    );
  }
});
