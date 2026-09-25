import type {Cover, Notebook, PageContent, Placed, TextBox} from '@/lib/types';
import {loadImage} from '@/lib/files';
import {fontStack} from '@/features/fonts/fonts';
import {drawStroke} from './ink';
import {paintPaper} from './paper';
import {coverPatternSvg, coverTextColor, resolveCoverPattern} from '@/features/notebooks/cover';
import {PAGE_H, PAGE_W} from '@/lib/constants';

export function drawImageContain(ctx: CanvasRenderingContext2D, img: CanvasImageSource & {width: number; height: number}, W: number, H: number) {
  const s = Math.min(W / img.width, H / img.height);
  const w = img.width * s, h = img.height * s;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
}

export function drawPlaced(ctx: CanvasRenderingContext2D, p: Placed, img: HTMLImageElement) {
  ctx.save();
  ctx.translate(p.x + p.w / 2, p.y + p.h / 2);
  ctx.rotate((p.rot * Math.PI) / 180);
  ctx.drawImage(img, -p.w / 2, -p.h / 2, p.w, p.h);
  ctx.restore();
}

/** Metin kutusunu tuvale satır kaydırarak çizer (ekrandaki textarea ile aynı ölçüler). */
export function drawTextBox(ctx: CanvasRenderingContext2D, t: TextBox) {
  ctx.save();
  ctx.fillStyle = t.color;
  ctx.font = `${t.bold ? 700 : 400} ${t.size}px ${fontStack(t.font)}`;
  ctx.textBaseline = 'top';
  const lh = t.size * 1.35;
  let y = t.y + (lh - t.size) / 2;
  for (const para of t.text.split('\n')) {
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(test).width > t.w - 8 && line.trim()) { ctx.fillText(line.trimEnd(), t.x + 4, y); y += lh; line = word.trimStart(); }
      else line = test;
    }
    ctx.fillText(line, t.x + 4, y);
    y += lh;
  }
  ctx.restore();
}

/** Bir sayfanın tamamını (şablon, arka plan, çizgiler, metin, stickerlar) verilen ölçekte tuvale çizer. */
export async function renderPage(content: PageContent, scale: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(content.width * scale);
  canvas.height = Math.round(content.height * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  paintPaper(ctx, content);
  if (content.background) {
    const img = await loadImage(content.background.fileId);
    if (img) drawImageContain(ctx, img, content.width, content.height);
  }
  for (const s of content.strokes) if (s.pen === 'highlighter') drawStroke(ctx, s);
  for (const s of content.strokes) if (s.pen !== 'highlighter') drawStroke(ctx, s);
  for (const t of content.texts) drawTextBox(ctx, t);
  for (const p of content.stickers) {
    const img = await loadImage(p.fileId);
    if (img) drawPlaced(ctx, p, img);
  }
  return canvas;
}

/** Kapağı tuvale çizer (PDF'in ilk sayfası ve küçük resimler için). */
export async function renderCover(nb: Pick<Notebook, 'title' | 'course' | 'term' | 'color' | 'paper' | 'cover'>, scale: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(PAGE_W * scale);
  canvas.height = Math.round(PAGE_H * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.scale(scale, scale);
  ctx.fillStyle = nb.color;
  ctx.fillRect(0, 0, PAGE_W, PAGE_H);
  const cover: Cover = nb.cover;
  const pattern = resolveCoverPattern(cover.pattern, nb.paper);
  const svg = coverPatternSvg(pattern, cover.patternColor || coverTextColor(nb.color), cover.patternOpacity, cover.patternSize);
  if (svg) {
    const img = new Image();
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.markup);
    await img.decode().catch(() => {});
    if (img.width) ctx.drawImage(img, 0, 0, PAGE_W, PAGE_H);
  }
  // Sırt şeridi
  ctx.fillStyle = 'rgba(0,0,0,0.14)';
  ctx.fillRect(0, 0, 46, PAGE_H);
  const color = cover.textColor || coverTextColor(nb.color);
  const family = fontStack(cover.font || 'nunito');
  ctx.fillStyle = color;
  ctx.textBaseline = 'alphabetic';
  // Etiket kutusu
  const labelY = PAGE_H * 0.3;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(ctx, 150, labelY - 110, PAGE_W - 300, 290, 28);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#16202e';
  ctx.textAlign = 'center';
  ctx.font = `700 64px ${family}`;
  wrapCenter(ctx, nb.title, PAGE_W / 2, labelY, PAGE_W - 360, 72, 2);
  ctx.font = `500 34px ${family}`;
  const sub = [cover.showCourse ? nb.course : '', cover.showTerm ? nb.term : ''].filter(Boolean).join(' · ');
  if (sub) ctx.fillText(sub, PAGE_W / 2, labelY + 140, PAGE_W - 360);
  if (cover.label) { ctx.fillStyle = color; ctx.font = `600 40px ${family}`; ctx.fillText(cover.label, PAGE_W / 2, PAGE_H - 140, PAGE_W - 200); }
  for (const p of cover.stickers) {
    const img = await loadImage(p.fileId);
    if (img) drawPlaced(ctx, p, img);
  }
  return canvas;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}

function wrapCenter(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number, maxLines: number) {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (ctx.measureText(t).width > max && line) { lines.push(line); line = w; } else line = t;
  }
  lines.push(line);
  const shown = lines.slice(0, maxLines);
  const start = y - ((shown.length - 1) * lh) / 2;
  shown.forEach((l, i) => ctx.fillText(l, x, start + i * lh, max));
}
