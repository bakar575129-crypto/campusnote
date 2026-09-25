import {createHash, randomBytes, scrypt as scryptCb, timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {HttpError} from './errors.mjs';

const scrypt = promisify(scryptCb);
const PARAMS = {N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024};

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const randomToken = () => randomBytes(32).toString('base64url');

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, 64, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

const DUMMY = 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$' + Buffer.alloc(64).toString('base64');
/** Hesap yoksa da aynı süre çalışır (kullanıcı adı tahminini zorlaştırır). */
export async function verifyPassword(password, stored) {
  const [alg, n, r, p, salt, hash] = String(stored || DUMMY).split('$');
  if (alg !== 'scrypt' || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(salt, 'base64'), expected.length, {N: Number(n), r: Number(r), p: Number(p), maxmem: PARAMS.maxmem});
  return stored != null && timingSafeEqual(actual, expected);
}

export function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/**
 * Veritabanı tabanlı sabit pencereli hız sınırı: birden çok Node süreci (Passenger) arasında da tutarlıdır.
 * @param {import('mysql2/promise').Pool} pool
 */
export async function rateLimit(pool, key, limit, windowMs, message = 'Çok fazla deneme yapıldı. Biraz sonra tekrar dene.') {
  const window = Math.floor(Date.now() / windowMs);
  const bucket = sha256(`${key}|${windowMs}|${window}`);
  await pool.execute('INSERT INTO rate_limits (bucket,hits,expires_at) VALUES (?,1,?) ON DUPLICATE KEY UPDATE hits=hits+1', [bucket, (window + 1) * windowMs]);
  const [[row]] = await pool.execute('SELECT hits FROM rate_limits WHERE bucket=?', [bucket]);
  if (row && row.hits > limit) throw new HttpError(429, message, 'RATE_LIMIT');
}

/** Süreç içi hafif sınırlayıcı: her istekte veritabanına gitmeden kaba kötüye kullanımı keser. */
export function memoryLimiter({limit, windowMs}) {
  const hits = new Map();
  let windowStart = Date.now();
  return (req, res, next) => {
    const now = Date.now();
    if (now - windowStart > windowMs) { hits.clear(); windowStart = now; }
    const key = req.ip || 'unknown';
    const count = (hits.get(key) || 0) + 1;
    hits.set(key, count);
    if (count > limit) return next(new HttpError(429, 'Çok fazla istek gönderildi. Birkaç saniye sonra tekrar dene.', 'RATE_LIMIT'));
    next();
  };
}

/** Dosyanın ilk baytlarından gerçek türünü bulur; uzantıya ve istemcinin bildirdiği türe güvenilmez. */
export function sniffMime(buf) {
  if (buf.length < 12) return null;
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  const tag = buf.subarray(0, 4).toString('latin1');
  if (tag === 'wOF2') return 'font/woff2';
  if (tag === 'wOFF') return 'font/woff';
  if (tag === 'OTTO') return 'font/otf';
  if (tag === 'true' || buf.readUInt32BE(0) === 0x00010000) return 'font/ttf';
  return null;
}
