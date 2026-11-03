// Compra (Purchase) para o Meta pela Conversions API.
// Usado pelo asaas-webhook (cada pagamento) e pelo asaas-admin (reenvio).

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Avisa o Meta (Conversions API) de uma compra, para o anúncio saber quem pagou.
// O Pix confirma fora da página, então o Pixel do navegador nunca vê a compra:
// este é o único caminho. Melhor esforço — nunca atrasa nem derruba a concessão.
// Só envia para quem aceitou os cookies de medição (consentimento gravado no
// cadastro em user_metadata.attribution).
// Secrets: META_PIXEL_ID e META_CAPI_TOKEN. Sem eles, não faz nada.
export async function sendMetaPurchase(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  args: { userId: string; paymentId: string; value: number; plano: string; ciclo: string; eventTime?: number },
): Promise<string> {
  const pixelId = (Deno.env.get('META_PIXEL_ID') || '').trim();
  const token = (Deno.env.get('META_CAPI_TOKEN') || '').trim();
  if (!pixelId || !token) return 'sem_configuracao';
  try {
    const { data, error } = await supabase.auth.admin.getUserById(args.userId);
    if (error || !data?.user) return 'sem_usuario';
    const attribution = data.user.user_metadata?.attribution;
    if (!attribution || attribution.consent !== 'granted') return 'sem_consentimento';

    const userData: Record<string, unknown> = { external_id: [await sha256Hex(args.userId)] };
    const email = (data.user.email || '').trim().toLowerCase();
    if (email) userData.em = [await sha256Hex(email)];
    if (typeof attribution.fbc === 'string') userData.fbc = attribution.fbc;
    if (typeof attribution.fbp === 'string') userData.fbp = attribution.fbp;

    const version = (Deno.env.get('META_GRAPH_VERSION') || 'v23.0').trim();
    const res = await fetch(`https://graph.facebook.com/${version}/${pixelId}/events`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        data: [{
          event_name: 'Purchase',
          // eventTime: reenvio de uma compra antiga (o Meta aceita até 7 dias).
          event_time: args.eventTime ?? Math.floor(Date.now() / 1000),
          event_id: args.paymentId, // um pagamento = um evento (Meta deduplica)
          action_source: 'website',
          event_source_url: 'https://app.precificaiapp.com/',
          user_data: userData,
          custom_data: {
            currency: 'BRL',
            value: args.value,
            content_name: `${args.plano}_${args.ciclo}`,
          },
        }],
      }),
    });
    if (!res.ok) {
      console.warn('[asaas-webhook] Meta CAPI recusou Purchase:', res.status, (await res.text().catch(() => '')).slice(0, 300));
      return `recusado_${res.status}`;
    }
    return 'enviado';
  } catch (e) {
    console.warn('[asaas-webhook] Meta CAPI falhou (ignorado):', e instanceof Error ? e.message : e);
    return 'falhou';
  }
}
