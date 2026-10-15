/**
 * Endereço do Google (Gmail)? Usado no cadastro para sugerir "Continuar com
 * Google": a conta fica pronta na hora, sem o e-mail de confirmação.
 *
 * Dado de 14–15/10/2026: dos 9 cadastros por e-mail e senha que nunca
 * confirmaram, 8 eram @gmail.com. Pelo Google, 10 de 10 entraram.
 */
const DOMINIOS_GOOGLE = new Set(['gmail.com', 'googlemail.com']);

export function ehContaGoogle(email) {
  const m = /^[^\s@]+@([^\s@]+)$/.exec(String(email ?? '').trim().toLowerCase());
  return !!m && DOMINIOS_GOOGLE.has(m[1]);
}
