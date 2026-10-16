/**
 * "Instale o app" para quem chega pelo anúncio no Android (16/10/2026).
 *
 * 27 de 37 cadastros desde os anúncios foram feitos DENTRO do navegador do
 * Instagram/Facebook. Ali não dá para instalar (adicionar à tela inicial) e,
 * ao fechar o Instagram, o app some; só 1 de 33 voltou. No Android, um link
 * intent:// abre a mesma página no Chrome com um toque; lá o próprio Chrome
 * oferece a instalação. No iPhone não há instalação com um toque: o link
 * x-safari-https:// tenta abrir a página no Safari (funciona em parte dos
 * iPhones) e a tela ensina o caminho pelo menu.
 *
 * Puro, sem React/RN (testado em __tests__/navegadorInterno.test.mjs).
 */
export const PARAM_INSTALAR = 'instalar';

export function ehNavegadorInterno(ua) {
  return /FBAN|FBAV|FB_IAB|FB4A|FBIOS|Instagram/i.test(String(ua || ''));
}

export function deveOferecerChrome(ua) {
  return ehNavegadorInterno(ua) && /Android/i.test(String(ua || ''));
}

export function ehIPhone(ua) {
  return /iPhone|iPad|iPod/i.test(String(ua || ''));
}

export function deveOferecerSafari(ua) {
  return ehNavegadorInterno(ua) && ehIPhone(ua);
}

function comInstalar(href) {
  const u = new URL(href);
  u.searchParams.set(PARAM_INSTALAR, '1');
  return u;
}

/**
 * Link que abre `href` no Chrome do Android, mantendo caminho e parâmetros
 * do anúncio (utm, fbclid: o Meta continua atribuindo o cadastro) e marcando
 * ?instalar=1 para o Chrome mostrar o pedido de instalação. Sem Chrome, o
 * fallback abre a mesma página onde a pessoa está.
 */
export function urlAbrirNoChrome(href) {
  const u = comInstalar(href);
  const semEsquema = `${u.host}${u.pathname}${u.search}`;
  return `intent://${semEsquema}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
}

/** Link que tenta abrir `href` no Safari, marcando ?instalar=1. */
export function urlAbrirNoSafari(href) {
  const u = comInstalar(href);
  return `x-safari-${u.protocol.replace(':', '')}://${u.host}${u.pathname}${u.search}`;
}

export function pedeInstalar(search) {
  try { return new URLSearchParams(search || '').get(PARAM_INSTALAR) === '1'; } catch { return false; }
}

export function semParametroInstalar(href) {
  const u = new URL(href);
  u.searchParams.delete(PARAM_INSTALAR);
  return u.toString();
}
