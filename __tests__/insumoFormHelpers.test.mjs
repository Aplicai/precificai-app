/**
 * Testes — src/utils/insumoFormHelpers.js (walkthrough usuário real 2026-09).
 * Roda via `npm test`.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  formatDecimalBR, formatMoneyBR, liquidaEfetiva, aproveitamentoPercent,
  semHistoricoPrecos, escolherSugestao, normalizeNome,
} from '../src/utils/insumoFormHelpers.js';

// ---------- formatDecimalBR / formatMoneyBR ----------

test('formatMoneyBR — 5.9 vira "5,90" (bug "5.9" na edição)', () => {
  assert.equal(formatMoneyBR(5.9), '5,90');
  assert.equal(formatMoneyBR(18), '18,00');
  assert.equal(formatMoneyBR(1234.5), '1234,50');
});

test('formatMoneyBR — vazio/0/null/NaN devolvem ""', () => {
  assert.equal(formatMoneyBR(0), '');
  assert.equal(formatMoneyBR(null), '');
  assert.equal(formatMoneyBR(undefined), '');
  assert.equal(formatMoneyBR(''), '');
  assert.equal(formatMoneyBR(NaN), '');
});

test('formatDecimalBR — quantidades sem zeros à direita', () => {
  assert.equal(formatDecimalBR(1000), '1000');
  assert.equal(formatDecimalBR(0.5), '0,5');
  assert.equal(formatDecimalBR(12.25), '12,25');
  assert.equal(formatDecimalBR(0.125), '0,125');
  assert.equal(formatDecimalBR(800.0), '800');
});

test('formatDecimalBR — aceita string PT-BR e retorna vazio pra inválido', () => {
  assert.equal(formatDecimalBR('1.000,50'), '1000,5');
  assert.equal(formatDecimalBR('abc'), '');
  assert.equal(formatDecimalBR(null), '');
  assert.equal(formatDecimalBR(''), '');
});

// ---------- liquidaEfetiva / aproveitamentoPercent ----------

test('liquidaEfetiva — líquida vazia = bruta; preenchida prevalece', () => {
  assert.equal(liquidaEfetiva('1000', ''), 1000);
  assert.equal(liquidaEfetiva('1000', '   '), 1000);
  assert.equal(liquidaEfetiva('1000', null), 1000);
  assert.equal(liquidaEfetiva('1000', '800'), 800);
  assert.equal(liquidaEfetiva('1,5', '0,5'), 0.5);
  assert.equal(liquidaEfetiva('', ''), null);
  assert.equal(liquidaEfetiva('abc', ''), null);
});

test('aproveitamentoPercent — 1000/1000 → 100, 800/1000 → 80', () => {
  assert.equal(aproveitamentoPercent(1000, 1000), 100);
  assert.equal(aproveitamentoPercent(1000, 800), 80);
  assert.equal(aproveitamentoPercent(1000, 350), 35);
  assert.equal(aproveitamentoPercent(0, 100), 0);
  assert.equal(aproveitamentoPercent(null, 100), 0);
});

// ---------- semHistoricoPrecos ----------

test('semHistoricoPrecos — remove histórico de preços e recalcula total', () => {
  const deps = {
    total: 4,
    temBloqueio: false,
    porTabela: [
      { label: 'preparos', n: 2 },
      { label: 'produtos (uso direto)', n: 1 },
      { label: 'histórico de preços', n: 1 },
    ],
  };
  const out = semHistoricoPrecos(deps);
  assert.equal(out.total, 3);
  assert.deepEqual(out.porTabela.map(d => d.label), ['preparos', 'produtos (uso direto)']);
  assert.equal(out.temBloqueio, false);
  // não muta o original
  assert.equal(deps.total, 4);
  assert.equal(deps.porTabela.length, 3);
});

test('semHistoricoPrecos — item recém-criado (só histórico) vira total 0', () => {
  const out = semHistoricoPrecos({ total: 1, porTabela: [{ label: 'histórico de preços', n: 1 }], temBloqueio: false });
  assert.equal(out.total, 0);
  assert.deepEqual(out.porTabela, []);
});

test('semHistoricoPrecos — null/undefined passam direto', () => {
  assert.equal(semHistoricoPrecos(null), null);
  assert.equal(semHistoricoPrecos(undefined), undefined);
});

// ---------- escolherSugestao ----------

const DICT = [
  { id: 't1', nome_canonico: 'Farinha de Trigo Tipo 1', sinonimos: ['farinha branca', 'trigo branco'] },
  { id: 't2', nome_canonico: 'Farinha de Trigo Tipo 2' },
  { id: 'int', nome_canonico: 'Farinha de Trigo Integral' },
  { id: 'pao', nome_canonico: 'Farinha de Trigo Especial para Pão' },
  { id: 'rosca', nome_canonico: 'Farinha de Rosca' },
  { id: 'acucar', nome_canonico: 'Açúcar Cristal' },
  { id: 'cebola', nome_canonico: 'Cebola' },
];

test('normalizeNome — remove acento/ç, minúsculo, colapsa espaços', () => {
  assert.equal(normalizeNome('  Açúcar   Cristal '), 'acucar cristal');
  assert.equal(normalizeNome('Farinha de Trigo Tipo 1'), 'farinha de trigo tipo 1');
});

test('escolherSugestao — nome exato (case/acento) vence', () => {
  assert.equal(escolherSugestao('farinha de trigo integral', DICT).id, 'int');
  assert.equal(escolherSugestao('ACUCAR CRISTAL', DICT).id, 'acucar');
  assert.equal(escolherSugestao('Farinha de Rosca', DICT).id, 'rosca');
});

test('escolherSugestao — sinônimo exato vence', () => {
  assert.equal(escolherSugestao('Farinha branca', DICT).id, 't1');
});

test('escolherSugestao — "Farinha de trigo" sugere o prefixo mais curto (Tipo 1), NÃO Integral', () => {
  const s = escolherSugestao('Farinha de trigo', DICT);
  assert.ok(s);
  assert.equal(s.id, 't1');
});

test('escolherSugestao — digitado mais longo que um canônico sugere o canônico contido', () => {
  assert.equal(escolherSugestao('Farinha de trigo integral orgânica', DICT).id, 'int');
  assert.equal(escolherSugestao('Cebola roxa', DICT).id, 'cebola');
});

test('escolherSugestao — nunca sugere item diferente por tokens parciais', () => {
  // "Farinha" sozinha é prefixo de todas → sugere a mais curta (Rosca é a menor)
  assert.equal(escolherSugestao('Farinha', DICT).id, 'rosca');
  // texto que nomeia outro item por completo não sugere nada do dicionário
  assert.equal(escolherSugestao('Farinha de milho', DICT), null);
  assert.equal(escolherSugestao('Trigo farinha tipo 1', DICT), null);
  assert.equal(escolherSugestao('Farinha de tri', DICT), null); // prefixo parcial de palavra
});

test('escolherSugestao — entradas vazias', () => {
  assert.equal(escolherSugestao('', DICT), null);
  assert.equal(escolherSugestao('Cebola', []), null);
  assert.equal(escolherSugestao('Cebola', null), null);
});
