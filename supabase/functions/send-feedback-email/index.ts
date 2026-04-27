// Sessão 28.7 — Edge Function: envia email com a sugestão do usuário
// para o email configurado em FEEDBACK_TO_EMAIL via Resend.
//
// ENV vars necessárias (configurar no Supabase Dashboard → Functions → Secrets):
//   RESEND_API_KEY     — chave da API Resend (https://resend.com)
//   FEEDBACK_TO_EMAIL  — email destino (ex: suporte@precificaiapp.com)
//   FEEDBACK_FROM_EMAIL — remetente verificado no Resend
//
// Se RESEND_API_KEY não estiver setada, a function APENAS confirma que recebeu
// (a sugestão já foi salva na tabela `feedback` pelo client). Nunca falha o
// fluxo do user — o email é "best effort".
//
// Deploy: `supabase functions deploy send-feedback-email`

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface FeedbackPayload {
  mensagem: string;
  user_email?: string;
  nome_negocio?: string;
  segmento?: string;
  app_versao?: string;
  plataforma?: string;
}

function escapeHtml(s: string): string {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const payload = (await req.json()) as FeedbackPayload;
    if (!payload?.mensagem || typeof payload.mensagem !== 'string') {
      return new Response(JSON.stringify({ error: 'mensagem é obrigatória' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const apiKey = Deno.env.get('RESEND_API_KEY');
    const toEmail = Deno.env.get('FEEDBACK_TO_EMAIL') || 'suporte@precificaiapp.com';
    const fromEmail = Deno.env.get('FEEDBACK_FROM_EMAIL') || 'Precificaí <noreply@precificaiapp.com>';

    if (!apiKey) {
      // Sem API key — feedback só ficou na tabela. Retorna sucesso "soft".
      return new Response(JSON.stringify({ ok: true, emailSent: false, reason: 'RESEND_API_KEY not configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userEmail = payload.user_email || 'anônimo';
    const nomeNegocio = payload.nome_negocio || '(sem nome de negócio)';
    const segmento = payload.segmento || '';
    const appVersao = payload.app_versao || '';
    const plataforma = payload.plataforma || '';

    const subject = `[Precificaí] Sugestão de ${nomeNegocio}`;
    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #004d47;">Nova sugestão recebida</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 16px;">
          <tr><td style="padding: 6px 0; color: #6b7280;">De:</td><td style="padding: 6px 0;"><b>${escapeHtml(userEmail)}</b></td></tr>
          <tr><td style="padding: 6px 0; color: #6b7280;">Negócio:</td><td style="padding: 6px 0;">${escapeHtml(nomeNegocio)}</td></tr>
          ${segmento ? `<tr><td style="padding: 6px 0; color: #6b7280;">Segmento:</td><td style="padding: 6px 0;">${escapeHtml(segmento)}</td></tr>` : ''}
          ${plataforma ? `<tr><td style="padding: 6px 0; color: #6b7280;">Plataforma:</td><td style="padding: 6px 0;">${escapeHtml(plataforma)}</td></tr>` : ''}
          ${appVersao ? `<tr><td style="padding: 6px 0; color: #6b7280;">Versão:</td><td style="padding: 6px 0;">${escapeHtml(appVersao)}</td></tr>` : ''}
        </table>
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px; border-left: 4px solid #004d47;">
          <div style="white-space: pre-wrap; color: #111827; line-height: 1.5;">${escapeHtml(payload.mensagem)}</div>
        </div>
        <p style="margin-top: 24px; font-size: 12px; color: #9ca3af;">
          Enviado pela Central de Suporte do app Precificaí.
        </p>
      </div>
    `;

    const text = `Nova sugestão recebida

De: ${userEmail}
Negócio: ${nomeNegocio}
${segmento ? `Segmento: ${segmento}\n` : ''}${plataforma ? `Plataforma: ${plataforma}\n` : ''}${appVersao ? `Versão: ${appVersao}\n` : ''}
---
${payload.mensagem}
---
Enviado pela Central de Suporte do app Precificaí.`;

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        reply_to: payload.user_email || undefined,
        subject,
        html,
        text,
      }),
    });

    if (!resendRes.ok) {
      const errBody = await resendRes.text();
      console.error('[send-feedback-email] Resend error:', resendRes.status, errBody);
      // Não falha o user — feedback já foi salvo na tabela.
      return new Response(JSON.stringify({ ok: true, emailSent: false, resendStatus: resendRes.status }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await resendRes.json();
    return new Response(JSON.stringify({ ok: true, emailSent: true, id: data.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    console.error('[send-feedback-email]', e);
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
