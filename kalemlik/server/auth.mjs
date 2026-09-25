import {Router} from 'express';
import {randomUUID} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {HttpError} from './errors.mjs';
import {transaction} from './db.mjs';
import {hashPassword, randomToken, rateLimit, readCookie, sha256, verifyPassword} from './security.mjs';
import {forgotBody, loginBody, passwordBody, profileBody, registerBody, resetBody} from './schemas.mjs';

const DAY = 24 * 60 * 60 * 1000;
const RESET_MS = 60 * 60 * 1000;

export function publicUser(u) {
  return {id: u.id, email: u.email, name: u.name, role: u.role, university: u.university || '', department: u.department || '', createdAt: Number(u.created_at)};
}

export function createAuth({pool, config, mailer}) {
  const cookieName = config.secureCookies ? '__Host-klm_sid' : 'klm_sid';
  const sessionMs = config.sessionDays * DAY;
  const cookieOptions = {httpOnly: true, secure: config.secureCookies, sameSite: 'lax', path: '/'};

  async function startSession(req, res, userId) {
    const token = randomToken();
    const now = Date.now();
    await pool.execute('INSERT INTO sessions (token_hash,user_id,created_at,last_seen,expires_at,user_agent) VALUES (?,?,?,?,?,?)',
      [sha256(token), userId, now, now, now + sessionMs, String(req.get('user-agent') || '').slice(0, 200)]);
    res.cookie(cookieName, token, {...cookieOptions, maxAge: sessionMs});
  }

  /** Oturum çerezini doğrular; oturum her gün kendiliğinden uzatılır (kayan süre). */
  async function requireAuth(req, res, next) {
    const token = readCookie(req, cookieName);
    if (!token || token.length > 100) throw new HttpError(401, 'Devam etmek için giriş yap.', 'UNAUTHENTICATED');
    const hash = sha256(token);
    const now = Date.now();
    const [[row]] = await pool.execute(
      `SELECT u.*, s.last_seen FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`, [hash, now]);
    if (!row || row.disabled) {
      res.clearCookie(cookieName, cookieOptions);
      throw new HttpError(401, 'Oturumun sona erdi. Tekrar giriş yap.', 'UNAUTHENTICATED');
    }
    if (now - Number(row.last_seen) > DAY) {
      await pool.execute('UPDATE sessions SET last_seen=?, expires_at=? WHERE token_hash=?', [now, now + sessionMs, hash]);
      await pool.execute('UPDATE users SET last_login_at=? WHERE id=?', [now, row.id]);
      res.cookie(cookieName, token, {...cookieOptions, maxAge: sessionMs});
    }
    req.user = row;
    req.sessionHash = hash;
    next();
  }

  /** Tek kullanımlık şifre sıfırlama bağlantısı üretir (kullanıcının kendisi veya yönetici için). */
  async function createResetLink(user, ttl = RESET_MS) {
    const token = randomToken();
    const now = Date.now();
    await pool.execute('DELETE FROM password_resets WHERE user_id=? AND (used_at IS NOT NULL OR expires_at<?)', [user.id, now]);
    await pool.execute('INSERT INTO password_resets (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)', [sha256(token), user.id, now + ttl, now]);
    return `${config.origin}/sifre-sifirla?token=${encodeURIComponent(token)}`;
  }

  const authLimit = async (req, email) => {
    await rateLimit(pool, 'auth-ip:' + req.ip, 30, 15 * 60 * 1000);
    if (email) await rateLimit(pool, 'auth-email:' + email, 10, 15 * 60 * 1000);
  };

  const router = Router();

  router.post('/register', async (req, res) => {
    if (!config.registrationOpen) throw new HttpError(403, 'Yeni hesap oluşturma şu anda kapalı.', 'REGISTRATION_CLOSED');
    const body = registerBody.parse(req.body);
    await authLimit(req, body.email);
    const id = randomUUID();
    const hash = await hashPassword(body.password);
    const now = Date.now();
    await transaction(pool, async db => {
      const [[count]] = await db.execute('SELECT COUNT(*) AS n FROM users');
      const role = Number(count.n) === 0 ? 'admin' : 'user';
      try {
        await db.execute('INSERT INTO users (id,email,name,password_hash,role,created_at,updated_at) VALUES (?,?,?,?,?,?,?)', [id, body.email, body.name, hash, role, now, now]);
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Bu e-posta ile zaten bir hesap var. Giriş yapmayı dene.', 'EMAIL_TAKEN');
        throw error;
      }
    });
    await startSession(req, res, id);
    const [[user]] = await pool.execute('SELECT * FROM users WHERE id=?', [id]);
    res.status(201).json({user: publicUser(user)});
  });

  router.post('/login', async (req, res) => {
    const body = loginBody.parse(req.body);
    await authLimit(req, body.email);
    const [[user]] = await pool.execute('SELECT * FROM users WHERE email=?', [body.email]);
    if (!(await verifyPassword(body.password, user?.password_hash))) throw new HttpError(401, 'E-posta veya şifre hatalı.', 'BAD_CREDENTIALS');
    if (user.disabled) throw new HttpError(403, 'Bu hesap yönetici tarafından kapatıldı.', 'ACCOUNT_DISABLED');
    await pool.execute('UPDATE users SET last_login_at=? WHERE id=?', [Date.now(), user.id]);
    await startSession(req, res, user.id);
    res.json({user: publicUser(user)});
  });

  router.post('/forgot', async (req, res) => {
    const body = forgotBody.parse(req.body);
    await authLimit(req, body.email);
    const [[user]] = await pool.execute('SELECT id,email,name FROM users WHERE email=?', [body.email]);
    if (user) {
      const link = await createResetLink(user);
      await mailer.send({to: user.email, subject: 'Kalemlik şifre sıfırlama', text: `Merhaba ${user.name},\n\nŞifreni sıfırlamak için bu bağlantıyı 1 saat içinde aç:\n${link}\n\nBu isteği sen yapmadıysan bu e-postayı yok sayabilirsin.`}).catch(e => console.error('Mail error:', e.message));
    }
    // Hesabın var olup olmadığı açığa çıkmasın diye yanıt her zaman aynıdır.
    res.json({ok: true});
  });

  router.post('/reset', async (req, res) => {
    const body = resetBody.parse(req.body);
    await rateLimit(pool, 'reset-ip:' + req.ip, 20, 15 * 60 * 1000);
    const hash = await hashPassword(body.password);
    await transaction(pool, async db => {
      const [[row]] = await db.execute('SELECT user_id FROM password_resets WHERE token_hash=? AND used_at IS NULL AND expires_at>? FOR UPDATE', [sha256(body.token), Date.now()]);
      if (!row) throw new HttpError(400, 'Sıfırlama bağlantısı geçersiz ya da süresi dolmuş. Yeni bağlantı iste.', 'RESET_INVALID');
      await db.execute('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', [hash, Date.now(), row.user_id]);
      await db.execute('UPDATE password_resets SET used_at=? WHERE token_hash=?', [Date.now(), sha256(body.token)]);
      await db.execute('DELETE FROM sessions WHERE user_id=?', [row.user_id]);
    });
    res.json({ok: true});
  });

  // ---- bundan sonrası giriş gerektirir
  router.get('/me', requireAuth, (req, res) => res.json({user: publicUser(req.user)}));

  router.post('/logout', requireAuth, async (req, res) => {
    await pool.execute('DELETE FROM sessions WHERE token_hash=?', [req.sessionHash]);
    res.clearCookie(cookieName, cookieOptions);
    res.json({ok: true});
  });

  router.post('/logout-others', requireAuth, async (req, res) => {
    const [result] = await pool.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', [req.user.id, req.sessionHash]);
    res.json({ok: true, closed: result.affectedRows});
  });

  router.get('/sessions', requireAuth, async (req, res) => {
    const [rows] = await pool.execute('SELECT token_hash,created_at,last_seen,user_agent FROM sessions WHERE user_id=? AND expires_at>? ORDER BY last_seen DESC', [req.user.id, Date.now()]);
    res.json({sessions: rows.map(r => ({current: r.token_hash === req.sessionHash, createdAt: Number(r.created_at), lastSeen: Number(r.last_seen), userAgent: r.user_agent}))});
  });

  router.patch('/profile', requireAuth, async (req, res) => {
    const body = profileBody.parse(req.body);
    await pool.execute('UPDATE users SET name=?, university=?, department=?, updated_at=? WHERE id=?', [body.name, body.university ?? req.user.university, body.department ?? req.user.department, Date.now(), req.user.id]);
    const [[user]] = await pool.execute('SELECT * FROM users WHERE id=?', [req.user.id]);
    res.json({user: publicUser(user)});
  });

  router.post('/password', requireAuth, async (req, res) => {
    const body = passwordBody.parse(req.body);
    await rateLimit(pool, 'password:' + req.user.id, 8, 15 * 60 * 1000);
    if (!(await verifyPassword(body.currentPassword, req.user.password_hash))) throw new HttpError(400, 'Mevcut şifre hatalı.', 'BAD_PASSWORD');
    const hash = await hashPassword(body.newPassword);
    await transaction(pool, async db => {
      await db.execute('UPDATE users SET password_hash=?, updated_at=? WHERE id=?', [hash, Date.now(), req.user.id]);
      await db.execute('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', [req.user.id, req.sessionHash]);
    });
    res.json({ok: true});
  });

  router.post('/delete-account', requireAuth, async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    await rateLimit(pool, 'delete:' + req.user.id, 5, 15 * 60 * 1000);
    if (!(await verifyPassword(password, req.user.password_hash))) throw new HttpError(400, 'Şifre hatalı.', 'BAD_PASSWORD');
    await pool.execute('DELETE FROM users WHERE id=?', [req.user.id]);
    await fs.rm(path.join(config.storage, req.user.id), {recursive: true, force: true});
    res.clearCookie(cookieName, cookieOptions);
    res.json({ok: true});
  });

  return {router, requireAuth, createResetLink};
}
