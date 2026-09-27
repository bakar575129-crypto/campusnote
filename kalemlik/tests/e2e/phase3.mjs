// 1.2 Phase 3: ders kaydı (sahte mikrofonla gerçek MediaRecorder), işaretler, transkript → özet → deftere; günlük;
// widget sayfası, hızlı ekle kısayolları ve widget veri uç noktası.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const BASE = process.env.BASE_URL || 'http://localhost:3000';
const browser = await chromium.launch({args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream']});
const context = await browser.newContext({viewport: {width: 1280, height: 860}, permissions: ['microphone']});
const page = await context.newPage();
const errors = [];
page.on('response', r => { if (r.url().includes('/api/sync/') && r.status() === 400) errors.push('eşitleme reddi: ' + r.url()); });
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
const step = s => console.log('•', s);
const SHOTS = process.env.SHOTS;
const shot = async n => { if (SHOTS) await page.screenshot({path: `${SHOTS}/${n}.png`}); };

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Kayıt Test'); await page.fill('#email', `p3${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForSelector('.home-page'); await page.goto(BASE + '/defterler');

step('ders kaydı: başlat, işaretle, duraklat, devam, bitir');
await page.goto(BASE + '/kayitlar');
await page.fill('#rc-course', 'Fizik');
await page.getByRole('button', {name: 'Kayda başla'}).click();
const live = page.getByRole('switch', {name: /Canlı transkript/});
if (await live.count() && await live.isChecked()) await live.click(); // başsız tarayıcıda konuşma tanıma servisi yok
await page.getByRole('button', {name: 'Kaydı başlat'}).click();
await page.waitForSelector('.state-recording');
await page.waitForTimeout(2200);
await page.getByRole('button', {name: 'İşaretle'}).click();
await page.getByRole('textbox', {name: 'İşaret notu'}).fill('Önemli formül');
await page.getByRole('button', {name: 'Duraklat'}).click();
await page.waitForSelector('.state-paused');
const pausedAt = await page.locator('.rec-time').innerText();
await page.waitForTimeout(1500);
assert.equal(await page.locator('.rec-time').innerText(), pausedAt, 'duraklatınca süre durur');
await shot('60-kayit');
await page.getByRole('button', {name: 'Devam et'}).click();
await page.waitForTimeout(1200);
await page.getByRole('button', {name: 'Bitir'}).click();
await page.waitForURL('**/kayitlar/**');
await page.waitForSelector('audio.rec-audio');
assert.match(await page.locator('.bookmark-row input').inputValue(), /Önemli formül/);

step('transkript yaz → özet çıkar → deftere ekle');
await page.fill('textarea.transcript', 'Newton’un ikinci yasası: Kuvvet kütle ile ivmenin çarpımıdır.\nİvme: Hızdaki değişimin zamana oranıdır.\nSürtünme kuvveti harekete zıt yönde etki eder ve cisimleri yavaşlatır.');
await page.locator('textarea.transcript').blur();
await page.getByRole('button', {name: /Özet çıkar|AI ile özetle/}).click();
await page.waitForSelector('text=Önemli noktalar');
await shot('61-kayit-ozet');
await page.getByRole('button', {name: 'Transkripti deftere ekle'}).click();
await page.waitForSelector('text=Transkript deftere eklendi.');

step('ses dosyası sunucuya yüklenir (doğru tür) ve kayıt eşitlenir');
for (let i = 0; i < 30; i++) {
  const ok = await page.evaluate(async () => { const s = await (await fetch('/api/sync?since=0')).json(); return s.records.recording.length === 1 && !!s.records.recording[0].notebookId; });
  if (ok) break;
  await page.waitForTimeout(1000);
}
const rec = await page.evaluate(async () => {
  const s = await (await fetch('/api/sync?since=0')).json();
  const r = s.records.recording[0];
  const f = await fetch(`/api/files/${r.fileId}`);
  return {rec: r, status: f.status, type: f.headers.get('content-type'), size: (await f.arrayBuffer()).byteLength};
});
assert.equal(rec.status, 200);
assert.match(rec.type, /^audio\//);
assert.ok(rec.size > 1000, `ses verisi var (${rec.size} bayt)`);
assert.ok(rec.rec.durationMs >= 3000 && rec.rec.durationMs < 6000, `süre duraklatma hariç (${rec.rec.durationMs} ms)`);
assert.equal(rec.rec.course, 'Fizik');
assert.equal(rec.rec.bookmarks[0].label, 'Önemli formül');
assert.match(rec.rec.summary, /Önemli noktalar/);
assert.ok(rec.rec.notebookId, 'kayıt deftere bağlandı');

step('günlük: yaz, yenile, kalıcı');
await page.goto(BASE + '/gunluk?yeni=1');
await page.getByRole('radio', {name: /İyi/}).click();
await page.getByRole('textbox', {name: 'Günlük'}).fill('Bugün fizik kaydını özetledim.');
await page.getByRole('textbox', {name: 'Başlık'}).click();
await page.waitForTimeout(800);
await page.reload();
await page.waitForSelector('.journal-body');
assert.equal(await page.getByRole('textbox', {name: 'Günlük'}).inputValue(), 'Bugün fizik kaydını özetledim.');
assert.equal(await page.getByRole('radio', {name: /İyi/}).getAttribute('aria-checked'), 'true');

step('widget: bugün, çalışma hedefi, hızlı ekle');
await page.setViewportSize({width: 390, height: 844});
await page.goto(BASE + '/widget');
await page.waitForSelector('.today-stats');
assert.match(await page.locator('.goal-num').innerText(), /\/ 90 dakika/);
await shot('62-widget');
await page.getByRole('button', {name: 'Yeni görev'}).click();
await page.waitForURL('**/gorevler?yeni=1');
await page.waitForSelector('#tk-title');
await page.goto(BASE + '/widget');
await page.getByRole('button', {name: 'Yeni not'}).click();
await page.waitForSelector('#nb-title');
const w = await page.evaluate(async () => (await fetch(`/api/widget/today?tz=${new Date().getTimezoneOffset()}`)).json());
assert.equal(w.study.goal, 90);
assert.ok(Array.isArray(w.lessons));
const manifest = await page.evaluate(async () => (await fetch('/manifest.webmanifest')).json());
assert.ok(manifest.shortcuts.some(s => s.url === '/widget') && manifest.shortcuts.some(s => s.url === '/gunluk?yeni=1'));

assert.deepEqual(errors, []);
console.log('✓ Phase 3 testleri geçti');
await browser.close();
