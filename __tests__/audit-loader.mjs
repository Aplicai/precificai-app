/**
 * AUDIT helper — loader ESM para importar os módulos REAIS de `src/` no Node.
 *
 * Problemas que resolve:
 *  1. imports sem extensão (`'./precificacao'`) → adiciona `.js`
 *  2. `src/database/database.js` importa supabase/expo → substitui por stub
 *     (calculations.js só importa `getDatabase` e nunca usa)
 *
 * Uso (dentro do test):
 *   import { register } from 'node:module';
 *   register('./audit-loader.mjs', import.meta.url);
 *   const calc = await import('../src/utils/calculations.js');
 */
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const STUB_DB = 'data:text/javascript,export async function getDatabase(){ throw new Error("stub getDatabase"); }';

export async function resolve(specifier, context, nextResolve) {
  if (/database\/database(\.js)?$/.test(specifier) || /database\/supabaseDb(\.js)?$/.test(specifier) || /config\/supabase(\.js)?$/.test(specifier)) {
    return { url: STUB_DB, shortCircuit: true };
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../')) && !/\.(m?js|json|cjs)$/.test(specifier) && context.parentURL) {
    const base = fileURLToPath(new URL(specifier, context.parentURL));
    if (existsSync(base + '.js')) {
      return { url: pathToFileURL(base + '.js').href, shortCircuit: true, format: 'module' };
    }
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.startsWith('file://') && url.includes('/src/') && url.endsWith('.js')) {
    const r = await nextLoad(url, { ...context, format: 'module' });
    return { ...r, format: 'module' };
  }
  return nextLoad(url, context);
}
