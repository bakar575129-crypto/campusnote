import type {PaperId} from '@/lib/constants';
import type {PageContent} from '@/lib/types';

export interface PaperInfo {id: PaperId; name: string; group: string; spacing: number}

export const PAPERS: PaperInfo[] = [
  {id: 'blank', name: 'Boş', group: 'Temel', spacing: 40},
  {id: 'lined', name: 'Standart çizgili', group: 'Temel', spacing: 38},
  {id: 'narrow', name: 'Dar çizgili', group: 'Temel', spacing: 28},
  {id: 'wide', name: 'Geniş çizgili', group: 'Temel', spacing: 50},
  {id: 'margin', name: 'Kenar boşluklu çizgili', group: 'Temel', spacing: 38},
  {id: 'grid', name: 'Standart kareli', group: 'Temel', spacing: 36},
  {id: 'grid-small', name: 'İnce kareli', group: 'Temel', spacing: 22},
  {id: 'grid-large', name: 'Geniş kareli', group: 'Temel', spacing: 52},
  {id: 'dotted', name: 'Noktalı', group: 'Temel', spacing: 32},
  {id: 'cornell', name: 'Cornell çizgili', group: 'Ders & araştırma', spacing: 36},
  {id: 'cornell-grid', name: 'Cornell kareli', group: 'Ders & araştırma', spacing: 30},
  {id: 'cornell-dotted', name: 'Cornell noktalı', group: 'Ders & araştırma', spacing: 30},
  {id: 'lab', name: 'Laboratuvar / deney raporu', group: 'Ders & araştırma', spacing: 36},
  {id: 'vocabulary', name: 'Kelime / kavram tablosu', group: 'Ders & araştırma', spacing: 48},
  {id: 'weekly', name: 'Haftalık çalışma planı', group: 'Ders & araştırma', spacing: 36},
  {id: 'mindmap', name: 'Zihin haritası', group: 'Ders & araştırma', spacing: 40},
  {id: 'engineering', name: 'Mühendislik kareleri', group: 'Matematik & mühendislik', spacing: 20},
  {id: 'coordinate', name: 'Koordinat düzlemi', group: 'Matematik & mühendislik', spacing: 32},
  {id: 'polar', name: 'Polar grafik', group: 'Matematik & mühendislik', spacing: 36},
  {id: 'semilog', name: 'Yarı logaritmik grafik', group: 'Matematik & mühendislik', spacing: 36},
  {id: 'loglog', name: 'Çift logaritmik grafik', group: 'Matematik & mühendislik', spacing: 36},
  {id: 'isometric', name: 'İzometrik', group: 'Tasarım & bilim', spacing: 36},
  {id: 'hexagonal', name: 'Altıgen / kimya', group: 'Tasarım & bilim', spacing: 26},
  {id: 'music', name: 'Porte / müzik', group: 'Tasarım & bilim', spacing: 14},
];
export const PAPER_GROUPS = [...new Set(PAPERS.map(p => p.group))];
export const paperInfo = (id: PaperId) => PAPERS.find(p => p.id === id) || PAPERS[1];

export const DEFAULT_PAPER_COLOR = '#ffffff';
export const DEFAULT_LINE_COLOR = '#c9d6e8';
export const DEFAULT_TEXT_COLOR = '#7b8aa3';

/** Kareli sayılan şablonlar: otomatik düzeltme yazıyı karelerin içine yerleştirir. */
export const CELL_PAPERS: PaperId[] = ['grid', 'grid-small', 'grid-large', 'engineering', 'coordinate', 'cornell-grid'];
const HEADER = 90;

export function spacingOf(content: Pick<PageContent, 'template' | 'spacing'>) {
  return content.spacing || paperInfo(content.template).spacing;
}

/**
 * Otomatik yazı düzeltmenin hizalanacağı ızgara: satır aralığı (gap), ilk satırın y'si (origin),
 * yazının başlayabileceği sol kenar ve kareli olup olmadığı.
 */
export function writingGuide(content: Pick<PageContent, 'template' | 'spacing' | 'width' | 'height'>) {
  const t = content.template;
  const gap = t === 'music' ? Math.max(24, spacingOf(content) * 3) : spacingOf(content);
  const cell = CELL_PAPERS.includes(t);
  let origin = HEADER, left = 40;
  if (cell || t === 'isometric' || t === 'hexagonal' || t === 'polar' || t === 'mindmap' || t === 'blank') origin = 0;
  if (t === 'dotted') origin = 40;
  if (t === 'margin') left = 130;
  if (t.startsWith('cornell')) { left = 300; origin = 100; }
  if (t === 'vocabulary') origin = 90;
  return {gap, origin, left, cell, right: content.width - 30};
}

type Ctx = CanvasRenderingContext2D;

/** Seçilen şablonu verilen boyutta kâğıda çizer (ekran, küçük resim ve PDF için aynı kod). */
export function paintPaper(ctx: Ctx, content: Pick<PageContent, 'template' | 'spacing' | 'paperColor' | 'lineColor' | 'textColor' | 'width' | 'height'>, withBackground = true) {
  const W = content.width, H = content.height, gap = spacingOf(content), t = content.template;
  const lineColor = content.lineColor || DEFAULT_LINE_COLOR;
  const labelColor = content.textColor || DEFAULT_TEXT_COLOR;
  ctx.save();
  if (withBackground) { ctx.fillStyle = content.paperColor || DEFAULT_PAPER_COLOR; ctx.fillRect(0, 0, W, H); }
  ctx.strokeStyle = lineColor;
  ctx.fillStyle = lineColor;
  ctx.lineWidth = 1;

  const line = (x1: number, y1: number, x2: number, y2: number, w = 1) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); };
  const rows = (x: number, y: number, w: number, h: number, g = gap) => { for (let yy = y; yy <= y + h + 0.1; yy += g) line(x, yy, x + w, yy); };
  const grid = (x: number, y: number, w: number, h: number, g = gap, weight = 1) => {
    for (let xx = x; xx <= x + w + 0.1; xx += g) line(xx, y, xx, y + h, weight);
    for (let yy = y; yy <= y + h + 0.1; yy += g) line(x, yy, x + w, yy, weight);
  };
  const dots = (x: number, y: number, w: number, h: number, g = gap) => {
    for (let xx = x; xx <= x + w + 0.1; xx += g) for (let yy = y; yy <= y + h + 0.1; yy += g) { ctx.beginPath(); ctx.arc(xx, yy, 1.8, 0, Math.PI * 2); ctx.fill(); }
  };
  const label = (text: string, x: number, y: number, size = 15) => {
    ctx.save(); ctx.fillStyle = labelColor; ctx.font = `600 ${size}px Nunito, system-ui, sans-serif`; ctx.letterSpacing = '1.5px'; ctx.fillText(text, x, y); ctx.restore();
  };
  const box = (x: number, y: number, w: number, h: number, weight = 1.6) => { ctx.lineWidth = weight; ctx.strokeRect(x, y, w, h); };

  switch (t) {
    case 'blank': break;
    case 'lined': case 'narrow': case 'wide': rows(0, HEADER, W, H - HEADER - 20); break;
    case 'margin':
      rows(0, HEADER, W, H - HEADER - 20);
      ctx.save(); ctx.strokeStyle = '#f2a0a0'; line(110, 0, 110, H, 1.6); line(116, 0, 116, H, 0.8); ctx.restore();
      break;
    case 'grid': case 'grid-small': case 'grid-large': grid(0, 0, W, H); break;
    case 'dotted': dots(40, 40, W - 80, H - 80); break;
    case 'engineering': {
      ctx.globalAlpha = 0.55; grid(0, 0, W, H); ctx.globalAlpha = 1;
      grid(0, 0, W, H, gap * 5, 1.4);
      break;
    }
    case 'coordinate': {
      grid(0, 0, W, H);
      const cx = Math.round(W / 2 / gap) * gap, cy = Math.round(H / 2 / gap) * gap;
      ctx.save(); ctx.strokeStyle = labelColor; ctx.fillStyle = labelColor;
      line(30, cy, W - 30, cy, 2); line(cx, 30, cx, H - 30, 2);
      ctx.beginPath(); ctx.moveTo(W - 30, cy); ctx.lineTo(W - 44, cy - 7); ctx.lineTo(W - 44, cy + 7); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx, 30); ctx.lineTo(cx - 7, 44); ctx.lineTo(cx + 7, 44); ctx.fill();
      ctx.font = 'italic 600 18px Lora, Georgia, serif'; ctx.fillText('x', W - 40, cy + 26); ctx.fillText('y', cx + 12, 46); ctx.fillText('0', cx + 6, cy + 20);
      ctx.restore();
      break;
    }
    case 'cornell': case 'cornell-grid': case 'cornell-dotted': {
      const top = 100, split = 280, bottom = H - 250;
      label('KONU', 40, 44); label('TARİH', W - 260, 44);
      line(40, 58, W - 300, 58); line(W - 260 + 60, 58, W - 40, 58);
      if (t === 'cornell') rows(split + 10, top, W - split - 10, bottom - top - 10);
      else if (t === 'cornell-grid') { ctx.save(); ctx.globalAlpha = 0.8; grid(split, top, W - split, bottom - top); ctx.restore(); }
      else dots(split + 20, top + 20, W - split - 40, bottom - top - 40, gap);
      ctx.save(); ctx.strokeStyle = labelColor; ctx.globalAlpha = 0.55;
      line(0, top, W, top, 2); line(split, top, split, bottom, 2); line(0, bottom, W, bottom, 2);
      ctx.restore();
      label('İPUÇLARI / SORULAR', 24, top + 30, 13);
      label('NOTLAR', split + 20, top + 30, 13);
      label('ÖZET', 24, bottom + 34, 13);
      rows(24, bottom + 60, W - 48, H - bottom - 90);
      break;
    }
    case 'lab': {
      label('DENEY ADI', 50, 50); label('TARİH', W - 260, 50);
      line(50, 64, W - 290, 64); line(W - 200, 64, W - 50, 64);
      const sections: [string, number, number][] = [['AMAÇ / HİPOTEZ', 110, 190], ['MALZEME & YÖNTEM', 320, 210], ['ÖLÇÜMLER / VERİLER', 560, 400], ['SONUÇ & DEĞERLENDİRME', 1000, H - 1000 - 50]];
      for (const [name, y, h] of sections) {
        label(name, 50, y);
        if (name.startsWith('ÖLÇÜMLER')) { ctx.save(); ctx.globalAlpha = 0.8; grid(50, y + 20, W - 100, h - 30, 30); ctx.restore(); }
        else rows(50, y + 20 + gap, W - 100, h - 30 - gap);
      }
      break;
    }
    case 'vocabulary': {
      const mid = 360;
      label('KELİME / KAVRAM', 40, 60); label('ANLAMI / AÇIKLAMA / ÖRNEK', mid + 24, 60);
      rows(0, HEADER, W, H - HEADER - 20);
      ctx.save(); ctx.strokeStyle = labelColor; ctx.globalAlpha = 0.5; line(mid, 30, mid, H - 20, 2); ctx.restore();
      break;
    }
    case 'weekly': {
      const names = ['PAZARTESİ', 'SALI', 'ÇARŞAMBA', 'PERŞEMBE', 'CUMA', 'CUMARTESİ', 'PAZAR'];
      label('HAFTALIK ÇALIŞMA PLANI', 40, 52, 17); line(W - 330, 52, W - 40, 52);
      const top = 80, h = (H - top - 40) / 7;
      for (let i = 0; i < 7; i++) {
        const y = top + i * h;
        box(40, y, W - 80, h - 12, 1.4);
        label(names[i], 58, y + 30, 13);
        ctx.save(); ctx.globalAlpha = 0.6; rows(210, y + 36, W - 270, h - 60, 30); ctx.restore();
        ctx.beginPath(); ctx.lineWidth = 1.4; ctx.rect(58, y + 48, 18, 18); ctx.stroke();
      }
      break;
    }
    case 'mindmap': {
      const cx = W / 2, cy = H / 2;
      ctx.save(); ctx.setLineDash([6, 8]);
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3, x = cx + Math.cos(a) * 330, y = cy + Math.sin(a) * 440;
        line(cx + Math.cos(a) * 150, cy + Math.sin(a) * 80, x - Math.cos(a) * 120, y - Math.sin(a) * 60, 1.4);
        ctx.beginPath(); ctx.ellipse(x, y, 125, 64, 0, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.restore();
      ctx.lineWidth = 2.2; ctx.beginPath(); ctx.ellipse(cx, cy, 160, 84, 0, 0, Math.PI * 2); ctx.stroke();
      label('ANA FİKİR', cx - 44, cy + 6);
      break;
    }
    case 'polar': {
      const cx = W / 2, cy = H / 2, max = Math.min(W, H) / 2 - 50;
      for (let r = gap; r <= max; r += gap) { ctx.lineWidth = Math.round(r / gap) % 5 === 0 ? 1.6 : 1; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke(); }
      for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12; line(cx, cy, cx + Math.cos(a) * max, cy + Math.sin(a) * max, k % 6 === 0 ? 1.6 : 1); }
      ctx.save(); ctx.fillStyle = labelColor; ctx.font = '600 14px Nunito, sans-serif';
      for (let k = 0; k < 12; k++) { const a = -k * Math.PI / 6, deg = k * 30; ctx.fillText(deg + '°', cx + Math.cos(a) * (max + 22) - 12, cy + Math.sin(a) * (max + 22) + 5); }
      ctx.restore();
      break;
    }
    case 'semilog': case 'loglog': {
      const x = 70, y = 90, w = W - 140, h = H - 180, decX = 3, decY = 4;
      for (let d = 0; d < decX; d++) for (let n = 1; n < 10; n++) { const px = x + (d + Math.log10(n)) * w / decX; line(px, y, px, y + h, n === 1 ? 1.6 : 0.8); }
      if (t === 'loglog') { for (let d = 0; d < decY; d++) for (let n = 1; n < 10; n++) { const py = y + h - (d + Math.log10(n)) * h / decY; line(x, py, x + w, py, n === 1 ? 1.6 : 0.8); } }
      else rows(x, y, w, h);
      box(x, y, w, h, 2);
      label(t === 'loglog' ? 'ÇİFT LOGARİTMİK' : 'YARI LOGARİTMİK (x ekseni log)', x, y - 24, 13);
      break;
    }
    case 'isometric': {
      // Eşkenar üçgen ızgarası: dikey çizgiler + ±30° çizgiler; kenar uzunluğu = aralık.
      const dx = gap * Math.cos(Math.PI / 6), rise = W * Math.tan(Math.PI / 6);
      ctx.save(); ctx.globalAlpha = 0.85;
      for (let x = 0; x <= W; x += dx) line(x, 0, x, H, 0.8);
      for (let c = -Math.ceil(rise / gap) * gap; c <= H + rise; c += gap) { line(0, c, W, c + rise, 0.8); line(0, c, W, c - rise, 0.8); }
      ctx.restore();
      break;
    }
    case 'hexagonal': {
      const r = gap, h = Math.sqrt(3) * r;
      for (let col = -1; col < W / (r * 1.5) + 1; col++) {
        for (let row = -1; row < H / h + 1; row++) {
          const cx = col * r * 1.5, cy = row * h + (col % 2 ? h / 2 : 0);
          ctx.beginPath();
          for (let k = 0; k <= 6; k++) { const a = k * Math.PI / 3, px = cx + r * Math.cos(a), py = cy + r * Math.sin(a); if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
          ctx.lineWidth = 1; ctx.stroke();
        }
      }
      break;
    }
    case 'music': {
      const g = Math.max(8, Math.min(20, gap)), staff = g * 4, step = staff + g * 5;
      for (let y = 100; y + staff < H - 60; y += step) {
        for (let l = 0; l < 5; l++) line(60, y + l * g, W - 60, y + l * g, 1.2);
        line(60, y, 60, y + staff, 1.6); line(W - 60, y, W - 60, y + staff, 1.6);
      }
      break;
    }
  }
  ctx.restore();
}
