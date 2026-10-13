import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { captureRecoveryIntent } from '../utils/recoveryFlag';

// ANTES de criar o client: o `detectSessionInUrl` consome e apaga o fragmento
// da URL durante `_initialize()`, e só avisa PASSWORD_RECOVERY num setTimeout
// posterior — que pode cair no vazio se o React ainda não assinou. Lendo aqui,
// a intenção fica registrada de forma síncrona e não depende do evento.
if (Platform.OS === 'web' && typeof window !== 'undefined') {
  captureRecoveryIntent(window);
}

const supabaseUrl = Constants.expoConfig?.extra?.supabaseUrl || process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = Constants.expoConfig?.extra?.supabaseAnonKey || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and Anon Key must be set in environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
});
