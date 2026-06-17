/**
 * Service Worker SAUDÁVEL — DRAFT (NÃO ATIVO).
 *
 * ⚠️ Este arquivo NÃO é o SW em produção. O SW ativo é `public/sw.js` (kill-switch).
 * Nada referencia `sw.healthy.js`, então mesmo deployado ele fica INERTE.
 * Para ativar: copiar este conteúdo para `public/sw.js`, buildar, testar LOCAL
 * (servir dist + verificar no Chrome real que NÃO loopa e atualiza), só então deployar.
 *
 * DESIGN (à prova do loop que aconteceu em 17/06/2026):
 *  - NETWORK-FIRST para navegação (HTML) → "fechar e reabrir = versão nova".
 *  - CACHE-FIRST para assets hashados (/_expo/static/...) → imutáveis, carregam rápido/offline.
 *  - SEM `controllerchange → reload` (foi isso que causou o LOOP). O index.js também
 *    NÃO escuta controllerchange. Atualização acontece NA PRÓXIMA navegação, naturalmente.
 *  - `clients.claim()` apenas assume controle (NÃO recarrega a página) — seguro.
 */
const VERSION = 'v1-2026-06-17';
const STATIC_CACHE = `precificai-static-${VERSION}`;

self.addEventListener('install', () => {
  // Ativa imediatamente a versão nova do SW.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Remove caches de versões antigas do SW.
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      // Assume controle das abas abertas SEM recarregá-las (não dispara reload).
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try {
    url = new URL(req.url);
  } catch (_) {
    return;
  }
  // Só intercepta same-origin (não toca Supabase, Sentry, etc).
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get('accept') || '';
  const isNavigation = req.mode === 'navigate' || accept.includes('text/html');

  // 1) Navegação (HTML) → NETWORK-FIRST. Sempre busca a versão mais nova.
  if (isNavigation) {
    event.respondWith(
      (async () => {
        try {
          return await fetch(req);
        } catch (e) {
          // Offline: tenta servir um HTML cacheado, se houver.
          const cache = await caches.open(STATIC_CACHE);
          const cached = (await cache.match('/index.html')) || (await cache.match('/'));
          return cached || Response.error();
        }
      })()
    );
    return;
  }

  // 2) Assets hashados (imutáveis) → CACHE-FIRST.
  if (url.pathname.startsWith('/_expo/static/')) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(req);
        if (cached) return cached;
        const fresh = await fetch(req);
        if (fresh && fresh.status === 200) {
          cache.put(req, fresh.clone());
        }
        return fresh;
      })()
    );
    return;
  }

  // 3) Resto (manifest, ícones, etc) → deixa passar (rede padrão).
});
