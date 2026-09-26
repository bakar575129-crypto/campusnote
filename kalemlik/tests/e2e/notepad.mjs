// 1.1.1: bloknot stickerları (sayfaya koy, üstüne kalemle yaz) ve kâğıt dışına taşan çizgilerin hatasız kaydı.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 860}});
const page = await context.newPage();
const errors = [];
page.on('response', r => { if (r.url().includes('/api/sync/') && r.status() === 400) errors.push('eşitleme reddi: ' + r.url()); });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const step = s => console.log('•', s);
const SHOTS = process.env.SHOTS;
const shot = async n => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${n}.png`}); };
const pagesOf = () => page.evaluate(async () => (await (await fetch(`/api/notebooks/${location.pathname.split('/').pop()}/pages`)).json()).pages);
const synced = async () => {
  await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
  await page.waitForTimeout(1500);
};

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Bloknot Test'); await page.fill('#email', `b${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');
await page.getByRole('button', {name: 'Yeni defter'}).first().click();
await page.fill('#nb-title', 'Kimya'); await page.getByRole('button', {name: 'Defteri oluştur'}).click();
await page.waitForURL('**/defter/**');
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.viewport canvas');

step('Stickerlar → Bloknotlar: 16 çeşit, sarı yapışkan not eklenir');
await page.getByRole('button', {name: 'Sticker ekle'}).click();
await page.getByRole('tab', {name: 'Bloknotlar'}).click();
assert.equal(await page.locator('.sticker-thumb.is-pad').count(), 16);
await shot('30-bloknotlar');
await page.getByRole('button', {name: 'Yapışkan not (sarı) stickerını ekle'}).click();
await page.waitForSelector('.placed-frame');
const pad = await page.locator('.placed-frame').boundingBox();

step('bloknotu sayfanın köşesine taşı');
await page.mouse.move(pad.x + pad.width / 2, pad.y + pad.height / 2);
await page.mouse.down(); await page.mouse.move(pad.x + pad.width / 2 - 120, pad.y + pad.height / 2 - 150, {steps: 8}); await page.mouse.up();
await page.waitForTimeout(250);
const moved = await page.locator('.placed-frame').boundingBox();
assert.ok(moved.x < pad.x - 80, 'bloknot taşınmalı');

step('kalemle bloknotun üstüne yaz');
await page.getByRole('button', {name: /^Tükenmez/}).click();
const cx = moved.x + moved.width / 2, cy = moved.y + moved.height / 2;
// Kalın bir mürekkep şeridi: yan yana birçok çizgi
for (let i = 0; i < 12; i++) {
  await page.mouse.move(cx - 60, cy - 12 + i * 2); await page.mouse.down();
  await page.mouse.move(cx + 60, cy - 12 + i * 2, {steps: 4}); await page.mouse.up();
}
await page.waitForTimeout(300);
// Mürekkep bloknotun üstünde görünmeli (sarı değil koyu piksel)
const png = (await page.screenshot({clip: {x: cx - 2, y: cy - 2, width: 4, height: 4}})).toString('base64');
const rgb = await page.evaluate(async b64 => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  return [...x.getImageData(Math.floor(img.width / 2), Math.floor(img.height / 2), 1, 1).data].slice(0, 3);
}, png);
console.log('  bloknot üstündeki piksel:', rgb);
assert.ok(rgb[0] + rgb[1] + rgb[2] < 300, 'mürekkep bloknotun üstünde görünmeli');
await shot('31-bloknot-yazi');

step('kâğıdın dışına taşan çizgi hatasız kaydedilir');
const vp = await page.locator('.viewport').boundingBox();
await page.mouse.move(cx, cy + 60); await page.mouse.down();
await page.mouse.move(vp.x + 3, vp.y + 3, {steps: 10}); await page.mouse.up();
await synced();
assert.equal(await page.locator('.toast', {hasText: 'Kaydedilemedi'}).count(), 0, 'kaydetme hatası olmamalı');
const [first] = await pagesOf();
assert.equal(first.content.stickers.length, 1);
assert.equal(first.content.stickers[0].builtin, 'blok-sari');
assert.ok(first.content.strokes.length >= 13, 'bloknot üstündeki yazı ve taşan çizgi kaydedilmeli');
assert.ok(first.content.strokes.some(s => { for (let i = 0; i < s.pts.length; i += 3) if (s.pts[i] < 0 || s.pts[i + 1] < 0) return true; return false; }), 'kâğıt dışı noktalar korunmalı');

step('yenileyince bloknot ve yazı yerinde');
await page.reload();
await page.waitForSelector('.viewport canvas, .cover-stage');
if (await page.locator('.cover-stage').count()) await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.placed-images .placed img');
await page.waitForTimeout(500);
await shot('32-bloknot-yenile');

step('eski sürümden kalmış bozuk, takılı kayıtlar açılışta onarılıp kaydedilir');
const pageId = first.id;
await page.evaluate(async pageId => {
  const db = await new Promise((res, rej) => { const r = indexedDB.open('kalemlik'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const tx = (store, mode = 'readonly') => db.transaction(store, mode).objectStore(store);
  const keys = await new Promise(res => { const r = tx('records').getAllKeys(); r.onsuccess = () => res(r.result); });
  const key = keys.find(k => k.endsWith('|page|' + pageId));
  const uid = key.split('|')[0];
  const rec = await new Promise(res => { const r = tx('records').get(key); r.onsuccess = () => res(r.result); });
  const content = await new Promise(res => { const r = tx('pageContent').get(uid + '|' + pageId); r.onsuccess = () => res(r.result); });
  content.strokes.push(
    {id: 'bozuk 1', t: 'pen', pen: 'ballpoint', c: 'black', w: 0, o: 0, pts: [-90000, 50000, 7, NaN, 3, 0.5, 20, 20, 0.5, 30]},
    {id: 'bozuk 1', t: 'text', c: '#000', w: 2, o: 1, pts: [10, 10, 1, 60, 10, 1], run: {text: 'x'.repeat(900), font: 'Kalam Bold', size: 999, weight: 4.6, spacing: 99}},
  );
  content.texts.push({id: 'm', x: NaN, y: 10, w: 2, text: 'not', font: 'nunito', size: 22, color: 'mavi'});
  content.stickers[0].rot = 1234.5;
  content.spacing = 500;
  const task = {entity: 'task', id: crypto.randomUUID(), rev: 0, dirty: true, deleted: false, version: 1, userId: uid,
    data: {title: '   ', course: '', description: '', dueDate: '', dueTime: '25:00', category: 'yok', color: 'red', done: false, completedAt: null, createdAt: Date.now(), updatedAt: Date.now(), rev: 0}};
  task.data.id = task.id;
  const w = db.transaction(['records', 'pageContent'], 'readwrite');
  w.objectStore('records').put({...rec, dirty: true, version: rec.version + 5}, key);
  w.objectStore('pageContent').put(content, uid + '|' + pageId);
  w.objectStore('records').put(task, `${uid}|task|${task.id}`);
  await new Promise(res => { w.oncomplete = res; });
}, pageId);
await page.reload();
await page.waitForSelector('.viewport canvas, .cover-stage');
await synced();
assert.equal(await page.locator('.toast', {hasText: 'Kaydedilemedi'}).count(), 0, 'kaydetme hatası olmamalı');
const [repaired] = await pagesOf();
assert.ok(repaired.content.strokes.some(s => s.run && s.run.text.length === 400), 'bozuk kayıt onarılıp sunucuya ulaşmalı');
assert.equal(new Set(repaired.content.strokes.map(s => s.id)).size, repaired.content.strokes.length);
const tasks = await page.evaluate(async () => (await (await fetch('/api/sync?since=0')).json()).records.task);
assert.equal(tasks.length, 1, 'bozuk görev de kaydedilmeli');
assert.equal(tasks[0].category, 'todo');

assert.deepEqual(errors, []);
console.log('✓ Bloknot testleri geçti');
await browser.close();
