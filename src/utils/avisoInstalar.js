/**
 * Quando o aviso "Instale o app" pode aparecer (17/10/2026).
 *
 * Antes ele aparecia em todas as telas, inclusive no meio do primeiro acesso
 * (perfil, Preço rápido): cobria o topo da tela e, no navegador do Instagram,
 * o "Instalar" levava a pessoa ao Chrome, onde ela não está logada.
 * Regra agora:
 *   - sem conta logada (cadastro/login): pode aparecer;
 *   - logado: só depois do primeiro preço (Preço rápido salvo ou a Home vê
 *     um produto com preço). Fica gravado no aparelho.
 */
export const CHAVE_AVISO_INSTALAR_LIBERADO = 'pcf_instalar_liberado';

/** Regra pura (testada em __tests__/avisoInstalar.test.mjs). */
export function avisoInstalarPermitido({ logado, liberado }) {
  return !logado || !!liberado;
}

const ouvintes = new Set();

export function avisoInstalarLiberado() {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(CHAVE_AVISO_INSTALAR_LIBERADO) === '1'; } catch { return false; }
}

export function liberarAvisoInstalar() {
  if (avisoInstalarLiberado()) return;
  try { if (typeof window !== 'undefined') window.localStorage.setItem(CHAVE_AVISO_INSTALAR_LIBERADO, '1'); } catch { /* sem storage: só nesta sessão */ }
  ouvintes.forEach((fn) => { try { fn(true); } catch (_) {} });
}

export function assinarAvisoInstalar(fn) {
  ouvintes.add(fn);
  return () => { ouvintes.delete(fn); };
}
