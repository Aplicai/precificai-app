/**
 * errorReporter — wrapper sobre @sentry/react-native (P0-01).
 *
 * Centraliza a captura de erros para que call-sites usem uma API estável
 * desacoplada do provider concreto. Se EXPO_PUBLIC_SENTRY_DSN não estiver
 * setado, todas as funções viram no-op (mas continuam logando em DEV).
 *
 * API pública:
 *   initErrorReporter()                 — chamar 1× em App.js
 *   captureException(err, ctx)          — erro com tags
 *   addBreadcrumb({category,message,…}) — contexto histórico
 *   setUser(user)                       — associa user.id (sem PII)
 *   wrap(Component)                     — HOC para boundary global
 */

import * as Sentry from '@sentry/react-native';

const isDev = typeof __DEV__ !== 'undefined' ? __DEV__ : process.env.NODE_ENV !== 'production';

let initialized = false;
let enabled = false;

const SENSITIVE_KEYS = [
  'password',
  'token',
  'authorization',
  'apikey',
  'api_key',
  'secret',
  'access_token',
  'refresh_token',
];

/**
 * Sanitiza objeto recursivamente, redatando chaves sensíveis.
 */
function sanitize(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = Array.isArray(obj) ? [] : {};
  for (const k of Object.keys(obj)) {
    const lower = k.toLowerCase();
    if (SENSITIVE_KEYS.some(s => lower.includes(s))) {
      out[k] = '[REDACTED]';
    } else if (obj[k] && typeof obj[k] === 'object') {
      out[k] = sanitize(obj[k]);
    } else {
      out[k] = obj[k];
    }
  }
  return out;
}

// Sessão 28.68 — security hardening (H-2):
// Chaves de domínio (financeiro / PII) que NÃO devem vazar em breadcrumbs.
// Mantido separado de SENSITIVE_KEYS (que cobre auth/tokens) porque a
// função sanitize() casa por substring — colocar "nome" lá redactaria
// nomes de campo neutros como "nome_categoria".
const BREADCRUMB_REDACT_KEYS = [
  'email',
  'nome_negocio',
  'cpf',
  'cnpj',
  'telefone',
  'whatsapp',
  'valor_pago',
  'preco_venda',
  'preco_por_kg',
  'arguments',
];

// Regex pré-compilada — aplicada a strings de breadcrumb.message
// (logs do console integration costumam serializar payloads inteiros).
const BREADCRUMB_REDACT_RE_STR = new RegExp(
  `"(${BREADCRUMB_REDACT_KEYS.filter(k => k !== 'arguments').join('|')})":\\s*"[^"]*"`,
  'g'
);
const BREADCRUMB_REDACT_RE_NUM = new RegExp(
  `"(${BREADCRUMB_REDACT_KEYS.filter(k => k !== 'arguments').join('|')})":\\s*[\\d.]+`,
  'g'
);

function sanitizeBreadcrumb(bc) {
  if (!bc) return bc;
  try {
    const cleaned = { ...bc };
    if (cleaned.message && typeof cleaned.message === 'string') {
      cleaned.message = cleaned.message
        .replace(BREADCRUMB_REDACT_RE_STR, '"$1":"[REDACTED]"')
        .replace(BREADCRUMB_REDACT_RE_NUM, '"$1":[REDACTED]');
    }
    if (cleaned.data && typeof cleaned.data === 'object') {
      const safeData = Array.isArray(cleaned.data) ? [...cleaned.data] : { ...cleaned.data };
      BREADCRUMB_REDACT_KEYS.forEach((k) => {
        if (k in safeData) safeData[k] = '[REDACTED]';
      });
      cleaned.data = safeData;
    }
    return cleaned;
  } catch {
    return bc;
  }
}

/**
 * Filtra eventos antes de enviar — remove headers de auth e
 * outros campos sensíveis no payload do request, se existirem.
 *
 * Sessão 28.68 (H-2): também limpa breadcrumbs — o console integration
 * do Sentry serializa logs de erro do supabaseDb com tabela/payload
 * que vazariam dados financeiros e PII.
 */
function beforeSend(event) {
  try {
    if (event.request?.headers) {
      delete event.request.headers.authorization;
      delete event.request.headers.Authorization;
      delete event.request.headers.cookie;
    }
    if (event.extra) event.extra = sanitize(event.extra);
    if (event.contexts) event.contexts = sanitize(event.contexts);

    // Breadcrumbs podem estar no nível root do event OU dentro de event.breadcrumbs.values
    // (formato SDK do Sentry). Cobrimos ambos.
    if (Array.isArray(event.breadcrumbs)) {
      event.breadcrumbs = event.breadcrumbs.map(sanitizeBreadcrumb);
    }
    if (event.breadcrumbs && Array.isArray(event.breadcrumbs.values)) {
      event.breadcrumbs = {
        ...event.breadcrumbs,
        values: event.breadcrumbs.values.map(sanitizeBreadcrumb),
      };
    }
  } catch {}
  return event;
}

/**
 * Inicializa Sentry. No-op se DSN ausente (ex: dev sem .env, ou usuário
 * que ainda não configurou o projeto Sentry).
 */
export function initErrorReporter() {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log('[errorReporter] DSN ausente — Sentry desabilitado (no-op).');
    }
    return;
  }

  try {
    Sentry.init({
      dsn,
      environment: process.env.EXPO_PUBLIC_ENV || (isDev ? 'development' : 'production'),
      // Em produção, 10% de transações para não estourar quota; DEV captura tudo
      tracesSampleRate: isDev ? 1.0 : 0.1,
      // Não enviar eventos em desenvolvimento (evita poluir o projeto Sentry)
      enabled: !isDev,
      beforeSend,
      attachStacktrace: true,
    });
    enabled = true;
    if (isDev) {
      // eslint-disable-next-line no-console
      console.log('[errorReporter] Sentry init OK (eventos suprimidos em DEV).');
    }
  } catch (e) {
    // Nunca deixar Sentry derrubar o app
    // eslint-disable-next-line no-console
    console.warn('[errorReporter] Sentry init falhou:', e?.message);
  }
}

export function captureException(error, context = {}) {
  const safeContext = sanitize(context);
  if (isDev) {
    // eslint-disable-next-line no-console
    console.warn('[errorReporter]', error?.message || error, safeContext);
  }
  if (!enabled) return;
  try {
    Sentry.captureException(error, { tags: safeContext });
  } catch {}
}

export function addBreadcrumb(crumb) {
  const entry = {
    timestamp: Date.now() / 1000,
    category: crumb.category || 'app',
    message: crumb.message,
    level: crumb.level || 'info',
    data: sanitize(crumb.data),
  };
  if (!enabled) return;
  try {
    Sentry.addBreadcrumb(entry);
  } catch {}
}

/**
 * Associa o id opaco do usuário ao contexto. NUNCA enviar email/PII —
 * só o id opaco do Supabase. Passar null no logout.
 */
export function setUser(user) {
  if (!enabled) return;
  try {
    if (!user) {
      Sentry.setUser(null);
      return;
    }
    Sentry.setUser({ id: user.id });
  } catch {}
}

/**
 * HOC para boundary global. Use:
 *   export default wrap(App);
 */
export function wrap(Component) {
  try {
    return Sentry.wrap(Component);
  } catch {
    return Component;
  }
}
