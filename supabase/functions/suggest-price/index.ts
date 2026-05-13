// Supabase Edge Function — suggest-price (M1-23)
//
// Proxy seguro para a API da Anthropic (Claude). Evita expor a chave no
// bundle do app (que é público no Web). O usuário envia contexto de produto
// + preferências; a função chama Claude com um prompt estruturado e devolve
// JSON normalizado: { preco_sugerido, preco_psicologico, faixa_recomendada,
// margem_resultante, racional, alertas }.
//
// Variáveis de ambiente necessárias (configurar no Supabase Dashboard):
//   ANTHROPIC_API_KEY    — chave da API da Anthropic
//   ANTHROPIC_MODEL      — opcional (default: claude-sonnet-4-5)
//
// Auth: requer JWT do usuário (RLS garante isolamento — apenas o próprio
// usuário pode chamar; cada chamada é loggada via supabase logs).
//
// Deploy:
//   supabase functions deploy suggest-price
//   supabase secrets set ANTHROPIC_API_KEY=sk-ant-...

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const DEFAULT_MODEL = 'claude-sonnet-4-5';

// === Sessão 28.68 — security hardening (H-1) ===
// Rate-limit in-memory por user.id (persiste enquanto a edge function estiver
// quente). Suficiente pra evitar abuso massivo da ANTHROPIC_API_KEY. Em caso
// de scale-out o pior cenário é N * MAX por hora — ainda aceitável pra MVP.
const MAX_REQUESTS_PER_HOUR = 30;
const WINDOW_MS = 60 * 60 * 1000;
const rateLimitMap = new Map<string, number[]>();

function checkRateLimit(userId: string): { allowed: boolean; resetAt?: number; remaining: number } {
  const now = Date.now();
  const prev = rateLimitMap.get(userId) ?? [];
  const requests = prev.filter((t) => now - t < WINDOW_MS);
  if (requests.length >= MAX_REQUESTS_PER_HOUR) {
    const oldest = requests[0];
    rateLimitMap.set(userId, requests);
    return { allowed: false, resetAt: oldest + WINDOW_MS, remaining: 0 };
  }
  requests.push(now);
  rateLimitMap.set(userId, requests);
  return { allowed: true, remaining: MAX_REQUESTS_PER_HOUR - requests.length };
}

// Limites de tamanho do payload (defesa contra prompt-bombing).
const MAX_OBSERVACOES_LEN = 2000;
const MAX_CMV = 99999;
const MAX_PRODUTO_NOME_LEN = 200;
const MAX_CATEGORIA_LEN = 100;
const MAX_HISTORICO_ITEMS = 5;
// === fim ===

interface SuggestRequest {
  produto_nome: string;
  categoria?: string;
  cmv: number;                    // Custo de Mercadoria Vendida (R$/unidade)
  margem_alvo?: number;           // 0-1 (ex: 0.30 = 30%)
  despesas_fixas_pct?: number;    // 0-1
  despesas_variaveis_pct?: number; // 0-1 (taxas cartão, impostos, etc.)
  preco_atual?: number;           // se já tem preço, mostra para comparação
  historico?: Array<{ data: string; preco: number; vendas?: number }>;
  preco_medio_categoria?: number; // se o app souber
  observacoes?: string;           // free text do usuário (opcional)
}

interface SuggestResponse {
  preco_sugerido: number;
  preco_psicologico: number;     // ex: arredondado pra X,90 ou X,99
  faixa_recomendada: { min: number; max: number };
  margem_resultante: number;     // 0-1
  racional: string;              // explicação curta (3-5 frases)
  alertas: string[];             // ex: "preço acima da média da categoria"
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders() });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) {
    return json({ error: 'missing_api_key', detail: 'ANTHROPIC_API_KEY não configurada no Supabase' }, 500);
  }
  const model = Deno.env.get('ANTHROPIC_MODEL') ?? DEFAULT_MODEL;

  // === Sessão 28.68 — security gate (H-1) ===
  // Identifica o user.id via JWT pra aplicar rate-limit por usuário.
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return json({ error: 'unauthorized' }, 401);
  }
  let userId: string;
  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: u, error: uErr } = await userClient.auth.getUser();
    if (uErr || !u?.user) return json({ error: 'unauthorized' }, 401);
    userId = u.user.id;
  } catch {
    return json({ error: 'unauthorized' }, 401);
  }

  const rl = checkRateLimit(userId);
  if (!rl.allowed) {
    const retryAfterSec = Math.max(1, Math.ceil(((rl.resetAt ?? Date.now()) - Date.now()) / 1000));
    return new Response(
      JSON.stringify({ error: 'rate_limited', detail: `Limite de ${MAX_REQUESTS_PER_HOUR} req/h atingido.`, reset_at: rl.resetAt }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': String(retryAfterSec),
          ...corsHeaders(),
        },
      },
    );
  }
  // === fim do security gate ===

  let payload: SuggestRequest;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }

  if (!payload?.produto_nome || typeof payload.cmv !== 'number' || payload.cmv < 0) {
    return json({ error: 'missing_fields', detail: 'produto_nome e cmv (>=0) são obrigatórios' }, 400);
  }

  // === Sessão 28.68 — payload size validation (H-1) ===
  if (typeof payload.produto_nome !== 'string' || payload.produto_nome.length > MAX_PRODUTO_NOME_LEN) {
    return json({ error: 'payload_too_large', detail: `produto_nome > ${MAX_PRODUTO_NOME_LEN} chars` }, 400);
  }
  if (payload.cmv > MAX_CMV) {
    return json({ error: 'payload_invalid', detail: `cmv > ${MAX_CMV}` }, 400);
  }
  if (typeof payload.categoria === 'string' && payload.categoria.length > MAX_CATEGORIA_LEN) {
    payload.categoria = payload.categoria.slice(0, MAX_CATEGORIA_LEN);
  }
  if (typeof payload.observacoes === 'string' && payload.observacoes.length > MAX_OBSERVACOES_LEN) {
    return json({ error: 'payload_too_large', detail: `observacoes > ${MAX_OBSERVACOES_LEN} chars` }, 400);
  }
  if (Array.isArray(payload.historico) && payload.historico.length > MAX_HISTORICO_ITEMS) {
    payload.historico = payload.historico.slice(0, MAX_HISTORICO_ITEMS);
  }
  // === fim payload validation ===

  const prompt = buildPrompt(payload);

  let claudeResp: Response;
  try {
    claudeResp = await fetch(ANTHROPIC_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        temperature: 0.4,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    });
  } catch (e) {
    return json({ error: 'upstream_unreachable', detail: String(e?.message ?? e) }, 502);
  }

  if (!claudeResp.ok) {
    const text = await claudeResp.text();
    return json({ error: 'upstream_error', status: claudeResp.status, detail: text.slice(0, 500) }, 502);
  }

  const claudeData = await claudeResp.json();
  const text = extractText(claudeData);
  const parsed = safeParseJson(text);

  if (!parsed) {
    return json({ error: 'invalid_model_output', raw: text.slice(0, 800) }, 502);
  }

  const normalized = normalize(parsed, payload);
  return json(normalized);
});

const SYSTEM_PROMPT = `Você é um especialista em precificação para pequenos negócios brasileiros (food service, comércio, varejo).
Devolva SEMPRE um JSON puro (sem markdown, sem prosa fora do JSON) com os campos:
{
  "preco_sugerido": number,
  "preco_psicologico": number,
  "faixa_recomendada": {"min": number, "max": number},
  "margem_resultante": number (0 a 1),
  "racional": string (3 a 5 frases curtas em português brasileiro),
  "alertas": [string]
}
Considere CMV, despesas fixas e variáveis (juntas formam o piso), margem alvo, preço médio de categoria (se houver) e psicologia de preço (terminações em ,90 ou ,99 conforme ticket). Nunca sugira preço abaixo do piso (CMV / (1 - despesas_var - despesas_fixas)).`;

function buildPrompt(p: SuggestRequest): string {
  const lines: string[] = [];
  lines.push(`Produto: ${p.produto_nome}`);
  if (p.categoria) lines.push(`Categoria: ${p.categoria}`);
  lines.push(`CMV (custo direto): R$ ${p.cmv.toFixed(2)}`);
  if (typeof p.margem_alvo === 'number') lines.push(`Margem alvo: ${(p.margem_alvo * 100).toFixed(1)}%`);
  if (typeof p.despesas_fixas_pct === 'number') lines.push(`Despesas fixas: ${(p.despesas_fixas_pct * 100).toFixed(1)}%`);
  if (typeof p.despesas_variaveis_pct === 'number') lines.push(`Despesas variáveis: ${(p.despesas_variaveis_pct * 100).toFixed(1)}%`);
  if (typeof p.preco_atual === 'number') lines.push(`Preço atual de venda: R$ ${p.preco_atual.toFixed(2)}`);
  if (typeof p.preco_medio_categoria === 'number') lines.push(`Preço médio na categoria: R$ ${p.preco_medio_categoria.toFixed(2)}`);
  if (Array.isArray(p.historico) && p.historico.length) {
    lines.push('Histórico recente:');
    p.historico.slice(0, 5).forEach((h) => {
      lines.push(`  - ${h.data}: R$ ${h.preco.toFixed(2)}${typeof h.vendas === 'number' ? ` (${h.vendas} vendas)` : ''}`);
    });
  }
  if (p.observacoes) lines.push(`Observações do usuário: ${p.observacoes}`);
  lines.push('');
  lines.push('Sugira o preço de venda ideal e devolva APENAS o JSON especificado.');
  return lines.join('\n');
}

function extractText(claudeData: any): string {
  if (Array.isArray(claudeData?.content)) {
    return claudeData.content
      .filter((c: any) => c?.type === 'text')
      .map((c: any) => c.text)
      .join('\n');
  }
  return '';
}

function safeParseJson(text: string): any | null {
  if (!text) return null;
  // tenta parse direto
  try { return JSON.parse(text); } catch { /* tenta extrair bloco */ }
  // tenta extrair primeiro objeto JSON do texto
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try { return JSON.parse(match[0]); } catch { return null; }
}

function normalize(raw: any, req: SuggestRequest): SuggestResponse {
  const piso = computePiso(req);
  let preco_sugerido = num(raw.preco_sugerido, piso * 1.15);
  if (preco_sugerido < piso) preco_sugerido = piso;

  let preco_psicologico = num(raw.preco_psicologico, psyco(preco_sugerido));

  const faixa = raw.faixa_recomendada ?? {};
  const min = num(faixa.min, Math.max(piso, preco_sugerido * 0.92));
  const max = num(faixa.max, preco_sugerido * 1.12);

  const margem_resultante = req.cmv > 0 && preco_sugerido > 0
    ? clamp((preco_sugerido - req.cmv) / preco_sugerido, 0, 1)
    : num(raw.margem_resultante, 0);

  const racional = typeof raw.racional === 'string' ? raw.racional.slice(0, 1200) : '';
  const alertas = Array.isArray(raw.alertas)
    ? raw.alertas.filter((s: any) => typeof s === 'string').slice(0, 6)
    : [];

  return {
    preco_sugerido: round2(preco_sugerido),
    preco_psicologico: round2(preco_psicologico),
    faixa_recomendada: { min: round2(min), max: round2(max) },
    margem_resultante: round2(margem_resultante),
    racional,
    alertas,
  };
}

function computePiso(p: SuggestRequest): number {
  const dv = clamp(p.despesas_variaveis_pct ?? 0, 0, 0.95);
  const df = clamp(p.despesas_fixas_pct ?? 0, 0, 0.95);
  const denom = Math.max(0.05, 1 - dv - df);
  return p.cmv / denom;
}

function psyco(v: number): number {
  if (v < 10) return Math.floor(v) + 0.90;
  if (v < 100) return Math.floor(v) + 0.90;
  return Math.floor(v / 10) * 10 + 9.90;
}

function num(v: any, fallback: number): number {
  const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function clamp(n: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, n)); }
function round2(n: number) { return Math.round(n * 100) / 100; }

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };
}
