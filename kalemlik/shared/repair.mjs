// Eşitlenen kayıtları doğrulama kurallarına (server/schemas.mjs) uyduran ortak onarıcı.
// Hem sunucu (kaydı doğrulamadan önce) hem uygulama (göndermeden önce) aynı kodu kullanır; böylece eski bir
// uygulama sürümünden, bozuk bir yerel kopyadan ya da beklenmeyen bir değerden gelen kayıt da reddedilmez.
// Kural: görünen içerik korunur; sınır dışı değerler sınıra çekilir, eksik alanlar varsayılanla doldurulur,
// onarılamayan tek tek öğeler (ör. NaN noktalı çizgi parçası) atlanır — kaydın tamamı asla kaybedilmez.
import C from './constants.json' with {type: 'json'};

export const LIMITS = {
  coordMin: -20000, coordMax: 30000, maxPts: 30000, maxStrokes: 20000, maxTexts: 300, maxStickers: 200, maxCoverStickers: 20,
};

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isNum = v => typeof v === 'number' && Number.isFinite(v);
const toNum = v => (isNum(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : NaN);
const num = (v, a, b, fallback) => { const n = toNum(v); return Number.isFinite(n) ? clamp(n, a, b) : fallback; };
const int = (v, a, b, fallback) => Math.round(num(v, a, b, fallback));
const coord = v => num(v, LIMITS.coordMin, LIMITS.coordMax, 0);
const HEX = /^#[0-9a-fA-F]{6}$/;
const SHORT_HEX = /^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/;
function hex(v, fallback = '#1b2433') {
  if (typeof v !== 'string') return fallback;
  if (HEX.test(v)) return v;
  const m = SHORT_HEX.exec(v);
  return m ? `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}` : fallback;
}
const optHex = v => (typeof v === 'string' && (HEX.test(v) || SHORT_HEX.test(v)) ? hex(v) : undefined);
const SHORT_ID = /^[A-Za-z0-9_-]{1,40}$/;
const FONT = /^[a-z0-9:-]{1,60}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BUILTIN = /^[a-z0-9-]{1,40}$/;
const TIME = /^(\d{1,2}):(\d{1,2})/;
const str = (v, max) => (typeof v === 'string' ? v : v == null ? '' : String(v)).slice(0, max);
const title = (v, max, fallback) => str(v, 4 * max).trim().slice(0, max).trim() || fallback;
const oneOf = (v, list, fallback) => (list.includes(v) ? v : fallback);
const randomId = () => Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-4);
const shortId = v => (typeof v === 'string' && SHORT_ID.test(v) ? v : typeof v === 'string' && v ? (v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || randomId()) : randomId());
const fontId = (v, fallback = 'nunito') => { if (typeof v !== 'string') return fallback; const f = v.toLowerCase().slice(0, 60); return FONT.test(f) ? f : fallback; };
const timestamp = v => { const n = toNum(v); return Number.isFinite(n) && n >= 0 ? Math.round(Math.min(n, 1e15)) : null; };
const isObject = v => !!v && typeof v === 'object' && !Array.isArray(v);
const arr = v => (Array.isArray(v) ? v : []);

/** [x, y, basınç, ...] dizisi: sayı olmayan/NaN noktalar atlanır, konumlar sınırlanır, basınç 0–1. */
function repairPts(pts) {
  const out = [];
  const list = arr(pts);
  for (let i = 0; i + 1 < list.length; i += 3) {
    const x = toNum(list[i]), y = toNum(list[i + 1]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    out.push(clamp(x, LIMITS.coordMin, LIMITS.coordMax), clamp(y, LIMITS.coordMin, LIMITS.coordMax), num(list[i + 2], 0, 1, 0.5));
  }
  return out;
}

function repairStroke(s) {
  if (!isObject(s)) return [];
  const pts = repairPts(s.pts);
  if (!pts.length) return [];
  const t = oneOf(s.t, ['pen', 'shape', 'text'], s.run ? 'text' : s.shape ? 'shape' : 'pen');
  const base = {id: shortId(s.id), t, c: hex(s.c), w: num(s.w, 0.2, 80, 2), o: num(s.o, 0.05, 1, 1), pts};
  if (C.pens.includes(s.pen)) base.pen = s.pen;
  if (C.shapes.includes(s.shape)) base.shape = s.shape;
  if (isObject(s.run)) {
    const text = str(s.run.text, 400).trim();
    if (text) base.run = {text, font: fontId(s.run.font), size: num(s.run.size, 4, 200, 24), weight: int(s.run.weight, 1, 9, 4), spacing: num(s.run.spacing, -10, 40, 0)};
  }
  if (base.t === 'text' && !base.run) base.t = 'pen'; // metni kaybolmuş satır, çizgi olarak kalır
  if (pts.length <= LIMITS.maxPts) return [base];
  // Kaldırmadan çok uzun süre çizilmiş tek çizgi parçalara bölünür (parçalar birbirine bağlı kalır).
  const parts = [];
  const step = LIMITS.maxPts - 3;
  for (let i = 0; i < pts.length; i += step) {
    const slice = pts.slice(Math.max(0, i - 3), i + step);
    if (slice.length >= 3) parts.push({...base, id: i ? `${base.id.slice(0, 32)}-${parts.length}` : base.id, pts: slice});
  }
  return parts;
}

function repairPlaced(p) {
  if (!isObject(p)) return null;
  const fileId = typeof p.fileId === 'string' && UUID.test(p.fileId) ? p.fileId.toLowerCase() : undefined;
  const builtin = !fileId && typeof p.builtin === 'string' && BUILTIN.test(p.builtin) ? p.builtin : undefined;
  if (!fileId && !builtin) return null;
  const rot = num(p.rot, -1e6, 1e6, 0);
  const out = {id: shortId(p.id), x: coord(p.x), y: coord(p.y), w: num(p.w, 4, 20000, 100), h: num(p.h, 4, 20000, 100), rot: (((rot + 180) % 360) + 360) % 360 - 180};
  if (fileId) out.fileId = fileId; else out.builtin = builtin;
  return out;
}

function repairText(t) {
  if (!isObject(t)) return null;
  const out = {id: shortId(t.id), x: coord(t.x), y: coord(t.y), w: num(t.w, 20, 20000, 300), text: str(t.text, 20000), font: fontId(t.font), size: num(t.size, 6, 160, 22), color: hex(t.color)};
  if (t.bold) out.bold = true;
  return out;
}

function uniqueIds(list) {
  const seen = new Set();
  for (const item of list) {
    while (seen.has(item.id)) item.id = randomId();
    seen.add(item.id);
  }
  return list;
}

export function repairPageContent(c) {
  const src = isObject(c) ? c : {};
  const out = {
    v: 1,
    template: oneOf(src.template, C.papers, 'blank'),
    width: int(src.width, 300, 3000, C.page.width),
    height: int(src.height, 300, 3000, C.page.height),
    strokes: uniqueIds(arr(src.strokes).flatMap(repairStroke).slice(0, LIMITS.maxStrokes)),
    texts: uniqueIds(arr(src.texts).map(repairText).filter(Boolean).slice(0, LIMITS.maxTexts)),
    stickers: uniqueIds(arr(src.stickers).map(repairPlaced).filter(Boolean).slice(0, LIMITS.maxStickers)),
  };
  for (const k of ['paperColor', 'lineColor', 'textColor']) { const h = optHex(src[k]); if (h) out[k] = h; }
  if (src.spacing != null && Number.isFinite(toNum(src.spacing))) out.spacing = num(src.spacing, 8, 90, 30);
  if (isObject(src.background) && typeof src.background.fileId === 'string' && UUID.test(src.background.fileId)) {
    out.background = {fileId: src.background.fileId.toLowerCase(), kind: src.background.kind === 'pdf' ? 'pdf' : 'image'};
  }
  return out;
}

export function repairCover(c) {
  const src = isObject(c) ? c : {};
  const out = {
    pattern: oneOf(src.pattern, C.coverPatterns, 'none'),
    patternOpacity: num(src.patternOpacity, 0.03, 1, 0.18),
    patternSize: num(src.patternSize, 2, 20, 6),
    showCourse: src.showCourse !== false,
    showTerm: src.showTerm !== false,
    label: str(src.label, 80),
    stickers: uniqueIds(arr(src.stickers).map(repairPlaced).filter(Boolean).slice(0, LIMITS.maxCoverStickers)),
  };
  const pc = optHex(src.patternColor); if (pc) out.patternColor = pc;
  const tc = optHex(src.textColor); if (tc) out.textColor = tc;
  if (typeof src.font === 'string' && FONT.test(src.font.toLowerCase())) out.font = src.font.toLowerCase();
  return out;
}

function hhmm(v) {
  const m = TIME.exec(str(v, 20).trim());
  if (!m) return '';
  const h = Number(m[1]), min = Number(m[2]);
  if (h > 23 || min > 59) return '';
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}
function isoDate(v) {
  const s = str(v, 40).trim();
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const d = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    const t = new Date(d + 'T00:00:00Z');
    if (!Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d) return d;
  }
  const n = toNum(v);
  const t = new Date(Number.isFinite(n) ? n : s || Date.now());
  return (Number.isNaN(t.getTime()) ? new Date() : t).toISOString().slice(0, 10);
}
const addHour = s => { const h = Number(s.slice(0, 2)); return h < 23 ? `${String(h + 1).padStart(2, '0')}${s.slice(2)}` : '23:59'; };

/**
 * Bir kaydın verisini (id/rev/zaman damgaları hariç) kurallara uydurur. Bilinen alanların dışındakiler aynen
 * korunur (sunucu şeması onları zaten yok sayar).
 */
export function repairRecord(entity, data) {
  const d = isObject(data) ? {...data} : {};
  switch (entity) {
    case 'page':
      // İçeriği hiç olmayan sayfa "boş sayfa" yapılmaz (sunucudaki içeriği silmesin); şema reddeder.
      if (isObject(d.content)) d.content = repairPageContent(d.content);
      d.position = num(d.position, -1e12, 1e12, 0);
      if (typeof d.notebookId === 'string') d.notebookId = d.notebookId.toLowerCase();
      break;
    case 'notebook':
      d.title = title(d.title, 160, 'Adsız defter');
      d.course = str(d.course, 120); d.term = str(d.term, 60);
      d.color = hex(d.color, '#2f6fed');
      d.paper = oneOf(d.paper, C.papers, 'lined');
      d.cover = repairCover(d.cover);
      d.favorite = !!d.favorite;
      d.trashedAt = timestamp(d.trashedAt);
      d.lastOpenedAt = timestamp(d.lastOpenedAt);
      break;
    case 'lesson': {
      d.title = title(d.title, 120, 'Ders');
      d.day = int(d.day, 0, 6, 0);
      d.start = hhmm(d.start) || '09:00';
      d.end = hhmm(d.end) || addHour(d.start);
      if (d.end <= d.start) d.end = addHour(d.start);
      if (d.end <= d.start) { d.start = '22:59'; d.end = '23:59'; }
      d.room = str(d.room, 80); d.instructor = str(d.instructor, 100); d.note = str(d.note, 1000);
      d.color = hex(d.color, '#2f6fed');
      break;
    }
    case 'task':
      d.title = title(d.title, 160, 'Kayıt');
      d.course = str(d.course, 120); d.description = str(d.description, 5000);
      d.dueDate = isoDate(d.dueDate);
      d.dueTime = hhmm(d.dueTime);
      d.category = oneOf(d.category, C.taskCategories, 'todo');
      d.color = hex(d.color, '#2f6fed');
      d.done = !!d.done;
      d.completedAt = d.done ? (timestamp(d.completedAt) ?? Date.now()) : timestamp(d.completedAt);
      break;
    case 'focus': {
      d.topic = str(d.topic, 160); d.course = str(d.course, 120);
      d.plannedMinutes = int(d.plannedMinutes, 1, 600, 25);
      d.focusedSeconds = int(d.focusedSeconds, 0, 36000, 0);
      d.completed = !!d.completed;
      d.startedAt = timestamp(d.startedAt) ?? Date.now();
      d.endedAt = timestamp(d.endedAt) ?? d.startedAt;
      break;
    }
    case 'sticker':
      d.name = title(d.name, 80, 'Sticker');
      d.width = int(d.width, 1, 8192, 1); d.height = int(d.height, 1, 8192, 1);
      if (typeof d.fileId === 'string') d.fileId = d.fileId.toLowerCase();
      break;
    case 'font':
      d.name = title(d.name, 80, 'Yazı tipi');
      d.missingChars = str(d.missingChars, 40);
      if (typeof d.fileId === 'string') d.fileId = d.fileId.toLowerCase();
      break;
    case 'settings':
      d.data = isObject(d.data) ? d.data : {};
      break;
  }
  return d;
}
