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

function comInstalar(href, marcarInstalar = true) {
  const u = new URL(href);
  if (marcarInstalar) u.searchParams.set(PARAM_INSTALAR, '1');
  return u;
}

/**
 * Link que abre `href` no Chrome do Android, mantendo caminho e parâmetros
 * do anúncio (utm, fbclid: o Meta continua atribuindo o cadastro) e marcando
 * ?instalar=1 para o Chrome mostrar o pedido de instalação. Sem Chrome, o
 * fallback abre a mesma página onde a pessoa está.
 *
 * `{ marcarInstalar: false }`: abre `href` como está. Usado com o link de
 * acesso de uso único (edge function `link-acesso`), que já leva o
 * ?instalar=1 no redirect_to e não pode ter a URL mexida.
 */
export function urlAbrirNoChrome(href, { marcarInstalar = true } = {}) {
  const u = comInstalar(href, marcarInstalar);
  const semEsquema = `${u.host}${u.pathname}${u.search}`;
  return `intent://${semEsquema}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(u.toString())};end`;
}

/** Link que tenta abrir `href` no Safari, marcando ?instalar=1 (ou não, como no Chrome). */
export function urlAbrirNoSafari(href, { marcarInstalar = true } = {}) {
  const u = comInstalar(href, marcarInstalar);
  return `x-safari-${u.protocol.replace(':', '')}://${u.host}${u.pathname}${u.search}`;
}

export function pedeInstalar(search) {
  try { return new URLSearchParams(search || '').get(PARAM_INSTALAR) === '1'; } catch { return false; }
}

/**
 * `href` com ?instalar=1. Usado dentro do Instagram/Facebook para a URL da
 * página já carregar o pedido: quem sai pelo menu "Abrir no navegador
 * externo" leva a URL atual (e a sessão não vai junto).
 */
export function comParametroInstalar(href) {
  return comInstalar(href).toString();
}

/** Fechou o aviso no ✕: ele volta depois de alguns dias (quem ainda não instalou). */
export const DIAS_LEMBRETE = 3;
const DIA_MS = 24 * 60 * 60 * 1000;

export function proximoLembrete(agora = Date.now()) {
  return agora + DIAS_LEMBRETE * DIA_MS;
}

/** `ate` = valor gravado no ✕ (texto do localStorage ou null). */
export function lembreteLiberado(ate, agora = Date.now()) {
  const n = Number(ate);
  return !ate || !Number.isFinite(n) || agora >= n;
}

export function semParametroInstalar(href) {
  const u = new URL(href);
  u.searchParams.delete(PARAM_INSTALAR);
  return u.toString();
}
