import {test} from 'node:test';
import assert from 'node:assert/strict';
import {sniffMime, hashPassword, verifyPassword} from '../../server/security.mjs';
import {readConfig} from '../../server/config.mjs';
import {entitySchemas, pageContent} from '../../server/schemas.mjs';

test('dosya imzası: uzantıya değil içeriğe bakılır', () => {
  assert.equal(sniffMime(Buffer.from('89504e470d0a1a0a0000000000', 'hex')), 'image/png');
  assert.equal(sniffMime(Buffer.from('ffd8ffe000104a4649460001', 'hex')), 'image/jpeg');
  assert.equal(sniffMime(Buffer.from('%PDF-1.7\n%âãÏÓ')), 'application/pdf');
  assert.equal(sniffMime(Buffer.from('wOF2' + '\0'.repeat(20), 'latin1')), 'font/woff2');
  assert.equal(sniffMime(Buffer.from('<svg onload=alert(1)></svg>')), null);
  assert.equal(sniffMime(Buffer.from('<html><script>')), null);
});

test('parola özeti doğrulanır, yanlış parola reddedilir', async () => {
  const h = await hashPassword('güçlü şifre 123');
  assert.match(h, /^scrypt\$/);
  assert.equal(await verifyPassword('güçlü şifre 123', h), true);
  assert.equal(await verifyPassword('yanlış', h), false);
  assert.equal(await verifyPassword('herhangi', null), false);
});

test('yapılandırma: canlıda HTTPS ve depolama klasörü denetimi', () => {
  assert.throws(() => readConfig({NODE_ENV: 'production', APP_URL: 'http://x.com', DB_NAME: 'a', DB_USER: 'b', DB_PASSWORD: 'c'}), /https/);
  assert.throws(() => readConfig({APP_URL: 'http://localhost:3000', DB_NAME: 'a', DB_USER: 'b', STORAGE_DIR: './dist/uploads'}), /dist/);
  const c = readConfig({NODE_ENV: 'production', APP_URL: 'https://not.ornek.com', DB_NAME: 'a', DB_USER: 'b', DB_PASSWORD: 'c'});
  assert.equal(c.secureCookies, true);
  assert.equal(c.allowedOrigins.has('http://localhost:5173'), false, 'canlıda geliştirme adresi kabul edilmez');
});

test('sayfa içeriği şeması kötü veriyi reddeder', () => {
  const ok = {v: 1, template: 'lined', width: 1000, height: 1414, strokes: [], texts: [], stickers: []};
  assert.equal(pageContent.safeParse(ok).success, true);
  assert.equal(pageContent.safeParse({...ok, template: 'bilinmeyen'}).success, false);
  assert.equal(pageContent.safeParse({...ok, strokes: [{id: 'a', t: 'pen', c: 'red', w: 2, o: 1, pts: []}]}).success, false, 'renk HEX olmalı');
  assert.equal(entitySchemas.lesson.safeParse({title: 'x', day: 7, start: '09:00', end: '10:00', room: '', instructor: '', color: '#000000', note: ''}).success, false);
});
