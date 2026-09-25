import type {PenId, ShapeId} from '@/lib/constants';
import type {Stroke} from '@/lib/types';
import {fontStack} from '@/features/fonts/fonts';

export interface PenInfo {id: PenId; name: string; hint: string; min: number; max: number}
export const PENS: PenInfo[] = [
  {id: 'ballpoint', name: 'Tükenmez', hint: 'Dengeli, akıcı çizgi', min: 0.8, max: 8},
  {id: 'fountain', name: 'Dolma kalem', hint: 'Yöne ve baskıya duyarlı uç', min: 1, max: 10},
  {id: 'pencil', name: 'Kurşun kalem', hint: 'Yumuşak, dokulu', min: 0.8, max: 8},
  {id: 'fineliner', name: 'İnce uç', hint: 'Sabit, keskin çizgi', min: 0.4, max: 5},
  {id: 'brush', name: 'Fırça', hint: 'Baskıyla genişler, uçları incelir', min: 2, max: 24},
  {id: 'marker', name: 'Keçeli kalem', hint: 'Kalın ve dolgun', min: 3, max: 24},
  {id: 'highlighter', name: 'Fosforlu', hint: 'Yazının altında kalan saydam vurgu', min: 8, max: 48},
];
export const penInfo = (id: PenId) => PENS.find(p => p.id === id)!;

export interface Pt {x: number; y: number; p: number}
export function pointsOf(s: Pick<Stroke, 'pts'>): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i + 2 < s.pts.length; i += 3) out.push({x: s.pts[i], y: s.pts[i + 1], p: s.pts[i + 2]});
  return out;
}

const NIB = -Math.PI / 4;
/** Kalem türüne göre noktadaki çizgi genişliği (basınç ve yön etkisi). */
export function widthAt(pen: PenId, base: number, p: number, angle: number, t: number) {
  const pr = Math.max(0.05, Math.min(1, p));
  switch (pen) {
    case 'fountain': return base * (0.45 + pr * 0.9) * (0.35 + 0.65 * Math.abs(Math.sin(angle - NIB)));
    case 'brush': {
      const taper = Math.min(1, t * 6, (1 - t) * 5 + 0.15);
      return base * (0.15 + pr * 1.25) * (0.35 + 0.65 * taper);
    }
    case 'ballpoint': return base * (0.8 + pr * 0.35);
    case 'pencil': return base * (0.75 + pr * 0.4);
    default: return base;
  }
}

const VARIABLE: PenId[] = ['fountain', 'brush', 'ballpoint'];

/** Noktaların orta noktalarından geçen yumuşak eğri. */
function smoothPath(ctx: CanvasRenderingContext2D, pts: {x: number; y: number}[]) {
  ctx.moveTo(pts[0].x, pts[0].y);
  if (pts.length === 2) { ctx.lineTo(pts[1].x, pts[1].y); return; }
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  const last = pts[pts.length - 1];
  ctx.lineTo(last.x, last.y);
}

function drawVariable(ctx: CanvasRenderingContext2D, pts: Pt[], pen: PenId, base: number) {
  const n = pts.length;
  const left: {x: number; y: number}[] = [], right: {x: number; y: number}[] = [];
  const radii: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    const r = Math.max(0.25, widthAt(pen, base, pts[i].p, angle, n > 1 ? i / (n - 1) : 0.5) / 2);
    radii.push(r);
    const nx = -Math.sin(angle) * r, ny = Math.cos(angle) * r;
    left.push({x: pts[i].x + nx, y: pts[i].y + ny});
    right.push({x: pts[i].x - nx, y: pts[i].y - ny});
  }
  ctx.beginPath();
  smoothPath(ctx, left);
  const back = right.reverse();
  ctx.lineTo(back[0].x, back[0].y);
  for (let i = 1; i < back.length - 1; i++) ctx.quadraticCurveTo(back[i].x, back[i].y, (back[i].x + back[i + 1].x) / 2, (back[i].y + back[i + 1].y) / 2);
  ctx.lineTo(back[back.length - 1].x, back[back.length - 1].y);
  ctx.closePath();
  ctx.fill();
  // Uçlar yuvarlak: başlangıç ve bitişe nokta genişliğinde daire (ayrı dolgu; sarım yönü delik açmasın).
  ctx.beginPath();
  ctx.moveTo(pts[0].x + radii[0], pts[0].y);
  ctx.arc(pts[0].x, pts[0].y, radii[0], 0, Math.PI * 2);
  const l = pts[n - 1];
  ctx.moveTo(l.x + radii[n - 1], l.y);
  ctx.arc(l.x, l.y, radii[n - 1], 0, Math.PI * 2);
  ctx.fill();
}

/** Tek bir çizgiyi (kalem, şekil veya yazı tipiyle temize çekilmiş satır) çizer. */
export function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke, dim = false) {
  const pts = pointsOf(s);
  if (!pts.length) return;
  ctx.save();
  ctx.globalAlpha = s.o * (dim ? 0.35 : 1);
  ctx.strokeStyle = s.c;
  ctx.fillStyle = s.c;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (s.t === 'text' && s.run) {
    drawRun(ctx, s);
  } else if (s.t === 'shape') {
    ctx.lineWidth = s.w;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
    if (s.shape !== 'line' && s.shape !== 'arrow') ctx.closePath();
    ctx.stroke();
    if (s.shape === 'arrow' && pts.length >= 2) {
      const a = pts[pts.length - 2], b = pts[pts.length - 1];
      const ang = Math.atan2(b.y - a.y, b.x - a.x), len = Math.max(12, s.w * 4.5);
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(ang - 0.45) * len, b.y - Math.sin(ang - 0.45) * len);
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - Math.cos(ang + 0.45) * len, b.y - Math.sin(ang + 0.45) * len);
      ctx.stroke();
    }
  } else {
    const pen = s.pen || 'ballpoint';
    if (pen === 'highlighter') {
      ctx.globalCompositeOperation = 'multiply';
      ctx.lineCap = 'butt';
    }
    if (pts.length === 1 || (pts.length === 2 && Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y) < 0.5)) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, Math.max(0.4, widthAt(pen, s.w, pts[0].p, 0, 0.5) / 2), 0, Math.PI * 2);
      ctx.fill();
    } else if (VARIABLE.includes(pen)) {
      drawVariable(ctx, pts, pen, s.w);
    } else {
      const avg = pts.reduce((n, p) => n + p.p, 0) / pts.length;
      ctx.lineWidth = widthAt(pen, s.w, avg, 0, 0.5);
      ctx.beginPath();
      smoothPath(ctx, pts);
      ctx.stroke();
      if (pen === 'pencil') {
        // Kâğıt dokusu: konumdan türetilen sabit desen (ekranda ve PDF'te aynı görünür).
        ctx.globalAlpha = s.o * 0.35 * (dim ? 0.35 : 1);
        ctx.lineWidth = Math.max(0.3, s.w * 0.22);
        ctx.beginPath();
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          const off = Math.sin(b.x * 1.3 + b.y * 0.7) * s.w * 0.3;
          ctx.moveTo(a.x + off, a.y - off);
          ctx.lineTo(b.x + off, b.y - off);
        }
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

export function runFont(run: NonNullable<Stroke['run']>) {
  return `${run.weight * 100} ${run.size}px ${fontStack(run.font)}`;
}

/** Yazı tipi satırı: pts[0] = (sol, taban çizgisi). */
function drawRun(ctx: CanvasRenderingContext2D, s: Stroke) {
  const run = s.run!;
  ctx.font = runFont(run);
  ctx.textBaseline = 'alphabetic';
  (ctx as CanvasRenderingContext2D & {letterSpacing: string}).letterSpacing = `${run.spacing}px`;
  ctx.fillText(run.text, s.pts[0], s.pts[1]);
}

let measureCtx: CanvasRenderingContext2D | null = null;
export function measureRun(run: NonNullable<Stroke['run']>) {
  measureCtx ||= document.createElement('canvas').getContext('2d')!;
  measureCtx.font = runFont(run);
  (measureCtx as CanvasRenderingContext2D & {letterSpacing: string}).letterSpacing = `${run.spacing}px`;
  const m = measureCtx.measureText(run.text);
  return {width: m.width, ascent: m.actualBoundingBoxAscent || run.size * 0.75, descent: m.actualBoundingBoxDescent || run.size * 0.25};
}

// ---------------------------------------------------------------- şekiller

export const SHAPES: {id: ShapeId; name: string}[] = [
  {id: 'line', name: 'Çizgi'}, {id: 'arrow', name: 'Ok'}, {id: 'square', name: 'Kare'}, {id: 'rectangle', name: 'Dikdörtgen'},
  {id: 'circle', name: 'Daire'}, {id: 'ellipse', name: 'Elips'}, {id: 'triangle', name: 'Üçgen'}, {id: 'diamond', name: 'Eşkenar dörtgen'},
  {id: 'hexagon', name: 'Altıgen'}, {id: 'star', name: 'Yıldız'},
];

/** Sürükleme başlangıcı ve bitişinden şeklin köşe noktalarını üretir (düz [x,y,p] dizisi). */
export function shapePoints(kind: ShapeId, x0: number, y0: number, x1: number, y1: number): number[] {
  const flat = (list: [number, number][]) => list.flatMap(([x, y]) => [round(x), round(y), 1]);
  if (kind === 'line' || kind === 'arrow') return flat([[x0, y0], [x1, y1]]);
  let w = x1 - x0, h = y1 - y0;
  if (kind === 'square' || kind === 'circle') { const m = Math.max(Math.abs(w), Math.abs(h)); w = Math.sign(w || 1) * m; h = Math.sign(h || 1) * m; }
  const left = Math.min(x0, x0 + w), top = Math.min(y0, y0 + h), W = Math.abs(w), H = Math.abs(h);
  const cx = left + W / 2, cy = top + H / 2;
  switch (kind) {
    case 'square': case 'rectangle': return flat([[left, top], [left + W, top], [left + W, top + H], [left, top + H]]);
    case 'circle': case 'ellipse': {
      const n = 56, list: [number, number][] = [];
      for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; list.push([cx + Math.cos(a) * W / 2, cy + Math.sin(a) * H / 2]); }
      return flat(list);
    }
    case 'triangle': return flat([[cx, top], [left + W, top + H], [left, top + H]]);
    case 'diamond': return flat([[cx, top], [left + W, cy], [cx, top + H], [left, cy]]);
    case 'hexagon': return flat(Array.from({length: 6}, (_, i) => { const a = Math.PI / 3 * i; return [cx + Math.cos(a) * W / 2, cy + Math.sin(a) * H / 2] as [number, number]; }));
    case 'star': return flat(Array.from({length: 10}, (_, i) => { const a = -Math.PI / 2 + Math.PI / 5 * i, r = i % 2 ? 0.42 : 1; return [cx + Math.cos(a) * W / 2 * r, cy + Math.sin(a) * H / 2 * r] as [number, number]; }));
  }
  return flat([[x0, y0], [x1, y1]]);
}

export const round = (n: number) => Math.round(n * 10) / 10;
