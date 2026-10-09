// Service worker de Ringfall: permite instalarlo como app y abrir lo ya visitado sin conexión.
// Red primero (siempre se juega la versión publicada); sin red, lo que quedó guardado. No toca la API de cuentas,
// ni otros orígenes (fuentes, PeerJS), ni nada que no sea GET.
const CACHE = 'ringfall-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin || url.pathname.includes('/api/')) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        }
        return res;
      })
      .catch(() => caches.match(req).then((r) => r ?? (req.mode === 'navigate' ? caches.match('./') : Response.error()))),
  );
});
