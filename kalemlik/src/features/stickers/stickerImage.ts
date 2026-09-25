// Fotoğraftan sticker: kırpma, şekil maskesi ve arka plan temizleme (tamamen cihazda).

export type StickerShape = 'original' | 'square' | 'circle' | 'rounded';
export interface StickerEdit {shape: StickerShape; zoom: number; panX: number; panY: number; removeBg: boolean; tolerance: number; seeds: [number, number][]; outline: boolean}

/**
 * Tohum noktalarından başlayarak, tohum rengine yakın ve birbirine bağlı pikselleri saydam yapar
 * (düz renkli / sade arka planlar için). Kenarlar yumuşatılır.
 */
export function floodRemove(data: Uint8ClampedArray, w: number, h: number, seeds: [number, number][], tolerance: number) {
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const limit = tolerance * tolerance * 3;
  for (const [sx, sy] of seeds) {
    const x0 = Math.max(0, Math.min(w - 1, Math.round(sx))), y0 = Math.max(0, Math.min(h - 1, Math.round(sy)));
    const seed = y0 * w + x0;
    if (seen[seed]) continue;
    const r = data[seed * 4], g = data[seed * 4 + 1], b = data[seed * 4 + 2];
    let head = 0, tail = 0;
    queue[tail++] = seed; seen[seed] = 1;
    while (head < tail) {
      const i = queue[head++], p = i * 4;
      const d = (data[p] - r) ** 2 + (data[p + 1] - g) ** 2 + (data[p + 2] - b) ** 2;
      if (d > limit && data[p + 3] !== 0) continue;
      // Sınıra yakın pikseller yarı saydam: kenarda beyaz hale kalmaz.
      data[p + 3] = d > limit * 0.55 ? Math.min(data[p + 3], 110) : 0;
      const x = i % w, y = (i - x) / w;
      if (x > 0 && !seen[i - 1]) { seen[i - 1] = 1; queue[tail++] = i - 1; }
      if (x < w - 1 && !seen[i + 1]) { seen[i + 1] = 1; queue[tail++] = i + 1; }
      if (y > 0 && !seen[i - w]) { seen[i - w] = 1; queue[tail++] = i - w; }
      if (y < h - 1 && !seen[i + w]) { seen[i + w] = 1; queue[tail++] = i + w; }
    }
  }
  return data;
}

/** Saydam olmayan alanın çevresine beyaz kenar (klasik sticker görünümü). */
function addOutline(canvas: HTMLCanvasElement, size: number) {
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const ctx = out.getContext('2d')!;
  const steps = 16;
  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2;
    ctx.drawImage(canvas, Math.cos(a) * size, Math.sin(a) * size);
  }
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'source-over';
  ctx.drawImage(canvas, 0, 0);
  return out;
}

export function renderSticker(img: HTMLImageElement | ImageBitmap, e: StickerEdit, maxSide = 720): HTMLCanvasElement {
  const sw = img.width, sh = img.height;
  const square = e.shape !== 'original';
  const baseW = square ? Math.min(sw, sh) : sw, baseH = square ? Math.min(sw, sh) : sh;
  const cw = baseW / e.zoom, ch = baseH / e.zoom;
  const sx = (sw - cw) * e.panX, sy = (sh - ch) * e.panY;
  const scale = Math.min(1, maxSide / Math.max(cw, ch));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(cw * scale));
  canvas.height = Math.max(1, Math.round(ch * scale));
  const ctx = canvas.getContext('2d', {willReadFrequently: true})!;
  ctx.drawImage(img, sx, sy, cw, ch, 0, 0, canvas.width, canvas.height);
  if (e.removeBg && e.seeds.length) {
    const px = ctx.getImageData(0, 0, canvas.width, canvas.height);
    floodRemove(px.data, canvas.width, canvas.height, e.seeds.map(([x, y]) => [x * (canvas.width - 1), y * (canvas.height - 1)]), e.tolerance);
    ctx.putImageData(px, 0, 0);
  }
  if (e.shape === 'circle' || e.shape === 'rounded') {
    ctx.globalCompositeOperation = 'destination-in';
    ctx.beginPath();
    if (e.shape === 'circle') ctx.arc(canvas.width / 2, canvas.height / 2, canvas.width / 2, 0, Math.PI * 2);
    else ctx.roundRect(0, 0, canvas.width, canvas.height, canvas.width * 0.14);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  }
  if (!e.outline) return canvas;
  const pad = Math.max(4, Math.round(Math.max(canvas.width, canvas.height) * 0.03));
  const padded = document.createElement('canvas');
  padded.width = canvas.width + pad * 2;
  padded.height = canvas.height + pad * 2;
  padded.getContext('2d')!.drawImage(canvas, pad, pad);
  return addOutline(padded, pad * 0.8);
}
