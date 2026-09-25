// Otomatik el yazısı düzeltme.
// Kalem kısa bir süre durunca, o arada yazılan çizgiler satırlara ve kelimelere ayrılır; her satır
// şablonun çizgisine (çizgili) ya da karelerin içine (kareli) oturtulur, boyutu gerekiyorsa ayarlanır.
// Kelimeler üst üste binmez; aynı satırda sağda kalan yazı gerektiği kadar itilir; sayfaya sığmayan
// kelime bir alt satıra geçer. Sonuç tek geri al adımıdır.

import type {PageContent, Stroke, WriteSettings} from '@/lib/types';
import {inkBox, strokeBox, type Box, right as boxRight} from './geometry';
import {writingGuide} from './paper';
import {measureRun, round} from './ink';
import {shortId} from '@/lib/ids';

export type WriteOptions = Pick<WriteSettings, 'size' | 'weight' | 'spacing'>;
type Guide = ReturnType<typeof writingGuide>;

const center = (b: Box) => b.y + b.h / 2;

/** Çizim, şekil, altı çizme veya fosforlu gibi yazı olmayan grupları ayıklar. */
export function isWritingStroke(s: Stroke) {
  return s.t === 'pen' && s.pen !== 'highlighter';
}
export function looksLikeWriting(strokes: Stroke[], gap: number) {
  const b = inkBox(strokes);
  if (!b || !strokes.length) return false;
  if (!strokes.every(isWritingStroke)) return false;
  if (strokes.length > 200) return false;
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

/** Yatay boşluklara göre kelimelere ayırır (soldan sağa). Harfin noktası/şapkası kelimede kalır. */
export function splitWords(strokes: Stroke[], gap: number): Stroke[][] {
  const items = strokes.map(s => ({s, b: strokeBox(s)})).sort((a, b) => a.b.x - b.b.x);
  const words: {right: number; list: Stroke[]}[] = [];
  const space = Math.max(10, gap * 0.32);
  for (const it of items) {
    const last = words[words.length - 1];
    if (last && it.b.x - last.right < space) { last.list.push(it.s); last.right = Math.max(last.right, boxRight(it.b)); }
    else words.push({right: boxRight(it.b), list: [it.s]});
  }
  return words.map(w => w.list);
}

/** Yatayda üst üste binen çizgiler tek harf sayılır. */
function letterClusters(strokes: Stroke[]) {
  const items = strokes.map(s => ({s, b: strokeBox(s)})).sort((a, b) => a.b.x - b.b.x);
  const out: {ids: Set<string>; x: number; right: number}[] = [];
  for (const it of items) {
    const last = out[out.length - 1];
    if (last && it.b.x <= last.right + 1) { last.ids.add(it.s.id); last.right = Math.max(last.right, boxRight(it.b)); }
    else out.push({ids: new Set([it.s.id]), x: it.b.x, right: boxRight(it.b)});
  }
  return out;
}

interface LinePlan {scale: number; baseline: number; bodyTarget: number}

/** Satırın hedef ölçeği ve taban çizgisi. */
function planLine(strokes: Stroke[], guide: Guide, opts: WriteOptions, pageH: number): LinePlan {
  const {gap, origin, cell} = guide;
  const m = inkMetrics(strokes);
  const bodyTarget = gap * (cell ? 0.5 : 0.42) * opts.size;
  let scale = bodyTarget / m.body;
  // Zaten okunur boyuttaysa gereksiz küçültme/büyütme yapılmaz.
  if (!cell && m.body >= bodyTarget * 0.72 && m.body <= bodyTarget * 1.3) scale = 1;
  scale = Math.max(0.3, Math.min(2.2, scale));
  // Satıra sığsın: çizgilide en fazla ~1,5 satır, karelide karenin %92'si yükseklik.
  const maxH = cell ? gap * 0.92 : gap * 1.5;
  if (m.box.h * scale > maxH) scale = Math.min(scale, maxH / m.box.h);
  const above = (m.baseline - m.box.y) * scale, below = (m.box.y + m.box.h - m.baseline) * scale;
  let baseline: number;
  if (cell) {
    const row = Math.floor((m.baseline - m.body / 2 - origin) / gap);
    const rowTop = origin + row * gap;
    const body = m.body * scale;
    baseline = rowTop + (gap - body) / 2 + body;
    // Harfin uzun kısımları kareden taşmasın.
    if (baseline - above < rowTop + 1) baseline = rowTop + 1 + above;
    if (baseline + below > rowTop + gap - 1) baseline = Math.max(rowTop + 1 + above, rowTop + gap - 1 - below);
  } else {
    baseline = origin + Math.round((m.baseline - origin) / gap) * gap;
    if (baseline <= origin && origin > 0) baseline = origin + gap;
  }
  while (baseline - above < 4) baseline += gap;
  while (baseline + below > pageH - 4 && baseline - gap - above >= 4) baseline -= gap;
  return {scale, baseline, bodyTarget};
}

const weightFactor = (w: number) => 0.55 + 0.09 * w; // 5 = kalemin kendi kalınlığı

/**
 * "Kendi el yazım" kipi: gruptaki çizgileri satıra/kareye oturtur. Tüm sayfanın yeni çizgi listesini döndürür
 * (değişiklik yoksa null). Gruptaki çizgilerin kimlikleri korunur.
 */
export function correctHandwriting(all: Stroke[], groupIds: string[], content: PageContent, opts: WriteOptions): Stroke[] | null {
  const guide = writingGuide(content);
  const ids = new Set(groupIds);
  const group = all.filter(s => ids.has(s.id) && isWritingStroke(s));
  if (!group.length || !looksLikeWriting(group, guide.gap)) return null;
  const moved = new Map<string, Stroke>();
  const shifted = new Map<string, number>();
  const minGap = Math.max(8, guide.gap * 0.3);

  for (const line of splitLines(group, guide.gap)) {
    const plan = planLine(line, guide, opts, content.height);
    const m = inkMetrics(line);
    const words = splitWords(line, guide.gap);
    const lineLeft = m.box.x;
    let startX = lineLeft;
    if (guide.cell) startX = Math.round(lineLeft / guide.gap) * guide.gap + guide.gap * 0.15;
    // Solda aynı satırda (daha önce yazılmış) yazı varsa ona değmesin.
    const band = (b: Box) => Math.abs(center(b) - (m.baseline - m.body / 2)) < guide.gap * 0.7;
    const others = all.filter(s => !ids.has(s.id));
    for (const s of others) {
      const b = strokeBox(s);
      if (band(b) && boxRight(b) <= lineLeft + 2 && lineLeft - boxRight(b) < guide.gap * 3) startX = Math.max(startX, boxRight(b) + minGap);
    }
    let baseline = plan.baseline;
    let cursor = startX;
    let first = true;
    const oldRight = boxRight(m.box);
    for (const word of words) {
      const wb = inkBox(word)!;
      const clusters = letterClusters(word);
      const extra = opts.spacing * Math.max(0, clusters.length - 1);
      const width = wb.w * plan.scale + extra;
      let x = first ? cursor : Math.max(cursor, startX + (wb.x - lineLeft) * plan.scale);
      if (!first && x - cursor > guide.gap * 2) x = cursor; // aşırı boşluk kapatılır
      if (x + width > guide.right && x > startX + 1) { // taşıyorsa alt satıra
        baseline += guide.gap;
        x = Math.max(guide.left, Math.min(startX, lineLeft));
      }
      const offsets = new Map<string, number>();
      clusters.forEach((c, i) => { for (const id of c.ids) offsets.set(id, i * opts.spacing); });
      for (const s of word) {
        const off = offsets.get(s.id) || 0;
        const pts = s.pts.slice();
        for (let i = 0; i + 2 < pts.length; i += 3) {
          pts[i] = round(x + (pts[i] - wb.x) * plan.scale + off);
          pts[i + 1] = round(baseline + (pts[i + 1] - m.baseline) * plan.scale);
        }
        moved.set(s.id, {...s, pts, w: Math.max(0.3, Math.min(80, s.w * Math.max(0.6, Math.min(1.4, plan.scale)) * weightFactor(opts.weight)))});
      }
      cursor = x + width + minGap;
      first = false;
    }
    // Sağdaki yazı itilir (aynı satır, grubun eski sağ kenarından sonra başlayan).
    const newRight = cursor - minGap;
    const delta = newRight + minGap - oldRight;
    if (delta > 0.5) {
      for (const s of others) {
        const b = strokeBox(s);
        if (band(b) && b.x >= oldRight - 2 && b.x < oldRight + delta) {
          shifted.set(s.id, Math.max(shifted.get(s.id) || 0, Math.min(delta, Math.max(0, content.width - 4 - boxRight(b)))));
        }
      }
      // İtilen yazının da sağındakiler aynı miktarda kayar: kelime aralıkları korunur.
      const pushed = Math.max(0, ...shifted.values());
      if (pushed > 0) for (const s of others) {
        const b = strokeBox(s);
        if (band(b) && b.x >= oldRight - 2 && !shifted.has(s.id)) shifted.set(s.id, Math.min(pushed, Math.max(0, content.width - 4 - boxRight(b))));
      }
    }
  }
  if (!moved.size) return null;
  return all.map(s => {
    const mv = moved.get(s.id);
    if (mv) return mv;
    const dx = shifted.get(s.id);
    if (dx) return {...s, pts: s.pts.map((v, i) => (i % 3 === 0 ? round(v + dx) : v))};
    return s;
  });
}

/**
 * Yazı tipi kipi: tanınan metin, grubun yerine seçilen yazı tipinde tek satır olarak yerleştirilir.
 * Metin yoksa ya da çok uzunsa null (el yazısı korunur).
 */
export function replaceWithText(all: Stroke[], groupIds: string[], content: PageContent, text: string, font: string, color: string, opts: WriteOptions): Stroke[] | null {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || clean.length > 400 || /^\[.*\]$/.test(clean)) return null;
  const guide = writingGuide(content);
  const ids = new Set(groupIds);
  const group = all.filter(s => ids.has(s.id));
  if (!group.length) return null;
  const lines = splitLines(group, guide.gap);
  const firstLine = lines[0];
  const plan = planLine(firstLine, guide, opts, content.height);
  const m = inkMetrics(firstLine);
  let size = Math.max(10, Math.min(120, plan.bodyTarget / 0.5));
  const run = {text: clean, font, size, weight: Math.round(Math.max(1, Math.min(9, opts.weight))), spacing: opts.spacing * 0.5};
  let x = guide.cell ? Math.round(m.box.x / guide.gap) * guide.gap + guide.gap * 0.15 : m.box.x;
  let width = measureRun(run).width;
  const room = guide.right - x;
  if (width > room) {
    if (room > width * 0.6) { size *= room / width; run.size = size; width = room; }
    else { x = Math.max(guide.left, 20); }
  }
  const stroke: Stroke = {id: shortId(), t: 'text', c: color, w: 1, o: 1, pts: [round(x), round(plan.baseline), 1, round(x + width), round(plan.baseline), 1], run};
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
