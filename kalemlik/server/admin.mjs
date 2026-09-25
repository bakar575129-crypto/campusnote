// Yönetim paneli API'si: yalnızca "admin" rolündeki hesaplar erişir.
import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import {deflateSync} from 'node:zlib';
import {z} from 'zod';
import {HttpError} from './errors.mjs';
import {transaction} from './db.mjs';
import {rateLimit} from './security.mjs';
import {uuid} from './schemas.mjs';
import {currentPlan} from './plans.mjs';
import {publicUser} from './auth.mjs';

const MB = 1024 * 1024;
/** Tanıma testi için küçük, geçerli bir PNG (beyaz zemin, ortada koyu çizgi) üretir. */
function testPng(w = 96, h = 32) {
  const raw = Buffer.alloc((w * 3 + 1) * h, 255);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    if (y >= 14 && y <= 17) for (let x = 12; x < w - 12; x++) raw.fill(30, y * (w * 3 + 1) + 1 + x * 3, y * (w * 3 + 1) + 4 + x * 3);
  }
  const crcTable = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = buf => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]).toString('base64');
}

const subscriptionBody = z.object({planId: z.string().regex(/^[a-z0-9_-]{1,16}$/), days: z.number().int().min(1).max(3650).optional()});
const grantsBody = z.object({extraStorageMb: z.number().int().min(0).max(10_000_000), extraNotebooks: z.number().int().min(0).max(100_000)});
const planBody = z.object({name: z.string().trim().min(1).max(60), storageMb: z.number().int().min(10).max(10_000_000), notebookLimit: z.number().int().min(0).max(100_000), ocrDailyLimit: z.number().int().min(0).max(1_000_000), priceMonthly: z.number().min(0).max(1_000_000), active: z.boolean()});
const settingsBody = z.object({ocrApiKey: z.string().trim().max(300).optional(), ocrModel: z.string().trim().max(80).regex(/^[A-Za-z0-9._:-]*$/).optional()});

export function createAdmin({pool, config, mailer, ocr, appSettings, createResetLink}) {
  const router = Router();
  router.use((req, res, next) => {
    if (req.user?.role !== 'admin') return next(new HttpError(403, 'Bu bölüm yalnızca yöneticiler içindir.', 'FORBIDDEN'));
    next();
  });

  router.get('/stats', async (req, res) => {
    const now = Date.now(), day = 86400000;
    const [[users]] = await pool.query('SELECT COUNT(*) AS total, SUM(created_at > ?) AS week, SUM(last_login_at > ?) AS active FROM users', [now - 7 * day, now - 7 * day]);
    const [[files]] = await pool.query('SELECT COUNT(*) AS n, COALESCE(SUM(size),0) AS bytes FROM files');
    const [[nbs]] = await pool.query('SELECT COUNT(*) AS n FROM notebooks WHERE trashed_at IS NULL');
    const [[pages]] = await pool.query('SELECT COUNT(*) AS n FROM notebook_pages');
    const [subs] = await pool.query("SELECT plan_id, COUNT(*) AS n FROM subscriptions WHERE status IN ('active','canceled') AND current_period_end > ? GROUP BY plan_id", [now]);
    res.json({users: {total: Number(users.total), newThisWeek: Number(users.week || 0), activeThisWeek: Number(users.active || 0)}, storageBytes: Number(files.bytes), fileCount: Number(files.n), notebooks: Number(nbs.n), pages: Number(pages.n), subscriptions: subs.map(s => ({planId: s.plan_id, count: Number(s.n)}))});
  });

  router.get('/users', async (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const offset = Math.max(0, Math.min(1_000_000, Number(req.query.offset) || 0));
    const like = `%${q.replace(/[%_\\]/g, m => '\\' + m)}%`;
    const [rows] = await pool.query(
      `SELECT u.*, COALESCE(f.bytes,0) AS used_bytes, COALESCE(n.cnt,0) AS notebook_count
         FROM users u
         LEFT JOIN (SELECT user_id, SUM(size) AS bytes FROM files GROUP BY user_id) f ON f.user_id = u.id
         LEFT JOIN (SELECT user_id, COUNT(*) AS cnt FROM notebooks WHERE trashed_at IS NULL GROUP BY user_id) n ON n.user_id = u.id
        WHERE (? = '' OR u.email LIKE ? OR u.name LIKE ?)
        ORDER BY u.created_at DESC LIMIT 50 OFFSET ?`, [q, like, like, offset]);
    const [[count]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE (? = '' OR email LIKE ? OR name LIKE ?)", [q, like, like]);
    const users = [];
    for (const u of rows) {
      const plan = await currentPlan(pool, u.id);
      users.push({...publicUser(u), disabled: !!u.disabled, lastLoginAt: u.last_login_at ? Number(u.last_login_at) : null, usedBytes: Number(u.used_bytes), notebookCount: Number(u.notebook_count), extraStorageMb: Number(u.extra_storage_mb || 0), extraNotebooks: Number(u.extra_notebooks || 0), plan});
    }
    res.json({users, total: Number(count.n)});
  });

  const findUser = async id => {
    const [[u]] = await pool.execute('SELECT * FROM users WHERE id=?', [uuid.parse(id)]);
    if (!u) throw new HttpError(404, 'Kullanıcı bulunamadı.', 'NOT_FOUND');
    return u;
  };

  router.get('/users/:id', async (req, res) => {
    const u = await findUser(req.params.id);
    const [subs] = await pool.execute('SELECT s.*, p.name AS plan_name FROM subscriptions s JOIN plans p ON p.id=s.plan_id WHERE s.user_id=? ORDER BY s.created_at DESC LIMIT 20', [u.id]);
    const [[used]] = await pool.execute('SELECT COALESCE(SUM(size),0) AS b, COUNT(*) AS n FROM files WHERE user_id=?', [u.id]);
    res.json({
      user: {...publicUser(u), disabled: !!u.disabled, lastLoginAt: u.last_login_at ? Number(u.last_login_at) : null, extraStorageMb: Number(u.extra_storage_mb || 0), extraNotebooks: Number(u.extra_notebooks || 0)},
      plan: await currentPlan(pool, u.id),
      usage: {usedBytes: Number(used.b), fileCount: Number(used.n)},
      subscriptions: subs.map(s => ({id: s.id, planId: s.plan_id, planName: s.plan_name, status: s.status, provider: s.provider, periodEnd: Number(s.current_period_end), createdAt: Number(s.created_at)})),
    });
  });

  // Plan (abonelik paketi) tanımla: mevcut abonelikler sona erer, yenisi başlar. "free" = ücretsize döndür.
  router.post('/users/:id/subscription', async (req, res) => {
    const u = await findUser(req.params.id);
    const body = subscriptionBody.parse(req.body);
    const now = Date.now();
    await transaction(pool, async db => {
      await db.execute("UPDATE subscriptions SET status='expired', updated_at=? WHERE user_id=? AND status IN ('active','canceled')", [now, u.id]);
      if (body.planId !== 'free') {
        const [[plan]] = await db.execute('SELECT id FROM plans WHERE id=?', [body.planId]);
        if (!plan) throw new HttpError(400, 'Plan bulunamadı.');
        await db.execute("INSERT INTO subscriptions (id,user_id,plan_id,status,provider,provider_ref,current_period_end,created_at,updated_at) VALUES (?,?,?,'active','manual',?,?,?,?)",
          [randomUUID(), u.id, body.planId, `admin:${req.user.id}:${now}`, now + (body.days || 30) * 86400000, now, now]);
      }
    });
    res.json({plan: await currentPlan(pool, u.id)});
  });

  // Ek depolama (MB) ve ek defter hakkı: planın üstüne eklenir, plan değişse de korunur.
  router.post('/users/:id/grants', async (req, res) => {
    const u = await findUser(req.params.id);
    const body = grantsBody.parse(req.body);
    await pool.execute('UPDATE users SET extra_storage_mb=?, extra_notebooks=?, updated_at=? WHERE id=?', [body.extraStorageMb, body.extraNotebooks, Date.now(), u.id]);
    res.json({plan: await currentPlan(pool, u.id)});
  });

  // Şifre sıfırlama bağlantısı: e-posta gönderilir (SMTP varsa) ve bağlantı yöneticiye de gösterilir.
  router.post('/users/:id/password-reset', async (req, res) => {
    await rateLimit(pool, 'admin-reset:' + req.user.id, 60, 60 * 60 * 1000);
    const u = await findUser(req.params.id);
    const link = await createResetLink(u, 24 * 60 * 60 * 1000);
    let sent = false;
    try {
      sent = await mailer.send({to: u.email, subject: 'Kalemlik şifre sıfırlama', text: `Merhaba ${u.name},\n\nYönetici senin için bir şifre sıfırlama bağlantısı oluşturdu. Yeni şifreni belirlemek için bağlantıyı 24 saat içinde aç:\n${link}\n\nBu isteği beklemiyorsan yöneticine haber ver.`});
    } catch (e) { console.error('[Kalemlik] e-posta gönderilemedi:', e.message); }
    res.json({link, emailSent: sent});
  });

  router.post('/users/:id/status', async (req, res) => {
    const u = await findUser(req.params.id);
    const {disabled, role} = z.object({disabled: z.boolean().optional(), role: z.enum(['user', 'admin']).optional()}).parse(req.body);
    if (u.id === req.user.id && (disabled || role === 'user')) throw new HttpError(400, 'Kendi hesabını kapatamaz veya yöneticilikten çıkaramazsın.');
    if (disabled !== undefined) {
      await pool.execute('UPDATE users SET disabled=?, updated_at=? WHERE id=?', [disabled ? 1 : 0, Date.now(), u.id]);
      if (disabled) await pool.execute('DELETE FROM sessions WHERE user_id=?', [u.id]);
    }
    if (role) await pool.execute('UPDATE users SET role=?, updated_at=? WHERE id=?', [role, Date.now(), u.id]);
    res.json({ok: true});
  });

  // ---- planlar
  router.get('/plans', async (req, res) => {
    const [rows] = await pool.query('SELECT * FROM plans ORDER BY sort_order');
    res.json({plans: rows.map(p => ({id: p.id, name: p.name, storageMb: Number(p.storage_mb), notebookLimit: Number(p.notebook_limit), ocrDailyLimit: Number(p.ocr_daily_limit), priceMonthly: Number(p.price_monthly), currency: p.currency, active: !!p.active}))});
  });
  router.put('/plans/:id', async (req, res) => {
    const id = z.string().regex(/^[a-z0-9_-]{1,16}$/).parse(req.params.id);
    const b = planBody.parse(req.body);
    if (id === 'free' && !b.active) throw new HttpError(400, 'Ücretsiz plan kapatılamaz.');
    const [r] = await pool.execute('UPDATE plans SET name=?, storage_mb=?, notebook_limit=?, ocr_daily_limit=?, price_monthly=?, active=? WHERE id=?', [b.name, b.storageMb, b.notebookLimit, b.ocrDailyLimit, b.priceMonthly, b.active ? 1 : 0, id]);
    if (!r.affectedRows) throw new HttpError(404, 'Plan bulunamadı.');
    res.json({ok: true});
  });

  // ---- sistem: tanıma anahtarı, test, e-posta durumu
  router.get('/system', async (req, res) => {
    res.json({ocr: ocr.status(), mail: {configured: mailer.configured, from: config.mail.from || ''}, version: config.version, registrationOpen: config.registrationOpen});
  });
  router.put('/system', async (req, res) => {
    const b = settingsBody.parse(req.body);
    if (b.ocrApiKey !== undefined) await appSettings.set('ocr_api_key', b.ocrApiKey);
    if (b.ocrModel !== undefined) await appSettings.set('ocr_model', b.ocrModel);
    res.json({ocr: ocr.status()});
  });
  router.post('/system/ocr-test', async (req, res) => {
    await rateLimit(pool, 'ocr-test:' + req.user.id, 20, 60 * 60 * 1000);
    const started = Date.now();
    try {
      const text = await ocr.transcribe(testPng(), 'word');
      res.json({ok: true, ms: Date.now() - started, text, status: ocr.status()});
    } catch (error) {
      res.json({ok: false, ms: Date.now() - started, error: error.message, code: error.code || 'ERROR', detail: error.detail || '', status: ocr.status()});
    }
  });
  router.post('/system/mail-test', async (req, res) => {
    await rateLimit(pool, 'mail-test:' + req.user.id, 10, 60 * 60 * 1000);
    try {
      const sent = await mailer.send({to: req.user.email, subject: 'Kalemlik e-posta testi', text: 'Bu bir deneme e-postasıdır. E-posta ayarların çalışıyor.'});
      res.json({ok: sent, message: sent ? `Deneme e-postası ${req.user.email} adresine gönderildi.` : 'SMTP ayarlı değil; e-posta sunucu günlüğüne yazıldı.'});
    } catch (e) {
      res.json({ok: false, message: `E-posta gönderilemedi: ${e.message}`});
    }
  });

  return router;
}

export {MB};
