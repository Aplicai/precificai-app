/**
 * marketing — ponte entre o app e `public/pcf-tracking.js` (Meta Pixel + atribuição).
 *
 * O script é web-only e carregado no boot por `index.web.js`. Aqui ficam só
 * chamadas seguras: no nativo, sem script (bloqueador de anúncio) ou sem aceite
 * de cookies, tudo vira no-op. Medição nunca pode quebrar cadastro ou checkout.
 *
 * Eventos enviados pelo navegador: PageView (script), CompleteRegistration,
 * InitiateCheckout. A compra (Purchase) sai do servidor, no `asaas-webhook`,
 * porque o Pix confirma fora da página.
 */

// Conta criada há menos que isso conta como cadastro novo (cobre o retorno do
// Google e a confirmação de e-mail feita logo em seguida).
export const JANELA_CADASTRO_NOVO_MS = 30 * 60 * 1000;

// Ativação = conta com N produtos PRÓPRIOS (os exemplos do Kit de Início não contam).
// É o sinal de dono de negócio usando o app de verdade, a dois produtos do limite
// do plano Grátis (5) que abre o convite de upgrade. Evento custom `Ativacao`.
export const ATIVACAO_MIN_PRODUTOS = 3;
// Texto gravado em `observacoes` pelos produtos de exemplo do Kit (KitInicioScreen).
export const KIT_OBS_PREFIXO = 'Exemplo do Kit de Início';

const CAMPOS_ATRIBUICAO = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'fbclid', 'fbc', 'fbp', 'landing', 'ts', 'consent',
];

function pcf() {
  return typeof window !== 'undefined' && window.pcf ? window.pcf : null;
}

/** id do evento de cadastro: o mesmo em qualquer aba/retentativa, para o Meta deduplicar. */
export function registrationEventId(userId) {
  return `reg_${userId}`;
}

/** @returns {boolean} true quando `createdAt` é recente o bastante pra ser um cadastro novo. */
export function isFreshSignup(createdAt, now = Date.now()) {
  const t = typeof createdAt === 'string' ? Date.parse(createdAt) : NaN;
  if (!Number.isFinite(t)) return false;
  const idade = now - t;
  return idade >= 0 && idade <= JANELA_CADASTRO_NOVO_MS;
}

/**
 * Filtra a atribuição pro formato gravado no perfil: só campos conhecidos,
 * só texto/número curto. O conteúdo vem de cookie e URL, então não é confiável.
 * @returns {object|null}
 */
export function sanitizeAttribution(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const out = {};
  for (const campo of CAMPOS_ATRIBUICAO) {
    const v = raw[campo];
    if (typeof v === 'string' && v.trim()) out[campo] = v.trim().slice(0, 300);
    else if (typeof v === 'number' && Number.isFinite(v)) out[campo] = v;
  }
  return Object.keys(out).length ? out : null;
}

/** Atribuição da visita atual (campanha + cookies do Pixel), ou null. */
export function getAttribution() {
  try {
    return sanitizeAttribution(pcf()?.attribution());
  } catch {
    return null;
  }
}

/**
 * Mostra o aviso de cookies se a pessoa ainda não respondeu. O script carrega
 * assíncrono no boot, então a tela pode montar antes dele: tenta por alguns segundos.
 */
export function askConsent(tentativas = 10) {
  if (typeof window === 'undefined') return;
  const api = pcf();
  if (api) {
    try { api.askConsent(); } catch {}
    return;
  }
  if (tentativas > 0) setTimeout(() => askConsent(tentativas - 1), 500);
}

export function trackEvent(name, params, eventId) {
  try { pcf()?.track(name, params, eventId); } catch {}
}

/**
 * Dispara CompleteRegistration uma vez por conta neste navegador.
 * Chamado no cadastro por e-mail e na primeira sessão (cobre Google).
 */
export function trackRegistrationOnce(user) {
  const api = pcf();
  if (!user?.id || !api) return;
  let consent = null;
  try { consent = api.consent(); } catch {}
  if (consent === 'denied') return;
  const chave = `pcf_reg_${user.id}`;
  try {
    if (window.localStorage.getItem(chave)) return;
    // Só marca como enviado com aceite. Sem resposta ainda, o evento fica na fila do
    // script e a próxima sessão tenta de novo; marcar antes perdia o cadastro de vez
    // quando a pessoa aceitava os cookies depois de se cadastrar.
    if (consent === 'granted') window.localStorage.setItem(chave, '1');
  } catch {
    return; // sem storage não dá pra garantir "uma vez": melhor não mandar
  }
  trackEvent('CompleteRegistration', { content_name: 'conta_gratis' }, registrationEventId(user.id));
}

/**
 * Primeiro produto com preço (primeiro acesso guiado, 15/10/2026): evento
 * PrimeiroPreco uma vez por conta neste navegador, mesma regra de aceite do
 * cadastro. É o "aha" que queremos otimizar nos anúncios.
 */
export function trackPrimeiroPrecoOnce(user, preco) {
  const api = pcf();
  const valor = Number(preco);
  if (!user?.id || !api || !(valor > 0)) return;
  let consent = null;
  try { consent = api.consent(); } catch {}
  if (consent === 'denied') return;
  const chave = `pcf_pp_${user.id}`;
  try {
    if (window.localStorage.getItem(chave)) return;
    if (consent === 'granted') window.localStorage.setItem(chave, '1');
  } catch {
    return;
  }
  trackEvent('PrimeiroPreco', { content_name: 'primeiro_produto', value: Math.round(valor * 100) / 100, currency: 'BRL' }, `pp_${user.id}`);
}

/**
 * Primeira sessão de uma conta: registra o cadastro (se for novo) e grava a
 * origem no perfil, para saber depois qual anúncio trouxe quem pagou.
 * @param {object} user usuário do Supabase
 * @param {object} supabase cliente (injetado pra não acoplar este módulo ao config)
 */
export async function syncMarketingForUser(user, supabase) {
  if (!user?.id) return;
  try {
    if (isFreshSignup(user.created_at)) trackRegistrationOnce(user);
    if (user.user_metadata?.attribution) return; // primeira origem vale; não sobrescreve
    const attribution = getAttribution();
    // Só campanha de verdade: consentimento sozinho não é origem.
    if (!attribution || !(attribution.utm_source || attribution.fbclid)) return;
    await supabase.auth.updateUser({ data: { attribution } });
  } catch {
    // medição é melhor esforço
  }
}

/** Conta produtos que não são exemplo do Kit de Início. */
export function countOwnProducts(rows) {
  if (!Array.isArray(rows)) return 0;
  return rows.filter((r) => !(typeof r?.observacoes === 'string' && r.observacoes.startsWith(KIT_OBS_PREFIXO))).length;
}

let _ativacaoEmAndamento = false;

/**
 * Dispara `Ativacao` uma vez por conta quando ela chega a ATIVACAO_MIN_PRODUTOS
 * produtos próprios. Só marca como enviado com aceite de cookies: sem resposta
 * ainda, tenta de novo na próxima mudança de produtos.
 * @param {object} supabase cliente (injetado)
 */
export async function checkActivation(supabase) {
  const api = pcf();
  if (!api || _ativacaoEmAndamento) return;
  _ativacaoEmAndamento = true;
  try {
    if (api.consent() !== 'granted') return;
    const { data: { session } = {} } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (!uid) return;
    const chave = `pcf_act_${uid}`;
    if (window.localStorage.getItem(chave)) return;
    const { data, error } = await supabase
      .from('produtos').select('observacoes').eq('user_id', uid).limit(50);
    if (error || countOwnProducts(data) < ATIVACAO_MIN_PRODUTOS) return;
    window.localStorage.setItem(chave, '1');
    trackEvent('Ativacao', { content_name: `${ATIVACAO_MIN_PRODUTOS}_produtos` }, `act_${uid}`);
  } catch {
    // medição é melhor esforço
  } finally {
    _ativacaoEmAndamento = false;
  }
}
