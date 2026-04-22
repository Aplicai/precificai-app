/**
 * Supabase Database Wrapper
 * Exposes the same interface as expo-sqlite (getAllAsync, runAsync, getFirstAsync)
 * so that existing screens work without any changes.
 */
import { supabase } from '../config/supabase';

let currentUserId = null;

// In-memory cache for read queries (5 second TTL)
const queryCache = new Map();
const CACHE_TTL = 2000;

function getCacheKey(sql, params) {
  return sql + '|' + JSON.stringify(params);
}

function getCached(key) {
  const entry = queryCache.get(key);
  if (entry && Date.now() - entry.time < CACHE_TTL) return entry.data;
  queryCache.delete(key);
  return null;
}

function setCache(key, data) {
  queryCache.set(key, { data, time: Date.now() });
  // Limit cache size
  if (queryCache.size > 100) {
    const first = queryCache.keys().next().value;
    queryCache.delete(first);
  }
}

// Invalidate cache — table-aware: only clears entries that reference the affected table
function invalidateCache(table) {
  if (!table) { queryCache.clear(); return; }
  const tbl = table.toLowerCase();
  for (const key of queryCache.keys()) {
    if (key.toLowerCase().includes(tbl)) queryCache.delete(key);
  }
}

// Export for clearing on sign-out
export function clearQueryCache() {
  queryCache.clear();
}

export function createSupabaseDb(userId) {
  currentUserId = userId;

  return {
    getAllAsync: (sql, params = []) => {
      const key = getCacheKey(sql, params);
      const cached = getCached(key);
      if (cached) return Promise.resolve(cached);
      return executeQuery(sql, params, 'all').then(result => {
        setCache(key, result);
        return result;
      });
    },
    getFirstAsync: (sql, params = []) => executeQuery(sql, params, 'first'),
    runAsync: (sql, params = []) => {
      // Extract table name for targeted cache invalidation
      const tblMatch = sql.match(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i);
      invalidateCache(tblMatch ? tblMatch[1] : null);
      return executeRun(sql, params);
    },
    execAsync: (sql) => Promise.resolve(),
  };
}

// ============================================================
// SQL Parser — translates SQL strings to Supabase JS calls
// ============================================================

async function executeQuery(sql, params, mode) {
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // Handle JOINs with a dedicated parser
  if (/JOIN/i.test(normalized)) {
    return executeJoinQuery(normalized, params, mode);
  }

  // Simple SELECT
  const selectMatch = normalized.match(/^SELECT\s+(.+?)\s+FROM\s+(\w+)(.*?)$/i);
  if (!selectMatch) {
    if (__DEV__) console.warn('[SupabaseDb] Unparsed query:', sql);
    return mode === 'first' ? null : [];
  }

  const columns = selectMatch[1].trim();
  const table = selectMatch[2];
  const rest = selectMatch[3].trim();

  // Build Supabase query
  const selectCols = columns === '*' ? '*' : columns;
  let query = supabase.from(table).select(selectCols);

  // Parse WHERE clause
  const whereParts = parseWhere(rest, params);
  for (const w of whereParts) {
    if (w.op === '=') query = query.eq(w.col, w.val);
    else if (w.op === '!=') query = query.neq(w.col, w.val);
    else if (w.op === '>') query = query.gt(w.col, w.val);
    else if (w.op === '<') query = query.lt(w.col, w.val);
    else if (w.op === '>=') query = query.gte(w.col, w.val);
    else if (w.op === '<=') query = query.lte(w.col, w.val);
    else if (w.op === 'IS NULL') query = query.is(w.col, null);
    else if (w.op === 'IS NOT NULL') query = query.not(w.col, 'is', null);
  }

  // Parse ORDER BY
  const orderMatch = rest.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    query = query.order(orderMatch[1], { ascending: (orderMatch[2] || 'ASC').toUpperCase() !== 'DESC' });
  }

  // Parse LIMIT
  const limitMatch = rest.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    query = query.limit(parseInt(limitMatch[1]));
  }

  const { data, error } = await query;
  if (error) {
    if (__DEV__) console.error('[SupabaseDb] Query error:', error.message, sql);
    return mode === 'first' ? null : [];
  }

  return mode === 'first' ? (data?.[0] ?? null) : (data ?? []);
}

async function executeRun(sql, params = []) {
  const normalized = sql.trim().replace(/\s+/g, ' ');

  // INSERT
  const insertMatch = normalized.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
  if (insertMatch) {
    const table = insertMatch[1];
    const cols = insertMatch[2].split(',').map(c => c.trim());
    const placeholders = insertMatch[3].split(',').map(p => p.trim());

    const row = { user_id: currentUserId };
    cols.forEach((col, i) => {
      if (col === 'id') return; // Skip id, let Supabase auto-generate
      row[col] = i < params.length ? params[i] : parseValue(placeholders[i]);
    });

    const { data, error } = await supabase.from(table).insert(row).select('id').single();
    if (error) {
      console.error('[SupabaseDb] Insert error:', error.message, table, JSON.stringify(row));
      throw new Error(`Erro ao salvar em ${table}: ${error.message}`);
    }
    return { lastInsertRowId: data?.id, changes: 1 };
  }

  // UPDATE
  const updateMatch = normalized.match(/^UPDATE\s+(\w+)\s+SET\s+(.+?)\s+WHERE\s+(.+)$/i);
  if (updateMatch) {
    const table = updateMatch[1];
    const setClauses = updateMatch[2].split(',').map(s => s.trim());
    const whereClause = updateMatch[3].trim();

    const updates = {};
    let paramIdx = 0;
    for (const clause of setClauses) {
      const [col] = clause.split('=').map(s => s.trim());
      if (clause.includes('?')) {
        updates[col] = params[paramIdx++];
      } else {
        const valMatch = clause.match(/=\s*(.+)/);
        if (valMatch) updates[col] = parseValue(valMatch[1].trim());
      }
    }

    let query = supabase.from(table).update(updates);

    // Parse WHERE for UPDATE
    const whereConditions = parseWhereSimple(whereClause, params, paramIdx);
    for (const w of whereConditions) {
      if (w.op === '=') query = query.eq(w.col, w.val);
      else if (w.op === '>') query = query.gt(w.col, w.val);
      else if (w.op === '<') query = query.lt(w.col, w.val);
      else if (w.op === '>=') query = query.gte(w.col, w.val);
      else if (w.op === '<=') query = query.lte(w.col, w.val);
    }

    const { error } = await query;
    if (error) {
      console.error('[SupabaseDb] Update error:', error.message, table, JSON.stringify(updates));
      throw new Error(`Erro ao atualizar ${table}: ${error.message}`);
    }
    return { changes: 1 };
  }

  // DELETE
  const deleteMatch = normalized.match(/^DELETE\s+FROM\s+(\w+)\s+WHERE\s+(.+)$/i);
  if (deleteMatch) {
    const table = deleteMatch[1];
    const whereClause = deleteMatch[2].trim();

    let query = supabase.from(table).delete();
    const whereConditions = parseWhereSimple(whereClause, params, 0);
    for (const w of whereConditions) {
      if (w.op === '=') query = query.eq(w.col, w.val);
      else if (w.op === '!=') query = query.neq(w.col, w.val);
      else if (w.op === '>') query = query.gt(w.col, w.val);
      else if (w.op === '<') query = query.lt(w.col, w.val);
      else if (w.op === '>=') query = query.gte(w.col, w.val);
      else if (w.op === '<=') query = query.lte(w.col, w.val);
    }

    const { error } = await query;
    if (error) {
      console.error('[SupabaseDb] Delete error:', error.message, table);
      throw new Error(`Erro ao excluir de ${table}: ${error.message}`);
    }
    return { changes: 1 };
  }

  // INSERT OR IGNORE (used for configuracao singleton)
  if (/INSERT\s+OR\s+IGNORE/i.test(normalized)) {
    // For singleton tables, use upsert
    const match = normalized.match(/INTO\s+(\w+)\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)/i);
    if (match) {
      const table = match[1];
      const cols = match[2].split(',').map(c => c.trim());
      const row = { user_id: currentUserId };
      cols.forEach((col, i) => {
        if (col === 'id') return;
        row[col] = params[i] ?? null;
      });
      await supabase.from(table).upsert(row, { onConflict: 'user_id' });
    }
    return { changes: 0 };
  }

  if (__DEV__) console.warn('[SupabaseDb] Unparsed SQL:', sql);
  return { changes: 0 };
}

// ============================================================
// JOIN query handler
// ============================================================

async function executeJoinQuery(sql, params, mode) {
  // Extract main table and join info
  // Pattern: SELECT cols FROM table1 alias1 JOIN table2 alias2 ON condition WHERE condition

  // Strategy: Use Supabase's embedded select for foreign key relationships
  // For complex joins, use RPC or manual fetching

  // Parse the join query structure
  const fromMatch = sql.match(/FROM\s+(\w+)\s+(\w+)?\s+(?:INNER\s+)?JOIN\s+(\w+)\s+(\w+)?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);

  if (!fromMatch) {
    // Fallback: execute two separate queries and merge
    if (__DEV__) console.warn('[SupabaseDb] Complex JOIN, falling back:', sql);
    return mode === 'first' ? null : [];
  }

  const table1 = fromMatch[1];
  const alias1 = fromMatch[2] || table1;
  const table2 = fromMatch[3];
  const alias2 = fromMatch[4] || table2;
  const joinLeftAlias = fromMatch[5];
  const joinLeftCol = fromMatch[6];
  const joinRightAlias = fromMatch[7];
  const joinRightCol = fromMatch[8];

  // Determine which table references which
  let mainTable, joinTable, fkCol, refCol;
  if (joinLeftAlias === alias1 || joinLeftAlias === table1) {
    mainTable = table1; joinTable = table2;
    fkCol = joinLeftCol; refCol = joinRightCol;
  } else {
    mainTable = table1; joinTable = table2;
    fkCol = joinRightCol; refCol = joinLeftCol;
  }

  // Parse WHERE
  const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|\s*$)/i);
  let whereConditions = [];
  if (whereMatch) {
    whereConditions = parseWhereSimple(whereMatch[1], params, 0);
  }

  // Fetch main table rows
  let mainQuery = supabase.from(mainTable).select('*');
  for (const w of whereConditions) {
    // Map alias.col to just col
    const col = w.col.replace(/^\w+\./, '');
    if (w.op === '=') mainQuery = mainQuery.eq(col, w.val);
  }

  const { data: mainRows, error: mainErr } = await mainQuery;
  if (mainErr || !mainRows?.length) return mode === 'first' ? null : [];

  // Fetch join table rows
  const fkValues = [...new Set(mainRows.map(r => r[fkCol]).filter(Boolean))];
  if (!fkValues.length) return mode === 'first' ? null : [];

  const { data: joinRows, error: joinErr } = await supabase
    .from(joinTable)
    .select('*')
    .in(refCol, fkValues);

  if (joinErr) return mode === 'first' ? null : [];

  // Create lookup map
  const joinMap = {};
  (joinRows || []).forEach(r => { joinMap[r[refCol]] = r; });

  // Merge results - flatten columns with alias prefixes removed
  const merged = mainRows.map(main => {
    const joined = joinMap[main[fkCol]] || {};
    // Prefix join table columns to avoid conflicts
    const result = { ...main };
    Object.keys(joined).forEach(k => {
      if (!(k in result)) result[k] = joined[k];
    });
    return result;
  }).filter(r => joinMap[r[fkCol]]); // INNER JOIN: only rows with match

  // Parse ORDER BY
  const orderMatch = sql.match(/ORDER\s+BY\s+(?:\w+\.)?(\w+)(?:\s+(ASC|DESC))?/i);
  if (orderMatch) {
    const col = orderMatch[1];
    const desc = (orderMatch[2] || 'ASC').toUpperCase() === 'DESC';
    merged.sort((a, b) => {
      if (a[col] < b[col]) return desc ? 1 : -1;
      if (a[col] > b[col]) return desc ? -1 : 1;
      return 0;
    });
  }

  return mode === 'first' ? (merged[0] ?? null) : merged;
}

// ============================================================
// Helper parsers
// ============================================================

function parseWhere(rest, params) {
  const conditions = [];
  const whereMatch = rest.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|\s*$)/i);
  if (!whereMatch) return conditions;

  const clause = whereMatch[1];
  let paramIdx = 0;

  // Split by AND
  const parts = clause.split(/\s+AND\s+/i);
  for (const part of parts) {
    const trimmed = part.trim();

    if (/IS\s+NULL/i.test(trimmed)) {
      const col = trimmed.match(/(\w+(?:\.\w+)?)\s+IS\s+NULL/i)?.[1]?.replace(/^\w+\./, '');
      if (col) conditions.push({ col, op: 'IS NULL', val: null });
    } else if (/IS\s+NOT\s+NULL/i.test(trimmed)) {
      const col = trimmed.match(/(\w+(?:\.\w+)?)\s+IS\s+NOT\s+NULL/i)?.[1]?.replace(/^\w+\./, '');
      if (col) conditions.push({ col, op: 'IS NOT NULL', val: null });
    } else {
      const match = trimmed.match(/(\w+(?:\.\w+)?)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)/);
      if (match) {
        const col = match[1].replace(/^\w+\./, '');
        const op = match[2] === '<>' ? '!=' : match[2];
        const valStr = match[3].trim();
        const val = valStr === '?' ? params[paramIdx++] : parseValue(valStr);
        conditions.push({ col, op, val });
      }
    }
  }

  return conditions;
}

function parseWhereSimple(clause, params, startIdx) {
  const conditions = [];
  let paramIdx = startIdx;
  const parts = clause.split(/\s+AND\s+/i);

  for (const part of parts) {
    const match = part.trim().match(/(?:\w+\.)?(\w+)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)/);
    if (match) {
      const col = match[1];
      const op = match[2] === '<>' ? '!=' : match[2];
      const valStr = match[3].trim();
      const val = valStr === '?' ? params[paramIdx++] : parseValue(valStr);
      conditions.push({ col, op, val });
    }
  }

  return conditions;
}

function parseValue(str) {
  if (str === 'NULL' || str === 'null') return null;
  if (str === 'CURRENT_TIMESTAMP') return new Date().toISOString();
  if (/^'.*'$/.test(str)) return str.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  return str;
}
