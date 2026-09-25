import type {Placed, Stroke, TextBox} from '@/lib/types';
import {measureRun, round} from './ink';
import {shortId} from '@/lib/ids';

export interface Box {x: number; y: number; w: number; h: number}
export const right = (b: Box) => b.x + b.w;
export const bottom = (b: Box) => b.y + b.h;

export function strokeBox(s: Stroke): Box {
  if (s.t === 'text' && s.run) {
    const m = measureRun(s.run);
    return {x: s.pts[0], y: s.pts[1] - m.ascent, w: Math.max(1, m.width), h: m.ascent + m.descent};
  }
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 2 < s.pts.length; i += 3) {
    const x = s.pts[i], y = s.pts[i + 1];
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  if (!Number.isFinite(x0)) return {x: 0, y: 0, w: 0, h: 0};
  const pad = s.w / 2;
  return {x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2};
}

/** Kalem noktalarının (kalınlık hariç) kutusu: yazı düzeltme hesapları için. */
export function inkBox(strokes: Stroke[]): Box | null {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes) {
    if (s.t === 'text') { const b = strokeBox(s); x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, right(b)); y1 = Math.max(y1, bottom(b)); continue; }
    for (let i = 0; i + 2 < s.pts.length; i += 3) {
      const x = s.pts[i], y = s.pts[i + 1];
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
  }
  return Number.isFinite(x0) ? {x: x0, y: y0, w: x1 - x0, h: y1 - y0} : null;
}

export function unionBox(boxes: Box[]): Box | null {
  if (!boxes.length) return null;
  const x0 = Math.min(...boxes.map(b => b.x)), y0 = Math.min(...boxes.map(b => b.y));
  const x1 = Math.max(...boxes.map(right)), y1 = Math.max(...boxes.map(bottom));
  return {x: x0, y: y0, w: x1 - x0, h: y1 - y0};
}

export const boxesTouch = (a: Box, b: Box) => a.x <= right(b) && b.x <= right(a) && a.y <= bottom(b) && b.y <= bottom(a);
export const boxContains = (outer: Box, inner: Box) => inner.x >= outer.x && inner.y >= outer.y && right(inner) <= right(outer) && bottom(inner) <= bottom(outer);

export function pointInPolygon(x: number, y: number, poly: number[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Kement: çizginin noktalarının çoğu (%60) çokgenin içindeyse seçilir. */
export function strokeInLasso(s: Stroke, poly: number[]) {
  if (s.t === 'text') { const b = strokeBox(s); return pointInPolygon(b.x + b.w / 2, b.y + b.h / 2, poly); }
  let inside = 0, total = 0;
  for (let i = 0; i + 2 < s.pts.length; i += 3) { total++; if (pointInPolygon(s.pts[i], s.pts[i + 1], poly)) inside++; }
  return total > 0 && inside / total >= 0.6;
}

export function strokeInRect(s: Stroke, r: Box) {
  const b = strokeBox(s);
  if (!boxesTouch(b, r)) return false;
  if (s.t === 'text') return boxContains(r, b) || (b.x + b.w / 2 >= r.x && b.x + b.w / 2 <= right(r) && b.y + b.h / 2 >= r.y && b.y + b.h / 2 <= bottom(r));
  let inside = 0, total = 0;
  for (let i = 0; i + 2 < s.pts.length; i += 3) { total++; const x = s.pts[i], y = s.pts[i + 1]; if (x >= r.x && x <= right(r) && y >= r.y && y <= bottom(r)) inside++; }
  return inside / total >= 0.6;
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax, dy = by - ay, len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len)) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Silgi dairesi çizgiye değiyor mu? (şekil kenarları dahil) */
export function strokeHit(s: Stroke, x: number, y: number, r: number) {
  const b = strokeBox(s);
  if (x < b.x - r || x > right(b) + r || y < b.y - r || y > bottom(b) + r) return false;
  if (s.t === 'text') return true;
  const reach = r + s.w / 2;
  const n = s.pts.length / 3;
  if (n === 1) return Math.hypot(s.pts[0] - x, s.pts[1] - y) <= reach;
  for (let i = 1; i < n; i++) if (distToSegment(x, y, s.pts[(i - 1) * 3], s.pts[(i - 1) * 3 + 1], s.pts[i * 3], s.pts[i * 3 + 1]) <= reach) return true;
  if (s.t === 'shape' && s.shape !== 'line' && s.shape !== 'arrow') return distToSegment(x, y, s.pts[(n - 1) * 3], s.pts[(n - 1) * 3 + 1], s.pts[0], s.pts[1]) <= reach;
  return false;
}

/**
 * Kısmi silgi: kalem çizgisinin silgi altında kalan noktalarını çıkarır, kalan parçalar ayrı çizgi olur.
 * Şekiller ve yazı tipi satırları bütün hâlinde silinir.
 */
export function eraseFrom(strokes: Stroke[], x: number, y: number, r: number, partial: boolean): Stroke[] | null {
  let changed = false;
  const out: Stroke[] = [];
  for (const s of strokes) {
    if (!strokeHit(s, x, y, r)) { out.push(s); continue; }
    changed = true;
    if (!partial || s.t !== 'pen') continue;
    const reach = r + s.w / 2;
    let run: number[] = [];
    const flush = () => { if (run.length >= 6) out.push({...s, id: shortId(), pts: run}); run = []; };
    for (let i = 0; i + 2 < s.pts.length; i += 3) {
      if (Math.hypot(s.pts[i] - x, s.pts[i + 1] - y) <= reach) flush();
      else run.push(s.pts[i], s.pts[i + 1], s.pts[i + 2]);
    }
    flush();
  }
  return changed ? out : null;
}

// ---------------------------------------------------------------- dönüşümler

/** Çizgiyi (x, y) kadar kaydırır ve/veya (ox, oy) etrafında ölçekler. */
export function transformStroke(s: Stroke, dx: number, dy: number, scale = 1, ox = 0, oy = 0): Stroke {
  const pts = s.pts.slice();
  for (let i = 0; i + 2 < pts.length; i += 3) {
    pts[i] = round(ox + (pts[i] - ox) * scale + dx);
    pts[i + 1] = round(oy + (pts[i + 1] - oy) * scale + dy);
  }
  const next: Stroke = {...s, pts};
  if (scale !== 1) {
    if (s.t === 'text' && s.run) next.run = {...s.run, size: Math.max(4, Math.min(200, s.run.size * scale)), spacing: s.run.spacing * scale};
    else next.w = Math.max(0.2, Math.min(80, s.w * scale));
  }
  return next;
}

export function transformPlaced<T extends Placed | TextBox>(item: T, dx: number, dy: number, scale = 1, ox = 0, oy = 0): T {
  const x = ox + (item.x - ox) * scale + dx, y = oy + (item.y - oy) * scale + dy;
  if ('fileId' in item) return {...item, x, y, w: item.w * scale, h: item.h * scale};
  return {...item, x, y, w: Math.max(40, item.w * scale), size: Math.max(6, Math.min(160, (item as TextBox).size * scale))};
}

export function placedBox(p: Placed): Box {
  // Döndürülmüş öğe için döndürülmüş dikdörtgeni saran kutu.
  const a = (p.rot * Math.PI) / 180, c = Math.abs(Math.cos(a)), s = Math.abs(Math.sin(a));
  const w = p.w * c + p.h * s, h = p.w * s + p.h * c;
  return {x: p.x + p.w / 2 - w / 2, y: p.y + p.h / 2 - h / 2, w, h};
}
