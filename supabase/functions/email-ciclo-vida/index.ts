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
//   { teste: { para, campanha, estagio, plano, negocio } } → uma amostra para `para`, sem registrar
// Descadastro (público): GET/POST ?sair=<uid>.<assinatura>  (link do rodapé e List-Unsubscribe)
//
// Secrets: RESEND_API_KEY, EMAIL_CRON_SECRET, EMAIL_OPTOUT_SECRET (+ SUPABASE_URL / SERVICE_ROLE do runtime).

import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const APP = 'https://app.precificaiapp.com/';
const VIDEO = 'https://youtu.be/qG2BFhvEFkU';
const FROM = 'Precificaí <noreply@precificaiapp.com>';
const REPLY_TO = 'contato@precificaiapp.com';
const FUNC_URL = `${Deno.env.get('SUPABASE_URL')}/functions/v1/email-ciclo-vida`;

type Estagio = 'sem_perfil' | 'sem_ingrediente' | 'kit_sem_preco' | 'sem_produto' | 'produto_sem_preco' | 'ativo';

interface Bloco {
  assunto: string;
  titulo: string;
  paragrafos: string[];
  lista?: string[];
  cta: string;
  video?: { t: number; texto: string };
}

const ETAPAS: Record<Estagio, Bloco> = {
  sem_perfil: {
    assunto: 'Falta 1 minuto para começar no Precificaí',
    titulo: 'Falta 1 minuto para começar',
    paragrafos: [
      'Você criou sua conta no Precificaí, mas parou antes de contar o nome do seu negócio.',
      'É rápido: nome e segmento, e o app já abre pronto para você.',
    ],
    cta: 'Continuar de onde parei',
    video: { t: 17, texto: 'Veja como é o primeiro acesso' },
  },
  sem_ingrediente: {
    assunto: 'Seu primeiro preço começa com 1 ingrediente',
    titulo: 'Seu primeiro preço começa com 1 ingrediente',
    paragrafos: [
      'Cadastre um ingrediente do jeito que você compra, por exemplo: "Comprei 5 kg de farinha por R$ 25".',
      'O Precificaí calcula sozinho quanto custa cada grama.',
    ],
    cta: 'Cadastrar meu primeiro ingrediente',
    video: { t: 173, texto: 'Veja como cadastrar (1 min)' },
  },
  kit_sem_preco: {
    assunto: 'Seus ingredientes estão com preço zerado',
    titulo: 'Seus ingredientes estão com preço zerado',
    paragrafos: [
      'O Kit de Início trouxe os ingredientes do seu segmento, mas sem preço: cada fornecedor cobra um valor.',
      'Coloque o preço que você paga em 3 ou 4 ingredientes do seu produto mais vendido e o preço sugerido aparece.',
    ],
    cta: 'Colocar meus preços',
    video: { t: 173, texto: 'Veja como colocar o preço (1 min)' },
  },
  sem_produto: {
    assunto: 'Falta pouco: monte seu primeiro produto',
    titulo: 'Agora é só montar seu primeiro produto',
    paragrafos: [
      'Seus ingredientes já têm preço. Monte um produto, diga quanto a receita rende e veja o custo e o preço sugerido.',
      'Se não quiser digitar o preço, é só salvar: usamos o sugerido.',
    ],
    cta: 'Montar meu produto',
    video: { t: 211, texto: 'Veja como montar o produto (1 min)' },
  },
  produto_sem_preco: {
    assunto: 'Seu produto ainda está sem preço',
    titulo: 'Seus produtos ainda estão sem preço',
    paragrafos: [
      'Abra um produto e toque em "Usar sugerido" para ver o preço certo.',
      'Se o sugerido aparecer zerado, é porque os ingredientes ainda estão sem o preço que você paga. Ajuste alguns e ele aparece.',
    ],
    cta: 'Ver meus produtos',
    video: { t: 211, texto: 'Veja o preço sugerido na prática' },
  },
  ativo: {
    assunto: 'Seu primeiro preço está pronto. E agora?',
    titulo: 'Seu primeiro preço está pronto. E agora?',
    paragrafos: ['Três passos para o preço ficar ainda mais certo:'],
    lista: [
      'Informe os custos do mês no Financeiro (aluguel, luz, salários).',
      'Cadastre os produtos que você mais vende.',
      'Veja no Delivery quanto cobrar no iFood sem perder lucro.',
    ],
    cta: 'Abrir o Precificaí',
    video: { t: 265, texto: 'Veja os próximos passos' },
  },
};

const PRO: Bloco = {
  assunto: 'Quanto cobrar no iFood? O Pro calcula para você',
  titulo: 'Tudo liberado por R$ 29,90 por mês',
  paragrafos: [
    'Você já está precificando. No plano Pro você tem:',
  ],
  lista: [
    'Produtos e combos ilimitados.',
    'Delivery: o preço certo para cada aplicativo, com a comissão de cada um.',
    'Lista de Compras, Relatórios e fichas técnicas em PDF.',
  ],
  cta: 'Ver o Pro com os meus dados',
};

const NOVIDADES = [
  'Cadastro de ingrediente em uma frase: "Comprei 5 kg por R$ 25".',
  'Financeiro em 2 perguntas: quanto você quer ganhar e quanto vende por mês.',
  'Preço sugerido com um toque, sem precisar digitar.',
  'Um vídeo de 5 minutos do primeiro acesso ao primeiro preço.',
];

// ---------- montagem do e-mail ----------

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

interface Pedido { campanha: string; estagio: Estagio; plano: string; negocio?: string | null; linkSair: string }

/** Devolve null quando a pessoa não deve receber esta campanha nesta etapa. */
export function montarEmail(p: Pedido): { assunto: string; html: string; texto: string } | null {
  const pago = p.plano !== 'free';
  let bloco: Bloco = ETAPAS[p.estagio] ?? ETAPAS.sem_perfil;
  let intro: string | null = null;
  let novidades: string[] | null = null;
  let assunto = bloco.assunto;

  if (p.campanha === 'd3') {
    if (p.estagio === 'ativo') {
      if (pago) return null; // já assina: nada a vender no 3º dia
      bloco = PRO;
      assunto = PRO.assunto;
    } else {
      intro = 'Faltou pouco para o seu primeiro preço. Dá para terminar em poucos minutos:';
      assunto = 'Faltou pouco para o seu primeiro preço';
    }
  } else if (p.campanha !== 'd1') {
    intro = 'O Precificaí mudou bastante desde que você entrou:';
    novidades = NOVIDADES;
    assunto = 'O Precificaí ficou mais fácil (e tem vídeo de 5 minutos)';
  }

  const utm = `utm_source=email&utm_medium=email&utm_campaign=${encodeURIComponent(p.campanha)}`;
  const link = `${APP}?${utm}`;
  const nome = (p.negocio || '').trim();
  const ola = nome ? `Olá, ${nome}!` : 'Olá!';

  const lista = (itens: string[]) =>
    `<ul style="margin:0 0 16px 0; padding-left:20px; color:#4a4a4a; font-size:15px; line-height:1.6;">${itens
      .map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;
  const par = (t: string) => `<p style="margin:0 0 14px 0; color:#4a4a4a; font-size:15px; line-height:1.5;">${esc(t)}</p>`;

  const corpo = [
    par(ola),
    intro ? par(intro) : '',
    novidades ? lista(novidades) : '',
    novidades ? `<h3 style="margin:8px 0 10px 0; color:#1a1a1a; font-size:17px;">${esc(bloco.titulo)}</h3>` : '',
    ...bloco.paragrafos.map(par),
    bloco.lista ? lista(bloco.lista) : '',
  ].join('');

  const videoHtml = bloco.video
    ? `<tr><td style="padding:0 32px 24px 32px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#e8f3f2; border-radius:8px;"><tr><td style="padding:14px 16px;">
        <a href="${VIDEO}?t=${bloco.video.t}" style="color:#004D47; font-size:14px; font-weight:600; text-decoration:underline;">&#9654; ${esc(bloco.video.texto)}</a>
      </td></tr></table></td></tr>`
    : '';

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${esc(assunto)}</title></head>
<body style="margin:0; padding:0; background-color:#f5f5f5; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f5f5f5; padding:24px 0;"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" border="0" style="max-width:560px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden;">
  <tr><td align="center" style="background-color:#004D47; padding:28px 24px;"><h1 style="margin:0; color:#ffffff; font-size:26px; font-weight:700;">Precificaí</h1></td></tr>
  <tr><td style="padding:28px 32px 4px 32px;">
    ${novidades ? '' : `<h2 style="margin:0 0 16px 0; color:#1a1a1a; font-size:21px; font-weight:700; line-height:1.3;">${esc(bloco.titulo)}</h2>`}
    ${corpo}
  </td></tr>
  <tr><td align="center" style="padding:4px 32px 24px 32px;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" style="background-color:#004D47; border-radius:8px;">
      <a href="${link}" style="display:inline-block; padding:14px 30px; color:#ffffff; font-size:16px; font-weight:600; text-decoration:none; border-radius:8px;">${esc(bloco.cta)}</a>
    </td></tr></table>
  </td></tr>
  ${videoHtml}
  <tr><td style="background-color:#fafafa; padding:20px 32px; border-top:1px solid #eeeeee;" align="center">
    <p style="margin:0 0 8px 0; color:#8a8a8a; font-size:12px; line-height:1.5;">Dúvidas? Responda este e-mail.</p>
    <p style="margin:0 0 8px 0; color:#8a8a8a; font-size:12px; line-height:1.5;">Você recebe este e-mail porque tem conta no Precificaí. <a href="${p.linkSair}" style="color:#8a8a8a;">Não quero mais receber dicas</a></p>
    <p style="margin:0; color:#8a8a8a; font-size:11px; line-height:1.5;">APLICAI CONSULTORIA E TREINAMENTO LTDA &middot; CNPJ 53.054.196/0001-63</p>
  </td></tr>
</table></td></tr></table></body></html>`;

  const texto = [
    ola,
    intro ?? '',
    novidades ? novidades.map((n) => `- ${n}`).join('\n') : '',
    novidades ? bloco.titulo : '',
    ...bloco.paragrafos,
    bloco.lista ? bloco.lista.map((n) => `- ${n}`).join('\n') : '',
    `${bloco.cta}: ${link}`,
    bloco.video ? `${bloco.video.texto}: ${VIDEO}?t=${bloco.video.t}` : '',
    '',
    `Não quer mais receber dicas? ${p.linkSair}`,
  ].filter(Boolean).join('\n\n');

  return { assunto, html, texto };
}

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

async function enviarResend(para: string, email: { assunto: string; html: string; texto: string }, sair: string, campanha: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${Deno.env.get('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
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
  if (req.headers.get('x-cron-secret') !== Deno.env.get('EMAIL_CRON_SECRET')) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  // Amostra para conferir o visual, sem registrar envio.
  if (body?.teste?.para) {
    const t = body.teste;
    const email = montarEmail({
      campanha: t.campanha || 'd1', estagio: t.estagio || 'sem_ingrediente', plano: t.plano || 'free',
      negocio: t.negocio || null, linkSair: `${APP}#exemplo-descadastro`,
    });
    if (!email) return new Response(JSON.stringify({ ok: true, enviado: false, motivo: 'combinação sem e-mail' }));
    const id = await enviarResend(t.para, { ...email, assunto: `[Teste] ${email.assunto}` }, `${APP}#exemplo-descadastro`, 'teste');
    return new Response(JSON.stringify({ ok: true, enviado: true, id, assunto: email.assunto }));
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
    const { data: candidatos, error } = await supabase.rpc('email_candidatos', { p_campanha: campanha });
    if (error) {
      relatorio.push({ campanha, erro: error.message });
      continue;
    }
    for (const c of (candidatos || []).slice(0, limite)) {
      const sairLink = await linkSair(c.user_id);
      const email = montarEmail({ campanha, estagio: c.estagio, plano: c.plano, negocio: c.negocio, linkSair: sairLink });
      if (!email) { relatorio.push({ campanha, email: c.email, estagio: c.estagio, pulado: 'nada a enviar' }); continue; }
      if (!enviar) { relatorio.push({ campanha, email: c.email, estagio: c.estagio, plano: c.plano, assunto: email.assunto }); continue; }

      // Reserva antes de enviar: a unique (user_id, campanha) impede envio duplo
      // se duas execuções se cruzarem. Falhou o envio → libera a reserva.
      const { data: reserva, error: errReserva } = await supabase
        .from('email_envios')
        .insert({ user_id: c.user_id, campanha, estagio: c.estagio })
        .select('id')
        .maybeSingle();
      if (errReserva || !reserva) { relatorio.push({ campanha, email: c.email, pulado: 'já enviado' }); continue; }
      try {
        const id = await enviarResend(c.email, email, sairLink, campanha);
        await supabase.from('email_envios').update({ resend_id: id ?? null }).eq('id', reserva.id);
        relatorio.push({ campanha, email: c.email, estagio: c.estagio, enviado: true });
      } catch (e) {
        await supabase.from('email_envios').delete().eq('id', reserva.id);
        relatorio.push({ campanha, email: c.email, erro: String(e).slice(0, 200) });
      }
      await espera(600); // Resend: 2 envios por segundo
    }
  }
  return new Response(JSON.stringify({ ok: true, enviar, relatorio }), { headers: { 'Content-Type': 'application/json' } });
});
