/**
 * Serviço de Push Notifications (M1-33).
 *
 * Wrapper sobre `expo-notifications` (ainda não instalado — `npm i expo-notifications`).
 * Usamos `require` dinâmico dentro de try/catch para que o app não quebre
 * caso a dep ainda não esteja presente. As funções degradam silenciosamente.
 *
 * Após instalar `expo-notifications`:
 *   1. Adicione `expo-notifications` ao `app.config.js > plugins`
 *   2. Configure `EXPO_PROJECT_ID` em produção (extra.eas.projectId)
 *   3. Faça build com EAS para gerar entitlements de push
 *   4. Web push (PWA) NÃO é coberto aqui — fica para v2 via VAPID + service worker
 */
import { Platform } from 'react-native';
import { supabase } from '../config/supabase';

let Notifications = null;
let Constants = null;
try { Notifications = require('expo-notifications'); } catch {}
try { Constants = require('expo-constants').default; } catch {}

export function isPushSupported() {
  return Platform.OS !== 'web' && !!Notifications;
}

/**
 * Pede permissão e obtém o ExpoPushToken.
 * Deve ser chamado em momento "earned" (ex.: após 1ª venda registrada),
 * NUNCA no boot — para não queimar o usuário.
 */
export async function requestAndRegisterPush(userId) {
  if (!isPushSupported() || !userId) return { token: null, granted: false };

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let granted = existing === 'granted';
    if (!granted) {
      const { status } = await Notifications.requestPermissionsAsync();
      granted = status === 'granted';
    }
    if (!granted) return { token: null, granted: false };

    const projectId = Constants?.expoConfig?.extra?.eas?.projectId
      || Constants?.easConfig?.projectId
      || undefined;
    const tokenResp = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    const token = tokenResp?.data;
    if (!token) return { token: null, granted: true };

    // Registrar no Supabase
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    await supabase.from('device_tokens').upsert(
      { user_id: userId, expo_push_token: token, platform, last_seen: new Date().toISOString() },
      { onConflict: 'user_id,expo_push_token' }
    );
    return { token, granted: true };
  } catch (e) {
    return { token: null, granted: false, error: e?.message };
  }
}

/**
 * Configura o canal padrão (Android exige).
 */
export async function setupChannels() {
  if (!isPushSupported()) return;
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Padrão',
      importance: Notifications.AndroidImportance?.DEFAULT || 3,
      vibrationPattern: [0, 250, 250, 250],
    });
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Alertas críticos',
      importance: Notifications.AndroidImportance?.HIGH || 4,
      sound: 'default',
    });
  } catch {}
}

/**
 * Lê preferências do user para saber quais notif enviar.
 */
export async function getNotifPrefs(userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from('notif_prefs')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();
  return data || { user_id: userId, estoque_baixo: true, margem_critica: true, resumo_diario: false };
}

export async function saveNotifPrefs(userId, prefs) {
  if (!userId) return;
  await supabase.from('notif_prefs').upsert(
    { user_id: userId, ...prefs, updated_at: new Date().toISOString() },
    { onConflict: 'user_id' }
  );
}
