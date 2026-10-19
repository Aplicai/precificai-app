// email-ciclo-vida — e-mails de 1 e 3 dias após o cadastro, campanhas avulsas
// (reativação) e descadastro.
//
// Quem recebe e em que etapa a pessoa parou vêm do banco
// (public.email_candidatos / public.email_estagio, migration 20261014200000).
// Cada e-mail fala da etapa em que a pessoa travou: perfil vazio, nenhum
// ingrediente, kit com preço zerado, produto sem preço…
//
// Chamadas (POST, header x-cron-secret = EMAIL_CRON_SECRET):
//   { automatico: true }                         → d1 + d3 (o pg_cron chama de hora em hora;
//                                                   só envia entre 8h e 20h de Brasília)
//   { campanha: 'reativacao-2026-10' }           → simulação: lista quem receberia (não envia)
//   { campanha: '…', enviar: true, limite: 50 }  → envia de verdade
//   + desde / ate (ISO, opcionais)               → quem se cadastrou no período, em vez da janela da campanha
//   { teste: { para, campanha, estagio, plano, negocio } } → uma amostra para `para`, sem registrar
// Descadastro (público): GET/POST ?sair=<uid>.<assinatura>  (link do rodapé e List-Unsubscribe)
//
// Secrets: RESEND_API_KEY, EMAIL_CRON_SECRET, EMAIL_OPTOUT_SECRET (+ SUPABASE_URL / SERVICE_ROLE do runtime).

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { APP, esc } from './layout.ts';
import { montarEmail } from './legado.ts';
import { FROM_SIMPLES, montarSimples, versaoAB } from './simples.ts';
import { escolher, montarRegua } from './regua.ts';
import type { Candidato, Dados } from './regua.ts';

const FROM = 'Precificaí <noreply@precificaiapp.com>';
const REPLY_TO = 'contato@precificaiapp.com';
const FUNC_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-ciclo-vida`;

// ---------- descadastro ----------

async function hmac(segredo: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function linkSair(uid: string): Promise<string> {
  const sig = await hmac(Deno.env.get('EMAIL_OPTOUT_SECRET') || '', uid);
  return `${FUNC_URL}?sair=${uid}.${sig}`;
}

function pagina(titulo: string, texto: string, status = 200): Response {
  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(titulo)}</title></head>
<body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#f5f5f5;margin:0;padding:40px 16px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border-radius:12px;padding:28px;text-align:center;">
<h1 style="color:#004D47;font-size:22px;margin:0 0 12px;">${esc(titulo)}</h1><p style="color:#4a4a4a;font-size:15px;line-height:1.5;margin:0;">${esc(texto)}</p>
<p style="margin:20px 0 0;"><a href="${APP}" style="color:#004D47;">Abrir o Precificaí</a></p></div></body></html>`;
  return new Response(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

// ---------- envio ----------

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function enviarResend(para: string, email: { assunto: string; html: string; texto: string }, sair: string, campanha: string, from = FROM) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [para],
      reply_to: REPLY_TO,
      subject: email.assunto,
      html: email.html,
      text: email.texto,
      headers: { 'List-Unsubscribe': `<${sair}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      tags: [{ name: 'campanha', value: campanha.replace(/[^a-zA-Z0-9_-]/g, '_') }],
    }),
  });
  const corpo = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend ${res.status}: ${JSON.stringify(corpo).slice(0, 200)}`);
  return corpo?.id as string | undefined;
}

function horaBrasilia(): number {
  return Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: 'America/Sao_Paulo' }).format(new Date()));
}

function diaUtilBrasilia(): boolean {
  const d = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date());
  return d !== 'Sat' && d !== 'Sun';
}

// ---------- webhook do Resend (clique, devolução, spam) ----------
// Assinatura Svix: HMAC-SHA256 de "id.timestamp.corpo" com o segredo whsec_… (base64).

async function assinaturaResendOk(req: Request, corpo: string): Promise<boolean> {
  // Resend (Svix) manda svix-* ou o padrão Standard Webhooks webhook-*: mesma assinatura.
  const h = (k: string) => req.headers.get(`svix-${k}`) ?? req.headers.get(`webhook-${k}`);
  const id = h('id');
  const ts = h('timestamp');
  const sigs = h('signature');
  const segredo = Deno.env.get('RESEND_WEBHOOK_SECRET') || '';
  if (!id || !ts || !sigs || !segredo.startsWith('whsec_')) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // 5 min: barra reenvio de evento antigo
  const chave = Uint8Array.from(atob(segredo.slice(6)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', chave, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${corpo}`));
  const esperado = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return sigs.split(' ').some((s) => s.split(',')[1] === esperado);
}

// deno-lint-ignore no-explicit-any
async function eventoResend(supabase: any, req: Request): Promise<Response> {
  const corpo = await req.text();
  if (!(await assinaturaResendOk(req, corpo))) return new Response('assinatura inválida', { status: 401 });
  const ev = JSON.parse(corpo || '{}');
  const tipo = String(ev?.type || '').replace(/^email\./, '');
  const resendId = ev?.data?.email_id;
  if (!resendId || !['clicked', 'opened', 'bounced', 'complained', 'delivered'].includes(tipo)) {
    return new Response(JSON.stringify({ ok: true, ignorado: tipo }));
  }
  const { data: envio } = await supabase.from('email_envios').select('user_id').eq('resend_id', resendId).maybeSingle();
  const { error } = await supabase.from('email_eventos')
    .upsert({ resend_id: resendId, tipo, user_id: envio?.user_id ?? null }, { onConflict: 'resend_id,tipo', ignoreDuplicates: true });
  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 }); // Resend reenvia
  // Spam ou e-mail que volta: sai da lista na hora (protege o domínio).
  if (envio?.user_id && (tipo === 'bounced' || tipo === 'complained')) {
    await supabase.from('email_optout').upsert({ user_id: envio.user_id }, { onConflict: 'user_id' });
  }
  return new Response(JSON.stringify({ ok: true }));
}

// ---------- régua semanal ----------

const REGUA_TETO = 150;

// deno-lint-ignore no-explicit-any
async function rodarRegua(supabase: any, enviar: boolean, limite: number) {
  const relatorio: Record<string, unknown>[] = [];
  const { data: candidatos, error } = await supabase.rpc('email_regua_candidatos', {});
  // Erro de leitura: não envia nada (nunca tratar "não consegui ler" como "pode mandar").
  if (error) return { erro: error.message, relatorio };
  const lista = (candidatos || []) as (Candidato & { user_id: string; email: string })[];
  const alertas: string[] = [];
  if (lista.length > limite) alertas.push(`${lista.length} pessoas na régua hoje; teto de ${limite} atingido`);
  let falhasSeguidas = 0;
  for (const c of lista.slice(0, limite)) {
    const { data: dados, error: errDados } = await supabase.rpc('email_dados', { uid: c.user_id });
    if (errDados || !dados) { relatorio.push({ email: c.email, estagio: c.estagio, pulado: 'erro ao ler dados' }); continue; }
    const escolha = escolher(c, dados as Dados);
    if (!escolha) { relatorio.push({ email: c.email, estagio: c.estagio, pulado: 'sem tema novo' }); continue; }
    const linha = { email: c.email, estagio: c.estagio, fase: c.fase, tema: escolha.tema.id, formato: escolha.variante.formato };
    if (!enviar) { relatorio.push(linha); continue; }

    const sairLink = await linkSair(c.user_id);
    const email = montarRegua(escolha, dados as Dados, c.estagio, sairLink);
    // Reserva antes de enviar: unique (user_id, campanha) e 1 por pessoa por dia.
    const { data: reserva, error: errReserva } = await supabase
      .from('email_envios')
      .insert({
        user_id: c.user_id, campanha: escolha.campanha, estagio: c.estagio, tema: escolha.tema.id,
        formato: escolha.variante.formato, padrao: escolha.variante.padrao, fase: c.fase,
      })
      .select('id')
      .maybeSingle();
    if (errReserva || !reserva) { relatorio.push({ ...linha, pulado: 'já enviado' }); continue; }
    try {
      const id = await enviarResend(c.email, email, sairLink, escolha.campanha);
      await supabase.from('email_envios').update({ resend_id: id ?? null }).eq('id', reserva.id);
      relatorio.push({ ...linha, enviado: true });
      falhasSeguidas = 0;
    } catch (e) {
      await supabase.from('email_envios').delete().eq('id', reserva.id);
      relatorio.push({ ...linha, erro: String(e).slice(0, 200) });
      if (++falhasSeguidas >= 3) { alertas.push('3 falhas seguidas no Resend: envio do dia interrompido'); break; }
    }
    await espera(600);
  }
  return { relatorio, alertas };
}

serve(async (req) => {
  const url = new URL(req.url);
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Descadastro: público, protegido pela assinatura do link.
  const sair = url.searchParams.get('sair');
  if (sair) {
    const [uid, sig] = sair.split('.');
    const ok = uid && sig && /^[0-9a-f-]{36}$/i.test(uid) && sig === (await hmac(Deno.env.get('EMAIL_OPTOUT_SECRET') || '', uid));
    if (!ok) return pagina('Link inválido', 'Não conseguimos confirmar este link. Escreva para contato@precificaiapp.com que tiramos você da lista.', 400);
    const { error } = await supabase.from('email_optout').upsert({ user_id: uid }, { onConflict: 'user_id' });
    if (error) return pagina('Algo deu errado', 'Tente de novo em instantes ou escreva para contato@precificaiapp.com.', 500);
    return pagina('Pronto', 'Você não vai mais receber nossos e-mails de dicas e novidades. Os e-mails sobre a sua conta continuam.');
  }

  if (req.method !== 'POST') return new Response('Not found', { status: 404 });
  if (req.headers.get('svix-id') || req.headers.get('webhook-id')) return eventoResend(supabase, req);
  if (req.headers.get('x-cron-secret') !== Deno.env.get('EMAIL_CRON_SECRET')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Amostra para conferir o visual, sem registrar envio.
  if (body?.teste?.para) {
    const t = body.teste;
    const montar = t.simples ? montarSimples : montarEmail;
    const email = montar({
      campanha: t.campanha || 'd1', estagio: t.estagio || 'sem_ingrediente', plano: t.plano || 'free',
      negocio: t.negocio || null, linkSair: `${APP}#exemplo-descadastro`,
    });
    if (!email) return new Response(JSON.stringify({ ok: true, enviado: false, motivo: 'combinação sem e-mail' }));
    const id = await enviarResend(t.para, { ...email, assunto: `[Teste] ${email.assunto}` }, `${APP}#exemplo-descadastro`, 'teste', t.simples ? FROM_SIMPLES : FROM);
    return new Response(JSON.stringify({ ok: true, enviado: true, id, assunto: email.assunto }));
  }

  // Régua à mão: { regua: true } simula; + enviar: true envia (mesmo com a chave desligada).
  if (body?.regua === true) {
    const r = await rodarRegua(supabase, body?.enviar === true, Math.max(1, Math.min(Number(body?.limite) || REGUA_TETO, REGUA_TETO)));
    return new Response(JSON.stringify({ ok: true, enviar: body?.enviar === true, ...r }), { headers: { 'Content-Type': 'application/json' } });
  }

  const automatico = body?.automatico === true;
  if (automatico) {
    const h = horaBrasilia();
    if (h < 8 || h >= 20) return new Response(JSON.stringify({ ok: true, pulado: 'fora do horário', hora: h }));
  }
  const campanhas: string[] = automatico ? ['d1', 'd3'] : [String(body?.campanha || '')].filter(Boolean);
  if (!campanhas.length) return new Response(JSON.stringify({ ok: false, error: 'campanha ausente' }), { status: 400 });
  const enviar = automatico || body?.enviar === true;
  const limite = Math.max(1, Math.min(Number(body?.limite) || 60, 200));

  const relatorio: Record<string, unknown>[] = [];
  for (const campanha of campanhas) {
    // `desde` / `ate` (ISO): troca a janela da campanha pelo período de cadastro.
    const periodo = automatico ? {} : {
      ...(body?.desde ? { p_desde: String(body.desde) } : {}),
      ...(body?.ate ? { p_ate: String(body.ate) } : {}),
    };
    const { data: candidatos, error } = await supabase.rpc('email_candidatos', { p_campanha: campanha, ...periodo });
    if (error) {
      relatorio.push({ campanha, erro: error.message });
      continue;
    }
    for (const c of (candidatos || []).slice(0, limite)) {
      const sairLink = await linkSair(c.user_id);
      // Teste A/B (19/10): d1/d3 em duas versões, fixas por pessoa; campanhas avulsas seguem no layout.
      const versao = campanha === 'd1' || campanha === 'd3' ? versaoAB(c.user_id) : null;
      const pedido = { campanha, estagio: c.estagio, plano: c.plano, negocio: c.negocio, linkSair: sairLink };
      const email = versao === 'simples' ? montarSimples(pedido) : montarEmail(pedido);
      if (!email) { relatorio.push({ campanha, email: c.email, estagio: c.estagio, pulado: 'nada a enviar' }); continue; }
      if (!enviar) { relatorio.push({ campanha, email: c.email, estagio: c.estagio, plano: c.plano, assunto: email.assunto }); continue; }

      // Reserva antes de enviar: a unique (user_id, campanha) impede envio duplo
      // se duas execuções se cruzarem. Falhou o envio → libera a reserva.
      const { data: reserva, error: errReserva } = await supabase
        .from('email_envios')
        .insert({ user_id: c.user_id, campanha, estagio: c.estagio, formato: versao })
        .select('id')
        .maybeSingle();
      if (errReserva || !reserva) { relatorio.push({ campanha, email: c.email, pulado: 'já enviado' }); continue; }
      try {
        const id = await enviarResend(c.email, email, sairLink, campanha, versao === 'simples' ? FROM_SIMPLES : FROM);
        await supabase.from('email_envios').update({ resend_id: id ?? null }).eq('id', reserva.id);
        relatorio.push({ campanha, email: c.email, estagio: c.estagio, enviado: true });
      } catch (e) {
        await supabase.from('email_envios').delete().eq('id', reserva.id);
        relatorio.push({ campanha, email: c.email, erro: String(e).slice(0, 200) });
      }
      await espera(600); // Resend: 2 envios por segundo
    }
  }

  // Régua: 1 vez por dia, às 10h de Brasília, em dia útil, só com a chave ligada.
  let regua: unknown = null;
  if (automatico && horaBrasilia() === 10 && diaUtilBrasilia()) {
    const { data: cfg, error: errCfg } = await supabase.from('email_config').select('valor').eq('chave', 'regua_ativa').maybeSingle();
    regua = errCfg ? { erro: errCfg.message } : cfg?.valor === true ? await rodarRegua(supabase, true, REGUA_TETO) : { pulado: 'régua desligada' };
  }
  return new Response(JSON.stringify({ ok: true, enviar, relatorio, regua }), { headers: { 'Content-Type': 'application/json' } });
});
