/**
 * pcf-tracking.js — medição de anúncios do Precificaí (Meta Pixel + atribuição).
 *
 * ARQUIVO COMPARTILHADO: cópia idêntica na landing (`precificai-site/pcf-tracking.js`)
 * e no app (`PrecificaApp/public/pcf-tracking.js`). Mudou aqui, copie para o outro.
 *
 * O que faz:
 *  1. Atribuição: guarda `utm_*` e `fbclid` da URL num cookie do domínio raiz,
 *     para sobreviver ao salto landing (precificaiapp.com) → app (app.precificaiapp.com).
 *  2. Consentimento (LGPD): o Pixel só carrega depois de "Aceitar". Sem resposta,
 *     os eventos ficam em fila; com "Recusar", são descartados.
 *  3. Expõe `window.pcf`: track(), attribution(), consent(), askConsent().
 *
 * Na landing o aviso aparece sozinho (`data-banner="auto"` na tag <script>);
 * no app quem chama `askConsent()` são as telas de entrada/cadastro.
 */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (window.pcf) return;

  var PIXEL_ID = '1416674450624075';
  var ROOT_DOMAIN = 'precificaiapp.com';
  var ATTR_COOKIE = 'pcf_attr';
  var CONSENT_COOKIE = 'pcf_consent';
  var ATTR_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  var MAX_VALUE_LEN = 200;

  // ---------- cookies ----------
  function cookieDomain() {
    var host = window.location.hostname || '';
    if (host === ROOT_DOMAIN || host.slice(-(ROOT_DOMAIN.length + 1)) === '.' + ROOT_DOMAIN) {
      return '; domain=.' + ROOT_DOMAIN;
    }
    return ''; // localhost / preview: cookie só do host
  }

  function readCookie(name) {
    var parts = (document.cookie || '').split('; ');
    for (var i = 0; i < parts.length; i++) {
      var eq = parts[i].indexOf('=');
      if (eq > -1 && parts[i].slice(0, eq) === name) {
        try { return decodeURIComponent(parts[i].slice(eq + 1)); } catch (e) { return null; }
      }
    }
    return null;
  }

  function writeCookie(name, value, days) {
    var secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = name + '=' + encodeURIComponent(value) +
      '; max-age=' + (days * 86400) + '; path=/' + cookieDomain() + '; SameSite=Lax' + secure;
  }

  // ---------- atribuição ----------
  function parseSearch(search) {
    var out = {};
    var q = (search || '').replace(/^\?/, '');
    if (!q) return out;
    var pairs = q.split('&');
    for (var i = 0; i < pairs.length; i++) {
      var eq = pairs[i].indexOf('=');
      if (eq < 1) continue;
      var key = pairs[i].slice(0, eq);
      if (ATTR_KEYS.indexOf(key) === -1) continue;
      var val;
      try { val = decodeURIComponent(pairs[i].slice(eq + 1).replace(/\+/g, ' ')); } catch (e) { continue; }
      val = val.trim().slice(0, MAX_VALUE_LEN);
      if (val) out[key] = val;
    }
    return out;
  }

  function captureAttribution() {
    var found = parseSearch(window.location.search);
    var hasAny = false;
    for (var k in found) { if (Object.prototype.hasOwnProperty.call(found, k)) { hasAny = true; break; } }
    if (!hasAny) return; // visita sem campanha não apaga a última campanha conhecida
    found.landing = (window.location.hostname + window.location.pathname).slice(0, MAX_VALUE_LEN);
    found.ts = Date.now();
    writeCookie(ATTR_COOKIE, JSON.stringify(found), 90);
  }

  function attribution() {
    var data = {};
    var raw = readCookie(ATTR_COOKIE);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') data = parsed;
      } catch (e) {}
    }
    var state = consent();
    if (state) data.consent = state;
    // _fbp/_fbc são cookies do próprio Pixel; só existem depois do aceite.
    var fbp = readCookie('_fbp');
    var fbc = readCookie('_fbc');
    if (!fbc && data.fbclid && state === 'granted') {
      fbc = 'fb.1.' + (data.ts || Date.now()) + '.' + data.fbclid;
    }
    if (fbp) data.fbp = fbp;
    if (fbc) data.fbc = fbc;
    var empty = true;
    for (var k in data) { if (Object.prototype.hasOwnProperty.call(data, k)) { empty = false; break; } }
    return empty ? null : data;
  }

  // ---------- consentimento + Pixel ----------
  var queue = [];
  var pixelLoaded = false;

  function consent() {
    var v = readCookie(CONSENT_COOKIE);
    return v === 'granted' || v === 'denied' ? v : null;
  }

  function loadPixel() {
    if (pixelLoaded) return;
    pixelLoaded = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0';
      n.queue = []; t = b.createElement(e); t.async = !0;
      t.src = v; s = b.getElementsByTagName(e)[0];
      if (s && s.parentNode) s.parentNode.insertBefore(t, s); else b.head.appendChild(t);
    }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    /* eslint-enable */
    window.fbq('init', PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  function send(name, params, eventId) {
    if (eventId) window.fbq('track', name, params || {}, { eventID: String(eventId) });
    else window.fbq('track', name, params || {});
  }

  function flush() {
    var pending = queue;
    queue = [];
    for (var i = 0; i < pending.length; i++) send(pending[i][0], pending[i][1], pending[i][2]);
  }

  function track(name, params, eventId) {
    var state = consent();
    if (state === 'denied') return;
    if (state === 'granted') { loadPixel(); send(name, params, eventId); return; }
    if (queue.length < 20) queue.push([name, params, eventId]);
  }

  function setConsent(state) {
    writeCookie(CONSENT_COOKIE, state, 180);
    hideBanner();
    if (state === 'granted') { loadPixel(); flush(); } else { queue = []; }
  }

  // ---------- aviso ----------
  var bannerEl = null;

  function hideBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  function button(label, primary, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.style.cssText = 'font:600 14px/1 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;' +
      'padding:11px 18px;border-radius:8px;cursor:pointer;min-height:40px;' +
      (primary
        ? 'background:#004d47;color:#fff;border:1px solid #004d47;'
        : 'background:#fff;color:#004d47;border:1px solid #b9cfcc;');
    b.addEventListener('click', onClick);
    return b;
  }

  function askConsent() {
    if (consent() || bannerEl || !document.body) return;
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Aviso de cookies');
    box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483000;' +
      'max-width:560px;margin:0 auto;background:#fff;color:#1c2b29;border:1px solid #d9e4e2;' +
      'border-radius:12px;box-shadow:0 8px 30px rgba(0,0,0,.18);padding:16px;' +
      'font:400 14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;';

    var text = document.createElement('p');
    text.style.cssText = 'margin:0 0 12px 0;';
    text.appendChild(document.createTextNode(
      'Usamos cookies para medir nossos anúncios e melhorar o Precificaí. Você escolhe se aceita. '
    ));
    var link = document.createElement('a');
    link.href = 'https://app.precificaiapp.com/privacy';
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Ver política de privacidade';
    link.style.cssText = 'color:#004d47;text-decoration:underline;';
    text.appendChild(link);

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;';
    row.appendChild(button('Recusar', false, function () { setConsent('denied'); }));
    row.appendChild(button('Aceitar', true, function () { setConsent('granted'); }));

    box.appendChild(text);
    box.appendChild(row);
    document.body.appendChild(box);
    bannerEl = box;
  }

  // ---------- boot ----------
  captureAttribution();
  if (consent() === 'granted') loadPixel();

  window.pcf = {
    track: track,
    attribution: attribution,
    consent: consent,
    askConsent: askConsent,
    setConsent: setConsent,
  };

  var self = document.currentScript;
  if (self && self.getAttribute && self.getAttribute('data-banner') === 'auto') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', askConsent);
    else askConsent();
  }
})();
