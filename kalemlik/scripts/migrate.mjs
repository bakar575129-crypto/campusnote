// Veritabanı şemasını (sql/schema.sql) uygular. Tekrar çalıştırmak güvenlidir.
import fs from 'node:fs/promises';
import path from 'node:path';
import mysql from 'mysql2/promise';
import {ROOT, readConfig} from '../server/config.mjs';

const config = readConfig();
const sql = await fs.readFile(path.join(ROOT, 'sql', 'schema.sql'), 'utf8');
const statements = sql.split(/;\s*$/m).map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
const conn = await mysql.createConnection({...config.db, connectionLimit: undefined, waitForConnections: undefined, queueLimit: undefined});
try {
  for (const statement of statements) await conn.query(statement);
  const [[row]] = await conn.query('SELECT MAX(version) AS v FROM schema_migrations');
  console.log(`Veritabanı hazır (şema sürümü ${row.v}).`);
} finally {
  await conn.end();
}
