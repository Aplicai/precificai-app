/**
 * Testes — bug do tutorial 05: ingrediente/embalagem criado POR DENTRO do
 * produto herdava a categoria DO PRODUTO (id de categorias_produtos) e o
 * Supabase recusava o INSERT (FK materias_primas_categoria_id_fkey).
 *
 * resolveCategoriaId garante que só um id da tabela certa chega ao INSERT.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolveCategoriaId, categoriaFilhoDefault } from '../src/utils/categoriaValida.js';

const insumos = [{ id: 10, nome: 'Laticínios' }, { id: 11, nome: 'Farinhas' }];

test('resolveCategoriaId: id presente na lista da tabela certa é mantido', async () => {
  assert.equal(await resolveCategoriaId(10, insumos), 10);
});

test('resolveCategoriaId: vazio/null vira null sem consultar o banco', async () => {
  let chamou = false;
  const lookup = async () => { chamou = true; return null; };
  assert.equal(await resolveCategoriaId(null, insumos, lookup), null);
  assert.equal(await resolveCategoriaId(undefined, insumos, lookup), null);
  assert.equal(await resolveCategoriaId('', insumos, lookup), null);
  assert.equal(chamou, false);
});

test('resolveCategoriaId: id de OUTRA tabela (categoria do produto, ex. Bolos 280) vira null', async () => {
  const lookup = async () => null; // não existe em categorias_insumos
  assert.equal(await resolveCategoriaId(280, insumos, lookup), null);
});

test('resolveCategoriaId: id fora da lista em memória mas existente no banco (categoria recém-criada) é mantido', async () => {
  const lookup = async (id) => (id === 99 ? { id: 99 } : null);
  assert.equal(await resolveCategoriaId(99, insumos, lookup), 99);
});

test('resolveCategoriaId: sem lookup, id fora da lista vira null', async () => {
  assert.equal(await resolveCategoriaId(280, insumos), null);
});

test('resolveCategoriaId: falha no lookup não derruba o save — vira null', async () => {
  const lookup = async () => { throw new Error('rede'); };
  assert.equal(await resolveCategoriaId(280, insumos, lookup), null);
});

test('resolveCategoriaId: compara id string/number (PostgREST pode devolver string)', async () => {
  assert.equal(await resolveCategoriaId('10', insumos), 10);
  assert.equal(await resolveCategoriaId(11, [{ id: '11' }]), 11);
});

test('categoriaFilhoDefault: formulário filho NUNCA herda a categoria do produto/preparo pai', () => {
  // Categoria do pai é de outra tabela (categorias_produtos / categorias_preparos).
  assert.equal(categoriaFilhoDefault('materia_prima', { mode: 'produto', categoriaId: 280 }), null);
  assert.equal(categoriaFilhoDefault('embalagem', { mode: 'produto', categoriaId: 280 }), null);
  assert.equal(categoriaFilhoDefault('preparo', { mode: 'produto', categoriaId: 280 }), null);
  assert.equal(categoriaFilhoDefault('materia_prima', { mode: 'preparo', categoriaId: 5 }), null);
  assert.equal(categoriaFilhoDefault('preparo', { mode: 'preparo', categoriaId: 5 }), 5);
});
