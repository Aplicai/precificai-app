/**
 * Service Worker — KILL SWITCH (emergência 17/06/2026).
 *
 * Uma versão anterior do REGISTRO (index.js: controllerchange → reload) causou um
 * LOOP de reload em clientes (browser e PWA instalado): "tela atualizando
 * constantemente". O bundle já foi corrigido (sem o auto-reload), mas os clientes
 * PRESOS não conseguem chegar nele porque o service worker antigo continua
 * servindo a versão que loopa.
 *
 * Este SW é um KILL SWITCH: ele NÃO faz cache e NÃO intercepta nada. Ele apenas
 * LIMPA todos os caches e SE DESREGISTRA. Com isso, o app deixa de ter SW e passa
 * a rodar DIRETO da rede — sempre a versão mais nova — saindo do loop.
 *
 * Importante: SEM `clients.claim()` e SEM `navigate()` → este SW não cria nenhum
 * reload novo (não há risco de novo loop). Os clientes presos saem do loop no
 * próximo carregamento, que passa a vir direto da rede (HTML é must-revalidate).
 *
 * Depois que a base estabilizar, dá pra reintroduzir um SW saudável (com cache e
 * cache:'reload' no HTML) com calma e testando ao vivo.
 */
self.addEventListener('install', () => {
  // Ativa imediatamente, sem esperar.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 1) Apaga TODOS os caches (qualquer versão antiga).
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch (e) {
        // ignora
      }
      // 2) Se desregistra → próxima navegação vai direto à rede, sem SW.
      try {
        await self.registration.unregister();
      } catch (e) {
        // ignora
      }
    })()
  );
});

// SEM handler de 'fetch' → nenhuma requisição é interceptada/cacheada. Tudo vai
// direto à rede. O HTML é servido com Cache-Control: max-age=0, must-revalidate,
// então cada carregamento já pega a versão mais recente do deploy.
