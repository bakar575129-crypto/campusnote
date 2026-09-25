// 1.1 özellikleri: kapaktan kaydırarak geçiş, hazır stickerlar, galeriden görsel, sevimli kapak deseni,
// cihazda el yazısı tanıma ve yönetim paneli.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 860}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const step = s => console.log('•', s);
const SHOTS = process.env.SHOTS;
const shot = async n => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${n}.png`}); };

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Özellik Test'); await page.fill('#email', `f${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');
await page.getByRole('button', {name: 'Yeni defter'}).first().click();
await page.fill('#nb-title', 'Biyoloji'); await page.getByRole('button', {name: 'Defteri oluştur'}).click();
await page.waitForURL('**/defter/**');

step('kapak: "aç" düğmesi yok, altta ilk sayfa görünüyor, kaydırınca deftere geçiliyor');
assert.equal(await page.getByRole('button', {name: 'Defteri aç'}).count(), 0);
await page.waitForSelector('.page-peek img');
await shot('20-kapak-peek');
const stage = await page.locator('.cover-stage').boundingBox();
await page.mouse.move(stage.x + stage.width / 2, stage.y + stage.height / 2);
for (let i = 0; i < 8 && !(await page.locator('.viewport canvas').count()); i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(250); }
await page.waitForSelector('.viewport canvas');
assert.match(await page.locator('.page-nav-label').innerText(), /Sayfa 1/);

step('sayfanın başında yukarı kaydırınca kapağa dönülüyor');
const vp = await page.locator('.viewport').boundingBox();
await page.mouse.move(vp.x + vp.width / 2, vp.y + vp.height / 2);
for (let i = 0; i < 6 && !(await page.locator('.cover-stage').count()); i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(120); }
await page.waitForSelector('.cover-stage');
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.viewport canvas');

step('hazır sevimli sticker ekle');
await page.getByRole('button', {name: 'Sticker ekle'}).click();
await page.getByRole('tab', {name: 'Hayvanlar'}).click();
await page.getByRole('button', {name: 'Kedi stickerını ekle'}).click();
await page.waitForSelector('.placed-frame');
await shot('21-hazir-sticker');

step('galeriden görsel ekle, taşı ve boyutlandır');
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'klm-'));
const png = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 800; c.height = 500; const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 800, 500); g.addColorStop(0, '#74c0fc'); g.addColorStop(1, '#f783ac'); x.fillStyle = g; x.fillRect(0, 0, 800, 500); return c.toDataURL('image/jpeg').split(',')[1]; });
const photo = path.join(tmp, 'tahta.jpg');
await fs.writeFile(photo, Buffer.from(png, 'base64'));
await page.locator('input[type=file][accept="image/*"]').setInputFiles(photo);
await page.waitForFunction(() => document.querySelectorAll('.placed').length === 2);
const frame = page.locator('.placed-frame');
const before = await frame.boundingBox();
await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2);
await page.mouse.down(); await page.mouse.move(before.x + before.width / 2 + 60, before.y + before.height / 2 + 40, {steps: 6}); await page.mouse.up();
const handle = await page.locator('.placed-frame .handle-resize').boundingBox();
await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
await page.mouse.down(); await page.mouse.move(handle.x - 60, handle.y - 40, {steps: 6}); await page.mouse.up();
const after = await frame.boundingBox();
assert.ok(after.x > before.x + 20, 'görsel taşınmalı');
assert.ok(after.width < before.width - 10, 'görsel küçülmeli');
await shot('22-galeri-gorsel');
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
await page.waitForTimeout(1500);
const saved = await page.evaluate(async () => (await (await fetch(`/api/notebooks/${location.pathname.split('/').pop()}/pages`)).json()).pages[0].content.stickers);
assert.equal(saved.length, 2);
assert.equal(saved[0].builtin, 'kedi');
assert.ok(saved[1].fileId, 'galeri görseli dosya olarak yüklenmeli');

step('sevimli kapak deseni');
await page.getByRole('button', {name: 'Diğer işlemler'}).click();
await page.getByRole('menuitem', {name: 'Kapağı düzenle'}).click();
await page.getByRole('radio', {name: 'Kediler'}).click();
await shot('23-kapak-kediler');
await page.getByRole('button', {name: 'Kapağı kaydet'}).click();

step('cihazda el yazısı tanıma (API anahtarı yok)');
await page.getByRole('button', {name: 'Otomatik yazı düzeltme'}).click();
await page.locator('.popover').getByRole('radio', {name: 'Kelime'}).click();
await page.locator('#wp-font').selectOption('kalam');
await page.keyboard.press('Escape');
// Kalam yazı tipiyle çizilmiş harflerin iskeletini kalem çizgisi olarak "yaz": metnin görüntüsünü çizgiye çeviririz.
const drawn = await page.evaluate(async () => {
  await document.fonts.load('70px "Kalam"', 'Merhaba');
  const c = document.createElement('canvas'); c.width = 460; c.height = 120; const x = c.getContext('2d');
  x.fillStyle = '#000'; x.font = '70px "Kalam"'; x.fillText('Merhaba', 10, 90);
  const d = x.getImageData(0, 0, 460, 120).data; const rows = [];
  for (let y = 0; y < 120; y += 3) { let start = -1; for (let xx = 0; xx <= 460; xx++) { const on = xx < 460 && d[(y * 460 + xx) * 4 + 3] > 128; if (on && start < 0) start = xx; if (!on && start >= 0) { rows.push([start, y, xx - 1]); start = -1; } } }
  return rows;
});
await page.getByRole('button', {name: /^Tükenmez/}).click();
console.log('  çizgi sayısı:', drawn.length);
const vp2 = await page.locator('.viewport').boundingBox();
const z = await page.evaluate(() => { const p = document.querySelector('.paper'); return p.getBoundingClientRect().width / p.offsetWidth; });
const ox = vp2.x + vp2.width * 0.35, oy = vp2.y + vp2.height * 0.3;
for (const [x0, y, x1] of drawn) {
  await page.mouse.move(ox + x0 * z * 0.9, oy + y * z * 0.9); await page.mouse.down();
  await page.mouse.move(ox + (x1 + 0.5) * z * 0.9, oy + y * z * 0.9); await page.mouse.up();
}
await page.waitForFunction(() => true);
await page.waitForTimeout(4000);
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
await page.waitForTimeout(1500);
const content = await page.evaluate(async () => (await (await fetch(`/api/notebooks/${location.pathname.split('/').pop()}/pages`)).json()).pages[0].content);
const runs = content.strokes.filter(s => s.t === 'text');
console.log('  tanınan:', runs.map(r => r.run.text));
assert.equal(runs.length, 1, 'el yazısı cihazda tanınıp metne dönüşmeli');
assert.match(runs[0].run.text, /erhaba/i);
await shot('24-cihazda-tanima');

assert.deepEqual(errors, []);
console.log('✓ 1.1 özellik testleri geçti');
await browser.close();
await fs.rm(tmp, {recursive: true, force: true});
