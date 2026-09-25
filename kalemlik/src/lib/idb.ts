// Küçük IndexedDB yardımcıları. Üç depo:
//  records     → kayıtların meta verisi (defter, ders, görev, sayfa başlığı…) + eşitleme durumu
//  pageContent → sayfa içerikleri (yalnızca defter açılınca okunur, belleği şişirmez)
//  blobs       → yüklenmeyi bekleyen veya çevrimdışı için önbelleğe alınan dosyalar
//  meta        → eşitleme imleci vb.

const DB_NAME = 'kalemlik';
const VERSION = 1;
let dbPromise: Promise<IDBDatabase> | null = null;

export function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('records')) db.createObjectStore('records').createIndex('user', 'userId');
        if (!db.objectStoreNames.contains('pageContent')) db.createObjectStore('pageContent');
        if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs').createIndex('user', 'userId');
        if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta');
      };
      req.onsuccess = () => {
        req.result.onversionchange = () => req.result.close();
        resolve(req.result);
      };
      req.onerror = () => { dbPromise = null; reject(req.error); };
    });
  }
  return dbPromise;
}

type StoreName = 'records' | 'pageContent' | 'blobs' | 'meta';

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).get(key)) as Promise<T | undefined>;
}

export async function idbPut(store: StoreName, key: string, value: unknown): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).put(value, key);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}

export async function idbDelete(store: StoreName, key: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(store, 'readwrite');
  tx.objectStore(store).delete(key);
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}

/** Birden çok yazmayı tek işlemde yapar (hızlı ve tutarlı). */
export async function idbBatch(ops: {store: StoreName; key: string; value?: unknown; remove?: boolean}[]): Promise<void> {
  if (!ops.length) return;
  const db = await openDb();
  const stores = [...new Set(ops.map(o => o.store))];
  const tx = db.transaction(stores, 'readwrite');
  for (const op of ops) {
    const s = tx.objectStore(op.store);
    if (op.remove) s.delete(op.key); else s.put(op.value, op.key);
  }
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
}

export async function idbAllByUser<T>(store: 'records' | 'blobs', userId: string): Promise<T[]> {
  const db = await openDb();
  return wrap(db.transaction(store).objectStore(store).index('user').getAll(userId)) as Promise<T[]>;
}

export async function idbClearUser(userId: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(['records', 'pageContent', 'blobs', 'meta'], 'readwrite');
  for (const store of ['records', 'pageContent', 'blobs', 'meta'] as const) {
    const range = IDBKeyRange.bound(userId + '|', userId + '|￿');
    tx.objectStore(store).delete(range);
  }
  await new Promise<void>((resolve, reject) => { tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); });
}
