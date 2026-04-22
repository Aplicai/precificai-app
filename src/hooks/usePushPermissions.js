/**
 * usePushPermissions (M1-33)
 *
 * Hook que dispara o pedido de permissão de push em "earned moments"
 * (ex.: após 1ª venda registrada). Marca em AsyncStorage para não pedir
 * múltiplas vezes.
 *
 * Uso típico em VendaDetalheScreen logo após registrar a primeira venda:
 *   const { askIfNotAsked } = usePushPermissions();
 *   await askIfNotAsked('first_sale');
 */
import { useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from '../contexts/AuthContext';
import { requestAndRegisterPush, isPushSupported } from '../services/push';

const STORAGE_KEY = 'push_perm_asked';

export default function usePushPermissions() {
  const { user } = useAuth();

  const askIfNotAsked = useCallback(async (reasonKey) => {
    if (!isPushSupported()) return { skipped: true, reason: 'unsupported' };
    if (!user?.id) return { skipped: true, reason: 'no_user' };
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const map = raw ? JSON.parse(raw) : {};
      if (map[reasonKey]) return { skipped: true, reason: 'already_asked' };
      const res = await requestAndRegisterPush(user.id);
      map[reasonKey] = { askedAt: Date.now(), granted: res.granted };
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
      return res;
    } catch (e) {
      return { skipped: true, reason: 'error', error: e?.message };
    }
  }, [user?.id]);

  return { askIfNotAsked };
}
