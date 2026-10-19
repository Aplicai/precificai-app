// meta-evento — regras puras (sem Deno/rede): validação do pedido e montagem do
// evento para a Conversions API do Meta. Roda no Node para os testes
// (__tests__/metaEvento.test.mjs) e no Deno pela função (index.ts).
//
// Regras (LGPD): só existe evento de servidor para quem ACEITOU os cookies no
// navegador. O servidor é um complemento do Pixel (navegador do Instagram,
// bloqueador, saída rápida), deduplicado pelo mesmo event_id.

/** Eventos aceitos. Cada um vale uma vez por conta. */
export const EVENTOS_PERMITIDOS = ['CompleteRegistration', 'PrimeiroPreco', 'Ativacao'] as const;
export type EventoMeta = typeof EVENTOS_PERMITIDOS[number];

/** Prefixo do event_id por evento: o mesmo id que o Pixel usa (`reg_<uid>` etc.). */
const PREFIXO_ID: Record<EventoMeta, string> = {
  CompleteRegistration: 'reg_',
  PrimeiroPreco: 'pp_',
  Ativacao: 'act_',
};

/** custom_data decidido pelo servidor (o cliente não escolhe valor nem moeda). */
const DADOS_PADRAO: Record<EventoMeta, Record<string, unknown>> = {
  CompleteRegistration: { value: 0, currency: 'BRL', content_name: 'conta_gratis' },
  PrimeiroPreco: { value: 0, currency: 'BRL', content_name: 'primeiro_preco' },
  Ativacao: { content_name: '3_produtos' },
};

/** No máximo 1 envio por conta + evento nesta janela (tabela meta_eventos_enviados). */
export const JANELA_REENVIO_MS = 24 * 60 * 60 * 1000;

const URL_PADRAO = 'https://app.precificaiapp.com/';
const ORIGENS_URL = ['https://app.precificaiapp.com/', 'https://precificaiapp.com/'];
// Formato dos cookies do Pixel: fb.<sub>.<timestamp>.<valor>
const RE_FB_COOKIE = /^fb\.\d\.\d{10,16}\.[A-Za-z0-9_.\-]{1,300}$/;
const RE_CONTENT_NAME = /^[a-z0-9_]{1,50}$/;

export function eventoPermitido(nome: unknown): nome is EventoMeta {
  return typeof nome === 'string' && (EVENTOS_PERMITIDOS as readonly string[]).includes(nome);
}

/** event_id esperado para a conta: o cliente não inventa ids (dedup com o Pixel). */
export function eventIdEsperado(nome: EventoMeta, userId: string): string {
  return `${PREFIXO_ID[nome]}${userId}`;
}

export function cookieFbValido(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 400 && RE_FB_COOKIE.test(v);
}

/** URL da página: só do próprio domínio, sem nada além de 500 caracteres. */
export function urlOrigem(v: unknown): string {
  if (typeof v !== 'string' || v.length > 500) return URL_PADRAO;
  return ORIGENS_URL.some((o) => v === o.slice(0, -1) || v.startsWith(o)) ? v : URL_PADRAO;
}

export interface PedidoValido {
  eventName: EventoMeta;
  eventId: string;
  fbp: string | null;
  fbc: string | null;
  eventSourceUrl: string;
  contentName: string | null;
}

export type ResultadoValidacao =
  | { ok: true; pedido: PedidoValido }
  | { ok: false; error: 'sem_consentimento' | 'evento_invalido' | 'event_id_invalido' };

/**
 * Valida o corpo do POST para a conta `userId`. Consentimento vem primeiro:
 * sem `consent: 'granted'`, nada é enviado, seja qual for o resto.
 */
export function validarPedido(body: unknown, userId: string): ResultadoValidacao {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (b.consent !== 'granted') return { ok: false, error: 'sem_consentimento' };
  const nome = b.event_name;
  if (!eventoPermitido(nome)) return { ok: false, error: 'evento_invalido' };
  const eventId = eventIdEsperado(nome, userId);
  if (!userId || b.event_id !== eventId) return { ok: false, error: 'event_id_invalido' };
  const cd = (b.custom_data && typeof b.custom_data === 'object' ? b.custom_data : {}) as Record<string, unknown>;
  return {
    ok: true,
    pedido: {
      eventName: nome,
      eventId,
      fbp: cookieFbValido(b.fbp) ? (b.fbp as string) : null,
      fbc: cookieFbValido(b.fbc) ? (b.fbc as string) : null,
      eventSourceUrl: urlOrigem(b.event_source_url),
      contentName: typeof cd.content_name === 'string' && RE_CONTENT_NAME.test(cd.content_name) ? (cd.content_name as string) : null,
    },
  };
}

/** custom_data final: padrão do evento; o cliente só pode trocar o content_name. */
export function dadosDoEvento(nome: EventoMeta, contentName: string | null = null): Record<string, unknown> {
  const base = { ...DADOS_PADRAO[nome] };
  if (contentName) base.content_name = contentName;
  return base;
}

/** E-mail como o Meta pede antes do hash: sem espaços nas pontas, minúsculo. */
export function normalizarEmail(email: unknown): string {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

export async function sha256Hex(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** IP do cliente pelos cabeçalhos do gateway (primeiro da cadeia x-forwarded-for). */
export function ipDoCliente(get: (nome: string) => string | null): string | null {
  const xff = (get('x-forwarded-for') || '').split(',')[0].trim();
  const ip = xff || (get('cf-connecting-ip') || '').trim() || (get('x-real-ip') || '').trim();
  return ip && ip.length <= 64 && /^[0-9a-fA-F.:]+$/.test(ip) ? ip : null;
}

export interface DadosEvento {
  pedido: PedidoValido;
  userId: string;
  email: string | null | undefined;
  ip: string | null;
  userAgent: string | null;
  agoraMs: number;
}

/** Monta o item de `data[]` da Conversions API, com e-mail e id em SHA-256. */
export async function montarEvento(d: DadosEvento): Promise<Record<string, unknown>> {
  const userData: Record<string, unknown> = { external_id: [await sha256Hex(d.userId)] };
  const em = normalizarEmail(d.email);
  if (em) userData.em = [await sha256Hex(em)];
  if (d.ip) userData.client_ip_address = d.ip;
  if (d.userAgent) userData.client_user_agent = d.userAgent.slice(0, 500);
  if (d.pedido.fbp) userData.fbp = d.pedido.fbp;
  if (d.pedido.fbc) userData.fbc = d.pedido.fbc;
  return {
    event_name: d.pedido.eventName,
    event_time: Math.floor(d.agoraMs / 1000),
    event_id: d.pedido.eventId,
    action_source: 'website',
    event_source_url: d.pedido.eventSourceUrl,
    user_data: userData,
    custom_data: dadosDoEvento(d.pedido.eventName, d.pedido.contentName),
  };
}
