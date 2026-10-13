/**
 * assinaturaRetorno — retorno do checkout do Asaas.
 *
 * A Edge Function manda o cliente de volta pra
 * `https://app.precificaiapp.com/?assinatura=ok` depois do pagamento
 * (callback.successUrl). Até 13/10/2026 NADA no app lia esse parâmetro: a
 * pessoa pagava, via a tela de sucesso do Asaas, esperava o redirecionamento e
 * caía numa Home muda — sem confirmação nenhuma de que o plano tinha mudado.
 *
 * Funções puras pra dar pra testar sem navegador.
 */

export const PARAM_ASSINATURA = 'assinatura';

/**
 * @param {string} href URL completa (window.location.href)
 * @returns {'ok'|null} 'ok' quando é um retorno de pagamento bem-sucedido.
 */
export function parseAssinaturaRetorno(href) {
  if (typeof href !== 'string' || !href) return null;
  const q = href.indexOf('?');
  if (q < 0) return null;
  const hash = href.indexOf('#');
  const query = href.slice(q + 1, hash > q ? hash : undefined);
  try {
    return new URLSearchParams(query).get(PARAM_ASSINATURA) === 'ok' ? 'ok' : null;
  } catch {
    return null;
  }
}

/**
 * Devolve a mesma URL sem o `assinatura`, preservando os outros parâmetros e o
 * fragmento. Serve pra limpar a barra de endereço depois de avisar — senão um
 * F5 repete a confirmação de um pagamento que já foi.
 *
 * @returns {string|null} null quando não havia nada pra limpar.
 */
export function hrefSemParametroAssinatura(href) {
  if (typeof href !== 'string' || !href) return null;
  const q = href.indexOf('?');
  if (q < 0) return null;

  const hashAt = href.indexOf('#');
  const temHashDepois = hashAt > q;
  const base = href.slice(0, q);
  const query = href.slice(q + 1, temHashDepois ? hashAt : undefined);
  const hash = temHashDepois ? href.slice(hashAt) : '';

  let params;
  try {
    params = new URLSearchParams(query);
  } catch {
    return null;
  }
  if (!params.has(PARAM_ASSINATURA)) return null;
  params.delete(PARAM_ASSINATURA);

  const resto = params.toString();
  return base + (resto ? `?${resto}` : '') + hash;
}
