// Widget verisi: telefon/masaüstü widget'ları (ör. ileride yazılacak Android/iOS/Windows widget'ları) için bugünün
// özeti. Oturum çerezine bağlıdır; yalnızca kullanıcının kendi verisi döner.
import {Router} from 'express';

const DAY = 86_400_000;
export function createWidget({pool}) {
  const router = Router();
  router.get('/widget/today', async (req, res) => {
    const uid = req.user.id;
    const tz = Math.max(-840, Math.min(840, Number(req.query.tz) || 0)); // dakika (Date.getTimezoneOffset)
    const local = new Date(Date.now() - tz * 60_000);
    const date = local.toISOString().slice(0, 10);
    const wd = (local.getUTCDay() + 6) % 7;
    const [lessons] = await pool.execute('SELECT title, start_time, end_time, room, color FROM lessons WHERE user_id=? AND day=? ORDER BY start_time', [uid, wd]);
    const [tasks] = await pool.execute("SELECT title, course, due_date, due_time, category FROM tasks WHERE user_id=? AND done=0 AND due_date<=? ORDER BY due_date, due_time LIMIT 20", [uid, new Date(local.getTime() + 60 * DAY).toISOString().slice(0, 10)]);
    const startOfDay = Date.parse(date + 'T00:00:00Z') + tz * 60_000;
    const [[focus]] = await pool.execute('SELECT COALESCE(SUM(focused_seconds),0) AS s FROM focus_sessions WHERE user_id=? AND started_at>=?', [uid, startOfDay]);
    const [[settings]] = await pool.execute('SELECT data FROM user_settings WHERE user_id=?', [uid]);
    let goal = 90;
    try { goal = Number(JSON.parse(settings?.data || '{}').studyGoal) || 90; } catch { /* varsayılan */ }
    const exam = tasks.find(t => t.category === 'exam' && t.due_date >= date);
    res.set('Cache-Control', 'no-store').json({
      date,
      lessons: lessons.map(l => ({title: l.title, start: l.start_time, end: l.end_time, room: l.room, color: l.color})),
      tasksToday: tasks.filter(t => t.category !== 'exam' && t.due_date === date).map(t => ({title: t.title, course: t.course, time: t.due_time})),
      overdue: tasks.filter(t => t.due_date < date).length,
      upcomingExam: exam ? {title: exam.title, course: exam.course, date: exam.due_date, daysLeft: Math.round((Date.parse(exam.due_date) - Date.parse(date)) / DAY)} : null,
      study: {minutes: Math.round(Number(focus.s) / 60), goal},
    });
  });
  return router;
}
