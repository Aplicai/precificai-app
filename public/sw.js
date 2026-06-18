/**
 * Service Worker — PASSTHROUGH ESTÁVEL (Sessão 17/06/2026).
 *
 * Histórico: uma versão antiga do registro (index.js: `controllerchange → reload`)
 * causou LOOP de reload. Foi removida. Depois usamos um KILL-SWITCH (unregister),
 * mas o unregister NÃO descontrola a aba aberta e a saída do loop ficava
 * probabilística — clientes presos no bundle antigo continuavam recarregando.
 *
 * Esta versão é um PASSTHROUGH estável que TIRA o cliente do loop de forma
 * DETERMINÍSTICA:
 *   - install: skipWaiting() → ativa imediatamente.
 *   - activate: limpa TODOS os caches antigos + clients.claim() → assume o
 *     controle de todas as abas JÁ ABERTAS na hora. Isso dispara `controllerchange`
 *     UMA vez. No bundle ATUAL não há handler de controllerchange → é inócuo (sem
 *     reload). No bundle ANTIGO (que tinha controllerchange→reload), dispara UM
 *     reload → a aba recarrega → como este SW não tem handler de `fetch`, a
 *     navegação vai à REDE (HTML é must-revalidate) → pega o bundle NOVO (sem
 *     loop) → fica estável. Saída garantida em 1 transição.
 *   - SEM handler de `fetch` → nada é cacheado, tudo vai à rede (sempre a versão
 *     mais nova). SEM unregister (evita o flip-flop registra/desregistra a cada
 *     deploy).
 *
 * INVARIANTE DE OURO: clients.claim() só é seguro porque o bundle atual NÃO tem
 * `controllerchange → window.location.reload()`. NUNCA reintroduzir esse handler
 * no index.js — a combinação claim + esse handler = loop imediato.
 */
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Limpa qualquer cache antigo (de SWs anteriores que cacheavam o bundle).
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (_) {}
      // Assume controle imediato das abas abertas (saída determinística do loop).
      try {
        await self.clients.claim();
      } catch (_) {}
    })()
  );
});

// SEM handler de 'fetch' → todas as requisições vão direto à rede. O HTML é
// servido com Cache-Control: must-revalidate, então cada carregamento já pega a
// versão mais recente do deploy. Nada de cache, nada de staleness, nada de loop.
