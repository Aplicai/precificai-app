import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { resolverPrecoAoSalvar, avisoPrecoAoSalvar } from '../src/utils/precoAoSalvar.js';

const brl = (v) => `R$ ${v.toFixed(2).replace('.', ',')}`;

test('preço digitado vale mesmo com sugerido diferente', () => {
  assert.deepEqual(resolverPrecoAoSalvar(25, 31.4), { preco: 25, origem: 'digitado' });
});

test('campo vazio usa o sugerido arredondado em centavos', () => {
  assert.deepEqual(resolverPrecoAoSalvar(0, 16.497), { preco: 16.5, origem: 'sugerido' });
  assert.deepEqual(resolverPrecoAoSalvar(NaN, 9.9), { preco: 9.9, origem: 'sugerido' });
  assert.deepEqual(resolverPrecoAoSalvar(null, 9.9), { preco: 9.9, origem: 'sugerido' });
});

test('sem digitado nem sugerido salva sem preço, nunca bloqueia', () => {
  assert.deepEqual(resolverPrecoAoSalvar(0, 0), { preco: 0, origem: 'sem_preco' });
  assert.deepEqual(resolverPrecoAoSalvar(undefined, NaN), { preco: 0, origem: 'sem_preco' });
  assert.deepEqual(resolverPrecoAoSalvar(-5, -1), { preco: 0, origem: 'sem_preco' });
});

test('aviso só quando o preço não foi digitado', () => {
  assert.equal(avisoPrecoAoSalvar({ preco: 25, origem: 'digitado' }, brl), null);
  assert.match(avisoPrecoAoSalvar({ preco: 16.5, origem: 'sugerido' }, brl), /R\$ 16,50/);
  assert.match(avisoPrecoAoSalvar({ preco: 0, origem: 'sem_preco' }, brl), /sem preço/);
});

test('"0" digitado ou preço apagado na edição vale como escolha (sem trocar pelo sugerido)', () => {
  assert.deepEqual(resolverPrecoAoSalvar(0, 16.5, { texto: '0' }), { preco: 0, origem: 'zerado' });
  assert.deepEqual(resolverPrecoAoSalvar(0, 16.5, { texto: '0,00' }), { preco: 0, origem: 'zerado' });
  assert.deepEqual(resolverPrecoAoSalvar(NaN, 16.5, { texto: '', editando: true }), { preco: 0, origem: 'zerado' });
  // Criação com campo vazio continua usando o sugerido
  assert.deepEqual(resolverPrecoAoSalvar(NaN, 16.5, { texto: '', editando: false }), { preco: 16.5, origem: 'sugerido' });
  assert.equal(avisoPrecoAoSalvar({ preco: 0, origem: 'zerado' }, brl), null);
});
