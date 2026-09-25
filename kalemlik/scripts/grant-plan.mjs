// Yönetici aracı: kullanıcıya plan tanımlar.  Kullanım: npm run plan:grant -- ogrenci@ornek.com plus 30
import {randomUUID} from 'node:crypto';
import mysql from 'mysql2/promise';
import {readConfig} from '../server/config.mjs';

const [email, planId, daysArg] = process.argv.slice(2);
if (!email || !planId) { console.log('Kullanım: npm run plan:grant -- <e-posta> <free|plus|pro> [gün=30]'); process.exit(1); }
const days = Number(daysArg || 30);
const config = readConfig();
const conn = await mysql.createConnection({host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password, database: config.db.database, socketPath: config.db.socketPath});
try {
  const [[user]] = await conn.execute('SELECT id FROM users WHERE email=?', [email.toLowerCase()]);
  if (!user) throw new Error('Kullanıcı bulunamadı.');
  const now = Date.now();
  await conn.execute("UPDATE subscriptions SET status='expired', updated_at=? WHERE user_id=? AND status IN ('active','canceled')", [now, user.id]);
  if (planId !== 'free') {
    const [[plan]] = await conn.execute('SELECT id FROM plans WHERE id=?', [planId]);
    if (!plan) throw new Error('Plan bulunamadı.');
    await conn.execute("INSERT INTO subscriptions (id,user_id,plan_id,status,provider,current_period_end,created_at,updated_at) VALUES (?,?,?,'active','manual',?,?,?)", [randomUUID(), user.id, planId, now + days * 86400000, now, now]);
  }
  console.log(`✓ ${email} → ${planId}${planId !== 'free' ? ` (${days} gün)` : ''}`);
} catch (e) { console.error('✗', e.message); process.exitCode = 1; } finally { await conn.end(); }
