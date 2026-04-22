/**
 * Maps raw Supabase / network errors into friendly, actionable Portuguese messages.
 * Critical: never expose technical strings like "Invalid API key" to end users —
 * those are infra problems, not user problems.
 *
 * Usage:
 *   try { await signIn(...); }
 *   catch (err) { setError(mapAuthError(err, { context: 'signIn' })); }
 */

/** Categories let UI optionally render different icons / actions per kind. */
export const AUTH_ERROR_KIND = Object.freeze({
  CREDENTIAL: 'credential',     // user typed wrong email/password
  UNCONFIRMED: 'unconfirmed',   // email not confirmed yet
  RATE_LIMIT: 'rate_limit',     // too many tries
  NETWORK: 'network',           // no internet, DNS, fetch failed
  SERVER: 'server',             // infra problem (invalid api key, 500, etc)
  VALIDATION: 'validation',     // weak password, invalid email, already registered
  UNKNOWN: 'unknown',
});

const FRIENDLY = {
  // === CREDENTIAL ===
  credential_signIn: 'Email ou senha incorretos. Esqueceu a senha?',
  credential_default: 'Credenciais inválidas.',

  // === UNCONFIRMED ===
  unconfirmed: 'Confirme seu email antes de entrar. Cheque sua caixa de entrada (e o spam).',

  // === RATE_LIMIT ===
  rate_limit: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.',

  // === NETWORK ===
  network: 'Sem conexão com o servidor. Verifique sua internet e tente de novo.',

  // === SERVER ===
  server: 'Não conseguimos conectar agora. Já avisamos nosso time. Tente em alguns minutos.',

  // === VALIDATION ===
  validation_email_invalid: 'Esse email não parece válido. Verifique e tente de novo.',
  validation_password_weak: 'Sua senha precisa ter pelo menos 6 caracteres.',
  validation_already_registered: 'Esse email já tem cadastro. Faça login ou recupere a senha.',
  validation_default: 'Verifique os dados informados.',

  // === UNKNOWN ===
  unknown: 'Algo deu errado. Tente de novo em alguns segundos.',
};

/**
 * @param {unknown} err  raw error from supabase-js or fetch
 * @param {{ context?: 'signIn' | 'signUp' | 'reset' }} [opts]
 * @returns {{ kind: string, message: string, raw: string }}
 */
export function classifyAuthError(err, opts = {}) {
  const { context = 'signIn' } = opts;
  const raw = (err?.message || err?.error_description || String(err) || '').trim();
  const lower = raw.toLowerCase();
  const status = err?.status ?? err?.statusCode;

  // --- SERVER infra problems (highest priority — never expose) ---
  // The "Invalid API key" / 401 from Supabase auth means the anon key
  // shipped to the client is bad. That's a build/deploy bug, not the user's fault.
  if (lower.includes('invalid api key') || lower.includes('no api key') || lower.includes('jwt')) {
    return { kind: AUTH_ERROR_KIND.SERVER, message: FRIENDLY.server, raw };
  }
  if (status >= 500 && status < 600) {
    return { kind: AUTH_ERROR_KIND.SERVER, message: FRIENDLY.server, raw };
  }

  // --- NETWORK ---
  if (
    lower.includes('failed to fetch') ||
    lower.includes('network request failed') ||
    lower.includes('networkerror') ||
    lower.includes('load failed') ||
    err?.name === 'TypeError' && lower.includes('fetch')
  ) {
    return { kind: AUTH_ERROR_KIND.NETWORK, message: FRIENDLY.network, raw };
  }

  // --- RATE LIMIT ---
  if (
    lower.includes('rate limit') ||
    lower.includes('too many requests') ||
    lower.includes('over_email_send_rate_limit') ||
    status === 429
  ) {
    return { kind: AUTH_ERROR_KIND.RATE_LIMIT, message: FRIENDLY.rate_limit, raw };
  }

  // --- UNCONFIRMED ---
  if (lower.includes('email not confirmed') || lower.includes('not confirmed') || lower.includes('email_not_confirmed')) {
    return { kind: AUTH_ERROR_KIND.UNCONFIRMED, message: FRIENDLY.unconfirmed, raw };
  }

  // --- VALIDATION ---
  if (lower.includes('user already registered') || lower.includes('already exists')) {
    return { kind: AUTH_ERROR_KIND.VALIDATION, message: FRIENDLY.validation_already_registered, raw };
  }
  if (lower.includes('password should be') || lower.includes('weak password') || lower.includes('password must')) {
    return { kind: AUTH_ERROR_KIND.VALIDATION, message: FRIENDLY.validation_password_weak, raw };
  }
  if (lower.includes('invalid email') || lower.includes('unable to validate email')) {
    return { kind: AUTH_ERROR_KIND.VALIDATION, message: FRIENDLY.validation_email_invalid, raw };
  }

  // --- CREDENTIAL ---
  if (
    lower.includes('invalid login') ||
    lower.includes('invalid credentials') ||
    lower.includes('invalid_grant') ||
    lower.includes('wrong password')
  ) {
    return {
      kind: AUTH_ERROR_KIND.CREDENTIAL,
      message: context === 'signIn' ? FRIENDLY.credential_signIn : FRIENDLY.credential_default,
      raw,
    };
  }

  // --- UNKNOWN — never echo raw to the user ---
  return { kind: AUTH_ERROR_KIND.UNKNOWN, message: FRIENDLY.unknown, raw };
}

/** Convenience: returns just the friendly string. */
export function mapAuthError(err, opts) {
  return classifyAuthError(err, opts).message;
}
