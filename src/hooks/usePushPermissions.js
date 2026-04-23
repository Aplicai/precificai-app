/**
 * usePushPermissions (M1-33)
 *
 * Hook que dispara o pedido de permissão de push em "earned moments"
 * (ex.: após 1ª venda registrada). Marca em AsyncStorage para não pedir
 * múltiplas vezes.
 *
 * Chave de storage é user-scoped (`push_perm_asked_${userId}`) — em
 * dispositivos multi-conta, cada usuário recebe seu próprio earned moment
 * (fix F3-J3-01). A chave global antiga (`push_perm_asked`) NÃO é migrada;
 * fica órfã e vira no-op natural — sem risco de bloquear novos usuários.
 *
 * Uso típico em VendaDetalheScreen logo após registrar a primeira venda:
 *   const { askIfNotAsked } = usePushPermissions();
 *   await askIfNotAsked('first_sale');
 */
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { requestAndRegisterPush, isPushSupported } from '../services/push';

const STORAGE_KEY_PREFIX = 'push_perm_asked_';

/**
 * Constrói a chave AsyncStorage por usuário.
 * Mantida pura para facilitar testes futuros.
 */
function buildStorageKey(userId) {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

export default function usePushPermissions() {
  const { user } = useAuth();

  const askIfNotAsked = useCallback(async (reasonKey) => {
    if (!isPushSupported()) return { skipped: true, reason: 'unsupported' };
    // Sem userId não escrevemos no fallback global (era o bug F3-J3-01).
    // Aborta limpo; o caller pode tentar de novo após login.
    if (!user?.id) return { skipped: true, reason: 'no_user' };

    const storageKey = buildStorageKey(user.id);
    try {
      const raw = await AsyncStorage.getItem(storageKey);
      const map = raw ? JSON.parse(raw) : {};
      if (map[reasonKey]) return { skipped: true, reason: 'already_asked' };
      const res = await requestAndRegisterPush(user.id);
      map[reasonKey] = { askedAt: Date.now(), granted: res.granted };
      await AsyncStorage.setItem(storageKey, JSON.stringify(map));
      return res;
    } catch (e) {
      if (typeof console !== 'undefined' && console.error) {
        console.error('[usePushPermissions.askIfNotAsked]', e);
      }
      return { skipped: true, reason: 'error' };
    }
  }, [user?.id]);

  return { askIfNotAsked };
}
