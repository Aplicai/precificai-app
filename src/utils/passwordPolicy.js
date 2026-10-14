/**
 * passwordPolicy.js — Sessão 28.68 (L-3)
 *
 * Política única de senha. Usada por RegisterScreen, ResetPasswordScreen e
 * ContaSegurancaScreen para garantir que todos exijam o MESMO mínimo.
 *
 * Regras (alinhadas com o checklist visual mostrado nas telas):
 *  - Mínimo 8 caracteres
 *  - Pelo menos 1 letra
 *  - Pelo menos 1 número
 *
 * Decisão do dono (2026-10): sem exigência de símbolo, sem maiúscula/minúscula
 * e sem barreira de "força" (zxcvbn). Tamanho + letra + número é o bastante;
 * o resto só frustrava o cadastro.
 *
 * Exporta:
 *  - MIN_PASSWORD_LENGTH (constante)
 *  - validatePassword(pw) → { ok, error } com mensagem PT-BR consistente
 *  - passwordCriteria(pw) → lista { ok, label } pro checklist em tempo real
 */

export const MIN_PASSWORD_LENGTH = 8;

// \p{L} cobre letras acentuadas (ç, ã, é…) — "senha" em PT-BR não é só ASCII.
const HAS_LETTER = /\p{L}/u;
const HAS_DIGIT = /[0-9]/;

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
  if (!HAS_LETTER.test(pw)) {
    return { ok: false, error: 'A senha precisa ter pelo menos 1 letra.' };
  }
  if (!HAS_DIGIT.test(pw)) {
    return { ok: false, error: 'A senha precisa ter pelo menos 1 número.' };
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
    { ok: HAS_LETTER.test(pw), label: 'Pelo menos 1 letra' },
    { ok: HAS_DIGIT.test(pw), label: 'Pelo menos 1 número' },
  ];
}
