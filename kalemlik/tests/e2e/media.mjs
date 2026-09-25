// PDF içe/dışa aktarma, sticker oluşturma, yazı tipi yükleme ve otomatik yazı düzeltme (gerçek tarayıcı).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {PDFDocument, StandardFonts, rgb} from 'pdf-lib';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'klm-e2e-'));
// 3 sayfalık örnek PDF (biri yatay)
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const [w, h] of [[595, 842], [595, 842], [842, 595]]) { const p = doc.addPage([w, h]); p.drawText('Ders slaydi', {x: 60, y: h - 100, size: 36, font, color: rgb(0.1, 0.2, 0.5)}); }
const pdfPath = path.join(tmp, 'slaytlar.pdf');
await fs.writeFile(pdfPath, await doc.save());
// Sticker için fotoğraf: beyaz zemin üzerinde kırmızı daire (PNG, tarayıcıda üretilir)
const fontPath = path.resolve('node_modules/@fontsource/caveat/files/caveat-latin-400-normal.woff2');

const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 860}, acceptDownloads: true});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const step = s => console.log('•', s);

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Medya Test'); await page.fill('#email', `m${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');

step('PDF içe aktar → defter');
await page.locator('input[type=file][accept*="pdf"]').first().setInputFiles(pdfPath);
await page.waitForURL('**/defter/**', {timeout: 30000, waitUntil: 'commit'}).catch(async e => { console.log('TOAST:', await page.locator('.toast').allInnerTexts(), errors, await page.locator('.notice').allInnerTexts()); await page.screenshot({path: '/tmp/claude-0/-home-user-campusnote/0a7f8e02-17e4-5da2-ac6b-0ca508431483/scratchpad/shots/pdf.png'}); throw e; });
await page.getByRole('button', {name: 'Defteri aç'}).click();
await page.waitForSelector('.viewport canvas');
assert.match(await page.locator('.page-nav-label').innerText(), /Sayfa 1 \/ 3/);

step('PDF üzerine yaz');
const vp = await page.locator('.viewport').boundingBox();
await page.mouse.move(vp.x + 500, vp.y + 300); await page.mouse.down(); await page.mouse.move(vp.x + 650, vp.y + 330, {steps: 10}); await page.mouse.up();

step('sticker oluştur ve sayfaya ekle');
await page.getByRole('button', {name: 'Sticker ekle'}).click();
await page.getByRole('button', {name: 'Fotoğraftan oluştur'}).click();
const png = await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 200; c.height = 200;
  const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 200, 200); x.fillStyle = '#d33'; x.beginPath(); x.arc(100, 100, 60, 0, 7); x.fill();
  return c.toDataURL('image/png').split(',')[1];
});
const pngPath = path.join(tmp, 'foto.png');
await fs.writeFile(pngPath, Buffer.from(png, 'base64'));
await page.locator('.dialog input[type=file]').setInputFiles(pngPath);
await page.getByRole('switch', {name: /Arka planı kaldır/}).check();
await page.waitForTimeout(300);
await page.getByRole('button', {name: 'Arşive kaydet'}).click();
await page.waitForSelector('.placed-frame');
const alpha = await page.evaluate(async () => {
  const img = document.querySelector('.placed img');
  await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return [x.getImageData(2, 2, 1, 1).data[3], x.getImageData(c.width / 2, c.height / 2, 1, 1).data[3]];
});
assert.equal(alpha[0], 0, 'arka plan saydam olmalı');
assert.equal(alpha[1], 255, 'nesne korunmalı');

step('PDF olarak indir');
const [download] = await Promise.all([page.waitForEvent('download', {timeout: 60000}), (async () => { await page.getByRole('button', {name: 'Diğer işlemler'}).click(); await page.getByRole('menuitem', {name: 'PDF olarak indir'}).click(); })()]);
const out = path.join(tmp, 'out.pdf');
await download.saveAs(out);
const exported = await PDFDocument.load(await fs.readFile(out));
assert.equal(exported.getPageCount(), 4, 'kapak + 3 sayfa');
const land = exported.getPage(3).getSize();
assert.ok(land.width > land.height, 'yatay sayfa yatay kalmalı');

step('otomatik yazı düzeltme (kendi el yazım)');
await page.getByRole('button', {name: 'Otomatik yazı düzeltme'}).click();
await page.locator('.popover').getByRole('radio', {name: 'Kelime'}).click();
await page.keyboard.press('Escape');
await page.getByRole('button', {name: 'Bu sayfadan sonra yeni sayfa ekle'}).click();
await page.waitForTimeout(300);
await page.getByRole('button', {name: /^Tükenmez/}).click();
const vp2 = await page.locator('.viewport').boundingBox();
for (const [x0, h] of [[300, 40], [330, 55]]) {
  await page.mouse.move(vp2.x + x0, vp2.y + 403); await page.mouse.down();
  for (let i = 1; i <= 6; i++) await page.mouse.move(vp2.x + x0 + i * 4, vp2.y + 403 - (i % 2 ? h : 0), {steps: 2});
  await page.mouse.up();
}
await page.waitForTimeout(1500);
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
await page.waitForTimeout(1200);
const pages = await page.evaluate(async () => (await (await fetch(`/api/notebooks/${location.pathname.split('/').pop()}/pages`)).json()).pages);
const p2 = pages.sort((a, b) => a.position - b.position)[1].content;
assert.equal(p2.strokes.length, 2);
const ys = p2.strokes.flatMap(s => s.pts.filter((_, i) => i % 3 === 1));
const hgt = Math.max(...ys) - Math.min(...ys);
assert.ok(hgt < 38 * 1.6, `düzeltilen yazı satıra sığmalı (yükseklik ${hgt})`);

step('yazı tipi yükle');
await page.goto(BASE + '/ayarlar');
await page.locator('input[type=file][accept*="ttf"]').setInputFiles(fontPath);
await page.waitForSelector('text=yüklendi', {timeout: 15000});

assert.deepEqual(errors, []);
console.log('✓ Medya testleri geçti');
await browser.close();
await fs.rm(tmp, {recursive: true, force: true});
