import express from 'express';
import helmet from 'helmet';
import multer from 'multer';
import path from 'node:path';
import {ZodError} from 'zod';
import {HttpError} from './errors.mjs';
import {memoryLimiter, rateLimit} from './security.mjs';
import {createAuth} from './auth.mjs';
import {createSync} from './sync.mjs';
import {createFiles} from './files.mjs';
import {createMailer} from './mail.mjs';
import {createOcr} from './ocr.mjs';
import {currentPlan} from './plans.mjs';
import {createAdmin} from './admin.mjs';
import {createAppSettings} from './appSettings.mjs';

const SPA_ROUTES = ['/', '/giris', '/kayit', '/sifremi-unuttum', '/sifre-sifirla', '/defterler', '/defter/:id', '/program', '/gorevler', '/odak', '/takvim', '/favoriler', '/cop', '/ayarlar', '/hesap', '/plan', '/yonetim'];

export function createApp({pool, config, appSettings = createAppSettings(pool), ocr = createOcr(config, {appSettings}), mailer = createMailer(config)}) {
  void appSettings.refresh();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', config.trustProxy);

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        // 'wasm-unsafe-eval': cihazda el yazısı tanıma (WebAssembly) için gerekli; eval'e izin vermez.
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'", 'blob:'],
        workerSrc: ["'self'", 'blob:'],
        manifestSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        ...(config.production ? {upgradeInsecureRequests: []} : {}),
      },
    },
    strictTransportSecurity: config.production ? {maxAge: 31536000, includeSubDomains: true} : false,
    crossOriginEmbedderPolicy: false,
    referrerPolicy: {policy: 'strict-origin-when-cross-origin'},
  }));

  // ---- API ortak kuralları: önbellek yok, CSRF koruması, kaba hız sınırı
  app.use('/api', memoryLimiter({limit: 900, windowMs: 60 * 1000}));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    // Başka sitelerden gönderilen formlar özel başlık ekleyemez; Origin de kendi adresimiz olmalıdır.
    const origin = req.get('origin');
    if (req.get('x-kalemlik') !== '1' || (origin && !config.allowedOrigins.has(origin))) {
      return next(new HttpError(403, 'İstek doğrulanamadı. Sayfayı yenileyip tekrar dene.', 'CSRF'));
    }
    next();
  });
  app.use('/api', express.json({limit: '6mb'}));

  const auth = createAuth({pool, config, mailer});

  app.get('/api/health', async (req, res) => {
    await pool.execute('SELECT 1');
    res.json({ok: true, version: config.version});
  });
  app.get('/api/config', (req, res) => res.json({
    version: config.version,
    registrationOpen: config.registrationOpen,
    ocrEnabled: ocr.configured,
    mailEnabled: mailer.configured,
    billingEnabled: !!config.billing.provider,
  }));
  app.use('/api/auth', auth.router);

  // ---- bundan sonrası oturum ister
  app.use('/api', auth.requireAuth);
  app.use('/api', createSync({pool}));
  app.use('/api', createFiles({pool, config}));
  app.use('/api/admin', createAdmin({pool, config, mailer, ocr, appSettings, createResetLink: auth.createResetLink}));

  app.post('/api/ocr', async (req, res) => {
    const image = typeof req.body?.image === 'string' ? req.body.image : '';
    const mode = req.body?.mode === 'word' ? 'word' : 'block';
    const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(image);
    if (!match || match[1].length > 5_000_000) throw new HttpError(400, 'Yazı görüntüsü geçersiz veya çok büyük.');
    if (!ocr.configured) throw new HttpError(503, 'El yazısı tanıma bu sunucuda etkin değil. Yazın korunuyor.', 'OCR_DISABLED');
    await rateLimit(pool, 'ocr-minute:' + req.user.id, 40, 60 * 1000, 'Çok hızlı tanıma isteği gönderildi. Biraz yavaşla.');
    const plan = await currentPlan(pool, req.user.id);
    const day = new Date().toISOString().slice(0, 10);
    await pool.execute('INSERT IGNORE INTO ocr_usage (user_id,day,count) VALUES (?,?,0)', [req.user.id, day]);
    const [quota] = await pool.execute('UPDATE ocr_usage SET count=count+1 WHERE user_id=? AND day=? AND count<?', [req.user.id, day, plan.ocrDailyLimit]);
    if (!quota.affectedRows) throw new HttpError(429, 'Bugünkü el yazısı tanıma hakkın doldu. Kendi el yazın düzeltilmeye devam eder.', 'OCR_QUOTA');
    const text = await ocr.transcribe(match[1], mode);
    res.json({text});
  });

  app.use('/api', (req, res) => res.status(404).json({error: 'İşlem bulunamadı.', code: 'NOT_FOUND'}));

  // ---- ön yüz (dist): index.html ve service worker önbelleğe alınmaz, hash'li varlıklar uzun süre önbellekte kalır
  app.use('/ocr', express.static(path.join(config.dist, 'ocr'), {maxAge: '30d', index: false, fallthrough: false}));
  app.get('/sw.js', (req, res) => res.set({'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/'}).sendFile(path.join(config.dist, 'sw.js')));
  app.use('/assets', express.static(path.join(config.dist, 'assets'), {immutable: true, maxAge: '365d', index: false, fallthrough: false}));
  app.use(express.static(config.dist, {index: false, dotfiles: 'deny', maxAge: '1d'}));
  app.get(SPA_ROUTES, (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(config.dist, 'index.html')));
  app.use((req, res) => res.status(404).type('text/plain').send('Sayfa bulunamadı.'));

  // ---- hata yakalayıcı: kullanıcıya anlaşılır Türkçe mesaj, iç ayrıntı asla sızmaz
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    let status = 500, message = 'Beklenmeyen bir hata oluştu. Biraz sonra tekrar dene.', code = 'SERVER_ERROR', extra;
    if (error instanceof HttpError) { status = error.status; message = error.message; code = error.code || 'ERROR'; extra = error.extra; }
    else if (error instanceof ZodError) {
      status = 400; code = 'VALIDATION';
      const issue = error.issues[0];
      message = issue?.message && !/^Invalid|^Too|^Expected/.test(issue.message) ? issue.message : 'Gönderilen bilgileri kontrol et.';
      // Hangi alanın reddedildiği istemciye ve sunucu günlüğüne yazılır (sorun teşhisi için).
      extra = {field: (issue?.path || []).join('.')};
      console.warn('[Kalemlik] doğrulama reddi:', req.method, req.path, extra.field, issue?.message);
    }
    else if (error instanceof multer.MulterError) { status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400; code = 'UPLOAD'; message = error.code === 'LIMIT_FILE_SIZE' ? 'Dosya çok büyük.' : 'Dosya yüklenemedi.'; }
    else if (error.type === 'entity.too.large') { status = 413; code = 'TOO_LARGE'; message = 'Gönderilen içerik çok büyük.'; }
    else if (error.type === 'entity.parse.failed') { status = 400; code = 'BAD_JSON'; message = 'Gönderilen veri okunamadı.'; }
    else if (['ECONNREFUSED', 'ER_ACCESS_DENIED_ERROR', 'ER_BAD_DB_ERROR', 'ENOTFOUND', 'PROTOCOL_CONNECTION_LOST'].includes(error.code)) { status = 503; code = 'DB_UNAVAILABLE'; message = 'Veritabanına bağlanılamadı. Biraz sonra tekrar dene.'; }
    else if (error.code === 'ER_NO_SUCH_TABLE') { status = 503; code = 'DB_SCHEMA'; message = 'Veritabanı tabloları eksik. Yönetici "npm run db:migrate" çalıştırmalı.'; }
    if (status >= 500) console.error('[Kalemlik]', req.method, req.path, error.code || error.name, error.message);
    res.status(status).json({error: message, code, ...(extra || {})});
  });
  return app;
}
