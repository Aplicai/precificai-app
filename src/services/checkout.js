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
import { syncPlanFromServer } from '../hooks/usePlan';
import { showToast } from '../utils/toastBus';
import { aguardarAtivacao } from '../utils/aguardarAtivacao';

// Só uma espera por vez: clicar em "Assinar" duas vezes não pode deixar dois
// laços consultando o servidor em paralelo. O número identifica a espera viva.
let _esperaAtual = 0;

/**
 * Fica consultando o plano depois que o checkout abriu e avisa quando ativar.
 * Não é aguardada por quem chama: roda em segundo plano na aba original.
 */
async function observarAtivacao() {
  const minha = ++_esperaAtual;
  let planoAntes = 'free';
  try { planoAntes = await syncPlanFromServer(); } catch {}

  const r = await aguardarAtivacao({
    planoAntes,
    consultar: () => syncPlanFromServer(),
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
 * @returns {Promise<{ok: boolean, url?: string, error?: string}>}
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

    // Abre o checkout hospedado.
    const url = data.url;
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } else {
      await Linking.openURL(url);
    }

    // A tela de redirecionamento do Asaas é lenta; esta aba descobre sozinha.
    observarAtivacao().catch(() => {});

    return { ok: true, url };
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) {
      console.error('[startCheckout]', e);
    }
    return { ok: false, error: 'Erro ao iniciar o checkout. Tente novamente.' };
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

/**
 * Abre a fatura de renovação que o Asaas já gerou para a assinatura do usuário
 * (plano anual no Pix). Não cria cobrança nem assinatura nova — só localiza a
 * que está pendente.
 * @returns {Promise<{ok: boolean, url?: string, semFatura?: boolean, error?: string}>}
 */
export async function openRenewalInvoice() {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { ok: false, error: 'Você precisa estar logado.' };

    const { data, error } = await supabase.functions.invoke('asaas-renewal-link', { body: {} });
    if (error) {
      let msg = 'Não foi possível buscar a cobrança agora.';
      try {
        const ctx = error.context && (await error.context.json?.());
        if (ctx?.error) msg = ctx.error;
      } catch (_) {}
      return { ok: false, error: msg };
    }
    if (!data?.ok) return { ok: false, error: data?.error || 'Não foi possível buscar a cobrança agora.' };
    if (!data.url) return { ok: true, semFatura: true };

    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined') window.open(data.url, '_blank', 'noopener,noreferrer');
    } else {
      await Linking.openURL(data.url);
    }
    observarAtivacao().catch(() => {});
    return { ok: true, url: data.url };
  } catch (e) {
    if (typeof console !== 'undefined' && console.error) console.error('[openRenewalInvoice]', e);
    return { ok: false, error: 'Erro ao buscar a cobrança. Tente novamente.' };
  }
}

export default startCheckout;
