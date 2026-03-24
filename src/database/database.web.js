// Web database - uses Supabase directly (same logic as native)
import { supabase } from '../config/supabase';
import { createSupabaseDb } from './supabaseDb';

let db = null;
let cachedUserId = null;

export async function getDatabase() {
  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('User not authenticated');
  }

  if (db && cachedUserId === userId) return db;

  cachedUserId = userId;
  db = createSupabaseDb(userId);
  return db;
}

export function resetDatabase() {
  db = null;
  cachedUserId = null;
}
