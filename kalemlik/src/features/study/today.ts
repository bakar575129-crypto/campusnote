// "Bugün" özeti: dersler, görevler, yaklaşan sınav, plan maddeleri, çalışma süresi, seri ve tekrar zamanı gelen
// kartlar. Ana sayfa, widget, akıllı bildirimler ve Kalemlik AI'nın çevrimdışı cevapları aynı hesabı kullanır.
import {list} from '@/lib/store';
import {getSettings} from '@/lib/settings';
import {addDays, daysBetween, isoDate, minutesOf, weekday, DAYS} from '@/lib/format';
import type {Lesson, PlanItem, StudyPlan, Task} from '@/lib/types';

export interface TodayInfo {
  date: string;
  lessons: Lesson[];
  nextLesson: Lesson | null;
  tasksToday: Task[];
  overdue: Task[];
  upcomingExam: (Task & {daysLeft: number}) | null;
  exams: (Task & {daysLeft: number})[];
  planItems: {plan: StudyPlan; item: PlanItem}[];
  focusMinutes: number;
  goalMinutes: number;
  streak: number;
  dueCards: number;
  agenda: {time: string; title: string; kind: 'lesson' | 'task' | 'plan'; color: string; done?: boolean}[];
}

/** Ardışık çalışılan gün sayısı (odaklanma, kart tekrarı, quiz ya da plan maddesi olan günler). */
export function studyStreak(now = new Date()): number {
  const days = new Set<string>();
  for (const f of list('focus')) if (f.focusedSeconds >= 60) days.add(isoDate(new Date(f.startedAt)));
  for (const c of list('card')) if (c.lastReviewAt) days.add(isoDate(new Date(c.lastReviewAt)));
  for (const q of list('quiz')) if (q.completedAt) days.add(isoDate(new Date(q.completedAt)));
  let streak = 0;
  let d = new Date(now);
  if (!days.has(isoDate(d))) d = addDays(d, -1); // bugün henüz çalışmadıysa seri dünden sayılır
  while (days.has(isoDate(d))) { streak++; d = addDays(d, -1); }
  return streak;
}

export function focusMinutesOn(date: string) {
  return Math.round(list('focus').filter(f => isoDate(new Date(f.startedAt)) === date).reduce((n, f) => n + f.focusedSeconds, 0) / 60);
}

export function computeToday(now = new Date()): TodayInfo {
  const date = isoDate(now);
  const wd = weekday(now);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const lessons = list('lesson').filter(l => l.day === wd).sort((a, b) => a.start.localeCompare(b.start));
  const nextLesson = lessons.find(l => minutesOf(l.end) > nowMin) || null;
  const open = list('task').filter(t => !t.done);
  const tasksToday = open.filter(t => t.dueDate === date && t.category !== 'exam').sort((a, b) => (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  const overdue = open.filter(t => t.dueDate < date).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const exams = open.filter(t => t.category === 'exam' && t.dueDate >= date).map(t => ({...t, daysLeft: daysBetween(date, t.dueDate)})).sort((a, b) => a.daysLeft - b.daysLeft);
  const planItems = list('studyPlan').filter(p => !p.completedAt).flatMap(plan => plan.items.filter(i => i.date === date && i.kind !== 'rest').map(item => ({plan, item})));
  const planned = planItems.reduce((n, p) => n + p.item.minutes, 0);
  const goal = Math.max(getSettings().studyGoal, planned);
  const agenda: TodayInfo['agenda'] = [
    ...lessons.map(l => ({time: l.start, title: l.title, kind: 'lesson' as const, color: l.color})),
    ...tasksToday.map(t => ({time: t.dueTime || '', title: t.title, kind: 'task' as const, color: t.color, done: t.done})),
    ...planItems.filter(p => !p.item.taskId).map(p => ({time: '', title: `${p.item.topic} · ${p.item.minutes} dk`, kind: 'plan' as const, color: '#8b5cf6', done: p.item.done})),
  ].sort((a, b) => (a.time || '99').localeCompare(b.time || '99'));
  return {
    date, lessons, nextLesson, tasksToday, overdue, upcomingExam: exams[0] || null, exams,
    planItems, focusMinutes: focusMinutesOn(date), goalMinutes: goal, streak: studyStreak(now),
    dueCards: list('card').filter(c => c.due <= now.getTime()).length, agenda,
  };
}

/** Kalemlik AI çevrimdışıyken ya da anahtar yokken "bugün / bu hafta ne çalışmalıyım" sorularına yerel cevap. */
export function localAdvice(question: string): string | null {
  const q = question.toLocaleLowerCase('tr');
  if (!/(bugün|bu hafta|planla|ne çalış|hangi ders|program|işlerim)/.test(q)) return null;
  const t = computeToday();
  const lines: string[] = [];
  if (/bu hafta|hangi ders/.test(q)) {
    const end = isoDate(addDays(new Date(), 7));
    const week = list('task').filter(x => !x.done && x.dueDate >= t.date && x.dueDate <= end).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const weakByCourse = new Map<string, number>();
    for (const quiz of list('quiz')) if (quiz.result && quiz.result.percent < 60) weakByCourse.set(quiz.course || quiz.title, (weakByCourse.get(quiz.course || quiz.title) || 0) + 1);
    lines.push('## Bu hafta öncelikler');
    if (week.length) lines.push(...week.map(x => `- **${x.course || x.title}**: ${x.title} · ${x.dueDate === t.date ? 'bugün' : `${daysBetween(t.date, x.dueDate)} gün sonra`}`));
    if (weakByCourse.size) lines.push('', '**Quiz sonuçlarına göre tekrar et:**', ...[...weakByCourse.keys()].map(c => `- ${c}`));
    if (!week.length && !weakByCourse.size) lines.push('- Bu hafta teslim ya da sınav görünmüyor. Flashcard tekrarlarına ve yeni konulara odaklanabilirsin.');
    return lines.join('\n');
  }
  lines.push(`## Bugün (${DAYS[weekday(new Date())]})`);
  if (t.lessons.length) lines.push('**Dersler**', ...t.lessons.map(l => `- ${l.start}–${l.end} ${l.title}${l.room ? ` (${l.room})` : ''}`));
  if (t.overdue.length) lines.push('', '**Gecikenler**', ...t.overdue.map(x => `- ${x.title}${x.course ? ` · ${x.course}` : ''}`));
  if (t.tasksToday.length) lines.push('', '**Bugün teslim**', ...t.tasksToday.map(x => `- ${x.dueTime ? x.dueTime + ' ' : ''}${x.title}`));
  if (t.planItems.length) lines.push('', '**Çalışma planından**', ...t.planItems.map(p => `- ${p.item.topic} · ${p.item.minutes} dk${p.item.done ? ' ✓' : ''}`));
  if (t.dueCards) lines.push('', `**${t.dueCards} flashcard** tekrar zamanı geldi (~${Math.max(5, Math.round(t.dueCards * 0.4))} dk).`);
  if (t.upcomingExam) lines.push('', `**Yaklaşan sınav:** ${t.upcomingExam.title} · ${t.upcomingExam.daysLeft} gün kaldı.`);
  lines.push('', `Çalışma hedefi: **${t.focusMinutes} / ${t.goalMinutes} dk**.`);
  return lines.join('\n');
}
