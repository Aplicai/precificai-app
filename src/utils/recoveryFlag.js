/**
 * recoveryFlag — "o usuário chegou por um link de redefinir senha?"
 *
 * Por que não dá pra confiar só no evento PASSWORD_RECOVERY:
 * o auth-js detecta a sessão na URL dentro de `_initialize()`, que roda quando
 * o client é criado — antes do React montar. Ele SALVA a sessão e só depois,
 * dentro de um `setTimeout`, emite PASSWORD_RECOVERY (GoTrueClient:299-302).
 * Se o AuthContext ainda não assinou `onAuthStateChange` nesse macrotask, o
 * evento não tem ouvinte e se perde — mas a sessão já está valendo. O usuário
 * cai logado no app e nunca vê o formulário de nova senha.
 *
 * A corrida perde exatamente no pior caso: aba nova aberta do e-mail, bundle
 * frio, React demorando mais de um macrotask pra montar.
 *
 * Solução: ler a intenção direto da URL, de forma síncrona, ANTES de criar o
 * client (que apaga o hash), e guardar num sessionStorage que sobrevive ao
 * hash sumir e a um reload.
 */

export const RECOVERY_STORAGE_KEY = 'precificai_pwd_recovery';

/**
 * @param {string} href URL completa (window.location.href)
 * @returns {boolean} true se for um retorno de link de recuperação de senha.
 *
 * O Supabase manda `type=recovery` no fragmento no fluxo implicit. Quando o
 * link já foi usado ou expirou vem `error_code` no lugar — isso também conta
 * como intenção de recuperar, senão o usuário cai no app sem explicação em vez
 * de ver "link inválido ou expirado".
 */
export function parseRecoveryFromUrl(href) {
  if (typeof href !== 'string' || !href) return false;

  const hashAt = href.indexOf('#');
  const hash = hashAt >= 0 ? href.slice(hashAt + 1) : '';
  const queryAt = href.indexOf('?');
  const query = queryAt >= 0
    ? href.slice(queryAt + 1, hashAt >= 0 && hashAt > queryAt ? hashAt : undefined)
    : '';

  for (const part of [hash, query]) {
    if (!part) continue;
    const p = new URLSearchParams(part);
    if (p.get('type') === 'recovery') return true;
    // Link gasto/expirado: o GoTrue devolve o erro no mesmo fragmento.
    if (p.get('error_code') && /recovery|otp_expired/i.test(part)) return true;
  }

  // Caminho explícito do app, usado como última pista quando o fragmento
  // já foi consumido por um reload.
  return false;
}

/**
 * Lê a URL UMA vez e memoriza a intenção. Chamar o mais cedo possível — antes
 * de criar o client do Supabase, que apaga o fragmento ao processá-lo.
 * Guarda em sessionStorage pra sobreviver ao hash sumir e a um reload.
 */
let _intent = false;

export function captureRecoveryIntent(win) {
  try {
    if (!win || !win.location) return false;
    if (parseRecoveryFromUrl(String(win.location.href))) {
      _intent = true;
      try { win.sessionStorage?.setItem(RECOVERY_STORAGE_KEY, '1'); } catch {}
    }
  } catch {}
  return _intent;
}

/** Houve intenção de recuperar senha nesta aba? */
export function isRecoveryIntent(win) {
  if (_intent) return true;
  try {
    const w = win || (typeof window !== 'undefined' ? window : null);
    return w?.sessionStorage?.getItem(RECOVERY_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Chamado quando o fluxo termina (senha trocada ou usuário desistiu). */
export function clearRecoveryIntent(win) {
  _intent = false;
  try {
    const w = win || (typeof window !== 'undefined' ? window : null);
    w?.sessionStorage?.removeItem(RECOVERY_STORAGE_KEY);
  } catch {}
}
