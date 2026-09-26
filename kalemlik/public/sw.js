// Kalemlik service worker — çevrimdışı uygulama kabuğu.
// API ve kullanıcı dosyaları burada önbelleğe alınmaz (onlar IndexedDB'de, kullanıcıya özel saklanır).
const VERSION = 'kalemlik-v3';
const SHELL = `${VERSION}-shell`;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    let files = [];
    try {
      const res = await fetch('/asset-manifest.json', {cache: 'no-store'});
      if (res.ok) files = (await res.json()).files || [];
    } catch { /* ilk kurulumda ağ yoksa sonra tamamlanır */ }
    const shell = ['/', '/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', ...files];
    await Promise.allSettled(shell.map(async url => {
      const res = await fetch(url, {cache: 'no-store'});
      if (res.ok && !res.redirected) await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('kalemlik-') && !k.startsWith(VERSION)).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;

  // Sayfa gezintisi: önce ağ (güncel sürüm), bağlantı yoksa önbellekteki kabuk.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res.ok && (res.headers.get('content-type') || '').includes('text/html')) {
          const cache = await caches.open(SHELL);
          await cache.put('/', res.clone());
        }
        return res;
      } catch {
        return (await caches.match('/')) || new Response('<!doctype html><meta charset=utf-8><title>Kalemlik</title><p style="font-family:sans-serif;padding:2rem">Kalemlik’i çevrimdışı kullanmak için önce internete bağlıyken bir kez açmalısın.</p>', {headers: {'Content-Type': 'text/html; charset=utf-8'}});
      }
    })());
    return;
  }

  // Hash'li derleme dosyaları, yazı tipleri, ikonlar: önce önbellek.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/ocr/') || url.pathname.startsWith('/icons/') || /\.(woff2?|png|svg|webmanifest)$/.test(url.pathname)) {
    event.respondWith((async () => {
      const cached = await caches.match(req);
      if (cached) return cached;
      const res = await fetch(req);
      if (res.ok) (await caches.open(SHELL)).put(req, res.clone());
      return res;
    })());
  }
});
