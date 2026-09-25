// Yazı tipleri: uygulamayla gelen Türkçe karakterli OFL yazı tipleri + kullanıcının yüklediği yazı tipleri.
import {fileBlob} from '@/lib/files';
import type {FontAsset} from '@/lib/types';

export interface FontInfo {id: string; name: string; family: string; kind: 'hand' | 'sans' | 'serif' | 'mono'; custom?: boolean; fileId?: string}

/** "own" = kullanıcının kendi el yazısı (metne çevrilmez). */
export const OWN_HANDWRITING = 'own';

export const BUILTIN_FONTS: FontInfo[] = [
  {id: 'caveat', name: 'Caveat (el yazısı)', family: 'Caveat', kind: 'hand'},
  {id: 'kalam', name: 'Kalam (el yazısı)', family: 'Kalam', kind: 'hand'},
  {id: 'patrick-hand', name: 'Patrick Hand (el yazısı)', family: 'Patrick Hand', kind: 'hand'},
  {id: 'playpen-sans', name: 'Playpen Sans (yuvarlak)', family: 'Playpen Sans', kind: 'hand'},
  {id: 'nunito', name: 'Nunito (sade)', family: 'Nunito', kind: 'sans'},
  {id: 'lora', name: 'Lora (tırnaklı)', family: 'Lora', kind: 'serif'},
  {id: 'jetbrains-mono', name: 'JetBrains Mono (eş aralıklı)', family: 'JetBrains Mono', kind: 'mono'},
];

const FALLBACK: Record<FontInfo['kind'], string> = {hand: 'cursive', sans: 'system-ui, sans-serif', serif: 'Georgia, serif', mono: 'ui-monospace, monospace'};

let customFonts: FontInfo[] = [];
const listeners = new Set<() => void>();

export function setCustomFonts(assets: FontAsset[]) {
  customFonts = assets.map(a => ({id: 'custom-' + a.id.slice(0, 36), name: a.name, family: 'KlmFont ' + a.id.slice(0, 8), kind: 'sans', custom: true, fileId: a.fileId}));
}
export const allFonts = () => [...BUILTIN_FONTS, ...customFonts];
export const findFont = (id: string) => allFonts().find(f => f.id === id);

export function fontStack(id: string) {
  const f = findFont(id) || BUILTIN_FONTS[4];
  return `"${f.family}", ${FALLBACK[f.kind]}`;
}

const loading = new Map<string, Promise<boolean>>();

/** Yazı tipini tuval çizimi için hazır hâle getirir (tuval, CSS gibi yazı tipini kendiliğinden yüklemez). */
export function ensureFont(id: string): Promise<boolean> {
  const f = findFont(id);
  if (!f || typeof document === 'undefined' || !document.fonts) return Promise.resolve(false);
  let job = loading.get(f.id);
  if (!job) {
    job = (async () => {
      try {
        if (f.custom && f.fileId) {
          const blob = await fileBlob(f.fileId);
          if (!blob) return false;
          const face = new FontFace(f.family, await blob.arrayBuffer(), {display: 'swap'});
          document.fonts.add(await face.load());
        } else {
          await Promise.all(['400', '700'].map(w => document.fonts.load(`${w} 32px "${f.family}"`, 'AaĞğŞşİıÇçÖöÜü')));
        }
        for (const l of listeners) l();
        return true;
      } catch {
        return false;
      }
    })();
    loading.set(f.id, job);
    job.then(ok => { if (!ok) loading.delete(f.id); });
  }
  return job;
}
export function onFontsLoaded(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

export const FONT_EXTENSIONS = ['.ttf', '.otf', '.woff', '.woff2'];
export const MAX_FONT_BYTES = 5 * 1024 * 1024;

/**
 * Seçilen dosyanın gerçekten yüklenebilen bir yazı tipi olduğunu doğrular ve eksik Türkçe harfleri bulur:
 * yazı tipinde olmayan harf yedek yazı tipiyle çizilir; iki farklı yedekle ölçülen genişlik değişir.
 */
export async function inspectFontFile(file: File): Promise<{name: string; missing: string}> {
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!FONT_EXTENSIONS.includes(ext)) throw new Error('Yalnızca .ttf, .otf, .woff ve .woff2 dosyaları yüklenebilir.');
  if (file.size > MAX_FONT_BYTES) throw new Error('Yazı tipi dosyası en fazla 5 MB olabilir.');
  const family = 'KlmCheck' + Math.random().toString(36).slice(2, 8);
  let face: FontFace;
  try { face = await new FontFace(family, await file.arrayBuffer()).load(); } catch { throw new Error('Bu dosya okunabilir bir yazı tipi değil.'); }
  document.fonts.add(face);
  const ctx = document.createElement('canvas').getContext('2d')!;
  const width = (text: string, fallback: string) => { ctx.font = `40px "${family}", ${fallback}`; return ctx.measureText(text).width; };
  const differs = (t: string) => Math.abs(width(t, 'monospace') - width(t, 'serif')) > 0.5;
  const missing = Array.from('çÇğĞıİöÖşŞüÜ').filter(differs).join('');
  const latinOk = !differs('abcdefghxyz');
  document.fonts.delete(face);
  if (!latinOk) throw new Error('Bu yazı tipi Latin harflerini içermiyor.');
  const name = file.name.slice(0, file.name.lastIndexOf('.')).replace(/[-_]+/g, ' ').trim().slice(0, 60) || 'Yazı tipi';
  return {name, missing};
}
