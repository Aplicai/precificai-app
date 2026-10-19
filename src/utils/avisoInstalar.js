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
 *   - logado e chegou pelo botão "Abrir no Chrome/Safari" (?instalar=1,
 *     `pediu`): pode aparecer. Caso do link de acesso da tela do primeiro
 *     preço (19/10/2026): a pessoa já entra logada no Chrome, onde o aparelho
 *     ainda não tem a liberação gravada.
 */
export const CHAVE_AVISO_INSTALAR_LIBERADO = 'pcf_instalar_liberado';

/** Regra pura (testada em __tests__/avisoInstalar.test.mjs). */
export function avisoInstalarPermitido({ logado, liberado, pediu = false }) {
  return !logado || !!liberado || !!pediu;
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

// Telas com o próprio cartão de instalar (tabela de preços) escondem o aviso
// do topo, que cobriria o título e repetiria o pedido.
let _ocultosNoTopo = 0;
const ouvintesTopo = new Set();

export function avisoTopoOculto() {
  return _ocultosNoTopo > 0;
}

export function ocultarAvisoTopo() {
  _ocultosNoTopo += 1;
  ouvintesTopo.forEach((fn) => { try { fn(true); } catch (_) {} });
  return () => {
    _ocultosNoTopo = Math.max(0, _ocultosNoTopo - 1);
    ouvintesTopo.forEach((fn) => { try { fn(_ocultosNoTopo > 0); } catch (_) {} });
  };
}

export function assinarAvisoTopo(fn) {
  ouvintesTopo.add(fn);
  return () => { ouvintesTopo.delete(fn); };
}
