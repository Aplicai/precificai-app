/**
 * Testes — public/pcf-tracking.js (medição de anúncios: atribuição + consentimento).
 *
 * O script roda no navegador (landing e app). Aqui ele é executado num contexto
 * `vm` com `window`/`document` de mentira, para travar as regras que importam:
 *  - `utm_*`/`fbclid` vão para um cookie do domínio raiz (sobrevive landing → app);
 *  - o Pixel NÃO carrega sem aceite (LGPD);
 *  - eventos antes da resposta ficam em fila; recusa descarta.
 *
 * Rodar: node --import ./__tests__/loader.mjs --test __tests__/pcfTracking.test.mjs
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const SOURCE = readFileSync(new URL('../public/pcf-tracking.js', import.meta.url), 'utf8');

function makeEl(tag) {
  return {
    tagName: tag,
    style: {},
    children: [],
    parentNode: null,
    setAttribute() {},
    addEventListener(type, fn) { this['on' + type] = fn; },
    appendChild(child) { child.parentNode = this; this.children.push(child); return child; },
    removeChild(child) { this.children = this.children.filter((c) => c !== child); child.parentNode = null; },
    insertBefore(child) { return this.appendChild(child); },
  };
}

/** Sobe o script numa página falsa. `cookies` = estado inicial do jar. */
function boot({ url = 'https://precificaiapp.com/', cookies = {}, banner = null } = {}) {
  const u = new URL(url);
  const jar = { ...cookies };
  const written = [];
  const scripts = [];
  const body = makeEl('body');
  const head = makeEl('head');
  const document = {
    readyState: 'complete',
    body,
    head,
    currentScript: { getAttribute: (n) => (n === 'data-banner' ? banner : null) },
    get cookie() {
      return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(str) {
      written.push(str);
      const [pair] = str.split(';');
      const eq = pair.indexOf('=');
      jar[pair.slice(0, eq)] = pair.slice(eq + 1);
    },
    createElement(tag) {
      const el = makeEl(tag);
      if (tag === 'script') scripts.push(el);
      return el;
    },
    createTextNode: (t) => ({ text: t }),
    getElementsByTagName: () => [],
    addEventListener() {},
  };
  const window = {
    location: { hostname: u.hostname, pathname: u.pathname, search: u.search, protocol: u.protocol },
  };
  window.window = window;
  window.document = document;
  vm.runInNewContext(SOURCE, { window, document, Date, JSON, Object, String, decodeURIComponent, encodeURIComponent });
  // Troca o stub do fbq por um espião depois do boot, guardando o que já foi chamado.
  const calls = [];
  if (window.fbq) {
    for (const args of window.fbq.queue) calls.push(Array.from(args));
    window.fbq = (...args) => { calls.push(args); };
  }
  return { window, pcf: window.pcf, jar, written, scripts, body, calls };
}

const attrFrom = (jar) => JSON.parse(decodeURIComponent(jar.pcf_attr));

test('guarda utm e fbclid num cookie do domínio raiz', () => {
  const { jar, written } = boot({
    url: 'https://precificaiapp.com/?utm_source=meta&utm_campaign=lancamento&utm_content=anuncio-03&fbclid=AbC123&outro=x',
  });
  const attr = attrFrom(jar);
  assert.equal(attr.utm_source, 'meta');
  assert.equal(attr.utm_campaign, 'lancamento');
  assert.equal(attr.utm_content, 'anuncio-03');
  assert.equal(attr.fbclid, 'AbC123');
  assert.equal(attr.outro, undefined); // só as chaves conhecidas
  assert.equal(attr.landing, 'precificaiapp.com/');
  const cookie = written.find((c) => c.startsWith('pcf_attr='));
  assert.match(cookie, /domain=\.precificaiapp\.com/);
  assert.match(cookie, /Secure/);
});

test('no subdomínio do app o cookie também é do domínio raiz', () => {
  const { written } = boot({ url: 'https://app.precificaiapp.com/register?utm_source=meta' });
  assert.match(written.find((c) => c.startsWith('pcf_attr=')), /domain=\.precificaiapp\.com/);
});

test('fora do domínio (localhost) o cookie fica só no host', () => {
  const { written } = boot({ url: 'http://localhost:8083/?utm_source=meta' });
  const cookie = written.find((c) => c.startsWith('pcf_attr='));
  assert.doesNotMatch(cookie, /domain=/);
  assert.doesNotMatch(cookie, /Secure/);
});

test('visita sem campanha não apaga a campanha já guardada', () => {
  const anterior = encodeURIComponent(JSON.stringify({ utm_source: 'meta', utm_content: 'anuncio-01', ts: 1 }));
  const { jar, written, pcf } = boot({ url: 'https://app.precificaiapp.com/register', cookies: { pcf_attr: anterior } });
  assert.equal(written.length, 0);
  assert.equal(attrFrom(jar).utm_content, 'anuncio-01');
  assert.equal(pcf.attribution().utm_content, 'anuncio-01');
});

test('valor gigante é cortado e valor quebrado é ignorado', () => {
  const { jar } = boot({ url: `https://precificaiapp.com/?utm_source=${'a'.repeat(500)}&utm_medium=%E0%A4%A` });
  const attr = attrFrom(jar);
  assert.equal(attr.utm_source.length, 200);
  assert.equal(attr.utm_medium, undefined);
});

test('sem aceite o Pixel não carrega e o evento fica em fila', () => {
  const { pcf, scripts, window } = boot();
  pcf.track('CompleteRegistration', {}, 'reg_1');
  assert.equal(scripts.length, 0);
  assert.equal(window.fbq, undefined);
  assert.equal(pcf.consent(), null);
});

test('aceitar carrega o Pixel, manda PageView e solta a fila com o event_id', () => {
  const { pcf, scripts, window, jar } = boot();
  pcf.track('CompleteRegistration', { a: 1 }, 'reg_1');
  pcf.setConsent('granted');
  assert.equal(jar.pcf_consent_v2, 'granted');
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, 'https://connect.facebook.net/en_US/fbevents.js');
  const calls = window.fbq.queue.map((a) => Array.from(a));
  assert.deepEqual(calls[0], ['init', '1416674450624075']);
  assert.deepEqual(calls[1], ['track', 'PageView']);
  assert.equal(calls[2][1], 'CompleteRegistration');
  assert.equal(calls[2][3].eventID, 'reg_1');
});

test('recusar descarta a fila e nunca carrega o Pixel', () => {
  const { pcf, scripts, window, jar } = boot();
  pcf.track('InitiateCheckout');
  pcf.setConsent('denied');
  pcf.track('InitiateCheckout');
  assert.equal(jar.pcf_consent_v2, 'denied');
  assert.equal(scripts.length, 0);
  assert.equal(window.fbq, undefined);
});

test('aceite anterior carrega o Pixel já no boot', () => {
  const { calls, scripts } = boot({ cookies: { pcf_consent_v2: 'granted' } });
  assert.equal(scripts.length, 1);
  assert.deepEqual(calls[0], ['init', '1416674450624075']);
  assert.deepEqual(calls[1], ['track', 'PageView']);
});

test('aviso aparece sozinho só com data-banner="auto" e some depois da resposta', () => {
  assert.equal(boot().body.children.length, 0);
  const { body, pcf } = boot({ banner: 'auto' });
  assert.equal(body.children.length, 1);
  pcf.askConsent(); // não duplica
  assert.equal(body.children.length, 1);
  pcf.setConsent('denied');
  assert.equal(body.children.length, 0);
  pcf.askConsent(); // já respondeu: não volta
  assert.equal(body.children.length, 0);
});

test('aviso (LGPD): Recusar e Aceitar com o mesmo peso, no rodapé, compacto (o topo é do aviso de instalar)', () => {
  const { body, pcf } = boot({ banner: 'auto' });
  const box = body.children[0];
  assert.match(box.style.cssText, /bottom:/);
  assert.doesNotMatch(box.style.cssText, /top:/);
  const [texto, linha] = box.children;
  assert.match(texto.children[0].text, /cookies/);
  assert.match(texto.children[0].text, /anúncios/); // finalidade dita
  assert.match(texto.children[1].href, /\/privacy$/);
  const [recusar, aceitar] = linha.children;
  assert.equal(recusar.textContent, 'Recusar');
  assert.equal(aceitar.textContent, 'Aceitar');
  assert.equal(recusar.style.cssText, aceitar.style.cssText); // mesmo peso visual
  aceitar.onclick();
  assert.equal(pcf.consent(), 'granted');
  assert.equal(body.children.length, 0);
});

test('fbc é montado do fbclid só com aceite; consentimento vai junto na atribuição', () => {
  const semAceite = boot({ url: 'https://precificaiapp.com/?fbclid=XYZ' });
  assert.equal(semAceite.pcf.attribution().fbc, undefined);
  assert.equal(semAceite.pcf.attribution().consent, undefined);

  const comAceite = boot({ url: 'https://precificaiapp.com/?fbclid=XYZ', cookies: { pcf_consent_v2: 'granted', _fbp: 'fb.1.1.999' } });
  const attr = comAceite.pcf.attribution();
  assert.match(attr.fbc, /^fb\.1\.\d+\.XYZ$/);
  assert.equal(attr.fbp, 'fb.1.1.999');
  assert.equal(attr.consent, 'granted');
});

test('sem campanha e sem resposta a atribuição é nula', () => {
  assert.equal(boot().pcf.attribution(), null);
});

test('evento fora da lista padrão do Meta vai por trackCustom', () => {
  const { pcf, calls } = boot({ cookies: { pcf_consent_v2: 'granted' } });
  pcf.track('Ativacao', { content_name: '3_produtos' }, 'act_1');
  pcf.track('InitiateCheckout');
  const ativ = calls.find((c) => c[1] === 'Ativacao');
  assert.equal(ativ[0], 'trackCustom');
  assert.equal(ativ[3].eventID, 'act_1');
  assert.equal(calls.find((c) => c[1] === 'InitiateCheckout')[0], 'track');
});

test('aceite antigo (pcf_consent, só medição) não vale para o v2: o aviso volta e nada é enviado', () => {
  const { calls, scripts } = boot({ cookies: { pcf_consent: 'granted' } });
  assert.equal(scripts.length, 0);
  assert.equal(calls.length, 0);
});
