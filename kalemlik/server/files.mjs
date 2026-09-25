import {Router} from 'express';
import multer from 'multer';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {HttpError} from './errors.mjs';
import {transaction} from './db.mjs';
import {rateLimit, sniffMime} from './security.mjs';
import {uuid} from './schemas.mjs';
import {ENTITIES, collectFileRefs} from './entities.mjs';
import {activeNotebookCount, currentPlan, listPlans, usedBytes} from './plans.mjs';

/** Her dosya türü için kabul edilen gerçek içerik türleri ve üst sınır (MB). */
const KINDS = {
  page: {mimes: ['image/png', 'image/jpeg', 'image/webp'], maxMb: 15},
  image: {mimes: ['image/png', 'image/jpeg', 'image/webp'], maxMb: 15},
  sticker: {mimes: ['image/png', 'image/webp', 'image/jpeg'], maxMb: 5},
  font: {mimes: ['font/ttf', 'font/otf', 'font/woff', 'font/woff2'], maxMb: 5},
  pdf: {mimes: ['application/pdf'], maxMb: 50},
};
const UNUSED_GRACE_MS = 60 * 60 * 1000;

export function createFiles({pool, config}) {
  const router = Router();
  const upload = multer({storage: multer.memoryStorage(), limits: {fileSize: Math.max(config.maxUploadMb, 50) * 1024 * 1024, files: 1, fields: 4, parts: 6}});
  const userDir = userId => path.join(config.storage, userId);

  /** Kullanıcının kayıtlarında (sayfa, kapak, sticker ve yazı tipi arşivi) geçen dosya kimlikleri. */
  async function referencedFiles(userId) {
    const refs = new Set();
    for (const [entity, def] of Object.entries(ENTITIES)) {
      if (!def.fileRefs) continue;
      const cols = def.fields.map(f => f.col).join(',');
      const [rows] = await pool.execute(`SELECT ${cols} FROM ${def.table} WHERE user_id=?`, [userId]);
      for (const row of rows) {
        const data = {};
        for (const f of def.fields) data[f.key] = f.type === 'json' ? JSON.parse(row[f.col]) : row[f.col];
        for (const id of collectFileRefs(entity, data)) refs.add(id);
      }
    }
    return refs;
  }

  router.post('/files', async (req, res, next) => {
    await rateLimit(pool, 'upload:' + req.user.id, 300, 60 * 60 * 1000, 'Kısa sürede çok fazla dosya yüklendi. Biraz sonra tekrar dene.');
    next();
  }, upload.single('file'), async (req, res) => {
    const id = uuid.parse(req.body?.id);
    const kind = String(req.body?.kind || '');
    const rule = KINDS[kind];
    if (!rule) throw new HttpError(400, 'Dosya türü geçersiz.');
    const file = req.file;
    if (!file || !file.size) throw new HttpError(400, 'Dosya seçilmedi.');
    const mime = sniffMime(file.buffer);
    if (!mime || !rule.mimes.includes(mime)) {
      throw new HttpError(415, kind === 'font' ? 'Yalnızca TTF, OTF, WOFF veya WOFF2 yazı tipi yüklenebilir.' : 'Bu dosya türü desteklenmiyor.', 'BAD_TYPE');
    }
    const limitMb = Math.min(rule.maxMb, kind === 'pdf' ? 50 : config.maxUploadMb);
    if (file.size > limitMb * 1024 * 1024) throw new HttpError(413, `Bu dosya en fazla ${limitMb} MB olabilir.`, 'TOO_LARGE');
    const sha = createHash('sha256').update(file.buffer).digest('hex');
    const name = Buffer.from(file.originalname || 'dosya', 'latin1').toString('utf8').replace(/[\u0000-\u001f\u007f<>"\\/]/g, '').slice(0, 180) || 'dosya';

    // Aynı kimlik yeniden gönderilirse (bağlantı koptu, istemci tekrar denedi) işlem tekrarlanabilir.
    const [[same]] = await pool.execute('SELECT user_id, sha256 FROM files WHERE id=?', [id]);
    if (same) {
      if (same.user_id === req.user.id && same.sha256 === sha) return res.json({id, mime, size: file.size});
      throw new HttpError(409, 'Dosya kimliği kullanılamıyor.', 'ID_TAKEN');
    }

    const dir = userDir(req.user.id);
    const target = path.join(dir, id);
    let written = false;
    try {
      await transaction(pool, async db => {
        await db.execute('SELECT id FROM users WHERE id=? FOR UPDATE', [req.user.id]);
        const plan = await currentPlan(db, req.user.id);
        const {used} = await usedBytes(db, req.user.id);
        if (used + file.size > plan.storageBytes) throw new HttpError(413, 'Depolama alanın doldu. Plan & Depolama ekranından kullanılmayan dosyaları temizleyebilir veya planını yükseltebilirsin.', 'QUOTA');
        await fs.mkdir(dir, {recursive: true, mode: 0o700});
        await fs.writeFile(target, file.buffer, {flag: 'wx', mode: 0o600});
        written = true;
        await db.execute('INSERT INTO files (id,user_id,kind,mime,name,size,sha256,created_at) VALUES (?,?,?,?,?,?,?,?)', [id, req.user.id, kind, mime, name, file.size, sha, Date.now()]);
      });
    } catch (error) {
      if (written) await fs.unlink(target).catch(() => {});
      throw error;
    }
    res.status(201).json({id, mime, size: file.size});
  });

  router.get('/files/:id', async (req, res, next) => {
    const id = uuid.parse(req.params.id);
    const [[file]] = await pool.execute('SELECT mime,name FROM files WHERE id=? AND user_id=?', [id, req.user.id]);
    if (!file) throw new HttpError(404, 'Dosya bulunamadı.', 'NOT_FOUND');
    res.set({
      'Content-Type': file.mime,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      // Dosya içeriği hiç değişmez (yeni içerik = yeni kimlik), bu yüzden tarayıcı kalıcı önbelleğe alabilir.
      'Cache-Control': 'private, max-age=31536000, immutable',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    });
    res.sendFile(path.join(userDir(req.user.id), id), {dotfiles: 'deny'}, error => {
      if (error && !res.headersSent) next(new HttpError(404, 'Dosya okunamadı.', 'NOT_FOUND'));
    });
  });

  router.delete('/files/:id', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const refs = await referencedFiles(req.user.id);
    if (refs.has(id)) throw new HttpError(409, 'Bu dosya bir defterde veya arşivde kullanılıyor.', 'IN_USE');
    const [result] = await pool.execute('DELETE FROM files WHERE id=? AND user_id=?', [id, req.user.id]);
    if (result.affectedRows) await fs.unlink(path.join(userDir(req.user.id), id)).catch(() => {});
    res.json({ok: true});
  });

  // ---- Plan & depolama özeti
  router.get('/storage', async (req, res) => {
    const userId = req.user.id;
    const [plan, plans, usage, active, refs] = await Promise.all([
      currentPlan(pool, userId), listPlans(pool), usedBytes(pool, userId), activeNotebookCount(pool, userId), referencedFiles(userId),
    ]);
    const [files] = await pool.execute('SELECT id,kind,mime,name,size,created_at FROM files WHERE user_id=? ORDER BY size DESC LIMIT 500', [userId]);
    const [[ocr]] = await pool.execute('SELECT count FROM ocr_usage WHERE user_id=? AND day=?', [userId, new Date().toISOString().slice(0, 10)]);
    res.json({
      plan, plans,
      billingEnabled: !!config.billing.provider,
      supportEmail: config.billing.supportEmail,
      usage: {usedBytes: usage.used, fileCount: usage.count, quotaBytes: plan.storageBytes},
      notebooks: {active, limit: plan.notebookLimit},
      ocr: {today: ocr ? Number(ocr.count) : 0, limit: plan.ocrDailyLimit},
      files: files.map(f => ({id: f.id, kind: f.kind, mime: f.mime, name: f.name, size: Number(f.size), createdAt: Number(f.created_at), inUse: refs.has(f.id)})),
    });
  });

  router.post('/storage/cleanup', async (req, res) => {
    await rateLimit(pool, 'cleanup:' + req.user.id, 10, 60 * 60 * 1000);
    const refs = await referencedFiles(req.user.id);
    const [files] = await pool.execute('SELECT id,size FROM files WHERE user_id=? AND created_at<?', [req.user.id, Date.now() - UNUSED_GRACE_MS]);
    let removed = 0, freed = 0;
    for (const f of files) {
      if (refs.has(f.id)) continue;
      const [r] = await pool.execute('DELETE FROM files WHERE id=? AND user_id=?', [f.id, req.user.id]);
      if (r.affectedRows) {
        removed++; freed += Number(f.size);
        await fs.unlink(path.join(userDir(req.user.id), f.id)).catch(() => {});
      }
    }
    res.json({removed, freedBytes: freed});
  });

  // ---- Ödeme altyapısı: sağlayıcı bağlanana kadar satın alma kapalıdır; planlar yönetici betiğiyle atanır.
  router.post('/billing/checkout', async (req, res) => {
    const planId = String(req.body?.planId || '');
    const plans = await listPlans(pool);
    if (!plans.some(p => p.id === planId && p.id !== 'free')) throw new HttpError(400, 'Plan bulunamadı.');
    if (!config.billing.provider) {
      throw new HttpError(503, `Çevrimiçi ödeme henüz etkin değil.${config.billing.supportEmail ? ' Plan yükseltmek için ' + config.billing.supportEmail + ' adresine yazabilirsin.' : ''}`, 'BILLING_DISABLED');
    }
    throw new HttpError(501, 'Ödeme sağlayıcısı entegrasyonu bu sürümde tanımlı değil (bkz. docs/ODEME.md).', 'BILLING_NOT_IMPLEMENTED');
  });

  router.post('/billing/cancel', async (req, res) => {
    const [result] = await pool.execute("UPDATE subscriptions SET cancel_at_period_end=1, status='canceled', updated_at=? WHERE user_id=? AND status='active'", [Date.now(), req.user.id]);
    if (!result.affectedRows) throw new HttpError(404, 'İptal edilecek aktif abonelik yok.');
    res.json({ok: true});
  });

  return router;
}
