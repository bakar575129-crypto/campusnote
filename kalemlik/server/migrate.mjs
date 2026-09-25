// Veritabanı şemasını kurar ve sürüm geçişlerini uygular. Sunucu her açılışta çalıştırır; tekrar çalıştırmak güvenlidir.
import fs from 'node:fs/promises';
import path from 'node:path';
import {ROOT} from './config.mjs';

async function columnExists(db, table, column) {
  const [[row]] = await db.query('SELECT COUNT(*) AS n FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=? AND column_name=?', [table, column]);
  return Number(row.n) > 0;
}
async function addColumn(db, table, column, definition) {
  if (!(await columnExists(db, table, column))) await db.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

/** Sürüm → geçiş. Yeni sürüm eklerken listenin sonuna ekleyin; eski geçişleri değiştirmeyin. */
const MIGRATIONS = [
  {version: 2, name: 'yönetim paneli: ek haklar, hesap kapatma, uygulama ayarları', async up(db) {
    await addColumn(db, 'users', 'extra_storage_mb', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await addColumn(db, 'users', 'extra_notebooks', 'INT UNSIGNED NOT NULL DEFAULT 0');
    await addColumn(db, 'users', 'disabled', 'TINYINT(1) NOT NULL DEFAULT 0');
    await addColumn(db, 'users', 'last_login_at', 'BIGINT NULL');
    await db.query(`CREATE TABLE IF NOT EXISTS app_settings (
      name VARCHAR(64) CHARACTER SET ascii PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at BIGINT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  }},
];

export async function migrate(db) {
  const sql = await fs.readFile(path.join(ROOT, 'sql', 'schema.sql'), 'utf8');
  const statements = sql.split(/;\s*$/m).map(s => s.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean);
  for (const statement of statements) await db.query(statement);
  const [rows] = await db.query('SELECT version FROM schema_migrations');
  const done = new Set(rows.map(r => Number(r.version)));
  const applied = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    await m.up(db);
    await db.query('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [m.version, Date.now()]);
    applied.push(`${m.version} (${m.name})`);
  }
  const [[v]] = await db.query('SELECT MAX(version) AS v FROM schema_migrations');
  return {version: Number(v.v), applied};
}
