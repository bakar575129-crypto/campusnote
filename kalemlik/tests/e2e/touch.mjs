// Dokunmatik davranış: tek parmak çizimi, yalnızca kalem modu, iki parmakla yakınlaştırma ve kilit.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1024, height: 768}, hasTouch: true, isMobile: false});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
const step = s => console.log('•', s);
const touch = async (type, points) => cdp.send('Input.dispatchTouchEvent', {type, touchPoints: points.map(([x, y], id) => ({x, y, id, radiusX: 4, radiusY: 4, force: 0.5}))});
const drag = async (pairs, steps = 8) => {
  // pairs: [[from, to], ...] her parmak için
  await touch('touchStart', pairs.map(p => p[0]));
  for (let i = 1; i <= steps; i++) await touch('touchMove', pairs.map(([a, b]) => [a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]));
  await touch('touchEnd', []);
};
const strokes = () => page.evaluate(async () => {
  await new Promise(r => setTimeout(r, 400));
  const id = location.pathname.split('/').pop();
  const recs = await new Promise(res => { const req = indexedDB.open('kalemlik'); req.onsuccess = () => { const tx = req.result.transaction('pageContent'); const all = tx.objectStore('pageContent').getAll(); all.onsuccess = () => res(all.result); }; });
  return recs.reduce((n, c) => n + c.strokes.length, 0);
});
const zoomText = () => page.locator('.zoom-pct').innerText();

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Dokunmatik'); await page.fill('#email', `t${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');
await page.getByRole('button', {name: 'Yeni defter'}).first().click();
await page.fill('#nb-title', 'Tablet'); await page.getByRole('button', {name: 'Defteri oluştur'}).click();
await page.waitForURL('**/defter/**'); await page.getByRole('button', {name: 'Defteri aç'}).click();
await page.waitForSelector('.viewport canvas');
const vp = await page.locator('.viewport').boundingBox();
const cx = vp.x + vp.width / 2, cy = vp.y + vp.height / 2;

step('tek parmak normal modda yazar');
await drag([[[cx - 100, cy], [cx + 50, cy + 20]]]);
assert.equal(await strokes(), 1);

step('iki parmakla sıkıştırma yalnızca kâğıdı yakınlaştırır, çizgi oluşturmaz');
const z0 = await zoomText();
const topBefore = await page.locator('.editor-top').boundingBox();
await drag([[[cx - 50, cy], [cx - 150, cy]], [[cx + 50, cy], [cx + 150, cy]]]);
await page.waitForTimeout(300);
const z1 = await zoomText();
assert.notEqual(z1, z0, 'yakınlaşma değişmeli');
assert.ok(parseInt(z1.slice(1)) > parseInt(z0.slice(1)));
assert.deepEqual(await page.locator('.editor-top').boundingBox(), topBefore, 'araç çubuğu büyümemeli');
assert.equal(await strokes(), 1, 'iki parmak not oluşturmamalı');

step('yakınlaştırma kilidi: sıkıştırma kapalı, iki parmakla kaydırma çalışır');
await page.getByRole('button', {name: 'Yakınlaştırmayı kilitle'}).click();
const paperBefore = await page.locator('.paper').boundingBox();
await drag([[[cx - 50, cy], [cx - 150, cy + 80]], [[cx + 50, cy], [cx + 150, cy + 80]]]);
await page.waitForTimeout(300);
assert.equal(await zoomText(), z1, 'kilitliyken yakınlaşma değişmemeli');
const paperAfter = await page.locator('.paper').boundingBox();
assert.ok(Math.abs(paperAfter.width - paperBefore.width) < 1, 'kâğıt boyutu aynı');
assert.ok(paperAfter.y !== paperBefore.y, 'iki parmakla kaydırma çalışmalı');
assert.ok(await page.getByRole('button', {name: 'Yakınlaştır', exact: true}).isDisabled(), '+ düğmesi kapalı');

step('yalnızca kalem: tek parmak çizmez');
await page.getByRole('button', {name: 'Yalnızca kalem / yakınlaştırma kilidi'}).click();
await page.getByRole('switch', {name: /Yalnızca kalem/}).check();
await page.keyboard.press('Escape');
await drag([[[cx - 100, cy + 100], [cx + 50, cy + 120]]]);
assert.equal(await strokes(), 1, 'parmak yazmamalı');
await page.getByRole('button', {name: /Aşağı kaydır/}).click();

step('kalem (stylus) yalnızca kalem modunda yazar');
await page.evaluate(({x, y}) => {
  const el = document.querySelector('.viewport');
  const ev = (type, dx, buttons) => el.dispatchEvent(new PointerEvent(type, {pointerId: 9, pointerType: 'pen', clientX: x + dx, clientY: y + dx / 3, pressure: 0.7, buttons, button: 0, bubbles: true, isPrimary: true}));
  ev('pointerdown', 0, 1); for (let i = 1; i <= 10; i++) ev('pointermove', i * 12, 1); ev('pointerup', 120, 0);
}, {x: cx - 60, y: cy - 60});
assert.equal(await strokes(), 2, 'kalem yazmalı');

step('kalem değerken avuç içi dokunuşu yok sayılır');
await page.evaluate(({x, y}) => {
  const el = document.querySelector('.viewport');
  el.dispatchEvent(new PointerEvent('pointerdown', {pointerId: 11, pointerType: 'pen', clientX: x, clientY: y, pressure: .5, buttons: 1, bubbles: true}));
}, {x: cx, y: cy - 150});
await page.getByRole('button', {name: 'Yalnızca kalem / yakınlaştırma kilidi'}).click();
await page.getByRole('switch', {name: /Yalnızca kalem/}).uncheck();
await page.keyboard.press('Escape');
await drag([[[cx - 100, cy + 150], [cx + 50, cy + 170]]]);
assert.equal(await strokes(), 2, 'kalemin hemen ardından gelen dokunuş (avuç) çizmemeli');

console.log('✓ Dokunmatik testleri geçti');
await browser.close();
