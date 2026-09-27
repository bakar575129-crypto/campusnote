// 1.2 Phase 5: ana sayfa (dashboard), yeni menü, şablon mağazası (ücretsiz kullan / premium kilidi), XP ve rozetler
// (sunucu hesaplar), profil, dersler sayfası, telefonda yatay taşma olmaması.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 860}});
const page = await context.newPage();
const errors = [];
page.on('response', r => { if (r.url().includes('/api/sync/') && r.status() === 400) errors.push('eşitleme reddi: ' + r.url()); });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const step = s => console.log('•', s);
const shot = async n => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${n}.png`}); };
const api = (method, url, body) => page.evaluate(async ([m, u, b]) => {
  const r = await fetch(u, {method: m, headers: {'x-kalemlik': '1', 'content-type': 'application/json'}, body: b ? JSON.stringify(b) : undefined});
  return {status: r.status, body: await r.json().catch(() => ({}))};
}, [method, url, body]);
const until = async (fn, ms = 15000, msg = 'zaman aşımı') => {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return; await new Promise(r => setTimeout(r, 300)); }
  throw new Error(msg);
};

step('kayıt → ana sayfa');
await page.goto(BASE + '/kayit');
await page.fill('#name', 'Deniz Öğrenci'); await page.fill('#email', `p5${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]');
await page.waitForSelector('.home-page');
assert.equal(new URL(page.url()).pathname, '/');
assert.match(await page.locator('.home-head h1').innerText(), /(Günaydın|İyi günler|İyi akşamlar|İyi geceler), Deniz 👋/);
for (const t of ['Bugünkü plan', 'Çalışma hedefi', 'Yaklaşan sınav', 'Kalemlik AI', 'Hızlı ekle']) await page.waitForSelector(`.home-card-title:has-text("${t}")`);
await page.waitForSelector('.level-chip:has-text("Seviye 1")');

step('menü: yeni bölümler ve eski bölümler "Diğer" altında');
const nav = await page.locator('.sidebar .nav-link span').allInnerTexts();
for (const n of ['Ana Sayfa', 'Dersler', 'Defterler', 'Takvim', 'Görevler', 'Çalışma', 'Notlarım', 'Kayıtlar', 'Kalemlik AI', 'Paylaşımlar', 'Şablonlar', 'Profil', 'Favoriler', 'Ders Programı', 'Odaklan', 'Günlük', 'Çöp Kutusu']) assert.ok(nav.includes(n), `menüde ${n}`);

step('ders ve sınav ekle → Dersler ve ana sayfa');
const day = (new Date().getDay() + 6) % 7;
await api('PUT', `/api/sync/lesson/${randomUUID()}`, {rev: 0, data: {title: 'Organik Kimya', day, start: '23:58', end: '23:59', room: 'B204', instructor: '', color: '#d9467a', note: ''}});
const examDate = new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10);
await api('PUT', `/api/sync/task/${randomUUID()}`, {rev: 0, data: {title: 'Organik Kimya Final', course: 'Organik Kimya', description: '', dueDate: examDate, dueTime: '', category: 'exam', color: '#d9467a', done: false, completedAt: null}});
await page.reload();
await page.waitForSelector('.exam-title:has-text("Organik Kimya Final")');
await page.waitForSelector('.home-head p:has-text("1 dersin")');
await shot('80-ana-sayfa');
await page.getByRole('link', {name: 'Dersler', exact: true}).click();
await page.waitForSelector('.course-card:has-text("Organik Kimya")');
assert.match(await page.locator('.course-card').first().innerText(), /Sınava 1[12] gün/);
await shot('81-dersler');

step('şablon mağazası: kategoriler, filtre, önizleme');
await page.getByRole('link', {name: 'Şablonlar'}).click();
await page.waitForSelector('.tpl-card');
assert.equal(await page.locator('.tpl-cats .chip').count(), 14, 'Tüm kategoriler + 13 kategori');
await page.waitForSelector('img.tpl-thumb');
await shot('82-sablonlar');
await page.locator('.tpl-cats').getByRole('button', {name: 'Cornell Notes'}).click();
assert.ok((await page.locator('.tpl-card').count()) >= 1);
for (const c of await page.locator('.tpl-card .badge').allInnerTexts()) assert.equal(c, 'Cornell Notes');
await page.locator('.tpl-cats').getByRole('button', {name: 'Tüm kategoriler'}).click();
await page.getByRole('group', {name: 'Fiyat'}).getByRole('button', {name: 'Premium'}).click();
const locked = page.locator('.tpl-card').first();
assert.match(await locked.innerText(), /Planını yükselt/, 'ücretsiz planda premium kilitli');
await locked.getByRole('button', {name: /önizleme/}).click();
await page.waitForSelector('.tpl-preview-pages img');
await page.getByRole('dialog').getByRole('button', {name: 'Planını yükselt'}).click();
await page.waitForURL('**/plan');
await page.waitForSelector('.plan-card:has-text("Premium şablonlar")');
await page.waitForSelector('.plan-card:has-text("Kalemlik AI isteği")');

step('ücretsiz şablonu kullan → defter şablondaki sayfalarla açılır');
await page.goto(BASE + '/sablonlar');
await page.getByRole('searchbox', {name: 'Şablon ara'}).fill('cornell not');
await page.locator('.tpl-card').first().getByRole('button', {name: 'Şablonu Kullan'}).click();
await page.waitForURL('**/defter/**');
const nbId = new URL(page.url()).pathname.split('/')[2];
await until(async () => {
  const s = (await api('GET', '/api/sync?since=0')).body;
  return s.records.notebook.some(n => n.id === nbId && n.title === 'Cornell not sistemi' && n.paper === 'cornell') && s.records.page.filter(p => p.notebookId === nbId).length === 2;
}, 15000, 'şablondan oluşan defter eşitlenmedi');
const pages = (await api('GET', `/api/notebooks/${nbId}/pages`)).body.pages;
assert.ok(pages.some(p => p.content.texts.some(t => t.text === 'ANAHTAR SORULAR')), 'şablon başlıkları sayfada');
const uses = (await api('GET', '/api/templates')).body.items.find(t => t.id === 'cornell-klasik').uses;
assert.ok(uses >= 1, 'kullanım sayısı arttı');

step('XP ve rozet: yeni not +5, İlk Not rozeti; görev tamamla +10');
const task = randomUUID();
await api('PUT', `/api/sync/task/${task}`, {rev: 0, data: {title: 'Ödev', course: 'Organik Kimya', description: '', dueDate: examDate, dueTime: '', category: 'homework', color: '#2f6fed', done: true, completedAt: Date.now()}});
await until(async () => (await api('GET', '/api/progress')).body.xp === 15, 10000, 'XP 15 olmadı');
await page.goto(BASE + '/profil');
await page.waitForSelector('.badge-tile.is-earned:has-text("İlk Not")');
assert.match(await page.locator('.level-line').innerText(), /Seviye 1.*15 XP/s);
assert.equal(await page.locator('.badge-tile').count(), 8);
await page.waitForSelector('.xp-rules li:has-text("Görev tamamla")');
await shot('83-profil');
assert.equal((await api('POST', '/api/progress', {xp: 5000})).status, 404, 'istemci XP gönderemez');

step('telefon: ana sayfa, şablonlar, profil taşmıyor; alt menü');
await page.setViewportSize({width: 390, height: 844});
for (const [url, sel, name] of [['/', '.home-page', '84-mobil-ana-sayfa'], ['/sablonlar', '.tpl-card', '85-mobil-sablonlar'], ['/profil', '.badge-tile', '86-mobil-profil'], ['/dersler', '.course-card', '87-mobil-dersler']]) {
  await page.goto(BASE + url);
  await page.waitForSelector(sel);
  await page.waitForTimeout(300);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert.ok(over <= 1, `${url} yatay taşma ${over}px`);
  await shot(name);
}
const tabs = await page.locator('.tabbar .tab span').allInnerTexts();
assert.deepEqual(tabs, ['Ana Sayfa', 'Defterler', 'Görevler', 'Çalışma', 'Daha']);
await page.getByRole('button', {name: 'Daha'}).click();
await page.getByRole('dialog', {name: 'Diğer bölümler'}).getByRole('link', {name: 'Şablonlar'}).click();
await page.waitForURL('**/sablonlar');

assert.deepEqual(errors, []);
console.log('✓ Phase 5 testleri geçti');
await browser.close();
