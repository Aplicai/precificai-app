/**
 * passwordPolicy.js — Sessão 28.68 (L-3)
 *
 * Política única de senha. Usada por RegisterScreen e ResetPasswordScreen
 * para garantir que ambos exijam o MESMO nível mínimo de complexidade.
 *
 * Regras (alinhadas com o checklist visual mostrado no RegisterScreen):
 *  - Mínimo 8 caracteres
 *  - Pelo menos 1 letra MAIÚSCULA
 *  - Pelo menos 1 letra minúscula
 *  - Pelo menos 1 número
 *  - Pelo menos 1 símbolo (não alfanumérico)
 *
 * Exporta:
 *  - MIN_PASSWORD_LENGTH (constante)
 *  - validatePassword(pw) → { ok, error } com mensagem PT-BR consistente
 */

export const MIN_PASSWORD_LENGTH = 8;

/**
 * Valida senha contra a política única.
 * @param {string} password
 * @returns {{ ok: boolean, error: string }}
 */
export function validatePassword(password) {
  const pw = typeof password === 'string' ? password : '';
  if (pw.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, error: `A senha precisa de pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` };
  }
  if (!/[A-Z]/.test(pw)) {
    return { ok: false, error: 'A senha precisa ter pelo menos 1 letra MAIÚSCULA.' };
  }
  if (!/[a-z]/.test(pw)) {
    return { ok: false, error: 'A senha precisa ter pelo menos 1 letra minúscula.' };
  }
  if (!/[0-9]/.test(pw)) {
    return { ok: false, error: 'A senha precisa ter pelo menos 1 número.' };
  }
  if (!/[^A-Za-z0-9]/.test(pw)) {
    return { ok: false, error: 'A senha precisa ter pelo menos 1 símbolo (ex.: !@#$%&*).' };
  }
  return { ok: true, error: '' };
}

/**
 * Lista de critérios para renderização do checklist visual em tempo real.
 * Cada item retorna { ok, label } baseado na senha atual.
 * @param {string} password
 */
export function passwordCriteria(password) {
  const pw = typeof password === 'string' ? password : '';
  return [
    { ok: pw.length >= MIN_PASSWORD_LENGTH, label: `Mínimo ${MIN_PASSWORD_LENGTH} caracteres` },
    { ok: /[A-Z]/.test(pw), label: 'Pelo menos 1 letra maiúscula' },
    { ok: /[a-z]/.test(pw), label: 'Pelo menos 1 letra minúscula' },
    { ok: /[0-9]/.test(pw), label: 'Pelo menos 1 número' },
    { ok: /[^A-Za-z0-9]/.test(pw), label: 'Pelo menos 1 símbolo' },
  ];
}
