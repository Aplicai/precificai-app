// checkout.js — inicia o checkout de assinatura (Fase 1 — Asaas).
//
// Fluxo:
//   1. Chama a Edge Function `asaas-create-checkout` (que roda no servidor com a
//      chave secreta e identifica o usuário pelo JWT — o app NUNCA manda userId
//      nem toca na chave do Asaas).
//   2. Recebe a URL de checkout hospedada do Asaas.
//   3. Abre a URL no navegador (web: nova aba / nativo: navegador externo).
//   4. O cliente paga na página do Asaas; o webhook ativa o plano.
//
// Uso:
//   const r = await startCheckout('pro', 'mensal');
//   if (!r.ok) showError(r.error);

import { Platform, Linking } from 'react-native';
import { supabase } from '../config/supabase';
import { syncPlanFromServer, getSubscriptionInfo, getPlan } from '../hooks/usePlan';
import { showToast } from '../utils/toastBus';
import { aguardarAtivacao } from '../utils/aguardarAtivacao';
import { trackEvent } from '../utils/marketing';

// Só uma espera por vez: clicar em "Assinar" duas vezes não pode deixar dois
// laços consultando o servidor em paralelo. O número identifica a espera viva.
let _esperaAtual = 0;

/**
 * Fica consultando o plano depois que o checkout abriu e avisa quando ativar.
 * Não é aguardada por quem chama: roda em segundo plano na aba original.
 */
// Marca = plano + validade. Na primeira assinatura muda o plano; na renovação
// o plano continua 'pro' e o que muda é a validade.
export function marcaPlanoLocal(plano, expiresAt) {
  return `${plano || 'free'}|${expiresAt || ''}`;
}
async function lerMarcaPlano() {
  const plano = await syncPlanFromServer();
  return marcaPlanoLocal(plano, getSubscriptionInfo().expiresAt);
}
const marcaAtiva = (m) => typeof m === 'string' && !m.startsWith('free|');

/** Interrompe a espera em andamento (ex.: o usuário já confirmou pelo botão). */
export function cancelarObservacao() { _esperaAtual++; }

/**
 * Botão "Já paguei": consulta o servidor agora e diz se o plano mudou desde
 * que o checkout foi aberto. Não depende da aba do Asaas nem do redirecionamento.
 * @param {string} marcaAntes — devolvida por startCheckout
 * @returns {Promise<{ativou: boolean, erro?: string}>}
 */
export async function verificarAtivacao(marcaAntes) {
  try {
    const agora = await lerMarcaPlano();
    const ativou = marcaAtiva(agora) && agora !== marcaAntes;
    if (ativou) {
      cancelarObservacao();
      showToast({ message: 'Pagamento confirmado. Seu plano já está ativo.', icon: 'check-circle', durationMs: 6000 });
    }
    return { ativou };
  } catch {
    return { ativou: false, erro: 'Não conseguimos consultar agora. Verifique a conexão e tente de novo.' };
  }
}

async function observarAtivacao(marcaAntes) {
  const minha = ++_esperaAtual;
  const marca = lerMarcaPlano;
  let antes = marcaAntes;
  if (!antes) { antes = 'free|'; try { antes = await marca(); } catch {} }

  const r = await aguardarAtivacao({
    planoAntes: antes,
    consultar: marca,
    estaAtivo: marcaAtiva,
    cancelado: () => minha !== _esperaAtual,
  });
  if (r.ativou && minha === _esperaAtual) {
    showToast({
      message: 'Pagamento confirmado. Seu plano já está ativo.',
      icon: 'check-circle',
      durationMs: 6000,
    });
  }
}

/**
 * Inicia o checkout de um plano.
 * @param {'pro'|'ilimitado'} plano
 * @param {'mensal'|'anual'} ciclo
 * @returns {Promise<{ok: boolean, url?: string, aberto?: boolean, marcaAntes?: string, error?: string}>}
 *   `aberto=false` = o navegador bloqueou a nova aba (pop-up); quem chama deve
 *   oferecer um botão pra abrir a `url` num gesto do usuário.
 */
export async function startCheckout(plano, ciclo) {
  try {
    // Precisa estar logado (a function exige JWT). Confirma antes de chamar.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return { ok: false, error: 'Você precisa estar logado para assinar.' };
    }

    const { data, error } = await supabase.functions.invoke('asaas-create-checkout', {
      body: { plano, ciclo },
    });

    if (error) {
      // A function retorna {error} em status !=2xx; supabase-js joga em error.
      let msg = error.message || 'Não foi possível iniciar o checkout.';
      try {
        const ctx = error.context && (await error.context.json?.());
        if (ctx?.error) msg = ctx.error;
      } catch (_) {}
      return { ok: false, error: msg };
    }

    if (!data?.ok || !data?.url) {
      return { ok: false, error: data?.error || 'Resposta inválida do checkout.' };
    }

    // Estado do plano ANTES de abrir: é contra isso que "Já paguei" compara.
    const marcaAntes = marcaPlanoLocal(getPlan(), getSubscriptionInfo().expiresAt);

    // Abre o checkout hospedado. No web, bloqueador de pop-up devolve null em
    // silêncio — antes o modal fechava e a pessoa ficava sem o pagamento.
    const url = data.url;
    let aberto = true;
    if (Platform.OS === 'web') {
      aberto = abrirNovaAba(url);
    } else {
      await Linking.openURL(url);
    }

    trackEvent('InitiateCheckout', { content_name: `${plano}_${ciclo}`, currency: 'BRL' });

    // A tela de redirecionamento do Asaas é lenta; esta aba descobre sozinha.
    observarAtivacao(marcaAntes).catch(() => {});

    return { ok: true, url, aberto, marcaAntes };
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[startCheckout]', e);
    }
    return { ok: false, error: 'Erro ao iniciar o checkout. Tente novamente.' };
  }
}

/** Abre a URL numa aba nova; false quando o navegador bloqueou. */
export function abrirNovaAba(url) {
  if (typeof window === 'undefined') return false;
  try {
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    return !!win;
  } catch {
    return false;
  }
}

/**
 * Cancela a assinatura do usuário. As cobranças futuras param, mas o acesso
 * continua até o fim do período já pago (expires_at retornado).
 * @returns {Promise<{ok: boolean, expires_at?: string|null, plan?: string, error?: string}>}
 */
export async function cancelSubscription() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'Você precisa estar logado.' };

    const { data, error } = await supabase.functions.invoke('asaas-cancel-subscription', {
      body: {},
    });
    if (error) {
      let msg = error.message || 'Não foi possível cancelar agora.';
      try {
        const ctx = error.context && (await error.context.json?.());
        if (ctx?.error) msg = ctx.error;
      } catch (_) {}
      return { ok: false, error: msg };
    }
    if (!data?.ok) return { ok: false, error: data?.error || 'Não foi possível cancelar agora.' };
    return { ok: true, expires_at: data.expires_at, plan: data.plan };
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('[cancelSubscription]', e);
    return { ok: false, error: 'Erro ao cancelar. Tente novamente.' };
  }
}

export default startCheckout;
