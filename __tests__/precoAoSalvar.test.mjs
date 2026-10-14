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
