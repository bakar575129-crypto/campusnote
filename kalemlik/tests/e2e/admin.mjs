// Yönetim paneli (tarayıcı): kullanıcı arama, abonelik verme, ek GB / defter hakkı, şifre sıfırlama bağlantısı.
// Test hesabını yönetici yapmak için veritabanına bağlanır (.env'deki DB_* ayarları).
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import mysql from 'mysql2/promise';
import {readConfig} from '../../server/config.mjs';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const cfg = readConfig();
const db = await mysql.createConnection({host: cfg.db.host, user: cfg.db.user, password: cfg.db.password, database: cfg.db.database});
const browser = await chromium.launch();
const context = await browser.newContext({viewport: {width: 1280, height: 900}});
const page = await context.newPage();
const errors = [];
page.on('response', r => { if (r.url().includes('/api/sync/') && r.status() === 400) errors.push('eşitleme reddi: ' + r.url()); });
page.on('pageerror', e => errors.push(e.message));
const step = s => console.log('•', s);
const stamp = Date.now();

// Öğrenci hesabı (ayrı tarayıcı bağlamında)
const student = await (await browser.newContext()).newPage();
await student.goto(BASE + '/kayit');
await student.fill('#name', 'Öğrenci Deniz'); await student.fill('#email', `ogr${stamp}@ornek.com`); await student.fill('#password', 'guclu-sifre-123');
await student.click('button[type=submit]'); await student.waitForURL('**/defterler');

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Yönetici Test'); await page.fill('#email', `adm${stamp}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');
await db.execute("UPDATE users SET role='admin' WHERE email=?", [`adm${stamp}@ornek.com`]);
await page.reload();

step('Yönetim menüsü ve kullanıcı arama');
await page.getByRole('link', {name: 'Yönetim'}).click();
await page.waitForSelector('.admin-stats');
await page.fill('input[aria-label="Kullanıcı ara"]', `ogr${stamp}`);
await page.waitForFunction(() => document.querySelectorAll('button.admin-row').length === 1);
if (process.env.SHOTS) await page.screenshot({path: `${process.env.SHOTS}/30-yonetim.png`});
await page.locator('button.admin-row').click();

step('Pro paket (1 yıl)');
await page.locator('.dialog select[aria-label="Plan"]').selectOption('pro');
await page.locator('.dialog select[aria-label="Süre"]').selectOption('365');
await page.locator('.dialog').getByRole('button', {name: 'Uygula'}).click();
await page.waitForSelector('text=Abonelik tanımlandı.');

step('+5 GB ve +2 defter');
await page.getByRole('button', {name: '+5 GB'}).click();
await page.getByRole('button', {name: '+1 defter'}).click();
await page.getByRole('button', {name: '+1 defter'}).click();
await page.locator('.dialog').getByRole('button', {name: 'Kaydet'}).click();
await page.waitForSelector('text=Ek haklar kaydedildi.');
const [[u]] = await db.execute('SELECT extra_storage_mb, extra_notebooks FROM users WHERE email=?', [`ogr${stamp}@ornek.com`]);
assert.equal(u.extra_storage_mb, 5120);
assert.equal(u.extra_notebooks, 2);

step('Şifre sıfırlama bağlantısı');
await page.getByRole('button', {name: 'Sıfırlama bağlantısı gönder'}).click();
const link = await page.locator('input[aria-label="Sıfırlama bağlantısı"]').inputValue();
assert.match(link, /sifre-sifirla\?token=/);
if (process.env.SHOTS) await page.screenshot({path: `${process.env.SHOTS}/31-yonetim-kullanici.png`});

step('Öğrenci planını görüyor');
await student.goto(BASE + '/plan');
await student.waitForSelector('.usage-grid');
const text = await student.locator('.page').innerText();
assert.match(text, /Pro/);
assert.match(text, /Sınırsız defter/);

step('Sistem sekmesi: tanıma durumu');
await page.keyboard.press('Escape');
await page.getByRole('radio', {name: 'Sistem'}).click();
await page.waitForSelector('text=El yazısı tanıma');
if (process.env.SHOTS) await page.screenshot({path: `${process.env.SHOTS}/32-yonetim-sistem.png`});

assert.deepEqual(errors, []);
console.log('✓ Yönetim paneli testleri geçti');
await db.end();
await browser.close();
