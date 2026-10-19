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
 *
 * CompleteRegistration, PrimeiroPreco e Ativacao saem TAMBÉM pelo servidor
 * (função `meta-evento`, Conversions API), com o mesmo event_id do Pixel para o
 * Meta contar uma vez. Só com aceite de cookies: recusou ou não respondeu, nada sai.
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

// PrimeiroPreco só conta para conta nova: o Meta otimiza anúncio com conversão
// recente, e contas antigas não devem disparar o evento só porque ele passou a existir.
export const JANELA_PRIMEIRO_PRECO_MS = 7 * 24 * 60 * 60 * 1000;

/** Lê um cookie do navegador (ex.: `_fbp`, `_fbc` do Pixel). */
export function lerCookie(nome, cookieStr) {
  const fonte = cookieStr ?? (typeof document !== 'undefined' ? document.cookie : '');
  for (const parte of String(fonte || '').split('; ')) {
    const eq = parte.indexOf('=');
    if (eq > -1 && parte.slice(0, eq) === nome) {
      try { return decodeURIComponent(parte.slice(eq + 1)); } catch { return null; }
    }
  }
  return null;
}

/**
 * Corpo da chamada à função `meta-evento`. Puro: `consent` precisa ser 'granted',
 * senão devolve null (LGPD: sem aceite não existe evento de servidor).
 */
export function montarCorpoEventoServidor({ consent, name, eventId, customData, fbp, fbc, url }) {
  if (consent !== 'granted' || !name || !eventId) return null;
  const corpo = { event_name: name, event_id: String(eventId), consent: 'granted' };
  if (customData && typeof customData === 'object') corpo.custom_data = customData;
  if (fbp) corpo.fbp = fbp;
  if (fbc) corpo.fbc = fbc;
  if (url) corpo.event_source_url = url;
  return corpo;
}

/**
 * Manda o evento pelo servidor (Conversions API), só com aceite de cookies.
 * @returns {Promise<boolean>} true quando o servidor confirmou.
 */
export async function enviarEventoServidor(supabase, name, eventId, customData) {
  const api = pcf();
  if (!api || typeof supabase?.functions?.invoke !== 'function') return false;
  try {
    let consent = null;
    try { consent = api.consent(); } catch {}
    if (consent !== 'granted') return false;
    let fbc = lerCookie('_fbc');
    if (!fbc) {
      // Sem cookie do Pixel ainda: o script monta o fbc a partir do fbclid do anúncio.
      try { fbc = api.attribution()?.fbc || null; } catch {}
    }
    const loc = typeof window !== 'undefined' ? window.location : null;
    const corpo = montarCorpoEventoServidor({
      consent, name, eventId, customData,
      fbp: lerCookie('_fbp'),
      fbc,
      url: loc?.origin ? `${loc.origin}${loc.pathname || '/'}` : null,
    });
    if (!corpo) return false;
    const { data, error } = await supabase.functions.invoke('meta-evento', { body: corpo });
    return !error && data?.ok === true;
  } catch {
    return false; // medição é melhor esforço
  }
}

// Estado do envio pelo servidor, por evento e conta, no localStorage:
// ausente = nunca tentou; 'pendente' = Pixel já foi, servidor falta; '1' = feito.
// Só 'pendente' tenta de novo: quem já tinha o evento antes desta versão (sem
// chave) não manda um evento de servidor atrasado.
async function enviarServidorPendente(supabase, chave, name, eventId, customData) {
  try {
    if (window.localStorage.getItem(chave) !== 'pendente') return;
    if (await enviarEventoServidor(supabase, name, eventId, customData)) window.localStorage.setItem(chave, '1');
  } catch {}
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

// Valor e moeda: o Events Manager acusava CompleteRegistration "sem valor e moeda".
export const DADOS_CADASTRO = { value: 0, currency: 'BRL', content_name: 'conta_gratis' };

/**
 * Dispara CompleteRegistration uma vez por conta neste navegador (Pixel + servidor,
 * mesmo event_id). Chamado no cadastro por e-mail e na primeira sessão (cobre Google).
 * @param {object} user usuário do Supabase
 * @param {object} [supabase] cliente com sessão; sem ele (cadastro que ainda
 *   espera confirmar o e-mail) o servidor fica para a primeira sessão.
 * @returns {Promise<void>|undefined}
 */
export function trackRegistrationOnce(user, supabase) {
  const api = pcf();
  if (!user?.id || !api) return undefined;
  let consent = null;
  try { consent = api.consent(); } catch {}
  if (consent === 'denied') return undefined;
  const chave = `pcf_reg_${user.id}`;
  const chaveSrv = `pcf_reg_srv_${user.id}`;
  const eventId = registrationEventId(user.id);
  const servidor = () => (supabase
    ? enviarServidorPendente(supabase, chaveSrv, 'CompleteRegistration', eventId, DADOS_CADASTRO)
    : undefined);
  try {
    // Pixel já foi: só falta (talvez) o servidor, que precisa de sessão.
    if (window.localStorage.getItem(chave)) return servidor();
    // Só marca como enviado com aceite. Sem resposta ainda, o evento fica na fila do
    // script e a próxima sessão tenta de novo; marcar antes perdia o cadastro de vez
    // quando a pessoa aceitava os cookies depois de se cadastrar.
    if (consent === 'granted') {
      window.localStorage.setItem(chave, '1');
      window.localStorage.setItem(chaveSrv, 'pendente');
    }
  } catch {
    return undefined; // sem storage não dá pra garantir "uma vez": melhor não mandar
  }
  trackEvent('CompleteRegistration', DADOS_CADASTRO, eventId);
  return consent === 'granted' ? servidor() : undefined;
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
    if (isFreshSignup(user.created_at)) await trackRegistrationOnce(user, supabase);
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

/** true quando há produto próprio (não exemplo do Kit) com preço de venda > 0. */
export function temPrimeiroPreco(rows) {
  if (!Array.isArray(rows)) return false;
  return rows.some((r) => Number(r?.preco_venda) > 0
    && !(typeof r?.observacoes === 'string' && r.observacoes.startsWith(KIT_OBS_PREFIXO)));
}

/**
 * Esqueleto dos eventos "uma vez por conta" (Ativacao, PrimeiroPreco): só com
 * aceite de cookies; sem resposta ainda, nada é marcado e a próxima mudança de
 * produtos tenta de novo. O Pixel vai uma vez; o servidor tenta até confirmar.
 */
function eventoUmaVez({ prefixo, name, idPrefixo, customData, pronto }) {
  let andamento = false;
  return async function checar(supabase) {
    const api = pcf();
    if (!api || andamento) return;
    andamento = true;
    try {
      if (api.consent() !== 'granted') return;
      const { data: { session } = {} } = await supabase.auth.getSession();
      const user = session?.user;
      const uid = user?.id;
      if (!uid) return;
      const chave = `${prefixo}_${uid}`;
      const chaveSrv = `${prefixo}_srv_${uid}`;
      const eventId = `${idPrefixo}_${uid}`;
      if (window.localStorage.getItem(chave)) {
        await enviarServidorPendente(supabase, chaveSrv, name, eventId, customData);
        return;
      }
      if (!(await pronto(supabase, user))) return;
      window.localStorage.setItem(chave, '1');
      window.localStorage.setItem(chaveSrv, 'pendente');
      trackEvent(name, customData, eventId);
      await enviarServidorPendente(supabase, chaveSrv, name, eventId, customData);
    } catch {
      // medição é melhor esforço
    } finally {
      andamento = false;
    }
  };
}

/**
 * Dispara `Ativacao` uma vez por conta quando ela chega a ATIVACAO_MIN_PRODUTOS
 * produtos próprios (Pixel + servidor, event_id `act_<uid>`).
 * @param {object} supabase cliente (injetado)
 */
export const checkActivation = eventoUmaVez({
  prefixo: 'pcf_act',
  name: 'Ativacao',
  idPrefixo: 'act',
  customData: { content_name: `${ATIVACAO_MIN_PRODUTOS}_produtos` },
  pronto: async (supabase, user) => {
    const { data, error } = await supabase
      .from('produtos').select('observacoes').eq('user_id', user.id).limit(50);
    return !error && countOwnProducts(data) >= ATIVACAO_MIN_PRODUTOS;
  },
});

/**
 * Dispara `PrimeiroPreco` uma vez por conta quando ela tem o primeiro produto
 * próprio com preço de venda (Pixel + servidor, event_id `pp_<uid>`). Só para
 * conta criada nos últimos JANELA_PRIMEIRO_PRECO_MS.
 * @param {object} supabase cliente (injetado)
 */
export const checkPrimeiroPreco = eventoUmaVez({
  prefixo: 'pcf_pp',
  name: 'PrimeiroPreco',
  idPrefixo: 'pp',
  customData: { value: 0, currency: 'BRL', content_name: 'primeiro_preco' },
  pronto: async (supabase, user) => {
    const criado = Date.parse(user.created_at);
    if (!Number.isFinite(criado) || Date.now() - criado > JANELA_PRIMEIRO_PRECO_MS) return false;
    const { data, error } = await supabase
      .from('produtos').select('preco_venda, observacoes').eq('user_id', user.id).gt('preco_venda', 0).limit(20);
    return !error && temPrimeiroPreco(data);
  },
});
