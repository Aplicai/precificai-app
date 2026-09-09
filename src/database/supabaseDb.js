/**
 * Supabase Database Wrapper
 * Exposes the same interface as expo-sqlite (getAllAsync, runAsync, getFirstAsync)
 * so that existing screens work without any changes.
 */
import { supabase } from '../config/supabase';
import { parseWhereSimple, parseValue, applyWhere, matchesConditions, parseOrderBy, parseSelectColumns } from './sqlParse';

let currentUserId = null;

// Sessão 28.xx — defense-in-depth (security P2): allowlist EXPLÍCITA das tabelas
// que têm coluna `user_id NOT NULL` e são por-usuário, derivada do schema do
// Supabase (supabase-schema.sql + migrations dre-mensal/historico-precos/
// multi-loja/m1-estoque). INSERT/UPDATE/DELETE já forçam .eq('user_id', ...);
// a LEITURA (SELECT/JOIN) NÃO forçava — esta lista fecha a lacuna.
//
// REGRA DE SEGURANÇA: só aplicamos .eq('user_id', currentUserId) na leitura
// quando (a) a tabela está NESTA lista E (b) currentUserId existe. Tabelas fora
// da lista (ex.: locais-só-SQLite, tabelas de referência sem user_id, qualquer
// nome desconhecido) NÃO são filtradas — comportamento inalterado, zero risco
// de quebrar leitura de categorias/configuração.
const USER_SCOPED_TABLES = new Set([
  // supabase-schema.sql (todas as 27 tabelas têm user_id NOT NULL)
  'configuracao', 'perfil', 'despesas_fixas', 'despesas_variaveis',
  'faturamento_mensal', 'categorias_insumos', 'materias_primas',
  'categorias_embalagens', 'embalagens', 'categorias_preparos', 'preparos',
  'preparo_ingredientes', 'categorias_produtos', 'produtos',
  'produto_ingredientes', 'produto_preparos', 'produto_embalagens', 'vendas',
  'delivery_config', 'delivery_adicionais', 'delivery_produtos',
  'delivery_produto_itens', 'delivery_combos', 'delivery_combo_itens',
  'subscriptions', 'fluxo_caixa_movimentos', 'beta_features',
  // migrations
  'dre_mensal', 'historico_precos', 'lojas', 'estoque_movimentos',
  'device_tokens', 'notif_prefs',
  // audit B5 — tabelas por-usuário que faltavam na allowlist
  'produto_preco_delivery', 'preparo_embalagens', 'preparo_subpreparos',
  'embalagem_categoria_padrao', 'vendas_combos', 'account_deletion_requests',
  'feedback',
]);

function isUserScopedTable(table) {
  return !!(table && USER_SCOPED_TABLES.has(String(table).toLowerCase()));
}

// In-memory cache for read queries (5 second TTL)
const queryCache = new Map();
// Audit A7-perf: dedupe de requests EM VOO — a mesma query disparada 2-3× no
// mount (focus listener + useFocusEffect + banners) virava 2-3 HTTP idênticos.
const inflight = new Map();
const CACHE_TTL = 2000;

// Sentinel: marks a result that came from a SWALLOWED Supabase error (not a
// legitimate empty result). `getAllAsync` checks for it to SKIP caching, so a
// transient error window (session refresh / RLS / network) doesn't poison the
// 2s cache and zero-out every screen that reads the same tables.
// BLAST RADIUS: this property is non-enumerable and is only ever read inside
// this module by `isErrorResult`. Consumers (all screens) iterate the array
// via .map/.forEach/index — they never see it. Legitimate empty results never
// carry it, so they keep being cached normally (no perf regression).
const ERROR_RESULT = Symbol('supabaseDbErrorResult');
const ERROR_INFO = Symbol('supabaseDbErrorInfo');

// Telemetria (Sessão 25/06): extrai uma string CURTA e segura do erro do Supabase
// — código + mensagem (capada em 180). PostgREST traz erro de SCHEMA (coluna/tabela/
// RLS/JWT), não valores de usuário; capamos por garantia. Transforma o genérico
// "query falhou" em algo autodiagnosticável no Sentry (ex.: "42703 column produto_id
// does not exist") — foi assim que achei o bug do delivery_produto_itens.
function safeDbErrInfo(error) {
  if (!error) return 'erro desconhecido';
  const code = error.code ? String(error.code) : '';
  const msg = (error.message ? String(error.message) : '').slice(0, 180);
  return [code, msg].filter(Boolean).join(' ') || 'erro sem mensagem';
}

// Tag a fallback ([] or null) as coming from an error path. `info` (opcional) =
// string segura do erro real, recuperável depois via getErrorInfo.
function markErrorResult(result, info) {
  if (result == null) {
    // null can't carry a property; return a boxed sentinel object that
    // getFirstAsync/getAllAsync treat as "error, value is null".
    return { [ERROR_RESULT]: true, value: null, [ERROR_INFO]: info || null };
  }
  try {
    Object.defineProperty(result, ERROR_RESULT, {
      value: true, enumerable: false, configurable: true, writable: true,
    });
    if (info) Object.defineProperty(result, ERROR_INFO, {
      value: info, enumerable: false, configurable: true, writable: true,
    });
  } catch {
    // Frozen/sealed objects: fall back to wrapper so we still skip cache.
    return { [ERROR_RESULT]: true, value: result, [ERROR_INFO]: info || null };
  }
  return result;
}

function isErrorResult(result) {
  return !!(result && typeof result === 'object' && result[ERROR_RESULT]);
}

// Recupera a info de erro segura (string) anexada por markErrorResult, se houver.
function getErrorInfo(result) {
  return (result && typeof result === 'object' && result[ERROR_INFO]) || null;
}

// Unwrap a possibly-boxed error result back to its plain value for consumers.
function unwrapErrorResult(result) {
  if (result && typeof result === 'object' && ERROR_RESULT in result && 'value' in result) {
    return result.value;
  }
  return result;
}

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
// Audit M11: versão de escrita — leitura iniciada ANTES de um write não pode
// gravar no cache DEPOIS dele (dado stale por até 2s).
let writeVersion = 0;

function invalidateCache(table) {
  writeVersion += 1;
  if (!table) { queryCache.clear(); return; }
  const tbl = table.toLowerCase();
  for (const key of queryCache.keys()) {
    if (key.toLowerCase().includes(tbl)) queryCache.delete(key);
  }
}

// Export for clearing on sign-out
export function clearQueryCache() {
  writeVersion += 1;
  queryCache.clear();
}

// Sessão 28.27: telemetria opcional via Sentry. Carregamento defensivo —
// se errorReporter ainda não foi inicializado ou DSN ausente, vira no-op.
let _captureException = null;
function reportDbError(operation, sql, params, error) {
  // SQL completo NÃO vai pro Sentry (pode vazar dados de produção via WHERE
  // clauses). Mandamos só a operação + tabela + tipo de erro.
  try {
    if (!_captureException) {
      const mod = require('../utils/errorReporter');
      _captureException = mod?.captureException || null;
    }
    if (!_captureException) return;
    const tblMatch = String(sql).match(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM|FROM)\s+(\w+)/i);
    const table = tblMatch ? tblMatch[1] : 'unknown';
    _captureException(error, {
      db_operation: operation,
      db_table: table,
      param_count: Array.isArray(params) ? params.length : 0,
    });
  } catch {
    // Defensivo: nunca quebrar a query principal por causa de telemetria
  }
}

export function createSupabaseDb(userId) {
  currentUserId = userId;

  return {
    getAllAsync: (sql, params = []) => {
      const key = getCacheKey(sql, params);
      const cached = getCached(key);
      if (cached) return Promise.resolve(cached);
      const pending = inflight.get(key);
      if (pending) return pending;
      const versionAtStart = writeVersion;
      const promise = executeQuery(sql, params, 'all').then(result => {
        // Erro do Supabase: NÃO cacheia (a próxima leitura recupera), mas também
        // NÃO lança. Lançar quebrava telas que não tratam o throw → TELA BRANCA
        // (ex.: atualizar insumos). Retorna vazio (contrato original), e a tela
        // se recupera no próximo load (sem cache poluído).
        if (isErrorResult(result)) {
          reportDbError('getAllAsync', sql, params, new Error('query falhou: ' + (getErrorInfo(result) || 'não-cacheado')));
          return unwrapErrorResult(result);
        }
        if (versionAtStart === writeVersion) setCache(key, result);
        return result;
      }).catch(err => {
        // Exceção inesperada: loga e devolve vazio — nunca derruba a tela.
        reportDbError('getAllAsync', sql, params, err);
        return [];
      }).finally(() => { if (inflight.get(key) === promise) inflight.delete(key); });
      inflight.set(key, promise);
      return promise;
    },
    getFirstAsync: (sql, params = []) => executeQuery(sql, params, 'first').then(result => {
      // Erro: não cacheia, mas não lança (evita tela branca). Devolve null.
      if (isErrorResult(result)) {
        reportDbError('getFirstAsync', sql, params, new Error('query falhou: ' + (getErrorInfo(result) || '')));
      }
      return unwrapErrorResult(result);
    }).catch(err => {
      reportDbError('getFirstAsync', sql, params, err);
      return null;
    }),
    runAsync: (sql, params = []) => {
      // Extract table name for targeted cache invalidation
      const tblMatch = sql.match(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+(\w+)/i);
      invalidateCache(tblMatch ? tblMatch[1] : null);
      return executeRun(sql, params).catch(err => {
        reportDbError('runAsync', sql, params, err);
        throw err;
      });
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

  // Sessão 28.56 — Handle COUNT(*) queries explicitly.
  // Antes: `SELECT COUNT(*) as n FROM tabela WHERE ...` ia direto pro
  // `supabase.from(tabela).select('COUNT(*) as n')` que o PostgREST rejeita
  // com 400 Bad Request. Solução: usar head:true + count:'exact', que retorna
  // só o count no header, sem rows.
  const countMatch = normalized.match(/^SELECT\s+COUNT\s*\(\s*\*\s*\)\s*(?:as\s+(\w+))?\s+FROM\s+(\w+)(.*?)$/i);
  if (countMatch) {
    const countAlias = countMatch[1] || 'count';
    const table = countMatch[2];
    const rest = (countMatch[3] || '').trim();
    let query = supabase.from(table).select('*', { count: 'exact', head: true });
    const whereParts = parseWhere(rest, params);
    if (whereParts.some(w => w.op === 'UNSUPPORTED')) {
      return markErrorResult(mode === 'first' ? null : [], 'WHERE não suportado: ' + whereParts.find(w => w.op === 'UNSUPPORTED').raw);
    }
    query = applyWhere(query, whereParts);
    // Defense-in-depth (security P2): mesmo filtro user_id no COUNT.
    if (isUserScopedTable(table) && currentUserId) {
      query = query.eq('user_id', currentUserId);
    }
    const { count, error } = await query;
    if (error) {
      console.warn('[SupabaseDb] COUNT error (não-cacheado):', error.message);
      // ERRO real → marca para não cachear e propagar; NÃO é vazio legítimo.
      return markErrorResult(mode === 'first' ? null : [], safeDbErrInfo(error));
    }
    const row = { [countAlias]: count || 0 };
    return mode === 'first' ? row : [row];
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

  // Sessão 28.56 — defesa contra colunas com alias-prefixos (mp.preco_por_kg)
  // ou expressões SQL que o PostgREST não entende. Se detectarmos algo
  // diferente de identificadores simples ou `*`, caímos pra select('*') e
  // deixamos o consumidor pegar os campos no JS.
  const isSimpleColumns = columns === '*' ||
    /^([\w]+\s*(?:,\s*[\w]+\s*)*)$/.test(columns);
  const selectCols = isSimpleColumns ? columns : '*';
  let query = supabase.from(table).select(selectCols);

  // Parse WHERE clause.
  // Audit C1: antes, uma condição não reconhecida (ex.: `id IN (?,?)`) era
  // DESCARTADA em silêncio e a query devolvia o catálogo INTEIRO — "Reajustar"
  // e "Duplicar" em massa atingiam todos os registros. Agora: IN é suportado e
  // condição desconhecida vira erro (resultado vazio marcado), nunca "tudo".
  const whereParts = parseWhere(rest, params);
  const unsupported = whereParts.find(w => w.op === 'UNSUPPORTED');
  if (unsupported) {
    reportDbError('executeQuery', sql, params, new Error('WHERE não suportado: ' + unsupported.raw));
    return markErrorResult(mode === 'first' ? null : [], 'WHERE não suportado: ' + unsupported.raw);
  }
  query = applyWhere(query, whereParts);

  // Sessão 28.xx — defense-in-depth (security P2): força filtro user_id na
  // LEITURA, espelhando UPDATE/DELETE. Só para tabelas da allowlist E quando há
  // usuário logado. RLS já barra cross-user; isto é a 2ª camada. Custo ~zero.
  if (isUserScopedTable(table) && currentUserId) {
    query = query.eq('user_id', currentUserId);
  }

  // Parse ORDER BY
  // Audit A7: `ORDER BY nome COLLATE NOCASE DESC` — o COLLATE no meio fazia o
  // DESC ser ignorado (Z-A sempre A-Z).
  const orderMatch = parseOrderBy(rest);
  if (orderMatch) {
    query = query.order(orderMatch.col, { ascending: !orderMatch.desc });
  }

  // Parse LIMIT
  const limitMatch = rest.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) {
    query = query.limit(parseInt(limitMatch[1]));
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[SupabaseDb] Query error (não-cacheado):', error.message);
    // ERRO real → marca para não cachear e propagar. Vazio legítimo (sem erro,
    // 0 rows) cai no return abaixo SEM marca e segue cacheável normalmente.
    return markErrorResult(mode === 'first' ? null : [], safeDbErrInfo(error));
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
      // Sessão 28.44 — security L5: não logar payload completo em prod
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[SupabaseDb] Insert error:', error.message, table, JSON.stringify(row));
      } else {
        console.error('[SupabaseDb] Insert error:', error.message, table);
      }
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

    // Parse WHERE for UPDATE. Condição não suportada → lança (nunca "atualiza tudo").
    const whereConditions = parseWhereSimple(whereClause, params, paramIdx);
    const badUpd = whereConditions.find(w => w.op === 'UNSUPPORTED');
    if (badUpd) throw new Error(`UPDATE ${table}: WHERE não suportado (${badUpd.raw})`);
    query = applyWhere(query, whereConditions);
    // Sessão 28.44 — defense-in-depth: força filtro user_id no UPDATE.
    // RLS no Postgres já barra cross-user, mas se RLS for desativado por
    // engano, isso é a 2ª camada. Custo zero. (Auditoria security M1)
    if (currentUserId) query = query.eq('user_id', currentUserId);

    const { error } = await query;
    if (error) {
      // Sessão 28.44 — security L5: não logar payload em prod (vazamento via console)
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.error('[SupabaseDb] Update error:', error.message, table, JSON.stringify(updates));
      } else {
        console.error('[SupabaseDb] Update error:', error.message, table);
      }
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
    // Condição não suportada → lança (nunca "apaga tudo").
    const whereConditions = parseWhereSimple(whereClause, params, 0);
    const badDel = whereConditions.find(w => w.op === 'UNSUPPORTED');
    if (badDel) throw new Error(`DELETE ${table}: WHERE não suportado (${badDel.raw})`);
    query = applyWhere(query, whereConditions);
    // Sessão 28.44 — defense-in-depth: força filtro user_id no DELETE
    if (currentUserId) query = query.eq('user_id', currentUserId);

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
  // Pattern: SELECT cols FROM table1 alias1 [LEFT|INNER] JOIN table2 alias2 ON condition WHERE condition

  // Strategy: Use Supabase's embedded select for foreign key relationships
  // For complex joins, use RPC or manual fetching

  // Sessão 28.31 BUG FIX: detecta LEFT JOIN explicitamente.
  // Antes o parser tratava tudo como INNER JOIN — qualquer linha do mainTable
  // sem match era removida. RelatorioInsumos usa LEFT JOIN materias_primas →
  // categorias_insumos: insumos sem categoria (FK NULL ou categoria deletada)
  // sumiam → tela mostrava "Sem insumos cadastrados".
  const isLeftJoin = /LEFT\s+(?:OUTER\s+)?JOIN/i.test(sql);

  // Parse the join query structure
  const fromMatch = sql.match(/FROM\s+(\w+)\s+(\w+)?\s+(?:LEFT\s+(?:OUTER\s+)?|INNER\s+)?JOIN\s+(\w+)\s+(\w+)?\s+ON\s+(\w+)\.(\w+)\s*=\s*(\w+)\.(\w+)/i);

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
  const unsupportedJoin = whereConditions.find(w => w.op === 'UNSUPPORTED');
  if (unsupportedJoin) {
    reportDbError('executeJoinQuery', sql, params, new Error('WHERE não suportado: ' + unsupportedJoin.raw));
    return markErrorResult(mode === 'first' ? null : [], 'WHERE não suportado: ' + unsupportedJoin.raw);
  }
  // Audit A1/A5: condição sobre coluna da tabela JOINADA (`p.preco_venda > 0`,
  // `pi.materia_prima_id IN (...)`) era aplicada no mainTable → 42703 → [].
  // Agora: condições com alias da joinada são aplicadas client-side após o merge.
  const joinAliases = new Set([alias2, table2]);
  const mainConds = whereConditions.filter(w => !(w.alias && joinAliases.has(w.alias)));
  const joinConds = whereConditions.filter(w => w.alias && joinAliases.has(w.alias));

  // Fetch main table rows
  let mainQuery = applyWhere(supabase.from(mainTable).select('*'), mainConds);

  // Sessão 28.xx — defense-in-depth (security P2): força filtro user_id no
  // mainTable do JOIN. Só para tabelas da allowlist E com usuário logado. O
  // joinTable é buscado por PKs (.in(refCol, fkValues)) derivadas das mainRows
  // já filtradas, então não é tocado aqui (escopo cirúrgico).
  if (isUserScopedTable(mainTable) && currentUserId) {
    mainQuery = mainQuery.eq('user_id', currentUserId);
  }

  const { data: mainRows, error: mainErr } = await mainQuery;
  if (mainErr) {
    // ERRO real do Supabase no mainTable → não cachear, propagar.
    console.warn('[SupabaseDb] JOIN main error (não-cacheado):', mainErr.message);
    return markErrorResult(mode === 'first' ? null : [], safeDbErrInfo(mainErr));
  }
  // Vazio legítimo (query ok, 0 rows): cacheável normalmente.
  if (!mainRows?.length) return mode === 'first' ? null : [];

  // Sessão 28.31 BUG FIX: se o mainTable tem rows mas NENHUMA tem FK válido
  // (ex: insumos sem categoria_id), o LEFT JOIN deve retornar essas rows
  // mesmo assim — sem dados da tabela joined.
  const fkValues = [...new Set(mainRows.map(r => r[fkCol]).filter(Boolean))];

  let joinMap = {};
  if (fkValues.length > 0) {
    const { data: joinRows, error: joinErr } = await supabase
      .from(joinTable)
      .select('*')
      .in(refCol, fkValues);
    if (joinErr) {
      // No LEFT JOIN, falha do join não invalida mainRows; INNER JOIN sim.
      // ERRO real → marca para não cachear/propagar (só no INNER, que zeraria).
      if (!isLeftJoin) {
        console.warn('[SupabaseDb] JOIN error (não-cacheado):', joinErr.message);
        return markErrorResult(mode === 'first' ? null : [], safeDbErrInfo(joinErr));
      }
    } else {
      (joinRows || []).forEach(r => { joinMap[r[refCol]] = r; });
    }
  } else if (!isLeftJoin) {
    // INNER JOIN com FK vazio = sem matches possíveis = vazio
    return mode === 'first' ? null : [];
  }

  // Audit A14/A15/M3: aliases `x.col AS nome` eram ignorados e colunas homônimas
  // da joinada (nome, id, unidade_medida…) ficavam sombreadas pela principal.
  // Agora cada alias é resolvido explicitamente contra a tabela certa.
  const selectCols = parseSelectColumns(sql);

  // Merge results - flatten columns with alias prefixes removed
  let merged = [];
  for (const main of mainRows) {
    const joined = joinMap[main[fkCol]] || null;
    if (!joined && !isLeftJoin) continue; // INNER JOIN filtra rows sem match
    if (joined && !matchesConditions(joined, joinConds)) continue;
    const result = { ...main };
    Object.keys(joined || {}).forEach(k => {
      if (!(k in result)) result[k] = joined[k];
    });
    for (const c of selectCols) {
      if (!c.alias) continue;
      const src = (c.prefix && joinAliases.has(c.prefix)) ? (joined || {}) : main;
      if (c.col in src) result[c.alias] = src[c.col];
    }
    merged.push(result);
  }

  // Parse ORDER BY (client-side; função no ORDER → mantém ordem de chegada)
  const orderMatch = parseOrderBy(sql);
  if (orderMatch) {
    const col = orderMatch.col;
    const desc = orderMatch.desc;
    merged.sort((a, b) => {
      if (a[col] < b[col]) return desc ? 1 : -1;
      if (a[col] > b[col]) return desc ? -1 : 1;
      return 0;
    });
  }

  // Audit M4: LIMIT era ignorado em JOIN (histórico inteiro carregado).
  const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
  if (limitMatch) merged = merged.slice(0, parseInt(limitMatch[1], 10));

  return mode === 'first' ? (merged[0] ?? null) : merged;
}

// ============================================================
// Helper parsers
// ============================================================

// Audit C1: parseWhere (SELECT simples) agora delega ao parser completo —
// ganha `IN (...)`, alias em coluna e sinalização de condição não suportada.
function parseWhere(rest, params) {
  const whereMatch = rest.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|\s*$)/i);
  if (!whereMatch) return [];
  return parseWhereSimple(whereMatch[1], params, 0);
}

// Audit A10/M5: permite ao chamador distinguir "[] por erro" de "vazio real".
export function isDbErrorResult(result) {
  return isErrorResult(result);
}

