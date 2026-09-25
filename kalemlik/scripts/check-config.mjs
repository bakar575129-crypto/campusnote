// .env ayarlarını ve veritabanı bağlantısını kontrol eder.
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {ROOT, readConfig} from '../server/config.mjs';

try {
  const config = readConfig();
  console.log('✓ .env ayarları geçerli');
  console.log('  Adres:', config.origin, config.production ? '(canlı)' : '(geliştirme)');
  await fs.access(path.join(config.dist, 'index.html')).then(() => console.log('✓ dist/ derlemesi bulundu'), () => console.log('✗ dist/index.html yok — "npm run build" çalıştırın'));
  await fs.mkdir(config.storage, {recursive: true, mode: 0o700});
  console.log('✓ Depolama klasörü:', config.storage);
  const conn = await mysql.createConnection({host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database, socketPath: config.db.socketPath});
  const [[row]] = await conn.query('SELECT MAX(version) AS v FROM schema_migrations').catch(() => [[{v: null}]]);
  await conn.end();
  console.log(row.v ? `✓ Veritabanı bağlantısı ve şema (sürüm ${row.v})` : '✗ Veritabanına bağlanıldı ama şema yok — "npm run db:migrate" çalıştırın');
  console.log(config.ocr.apiKey ? '✓ El yazısı tanıma (OCR) etkin' : '• El yazısı tanıma kapalı (ANTHROPIC_API_KEY boş) — kendi el yazısı düzeltme çalışır');
  console.log(config.mail.host ? '✓ SMTP e-posta ayarlı' : '• SMTP ayarlı değil — şifre sıfırlama bağlantıları sunucu günlüğüne yazılır');
} catch (error) {
  console.error('✗', error.message);
  process.exit(1);
}
