/**
 * aiPricing service (M1-23)
 *
 * Wrapper que reúne o contexto financeiro do usuário (configuração + despesas
 * + categoria + histórico) e chama a Edge Function `suggest-price` (proxy
 * Anthropic). Devolve o JSON normalizado pra UI consumir.
 *
 * NÃO chama a Anthropic API direto do app — a chave fica no servidor (Edge
 * Function) por questão de segurança (bundle web é público).
 *
 * Endpoint: definido em EXPO_PUBLIC_AI_PROXY_URL ou derivado do Supabase URL.
 *   Se EXPO_PUBLIC_SUPABASE_URL = https://xyz.supabase.co
 *   então default = https://xyz.supabase.co/functions/v1/suggest-price
 */
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';

function getEndpoint() {
  const explicit =
    Constants.expoConfig?.extra?.aiProxyUrl ||
    process.env.EXPO_PUBLIC_AI_PROXY_URL;
  if (explicit) return explicit;

  const supaUrl =
    Constants.expoConfig?.extra?.supabaseUrl ||
    process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!supaUrl) return null;
  return `${supaUrl.replace(/\/$/, '')}/functions/v1/suggest-price`;
}

/**
 * Coleta contexto financeiro do usuário (despesas, lucro alvo, etc.).
 * Usa o mesmo wrapper de DB que o resto do app.
 */
export async function gatherFinancialContext(db) {
  if (!db) return { despesas_fixas_pct: 0, despesas_variaveis_pct: 0, margem_alvo: 0.3 };

  try {
    const [config, fixas, variaveis] = await Promise.all([
      db.getFirstAsync('SELECT * FROM configuracao LIMIT 1').catch(() => null),
      db.getAllAsync('SELECT * FROM despesas_fixas').catch(() => []),
      db.getAllAsync('SELECT * FROM despesas_variaveis').catch(() => []),
    ]);

    const margem_alvo = Number(config?.lucro_desejado) || 0.3;
    const totalFixas = (fixas || []).reduce((s, f) => s + (Number(f.valor) || 0), 0);
    const faturamento = Number(config?.faturamento_estimado) || 0;
    const despesas_fixas_pct = faturamento > 0 ? totalFixas / faturamento : 0;
    const despesas_variaveis_pct = (variaveis || []).reduce(
      (s, v) => s + (Number(v.percentual) || 0),
      0,
    );

    return {
      margem_alvo: clamp(margem_alvo, 0, 0.95),
      despesas_fixas_pct: clamp(despesas_fixas_pct, 0, 0.95),
      despesas_variaveis_pct: clamp(despesas_variaveis_pct, 0, 0.95),
    };
  } catch {
    return { despesas_fixas_pct: 0, despesas_variaveis_pct: 0, margem_alvo: 0.3 };
  }
}

/**
 * Busca preço médio dos outros produtos da mesma categoria (referência).
 */
export async function getCategoriaMedia(db, categoriaId, excludeProdutoId = null) {
  if (!db || !categoriaId) return null;
  try {
    const rows = await db.getAllAsync(
      'SELECT preco_venda FROM produtos WHERE categoria_id = ? AND preco_venda > 0',
      [categoriaId],
    );
    const filtered = (rows || []).filter(
      (r) => excludeProdutoId == null || r.id !== excludeProdutoId,
    );
    if (!filtered.length) return null;
    const total = filtered.reduce((s, r) => s + Number(r.preco_venda || 0), 0);
    return total / filtered.length;
  } catch {
    return null;
  }
}

/**
 * Busca histórico recente de vendas (últimas 5 datas).
 */
export async function getHistoricoVendas(db, produtoId) {
  if (!db || !produtoId) return [];
  try {
    const rows = await db.getAllAsync(
      'SELECT data, quantidade FROM vendas WHERE produto_id = ? ORDER BY data DESC',
      [produtoId],
    );
    return (rows || []).slice(0, 5).map((r) => ({
      data: r.data,
      preco: 0, // o histórico de preço não está no schema de vendas; deixar 0
      vendas: Number(r.quantidade) || 0,
    }));
  } catch {
    return [];
  }
}

/**
 * Chamada principal — envia contexto pra Edge Function e devolve a sugestão.
 *
 * @param {Object} input
 * @param {string} input.produto_nome
 * @param {string} [input.categoria]
 * @param {number} input.cmv
 * @param {number} [input.preco_atual]
 * @param {number} [input.margem_alvo]
 * @param {number} [input.despesas_fixas_pct]
 * @param {number} [input.despesas_variaveis_pct]
 * @param {number} [input.preco_medio_categoria]
 * @param {Array} [input.historico]
 * @param {string} [input.observacoes]
 * @returns {Promise<{preco_sugerido, preco_psicologico, faixa_recomendada, margem_resultante, racional, alertas}>}
 */
export async function suggestPrice(input) {
  const endpoint = getEndpoint();
  if (!endpoint) {
    throw new Error('Endpoint da IA não configurado. Defina EXPO_PUBLIC_AI_PROXY_URL ou EXPO_PUBLIC_SUPABASE_URL.');
  }

  // JWT do usuário autenticado (Edge Function valida via supabase auth)
  const { data: { session } } = await supabase.auth.getSession();
  const headers = {
    'Content-Type': 'application/json',
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
    // Supabase Edge Functions também aceitam apikey
    const anon =
      Constants.expoConfig?.extra?.supabaseAnonKey ||
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
    if (anon) headers['apikey'] = anon;
  }

  const resp = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(input),
  });

  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }

  if (!resp.ok) {
    const detail = json?.detail || json?.error || text.slice(0, 200) || `HTTP ${resp.status}`;
    throw new Error(detail);
  }
  if (!json) throw new Error('Resposta inválida do servidor de IA.');
  return json;
}

function clamp(n, lo, hi) {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
