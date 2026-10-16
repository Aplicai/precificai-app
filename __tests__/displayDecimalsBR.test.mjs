/**
 * Percentuais na tela com ponto decimal ("15.0%") → formatPercentBR / formatNumberBR.
 * Guarda de fonte: nenhum `x.toFixed(n)` (n ≥ 1) colado num "%" em telas/componentes.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formatNumberBR, formatPercentBR } from '../src/utils/calculations.js';

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..');

function listar(dir) {
  return readdirSync(join(raiz, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = `${dir}/${d.name}`;
    if (d.isDirectory()) return listar(rel);
    return /\.(js|jsx)$/.test(d.name) ? [rel] : [];
  });
}

test('formatPercentBR/formatNumberBR: vírgula decimal e milhar com ponto', () => {
  assert.equal(formatPercentBR(15, 1), '15,0%');
  assert.equal(formatNumberBR(1234.5, 2), '1.234,50');
});

test('telas/componentes não exibem percentual com toFixed (ponto decimal)', () => {
  const ofensores = [];
  // `.toFixed(1)}%`, `.toFixed(1)%`, `.toFixed(1) + '%'` — sem .replace('.', ',') no meio.
  const padrao = /\.toFixed\([1-9]\)\s*(\}\s*%|%|\+\s*['"]%)/;
  for (const rel of [...listar('src/screens'), ...listar('src/components')]) {
    const linhas = readFileSync(join(raiz, rel), 'utf8').split('\n');
    linhas.forEach((l, i) => {
      if (/style=|width:/.test(l)) return; // CSS (largura em %) precisa de ponto
      if (padrao.test(l)) ofensores.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(ofensores, []);
});
