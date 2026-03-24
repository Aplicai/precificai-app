import { supabase } from '../config/supabase';
import { createSupabaseDb } from './supabaseDb';

let db = null;
let cachedUserId = null;

export async function getDatabase() {
  // Fast path: return cached instance without hitting auth
  if (db && cachedUserId) return db;

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

// Reset DB instance on logout
export function resetDatabase() {
  db = null;
  cachedUserId = null;
}
