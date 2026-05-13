/**
 * Service Worker — Precificaí PWA (M1-31)
 *
 * Strategies:
 *  - network-first  → /api/*, *supabase*  (sempre tentar rede; cache só fallback)
 *  - cache-first    → assets imutáveis (.js, .css, fonts, .png) com cache versionado
 *  - stale-while-revalidate → HTML, manifest
 *
 * Bump CACHE_VERSION sempre que mudar este arquivo OU os assets críticos.
 */
// Sessão 28.65: bump pra invalidar bundle antigo — fix do localStorage
// `pwa_installed` que travava o botão "Instalar app" em Configurações
// mostrando "✓ App instalado" mesmo após o user desinstalar.
const CACHE_VERSION = 'precificai-v4';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const HTML_CACHE = `${CACHE_VERSION}-html`;

const CORE_ASSETS = [
  '/',
  '/manifest.json',
  '/favicon.png',
  '/icon-192.png',
  '/icon-512.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => !k.startsWith(CACHE_VERSION)).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Same-origin only — não interferir com Supabase / APIs externas no SW
  if (url.origin !== self.location.origin) {
    // Para Supabase: deixar passar direto (network-only). Não cachear tokens.
    return;
  }

  // HTML: stale-while-revalidate
  if (req.mode === 'navigate' || req.headers.get('accept')?.includes('text/html')) {
    event.respondWith(staleWhileRevalidate(req, HTML_CACHE));
    return;
  }

  // Assets imutáveis (Expo gera com hash em /static/): cache-first agressivo
  if (url.pathname.startsWith('/static/') || /\.(js|css|woff2?|ttf|otf|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(req, RUNTIME_CACHE));
    return;
  }

  // Fallback: network-first
  event.respondWith(networkFirst(req, RUNTIME_CACHE));
});

async function cacheFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  if (cached) return cached;
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirst(req, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(req);
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  } catch {
    const cached = await cache.match(req);
    return cached || Response.error();
  }
}

async function staleWhileRevalidate(req, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(req);
  const fetchPromise = fetch(req).then((res) => {
    if (res && res.status === 200) cache.put(req, res.clone());
    return res;
  }).catch(() => cached || Response.error());
  return cached || fetchPromise;
}

// Mensagens da app (ex.: forçar atualização)
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});
