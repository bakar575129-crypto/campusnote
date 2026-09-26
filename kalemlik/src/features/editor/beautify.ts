// Akıllı Yazı Güzelleştirme.
// Kullanıcının el yazısı tanınır ve AYNI metin, aynı yere, seçtiği yazı tipinde yerleştirilir.
// Kurallar:
//  • El yazısı hiçbir zaman kaydırılmaz, ölçeklenmez, yeniden düzenlenmez. Ya olduğu gibi kalır ya da (tanıma
//    kesinse) aynı konumda dijital yazıya dönüşür.
//  • Kelime bitmeden dönüştürme yapılmaz (kelimenin bittiğini anlama: kalem başka bir yere geçti, bekleme süresi
//    doldu; kalem kâğıdın üzerinde gezinirken süre yeniden başlar).
//  • Metin yeniden yazılmaz, imla düzeltilmez, kelime tahmin edilip değiştirilmez; tanıma emin değilse el yazısı korunur.

import type {PageContent, Stroke} from '@/lib/types';
import {inkBox, strokeBox, type Box, right as boxRight} from './geometry';
import {writingGuide} from './paper';
import {measureRun, round} from './ink';
import {shortId} from '@/lib/ids';

const center = (b: Box) => b.y + b.h / 2;

/** Tanıma dilleri. Yeni bir dil eklemek için buraya satır eklemek yeterlidir (sunucu istemi ve cihaz verisi). */
export const RECOGNITION_LANGS = [
  {id: 'tr', label: 'Türkçe', hint: 'Turkish (may contain English words)', device: 'tur'},
  {id: 'en', label: 'English', hint: 'English (may contain Turkish words)', device: 'tur'}, // Türkçe veri Latin harflerin tamamını içerir
] as const;
export type RecognitionLang = typeof RECOGNITION_LANGS[number]['id'];

/** Hız seçenekleri: kalem kalktıktan sonra "kelime bitti" saymadan önce beklenen süre. */
export const BEAUTIFY_SPEEDS = [
  {value: 300, label: 'Hızlı'},
  {value: 600, label: 'Normal'},
  {value: 1000, label: 'Yavaş'},
] as const;

/** Çizim, şekil, altı çizme veya fosforlu gibi yazı olmayan grupları ayıklar. */
export function isWritingStroke(s: Stroke) {
  return s.t === 'pen' && s.pen !== 'highlighter';
}
export function looksLikeWriting(strokes: Stroke[], gap: number) {
  const b = inkBox(strokes);
  if (!b || !strokes.length) return false;
  if (!strokes.every(isWritingStroke)) return false;
  if (strokes.length > 400) return false;
  if (b.w < 4 && b.h < 4) return false; // tek nokta
  if (b.h > gap * 5) return false; // büyük çizim / diyagram
  if (strokes.length === 1 && b.h < gap * 0.15 && b.w > gap * 1.5) return false; // düz çizgi (altını çizme)
  return true;
}

function percentile(sorted: number[], q: number) {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * q)))] : 0;
}

/** Yazının taban çizgisi ve gövde (küçük harf) yüksekliği; uzun/aşağı sarkan harfler tahmini bozmasın diye yüzdelik. */
export function inkMetrics(strokes: Stroke[]) {
  const ys: number[] = [];
  for (const s of strokes) for (let i = 1; i < s.pts.length; i += 3) ys.push(s.pts[i]);
  ys.sort((a, b) => a - b);
  const box = inkBox(strokes)!;
  const baseline = percentile(ys, 0.85), top = percentile(ys, 0.15);
  return {box, baseline, body: Math.max(baseline - top, box.h * 0.3, 3)};
}

/** Dikey konuma göre satırlara ayırır (üstten alta). */
export function splitLines(strokes: Stroke[], gap: number): Stroke[][] {
  const items = strokes.map(s => ({s, c: center(strokeBox(s))})).sort((a, b) => a.c - b.c);
  const lines: {c: number; list: Stroke[]}[] = [];
  for (const it of items) {
    const line = lines.find(l => Math.abs(l.c - it.c) < gap * 0.6);
    if (line) { line.list.push(it.s); line.c = line.list.reduce((n, s) => n + center(strokeBox(s)), 0) / line.list.length; }
    else lines.push({c: it.c, list: [it.s]});
  }
  return lines.sort((a, b) => a.c - b.c).map(l => l.list);
}

/**
 * Yeni dokunuş, bekleyen yazıdan "başka bir yere" mi geçti? (bir sonraki kelime, alt satır, sayfanın başka yeri)
 * Harfin noktası, şapkası, t'nin çizgisi gibi aynı kelimeye eklenen dokunuşlar uzak sayılmaz.
 */
export function movedAway(pending: Box, x: number, y: number, gap: number) {
  const space = Math.max(12, gap * 0.55);
  if (y < pending.y - gap * 0.9 || y > pending.y + pending.h + gap * 0.6) return true; // başka satır
  if (x > boxRight(pending) + space) return true; // sağda yeni kelime
  if (x < pending.x - space) return true; // solda başka yer
  return false;
}

/** Kalem, bekleyen yazının yakınında mı geziniyor? (yazmaya devam etmek üzere) */
export function hoveringNear(pending: Box, x: number, y: number, gap: number) {
  return x >= pending.x - gap && x <= boxRight(pending) + gap * 1.5 && y >= pending.y - gap && y <= pending.y + pending.h + gap;
}

/**
 * Tanınan metin, el yazısının kapladığı alanla tutarlı mı? Tanıma motoru bir kelimeyi uydurursa ya da
 * birkaç kelimeyi atlarsa harf sayısı ile yazının genişliği birbirini tutmaz; o zaman el yazısı korunur.
 */
export function consistentWithInk(text: string, strokes: Stroke[]) {
  const m = inkMetrics(strokes);
  const letters = [...text.replace(/\s+/g, '')].length;
  if (!letters) return false;
  const perLetter = m.box.w / letters; // harf başına genişlik
  // El yazısında harf genişliği gövde yüksekliğinin kabaca 0,3–3 katıdır.
  return perLetter >= m.body * 0.18 && perLetter <= m.body * 4.5;
}

/** Tanıma sonucunu temizler; yalnızca boşlukları sadeleştirir, harflere/kelimelere asla dokunmaz. */
export function cleanRecognized(text: string) {
  const t = text.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 400) return '';
  if (/\[(okunamadı|boş|\?)\]|^\?+$/i.test(t)) return ''; // tanıma emin değil
  if (/^["'“”‘’«»].*["'“”‘’«»]$/.test(t) && t.length > 2) return t.slice(1, -1).trim(); // motorun eklediği tırnaklar
  return t;
}

/**
 * Tanınan metni el yazısının yerine, aynı konuma (aynı sol kenar ve taban çizgisi) yerleştirir. Yazı boyutu el
 * yazısının yüksekliğinden gelir; yalnızca sağdaki yazıya ya da sayfa kenarına taşacaksa küçülür.
 * Dönüş: yeni çizgi listesi (null: yerleştirilemedi, el yazısı korunur).
 */
export function placeText(all: Stroke[], groupIds: string[], content: PageContent, text: string, font: string): Stroke[] | null {
  const clean = cleanRecognized(text);
  if (!clean) return null;
  const ids = new Set(groupIds);
  const group = all.filter(s => ids.has(s.id));
  if (!group.length) return null;
  const m = inkMetrics(group);
  const guide = writingGuide(content);
  // Gövde yüksekliği ≈ yazı tipinin x yüksekliği (~yazı boyutunun yarısı).
  let size = Math.max(10, Math.min(140, m.body / 0.5));
  const run = {text: clean, font, size, weight: 4, spacing: 0};
  let width = measureRun(run).width;
  // Aynı satırda sağdaki en yakın yazı (üstüne binmesin).
  let limit = Math.min(content.width - 8, Math.max(guide.right, boxRight(m.box)));
  for (const s of all) {
    if (ids.has(s.id)) continue;
    const b = strokeBox(s);
    const sameLine = b.y < m.baseline && b.y + b.h > m.baseline - m.body;
    if (sameLine && b.x >= boxRight(m.box) - 2) limit = Math.min(limit, b.x - 6);
  }
  const room = limit - m.box.x;
  if (width > room && room > 0) {
    const f = Math.max(0.55, room / width);
    size *= f; run.size = size; width *= f;
  }
  const color = group[0].c;
  const stroke: Stroke = {id: shortId(), t: 'text', c: color, w: 1, o: 1, pts: [round(m.box.x), round(m.baseline), 1, round(m.box.x + width), round(m.baseline), 1], run};
  const out = all.filter(s => !ids.has(s.id));
  out.push(stroke);
  return out;
}

/** Gruptaki çizgileri tanıma için beyaz zeminli PNG'ye çevirir. */
export function strokesToPng(strokes: Stroke[], draw: (ctx: CanvasRenderingContext2D, s: Stroke) => void): string | null {
  const b = inkBox(strokes);
  if (!b) return null;
  const pad = 16, scale = Math.min(3, 900 / Math.max(b.w, b.h, 1), Math.max(1, 64 / Math.max(b.h, 1)));
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil((b.w + pad * 2) * scale);
  canvas.height = Math.ceil((b.h + pad * 2) * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, (pad - b.x) * scale, (pad - b.y) * scale);
  for (const s of strokes) draw(ctx, {...s, c: '#000000', o: 1});
  return canvas.toDataURL('image/png');
}
