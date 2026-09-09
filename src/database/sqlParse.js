/**
 * sqlParse.js — helpers PUROS do tradutor SQL-string → PostgREST usado por
 * supabaseDb.js. Sem dependência de supabase/expo: testável em Node
 * (`__tests__/supabaseDb-parse.test.mjs`).
 *
 * Audit 2026-09: extraído do wrapper ao corrigir C1 (IN ignorado), A7
 * (COLLATE quebrava DESC), A14/A15 (aliases ignorados), A1/A5 (WHERE em coluna
 * da tabela joinada).
 */

// Aplica condições parseadas num query builder do PostgREST.
export function applyWhere(query, conditions) {
  for (const w of conditions) {
    const col = w.col;
    if (w.op === '=') query = query.eq(col, w.val);
    else if (w.op === 'IN') query = query.in(col, Array.isArray(w.val) ? w.val : [w.val]);
    else if (w.op === '!=') query = query.neq(col, w.val);
    else if (w.op === '>') query = query.gt(col, w.val);
    else if (w.op === '<') query = query.lt(col, w.val);
    else if (w.op === '>=') query = query.gte(col, w.val);
    else if (w.op === '<=') query = query.lte(col, w.val);
    else if (w.op === 'IS NULL') query = query.is(col, null);
    else if (w.op === 'IS NOT NULL') query = query.not(col, 'is', null);
  }
  return query;
}

// Avalia condições client-side (usado para colunas da tabela joinada).
export function matchesConditions(row, conditions) {
  for (const w of conditions) {
    const v = row?.[w.col];
    if (w.op === '=') { if (!(v == w.val)) return false; }
    else if (w.op === '!=') { if (v == w.val) return false; }
    else if (w.op === 'IN') { if (!(Array.isArray(w.val) && w.val.some(x => x == v))) return false; }
    else if (w.op === '>') { if (!(v > w.val)) return false; }
    else if (w.op === '<') { if (!(v < w.val)) return false; }
    else if (w.op === '>=') { if (!(v >= w.val)) return false; }
    else if (w.op === '<=') { if (!(v <= w.val)) return false; }
    else if (w.op === 'IS NULL') { if (v != null) return false; }
    else if (w.op === 'IS NOT NULL') { if (v == null) return false; }
  }
  return true;
}

// `ORDER BY [alias.]col [COLLATE X] [ASC|DESC]` → { col, desc } | null.
// Função/expressão no ORDER (COALESCE(...)) → null (mantém ordem de chegada).
export function parseOrderBy(sql) {
  const m = sql.match(/ORDER\s+BY\s+(?:(\w+)\.)?(\w+)(\s*\()?(?:\s+COLLATE\s+\w+)?(?:\s+(ASC|DESC))?/i);
  if (!m || m[3]) return null;
  return { col: m[2], desc: (m[4] || 'ASC').toUpperCase() === 'DESC' };
}

// Lista de colunas do SELECT com alias: `mp.nome AS mp_nome` → { prefix:'mp', col:'nome', alias:'mp_nome' }.
export function parseSelectColumns(sql) {
  const m = sql.match(/^SELECT\s+(?:DISTINCT\s+)?(.+?)\s+FROM\s/i);
  if (!m) return [];
  const out = [];
  for (const raw of m[1].split(',')) {
    const part = raw.trim();
    if (!part || part === '*' || /\.\*$/.test(part)) continue;
    const cm = part.match(/^(?:(\w+)\.)?(\w+)(?:\s+AS\s+(\w+)|\s+(\w+))?$/i);
    if (!cm) continue;
    out.push({ prefix: cm[1] || null, col: cm[2], alias: cm[3] || cm[4] || null });
  }
  return out;
}

export function parseWhereSimple(clause, params, startIdx) {
  const conditions = [];
  let paramIdx = startIdx;
  const parts = clause.split(/\s+AND\s+/i);

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed) continue;

    // IN (?,?,...) — exportação em massa (WHERE id IN (...)).
    // Captura coluna (com alias opcional) e o conteúdo entre parênteses.
    const inMatch = trimmed.match(/^(?:(\w+)\.)?(\w+)\s+IN\s*\(([^)]*)\)$/i);
    if (inMatch) {
      const col = inMatch[2];
      const tokens = inMatch[3].split(',').map(t => t.trim()).filter(t => t.length > 0);
      const vals = tokens.map(tok => (tok === '?' ? params[paramIdx++] : parseValue(tok)));
      conditions.push({ col, alias: inMatch[1] || null, op: 'IN', val: vals });
      continue;
    }

    const notNull = trimmed.match(/^(?:(\w+)\.)?(\w+)\s+IS\s+NOT\s+NULL$/i);
    if (notNull) { conditions.push({ col: notNull[2], alias: notNull[1] || null, op: 'IS NOT NULL', val: null }); continue; }
    const isNull = trimmed.match(/^(?:(\w+)\.)?(\w+)\s+IS\s+NULL$/i);
    if (isNull) { conditions.push({ col: isNull[2], alias: isNull[1] || null, op: 'IS NULL', val: null }); continue; }

    const match = trimmed.match(/^(?:(\w+)\.)?(\w+)\s*(=|!=|<>|>=|<=|>|<)\s*(.+)$/);
    if (match) {
      const col = match[2];
      const op = match[3] === '<>' ? '!=' : match[3];
      const valStr = match[4].trim();
      const val = valStr === '?' ? params[paramIdx++] : parseValue(valStr);
      conditions.push({ col, alias: match[1] || null, op, val });
    } else {
      // Audit C1: condição não reconhecida NÃO pode ser descartada (viraria
      // "todas as linhas"). Sinaliza; o chamador devolve erro.
      if (typeof __DEV__ !== 'undefined' && __DEV__) console.warn('[SupabaseDb] parseWhereSimple: condição WHERE não suportada:', trimmed);
      conditions.push({ col: null, alias: null, op: 'UNSUPPORTED', val: null, raw: trimmed });
    }
  }

  return conditions;
}


export function parseValue(str) {
  if (str === 'NULL' || str === 'null') return null;
  if (str === 'CURRENT_TIMESTAMP') return new Date().toISOString();
  if (/^'.*'$/.test(str)) return str.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(str)) return parseFloat(str);
  return str;
}
