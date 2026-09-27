// 1.2 Phase 4: ortak defter (davet, kabul, düzenleyen çizer → sahip birkaç saniyede görür, görüntüleyen salt okunur)
// ve not paylaşımı (bağlantı → giriş yapmadan açılır, PDF indirilir, bağlantı kapatılınca açılmaz).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const errors = [];
const step = s => console.log('•', s);
const stamp = Date.now();

async function user(name, tag, viewport = {width: 1280, height: 860}) {
  const context = await browser.newContext({viewport, acceptDownloads: true, extraHTTPHeaders: {'x-forwarded-for': `10.4.${stamp % 200}.${tag.length + name.length}`}});
  const page = await context.newPage();
  page.on('response', r => { if (r.url().includes('/api/sync/') && r.status() === 400) errors.push(`${name}: eşitleme reddi ${r.url()}`); });
  page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(`${name}: ${m.text()}`); });
  const email = `${tag}${stamp}@ornek.com`;
  await page.goto(BASE + '/kayit');
  await page.fill('#name', name); await page.fill('#email', email); await page.fill('#password', 'guclu-sifre-123');
  await page.click('button[type=submit]'); await page.waitForURL('**/defterler');
  const api = (method, url, body) => page.evaluate(async ([m, u, b]) => {
    const r = await fetch(u, {method: m, headers: {'content-type': 'application/json', 'x-kalemlik': '1'}, body: b ? JSON.stringify(b) : undefined});
    return {status: r.status, body: await r.json().catch(() => ({}))};
  }, [method, url, body]);
  return {context, page, email, api, shot: async n => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${n}.png`}); }};
}
const until = async (fn, ms = 15000, msg = 'zaman aşımı') => {
  for (const end = Date.now() + ms; Date.now() < end;) { if (await fn()) return; await new Promise(r => setTimeout(r, 300)); }
  throw new Error(msg);
};

const owner = await user('Ayşe Sahip', 'own');
const editor = await user('Burak Yazar', 'edt');
const viewer = await user('Cem Okur', 'vwr', {width: 390, height: 844});

step('sahip: defter + sayfa');
const nb = randomUUID(), pg = randomUUID();
const cover = {pattern: 'theme', patternOpacity: 0.2, patternSize: 6, showCourse: true, showTerm: true, label: '', stickers: []};
assert.equal((await owner.api('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: {title: 'Ortak Kimya', course: 'Kimya', term: '2026 Güz', color: '#3a6ff7', paper: 'lined', cover, favorite: false, trashedAt: null, lastOpenedAt: null}})).status, 200);
assert.equal((await owner.api('PUT', `/api/sync/page/${pg}`, {rev: 0, data: {notebookId: nb, position: 1, content: {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [{id: 't1', x: 60, y: 80, w: 800, text: 'Asitler ve bazlar', font: 'nunito', size: 24, color: '#1b2433'}], stickers: []}}})).status, 200);
await owner.page.goto(`${BASE}/defter/${nb}?sayfa=${pg}`);
await owner.page.waitForSelector('.viewport canvas').catch(async e => { await owner.page.screenshot({path: '/tmp/claude-0/-home-user-campusnote/0a7f8e02-17e4-5da2-ac6b-0ca508431483/scratchpad/fail.png'}); throw e; });

step('sahip: Paylaş → iki kişiyi davet et');
await owner.page.getByRole('button', {name: 'Paylaş', exact: true}).first().click();
const dlg = owner.page.getByRole('dialog');
for (const [who, role] of [[editor, 'editor'], [viewer, 'viewer']]) {
  await dlg.getByRole('textbox', {name: 'E-posta'}).fill(who.email);
  await dlg.getByRole('combobox', {name: 'Yetki', exact: true}).selectOption(role);
  await dlg.getByRole('button', {name: 'Davet et'}).click();
  await owner.page.waitForSelector(`text=${who.email}`);
}
await owner.shot('70-paylas-kisiler');
await dlg.getByRole('button', {name: /Kapat/}).first().click();

step('davetliler Paylaşımlar’da kabul eder');
for (const who of [editor, viewer]) {
  await who.page.goto(BASE + '/paylasimlar');
  await who.page.waitForSelector('.invite-card');
  if (who === editor) await who.shot('71-davet');
  await who.page.getByRole('button', {name: 'Kabul et'}).click();
  await who.page.waitForSelector('text=Davet kabul edildi');
  await who.page.goto(BASE + '/defterler');
  await who.page.waitForSelector('text=Ortak Kimya', {timeout: 15000});
}

step('düzenleyen çizer → sahip birkaç saniye içinde görür');
// Sahibin ekranındaki koyu (mürekkep) piksel sayısı: çizgi gelince artar.
const ownerInk = () => owner.page.evaluate(() => [...document.querySelectorAll('.viewport canvas')].reduce((n, c) => {
  try { const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 0; i < d.length; i += 4) if (d[i] < 90 && d[i + 1] < 90 && d[i + 2] < 120 && d[i + 3] > 0) n++; } catch { /* */ }
  return n;
}, 0));
const inkBefore = await ownerInk();
await editor.page.goto(`${BASE}/defter/${nb}?sayfa=${pg}`);
await editor.page.waitForSelector('.viewport canvas');
assert.equal(await editor.page.locator('.readonly-banner').count(), 0);
const vp = await editor.page.locator('.viewport').boundingBox();
await editor.page.mouse.move(vp.x + 400, vp.y + 300); await editor.page.mouse.down();
await editor.page.mouse.move(vp.x + 600, vp.y + 360, {steps: 12}); await editor.page.mouse.up();
await until(async () => (await owner.api('GET', `/api/notebooks/${nb}/pages`)).body.pages?.[0]?.content?.strokes?.length === 1, 15000, 'düzenleyenin çizgisi sunucuya ulaşmadı');
// Sahibin açık editörü: birkaç saniye içinde (4 sn yoklama) sayfanın rev’i ve çizgisi güncellenir.
await until(async () => {
  const info = await owner.page.evaluate(async () => (await fetch('/api/notebooks/' + location.pathname.split('/')[2] + '/collab')).json());
  return info.pages?.[0]?.lastEditor === 'Burak Yazar';
}, 10000, 'son düzenleyen güncellenmedi');
await owner.page.waitForFunction(() => document.querySelector('.readonly-banner') === null);
// Ekranda gerçekten göründüğünü doğrula: sahibin canvas’ında çizgi bölgesindeki pikseller boş değil.
await until(async () => (await ownerInk()) > inkBefore + 100, 12000, 'sahip çizgiyi ekranda görmedi');
await owner.shot('72-ortak-canli');

step('sahip değişiklik geçmişini görür');
await owner.page.getByRole('button', {name: 'Paylaş', exact: true}).first().click();
await owner.page.getByRole('dialog').getByRole('radio', {name: /Geçmiş/}).click();
await owner.page.waitForSelector('text=Burak Yazar');
await owner.page.getByRole('dialog').getByRole('button', {name: /Kapat/}).first().click();

step('görüntüleyen: salt okunur');
await viewer.page.goto(`${BASE}/defter/${nb}?sayfa=${pg}`);
await viewer.page.waitForSelector('.readonly-banner');
await viewer.shot('73-salt-okunur');
const vp2 = await viewer.page.locator('.viewport').boundingBox();
await viewer.page.mouse.move(vp2.x + 100, vp2.y + 200); await viewer.page.mouse.down();
await viewer.page.mouse.move(vp2.x + 250, vp2.y + 260, {steps: 8}); await viewer.page.mouse.up();
await viewer.page.waitForTimeout(1500);
assert.equal((await owner.api('GET', `/api/notebooks/${nb}/pages`)).body.pages[0].content.strokes.length, 1, 'görüntüleyen çizemez');
assert.equal((await viewer.api('PUT', `/api/sync/page/${pg}`, {rev: 99, data: {notebookId: nb, position: 1, content: {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [], stickers: []}}})).status, 403);

step('sahip: bağlantı oluştur');
await owner.page.getByRole('button', {name: 'Paylaş', exact: true}).first().click();
await owner.page.getByRole('dialog').getByRole('radio', {name: /Bağlantı/}).click();
await owner.page.getByRole('button', {name: 'Defter için bağlantı'}).click();
await owner.page.waitForSelector('code.link-url');
const url = await owner.page.locator('code.link-url').first().innerText();
assert.match(url, /\/share\/note\/[A-Za-z0-9_-]{22}$/);
await owner.shot('74-baglanti');
await owner.page.getByRole('dialog').getByRole('button', {name: /Kapat/}).first().click();

step('giriş yapmamış biri bağlantıyı açar, PDF indirir');
const anonCtx = await browser.newContext({viewport: {width: 1100, height: 900}, acceptDownloads: true});
const anon = await anonCtx.newPage();
anon.on('pageerror', e => errors.push('anonim: ' + e.message));
await anon.goto(url);
await anon.waitForSelector('.public-title h1');
assert.equal(await anon.locator('.public-title h1').innerText(), 'Ortak Kimya');
assert.match(await anon.locator('.public-title').innerText(), /Ayşe Sahip/);
await anon.waitForSelector('img.public-page');
if (SHOTS) await anon.screenshot({path: `${SHOTS}/75-paylasim-sayfasi.png`});
const [dl] = await Promise.all([anon.waitForEvent('download', {timeout: 30000}), anon.getByRole('button', {name: 'PDF olarak indir'}).click()]);
assert.match(dl.suggestedFilename(), /\.pdf$/);
const bad = await anon.evaluate(async () => (await fetch('/api/sync?since=0')).status);
assert.equal(bad, 401, 'anonim veri çekemez');

step('sahip bağlantıyı kapatır → açılmaz');
const links = (await owner.api('GET', '/api/shares')).body.links;
assert.equal(links.length, 1);
assert.equal((await owner.api('DELETE', `/api/links/${links[0].id}`)).status, 200);
await anon.reload();
await anon.waitForSelector('text=Paylaşım açılamadı');

step('düzenleyen defterden ayrılır → listesinden kalkar');
await editor.page.goto(BASE + '/paylasimlar');
await editor.page.waitForSelector(`text=Ortak Kimya`);
assert.equal((await editor.api('DELETE', `/api/notebooks/${nb}/members/${(await editor.api('GET', '/api/auth/me')).body.user.id}`)).status, 200);
await editor.page.goto(BASE + '/defterler');
await until(async () => (await editor.page.locator('text=Ortak Kimya').count()) === 0, 15000, 'ayrılan kullanıcının listesinden kalkmadı');

assert.deepEqual(errors, []);
console.log('✓ Phase 4 testleri geçti');
await browser.close();
