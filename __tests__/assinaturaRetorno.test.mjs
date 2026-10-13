/**
 * Testes — src/utils/assinaturaRetorno.js
 *
 * Contexto (13/10/2026): o checkout do Asaas devolve o cliente para
 * `/?assinatura=ok`, e até então NADA no app lia esse parâmetro. Quem pagava
 * caía numa Home muda, sem confirmação. Aqui travamos a leitura e a limpeza.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/assinaturaRetorno.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseAssinaturaRetorno, hrefSemParametroAssinatura } from '../src/utils/assinaturaRetorno.js';

const APP = 'https://app.precificaiapp.com';

test('reconhece o retorno de pagamento', () => {
  assert.equal(parseAssinaturaRetorno(`${APP}/?assinatura=ok`), 'ok');
  assert.equal(parseAssinaturaRetorno(`${APP}/?a=1&assinatura=ok&b=2`), 'ok');
});

test('não confunde outros valores nem outras URLs', () => {
  assert.equal(parseAssinaturaRetorno(`${APP}/`), null);
  assert.equal(parseAssinaturaRetorno(`${APP}/?assinatura=cancelado`), null);
  assert.equal(parseAssinaturaRetorno(`${APP}/?assinaturas=ok`), null);
  assert.equal(parseAssinaturaRetorno(`${APP}/#assinatura=ok`), null); // fragmento não vale
});

test('entrada inválida não quebra', () => {
  for (const v of [undefined, null, '', 42, {}]) {
    assert.equal(parseAssinaturaRetorno(v), null);
    assert.equal(hrefSemParametroAssinatura(v), null);
  }
});

test('limpa o parâmetro preservando o resto da URL', () => {
  assert.equal(hrefSemParametroAssinatura(`${APP}/?assinatura=ok`), `${APP}/`);
  assert.equal(hrefSemParametroAssinatura(`${APP}/?a=1&assinatura=ok&b=2`), `${APP}/?a=1&b=2`);
  assert.equal(hrefSemParametroAssinatura(`${APP}/?assinatura=ok#secao`), `${APP}/#secao`);
  assert.equal(hrefSemParametroAssinatura(`${APP}/?a=1&assinatura=ok#x`), `${APP}/?a=1#x`);
});

test('sem o parâmetro não há o que limpar', () => {
  assert.equal(hrefSemParametroAssinatura(`${APP}/`), null);
  assert.equal(hrefSemParametroAssinatura(`${APP}/?a=1`), null);
});

test('depois de limpar, o retorno não é mais reconhecido (F5 não repete o aviso)', () => {
  const limpa = hrefSemParametroAssinatura(`${APP}/?assinatura=ok`);
  assert.equal(parseAssinaturaRetorno(limpa), null);
});
