/**
 * ESM loader hooks para `npm test` (node --test).
 *
 * Problema: alguns módulos de `src/` usam imports sem extensão
 * (ex.: `deliveryPricing.js` → `import ... from './precificacao'`), que o
 * bundler do Expo/Metro resolve mas o Node ESM não. Este hook adiciona `.js`
 * quando o arquivo existe, sem tocar em `src/`.
 *
 * Auto-registro: o arquivo é passado via `node --import ./__tests__/loader.mjs`
 * e registra a si mesmo como hooks module (guard `isMainThread` evita
 * re-registro dentro da thread de hooks).
 */
import { existsSync } from 'node:fs';
import { register } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMainThread } from 'node:worker_threads';

if (isMainThread) {
  register(import.meta.url);
}

// `calculations.js` importa `getDatabase` (expo/supabase) sem usar em Node;
// stub evita carregar o runtime do Expo nos testes unitários.
const STUB_DB = 'data:text/javascript,export async function getDatabase(){ throw new Error("stub getDatabase"); }';

export async function resolve(specifier, context, nextResolve) {
  if (
    /database\/database(\.js)?$/.test(specifier) ||
    /database\/supabaseDb(\.js)?$/.test(specifier) ||
    /config\/supabase(\.js)?$/.test(specifier)
  ) {
    return { url: STUB_DB, shortCircuit: true };
  }
  if (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !/\.(m?js|cjs|json)$/.test(specifier) &&
    context.parentURL
  ) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    if (existsSync(base + '.js')) {
      return { url: pathToFileURL(base + '.js').href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
