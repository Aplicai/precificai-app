/**
 * Sessão 28.30 — Foundation pra Multi-Loja com persistência Supabase.
 *
 * STATUS: foundation criado, NÃO wireado nas queries ainda.
 *
 * Este arquivo provê:
 *   - `currentLojaId()` — async, retorna BIGINT da loja atual ou null
 *   - `migrateLojasFromAsyncStorageToDb(userId)` — copia lojas do AsyncStorage
 *     pra tabela `lojas` no Supabase. Idempotente. Roda 1× no boot quando o
 *     app detecta lojas no AsyncStorage que não existem no DB.
 *   - `wrapSelectWithLoja(sql)` — helper futuro pra wrap SELECT com filtro
 *     `WHERE loja_id IS NULL OR loja_id = ?`. Aceita o SQL e injeta o WHERE.
 *
 * COMO USAR (próxima rodada):
 *   const lojaId = await currentLojaId();
 *   if (lojaId) {
 *     const rows = await db.getAllAsync(
 *       'SELECT * FROM produtos WHERE (loja_id IS NULL OR loja_id = ?) ORDER BY nome',
 *       [lojaId]
 *     );
 *   } else {
 *     // sem loja selecionada → mostra tudo (compat com pré-multi-loja)
 *     const rows = await db.getAllAsync('SELECT * FROM produtos ORDER BY nome');
 *   }
 *
 * E pra INSERT:
 *   await db.runAsync(
 *     'INSERT INTO produtos (nome, ..., loja_id) VALUES (?, ..., ?)',
 *     [nome, ..., lojaId]   // NULL se nenhuma loja selecionada → vira "compartilhado"
 *   );
 *
 * MIGRATION SQL (rodar no Supabase ANTES de habilitar):
 *   src/database/migration-multi-loja.sql
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

let _cachedLojaId = null;
let _cachedUserId = null;

/**
 * Retorna o BIGINT da loja atual no DB, ou null se nenhuma selecionada.
 *
 * Estratégia híbrida:
 *  1. Lê o ID local do AsyncStorage (`@lojas:current:<userId>`) — string opaca
 *     gerada pelo MVP em 28.22 (Date.now() em base 36)
 *  2. Busca essa string no map AsyncStorage→DB que migrateLojasFromAsyncStorageToDb
 *     popula. Se não existir mapping, retorna null (loja ainda não foi migrada).
 *
 * @param {string} userId
 * @returns {Promise<number|null>}
 */
export async function currentLojaId(userId) {
  if (!userId) return null;
  if (_cachedUserId === userId && _cachedLojaId !== null) return _cachedLojaId;
  try {
    const localId = await AsyncStorage.getItem(`@lojas:current:${userId}`);
    if (!localId) return null;
    const mapRaw = await AsyncStorage.getItem(`@lojas:idmap:${userId}`);
    const map = mapRaw ? JSON.parse(mapRaw) : {};
    const dbId = map[localId];
    if (typeof dbId === 'number' && dbId > 0) {
      _cachedUserId = userId;
      _cachedLojaId = dbId;
      return dbId;
    }
  } catch {}
  return null;
}

