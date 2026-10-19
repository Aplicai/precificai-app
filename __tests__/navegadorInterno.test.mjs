/**
 * Testes — src/utils/navegadorInterno.js ("Instale o app" no Android, 16/10/2026).
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/navegadorInterno.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ehNavegadorInterno, deveOferecerChrome, deveOferecerSafari, ehIPhone, urlAbrirNoSafari, urlAbrirNoChrome, comParametroInstalar, lembreteLiberado, proximoLembrete, DIAS_LEMBRETE, pedeInstalar, semParametroInstalar } from '../src/utils/navegadorInterno.js';

const IG_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135M Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0.6668.81 Mobile Safari/537.36 Instagram 349.0.0.42.115 Android';
const FB_ANDROID = 'Mozilla/5.0 (Linux; Android 12; moto g22; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/129.0 Mobile Safari/537.36 [FB_IAB/FB4A;FBAV/483.0.0.48.86;]';
const IG_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 349.0.0.42.115 (iPhone14,7; iOS 17_6)';
const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 13; SM-A135M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

test('reconhece o navegador do Instagram e do Facebook', () => {
  assert.equal(ehNavegadorInterno(IG_ANDROID), true);
  assert.equal(ehNavegadorInterno(FB_ANDROID), true);
  assert.equal(ehNavegadorInterno(IG_IPHONE), true);
  assert.equal(ehNavegadorInterno(CHROME_ANDROID), false);
  assert.equal(ehNavegadorInterno(''), false);
});

test('oferece abrir no Chrome só no Android dentro do Instagram/Facebook', () => {
  assert.equal(deveOferecerChrome(IG_ANDROID), true);
  assert.equal(deveOferecerChrome(FB_ANDROID), true);
  assert.equal(deveOferecerChrome(IG_IPHONE), false);
  assert.equal(deveOferecerChrome(CHROME_ANDROID), false);
});

test('link do Chrome mantém caminho e parâmetros do anúncio e pede a instalação', () => {
  const href = 'https://app.precificaiapp.com/register?utm_source=meta&fbclid=AbC123';
  const url = urlAbrirNoChrome(href);
  assert.ok(url.startsWith('intent://app.precificaiapp.com/register?utm_source=meta&fbclid=AbC123&instalar=1#Intent;'));
  assert.ok(url.includes(';scheme=https;'));
  assert.ok(url.includes(';package=com.android.chrome;'));
  assert.ok(url.includes(';S.browser_fallback_url=' + encodeURIComponent('https://app.precificaiapp.com/register?utm_source=meta&fbclid=AbC123&instalar=1') + ';'));
  assert.ok(url.endsWith(';end'));
  assert.ok(urlAbrirNoChrome('https://app.precificaiapp.com/').startsWith('intent://app.precificaiapp.com/?instalar=1#Intent;'));
  // Não duplica o parâmetro
  assert.equal((urlAbrirNoChrome('https://app.precificaiapp.com/?instalar=1').split('#')[0].match(/instalar=1/g) || []).length, 1);
});

test('lê e remove o pedido de instalação da URL', () => {
  assert.equal(pedeInstalar('?instalar=1'), true);
  assert.equal(pedeInstalar('?utm_source=meta&instalar=1'), true);
  assert.equal(pedeInstalar('?utm_source=meta'), false);
  assert.equal(pedeInstalar(''), false);
  assert.equal(semParametroInstalar('https://app.precificaiapp.com/register?utm_source=meta&instalar=1'), 'https://app.precificaiapp.com/register?utm_source=meta');
  assert.equal(semParametroInstalar('https://app.precificaiapp.com/?instalar=1'), 'https://app.precificaiapp.com/');
  assert.equal(comParametroInstalar('https://app.precificaiapp.com/register?utm_source=meta'), 'https://app.precificaiapp.com/register?utm_source=meta&instalar=1');
  assert.equal(comParametroInstalar('https://app.precificaiapp.com/?instalar=1'), 'https://app.precificaiapp.com/?instalar=1');
});

test('no iPhone, dentro do Instagram/Facebook, oferece abrir no Safari', () => {
  const FB_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/483.0.0.48.86;]';
  const SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
  assert.equal(deveOferecerSafari(IG_IPHONE), true);
  assert.equal(deveOferecerSafari(FB_IPHONE), true);
  assert.equal(deveOferecerSafari(SAFARI), false);
  assert.equal(deveOferecerSafari(IG_ANDROID), false);
  assert.equal(ehIPhone(SAFARI), true);
  assert.equal(ehIPhone(CHROME_ANDROID), false);
  assert.equal(
    urlAbrirNoSafari('https://app.precificaiapp.com/register?utm_source=meta&fbclid=AbC123'),
    'x-safari-https://app.precificaiapp.com/register?utm_source=meta&fbclid=AbC123&instalar=1'
  );
});

test('aviso fechado volta depois de alguns dias', () => {
  const agora = 1_800_000_000_000;
  assert.equal(DIAS_LEMBRETE, 3);
  assert.equal(lembreteLiberado(null, agora), true);
  assert.equal(lembreteLiberado('lixo', agora), true);
  const ate = proximoLembrete(agora);
  assert.equal(lembreteLiberado(String(ate), agora + 1000), false);
  assert.equal(lembreteLiberado(String(ate), agora + 3 * 24 * 3600 * 1000), true);
});

test('link de acesso (uso único): abre como está, sem mexer na URL', () => {
  const link = 'https://lwznqpxzmqptrpbifvka.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https%3A%2F%2Fapp.precificaiapp.com%2F%3Finstalar%3D1';
  const chrome = urlAbrirNoChrome(link, { marcarInstalar: false });
  assert.ok(chrome.startsWith('intent://lwznqpxzmqptrpbifvka.supabase.co/auth/v1/verify?token=abc123&type=magiclink&redirect_to=https%3A%2F%2Fapp.precificaiapp.com%2F%3Finstalar%3D1#Intent;'));
  assert.ok(chrome.includes(';package=com.android.chrome;'));
  assert.ok(chrome.includes(';S.browser_fallback_url=' + encodeURIComponent(link) + ';'));
  assert.equal(urlAbrirNoSafari(link, { marcarInstalar: false }), 'x-safari-' + link);
  // Sem a opção, continua marcando ?instalar=1 (aviso do topo, tabela de preços)
  assert.ok(urlAbrirNoChrome('https://app.precificaiapp.com/').includes('instalar=1'));
  assert.equal(urlAbrirNoSafari('https://app.precificaiapp.com/'), 'x-safari-https://app.precificaiapp.com/?instalar=1');
});
