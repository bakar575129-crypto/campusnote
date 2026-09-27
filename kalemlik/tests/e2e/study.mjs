// 1.2 Phase 1: notlardan flashcard, kart çalışma (aralıklı tekrar), quiz, sınav çalışma planı, Kalemlik AI ekranı.
// Sunucuda AI anahtarı yokken de her şey kural tabanlı çalışmalı.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

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
const api = (method, url, body) => page.evaluate(async ([method, url, body]) => {
  const r = await fetch(url, {method, headers: {'x-kalemlik': '1', 'content-type': 'application/json'}, body: body ? JSON.stringify(body) : undefined});
  return {status: r.status, body: await r.json().catch(() => ({}))};
}, [method, url, body]);

await page.goto(BASE + '/kayit');
await page.fill('#name', 'Çalışkan Öğrenci'); await page.fill('#email', `s${Date.now()}@ornek.com`); await page.fill('#password', 'guclu-sifre-123');
await page.click('button[type=submit]'); await page.waitForURL('**/defterler');

step('ders notu olan bir defter (sunucuya eşitlenmiş)');
const nb = randomUUID();
const cover = {pattern: 'theme', patternOpacity: 0.2, patternSize: 6, showCourse: true, showTerm: true, label: '', stickers: []};
assert.equal((await api('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: {title: 'Biyoloji notları', course: 'Biyoloji', term: '2026 Güz', color: '#1f9d7a', paper: 'lined', cover, favorite: false, trashedAt: null, lastOpenedAt: null}})).status, 200);
const notes = 'Hücre bölünmesi\nMitoz: Bir hücrenin iki özdeş hücreye bölünmesi\nMayoz: Üreme hücrelerini oluşturan bölünme\nOsmoz: Suyun yarı geçirgen zardan geçişi\nDifüzyon: Maddelerin çok yoğundan az yoğuna geçişi\nFotosentez: Bitkilerin ışıkla besin üretmesi\nRibozom: Protein sentezinin yapıldığı organel';
assert.equal((await api('PUT', `/api/sync/page/${randomUUID()}`, {rev: 0, data: {notebookId: nb, position: 1, content: {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [{id: 't1', x: 60, y: 80, w: 800, text: notes, font: 'nunito', size: 20, color: '#1b2433'}], stickers: []}}})).status, 200);
const exam = randomUUID();
const examDate = new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);
await api('PUT', `/api/sync/task/${exam}`, {rev: 0, data: {title: 'Biyoloji Final', course: 'Biyoloji', description: '', dueDate: examDate, dueTime: '', category: 'exam', color: '#d9467a', done: false, completedAt: null}});
await page.reload();
await page.waitForSelector('text=Biyoloji notları');

step('Çalışma → notlardan 5 flashcard (AI anahtarı yok → kural tabanlı)');
await page.getByRole('link', {name: 'Çalışma'}).first().click();
await page.waitForURL('**/calisma');
await shot('40-calisma-bos');
await page.getByRole('button', {name: 'Notlarından flashcard oluştur'}).click();
await page.selectOption('#gen-src', `notebook:${nb}`);
await page.getByRole('dialog').getByRole('radio', {name: '5', exact: true}).click();
await page.getByRole('dialog').getByRole('button', {name: 'Oluştur'}).click();
await page.waitForURL('**/calisma/deste/**');
await page.waitForSelector('.card-row');
const cardCount = await page.locator('.card-row').count();
assert.equal(cardCount, 5, 'beş kart');
assert.match(await page.locator('.card-row').first().innerText(), /Mitoz/);
await shot('41-deste');

step('kartları çalış: çevir, değerlendir, oturum bitsin');
await page.getByRole('button', {name: /^Çalış( \(\d+\))?$/}).click();
for (let i = 0; i < 5; i++) {
  await page.getByRole('button', {name: 'Cevabı göster'}).click();
  if (i === 0) await shot('42-kart-cevirildi');
  await page.locator('.grade-btn', {hasText: 'Orta'}).click();
}
await page.waitForSelector('text=Oturum tamamlandı!');
await page.getByRole('button', {name: 'Desteye dön'}).click();
await page.waitForSelector('text=5 öğrenildi');

step('desteden quiz oluştur, çöz, sonuç ve yanlış konular');
await page.getByRole('button', {name: 'Quiz oluştur'}).click();
await page.getByRole('dialog').getByRole('radio', {name: '5', exact: true}).click();
await page.getByRole('dialog').getByRole('button', {name: 'Oluştur'}).click();
await page.waitForURL('**/calisma/quiz/**');
for (let i = 0; i < 5; i++) {
  await page.waitForSelector('.quiz-prompt');
  const input = page.locator('.quiz-card input.input');
  if (await input.count()) await input.fill('bilmiyorum');
  else await page.locator('.option').first().click();
  await page.getByRole('button', {name: 'Kontrol et'}).click();
  if (i === 0) await shot('43-quiz-soru');
  await page.getByRole('button', {name: /Sonraki soru|Sonucu gör/}).click();
}
await page.waitForSelector('.score-ring');
await shot('44-quiz-sonuc');
assert.match(await page.locator('.quiz-stats').innerText(), /doğru/);

step('sınav çalışma planı: sınavı seç, plan oluştur, görevlere ekle');
await page.goto(BASE + '/calisma?bolum=plans');
await page.getByRole('button', {name: 'Sınavım için plan oluştur'}).click();
assert.equal(await page.locator('#pl-exam').inputValue(), exam);
await page.getByRole('dialog').getByRole('button', {name: 'Planı oluştur', exact: true}).click();
await page.waitForURL('**/calisma/plan/**');
await page.waitForSelector('.plan-item');
const items = await page.locator('.plan-item').count();
assert.ok(items >= 9, `sınava kadar her güne madde (${items})`);
await shot('45-plan');
await page.getByRole('button', {name: 'Görevlere ekle'}).click();
await page.waitForSelector('text=görevlere ve takvime eklendi');
await page.locator('.plan-item .task-check').first().click();
await page.goto(BASE + '/gorevler');
await page.waitForSelector('.task-row');
const taskRows = await page.locator('.task-row').count();
assert.ok(taskRows >= items, `plan maddeleri görevlerde (${taskRows} satır, ${items} madde)`);

step('Kalemlik AI: anahtar yokken planlama sorusu cihazdaki verilerle yanıtlanır');
await page.goto(BASE + '/ai');
await page.waitForSelector('.ai-welcome');
await page.getByRole('button', {name: 'Bugünkü işlerimi planla'}).click();
await page.waitForSelector('.ai-assistant .md');
assert.match(await page.locator('.ai-assistant').last().innerText(), /Bugün/);
await shot('46-ai');

step('editör menüsünde flashcard / quiz / AI');
await page.goto(BASE + `/defter/${nb}`);
await page.getByRole('button', {name: 'İlk sayfaya geç'}).click();
await page.getByRole('button', {name: 'Diğer işlemler'}).click();
await page.getByRole('menuitem', {name: /Quiz oluştur/}).click();
assert.equal(await page.locator('#gen-src').inputValue(), `notebook:${nb}`);
await page.keyboard.press('Escape');

step('telefon görünümü');
await page.setViewportSize({width: 390, height: 844});
await page.goto(BASE + '/calisma');
await page.waitForSelector('.learn-card');
await shot('47-mobil-calisma');
await page.goto(BASE + '/ai');
await page.waitForSelector('.ai-compose');
const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
assert.equal(overflow, false, 'yatay taşma olmamalı');
await shot('48-mobil-ai');

await page.waitForFunction(() => document.querySelector('.sync-badge')?.className.includes('sync-idle'), null, {timeout: 15000}).catch(() => {});
assert.deepEqual(errors, []);
console.log('✓ Çalışma (Phase 1) testleri geçti');
await browser.close();
