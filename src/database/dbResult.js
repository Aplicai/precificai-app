/**
 * Marcação de "resultado vindo de ERRO" do wrapper SQL → PostgREST.
 *
 * O wrapper (supabaseDb.js) nunca lança numa leitura que falha: devolve `[]`
 * ou `null` pra não derrubar a tela. O problema é que `[]` também é a resposta
 * legítima de "não há linhas" — e várias telas decidiam coisas grandes em cima
 * disso: Home de conta nova ("Cadastre seus primeiros produtos"), lista de
 * produtos vazia, banner "Configuração financeira pendente" e até a rota de
 * boot indo pro assistente de configuração. Bastava a sessão oscilar (erro
 * "Lock broken…", rede caindo) pra um cliente com 30 produtos ver o app zerado.
 *
 * Este módulo é puro (sem Supabase) pra ser testável e importável de qualquer
 * lugar. O wrapper marca; as telas usam `rowsOrThrow`/`countOrThrow` pra
 * transformar a marca em exceção e cair no próprio tratamento de erro
 * (banner vermelho com "Tentar de novo"), em vez de no estado vazio.
 */

// Sentinel: marks a result that came from a SWALLOWED Supabase error (not a
// legitimate empty result). `getAllAsync` checks for it to SKIP caching, so a
// transient error window (session refresh / RLS / network) doesn't poison the
// cache and zero-out every screen that reads the same tables.
// BLAST RADIUS: this property is non-enumerable. Consumers iterate the array
// via .map/.forEach/index — they never see it. Legitimate empty results never
// carry it, so they keep being cached normally.
export const ERROR_RESULT = Symbol('supabaseDbErrorResult');
export const ERROR_INFO = Symbol('supabaseDbErrorInfo');

export const MSG_LEITURA = 'Não foi possível carregar seus dados. Verifique a conexão e tente de novo.';

export class DbReadError extends Error {
  constructor(message = MSG_LEITURA, info = null) {
    super(message);
    this.name = 'DbReadError';
    this.isDbReadError = true;
    this.info = info;
  }
}

// Tag a fallback ([] or null) as coming from an error path. `info` (opcional) =
// string segura do erro real, recuperável depois via getErrorInfo.
export function markErrorResult(result, info) {
  if (result == null) {
    // null can't carry a property; return a boxed sentinel object that
    // getFirstAsync/getAllAsync treat as "error, value is null".
    return { [ERROR_RESULT]: true, value: null, [ERROR_INFO]: info || null };
  }
  try {
    Object.defineProperty(result, ERROR_RESULT, {
      value: true, enumerable: false, configurable: true, writable: true,
    });
    if (info) Object.defineProperty(result, ERROR_INFO, {
      value: info, enumerable: false, configurable: true, writable: true,
    });
  } catch {
    // Frozen/sealed objects: fall back to wrapper so we still skip cache.
    return { [ERROR_RESULT]: true, value: result, [ERROR_INFO]: info || null };
  }
  return result;
}

export function isErrorResult(result) {
  return !!(result && typeof result === 'object' && result[ERROR_RESULT]);
}

// Recupera a info de erro segura (string) anexada por markErrorResult, se houver.
export function getErrorInfo(result) {
  return (result && typeof result === 'object' && result[ERROR_INFO]) || null;
}

// Unwrap a possibly-boxed error result back to its plain value for consumers.
export function unwrapErrorResult(result) {
  if (result && typeof result === 'object' && ERROR_RESULT in result && 'value' in result) {
    return result.value;
  }
  return result;
}

/**
 * Linhas de um `getAllAsync`: lança `DbReadError` se vieram de um erro,
 * devolve a lista (nunca null) se não. Uso: `const rows = rowsOrThrow(await db.getAllAsync(sql))`.
 */
export function rowsOrThrow(rows) {
  if (isErrorResult(rows)) throw new DbReadError(MSG_LEITURA, getErrorInfo(rows));
  return rows || [];
}

/**
 * `SELECT COUNT(*) as n …` via `getFirstAsync`. O wrapper devolve `null` quando a
 * leitura falha — e um COUNT sempre tem uma linha, então null = erro, não zero.
 * Antes: `r?.n || 0` transformava falha em "0 cadastrados".
 */
export async function countOrThrow(db, sql, params = []) {
  const r = await db.getFirstAsync(sql, params);
  if (r == null || isErrorResult(r)) throw new DbReadError();
  const n = Number(r.n);
  return Number.isFinite(n) ? n : 0;
}
