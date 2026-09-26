// Kayıtları sunucuya göndermeden önce sunucunun doğrulama kurallarına uydurur (server/schemas.mjs ile aynı sınırlar).
// Amaç: tek bir bozuk/uç değer (ör. kâğıdın çok dışına çizilmiş bir çizgi, NaN bir nokta, "10:00:00" gibi bir saat)
// yüzünden bütün sayfanın ya da kaydın hiç kaydedilememesini önlemek. Görünen içerik değişmez; yalnızca geçersiz
// değerler güvenli sınırlara çekilir veya (NaN gibi) onarılamayanlar atlanır.

import type {Cover, EntityMap, EntityName, PageContent, Placed, Stroke, TextBox} from './types';
import {PAPER_IDS, PEN_IDS, SHAPE_IDS, COVER_PATTERNS} from './constants';

const COORD_MIN = -20000, COORD_MAX = 30000;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const num = (v: unknown, a: number, b: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, a, b) : fallback);
const coord = (v: unknown) => num(v, COORD_MIN, COORD_MAX, 0);
const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = (v: unknown, fallback = '#1b2433') => (typeof v === 'string' && HEX.test(v) ? v : fallback);
const ID = /^[A-Za-z0-9_-]{1,40}$/;
const FONT = /^[a-z0-9:-]{1,60}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILTIN = /^[a-z0-9-]{1,40}$/;
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const safeId = (v: unknown) => (typeof v === 'string' && ID.test(v) ? v : Math.random().toString(36).slice(2, 12));
const MAX_PTS = 30000;

/** Nokta dizisini onarır: NaN/sonsuz noktalar atlanır, konumlar sınırlanır, basınç 0–1. */
function cleanPts(pts: unknown): number[] {
  if (!Array.isArray(pts)) return [];
  const out: number[] = [];
  for (let i = 0; i + 2 < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], p = pts[i + 2];
    if (typeof x !== 'number' || typeof y !== 'number' || !Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push(clamp(x, COORD_MIN, COORD_MAX), clamp(y, COORD_MIN, COORD_MAX), num(p, 0, 1, 0.5));
  }
  return out;
}

function cleanStroke(s: Stroke): Stroke[] {
  const pts = cleanPts(s.pts);
  if (!pts.length) return [];
  const base: Stroke = {
    id: safeId(s.id),
    t: s.t === 'shape' || s.t === 'text' ? s.t : 'pen',
    c: hex(s.c),
    w: num(s.w, 0.2, 80, 2),
    o: num(s.o, 0.05, 1, 1),
    pts,
  };
  if (s.pen && (PEN_IDS as readonly string[]).includes(s.pen)) base.pen = s.pen;
  if (s.shape && (SHAPE_IDS as readonly string[]).includes(s.shape)) base.shape = s.shape;
  if (s.run) {
    const text = str(s.run.text, 400).trim();
    if (!text) return [];
    base.run = {text, font: FONT.test(s.run.font) ? s.run.font : 'nunito', size: num(s.run.size, 4, 200, 24), weight: Math.round(num(s.run.weight, 1, 9, 4)), spacing: num(s.run.spacing, -10, 40, 0)};
  } else if (base.t === 'text') return [];
  // Çok uzun tek çizgi (dakikalarca kaldırmadan karalama) parçalara bölünür.
  if (pts.length <= MAX_PTS) return [base];
  const parts: Stroke[] = [];
  for (let i = 0; i < pts.length; i += MAX_PTS - 3) parts.push({...base, id: i ? `${base.id.slice(0, 30)}-${parts.length}` : base.id, pts: pts.slice(Math.max(0, i - 3), i + MAX_PTS - 3)});
  return parts;
}

function cleanPlaced(p: Placed): Placed | null {
  const fileId = typeof p.fileId === 'string' && UUID.test(p.fileId) ? p.fileId : undefined;
  const builtin = !fileId && typeof p.builtin === 'string' && BUILTIN.test(p.builtin) ? p.builtin : undefined;
  if (!fileId && !builtin) return null;
  const rot = num(p.rot, -3600, 3600, 0);
  return {id: safeId(p.id), ...(fileId ? {fileId} : {builtin}), x: coord(p.x), y: coord(p.y), w: num(p.w, 4, 20000, 100), h: num(p.h, 4, 20000, 100), rot: ((rot + 540) % 360 + 360) % 360 - 180};
}

function cleanText(t: TextBox): TextBox {
  return {id: safeId(t.id), x: coord(t.x), y: coord(t.y), w: num(t.w, 20, 20000, 300), text: str(t.text, 20000), font: FONT.test(t.font) ? t.font : 'nunito', size: num(t.size, 6, 160, 22), color: hex(t.color), ...(t.bold ? {bold: true} : {})};
}

export function sanitizePageContent(c: PageContent): PageContent {
  const out: PageContent = {
    v: 1,
    template: (PAPER_IDS as readonly string[]).includes(c.template) ? c.template : 'blank',
    width: Math.round(num(c.width, 300, 3000, 1000)),
    height: Math.round(num(c.height, 300, 3000, 1414)),
    strokes: (c.strokes || []).flatMap(cleanStroke).slice(0, 20000),
    texts: (c.texts || []).map(cleanText).slice(0, 300),
    stickers: (c.stickers || []).map(cleanPlaced).filter((p): p is Placed => !!p).slice(0, 200),
  };
  if (c.paperColor && HEX.test(c.paperColor)) out.paperColor = c.paperColor;
  if (c.lineColor && HEX.test(c.lineColor)) out.lineColor = c.lineColor;
  if (c.textColor && HEX.test(c.textColor)) out.textColor = c.textColor;
  if (typeof c.spacing === 'number' && Number.isFinite(c.spacing)) out.spacing = clamp(c.spacing, 8, 90);
  if (c.background && UUID.test(c.background.fileId)) out.background = {fileId: c.background.fileId, kind: c.background.kind === 'pdf' ? 'pdf' : 'image'};
  // Aynı kimliğe sahip iki çizgi olmasın (eşitlemede biri kaybolmasın).
  const seen = new Set<string>();
  for (const s of out.strokes) { if (seen.has(s.id)) s.id = safeId(undefined); seen.add(s.id); }
  return out;
}

function sanitizeCover(c: Cover): Cover {
  return {
    pattern: (COVER_PATTERNS as readonly string[]).includes(c.pattern) ? c.pattern : 'none',
    ...(c.patternColor && HEX.test(c.patternColor) ? {patternColor: c.patternColor} : {}),
    patternOpacity: num(c.patternOpacity, 0.03, 1, 0.18),
    patternSize: num(c.patternSize, 2, 20, 6),
    ...(c.textColor && HEX.test(c.textColor) ? {textColor: c.textColor} : {}),
    ...(c.font && FONT.test(c.font) ? {font: c.font} : {}),
    showCourse: c.showCourse !== false,
    showTerm: c.showTerm !== false,
    label: str(c.label, 80),
    stickers: (c.stickers || []).map(cleanPlaced).filter((p): p is Placed => !!p).slice(0, 20),
  };
}

const hhmm = (v: unknown) => { const m = /^(\d{1,2}):(\d{2})/.exec(String(v || '')); return m ? `${m[1].padStart(2, '0')}:${m[2]}` : ''; };

/** Gönderilecek kaydın verisini (id/rev/zaman damgaları hariç) sunucu kurallarına uydurur. */
export function sanitizeRecord<E extends EntityName>(entity: E, data: Record<string, unknown>): Record<string, unknown> {
  const d = {...data};
  switch (entity) {
    case 'page': if (d.content) d.content = sanitizePageContent(d.content as PageContent); break;
    case 'notebook':
      d.title = str(d.title, 160).trim() || 'Adsız defter';
      d.course = str(d.course, 120); d.term = str(d.term, 60); d.color = hex(d.color, '#2f6fed');
      if (!(PAPER_IDS as readonly string[]).includes(d.paper as string)) d.paper = 'lined';
      d.cover = sanitizeCover((d.cover || {}) as Cover);
      break;
    case 'lesson': {
      d.title = str(d.title, 120).trim() || 'Ders';
      d.start = hhmm(d.start) || '09:00';
      d.end = hhmm(d.end) || '10:00';
      if ((d.end as string) <= (d.start as string)) d.end = (d.start as string) < '23:00' ? `${String(Number((d.start as string).slice(0, 2)) + 1).padStart(2, '0')}${(d.start as string).slice(2)}` : '23:59';
      d.room = str(d.room, 80); d.instructor = str(d.instructor, 100); d.note = str(d.note, 1000); d.color = hex(d.color, '#2f6fed');
      d.day = Math.round(num(d.day, 0, 6, 0));
      break;
    }
    case 'task':
      d.title = str(d.title, 160).trim() || 'Kayıt';
      d.course = str(d.course, 120); d.description = str(d.description, 5000); d.color = hex(d.color, '#2f6fed');
      d.dueTime = hhmm(d.dueTime);
      break;
    case 'focus':
      d.topic = str(d.topic, 160); d.course = str(d.course, 120);
      d.plannedMinutes = Math.round(num(d.plannedMinutes, 1, 600, 25));
      d.focusedSeconds = Math.round(num(d.focusedSeconds, 0, 36000, 0));
      d.startedAt = Math.round(num(d.startedAt, 0, 1e15, Date.now()));
      d.endedAt = Math.round(num(d.endedAt, 0, 1e15, Date.now()));
      break;
    case 'sticker': d.name = str(d.name, 80).trim() || 'Sticker'; d.width = Math.round(num(d.width, 1, 8192, 1)); d.height = Math.round(num(d.height, 1, 8192, 1)); break;
    case 'font': d.name = str(d.name, 80).trim() || 'Yazı tipi'; d.missingChars = str(d.missingChars, 40); break;
  }
  return d;
}

export type Sanitizable = EntityMap[EntityName];
