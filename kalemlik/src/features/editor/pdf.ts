// PDF içe aktarma (her PDF sayfası, üzerine yazılabilen bir defter sayfası olur) ve defteri PDF olarak dışa aktarma.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type {Notebook, PageContent} from '@/lib/types';
import {saveFile} from '@/lib/files';
import {PAGE_W} from '@/lib/constants';
import {renderCover, renderPage} from './render';
import {ensureFont} from '@/features/fonts/fonts';

export const MAX_PDF_PAGES = 150;
export const MAX_PDF_MB = 50;

function canvasBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(b => (b ? resolve(b) : reject(new Error('Görüntü oluşturulamadı.'))), type, quality));
}

/** PDF'in her sayfasını yüksek çözünürlüklü görüntüye çevirir ve defter sayfası içeriği üretir. */
export async function importPdf(file: File, onProgress: (done: number, total: number) => void): Promise<PageContent[]> {
  if (file.size > MAX_PDF_MB * 1024 * 1024) throw new Error(`PDF en fazla ${MAX_PDF_MB} MB olabilir.`);
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({data: new Uint8Array(await file.arrayBuffer())});
  let doc;
  try {
    doc = await task.promise;
  } catch (e) {
    const name = (e as Error)?.name;
    throw new Error(name === 'PasswordException' ? 'Bu PDF parola korumalı; önce parolayı kaldırıp tekrar dene.' : 'PDF okunamadı. Dosya bozuk olabilir.');
  }
  try {
    if (doc.numPages > MAX_PDF_PAGES) throw new Error(`Bir seferde en fazla ${MAX_PDF_PAGES} sayfa içe aktarılabilir (bu PDF ${doc.numPages} sayfa).`);
    const pages: PageContent[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      onProgress(i - 1, doc.numPages);
      const page = await doc.getPage(i);
      const base = page.getViewport({scale: 1});
      const landscape = base.width > base.height;
      const width = landscape ? Math.round(PAGE_W * 1.414) : PAGE_W;
      const height = Math.round(width * (base.height / base.width));
      const scale = Math.min(2.2, 2000 / base.width); // okunaklı ama hafif (~2000 px genişlik)
      const vp = page.getViewport({scale});
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(vp.width);
      canvas.height = Math.ceil(vp.height);
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({canvasContext: ctx, viewport: vp, canvas}).promise;
      const blob = await canvasBlob(canvas, 'image/jpeg', 0.88);
      const fileId = await saveFile(blob, 'page', `${file.name.replace(/\.pdf$/i, '')}-s${i}.jpg`);
      pages.push({v: 1, template: 'blank', width, height: Math.max(300, Math.min(3000, height)), background: {fileId, kind: 'pdf'}, strokes: [], texts: [], stickers: []});
      page.cleanup();
    }
    onProgress(doc.numPages, doc.numPages);
    return pages;
  } finally {
    await task.destroy();
  }
}

/** Fotoğrafı (ör. tahtanın fotoğrafı) sayfa arka planı yapar. */
export async function importImagePage(file: File): Promise<PageContent> {
  if (!/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('PNG, JPG veya WEBP fotoğraf seç.');
  const bitmap = await createImageBitmap(file);
  const landscape = bitmap.width > bitmap.height;
  const width = landscape ? Math.round(PAGE_W * 1.414) : PAGE_W;
  const height = Math.max(300, Math.min(3000, Math.round(width * bitmap.height / bitmap.width)));
  const max = 2200, s = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * s);
  canvas.height = Math.round(bitmap.height * s);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const fileId = await saveFile(await canvasBlob(canvas, 'image/jpeg', 0.88), 'page', file.name);
  return {v: 1, template: 'blank', width, height, background: {fileId, kind: 'image'}, strokes: [], texts: [], stickers: []};
}

/** Defteri (kapak + sayfalar) PDF olarak indirir. Her sayfa kendi oranında A4 genişliğinde yerleşir. */
export async function exportPdf(nb: Notebook, pages: PageContent[], opts: {cover: boolean}, onProgress: (done: number, total: number) => void) {
  const {PDFDocument} = await import('pdf-lib');
  const fonts = new Set<string>([nb.cover.font || 'nunito']);
  for (const p of pages) { for (const s of p.strokes) if (s.run) fonts.add(s.run.font); for (const t of p.texts) fonts.add(t.font); }
  await Promise.all([...fonts].map(ensureFont));
  const doc = await PDFDocument.create();
  doc.setTitle(nb.title);
  doc.setCreator('Kalemlik');
  const A4W = 595.28;
  const total = pages.length + (opts.cover ? 1 : 0);
  let done = 0;
  const add = async (canvas: HTMLCanvasElement, w: number, h: number) => {
    const bytes = new Uint8Array(await (await canvasBlob(canvas, 'image/jpeg', 0.92)).arrayBuffer());
    const img = await doc.embedJpg(bytes);
    const pw = A4W * (w / PAGE_W), ph = pw * (h / w);
    doc.addPage([pw, ph]).drawImage(img, {x: 0, y: 0, width: pw, height: ph});
    onProgress(++done, total);
  };
  if (opts.cover) await add(await renderCover(nb, 1.6), PAGE_W, PAGE_W * 1.414);
  for (const p of pages) await add(await renderPage(p, 1.8), p.width, p.height);
  const bytes = await doc.save();
  const blob = new Blob([bytes as BlobPart], {type: 'application/pdf'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${nb.title.replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'defter'}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30000);
}
