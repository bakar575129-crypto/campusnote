// Yerel-öncelikli veri deposu ve eşitleme motoru.
// Her değişiklik önce bellekte ve IndexedDB'de saklanır (internet olmasa da), sonra sunucuya gönderilir.
// Sunucu iyimser kilit kullanır: çakışmada hiçbir düzenleme sessizce silinmez (bkz. resolveConflict).

import {useSyncExternalStore} from 'react';
import {api, ApiError} from './api';
import {idbAllByUser, idbBatch, idbGet, idbPut} from './idb';
import {uuid} from './ids';
import type {EntityMap, EntityName, Page, PageContent} from './types';
import {ENTITY_NAMES} from './types';
import {pendingUploadIds, setFilesUser, uploadPending} from './files';

export interface LocalRecord<E extends EntityName = EntityName> {
  entity: E;
  id: string;
  data: EntityMap[E];
  /** Sunucudaki revizyon (0 = sunucuda hiç yok). */
  rev: number;
  dirty: boolean;
  deleted: boolean;
  /** Her yerel değişiklikte artar; gönderim sürerken yeni değişiklik olduysa kayıt kirli kalır. */
  version: number;
  /** Sayfa içeriği bellekte yok / sunucuda daha yenisi var. */
  stale?: boolean;
  error?: string;
}
type Stored = Omit<LocalRecord, 'data'> & {userId: string; data: unknown};

export type SyncState = {phase: 'idle' | 'syncing' | 'offline' | 'error'; pending: number; lastSync: number | null; message?: string};
export type StoreEvent =
  | {type: 'toast'; kind: 'info' | 'error' | 'success'; message: string}
  | {type: 'notebook-limit'; message: string}
  | {type: 'unauthorized'}
  | {type: 'pages-updated'; notebookId: string};

const tables = new Map<EntityName, Map<string, LocalRecord>>(ENTITY_NAMES.map(e => [e, new Map()]));
const versions = new Map<EntityName, number>(ENTITY_NAMES.map(e => [e, 0]));
const listeners = new Set<() => void>();
const eventListeners = new Set<(e: StoreEvent) => void>();
const snapshots = new Map<EntityName, {version: number; list: unknown[]}>();
let userId: string | null = null;
let syncState: SyncState = {phase: 'idle', pending: 0, lastSync: null};
let syncTimer: ReturnType<typeof setTimeout> | null = null;
let syncing: Promise<void> | null = null;
let syncAgain = false;
const persistTimers = new Map<string, ReturnType<typeof setTimeout>>();
const persistJobs = new Map<string, () => void>();
/** Bekleyen cihaz yazmalarını hemen yapar (sekme kapanırken veri kaybolmasın). */
export function flushPersist() { for (const job of [...persistJobs.values()]) job(); }
const loadedNotebooks = new Set<string>();

const rkey = (entity: EntityName, id: string) => `${userId}|${entity}|${id}`;
const uid = () => userId as string;
const ckey = (pageId: string) => `${userId}|${pageId}`;

function emitChange(entity: EntityName) {
  versions.set(entity, (versions.get(entity) || 0) + 1);
  for (const l of listeners) l();
}
export function emit(event: StoreEvent) { for (const l of eventListeners) l(event); }
export function onStoreEvent(fn: (e: StoreEvent) => void) { eventListeners.add(fn); return () => { eventListeners.delete(fn); }; }
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

function setSyncState(patch: Partial<SyncState>) {
  syncState = {...syncState, ...patch, pending: countPending()};
  for (const l of listeners) l();
}
export const getSyncState = () => syncState;
function countPending() {
  let n = 0;
  for (const t of tables.values()) for (const r of t.values()) if (r.dirty) n++;
  return n;
}

// ---------------------------------------------------------------- okuma

export function getRecord<E extends EntityName>(entity: E, id: string): LocalRecord<E> | undefined {
  return tables.get(entity)!.get(id) as LocalRecord<E> | undefined;
}
export function get<E extends EntityName>(entity: E, id: string): EntityMap[E] | undefined {
  const r = getRecord(entity, id);
  return r && !r.deleted ? r.data : undefined;
}
export function list<E extends EntityName>(entity: E): EntityMap[E][] {
  const snap = snapshots.get(entity);
  const version = versions.get(entity) || 0;
  if (snap && snap.version === version) return snap.list as EntityMap[E][];
  const out: EntityMap[E][] = [];
  for (const r of tables.get(entity)!.values()) if (!r.deleted) out.push(r.data as EntityMap[E]);
  snapshots.set(entity, {version, list: out});
  return out;
}

/** React: bir kayıt türünün canlı listesi. */
export function useList<E extends EntityName>(entity: E): EntityMap[E][] {
  return useSyncExternalStore(subscribe, () => list(entity));
}
export function useRecord<E extends EntityName>(entity: E, id: string | undefined): EntityMap[E] | undefined {
  return useSyncExternalStore(subscribe, () => (id ? get(entity, id) : undefined));
}
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribe, getSyncState);
}

// ---------------------------------------------------------------- yazma

function persist(rec: LocalRecord, immediate = false) {
  if (!userId) return;
  const key = rkey(rec.entity, rec.id);
  const write = () => {
    persistTimers.delete(key);
    persistJobs.delete(key);
    const {data, ...meta} = rec;
    const ops: Parameters<typeof idbBatch>[0] = [];
    if (rec.entity === 'page') {
      const {content, ...pageMeta} = data as Page;
      ops.push({store: 'records', key, value: {...meta, userId: uid(), data: pageMeta} satisfies Stored});
      if (content) ops.push({store: 'pageContent', key: ckey(rec.id), value: content});
    } else {
      ops.push({store: 'records', key, value: {...meta, userId: uid(), data} satisfies Stored});
    }
    idbBatch(ops).catch(() => emit({type: 'toast', kind: 'error', message: 'Cihaz depolamasına yazılamadı. Tarayıcının depolama alanı dolmuş olabilir.'}));
  };
  clearTimeout(persistTimers.get(key));
  if (immediate) write(); else { persistTimers.set(key, setTimeout(write, 250)); persistJobs.set(key, write); }
}

function removeLocal(entity: EntityName, id: string) {
  tables.get(entity)!.delete(id);
  const ops: Parameters<typeof idbBatch>[0] = [{store: 'records', key: rkey(entity, id), remove: true}];
  if (entity === 'page') ops.push({store: 'pageContent', key: ckey(id), remove: true});
  clearTimeout(persistTimers.get(rkey(entity, id)));
  persistJobs.delete(rkey(entity, id));
  idbBatch(ops).catch(() => {});
  emitChange(entity);
}

type Draft<E extends EntityName> = Omit<EntityMap[E], 'rev' | 'createdAt' | 'updatedAt'> & Partial<Pick<EntityMap[E], 'rev' | 'createdAt' | 'updatedAt'>>;

/** Yeni kayıt ekler veya mevcut kaydı değiştirir (yerelde hemen, sunucuya kısa süre sonra). */
export function put<E extends EntityName>(entity: E, draft: Draft<E>): EntityMap[E] {
  const table = tables.get(entity)!;
  const prev = table.get(draft.id);
  const now = Date.now();
  const data = {...draft, rev: prev?.rev ?? 0, createdAt: prev?.data.createdAt ?? draft.createdAt ?? now, updatedAt: now} as EntityMap[E];
  const rec: LocalRecord = {entity, id: draft.id, data, rev: prev?.rev ?? 0, dirty: true, deleted: false, version: (prev?.version ?? 0) + 1};
  table.set(draft.id, rec);
  persist(rec);
  emitChange(entity);
  scheduleSync();
  return data;
}

export function update<E extends EntityName>(entity: E, id: string, patch: Partial<EntityMap[E]>) {
  const cur = get(entity, id);
  if (!cur) return;
  put(entity, {...cur, ...patch} as Draft<E>);
}

export function remove(entity: EntityName, id: string) {
  const rec = tables.get(entity)!.get(id);
  if (!rec) return;
  if (rec.rev === 0) { removeLocal(entity, id); return; }
  const next = {...rec, deleted: true, dirty: true, version: rec.version + 1};
  tables.get(entity)!.set(id, next);
  persist(next, true);
  emitChange(entity);
  scheduleSync();
}

// ---------------------------------------------------------------- oturum

export async function loadUser(id: string) {
  userId = id;
  await setFilesUser(id);
  for (const t of tables.values()) t.clear();
  loadedNotebooks.clear();
  const stored = await idbAllByUser<Stored>('records', id).catch(() => [] as Stored[]);
  for (const s of stored) {
    const {userId: _u, ...rec} = s;
    void _u;
    tables.get(rec.entity)?.set(rec.id, {...rec, stale: rec.entity === 'page' ? true : rec.stale} as LocalRecord);
  }
  for (const e of ENTITY_NAMES) emitChange(e);
  setSyncState({lastSync: null});
}

export function unloadUser() {
  userId = null;
  void setFilesUser(null);
  for (const t of tables.values()) t.clear();
  loadedNotebooks.clear();
  if (syncTimer) clearTimeout(syncTimer);
  for (const e of ENTITY_NAMES) emitChange(e);
}
export const currentUserId = () => userId;
export function hasUnsyncedChanges() { return countPending() > 0 || pendingUploadIds().length > 0; }

// ---------------------------------------------------------------- sayfalar

/** Defteri açarken sayfa içeriklerini önce cihazdan, bağlantı varsa sunucudan getirir. */
export async function loadNotebookPages(notebookId: string, force = false): Promise<void> {
  if (!userId) return;
  const pages = [...tables.get('page')!.values()].filter(r => (r.data as Page).notebookId === notebookId);
  for (const rec of pages) {
    const page = rec.data as Page;
    if (!page.content) {
      const content = await idbGet<PageContent>('pageContent', ckey(rec.id)).catch(() => undefined);
      if (content) rec.data = {...page, content} as Page;
    }
  }
  emitChange('page');
  if (loadedNotebooks.has(notebookId) && !force && !pages.some(r => r.stale)) return;
  const nb = getRecord('notebook', notebookId);
  if (!nb || nb.rev === 0 || !navigator.onLine) return;
  try {
    const res = await api<{pages: Page[]}>(`/api/notebooks/${notebookId}/pages`);
    for (const server of res.pages) {
      const local = getRecord('page', server.id);
      if (local?.dirty) { if (local.rev !== server.rev) local.stale = true; continue; }
      const rec: LocalRecord = {entity: 'page', id: server.id, data: server, rev: server.rev, dirty: false, deleted: false, version: local?.version ?? 0};
      tables.get('page')!.set(server.id, rec);
      persist(rec, true);
    }
    // Sunucuda olmayan ve yerelde temiz (gönderilmiş) sayfalar başka cihazda silinmiştir.
    const ids = new Set(res.pages.map(p => p.id));
    for (const rec of pages) if (!ids.has(rec.id) && !rec.dirty && rec.rev > 0) removeLocal('page', rec.id);
    loadedNotebooks.add(notebookId);
    emitChange('page');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) emit({type: 'unauthorized'});
  }
}

export function notebookPages(notebookId: string): Page[] {
  return list('page').filter(p => p.notebookId === notebookId).sort((a, b) => a.position - b.position || a.createdAt - b.createdAt);
}

// ---------------------------------------------------------------- eşitleme

export function scheduleSync(delay = 1200) {
  if (!userId) return;
  if (syncTimer) clearTimeout(syncTimer);
  syncTimer = setTimeout(() => { void syncNow(); }, delay);
}

export function syncNow(): Promise<void> {
  if (!userId) return Promise.resolve();
  if (syncing) { syncAgain = true; return syncing; }
  syncing = (async () => {
    try {
      do {
        syncAgain = false;
        await runSync();
      } while (syncAgain);
    } finally {
      syncing = null;
    }
  })();
  return syncing;
}

const PUSH_ORDER: EntityName[] = ['settings', 'notebook', 'sticker', 'font', 'lesson', 'task', 'focus', 'page'];

async function runSync() {
  if (!navigator.onLine) { setSyncState({phase: 'offline'}); return; }
  setSyncState({phase: 'syncing'});
  try {
    const uploadError = await uploadPending();
    if (uploadError) emit({type: 'toast', kind: 'error', message: uploadError});
    for (const entity of PUSH_ORDER) {
      for (const rec of [...tables.get(entity)!.values()]) {
        if (rec.dirty) await pushRecord(rec);
      }
    }
    await pull();
    setSyncState({phase: countPending() ? 'error' : 'idle', lastSync: Date.now(), message: undefined});
    if (countPending()) scheduleSync(15000);
  } catch (error) {
    if (error instanceof ApiError && error.status === 0) { setSyncState({phase: 'offline'}); scheduleSync(10000); return; }
    if (error instanceof ApiError && error.status === 401) { setSyncState({phase: 'error', message: 'Oturum sona erdi'}); emit({type: 'unauthorized'}); return; }
    setSyncState({phase: 'error', message: error instanceof Error ? error.message : 'Eşitleme hatası'});
    scheduleSync(20000);
  }
}

function pushBody(rec: LocalRecord) {
  const {id: _i, rev: _r, createdAt: _c, updatedAt: _u, ...data} = rec.data as unknown as Record<string, unknown>;
  void _i; void _r; void _c; void _u;
  if (rec.entity === 'settings') return {rev: rec.rev, data: {data: (rec.data as EntityMap['settings']).data}};
  return {rev: rec.rev, data};
}

async function pushRecord(rec: LocalRecord) {
  const url = rec.entity === 'settings' ? '/api/sync/settings/me' : `/api/sync/${rec.entity}/${rec.id}`;
  const sentVersion = rec.version;
  try {
    if (rec.deleted) {
      await api(`${url}?rev=${rec.rev}`, {method: 'DELETE'});
      const cur = getRecord(rec.entity, rec.id);
      if (cur && cur.version === sentVersion) removeLocal(rec.entity, rec.id);
      return;
    }
    if (rec.entity === 'page' && !(rec.data as Page).content) {
      const content = await idbGet<PageContent>('pageContent', ckey(rec.id)).catch(() => undefined);
      if (!content) return; // içerik bu cihazda yoksa gönderilecek bir şey de yoktur
      rec.data = {...(rec.data as Page), content};
    }
    const res = await api<{rev: number; updatedAt: number}>(url, {method: 'PUT', json: pushBody(rec)});
    const cur = getRecord(rec.entity, rec.id);
    if (!cur) return;
    cur.rev = res.rev;
    cur.data = {...cur.data, rev: res.rev};
    cur.error = undefined;
    if (cur.version === sentVersion) cur.dirty = false;
    persist(cur, true);
    emitChange(rec.entity);
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    if (error.status === 0 || error.status === 401 || error.status >= 500) throw error;
    await handlePushError(rec, error);
  }
}

async function handlePushError(rec: LocalRecord, error: ApiError) {
  const current = error.body.current as EntityMap[EntityName] | undefined;
  if (error.code === 'CONFLICT' && current) { resolveConflict(rec, current); return; }
  if (error.code === 'NOTEBOOK_LIMIT') {
    // Defter silinmez: çöp kutusuna alınır, kullanıcı yer açınca geri getirebilir.
    const nb = rec.data as EntityMap['notebook'];
    rec.data = {...nb, trashedAt: Date.now()};
    rec.version++;
    persist(rec, true);
    emitChange('notebook');
    emit({type: 'notebook-limit', message: error.message});
    return;
  }
  if (error.code === 'MISSING_FILE' || error.code === 'MISSING_PARENT') { rec.error = error.message; return; }
  rec.error = error.message;
  if (error.status === 413 || error.status === 400) {
    emit({type: 'toast', kind: 'error', message: `Kaydedilemedi: ${error.message} (Değişikliğin bu cihazda korunuyor.)`});
  }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const strip = (d: object) => { const {rev: _r, updatedAt: _u, createdAt: _c, ...rest} = d as Record<string, unknown>; void _r; void _u; void _c; return rest; };

/** Çakışma çözümü: içerik aynıysa sunucu revizyonu benimsenir; farklıysa hiçbir sürüm kaybolmaz. */
function resolveConflict(rec: LocalRecord, current: EntityMap[EntityName]) {
  const table = tables.get(rec.entity)!;
  if (rec.deleted) {
    // Başka cihaz kaydı değiştirmiş: silme iptal, güncel sürüm geri gelir.
    table.set(rec.id, {entity: rec.entity, id: rec.id, data: current, rev: current.rev, dirty: false, deleted: false, version: rec.version + 1});
    persist(table.get(rec.id)!, true);
    emitChange(rec.entity);
    emit({type: 'toast', kind: 'info', message: 'Sildiğin bir kayıt başka cihazda değiştirildiği için geri getirildi.'});
    return;
  }
  if (same(strip(rec.data), strip(current))) {
    rec.rev = current.rev; rec.data = {...rec.data, rev: current.rev}; rec.dirty = false;
    persist(rec, true);
    return;
  }
  if (rec.entity === 'page') {
    const mine = rec.data as Page;
    const theirs = current as Page;
    // Sunucudaki sürüm sayfanın yerine geçer, bu cihazdaki sürüm hemen arkasına ayrı sayfa olarak eklenir.
    table.set(rec.id, {entity: 'page', id: rec.id, data: theirs, rev: theirs.rev, dirty: false, deleted: false, version: rec.version + 1});
    persist(table.get(rec.id)!, true);
    const copyId = uuid();
    const next = notebookPages(mine.notebookId).find(p => p.position > theirs.position);
    const position = next ? (theirs.position + next.position) / 2 : theirs.position + 1;
    put('page', {id: copyId, notebookId: mine.notebookId, position, content: mine.content});
    emitChange('page');
    emit({type: 'pages-updated', notebookId: mine.notebookId});
    emit({type: 'toast', kind: 'info', message: 'Bu sayfa başka bir cihazda da değişmiş. İki sürüm de korundu: senin sürümün hemen sonraki sayfada.'});
    return;
  }
  if (rec.entity === 'task' || rec.entity === 'lesson') {
    table.set(rec.id, {entity: rec.entity, id: rec.id, data: current, rev: current.rev, dirty: false, deleted: false, version: rec.version + 1});
    persist(table.get(rec.id)!, true);
    const mine = rec.data as EntityMap['task'] | EntityMap['lesson'];
    put(rec.entity, {...mine, id: uuid(), title: `${mine.title} (bu cihaz)`} as never);
    emit({type: 'toast', kind: 'info', message: `"${mine.title}" başka cihazda da düzenlenmiş; iki sürüm de listede.`});
    return;
  }
  // Defter bilgisi, ayarlar, arşiv kayıtları: bu cihazdaki son düzenleme geçerli olur (sunucu sürümünün üstüne yazılır).
  rec.rev = current.rev;
  rec.data = {...rec.data, rev: current.rev};
  syncAgain = true;
  persist(rec, true);
}

async function pull() {
  if (!userId) return;
  const cursorKey = `${userId}|cursor`;
  const since = (await idbGet<number>('meta', cursorKey).catch(() => 0)) || 0;
  const res = await api<{cursor: number; records: Record<EntityName, EntityMap[EntityName][]>; deletions: {entity: EntityName; id: string}[]}>(`/api/sync?since=${since}`);
  const touchedNotebooks = new Set<string>();
  for (const entity of ENTITY_NAMES) {
    const incoming = res.records[entity] || [];
    if (!incoming.length) continue;
    const table = tables.get(entity)!;
    for (const server of incoming) {
      const id = entity === 'settings' ? 'me' : server.id;
      const local = table.get(id);
      if (local && local.rev === server.rev && !local.stale) continue;
      if (local?.dirty) continue; // gönderim sırasında çakışma olarak çözülür
      if (entity === 'page') {
        const page = server as Page;
        const rec: LocalRecord = {entity, id, data: {...page, content: undefined}, rev: page.rev, dirty: false, deleted: false, version: local?.version ?? 0, stale: true};
        table.set(id, rec);
        persist(rec, true);
        touchedNotebooks.add(page.notebookId);
      } else {
        const rec: LocalRecord = {entity, id, data: {...server, id} as EntityMap[EntityName], rev: server.rev, dirty: false, deleted: false, version: local?.version ?? 0};
        table.set(id, rec);
        persist(rec, true);
      }
    }
    emitChange(entity);
  }
  for (const d of res.deletions) {
    const local = getRecord(d.entity, d.id);
    if (local && !local.dirty) {
      removeLocal(d.entity, d.id);
      if (d.entity === 'page') touchedNotebooks.add((local.data as Page).notebookId);
    }
  }
  await idbPut('meta', cursorKey, res.cursor);
  for (const nb of touchedNotebooks) emit({type: 'pages-updated', notebookId: nb});
}

// Bağlantı geri gelince, sekme öne gelince ve düzenli aralıklarla eşitle.
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => scheduleSync(300));
  window.addEventListener('pagehide', flushPersist);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushPersist(); });
  window.addEventListener('offline', () => setSyncState({phase: 'offline'}));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') scheduleSync(300); });
  setInterval(() => { if (userId && document.visibilityState === 'visible') void syncNow(); }, 60000);
}
