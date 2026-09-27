// Akıllı Yazı Güzelleştirme güvenilirliği (1.2.1). Sunucu tanıması testte taklit edilir (gecikme ve yanıt denetimli):
//  1. Önceki kelimenin dönüşümü, kalem bir sonraki kelimeyi yazarken gelirse kaybolmaz.
//  2. Yavaş yazılan kelime parça parça dönüşmez: "B" dönüştükten sonra yanına "en" yazılırsa kelime yeniden açılır → "Ben".
//  3. Çok yakınlaştırılmış ekranda yazılan kelime tanımaya okunaklı boyutta gider.
//  4. Sunucu tanıması hata verirse (ör. API anahtarı bir çalışma alanına bağlı değil) el yazısı korunur ve neden söylenir.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 900}});
const page = await context.newPage();
const errors = [];
page.on('response', r => { if (r.url().includes('/api/sync/') && r.status() === 400) errors.push('eşitleme reddi: ' + r.url()); });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const step = s => console.log('•', s);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- sunucu tanıması taklidi
let ocrMode = 'ok';
const ocrCalls = [];
let answers = [];
await page.route('**/api/config', async route => {
  const res = await route.fetch();
  route.fulfill({response: res, json: {...(await res.json()), ocrEnabled: true}});
});
await page.route('**/api/ocr', async route => {
  const body = route.request().postDataJSON();
  const png = Buffer.from(body.image.split(',')[1], 'base64');
  const call = {w: png.readUInt32BE(16), h: png.readUInt32BE(20), at: Date.now()};
  ocrCalls.push(call);
  await sleep(700);
  if (ocrMode === 'workspace') return route.fulfill({status: 503, json: {error: 'API anahtarı bir çalışma alanına (workspace) bağlı değil. Yönetim → Sistem’de “Çalışma alanı kimliği (Workspace ID)” alanına wrkspc_ ile başlayan kimliği girin. Yazın korunuyor.', code: 'OCR_WORKSPACE'}});
  route.fulfill({json: {text: answers.shift() ?? '[okunamadı]'}});
});

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Yazı Test'); await page.fill('#email', `bt${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForSelector('.home-page');
await page.evaluate(() => localStorage.setItem('klm:debug', '1'));
const api = (method, url, body) => page.evaluate(async ([m, u, b]) => {
  const r = await fetch(u, {method: m, headers: {'x-kalemlik': '1', 'content-type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
  return {status: r.status, body: await r.json().catch(() => ({}))};
}, [method, url, body]);
const nb = randomUUID(), pg = randomUUID();
const cover = {pattern: 'theme', patternOpacity: 0.2, patternSize: 6, showCourse: true, showTerm: true, label: '', stickers: []};
await api('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: {title: 'Yazı', course: '', term: '', color: '#2f6fed', paper: 'lined', cover, favorite: false, trashedAt: null, lastOpenedAt: null}});
await api('PUT', `/api/sync/page/${pg}`, {rev: 0, data: {notebookId: nb, position: 1, content: {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [], stickers: []}}});
await page.goto(`${BASE}/defter/${nb}?sayfa=${pg}`);
await page.waitForSelector('.viewport canvas');

step('güzelleştirmeyi aç (Normal hız)');
await page.getByRole('button', {name: 'Akıllı yazı güzelleştirme'}).click();
await page.locator('.popover').getByRole('switch', {name: /Akıllı Yazı Güzelleştirme/}).click();
await page.locator('.popover').getByRole('radio', {name: /Normal/}).click();
await page.keyboard.press('Escape');
await page.getByRole('button', {name: /^Tükenmez/}).click();
if (await page.locator('.popover').count()) await page.keyboard.press('Escape');

// Sayfa koordinatından ekrana
const geom = async () => page.evaluate(() => { const p = document.querySelector('.paper'); const r = p.getBoundingClientRect(); return {x: r.left, y: r.top, z: r.width / p.offsetWidth}; });
/** Harf büyüklüğünde bir kıvrım (bir harf gibi). slow: çizim süresi (ms). */
async function letter(g, px, base, {size = 22, slow = 0} = {}) {
  const pts = [[0, 0], [3, -size], [7, -size * 0.3], [10, -size * 0.8], [13, 0]];
  const at = ([dx, dy]) => [g.x + (px + dx) * g.z, g.y + (base + dy) * g.z];
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    await page.mouse.move(...at(p), {steps: slow ? 12 : 4});
    if (slow) await sleep(slow / pts.length);
  }
  await page.mouse.up();
}
async function word(g, px, base, n, opts) { for (let i = 0; i < n; i++) await letter(g, px + i * 17, base, opts); }
/** Sayfanın cihazdaki (yerel) hâli. */
async function texts() {
  const c = await page.evaluate(id => window.__klmGet('page', id).content, pg);
  return {texts: c.strokes.filter(s => s.t === 'text').map(s => s.run.text), ink: c.strokes.filter(s => s.t === 'pen').length};
}

step('1) dönüşüm, kalem sonraki kelimeyi yazarken gelir → kaybolmaz');
let g = await geom();
answers = ['Ben', 'bünyamin'];
await word(g, 100, 300, 3);
// Sonraki kelimeye geçiş: kalem uzağa iner (önceki kelime tanımaya gider) ve yavaş yazar (yanıt bu sırada gelir).
await letter(g, 200, 300, {slow: 1600});
await word(g, 217, 300, 4);
await sleep(2600);
let r = await texts();
console.log('  ', r);
assert.deepEqual(r.texts, ['Ben', 'bünyamin'], 'iki kelime de dönüşmeli');
assert.equal(r.ink, 0, 'el yazısı kalmamalı');
if (SHOTS) await page.screenshot({path: `${SHOTS}/90-guzellestirme-yaris.png`});

step('2) yavaş yazılan kelime: "B" dönüştükten sonra yanına devam edilir → kelime bütün hâlde "Ben"');
answers = ['B', 'Ben'];
ocrCalls.length = 0;
await letter(g, 100, 380);
await sleep(1700); // kelime bitti sanılır: "B" tanınır ve dönüşür
r = await texts();
assert.ok(r.texts.includes('B'), 'parça dönüşmüş olmalı: ' + JSON.stringify(r.texts));
await word(g, 117, 380, 2); // hemen yanına devam
await sleep(2600);
r = await texts();
console.log('  ', r, ocrCalls.map(c => `${c.w}×${c.h}`));
assert.deepEqual([...r.texts].sort(), ['Ben', 'Ben', 'bünyamin'], 'ikinci satır tek kelime "Ben" olmalı (parça "B" kalmamalı): ' + JSON.stringify(r.texts));
assert.equal(r.ink, 0);
assert.ok(ocrCalls.length === 2 && ocrCalls[1].w > ocrCalls[0].w * 1.8, 'ikinci tanıma bütün kelimeyi görmeli');

step('3) çok yakınlaştırılmış: tanıma görüntüsü okunaklı boyutta');
for (let i = 0; i < 6; i++) await page.getByRole('button', {name: 'Yakınlaştır', exact: true}).click();
await sleep(400);
const zoomLabel = await page.locator('.zoom-pct').first().innerText();
console.log('   yakınlaştırma:', zoomLabel);
g = await geom();
answers = ['ok'];
ocrCalls.length = 0;
// Görünen alanın ortasına, kâğıtta küçük (8 birim) harflerle yaz
const vp = await page.locator('.viewport').boundingBox();
const cx = (vp.x + vp.width / 2 - g.x) / g.z, cy = (vp.y + vp.height / 2 - g.y) / g.z;
await word(g, cx, cy, 2, {size: 8});
await sleep(2200);
assert.equal(ocrCalls.length, 1);
console.log('   tanıma görüntüsü:', `${ocrCalls[0].w}×${ocrCalls[0].h}`);
assert.ok(ocrCalls[0].h >= 90, `görüntü yüksekliği okunaklı olmalı (${ocrCalls[0].h}px)`);
await page.getByRole('button', {name: 'Sayfaya sığdır'}).click().catch(() => {});

step('4) sunucu tanıması hata verir → el yazısı korunur, neden söylenir');
ocrMode = 'workspace';
g = await geom();
await word(g, 100, 460, 3);
await sleep(2600);
r = await texts();
assert.ok(r.ink >= 3, 'el yazısı korunmalı');
const toastText = await page.locator('.toast').allInnerTexts();
console.log('   bildirim:', toastText);
assert.ok(toastText.some(t => /çalışma alanı/i.test(t)), 'kullanıcıya gerçek neden söylenmeli');
if (SHOTS) await page.screenshot({path: `${SHOTS}/91-guzellestirme-hata.png`});

// Sunucuya da aynı hâl eşitlenir
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
await sleep(1500);
const server = (await api('GET', `/api/notebooks/${nb}/pages`)).body.pages[0].content.strokes.filter(s => s.t === 'text').map(s => s.run.text);
assert.deepEqual([...server].sort(), ['Ben', 'Ben', 'bünyamin', 'ok'], 'sunucudaki sayfa: ' + JSON.stringify(server));

assert.deepEqual(errors, []);
console.log('✓ Güzelleştirme güvenilirlik testleri geçti');
await browser.close();
