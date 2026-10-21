// montar-receita — sugere os ingredientes da receita inteira de um produto
// que a biblioteca do app não conhece (21/10/2026). Desenho:
// .specs/plans/ia-monta-receita.design.md
//
// Regras:
//   - exige o JWT do usuário (auth.getUser; o gateway aceita a anon key);
//   - para o Google vai SÓ o nome do produto, o nicho e a porção. Nunca
//     nome, e-mail, telefone ou ID da pessoa (plano grátis do Gemini);
//   - limite: 10 por conta por dia e 800 por dia no projeto inteiro
//     (public.montar_receita_reservar, migration 20261021120000);
//   - 8 s no total, 1 nova tentativa em 5xx; qualquer falha devolve
//     { ok: false, error } e o app usa a lista do nicho (nunca trava);
//   - a resposta da IA é validada de novo no app (validarRespostaIA). A IA
//     não dá preço: os preços vêm da conta ou da base do app.
//
// Corpo: { produto: string, nicho?: string, porcao?: string }
// Respostas: { ok: true, receita: { porcao, rende, ingredientes[{nome,quantidade,unidade}], embalagem } }
//          | { ok: false, error: 'unauthorized' | 'produto' | 'limite' | 'ia' | 'erro' }
//
// Secrets: GEMINI_API_KEY (obrigatório), GEMINI_MODEL (opcional,
// padrão gemini-3.5-flash-lite), SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.
// Deploy: supabase functions deploy montar-receita --no-verify-jwt

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const MAX_POR_CONTA = 10;
const MAX_PROJETO = 800;
const PROJETO_ID = '00000000-0000-0000-0000-000000000000';
const PRAZO_MS = 8000;
const NICHOS = new Set(['confeitaria', 'salgados', 'marmitas', 'hamburgueria', 'pizzaria', 'padaria', 'acai_sorvete', 'bebidas']);
const NOME_NICHO: Record<string, string> = {
  confeitaria: 'confeitaria (doces e bolos)', salgados: 'salgados', marmitas: 'marmitas e refeições',
  hamburgueria: 'lanches e hambúrgueres', pizzaria: 'pizzaria', padaria: 'padaria', acai_sorvete: 'açaí e sorvetes', bebidas: 'bebidas',
};

const ALLOWED_ORIGINS = new Set<string>([
  'https://app.precificaiapp.com',
  'https://precificaiapp.com',
  'http://localhost:8081',
  'http://localhost:8084',
  'http://localhost:19006',
]);

function corsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://app.precificaiapp.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Vary': 'Origin',
  };
}

const json = (body: unknown, status: number, req: Request) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...corsHeaders(req) },
  });

/** Só letras, números, espaço e pontuação simples; 2 a 80 caracteres. */
function limparProduto(v: unknown): string | null {
  const t = String(v ?? '').replace(/[^\p{L}\p{N} ,.'&/()-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  return t.length >= 2 && t.length <= 80 ? t : null;
}

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    porcao: { type: 'STRING' },
    rende: { type: 'INTEGER' },
    ingredientes: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          nome: { type: 'STRING' },
          quantidade: { type: 'NUMBER' },
          unidade: { type: 'STRING', enum: ['g', 'ml', 'un'] },
        },
        required: ['nome', 'quantidade', 'unidade'],
      },
    },
    embalagem: { type: 'STRING' },
  },
  required: ['porcao', 'rende', 'ingredientes'],
};

function pedido(produto: string, nicho: string | null, porcao: string | null): string {
  return [
    `Pequeno negócio de comida no Brasil${nicho ? `, ramo de ${NOME_NICHO[nicho]}` : ''}.`,
    `Produto: "${produto}"${porcao ? `, vendido por ${porcao}` : ''}.`,
    'Liste os ingredientes da RECEITA INTEIRA, do jeito que a pessoa faz em casa para vender,',
    'com quantidade e unidade (g, ml ou un). Ovos em un. Líquidos em ml.',
    'Diga em "porcao" a unidade de venda no singular (fatia, pote, unidade, cento, marmita, lanche, pizza, copo)',
    'e em "rende" quantas porções a receita inteira faz. Em "embalagem", a embalagem de UMA porção (ou "nenhuma").',
    'Nomes simples de supermercado, em português do Brasil com acentos, sem marcas. No máximo 15 ingredientes. Não informe preços.',
  ].join(' ');
}

async function chamarGemini(texto: string, chave: string, modelo: string, sinal: AbortSignal): Promise<Response> {
  return await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent`, {
    method: 'POST',
    signal: sinal,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': chave },
    body: JSON.stringify({
      contents: [{ parts: [{ text: texto }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json', responseSchema: SCHEMA },
    }),
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) });
  if (req.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, req);

  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!jwt) return json({ ok: false, error: 'unauthorized' }, 401, req);

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: u, error: uErr } = await admin.auth.getUser(jwt);
  if (uErr || !u?.user) return json({ ok: false, error: 'unauthorized' }, 401, req);

  let corpo: Record<string, unknown> = {};
  try { corpo = await req.json(); } catch (_) { /* corpo vazio */ }
  const produto = limparProduto(corpo.produto);
  if (!produto) return json({ ok: false, error: 'produto' }, 400, req);
  const nicho = NICHOS.has(String(corpo.nicho)) ? String(corpo.nicho) : null;
  const porcao = limparProduto(corpo.porcao)?.slice(0, 20) ?? null;

  const chave = Deno.env.get('GEMINI_API_KEY');
  if (!chave) { console.error('[montar-receita] sem GEMINI_API_KEY'); return json({ ok: false, error: 'ia' }, 503, req); }
  const modelo = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';

  // Conta antes de chamar o Google: por pessoa e no projeto inteiro.
  const [conta, projeto] = await Promise.all([
    admin.rpc('montar_receita_reservar', { p_user_id: u.user.id, p_max: MAX_POR_CONTA }),
    admin.rpc('montar_receita_reservar', { p_user_id: PROJETO_ID, p_max: MAX_PROJETO }),
  ]);
  if (conta.error || projeto.error) {
    console.error('[montar-receita] limite', conta.error?.message ?? projeto.error?.message);
    return json({ ok: false, error: 'erro' }, 500, req);
  }
  if (conta.data !== true || projeto.data !== true) return json({ ok: false, error: 'limite' }, 429, req);

  const controle = new AbortController();
  const prazo = setTimeout(() => controle.abort(), PRAZO_MS);
  try {
    const texto = pedido(produto, nicho, porcao);
    let r = await chamarGemini(texto, chave, modelo, controle.signal);
    if (r.status >= 500) {
      await new Promise((ok) => setTimeout(ok, 600));
      r = await chamarGemini(texto, chave, modelo, controle.signal);
    }
    if (!r.ok) {
      console.error('[montar-receita] gemini', r.status);
      return json({ ok: false, error: r.status === 429 ? 'limite' : 'ia' }, r.status === 429 ? 429 : 502, req);
    }
    const d = await r.json();
    const parte = d?.candidates?.[0]?.content?.parts?.[0]?.text;
    let receita: unknown = null;
    try { receita = JSON.parse(String(parte ?? '')); } catch (_) { receita = null; }
    if (!receita || typeof receita !== 'object') return json({ ok: false, error: 'ia' }, 502, req);
    return json({ ok: true, receita }, 200, req);
  } catch (e) {
    console.error('[montar-receita]', (e as Error)?.name === 'AbortError' ? 'prazo' : (e as Error)?.message);
    return json({ ok: false, error: 'ia' }, 504, req);
  } finally {
    clearTimeout(prazo);
  }
});
