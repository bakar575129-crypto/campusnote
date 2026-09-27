// XP ve rozetler. Kurallar yalnızca sunucuda: istemci XP miktarı göndermez; XP, eşitlenen kaydın önceki ve yeni
// hâli karşılaştırılarak verilir (görev tamamlandı, 30 dk odak bitti, quiz bitti…). Aynı olay için ikinci kez XP
// verilmez (xp_transactions: UNIQUE user+reason+ref) ve her türün günlük üst sınırı vardır (kötüye kullanıma karşı).
import {Router} from 'express';

/** reason → {amount, dailyCap (o gün en fazla kaç kez), label} */
export const XP_RULES = {
  note: {amount: 5, dailyCap: 10, label: 'Yeni not'},
  task: {amount: 10, dailyCap: 20, label: 'Görev tamamla'},
  focus: {amount: 20, dailyCap: 8, label: '30 dk odak'},
  quiz: {amount: 15, dailyCap: 10, label: 'Quiz çöz'},
  flashcard: {amount: 10, dailyCap: 5, label: 'Flashcard çalış'},
  plan: {amount: 50, dailyCap: 2, label: 'Sınav planını tamamla'},
  journal: {amount: 5, dailyCap: 1, label: 'Günlük yaz'},
};

/** Seviye L için gereken toplam XP: 0, 100, 300, 600, 1000… (her seviye bir öncekinden 100 fazla ister). */
export const levelStart = level => 50 * (level - 1) * level;
export function levelOf(xp) {
  let level = 1;
  while (levelStart(level + 1) <= xp) level++;
  return {level, start: levelStart(level), next: levelStart(level + 1)};
}

const count = async (pool, sql, args) => Number((await pool.execute(sql, args))[0][0].n);
/** Rozetler: yeni rozet eklemek için bu listeye bir satır eklemek yeterli. */
export const BADGES = [
  {id: 'first_note', icon: '🏆', name: 'İlk Not', desc: 'İlk defterini oluştur.', check: (p, u) => count(p, 'SELECT COUNT(*) n FROM notebooks WHERE user_id=?', [u]).then(n => n >= 1)},
  {id: 'ten_lessons', icon: '📚', name: '10 Ders', desc: 'Ders programına 10 ders ekle.', check: (p, u) => count(p, 'SELECT COUNT(*) n FROM lessons WHERE user_id=?', [u]).then(n => n >= 10)},
  {id: 'streak7', icon: '🔥', name: '7 Gün Seri', desc: '7 gün üst üste çalış.', check: (p, u) => streak(p, u).then(n => n >= 7)},
  {id: 'hours10', icon: '⏱️', name: '10 Saat Çalışma', desc: 'Toplam 10 saat odaklan.', check: (p, u) => count(p, 'SELECT COALESCE(SUM(focused_seconds),0) n FROM focus_sessions WHERE user_id=?', [u]).then(n => n >= 36000)},
  {id: 'cards100', icon: '🧠', name: '100 Flashcard', desc: '100 farklı kartı çalış.', check: (p, u) => count(p, 'SELECT COUNT(*) n FROM flashcards WHERE user_id=? AND last_review_at IS NOT NULL', [u]).then(n => n >= 100)},
  {id: 'quiz10', icon: '🎯', name: '10 Quiz', desc: '10 quiz tamamla.', check: (p, u) => count(p, 'SELECT COUNT(*) n FROM quizzes WHERE user_id=? AND completed_at IS NOT NULL', [u]).then(n => n >= 10)},
  {id: 'tasks30', icon: '📅', name: '30 Görev', desc: '30 görevi tamamla.', check: (p, u) => count(p, 'SELECT COUNT(*) n FROM tasks WHERE user_id=? AND done=1', [u]).then(n => n >= 30)},
  {id: 'exam_ready', icon: '🎓', name: 'Sınav Hazırlığı', desc: 'Bir sınav çalışma planını baştan sona tamamla.', check: (p, u) => count(p, "SELECT COUNT(*) n FROM xp_transactions WHERE user_id=? AND reason='plan'", [u]).then(n => n >= 1)},
];

const TZ = process.env.APP_TZ || 'Europe/Istanbul';
export const dayOf = (ms = Date.now()) => new Intl.DateTimeFormat('sv-SE', {timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit'}).format(ms);

/** Art arda XP kazanılan gün sayısı (bugün ya da dün biten seri). */
async function streak(pool, userId) {
  const [rows] = await pool.execute('SELECT DISTINCT day FROM xp_transactions WHERE user_id=? ORDER BY day DESC LIMIT 400', [userId]);
  const days = new Set(rows.map(r => r.day));
  let d = Date.now();
  if (!days.has(dayOf(d))) d -= 86400000;
  let n = 0;
  while (days.has(dayOf(d))) { n++; d -= 86400000; }
  return n;
}

/** Eşitlenen kaydın önceki (prev) ve yeni (data) hâlinden hangi XP olaylarının doğduğunu bulur. Saf fonksiyon (test edilir). */
export function xpEvents(entity, id, data, prev, now = Date.now()) {
  const out = [];
  if (entity === 'notebook' && !prev && data.trashedAt == null) out.push({reason: 'note', ref: id});
  if (entity === 'journal' && !prev && data.body.trim().length >= 3) out.push({reason: 'journal', ref: data.day});
  if (entity === 'task' && data.done && !prev?.done) out.push({reason: 'task', ref: id});
  if (entity === 'focus' && data.completed && !prev?.completed && data.focusedSeconds >= 1800
    && data.endedAt - data.startedAt >= 1800 * 1000 * 0.95 && data.endedAt <= now + 60000) out.push({reason: 'focus', ref: id});
  if (entity === 'quiz' && data.result && data.completedAt && data.completedAt !== prev?.completedAt && data.questions.length >= 3) out.push({reason: 'quiz', ref: `${id}:${data.completedAt}`});
  if (entity === 'card' && data.lastReviewAt && data.lastReviewAt !== prev?.lastReviewAt && Math.abs(now - data.lastReviewAt) < 86400000) out.push({reason: 'flashcard', ref: `${data.deckId}:${dayOf(now)}`});
  if (entity === 'studyPlan') {
    const work = data.items.filter(i => i.kind !== 'rest');
    const allDone = items => items.filter(i => i.kind !== 'rest').every(i => i.done);
    if (work.length >= 3 && allDone(data.items) && !(prev && allDone(prev.items))) out.push({reason: 'plan', ref: id});
  }
  return out;
}

export function createXp({pool}) {
  /** Olayı XP’ye çevirir: tekrar etmez, günlük sınırı aşmaz. Kazanılan toplam XP’yi döner. */
  async function award(userId, {reason, ref}, now = Date.now()) {
    const rule = XP_RULES[reason];
    if (!rule) return 0;
    const day = dayOf(now);
    const today = await count(pool, 'SELECT COUNT(*) n FROM xp_transactions WHERE user_id=? AND day=? AND reason=?', [userId, day, reason]);
    if (today >= rule.dailyCap) return 0;
    const [r] = await pool.execute('INSERT IGNORE INTO xp_transactions (user_id,amount,reason,ref,day,created_at) VALUES (?,?,?,?,?,?)', [userId, rule.amount, reason, String(ref).slice(0, 64), day, now]);
    return r.affectedRows ? rule.amount : 0;
  }
  async function checkBadges(userId) {
    const [have] = await pool.execute('SELECT badge_id FROM user_badges WHERE user_id=?', [userId]);
    const owned = new Set(have.map(b => b.badge_id));
    const earned = [];
    for (const b of BADGES) {
      if (owned.has(b.id)) continue;
      if (await b.check(pool, userId).catch(() => false)) {
        await pool.execute('INSERT IGNORE INTO user_badges (user_id,badge_id,earned_at) VALUES (?,?,?)', [userId, b.id, Date.now()]);
        earned.push(b.id);
      }
    }
    return earned;
  }
  /** Eşitleme yazmasından sonra çağrılır; hata eşitlemeyi asla bozmaz. */
  async function onWrite(userId, entity, id, data, prev) {
    try {
      let gained = 0;
      for (const e of xpEvents(entity, id, data, prev)) gained += await award(userId, e);
      if (gained || entity === 'lesson' || entity === 'notebook') await checkBadges(userId);
    } catch (e) { console.error('XP hesaplanamadı:', e.message); }
  }

  const router = Router();
  router.get('/progress', async (req, res) => {
    const userId = req.user.id;
    await checkBadges(userId);
    const [[tot]] = await pool.execute('SELECT COALESCE(SUM(amount),0) xp FROM xp_transactions WHERE user_id=?', [userId]);
    const xp = Number(tot.xp);
    const [[td]] = await pool.execute('SELECT COALESCE(SUM(amount),0) xp FROM xp_transactions WHERE user_id=? AND day=?', [userId, dayOf()]);
    const [recent] = await pool.execute('SELECT amount, reason, created_at FROM xp_transactions WHERE user_id=? ORDER BY id DESC LIMIT 12', [userId]);
    const [badges] = await pool.execute('SELECT badge_id, earned_at FROM user_badges WHERE user_id=?', [userId]);
    const got = new Map(badges.map(b => [b.badge_id, Number(b.earned_at)]));
    res.json({
      xp, today: Number(td.xp), ...levelOf(xp), streak: await streak(pool, userId),
      recent: recent.map(r => ({amount: r.amount, reason: r.reason, label: XP_RULES[r.reason]?.label || r.reason, at: Number(r.created_at)})),
      badges: BADGES.map(b => ({id: b.id, icon: b.icon, name: b.name, desc: b.desc, earnedAt: got.get(b.id) ?? null})),
      rules: Object.entries(XP_RULES).map(([reason, r]) => ({reason, label: r.label, amount: r.amount})),
    });
  });
  return {router, onWrite, award, checkBadges};
}
