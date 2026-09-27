// Gerçek MySQL/MariaDB veritabanına karşı uçtan uca API testi.
// Gerekli: TEST_DB_NAME, TEST_DB_USER, TEST_DB_PASSWORD (boş bir test veritabanı; tablolar silinip yeniden kurulur).
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {HttpError} from '../../server/errors.mjs';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mysql from 'mysql2/promise';
import {readConfig, ROOT} from '../../server/config.mjs';
import {createApp} from '../../server/app.mjs';
import {migrate} from '../../server/migrate.mjs';

const env = {
  NODE_ENV: 'test', APP_URL: 'http://localhost:3999',
  DB_HOST: process.env.TEST_DB_HOST || 'localhost', DB_NAME: process.env.TEST_DB_NAME || 'kalemlik_test',
  DB_USER: process.env.TEST_DB_USER || 'kalemlik', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'kalemlik-dev-pass',
  STORAGE_DIR: path.join(os.tmpdir(), 'kalemlik-test-storage-' + process.pid),
};
const config = readConfig(env);
let pool, server, base;
const fakeOcr = {configured: true, status: () => ({configured: true, provider: 'anthropic', model: 'test', keyHint: '…test', lastError: null}), async transcribe(b64, mode, lang) { if (lang === 'en') throw new HttpError(503, 'API anahtarı bir çalışma alanına (workspace) bağlı değil. Yazın korunuyor.', 'OCR_WORKSPACE'); return 'merhaba dünya'; }};
const aiCalls = [];
const fakeAi = {
  configured: true,
  status: () => ({configured: true, provider: 'anthropic', model: 'test', lastError: null}),
  async complete(req) {
    aiCalls.push(req);
    const last = req.messages.at(-1).content.map(c => c.text || '').join('\n');
    if (last.includes('{"cards"')) return {text: 'İşte kartlar:\n```json\n{"cards":[{"front":"Mitoz nedir?","back":"Hücre bölünmesi","topic":"Hücre"},{"front":"","back":"boş"}]}\n```'};
    if (last.includes('{"questions"')) return {text: '{"questions":[{"type":"mcq","prompt":"Mitoz kaç hücre verir?","options":["1","2","3","4"],"answer":"2","explanation":"İki özdeş hücre.","topic":"Hücre"},{"type":"tf","prompt":"DNA çekirdektedir.","answer":"Doğru"}]}'};
    if (last.includes('{"items"')) return {text: '{"items":[{"date":"2099-01-01","topic":"Türev","minutes":60,"kind":"study"},{"date":"2000-01-01","topic":"eski","minutes":60,"kind":"study"},{"date":"2099-12-31","topic":"sınav günü","minutes":60,"kind":"study"}],"advice":"Düzenli çalış."}'};
    if (last.includes('{"title"')) return {text: '{"title":"Özet","summary":"## Hücre\n- Mitoz","keyPoints":["Mitoz"],"topics":["Hücre"]}'};
    return {text: `Yanıt: ${last.slice(0, 40)}`};
  },
};
const mails = [];
const fakeMailer = {configured: true, async send(m) { mails.push(m); return true; }};

before(async () => {
  const conn = await mysql.createConnection({host: config.db.host, user: config.db.user, password: config.db.password, database: config.db.database, multipleStatements: true});
  const [tables] = await conn.query("SELECT table_name AS t, table_type AS k FROM information_schema.tables WHERE table_schema=DATABASE()");
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const {t, k} of tables) await conn.query(`DROP ${k === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  await migrate(conn);
  await conn.end();
  pool = mysql.createPool(config.db);
  const app = createApp({pool, config, ocr: fakeOcr, ai: fakeAi, mailer: fakeMailer});
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await pool?.end();
  await fs.rm(env.STORAGE_DIR, {recursive: true, force: true});
});

let clientNo = 0;
function client() {
  let cookie = '';
  // Her test istemcisi ayrı bir cihaz gibi (ayrı IP): kayıt/giriş hız sınırları testleri birbirine karıştırmasın.
  const ip = `10.0.${Math.floor(++clientNo / 250)}.${clientNo % 250 + 1}`;
  return async function call(method, url, body, extraHeaders = {}) {
    const headers = {'x-kalemlik': '1', origin: 'http://localhost:3999', 'x-forwarded-for': ip, ...extraHeaders};
    if (cookie) headers.cookie = cookie;
    let payload;
    if (body instanceof FormData) payload = body;
    else if (body !== undefined) { payload = JSON.stringify(body); headers['content-type'] = 'application/json'; }
    const res = await fetch(base + url, {method, headers, body: payload});
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const type = res.headers.get('content-type') || '';
    return {status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer(), headers: res.headers};
  };
}

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const cover = {pattern: 'theme', patternOpacity: 0.2, patternSize: 6, showCourse: true, showTerm: true, label: '', stickers: []};
const notebook = (over = {}) => ({title: 'Matematik', course: 'MAT101', term: '2026 Güz', color: '#2f6fed', paper: 'lined', cover, favorite: false, trashedAt: null, lastOpenedAt: null, ...over});
const page = (notebookId, over = {}) => ({notebookId, position: 1, content: {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [], stickers: [], ...over}});

test('kayıt, giriş, oturum ve kullanıcı izolasyonu', async () => {
  const a = client(), b = client();
  let r = await a('POST', '/api/auth/register', {name: 'Ayşe', email: 'AYSE@ornek.com', password: 'kisa'});
  assert.equal(r.status, 400);
  r = await a('POST', '/api/auth/register', {name: 'Ayşe', email: 'AYSE@ornek.com', password: 'guclu-sifre-123'});
  assert.equal(r.status, 201);
  assert.equal(r.body.user.email, 'ayse@ornek.com');
  assert.equal(r.body.user.role, 'admin', 'ilk hesap yönetici olur');
  r = await a('POST', '/api/auth/register', {name: 'Ayşe', email: 'ayse@ornek.com', password: 'guclu-sifre-123'});
  assert.equal(r.status, 409);

  r = await b('POST', '/api/auth/login', {email: 'ayse@ornek.com', password: 'yanlis-sifre'});
  assert.equal(r.status, 401);
  r = await b('POST', '/api/auth/register', {name: 'Mehmet', email: 'mehmet@ornek.com', password: 'guclu-sifre-456'});
  assert.equal(r.body.user.role, 'user');

  const id = randomUUID();
  r = await a('PUT', `/api/sync/notebook/${id}`, {rev: 0, data: notebook()});
  assert.equal(r.status, 200);
  assert.equal(r.body.rev, 1);
  // Başka kullanıcı aynı kimlikle yazamaz, sayfalarını okuyamaz.
  r = await b('PUT', `/api/sync/notebook/${id}`, {rev: 1, data: notebook({title: 'Ele geçir'})});
  assert.equal(r.status, 409);
  r = await b('GET', `/api/notebooks/${id}/pages`);
  assert.equal(r.status, 404);
  r = await b('GET', '/api/sync?since=0');
  assert.equal(r.body.records.notebook.length, 0);
});

test('CSRF: özel başlık ve Origin zorunlu', async () => {
  const res = await fetch(base + '/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({email: 'x@y.com', password: 'a'})});
  assert.equal(res.status, 403);
  const res2 = await fetch(base + '/api/auth/login', {method: 'POST', headers: {'content-type': 'application/json', 'x-kalemlik': '1', origin: 'https://kotu.example'}, body: '{}'});
  assert.equal(res2.status, 403);
});

test('defter + sayfa eşitleme, çakışma, silme izi', async () => {
  const c = client();
  await c('POST', '/api/auth/register', {name: 'Zeynep', email: 'zeynep@ornek.com', password: 'guclu-sifre-789'});
  const nb = randomUUID(), pg = randomUUID();
  // Defter yokken sayfa yazılamaz
  let r = await c('PUT', `/api/sync/page/${pg}`, {rev: 0, data: page(nb)});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'MISSING_PARENT');
  await c('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: notebook()});
  const stroke = {id: 's1', t: 'pen', pen: 'ballpoint', c: '#222222', w: 3, o: 1, pts: [10, 10, 0.5, 20, 20, 0.6]};
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 0, data: page(nb, {strokes: [stroke]})});
  assert.equal(r.status, 200);
  // Eski/bozuk istemci verisi reddedilmez, sunucuda onarılır: eksik nokta, null (NaN) nokta, sınır dışı konum,
  // geçersiz renk, eksik revizyon…
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 1, data: page(nb, {strokes: [{...stroke, pts: [1, 2]}, {...stroke, id: 's1', c: 'red', w: 900, pts: [-90000, 40000, 3, null, 5, 0.5, 7, 8, 0.5]}], texts: [{id: 't!', x: 'a', y: 1e9, w: 1, text: 'not', font: 'Kalam', size: 999, color: '#abc'}]})});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.rev, 2);
  let saved = (await c('GET', `/api/notebooks/${nb}/pages`)).body.pages[0].content;
  assert.deepEqual(saved.strokes[0].pts, [1, 2, 0.5]);
  assert.deepEqual(saved.strokes[1].pts, [-20000, 30000, 1, 7, 8, 0.5]);
  assert.notEqual(saved.strokes[0].id, saved.strokes[1].id);
  assert.equal(saved.strokes[1].c, '#1b2433');
  assert.equal(saved.texts[0].color, '#aabbcc');
  // Revizyonu olmayan gönderim → çakışma (istemci güncel kaydı alır), sayfa bozulmaz
  r = await c('PUT', `/api/sync/page/${pg}`, {data: page(nb)});
  assert.equal(r.status, 409);
  assert.equal(r.body.current.rev, 2);
  // Onarılamayan veri (geçersiz defter kimliği) hangi alan olduğunu bildirerek reddedilir
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 2, data: page('defter-yok')});
  assert.equal(r.status, 400);
  assert.equal(r.body.field, 'notebookId');
  // Kâğıdın çok dışına taşan çizgi ve üstüne yazılan bloknot kabul edilir
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 2, data: page(nb, {strokes: [{...stroke, pts: [-4000, 12000, 0.5, 900, 900, 0.5]}], stickers: [{id: 'n1', builtin: 'blok-sari', x: -300, y: 1200, w: 420, h: 420, rot: -5}]})});
  assert.equal(r.status, 200);
  assert.equal(r.body.rev, 3);
  // Eski revizyonla yazma → 409 + sunucudaki güncel kayıt
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 3, data: page(nb, {strokes: []})});
  assert.equal(r.body.rev, 4);
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 3, data: page(nb, {strokes: [stroke, stroke]})});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'CONFLICT');
  assert.equal(r.body.current.rev, 4);

  r = await c('GET', `/api/notebooks/${nb}/pages`);
  assert.equal(r.body.pages.length, 1);
  assert.deepEqual(r.body.pages[0].content.strokes, []);
  r = await c('GET', '/api/sync?since=0');
  assert.equal(r.body.records.page[0].content, undefined, 'eşitleme listesinde sayfa içeriği yok');

  // Çöpe atılmamış defter kalıcı silinemez
  r = await c('DELETE', `/api/sync/notebook/${nb}?rev=1`);
  assert.equal(r.status, 409);
  r = await c('PUT', `/api/sync/notebook/${nb}`, {rev: 1, data: notebook({trashedAt: Date.now()})});
  const cursor = (await c('GET', '/api/sync?since=0')).body.serverTime - 1;
  r = await c('DELETE', `/api/sync/notebook/${nb}?rev=2`);
  assert.equal(r.status, 200);
  r = await c('GET', `/api/sync?since=${cursor}`);
  const deleted = r.body.deletions.map(d => d.entity + ':' + d.id).sort();
  assert.deepEqual(deleted, [`notebook:${nb}`, `page:${pg}`].sort());
});

test('ücretsiz planda defter sınırı ve plan yükseltme', async () => {
  const c = client();
  await c('POST', '/api/auth/register', {name: 'Can', email: 'can@ornek.com', password: 'guclu-sifre-000'});
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const id = randomUUID(); ids.push(id);
    const r = await c('PUT', `/api/sync/notebook/${id}`, {rev: 0, data: notebook({title: 'D' + i})});
    assert.equal(r.status, 200);
  }
  let r = await c('PUT', `/api/sync/notebook/${randomUUID()}`, {rev: 0, data: notebook({title: 'Fazla'})});
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'NOTEBOOK_LIMIT');
  // Çöpe taşınan defter sınıra sayılmaz
  await c('PUT', `/api/sync/notebook/${ids[0]}`, {rev: 1, data: notebook({trashedAt: Date.now()})});
  r = await c('PUT', `/api/sync/notebook/${randomUUID()}`, {rev: 0, data: notebook({title: 'Yeni'})});
  assert.equal(r.status, 200);
  // Çöpten geri getirmek de sınır kontrolünden geçer
  r = await c('PUT', `/api/sync/notebook/${ids[0]}`, {rev: 2, data: notebook({trashedAt: null})});
  assert.equal(r.status, 403);
  // Plus planında sınır yok
  const [[user]] = await pool.execute("SELECT id FROM users WHERE email='can@ornek.com'");
  await pool.execute("INSERT INTO subscriptions (id,user_id,plan_id,status,provider,current_period_end,created_at,updated_at) VALUES (?,?,'plus','active','manual',?,?,?)", [randomUUID(), user.id, Date.now() + 86400000, Date.now(), Date.now()]);
  r = await c('PUT', `/api/sync/notebook/${ids[0]}`, {rev: 2, data: notebook({trashedAt: null})});
  assert.equal(r.status, 200);
  r = await c('GET', '/api/storage');
  assert.equal(r.body.plan.id, 'plus');
  assert.equal(r.body.notebooks.limit, null);
});

test('dosya yükleme: imza doğrulama, sahiplik, kullanım ve temizlik', async () => {
  const c = client(), other = client();
  await c('POST', '/api/auth/register', {name: 'Elif', email: 'elif@ornek.com', password: 'guclu-sifre-111'});
  await other('POST', '/api/auth/register', {name: 'Ali', email: 'ali@ornek.com', password: 'guclu-sifre-222'});
  const upload = (id, kind, buf, name = 'a.png') => { const f = new FormData(); f.append('id', id); f.append('kind', kind); f.append('file', new Blob([buf]), name); return f; };

  let r = await c('POST', '/api/files', upload(randomUUID(), 'sticker', Buffer.from('<svg onload=alert(1)>'), 'x.png'));
  assert.equal(r.status, 415, 'uzantı png olsa da içerik png değil');
  const fid = randomUUID();
  r = await c('POST', '/api/files', upload(fid, 'sticker', PNG));
  assert.equal(r.status, 201);
  r = await c('POST', '/api/files', upload(fid, 'sticker', PNG));
  assert.equal(r.status, 200, 'aynı yükleme tekrarlanabilir');
  r = await other('GET', `/api/files/${fid}`);
  assert.equal(r.status, 404, 'başkasının dosyası okunamaz');
  r = await c('GET', `/api/files/${fid}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(r.body).length, PNG.length);

  // Başkası bu dosyayı kaydında kullanamaz
  r = await other('PUT', `/api/sync/sticker/${randomUUID()}`, {rev: 0, data: {fileId: fid, name: 'x', width: 1, height: 1}});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'MISSING_FILE');
  const sid = randomUUID();
  r = await c('PUT', `/api/sync/sticker/${sid}`, {rev: 0, data: {fileId: fid, name: 'Kedi', width: 1, height: 1}});
  assert.equal(r.status, 200);
  r = await c('DELETE', `/api/files/${fid}`);
  assert.equal(r.status, 409, 'kullanılan dosya silinemez');
  r = await c('GET', '/api/storage');
  assert.equal(r.body.usage.usedBytes, PNG.length);
  assert.equal(r.body.files[0].inUse, true);
  await c('DELETE', `/api/sync/sticker/${sid}?rev=1`);
  r = await c('DELETE', `/api/files/${fid}`);
  assert.equal(r.status, 200);
  r = await c('GET', '/api/storage');
  assert.equal(r.body.usage.usedBytes, 0);
});

test('ders ve görev doğrulama', async () => {
  const c = client();
  await c('POST', '/api/auth/register', {name: 'Deniz', email: 'deniz@ornek.com', password: 'guclu-sifre-333'});
  // Bitişi başlangıçtan önce olan ders reddedilmez; bitiş bir saat sonraya alınır
  const lessonId = randomUUID();
  let r = await c('PUT', `/api/sync/lesson/${lessonId}`, {rev: 0, data: {title: 'Fizik', day: 0, start: '10:00', end: '09:00', room: '', instructor: '', color: '#123456', note: ''}});
  assert.equal(r.status, 200);
  assert.equal((await c('GET', '/api/sync?since=0')).body.records.lesson.find(l => l.id === lessonId).end, '11:00');
  r = await c('PUT', `/api/sync/lesson/${randomUUID()}`, {rev: 0, data: {title: 'Fizik', day: 0, start: '09:00', end: '10:30', room: 'B-201', instructor: 'Dr. Ak', color: '#123456', note: ''}});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/task/${randomUUID()}`, {rev: 0, data: {title: 'Ödev 1', course: 'Fizik', description: '', dueDate: '', dueTime: '9:5:00', category: 'ödev', color: '#123456', done: 'evet', completedAt: null}});
  assert.equal(r.status, 200, 'eksik tarih/saat/kategori onarılır');
  r = await c('PUT', `/api/sync/task/${randomUUID()}`, {rev: 0, data: {title: 'Vize', course: 'Fizik', description: 'Bölüm 1-3', dueDate: '2026-11-12', dueTime: '10:00', category: 'exam', color: '#123456', done: false, completedAt: null}});
  assert.equal(r.status, 200);
  r = await c('PUT', '/api/sync/settings/me', {rev: 0, data: {data: {theme: 'dark'}}});
  assert.equal(r.body.rev, 1);
  r = await c('PUT', '/api/sync/settings/me', {rev: 0, data: {data: {theme: 'light'}}});
  assert.equal(r.status, 409);
  assert.equal(r.body.current.data.theme, 'dark');
});

test('şifre değiştirme, sıfırlama ve OCR', async () => {
  const a = client(), b = client();
  await a('POST', '/api/auth/register', {name: 'Ece', email: 'ece@ornek.com', password: 'guclu-sifre-444'});
  await b('POST', '/api/auth/login', {email: 'ece@ornek.com', password: 'guclu-sifre-444'});
  let r = await a('POST', '/api/auth/password', {currentPassword: 'guclu-sifre-444', newPassword: 'yeni-guclu-sifre-1'});
  assert.equal(r.status, 200);
  r = await b('GET', '/api/auth/me');
  assert.equal(r.status, 401, 'diğer oturum kapandı');
  r = await a('GET', '/api/auth/me');
  assert.equal(r.status, 200, 'mevcut oturum sürüyor');

  r = await b('POST', '/api/auth/forgot', {email: 'ece@ornek.com'});
  assert.equal(r.status, 200);
  const token = /token=([^\s]+)/.exec(mails.at(-1).text)[1];
  r = await b('POST', '/api/auth/reset', {token: decodeURIComponent(token), password: 'sifirlanan-sifre-9'});
  assert.equal(r.status, 200);
  r = await b('POST', '/api/auth/reset', {token: decodeURIComponent(token), password: 'sifirlanan-sifre-9'});
  assert.equal(r.status, 400, 'bağlantı tek kullanımlık');
  r = await b('POST', '/api/auth/login', {email: 'ece@ornek.com', password: 'sifirlanan-sifre-9'});
  assert.equal(r.status, 200);
  r = await b('POST', '/api/auth/forgot', {email: 'olmayan@ornek.com'});
  assert.equal(r.status, 200, 'hesap varlığı sızdırılmaz');

  r = await b('POST', '/api/ocr', {image: 'data:image/png;base64,' + PNG.toString('base64'), mode: 'word'});
  assert.equal(r.status, 200);
  assert.equal(r.body.text, 'merhaba dünya');
  r = await b('POST', '/api/ocr', {image: 'javascript:alert(1)'});
  assert.equal(r.status, 400);
  // Tanıma hizmeti hata verirse (ör. anahtar/çalışma alanı sorunu) günlük haktan düşülmez
  const me = (await b('GET', '/api/auth/me')).body.user.id;
  const used = async () => Number((await pool.execute('SELECT count FROM ocr_usage WHERE user_id=?', [me]))[0][0]?.count || 0);
  const before = await used();
  r = await b('POST', '/api/ocr', {image: 'data:image/png;base64,' + PNG.toString('base64'), mode: 'word', lang: 'en'});
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'OCR_WORKSPACE');
  assert.equal(await used(), before, 'başarısız tanıma hakkı iade edilir');
});

test('yönetim paneli: abonelik, ek depolama/defter hakkı, şifre sıfırlama, hesap kapatma', async () => {
  const admin = client(), user = client(), stranger = client();
  // İlk hesap testlerin başında oluşturuldu (ayse) ve yöneticidir.
  let r = await admin('POST', '/api/auth/login', {email: 'ayse@ornek.com', password: 'guclu-sifre-123'});
  assert.equal(r.body.user.role, 'admin');
  r = await user('POST', '/api/auth/register', {name: 'Bora', email: 'bora@ornek.com', password: 'guclu-sifre-555'});
  const boraId = r.body.user.id;
  await stranger('POST', '/api/auth/register', {name: 'Cem', email: 'cem@ornek.com', password: 'guclu-sifre-666'});
  r = await stranger('GET', '/api/admin/users');
  assert.equal(r.status, 403, 'yönetici olmayan erişemez');

  r = await admin('GET', '/api/admin/users?q=bora');
  assert.equal(r.body.users.length, 1);
  assert.equal(r.body.users[0].plan.id, 'free');

  // Ek hak: +2 GB, +3 defter → ücretsiz planda 5+3 = 8 defter, 500 MB + 2048 MB
  r = await admin('POST', `/api/admin/users/${boraId}/grants`, {extraStorageMb: 2048, extraNotebooks: 3});
  assert.equal(r.body.plan.notebookLimit, 8);
  assert.equal(r.body.plan.storageBytes, (500 + 2048) * 1024 * 1024);
  r = await user('GET', '/api/storage');
  assert.equal(r.body.notebooks.limit, 8);

  // Abonelik paketi
  r = await admin('POST', `/api/admin/users/${boraId}/subscription`, {planId: 'pro', days: 30});
  assert.equal(r.body.plan.id, 'pro');
  assert.equal(r.body.plan.notebookLimit, null);
  r = await admin('POST', `/api/admin/users/${boraId}/subscription`, {planId: 'free'});
  assert.equal(r.body.plan.id, 'free');

  // Plan düzenleme
  r = await admin('PUT', '/api/admin/plans/free', {name: 'Ücretsiz', storageMb: 600, notebookLimit: 6, ocrDailyLimit: 30, priceMonthly: 0, active: true});
  assert.equal(r.status, 200);
  r = await user('GET', '/api/storage');
  assert.equal(r.body.notebooks.limit, 9);
  await admin('PUT', '/api/admin/plans/free', {name: 'Ücretsiz', storageMb: 500, notebookLimit: 5, ocrDailyLimit: 30, priceMonthly: 0, active: true});

  // Şifre sıfırlama bağlantısı: yöneticiye döner, e-posta gönderilir, bağlantı çalışır
  r = await admin('POST', `/api/admin/users/${boraId}/password-reset`);
  assert.match(r.body.link, /sifre-sifirla\?token=/);
  assert.equal(r.body.emailSent, true);
  const token = decodeURIComponent(r.body.link.split('token=')[1]);
  r = await stranger('POST', '/api/auth/reset', {token, password: 'bora-yeni-sifre-1'});
  assert.equal(r.status, 200);
  r = await user('GET', '/api/auth/me');
  assert.equal(r.status, 401, 'sıfırlama sonrası eski oturumlar kapanır');

  // Hesap kapatma: giriş yapamaz; yeniden açılınca girer
  r = await admin('POST', `/api/admin/users/${boraId}/status`, {disabled: true});
  assert.equal(r.status, 200);
  r = await user('POST', '/api/auth/login', {email: 'bora@ornek.com', password: 'bora-yeni-sifre-1'});
  assert.equal(r.status, 403);
  await admin('POST', `/api/admin/users/${boraId}/status`, {disabled: false});
  r = await user('POST', '/api/auth/login', {email: 'bora@ornek.com', password: 'bora-yeni-sifre-1'});
  assert.equal(r.status, 200);

  // Kendi hesabını kapatamaz
  const [[me]] = await pool.execute("SELECT id FROM users WHERE email='ayse@ornek.com'");
  r = await admin('POST', `/api/admin/users/${me.id}/status`, {disabled: true});
  assert.equal(r.status, 400);

  // Sistem: tanıma testi ve istatistik
  r = await admin('POST', '/api/admin/system/ocr-test');
  assert.equal(r.body.ok, true);
  r = await admin('GET', '/api/admin/stats');
  assert.ok(r.body.users.total >= 3);
});

test('hazır sticker ve galeri görseli sayfaya yerleşir', async () => {
  const c = client();
  await c('POST', '/api/auth/register', {name: 'Duru', email: 'duru@ornek.com', password: 'guclu-sifre-777'});
  const nb = randomUUID();
  await c('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: notebook({cover: {...cover, pattern: 'cats', stickers: [{id: 'k1', builtin: 'kedi', x: 10, y: 10, w: 100, h: 100, rot: 0}]}})});
  const placed = {id: 'p1', builtin: 'papatya', x: 100, y: 100, w: 120, h: 120, rot: 15};
  let r = await c('PUT', `/api/sync/page/${randomUUID()}`, {rev: 0, data: page(nb, {stickers: [placed]})});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/page/${randomUUID()}`, {rev: 0, data: page(nb, {stickers: [{...placed, fileId: randomUUID()}]})});
  assert.equal(r.status, 409, 'hem dosya hem hazır sticker: dosya esas alınır, yüklenmemişse beklenir');
  assert.equal(r.body.code, 'MISSING_FILE');
  const pg2 = randomUUID();
  r = await c('PUT', `/api/sync/page/${pg2}`, {rev: 0, data: page(nb, {stickers: [{id: 'p2', x: 0, y: 0, w: 10, h: 10, rot: 0}, placed]})});
  assert.equal(r.status, 200, 'kaynağı olmayan görsel atlanır, sayfa kaydedilir');
  const pages = (await c('GET', `/api/notebooks/${nb}/pages`)).body.pages;
  assert.deepEqual(pages.find(p => p.id === pg2).content.stickers.map(s => s.id), ['p1']);
});

test('öğrenme kayıtları: deste, kart (destesi olmadan yazılamaz), quiz, plan, not hesaplama, kayıt, günlük', async () => {
  const c = client();
  const reg = await c('POST', '/api/auth/register', {name: 'Ece', email: 'ece.ogrenme@ornek.com', password: 'guclu-sifre-555'});
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  const deck = randomUUID(), card = randomUUID();
  const cardData = {deckId: deck, front: 'Mitoz nedir?', back: 'Hücre bölünmesi', topic: 'Hücre', ease: 2.5, interval: 0, due: 0, reps: 0, lapses: 0, lastReviewAt: null, lastGrade: -1};
  let r = await c('PUT', `/api/sync/card/${card}`, {rev: 0, data: cardData});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'MISSING_PARENT');
  r = await c('PUT', `/api/sync/deck/${deck}`, {rev: 0, data: {title: 'Biyoloji', course: 'BIO101', color: '#8b5cf6', source: 'Defter'}});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/card/${card}`, {rev: 0, data: cardData});
  assert.equal(r.status, 200);
  const quiz = {title: 'Hücre quizi', course: 'BIO101', source: '', difficulty: 'mixed', questions: [{id: 'q1', type: 'mcq', prompt: 'Soru', options: ['a', 'b'], answer: 'a', explanation: '', topic: 'Hücre'}], result: null, completedAt: null};
  r = await c('PUT', `/api/sync/quiz/${randomUUID()}`, {rev: 0, data: quiz});
  assert.equal(r.status, 200);
  const plan = {title: 'Final planı', course: 'BIO101', examTaskId: '', examDate: '2026-06-20', items: [{id: 'i1', date: '2026-06-10', topic: 'Hücre', minutes: 60, kind: 'study', done: false, taskId: ''}], completedAt: null};
  r = await c('PUT', `/api/sync/studyPlan/${randomUUID()}`, {rev: 0, data: plan});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/gradeCourse/${randomUUID()}`, {rev: 0, data: {term: '2026 Güz', name: 'Fizik', credit: 3, ects: 5, components: [{id: 'v', name: 'Vize', weight: 40, score: 60}, {id: 'f', name: 'Final', weight: 60, score: null}], letter: '', included: true}});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/recording/${randomUUID()}`, {rev: 0, data: {title: 'Fizik 3. hafta', course: 'Fizik', fileId: '', durationMs: 60000, bookmarks: [{id: 'b1', t: 30000, label: 'Önemli formül'}], transcript: 'Newton yasaları', summary: '', notebookId: ''}});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/journal/${randomUUID()}`, {rev: 0, data: {day: '2026-09-27', title: 'Bugün', body: 'Çok çalıştım', mood: 'happy'}});
  assert.equal(r.status, 200);
  r = await c('GET', '/api/sync?since=0');
  for (const e of ['deck', 'card', 'quiz', 'studyPlan', 'gradeCourse', 'recording', 'journal']) assert.equal(r.body.records[e].length, 1, e);
  assert.equal(r.body.records.card[0].front, 'Mitoz nedir?');
  // Başka kullanıcı bu kayıtları göremez, üzerine yazamaz
  const other = client();
  await other('POST', '/api/auth/register', {name: 'Kaan', email: 'kaan@ornek.com', password: 'guclu-sifre-666'});
  r = await other('GET', '/api/sync?since=0');
  assert.equal(r.body.records.deck.length, 0);
  r = await other('PUT', `/api/sync/deck/${deck}`, {rev: 1, data: {title: 'Ele geçir', course: '', color: '#000000', source: ''}});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'ID_TAKEN');
  r = await other('PUT', `/api/sync/card/${randomUUID()}`, {rev: 0, data: cardData});
  assert.equal(r.body.code, 'MISSING_PARENT', 'başkasının destesine kart eklenemez');
});

test('Kalemlik AI: sohbet geçmişi, kullanıcı verisiyle bağlam, içerik üretimi, izolasyon ve kota', async () => {
  const c = client();
  await c('POST', '/api/auth/register', {name: 'Deniz AI', email: 'deniz.ai@ornek.com', password: 'guclu-sifre-777'});
  await c('PUT', `/api/sync/task/${randomUUID()}`, {rev: 0, data: {title: 'Matematik Final', course: 'Matematik', description: '', dueDate: new Date(Date.now() + 12 * 86400000).toISOString().slice(0, 10), dueTime: '', category: 'exam', color: '#d9467a', done: false, completedAt: null}});
  let r = await c('GET', '/api/ai/status');
  assert.equal(r.body.configured, true);
  assert.equal(r.body.usage.limit, 15);
  r = await c('POST', '/api/ai/conversations', {});
  const conv = r.body.conversation.id;
  r = await c('POST', `/api/ai/conversations/${conv}/messages`, {text: 'Bu hafta ne çalışmalıyım?', context: {title: 'Türev notu', course: 'Matematik', text: 'Türev: anlık değişim', images: []}, contextLabel: 'Türev notu'});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.messages.length, 2);
  assert.equal(r.body.messages[1].role, 'assistant');
  assert.equal(r.body.title, 'Bu hafta ne çalışmalıyım?');
  const req = aiCalls.at(-1);
  assert.match(req.system, /Matematik Final/, 'kullanıcının sınavı bağlamda');
  assert.match(req.messages.at(-1).content.map(x => x.text || '').join(''), /<kaynak[^>]*>[\s\S]*Türev: anlık değişim/);
  r = await c('GET', `/api/ai/conversations/${conv}/messages`);
  assert.equal(r.body.messages.length, 2);
  assert.equal(r.body.messages[0].meta.context, 'Türev notu');
  // Başka kullanıcı bu sohbeti okuyamaz, yazamaz, silemez
  const other = client();
  await other('POST', '/api/auth/register', {name: 'Başkası', email: 'baska.ai@ornek.com', password: 'guclu-sifre-888'});
  assert.equal((await other('GET', `/api/ai/conversations/${conv}/messages`)).status, 404);
  assert.equal((await other('POST', `/api/ai/conversations/${conv}/messages`, {text: 'selam'})).status, 404);
  await other('DELETE', `/api/ai/conversations/${conv}`);
  assert.equal((await c('GET', '/api/ai/conversations')).body.conversations.length, 1, 'başkası silemez');

  // İçerik üretimi: JSON kod bloğu içinde de olsa çıkarılır, geçersiz kart atlanır
  r = await c('POST', '/api/ai/generate', {kind: 'flashcards', count: 5, source: {title: 'Hücre', text: 'Mitoz hücre bölünmesidir.'}});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.cards, [{front: 'Mitoz nedir?', back: 'Hücre bölünmesi', topic: 'Hücre'}]);
  r = await c('POST', '/api/ai/generate', {kind: 'quiz', count: 5, difficulty: 'hard', types: ['mcq', 'tf'], source: {title: 'Hücre', text: 'Mitoz hücre bölünmesidir.'}});
  assert.equal(r.body.questions.length, 2);
  assert.deepEqual(r.body.questions[1].options, ['Doğru', 'Yanlış']);
  r = await c('POST', '/api/ai/generate', {kind: 'plan', plan: {examTitle: 'Final', examDate: '2099-12-31', startDate: '2099-01-01', minutesPerDay: 60, topics: ['Türev']}});
  assert.deepEqual(r.body.items.map(i => i.topic), ['Türev'], 'plan yalnızca başlangıç ile sınav günü arasındaki maddeleri alır');
  r = await c('POST', '/api/ai/generate', {kind: 'flashcards', source: {text: ''}});
  assert.equal(r.status, 400, 'kaynaksız kart istenemez');
  r = await c('POST', '/api/ai/generate', {kind: 'quiz', source: {images: ['data:image/gif;base64,AAAA']}});
  assert.equal(r.status, 400, 'yalnızca png/jpeg/webp görüntü');

  // Günlük kota: plan sınırına gelince 429, başarısız istek hak yemez
  r = await c('GET', '/api/ai/status');
  const used = r.body.usage.today;
  assert.equal(used, 4, 'yalnızca başarılı üretimler hak kullanır');
  await pool.execute("UPDATE plans SET ai_daily_limit=5 WHERE id='free'");
  r = await c('POST', `/api/ai/conversations/${conv}/messages`, {text: 'bir tane daha'});
  assert.equal(r.status, 200);
  r = await c('POST', `/api/ai/conversations/${conv}/messages`, {text: 'sınırı aş'});
  assert.equal(r.status, 429);
  assert.equal(r.body.code, 'AI_QUOTA');
  // Plan özelliği kapalıysa üretim reddedilir
  await pool.execute("UPDATE plans SET ai_daily_limit=100, features=? WHERE id='free'", [JSON.stringify({aiQuiz: false})]);
  r = await c('POST', '/api/ai/generate', {kind: 'quiz', source: {text: 'metin'}});
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'PLAN_FEATURE');
  await pool.execute("UPDATE plans SET ai_daily_limit=15, features=? WHERE id='free'", [JSON.stringify({aiFlashcards: true, aiQuiz: true, aiPlan: true, transcription: false, premiumTemplates: false, collaboration: true, maxCollaborators: 3})]);
});

test('arama: yalnızca kendi sayfaları, JSON anahtarlarındaki eşleşme sayılmaz, Türkçe harf duyarsız', async () => {
  const c = client(), other = client();
  await c('POST', '/api/auth/register', {name: 'Ara Bir', email: 'ara1@ornek.com', password: 'guclu-sifre-111'});
  await other('POST', '/api/auth/register', {name: 'Ara İki', email: 'ara2@ornek.com', password: 'guclu-sifre-222'});
  const nb = randomUUID();
  await c('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: notebook()});
  const text = (t, extra = {}) => page(nb, {texts: [{id: 't', x: 10, y: 10, w: 300, text: t, font: 'nunito', size: 20, color: '#000000'}], ...extra});
  await c('PUT', `/api/sync/page/${randomUUID()}`, {rev: 0, data: text('Öğrenci işleri: mitokondri')});
  await c('PUT', `/api/sync/page/${randomUUID()}`, {rev: 0, data: {...text('başka'), position: 2}});
  let r = await c('GET', '/api/search?q=ogrenci');
  assert.equal(r.body.pages.length, 1);
  assert.match(r.body.pages[0].snippet, /Öğrenci işleri/);
  r = await c('GET', '/api/search?q=nunito');
  assert.equal(r.body.pages.length, 0, 'yazı tipi adı (JSON anahtarı) sonuç sayılmaz');
  r = await other('GET', '/api/search?q=mitokondri');
  assert.equal(r.body.pages.length, 0, 'başkasının sayfası bulunmaz');
  r = await c('GET', '/api/search?q=a');
  assert.equal(r.status, 400, 'en az 2 karakter');
  r = await c('GET', '/api/search?q=%25_');
  assert.equal(r.body.pages.length, 0, 'joker karakter kaçırılır');
});

test('ders kaydı: ses dosyası imzayla doğrulanır; sunucuda metne çevirme anahtarsız kapalı; widget verisi', async () => {
  const c = client();
  await c('POST', '/api/auth/register', {name: 'Ses Test', email: 'ses@ornek.com', password: 'guclu-sifre-999'});
  const webm = Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3]), Buffer.alloc(200, 1)]);
  const up = async (buf, kind) => { const f = new FormData(); f.append('id', randomUUID()); f.append('kind', kind); f.append('file', new Blob([buf]), 'kayit.webm'); return c('POST', '/api/files', f); };
  let r = await up(webm, 'audio');
  assert.equal(r.status, 201);
  assert.equal(r.body.mime, 'audio/webm');
  r = await up(PNG, 'audio');
  assert.equal(r.status, 415, 'resim ses diye yüklenemez');
  r = await up(webm, 'image');
  assert.equal(r.status, 415, 'ses resim diye yüklenemez');
  const fileId = (await up(webm, 'audio')).body.id;
  const recId = randomUUID();
  r = await c('PUT', `/api/sync/recording/${recId}`, {rev: 0, data: {title: 'Kayıt', course: '', fileId, durationMs: 1000, bookmarks: [], transcript: '', summary: '', notebookId: ''}});
  assert.equal(r.status, 200);
  r = await c('GET', `/api/files/${fileId}`, undefined, {range: 'bytes=0-3'});
  assert.equal(r.status, 206, 'ses dosyasında ileri/geri sarma için parça isteği desteklenir');
  r = await c('GET', '/api/recordings/transcribe-status');
  assert.equal(r.body.available, false);
  r = await c('POST', `/api/recordings/${recId}/transcribe`, {});
  assert.equal(r.status, 503);
  assert.equal(r.body.code, 'TRANSCRIBE_DISABLED');
  r = await c('GET', '/api/widget/today?tz=-180');
  assert.equal(r.status, 200);
  assert.equal(r.body.study.goal, 90);
  assert.deepEqual(r.body.lessons, []);
  const other = client();
  assert.equal((await other('GET', '/api/widget/today')).status, 401, 'oturum gerekir');
});

test('ortak defter: davet, kabul, görüntüleyici/düzenleyici yetkisi, geçmiş, ayrılma; paylaşım bağlantıları', async () => {
  const owner = client(), ed = client(), vw = client(), stranger = client();
  await owner('POST', '/api/auth/register', {name: 'Sahip', email: 'sahip@ornek.com', password: 'guclu-sifre-101'});
  await ed('POST', '/api/auth/register', {name: 'Editör', email: 'editor@ornek.com', password: 'guclu-sifre-102'});
  await vw('POST', '/api/auth/register', {name: 'İzleyici', email: 'izleyici@ornek.com', password: 'guclu-sifre-103'});
  await stranger('POST', '/api/auth/register', {name: 'Yabancı', email: 'yabanci@ornek.com', password: 'guclu-sifre-104'});
  const nb = randomUUID(), pg = randomUUID();
  await owner('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: notebook({title: 'Ortak Fizik'})});
  const stroke = {id: 's1', t: 'pen', pen: 'ballpoint', c: '#222222', w: 3, o: 1, pts: [10, 10, 0.5, 20, 20, 0.6]};
  await owner('PUT', `/api/sync/page/${pg}`, {rev: 0, data: page(nb, {strokes: [stroke]})});

  // Davet: yalnızca sahip; kayıtlı olmayan e-posta; kendine davet
  let r = await ed('POST', `/api/notebooks/${nb}/members`, {email: 'izleyici@ornek.com', role: 'viewer'});
  assert.equal(r.status, 404, 'üye olmayan davet edemez');
  r = await owner('POST', `/api/notebooks/${nb}/members`, {email: 'yok@ornek.com', role: 'viewer'});
  assert.equal(r.body.code, 'NO_USER');
  r = await owner('POST', `/api/notebooks/${nb}/members`, {email: 'sahip@ornek.com', role: 'viewer'});
  assert.equal(r.status, 400);
  assert.equal((await owner('POST', `/api/notebooks/${nb}/members`, {email: 'editor@ornek.com', role: 'editor'})).status, 201);
  assert.equal((await owner('POST', `/api/notebooks/${nb}/members`, {email: 'izleyici@ornek.com', role: 'viewer'})).status, 201);

  // Kabul etmeden defter görünmez
  r = await ed('GET', '/api/sync?since=0');
  assert.equal(r.body.records.notebook.length, 0);
  r = await ed('GET', '/api/shares');
  assert.equal(r.body.invites[0].title, 'Ortak Fizik');
  assert.equal(r.body.invites[0].owner, 'Sahip');
  const cursorBefore = (await ed('GET', '/api/sync?since=0')).body.cursor;
  await ed('POST', `/api/notebooks/${nb}/invite/accept`);
  await vw('POST', `/api/notebooks/${nb}/invite/accept`);
  r = await ed('GET', `/api/sync?since=${cursorBefore}`);
  assert.equal(r.body.records.notebook[0].id, nb, 'kabul edilen defter, imleç ileride olsa da gelir');
  assert.equal(r.body.records.page[0].id, pg);
  assert.deepEqual(r.body.collab, [{notebookId: nb, role: 'editor', owner: 'Sahip'}]);
  assert.equal((await owner('GET', '/api/sync?since=0')).body.collab[0].role, 'owner');
  r = await vw('GET', `/api/notebooks/${nb}/pages`);
  assert.equal(r.body.pages[0].content.strokes.length, 1, 'görüntüleyici içeriği okur');

  // Görüntüleyici yazamaz / silemez; düzenleyici yazar, sayfa ekler, siler
  r = await vw('PUT', `/api/sync/page/${pg}`, {rev: 1, data: page(nb, {strokes: []})});
  assert.equal(r.status, 403);
  assert.equal(r.body.code, 'READ_ONLY');
  r = await vw('DELETE', `/api/sync/page/${pg}?rev=1`);
  assert.equal(r.status, 403);
  r = await ed('PUT', `/api/sync/page/${pg}`, {rev: 1, data: page(nb, {strokes: [stroke, {...stroke, id: 's2'}]})});
  assert.equal(r.status, 200);
  assert.equal(r.body.rev, 2);
  const pg2 = randomUUID();
  r = await ed('PUT', `/api/sync/page/${pg2}`, {rev: 0, data: {...page(nb), position: 2}});
  assert.equal(r.status, 200, 'düzenleyici sayfa ekler');
  r = await owner('GET', `/api/notebooks/${nb}/pages`);
  assert.equal(r.body.pages.length, 2, 'eklenen sayfa sahibin defterinde');
  // Defter bilgisi yalnızca sahipte değişir; üyenin gönderdiği sessizce yok sayılır
  r = await ed('PUT', `/api/sync/notebook/${nb}`, {rev: 1, data: notebook({title: 'Ele geçirildi'})});
  assert.equal(r.status, 200);
  assert.equal((await owner('GET', '/api/sync?since=0')).body.records.notebook.find(n => n.id === nb).title, 'Ortak Fizik');
  // Yabancı hiçbir şeye erişemez
  assert.equal((await stranger('GET', `/api/notebooks/${nb}/pages`)).status, 404);
  assert.equal((await stranger('PUT', `/api/sync/page/${pg}`, {rev: 2, data: page(nb)})).body.code, 'ID_TAKEN');
  assert.equal((await stranger('GET', `/api/notebooks/${nb}/collab`)).status, 404);
  assert.equal((await stranger('GET', `/api/notebooks/${nb}/changes?since=0`)).status, 404);

  // Yakın gerçek zamanlı değişiklik akışı, geçmiş ve son düzenleyen
  r = await owner('GET', `/api/notebooks/${nb}/changes?since=0`);
  assert.equal(r.body.pages.length, 2);
  assert.ok(r.body.pages.find(p => p.id === pg).content.strokes.length === 2, 'değişiklik içerikle gelir');
  r = await owner('GET', `/api/notebooks/${nb}/collab`);
  assert.equal(r.body.members.length, 2);
  assert.ok(r.body.activity.some(a => a.name === 'Editör' && a.action === 'edit_page'));
  assert.equal(r.body.pages.find(p => p.id === pg).lastEditor, 'Editör');
  assert.equal((await ed('GET', `/api/notebooks/${nb}/collab`)).body.members[0].email, undefined, 'üyeler e-postaları görmez');

  // Düzenleyici sayfa siler → sahip ve üyelerin cihazlarından da silinir
  r = await ed('DELETE', `/api/sync/page/${pg2}?rev=1`);
  assert.equal(r.status, 200);
  r = await owner('GET', '/api/sync?since=0');
  assert.ok(r.body.deletions.some(d => d.id === pg2));

  // Rol değiştirme ve çıkarma: çıkarılan üyenin cihazından defter kalkar
  assert.equal((await ed('PATCH', `/api/notebooks/${nb}/members/${(await owner('GET', `/api/notebooks/${nb}/collab`)).body.members[1].userId}`, {role: 'editor'})).status, 403, 'rolü yalnızca sahip değiştirir');
  const vwId = (await owner('GET', `/api/notebooks/${nb}/collab`)).body.members.find(m => m.name === 'İzleyici').userId;
  await owner('DELETE', `/api/notebooks/${nb}/members/${vwId}`);
  r = await vw('GET', '/api/sync?since=0');
  assert.ok(r.body.deletions.some(d => d.entity === 'notebook' && d.id === nb), 'çıkarılan üyenin cihazından silinir');
  assert.equal(r.body.records.notebook.length, 0);

  // Paylaşım bağlantısı: gizli → erişilemez, bağlantı → görüntülenir, herkese açık → Keşfet'te
  r = await ed('POST', `/api/notebooks/${nb}/links`, {visibility: 'link'});
  assert.equal(r.status, 403, 'bağlantıyı yalnızca sahip oluşturur');
  r = await owner('POST', `/api/notebooks/${nb}/links`, {visibility: 'private', pageId: pg});
  const link = r.body.link.id;
  assert.match(link, /^[A-Za-z0-9_-]{22}$/);
  const anon = client();
  assert.equal((await anon('GET', `/api/public/share/${link}`)).status, 404, 'gizli bağlantı açılmaz');
  await owner('PATCH', `/api/links/${link}`, {visibility: 'link'});
  r = await anon('GET', `/api/public/share/${link}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.title, 'Ortak Fizik');
  assert.equal(r.body.owner, 'Sahip');
  assert.equal(r.body.pages.length, 1, 'yalnızca paylaşılan sayfa');
  assert.equal(r.body.pageOnly, true);
  assert.equal((await anon('GET', '/api/public/gallery')).body.items.length, 0, 'bağlantılı paylaşım Keşfet’te görünmez');
  await owner('PATCH', `/api/links/${link}`, {visibility: 'public'});
  assert.equal((await anon('GET', '/api/public/gallery')).body.items[0].id, link);
  assert.equal((await anon('GET', `/api/public/share/${link}/files/${randomUUID()}`)).status, 404, 'paylaşımda olmayan dosya verilmez');
  assert.equal((await stranger('DELETE', `/api/links/${link}`)).status, 200);
  assert.equal((await anon('GET', `/api/public/share/${link}`)).status, 200, 'başkası bağlantıyı kapatamaz');
  await owner('DELETE', `/api/links/${link}`);
  assert.equal((await anon('GET', `/api/public/share/${link}`)).status, 404, 'kapatılan bağlantı açılmaz');
  assert.equal((await anon('GET', '/api/public/share/kisa')).status, 400, 'geçersiz bağlantı kimliği');

  // Ayrılma: üye kendisi ayrılır
  const edId = (await owner('GET', `/api/notebooks/${nb}/collab`)).body.members[0].userId;
  await ed('DELETE', `/api/notebooks/${nb}/members/${edId}`);
  assert.equal((await ed('GET', `/api/notebooks/${nb}/pages`)).status, 404);
});

test('XP: kurallar sunucuda, tekrar ve günlük sınır; rozetler; istemci XP gönderemez', async () => {
  const u = client(), other = client();
  await u('POST', '/api/auth/register', {name: 'Xp Öğrenci', email: 'xp@ornek.com', password: 'guclu-sifre-201'});
  await other('POST', '/api/auth/register', {name: 'Başka', email: 'xp2@ornek.com', password: 'guclu-sifre-202'});
  const wait = () => new Promise(r => setTimeout(r, 150)); // XP yanıttan sonra yazılır
  let r = await u('GET', '/api/progress');
  assert.equal(r.body.xp, 0);
  assert.equal(r.body.level, 1);
  assert.equal(r.body.badges.length, 8);

  // Yeni not +5 ve 🏆 İlk Not
  const nb = randomUUID();
  await u('PUT', `/api/sync/notebook/${nb}`, {rev: 0, data: notebook()});
  await wait();
  r = await u('GET', '/api/progress');
  assert.equal(r.body.xp, 5);
  assert.ok(r.body.badges.find(b => b.id === 'first_note').earnedAt, 'İlk Not rozeti');
  // Aynı defteri güncellemek XP vermez
  await u('PUT', `/api/sync/notebook/${nb}`, {rev: 1, data: notebook({title: 'Yeni ad'})});

  // Görev tamamla +10; geri alıp yeniden tamamlamak ikinci kez vermez
  const task = randomUUID();
  const t = (done, rev) => u('PUT', `/api/sync/task/${task}`, {rev, data: {title: 'Ödev', course: '', description: '', dueDate: '2026-10-10', dueTime: '', category: 'homework', color: '#2f6fed', done, completedAt: done ? Date.now() : null}});
  await t(false, 0); await t(true, 1); await t(false, 2); await t(true, 3);
  await wait();
  assert.equal((await u('GET', '/api/progress')).body.xp, 15);

  // 30 dk odak +20; kısa ya da süresi tutarsız oturum vermez
  const focus = (secs, wall) => u('PUT', `/api/sync/focus/${randomUUID()}`, {rev: 0, data: {topic: '', course: '', plannedMinutes: 30, focusedSeconds: secs, completed: true, startedAt: Date.now() - wall, endedAt: Date.now()}});
  await focus(1800, 1800 * 1000); await focus(600, 600 * 1000); await focus(3600, 60 * 1000);
  await wait();
  assert.equal((await u('GET', '/api/progress')).body.xp, 35);

  // Günlük +5 (günde bir kez)
  for (const day of ['2026-09-01', '2026-09-02']) await u('PUT', `/api/sync/journal/${randomUUID()}`, {rev: 0, data: {day, title: '', body: 'Bugün çalıştım.', mood: 'good'}});
  await wait();
  r = await u('GET', '/api/progress');
  assert.equal(r.body.xp, 40, 'günlük XP günde bir kez');
  assert.equal(r.body.today, 40);
  assert.equal(r.body.streak, 1);
  assert.ok(r.body.recent.some(x => x.label === 'Görev tamamla'));

  // Günlük sınır: aynı gün 20'den fazla görev XP'si verilmez
  for (let i = 0; i < 22; i++) await u('PUT', `/api/sync/task/${randomUUID()}`, {rev: 0, data: {title: 'G' + i, course: '', description: '', dueDate: '', dueTime: '', category: 'homework', color: '#2f6fed', done: true, completedAt: Date.now()}});
  await wait();
  assert.equal((await u('GET', '/api/progress')).body.xp, 40 + 19 * 10, 'görev XP günde en fazla 20 kez');

  // İstemci XP gönderemez: bilinmeyen alanlar yok sayılır, uç nokta yok
  assert.equal((await u('POST', '/api/progress', {xp: 99999})).status, 404);
  assert.equal((await other('GET', '/api/progress')).body.xp, 0, 'XP kullanıcıya özel');
  assert.equal((await client()('GET', '/api/progress')).status, 401);
});

test('şablon mağazası: kategoriler, premium kilidi, kullanım sayısı, yönetim', async () => {
  const admin = client(), u = client();
  assert.equal((await admin('POST', '/api/auth/login', {email: 'ayse@ornek.com', password: 'guclu-sifre-123'})).status, 200);
  await u('POST', '/api/auth/register', {name: 'Şablon Sever', email: 'sablon@ornek.com', password: 'guclu-sifre-301'});
  let r = await u('GET', '/api/templates');
  assert.equal(r.status, 200);
  assert.equal(r.body.categories.length, 13);
  for (const c of r.body.categories) assert.ok(r.body.items.some(i => i.category === c), `${c} kategorisinde şablon var`);
  const free = r.body.items.find(i => !i.premium), prem = r.body.items.find(i => i.premium);
  assert.equal(prem.locked, true, 'ücretsiz planda premium kilitli');
  assert.equal(free.locked, false);
  r = await u('POST', `/api/templates/${free.id}/use`);
  assert.equal(r.status, 200);
  assert.ok(r.body.content.pages.length >= 1);
  assert.equal((await u('GET', '/api/templates')).body.items.find(i => i.id === free.id).uses, free.uses + 1);
  r = await u('POST', `/api/templates/${prem.id}/use`);
  assert.equal(r.status, 402);
  assert.equal(r.body.code, 'PREMIUM_REQUIRED');
  assert.equal((await u('POST', '/api/templates/yok-boyle/use')).status, 404);
  assert.equal((await u('POST', '/api/templates/..%2Fx/use')).status, 400);

  // Yönetim: yalnızca yönetici; yeni şablon, düzenleme, kapatma
  assert.equal((await u('GET', '/api/admin/templates')).status, 403);
  const content = {paper: 'grid', color: '#123456', cover: {pattern: 'grid'}, pages: [{template: 'grid', texts: [{x: 60, y: 40, w: 500, text: 'Başlık', size: 28, color: '#222222', bold: true}]}]};
  r = await admin('POST', '/api/admin/templates', {id: 'ozel-kimya', name: 'Kimya föyü', category: 'Matematik', description: 'Deneme', premium: false, content});
  assert.equal(r.status, 201);
  assert.equal((await admin('POST', '/api/admin/templates', {id: 'bozuk', name: 'Xx', category: 'Yok', content})).status, 400);
  assert.equal((await admin('POST', '/api/admin/templates', {id: 'bozuk2', name: 'Xx', category: 'Minimal', content: {...content, pages: [{template: '<script>', texts: []}]}})).status, 400);
  assert.ok((await u('GET', '/api/templates')).body.items.some(i => i.id === 'ozel-kimya'));
  await admin('PATCH', '/api/admin/templates/ozel-kimya', {premium: true});
  assert.equal((await u('GET', '/api/templates')).body.items.find(i => i.id === 'ozel-kimya').locked, true);
  await admin('DELETE', `/api/admin/templates/${free.id}`);
  assert.ok(!(await u('GET', '/api/templates')).body.items.some(i => i.id === free.id), 'kapatılan şablon mağazada görünmez');
  assert.ok((await admin('GET', '/api/admin/templates')).body.items.some(i => i.id === free.id && !i.active), 'hazır şablon silinmez, kapatılır');
  await admin('PATCH', `/api/admin/templates/${free.id}`, {active: true});

  // Plan yükseltilince premium açılır (yönetici abonelik verir)
  const uid = (await u('GET', '/api/auth/me')).body.user.id;
  assert.equal((await admin('POST', `/api/admin/users/${uid}/subscription`, {planId: 'plus', days: 30})).status, 200);
  r = await u('GET', '/api/templates');
  assert.equal(r.body.premiumAccess, true);
  assert.equal(r.body.items.find(i => i.id === prem.id).locked, false);
  assert.equal((await u('POST', `/api/templates/${prem.id}/use`)).status, 200);
});
