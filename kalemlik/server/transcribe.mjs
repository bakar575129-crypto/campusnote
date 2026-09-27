// Ders kaydı → metin (sunucu). OpenAI anahtarı tanımlıysa Whisper ile, zaman damgalı olarak yazıya döker.
// Anahtar yoksa istemci, kayıt sırasında tarayıcının konuşma tanımasıyla canlı transkript tutar.
import {Router} from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import {HttpError} from './errors.mjs';
import {rateLimit} from './security.mjs';
import {uuid} from './schemas.mjs';
import {currentPlan} from './plans.mjs';
import {detectProvider, explainProviderError} from './ocr.mjs';

const MAX_BYTES = 25 * 1024 * 1024; // sağlayıcının tek dosya sınırı
const stamp = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createTranscribe({pool, config, appSettings, fetchImpl = fetch}) {
  const key = () => {
    const candidates = [appSettings?.get('ai_api_key'), appSettings?.get('ocr_api_key'), config.ocr.openaiKey, config.ocr.apiKey].filter(Boolean);
    return candidates.find(k => detectProvider(k) === 'openai') || '';
  };
  const router = Router();

  router.get('/recordings/transcribe-status', async (req, res) => {
    const plan = await currentPlan(pool, req.user.id);
    res.json({available: !!key() && plan.features.transcription, configured: !!key(), planAllows: plan.features.transcription});
  });

  router.post('/recordings/:id/transcribe', async (req, res) => {
    const id = uuid.parse(req.params.id);
    const apiKey = key();
    if (!apiKey) throw new HttpError(503, 'Sunucuda ses → metin için bir OpenAI anahtarı tanımlı değil. Kayıt sırasında canlı transkript kullanılabilir.', 'TRANSCRIBE_DISABLED');
    const plan = await currentPlan(pool, req.user.id);
    if (!plan.features.transcription) throw new HttpError(403, `Sunucuda ses → metin ${plan.name} planında yok. Planını yükseltebilirsin.`, 'PLAN_FEATURE');
    await rateLimit(pool, 'transcribe:' + req.user.id, 10, 60 * 60 * 1000, 'Bir saatte en fazla 10 kayıt metne çevrilebilir.');
    const [[rec]] = await pool.execute('SELECT file_id FROM audio_recordings WHERE id=? AND user_id=?', [id, req.user.id]);
    if (!rec) throw new HttpError(404, 'Kayıt bulunamadı.', 'NOT_FOUND');
    const [[file]] = await pool.execute('SELECT id, mime, size, name FROM files WHERE id=? AND user_id=?', [rec.file_id, req.user.id]);
    if (!file) throw new HttpError(409, 'Ses dosyası henüz yüklenmedi. İnternete bağlanınca tekrar dene.', 'MISSING_FILE');
    if (Number(file.size) > MAX_BYTES) throw new HttpError(413, 'Kayıt 25 MB’den büyük; sunucuda metne çevrilemiyor. Canlı transkripti kullan ya da kaydı bölümlere ayır.', 'TOO_LARGE');
    // Günlük AI hakkından düşer.
    const day = new Date().toISOString().slice(0, 10);
    await pool.execute('INSERT IGNORE INTO ai_usage (user_id,day,count) VALUES (?,?,0)', [req.user.id, day]);
    const [q] = await pool.execute('UPDATE ai_usage SET count=count+1 WHERE user_id=? AND day=? AND count<?', [req.user.id, day, plan.aiDailyLimit]);
    if (!q.affectedRows) throw new HttpError(429, 'Bugünkü Kalemlik AI hakkın doldu.', 'AI_QUOTA');
    try {
      const buf = await fs.readFile(path.join(config.storage, req.user.id, file.id));
      const ext = {'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/mpeg': 'mp3'}[file.mime] || 'webm';
      const form = new FormData();
      form.append('file', new Blob([buf], {type: file.mime}), `kayit.${ext}`);
      form.append('model', 'whisper-1');
      form.append('language', req.body?.lang === 'en' ? 'en' : 'tr');
      form.append('response_format', 'verbose_json');
      let r;
      try { r = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {method: 'POST', headers: {Authorization: 'Bearer ' + apiKey}, body: form, signal: AbortSignal.timeout(300_000)}); }
      catch (e) { throw new HttpError(502, `Ses → metin hizmetine bağlanılamadı: ${e?.message || e}`, 'TRANSCRIBE_FAILED'); }
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { const e = explainProviderError(r.status, data?.error?.message || ''); throw new HttpError(e.status, e.message.replace('Tanıma hizmeti', 'Ses → metin hizmeti'), e.code.replace('OCR_', 'TRANSCRIBE_')); }
      const segments = Array.isArray(data.segments) ? data.segments : [];
      const transcript = segments.length ? segments.map(s => `[${stamp(s.start)}] ${String(s.text).trim()}`).join('\n') : String(data.text || '').trim();
      res.json({transcript: transcript.slice(0, 500_000)});
    } catch (error) {
      await pool.execute('UPDATE ai_usage SET count=GREATEST(count,1)-1 WHERE user_id=? AND day=?', [req.user.id, day]).catch(() => {});
      throw error;
    }
  });
  return router;
}
