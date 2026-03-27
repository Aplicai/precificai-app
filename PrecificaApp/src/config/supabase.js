import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
const supabaseUrl = 'https://lwznqpxzmqptrpbifvka.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx3em5xcHh6bXFwdHJwYmlmdmthIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyNzU5OTAsImV4cCI6MjA4OTg1MTk5MH0.rjjm9DE3oYFwEeuLg7zKqTONs_DV8BWlbrJ4g3m0XXs';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
