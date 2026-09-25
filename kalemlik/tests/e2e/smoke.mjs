// Uçtan uca duman testi (Playwright + Chromium): gerçek sunucuya karşı çalışır.
// Kullanım: BASE_URL=http://localhost:3000 node tests/e2e/smoke.mjs
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || '';
const email = `e2e${Date.now()}@ornek.com`;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 860}, deviceScaleFactor: 1});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const shot = async name => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${name}.png`}); };
const step = (name) => console.log('•', name);

step('kayıt');
await page.goto(BASE + '/kayit');
await page.fill('#name', 'Test Öğrenci');
await page.fill('#email', email);
await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]');
await page.waitForURL('**/defterler');
await shot('01-defterler-bos');

step('defter oluştur');
await page.getByRole('button', {name: 'Yeni defter'}).first().click();
await page.fill('#nb-title', 'Diferansiyel Denklemler');
await page.fill('#nb-course', 'MAT 204');
await page.getByRole('radio', {name: 'Standart kareli'}).click();
await shot('02-yeni-defter');
await page.getByRole('button', {name: 'Defteri oluştur'}).click();
await page.waitForURL('**/defter/**');
await shot('03-kapak');
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.viewport canvas');

step('kalemle çiz');
const vp = await page.locator('.viewport').boundingBox();
const draw = async (x0, y0, pts) => {
  await page.mouse.move(vp.x + x0, vp.y + y0);
  await page.mouse.down();
  for (const [x, y] of pts) await page.mouse.move(vp.x + x, vp.y + y, {steps: 4});
  await page.mouse.up();
};
await draw(300, 200, [[340, 230], [380, 190], [420, 240], [460, 200]]);
await draw(300, 300, [[500, 300]]);
await page.waitForTimeout(300);
const strokesCount = async () => page.evaluate(() => {
  const id = location.pathname.split('/').pop();
  return window.__klm?.pages(id) ?? null;
});
await shot('04-cizim');

step('geri al / yinele');
await page.getByRole('button', {name: 'Geri al (Ctrl+Z)'}).click();
await page.getByRole('button', {name: 'Yinele (Ctrl+Shift+Z)'}).click();
await page.getByRole('button', {name: 'Geri al (Ctrl+Z)'}).click();

step('metin kutusu');
await page.getByRole('button', {name: 'Metin'}).click();
await page.mouse.click(vp.x + 320, vp.y + 420);
await page.keyboard.type('• Birinci madde');
await page.keyboard.press('Enter');
await page.keyboard.type('İkinci');
const text = await page.locator('.textbox textarea').first().inputValue();
assert.equal(text, '• Birinci madde\n• İkinci', 'liste devam etmeli');
await shot('05-metin');

step('şekil');
await page.getByRole('button', {name: 'Şekiller'}).click();
await page.getByRole('radio', {name: 'Yıldız'}).click();
await draw(600, 200, [[700, 300]]);

step('sayfa ekle');
await page.getByRole('button', {name: 'Bu sayfadan sonra yeni sayfa ekle'}).click();
await page.waitForTimeout(200);
assert.match(await page.locator('.page-nav-label').innerText(), /Sayfa 2 \/ 2/);

step('eşitleme bekle ve yeniden yükle');
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
await page.waitForTimeout(1500);
const res = await page.evaluate(async () => {
  const id = location.pathname.split('/').pop();
  const r = await fetch(`/api/notebooks/${id}/pages`);
  return r.json();
});
assert.equal(res.pages.length, 2);
const first = res.pages[0].content;
assert.equal(first.template, 'grid');
assert.equal(first.strokes.filter(s => s.t === 'pen').length, 1, 'geri alınan çizgi sunucuda olmamalı');
assert.equal(first.strokes.filter(s => s.t === 'shape' && s.shape === 'star').length, 1);
assert.equal(first.texts.length, 1);
await page.reload();
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.viewport canvas');
await shot('06-yeniden-yukleme');

step('çevrimdışı yazma ve yeniden bağlanınca eşitleme');
await context.setOffline(true);
await page.evaluate(() => window.dispatchEvent(new Event('offline')));
const vp2 = await page.locator('.viewport').boundingBox();
await page.getByRole('button', {name: /Tükenmez/}).click();
await page.mouse.move(vp2.x + 250, vp2.y + 520); await page.mouse.down();
await page.mouse.move(vp2.x + 450, vp2.y + 560, {steps: 8}); await page.mouse.up();
await page.waitForTimeout(800);
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});
const res2 = await page.evaluate(async () => (await (await fetch(`/api/notebooks/${location.pathname.split('/').pop()}/pages`)).json()));
assert.equal(res2.pages[0].content.strokes.filter(s => s.t === 'pen').length, 2, 'çevrimdışı çizgi eşitlenmeli');

step('ders programı');
await page.goto(BASE + '/program');
await page.getByRole('button', {name: /Ders ekle|İlk dersini ekle/}).first().click();
await page.fill('#ls-title', 'Fizik II');
await page.fill('#ls-start', '10:00');
await page.fill('#ls-end', '11:50');
await page.fill('#ls-room', 'B-204');
await page.getByRole('button', {name: 'Kaydet'}).click();
await page.waitForSelector('.lesson-block');
await shot('07-program');

step('ödev / sınav');
await page.goto(BASE + '/gorevler');
await page.getByRole('button', {name: /Yeni kayıt|Ödev, sınav/}).first().click();
await page.locator('.dialog').getByRole('radio', {name: 'Sınav', exact: true}).click();
await page.fill('#tk-title', 'Fizik II vize');
await page.fill('#tk-course', 'Fizik II');
await page.getByRole('button', {name: 'Kaydet'}).click();
await page.waitForSelector('.task-row');
await page.locator('.task-check').first().click();
await shot('08-gorevler');

step('takvim ve odak');
await page.goto(BASE + '/takvim');
await page.waitForSelector('.calendar-grid');
await shot('09-takvim');
await page.goto(BASE + '/odak');
await page.getByRole('button', {name: 'Başlat'}).click();
await page.waitForTimeout(1200);
await page.getByRole('button', {name: 'Duraklat'}).click();
await page.getByRole('button', {name: 'Devam'}).waitFor();
await shot('10-odak');

step('ayarlar, hesap, plan');
for (const [url, name] of [['/ayarlar', '11-ayarlar'], ['/hesap', '12-hesap'], ['/plan', '13-plan']]) { await page.goto(BASE + url); await page.waitForTimeout(500); await shot(name); }

step('çöp kutusu');
await page.getByRole('link', {name: 'Defterlerim'}).click();
await page.getByRole('button', {name: 'Defter işlemleri'}).first().click();
await page.getByRole('menuitem', {name: 'Çöp kutusuna taşı'}).click();
await page.getByRole('link', {name: 'Çöp Kutusu'}).click();
await page.waitForSelector('.nb-card');
await page.getByRole('button', {name: 'Defter işlemleri'}).first().click();
await page.getByRole('menuitem', {name: 'Geri getir'}).click();
await page.getByRole('link', {name: 'Defterlerim'}).click();
await page.waitForSelector('.nb-card');
await shot('14-defterler');

await page.setViewportSize({width: 390, height: 844});
await page.waitForTimeout(300);
await shot('15-telefon');

assert.deepEqual(errors, [], 'tarayıcı hatası olmamalı');
console.log('✓ Tüm adımlar geçti');
await browser.close();
