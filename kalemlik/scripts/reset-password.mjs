// Yönetici aracı: bir kullanıcının şifresini sıfırlar ve tüm oturumlarını kapatır.
// Kullanım: npm run password:reset -- ogrenci@ornek.com   (yeni şifre güvenli şekilde sorulur)
import readline from 'node:readline/promises';
import mysql from 'mysql2/promise';
import {readConfig} from '../server/config.mjs';
import {hashPassword} from '../server/security.mjs';

const email = process.argv[2];
if (!email) { console.log('Kullanım: npm run password:reset -- <e-posta>'); process.exit(1); }
const rl = readline.createInterface({input: process.stdin, output: process.stdout});
const password = await rl.question('Yeni şifre (en az 10 karakter): ');
rl.close();
if (password.length < 10) { console.error('Şifre en az 10 karakter olmalı.'); process.exit(1); }
const config = readConfig();
const conn = await mysql.createConnection({host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database, socketPath: config.db.socketPath});
const [[user]] = await conn.execute('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
if (!user) { console.error('Kullanıcı bulunamadı.'); await conn.end(); process.exit(1); }
await conn.execute('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', [await hashPassword(password), Date.now(), user.id]);
await conn.execute('DELETE FROM sessions WHERE user_id=?', [user.id]);
await conn.end();
console.log('✓ Şifre güncellendi, açık oturumlar kapatıldı.');
