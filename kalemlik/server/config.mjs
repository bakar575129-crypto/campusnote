import dotenv from 'dotenv';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const ROOT = fileURLToPath(new URL('../', import.meta.url));
export const VERSION = '1.1.1';
dotenv.config({path: path.join(ROOT, '.env'), quiet: true});

function int(env, key, fallback, min, max) {
  const raw = env[key];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} ayarı ${min}–${max} arasında bir tam sayı olmalı.`);
  return value;
}

/** .env değerlerini doğrular; hatalı yapılandırmada uygulama hiç başlamaz. */
export function readConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const appUrl = env.APP_URL || (production ? '' : 'http://localhost:3000');
  let url;
  try { url = new URL(appUrl); } catch { throw new Error('APP_URL geçerli bir adres olmalı (ör. https://not.ornek.com).'); }
  if (url.pathname !== '/' || url.search || url.hash || url.username) throw new Error('APP_URL yalnızca alan adı içermeli; alt klasör kullanmayın.');
  if (production && url.protocol !== 'https:') throw new Error('Canlı ortamda APP_URL https:// ile başlamalı.');
  for (const key of ['DB_NAME', 'DB_USER']) if (!env[key]) throw new Error(`${key} ayarı eksik.`);
  if (production && !env.DB_PASSWORD) throw new Error('DB_PASSWORD ayarı eksik.');

  const dist = path.join(ROOT, 'dist');
  const storage = path.resolve(ROOT, env.STORAGE_DIR || 'storage');
  const rel = path.relative(dist, storage);
  if (!rel || (!rel.startsWith('..') && !path.isAbsolute(rel))) throw new Error('STORAGE_DIR herkese açık dist klasörünün dışında olmalı.');

  const devOrigins = production ? [] : ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3000', 'http://127.0.0.1:3000'];
  return {
    production,
    version: VERSION,
    port: Number(env.PORT || 3000),
    origin: url.origin,
    allowedOrigins: new Set([url.origin, ...devOrigins]),
    secureCookies: url.protocol === 'https:',
    trustProxy: int(env, 'TRUST_PROXY', 1, 0, 10),
    db: {
      host: env.DB_HOST || 'localhost',
      port: int(env, 'DB_PORT', 3306, 1, 65535),
      user: env.DB_USER,
      password: env.DB_PASSWORD || '',
      database: env.DB_NAME,
      ...(env.DB_SOCKET ? {socketPath: env.DB_SOCKET} : {}),
      connectionLimit: int(env, 'DB_POOL_SIZE', 6, 1, 50),
      waitForConnections: true,
      queueLimit: 200,
      charset: 'utf8mb4',
      timezone: 'Z',
      multipleStatements: false,
      supportBigNumbers: true,
      bigNumberStrings: false,
    },
    dist,
    storage,
    registrationOpen: env.REGISTRATION_OPEN !== 'false',
    sessionDays: int(env, 'SESSION_DAYS', 30, 1, 365),
    maxUploadMb: int(env, 'MAX_UPLOAD_MB', 15, 1, 100),
    ocr: {
      apiKey: env.ANTHROPIC_API_KEY || '',
      model: env.OCR_MODEL || 'claude-opus-5',
      openaiKey: env.OPENAI_API_KEY || '',
      openaiModel: env.OPENAI_OCR_MODEL || 'gpt-4.1-mini',
    },
    mail: {
      host: env.SMTP_HOST || '',
      port: int(env, 'SMTP_PORT', 587, 1, 65535),
      secure: env.SMTP_SECURE === 'true',
      user: env.SMTP_USER || '',
      password: env.SMTP_PASSWORD || '',
      from: env.MAIL_FROM || '',
    },
    billing: {
      provider: env.BILLING_PROVIDER || '',
      supportEmail: env.BILLING_SUPPORT_EMAIL || '',
    },
  };
}
