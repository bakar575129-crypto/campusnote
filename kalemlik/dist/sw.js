// Kalemlik service worker — çevrimdışı uygulama kabuğu.
// API ve kullanıcı dosyaları burada önbelleğe alınmaz (onlar IndexedDB'de, kullanıcıya özel saklanır).
const VERSION = 'kalemlik-v6';
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

// ---- bildirimler: tıklanınca ilgili sayfayı aç (açık bir Kalemlik penceresi varsa ona geç)
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const link = (event.notification.data && event.notification.data.link) || '/';
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({type: 'window', includeUncontrolled: true});
    for (const w of wins) {
      if (new URL(w.url).origin === location.origin) { await w.focus(); if ('navigate' in w) await w.navigate(link).catch(() => {}); return; }
    }
    await self.clients.openWindow(link);
  })());
});

// ---- telefona yüklü uygulamada arka plan hatırlatması (Periodic Background Sync destekleyen tarayıcılar):
// cihazdaki IndexedDB'den sınav ve ödev tarihleri okunur; her hatırlatma bir kez gösterilir. İnternet gerekmez.
function idbOpen() {
  return new Promise((resolve, reject) => { const r = indexedDB.open('kalemlik'); r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });
}
function idbAll(db, store) {
  return new Promise((resolve, reject) => { const r = db.transaction(store).objectStore(store).getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => reject(r.error); });
}
function idbGetKey(db, store, key) {
  return new Promise(resolve => { const r = db.transaction(store).objectStore(store).get(key); r.onsuccess = () => resolve(r.result); r.onerror = () => resolve(undefined); });
}
function idbSet(db, store, key, value) {
  return new Promise(resolve => { const tx = db.transaction(store, 'readwrite'); tx.objectStore(store).put(value, key); tx.oncomplete = () => resolve(); tx.onerror = () => resolve(); });
}
const localIso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const daysUntil = (from, to) => Math.round((new Date(to + 'T00:00:00') - new Date(from + 'T00:00:00')) / 86400000);

async function remind() {
  const db = await idbOpen();
  const records = await idbAll(db, 'records');
  const today = localIso(new Date());
  const byUser = new Map();
  for (const r of records) { if (!byUser.has(r.userId)) byUser.set(r.userId, []); byUser.get(r.userId).push(r); }
  for (const [userId, recs] of byUser) {
    const settings = (recs.find(r => r.entity === 'settings') || {}).data || {};
    const prefs = Object.assign({exam: true, homework: true, examDays: [7, 3, 1], homeworkDays: 2, browser: false}, (settings.data || {}).notifications || {});
    if (!prefs.browser) continue;
    const shownKey = `${userId}|sw-notified`;
    const shown = new Set((await idbGetKey(db, 'meta', shownKey)) || []);
    for (const r of recs) {
      if (r.entity !== 'task' || r.deleted || !r.data || r.data.done) continue;
      const t = r.data, d = daysUntil(today, t.dueDate);
      let title = '';
      if (t.category === 'exam' && prefs.exam && (d === 0 || (prefs.examDays || []).includes(d))) title = d === 0 ? `Bugün sınavın var: ${t.title}` : `Sınavına ${d} gün kaldı.`;
      if (t.category === 'homework' && prefs.homework && d >= 0 && d <= prefs.homeworkDays) title = d === 0 ? `${t.course || t.title} ödevi bugün teslim.` : `${t.course ? t.course + ' ödevinin' : 'Ödevinin'} teslimine ${d} gün kaldı.`;
      const id = `${t.category === 'exam' ? 'exam' : 'hw'}:${r.id}:${d}`;
      if (!title || shown.has(id)) continue;
      await self.registration.showNotification(title, {body: t.title, tag: id, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: {link: '/gorevler'}});
      shown.add(id);
    }
    await idbSet(db, 'meta', shownKey, [...shown].slice(-300));
  }
}
self.addEventListener('periodicsync', event => { if (event.tag === 'kalemlik-hatirlatma') event.waitUntil(remind().catch(() => {})); });
