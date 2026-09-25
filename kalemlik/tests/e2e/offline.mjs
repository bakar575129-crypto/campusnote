// PWA: internet yokken uygulama kabuğu service worker'dan, veriler IndexedDB'den açılır; yazılanlar sonra eşitlenir.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1200, height: 800}});
const page = await context.newPage();
const step = s => console.log('•', s);

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Çevrimdışı'); await page.fill('#email', `o${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');
await page.getByRole('button', {name: 'Yeni defter'}).first().click();
await page.fill('#nb-title', 'Yolda Notlar'); await page.getByRole('button', {name: 'Defteri oluştur'}).click();
await page.waitForURL('**/defter/**');
const url = page.url();
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.viewport canvas');
step('service worker kuruldu mu');
await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, {timeout: 20000});
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000});

step('bağlantı kesildi → sayfa yeniden açılıyor');
await context.setOffline(true);
await page.goto(url);
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.waitForSelector('.viewport canvas');
const vp = await page.locator('.viewport').boundingBox();
await page.mouse.move(vp.x + 400, vp.y + 300); await page.mouse.down(); await page.mouse.move(vp.x + 600, vp.y + 350, {steps: 10}); await page.mouse.up();
await page.waitForTimeout(600);
assert.match(await page.locator('.sync-badge').first().getAttribute('class'), /sync-(offline|error)/);

step('bağlantı geri geldi → eşitlendi');
await context.setOffline(false);
await page.evaluate(() => window.dispatchEvent(new Event('online')));
await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 20000});
const pages = await page.evaluate(async () => (await (await fetch(`/api/notebooks/${location.pathname.split('/').pop()}/pages`)).json()).pages);
assert.equal(pages[0].content.strokes.length, 1, 'çevrimdışı yazılan çizgi sunucuya ulaşmalı');
console.log('✓ Çevrimdışı testi geçti');
await browser.close();
