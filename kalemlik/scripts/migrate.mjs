// Veritabanı şemasını ve geçişleri uygular (sunucu açılışta da otomatik uygular). Tekrar çalıştırmak güvenlidir.
import mysql from 'mysql2/promise';
import {readConfig} from '../server/config.mjs';
import {migrate} from '../server/migrate.mjs';

const config = readConfig();
const conn = await mysql.createConnection({host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database, socketPath: config.db.socketPath, charset: 'utf8mb4'});
try {
  const r = await migrate(conn);
  console.log(`Veritabanı hazır (şema sürümü ${r.version}).${r.applied.length ? ' Uygulanan: ' + r.applied.join(', ') : ''}`);
} finally {
  await conn.end();
}
