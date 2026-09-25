// Gerçek MySQL/MariaDB veritabanına karşı uçtan uca API testi.
// Gerekli: TEST_DB_NAME, TEST_DB_USER, TEST_DB_PASSWORD (boş bir test veritabanı; tablolar silinip yeniden kurulur).
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import mysql from 'mysql2/promise';
import {readConfig, ROOT} from '../../server/config.mjs';
import {createApp} from '../../server/app.mjs';

const env = {
  NODE_ENV: 'test', APP_URL: 'http://localhost:3999',
  DB_HOST: process.env.TEST_DB_HOST || 'localhost', DB_NAME: process.env.TEST_DB_NAME || 'kalemlik_test',
  DB_USER: process.env.TEST_DB_USER || 'kalemlik', DB_PASSWORD: process.env.TEST_DB_PASSWORD || 'kalemlik-dev-pass',
  STORAGE_DIR: path.join(os.tmpdir(), 'kalemlik-test-storage-' + process.pid),
};
const config = readConfig(env);
let pool, server, base;
const fakeOcr = {configured: true, async transcribe() { return 'merhaba dünya'; }};
const mails = [];
const fakeMailer = {configured: true, async send(m) { mails.push(m); return true; }};

before(async () => {
  const conn = await mysql.createConnection({host: config.db.host, user: config.db.user, password: config.db.password, database: config.db.database, multipleStatements: true});
  const [tables] = await conn.query("SELECT table_name AS t, table_type AS k FROM information_schema.tables WHERE table_schema=DATABASE()");
  await conn.query('SET FOREIGN_KEY_CHECKS=0');
  for (const {t, k} of tables) await conn.query(`DROP ${k === 'VIEW' ? 'VIEW' : 'TABLE'} IF EXISTS \`${t}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS=1');
  await conn.query(await fs.readFile(path.join(ROOT, 'sql/schema.sql'), 'utf8'));
  await conn.end();
  pool = mysql.createPool(config.db);
  const app = createApp({pool, config, ocr: fakeOcr, mailer: fakeMailer});
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server?.close();
  await pool?.end();
  await fs.rm(env.STORAGE_DIR, {recursive: true, force: true});
});

function client() {
  let cookie = '';
  return async function call(method, url, body, extraHeaders = {}) {
    const headers = {'x-kalemlik': '1', origin: 'http://localhost:3999', ...extraHeaders};
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
  // Bozuk nokta dizisi reddedilir
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 1, data: page(nb, {strokes: [{...stroke, pts: [1, 2]}]})});
  assert.equal(r.status, 400);
  // Eski revizyonla yazma → 409 + sunucudaki güncel kayıt
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 1, data: page(nb, {strokes: []})});
  assert.equal(r.body.rev, 2);
  r = await c('PUT', `/api/sync/page/${pg}`, {rev: 1, data: page(nb, {strokes: [stroke, stroke]})});
  assert.equal(r.status, 409);
  assert.equal(r.body.code, 'CONFLICT');
  assert.equal(r.body.current.rev, 2);

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
  let r = await c('PUT', `/api/sync/lesson/${randomUUID()}`, {rev: 0, data: {title: 'Fizik', day: 0, start: '10:00', end: '09:00', room: '', instructor: '', color: '#123456', note: ''}});
  assert.equal(r.status, 400);
  assert.match(r.body.error, /bitişi/);
  r = await c('PUT', `/api/sync/lesson/${randomUUID()}`, {rev: 0, data: {title: 'Fizik', day: 0, start: '09:00', end: '10:30', room: 'B-201', instructor: 'Dr. Ak', color: '#123456', note: ''}});
  assert.equal(r.status, 200);
  r = await c('PUT', `/api/sync/task/${randomUUID()}`, {rev: 0, data: {title: 'Ödev 1', course: 'Fizik', description: '', dueDate: '2026-02-30', dueTime: '', category: 'homework', color: '#123456', done: false, completedAt: null}});
  assert.equal(r.status, 400);
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
});
