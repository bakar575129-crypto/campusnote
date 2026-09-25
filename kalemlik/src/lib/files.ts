// Dosyalar (PDF sayfa görüntüleri, stickerlar, yazı tipleri): önce cihazda saklanır, bağlantı varken yüklenir.
// Kimliği istemci üretir; böylece dosya henüz yüklenmemişken de sayfalar ona başvurabilir.

import {api, ApiError} from './api';
import {idbAllByUser, idbGet, idbPut} from './idb';
import {uuid} from './ids';

export type FileKind = 'page' | 'image' | 'sticker' | 'font' | 'pdf';
interface BlobRecord {userId: string; id: string; blob: Blob; kind: FileKind; name: string; uploaded: boolean}

let userId: string | null = null;
const pending = new Map<string, BlobRecord>();
const urls = new Map<string, string>();
const urlJobs = new Map<string, Promise<string | null>>();
const images = new Map<string, Promise<HTMLImageElement | null>>();

export async function setFilesUser(id: string | null) {
  userId = id;
  pending.clear();
  for (const url of urls.values()) URL.revokeObjectURL(url);
  urls.clear(); urlJobs.clear(); images.clear();
  if (!id) return;
  const all = await idbAllByUser<BlobRecord>('blobs', id).catch(() => [] as BlobRecord[]);
  for (const r of all) if (!r.uploaded) pending.set(r.id, r);
}

export const pendingUploadIds = () => [...pending.keys()];

/** Dosyayı cihazda saklar ve yükleme kuyruğuna ekler; hemen kullanılabilir bir kimlik döner. */
export async function saveFile(blob: Blob, kind: FileKind, name: string): Promise<string> {
  if (!userId) throw new Error('Oturum yok');
  const id = uuid();
  const rec: BlobRecord = {userId, id, blob, kind, name, uploaded: false};
  await idbPut('blobs', `${userId}|${id}`, rec);
  pending.set(id, rec);
  urls.set(id, URL.createObjectURL(blob));
  return id;
}

/** Bekleyen dosyaları yükler. Hata mesajı döndürür (kota dolu vb.), bağlantı yoksa sessizce bekler. */
export async function uploadPending(): Promise<string | null> {
  for (const rec of [...pending.values()]) {
    const form = new FormData();
    form.append('id', rec.id);
    form.append('kind', rec.kind);
    form.append('file', rec.blob, rec.name);
    try {
      await api('/api/files', {method: 'POST', body: form});
      rec.uploaded = true;
      pending.delete(rec.id);
      await idbPut('blobs', `${rec.userId}|${rec.id}`, rec).catch(() => {});
    } catch (error) {
      if (error instanceof ApiError && (error.status === 0 || error.status === 401 || error.status >= 500)) throw error;
      if (error instanceof ApiError) return `"${rec.name}" yüklenemedi: ${error.message}`;
      throw error;
    }
  }
  return null;
}

/** Dosyanın gösterilebilir adresi: önce cihazdaki kopya, yoksa sunucudan indirilip cihazda saklanır. */
export function fileUrl(id: string): Promise<string | null> {
  const known = urls.get(id);
  if (known) return Promise.resolve(known);
  let job = urlJobs.get(id);
  if (!job) {
    job = (async () => {
      const local = userId ? await idbGet<BlobRecord>('blobs', `${userId}|${id}`).catch(() => undefined) : undefined;
      let blob = local?.blob;
      if (!blob) {
        try {
          const res = await fetch(`/api/files/${id}`, {credentials: 'same-origin'});
          if (!res.ok) return null;
          blob = await res.blob();
          if (userId) void idbPut('blobs', `${userId}|${id}`, {userId, id, blob, kind: 'image', name: id, uploaded: true} satisfies BlobRecord).catch(() => {});
        } catch { return null; }
      }
      const url = URL.createObjectURL(blob);
      urls.set(id, url);
      return url;
    })();
    urlJobs.set(id, job);
    job.then(url => { if (!url) urlJobs.delete(id); });
  }
  return job;
}

export async function fileBlob(id: string): Promise<Blob | null> {
  const url = await fileUrl(id);
  if (!url) return null;
  return (await fetch(url)).blob();
}

export function loadImage(id: string): Promise<HTMLImageElement | null> {
  let job = images.get(id);
  if (!job) {
    job = fileUrl(id).then(url => url ? new Promise<HTMLImageElement | null>(resolve => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = url;
    }) : null);
    images.set(id, job);
    job.then(img => { if (!img) images.delete(id); });
  }
  return job;
}

/** Bellekte yüklü görseli senkron döndürür (çizim sırasında beklememek için). */
const loadedImages = new Map<string, HTMLImageElement>();
export function cachedImage(id: string, onReady?: () => void): HTMLImageElement | null {
  const img = loadedImages.get(id);
  if (img) return img;
  void loadImage(id).then(i => { if (i) { loadedImages.set(id, i); onReady?.(); } });
  return null;
}
