// Detecta rate-limit retornado pelo Supabase Auth e extrai a janela de espera
// (em segundos) para exibirmos um countdown ao usuário.
//
// O Supabase costuma responder com:
//   - "For security purposes, you can only request this after X seconds"
//   - "Email rate limit exceeded"
//   - HTTP 429 (Too Many Requests)
//
// Quando há um número explícito, retornamos exatamente esse valor; caso
// contrário, caímos para um fallback conservador de 60s. Retorna `null`
// quando o erro NÃO é um rate-limit (caller deve tratar como erro genérico).

const FALLBACK_SECONDS = 60;
const SECONDS_RE = /after (\d+)\s*seconds?/i;
const RATE_LIMIT_RE = /(rate limit|too many requests|429)/i;

export function parseRateLimitSeconds(error) {
  if (!error) return null;

  const msg = String(error.message || error);

  const match = msg.match(SECONDS_RE);
  if (match) {
    const seconds = parseInt(match[1], 10);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_SECONDS;
  }

  if (RATE_LIMIT_RE.test(msg)) return FALLBACK_SECONDS;

  // Alguns SDKs colocam o status fora de `message` (ex.: error.status === 429).
  if (error.status === 429 || error.statusCode === 429) return FALLBACK_SECONDS;

  return null;
}

export default parseRateLimitSeconds;
