import { supabase } from '../config/supabase';
import { createSupabaseDb } from './supabaseDb';

if (__DEV__) console.log('[DB] database.js loaded - migration version v2');

let db = null;
let cachedUserId = null;
let migrationRan = false;

// Migração: converte unidade_rendimento legado para valores explícitos (por_kg, por_litro)
// Produtos antigos usam 'Grama(s)' como padrão mesmo sendo vendidos por unidade.
// Somente produtos com rendimento_total pequeno (≤ 50) foram definidos via UI como "Por kg/litro".
// Esta migração é idempotente — pode rodar várias vezes sem efeito colateral.
async function runMigrations(database) {
  if (migrationRan) return;
  migrationRan = true; // Set early to avoid re-entry
  try {
    // Verifica se há produtos com valores legados que precisam de migração
    const legados = await database.getAllAsync(
      "SELECT id, rendimento_total FROM produtos WHERE unidade_rendimento = ? AND rendimento_total > 0 AND rendimento_total <= 50",
      ['Grama(s)']
    );

    if (legados && legados.length > 0) {
      // Produtos com Grama(s) + rendimento_total pequeno = foram marcados como "Por kg" pela UI
      for (const p of legados) {
        await database.runAsync(
          "UPDATE produtos SET unidade_rendimento = ? WHERE id = ?",
          ['por_kg', p.id]
        );
      }
      if (__DEV__) console.log('[Migration] tipo_venda: ' + legados.length + ' produto(s) migrado(s) para por_kg');
    }

    // Mesma lógica para Mililitro(s) → por_litro
    const legadosLitro = await database.getAllAsync(
      "SELECT id, rendimento_total FROM produtos WHERE unidade_rendimento = ? AND rendimento_total > 0 AND rendimento_total <= 50",
      ['Mililitro(s)']
    );

    if (legadosLitro && legadosLitro.length > 0) {
      for (const p of legadosLitro) {
        await database.runAsync(
          "UPDATE produtos SET unidade_rendimento = ? WHERE id = ?",
          ['por_litro', p.id]
        );
      }
      if (__DEV__) console.log('[Migration] tipo_venda: ' + legadosLitro.length + ' produto(s) migrado(s) para por_litro');
    }
  } catch (e) {
    if (__DEV__) console.warn('[Migration] Erro na migração tipo_venda:', e);
  }
}

export async function getDatabase() {
  // Fast path: return cached instance without hitting auth
  if (db && cachedUserId) {
    if (!migrationRan) await runMigrations(db);
    return db;
  }

  const { data: { session } } = await supabase.auth.getSession();
  const userId = session?.user?.id;

  if (!userId) {
    throw new Error('User not authenticated');
  }

  if (db && cachedUserId === userId) return db;

  cachedUserId = userId;
  db = createSupabaseDb(userId);
  await runMigrations(db);
  return db;
}

// Reset DB instance on logout — clears cached data
export function resetDatabase() {
  if (db?.clearCache) db.clearCache();
  db = null;
  cachedUserId = null;
}
