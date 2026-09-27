// Akıllı bildirimler: cihazdaki verilerden hesaplanır (internet gerekmez). Türler ayrı ayrı açılıp kapatılabilir.
//  • Sınav: "Sınavına 7 gün kaldı."        • Ödev: "Matematik ödevinin teslimine 2 gün kaldı."
//  • Çalışma: "Bugünkü 90 dakikalık çalışma hedefin henüz tamamlanmadı."
//  • Flashcard: "12 flashcard tekrar zamanı geldi."   • Seri: "5 gündür düzenli çalışıyorsun 🔥"
//  • AI önerisi: "Son quiz sonuçlarına göre bugün Türev tekrar etmen faydalı olabilir."
import {list} from '@/lib/store';
import {getSettings, updateSettings} from '@/lib/settings';
import {daysBetween, isoDate} from '@/lib/format';
import type {NotificationPrefs} from '@/lib/types';
import {computeToday} from '@/features/study/today';

export type NoticeType = 'exam' | 'homework' | 'study' | 'flashcard' | 'streak' | 'ai';
export interface Notice {id: string; type: NoticeType; title: string; body: string; link: string; urgent?: boolean}

export const NOTICE_LABELS: Record<NoticeType, string> = {exam: 'Sınav hatırlatmaları', homework: 'Ödev teslimleri', study: 'Günlük çalışma hedefi', flashcard: 'Flashcard tekrarları', streak: 'Çalışma serisi', ai: 'Kalemlik AI önerileri'};

export function computeNotifications(now = new Date(), prefs: NotificationPrefs = getSettings().notifications): Notice[] {
  const out: Notice[] = [];
  const date = isoDate(now);
  const t = computeToday(now);
  const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  if (prefs.exam) {
    for (const e of t.exams) {
      if (e.daysLeft === 0) out.push({id: `exam:${e.id}:0`, type: 'exam', title: `Bugün sınavın var: ${e.title}`, body: `${e.course || ''}${e.dueTime ? ` · ${e.dueTime}` : ''} Başarılar! 🍀`.trim(), link: '/gorevler', urgent: true});
      else if (prefs.examDays.includes(e.daysLeft)) out.push({id: `exam:${e.id}:${e.daysLeft}`, type: 'exam', title: `Sınavına ${e.daysLeft} gün kaldı.`, body: `${e.title}${e.course && !e.title.includes(e.course) ? ` · ${e.course}` : ''}`, link: plansFor(e.id) || '/gorevler', urgent: e.daysLeft <= 1});
    }
  }
  if (prefs.homework) {
    for (const h of list('task').filter(x => !x.done && x.category === 'homework')) {
      const d = daysBetween(date, h.dueDate);
      const name = h.course ? `${h.course} ödevinin` : `"${h.title}" ödevinin`;
      if (d < 0 && d >= -3) out.push({id: `hw:${h.id}:late`, type: 'homework', title: `${name.replace(/ödevinin$/, 'ödevi')} gecikti.`, body: h.title, link: '/gorevler', urgent: true});
      else if (d === 0) out.push({id: `hw:${h.id}:0`, type: 'homework', title: `${name.replace(/ödevinin$/, 'ödevi')} bugün teslim.`, body: `${h.title}${h.dueTime ? ` · ${h.dueTime}` : ''}`, link: '/gorevler', urgent: true});
      else if (d > 0 && d <= prefs.homeworkDays) out.push({id: `hw:${h.id}:${d}`, type: 'homework', title: `${name} teslimine ${d} gün kaldı.`, body: h.title, link: '/gorevler'});
    }
  }
  if (prefs.study && nowHm >= prefs.studyTime && t.focusMinutes < t.goalMinutes) {
    out.push({id: `study:${date}`, type: 'study', title: `Bugünkü ${t.goalMinutes} dakikalık çalışma hedefin henüz tamamlanmadı.`, body: `Şu ana kadar ${t.focusMinutes} dk çalıştın. Kısa bir odak oturumu başlat.`, link: '/odak'});
  }
  if (prefs.flashcard && t.dueCards >= 5) out.push({id: `cards:${date}`, type: 'flashcard', title: `${t.dueCards} flashcard tekrar zamanı geldi.`, body: 'Birkaç dakikalık tekrar hafızanı tazeler.', link: '/calisma'});
  if (prefs.streak && t.streak >= 3) out.push({id: `streak:${date}:${t.streak}`, type: 'streak', title: `${t.streak} gündür düzenli çalışıyorsun 🔥`, body: 'Seriyi bozma; bugün de biraz çalış.', link: '/calisma'});
  if (prefs.ai) {
    const recent = list('quiz').filter(q => q.result && q.completedAt && Date.now() - q.completedAt < 7 * 86400000 && q.result.weakTopics.length).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0))[0];
    if (recent) {
      const topic = recent.result!.weakTopics.find(w => w !== 'Genel') || recent.result!.weakTopics[0];
      out.push({id: `ai:${date}:${recent.id}`, type: 'ai', title: `Son quiz sonuçlarına göre bugün ${topic === 'Genel' ? `"${recent.title}"` : topic} tekrar etmen faydalı olabilir.`, body: `${recent.title}: %${Math.round(recent.result!.percent)}`, link: `/calisma/quiz/${recent.id}`});
    }
  }
  const dismissed = new Set(getSettings().notifDismissed);
  return out.filter(n => !dismissed.has(n.id));
}

function plansFor(examId: string) {
  const p = list('studyPlan').find(x => x.examTaskId === examId);
  return p ? `/calisma/plan/${p.id}` : '';
}

export function dismissNotice(...ids: string[]) {
  const cur = getSettings().notifDismissed;
  updateSettings({notifDismissed: [...cur, ...ids.filter(i => !cur.includes(i))].slice(-300)});
}

// ---------------------------------------------------------------- tarayıcı / telefon bildirimi
const SHOWN = 'klm:notified';
function shown(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(SHOWN) || '[]')); } catch { return new Set(); } }
function remember(ids: Set<string>) { try { localStorage.setItem(SHOWN, JSON.stringify([...ids].slice(-300))); } catch { /* özel pencere */ } }

export const browserNotifySupported = () => typeof Notification !== 'undefined';

export async function requestBrowserPermission(): Promise<boolean> {
  if (!browserNotifySupported()) return false;
  const p = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  return p === 'granted';
}

/** Açık uygulamada her dakika kontrol: yeni bildirimler sistem bildirimi olarak da gösterilir (bir kez). */
export function startBrowserNotifier() {
  const tick = async () => {
    const prefs = getSettings().notifications;
    if (!prefs.browser || !browserNotifySupported() || Notification.permission !== 'granted') return;
    const seen = shown();
    const fresh = computeNotifications().filter(n => !seen.has(n.id)).slice(0, 3);
    if (!fresh.length) return;
    const reg = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
    for (const n of fresh) {
      const opts = {body: n.body, tag: n.id, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: {link: n.link}};
      try { if (reg) await reg.showNotification(n.title, opts); else new Notification(n.title, opts); } catch { /* izin geri alınmış */ }
      seen.add(n.id);
    }
    remember(seen);
  };
  const timer = setInterval(() => void tick(), 60_000);
  setTimeout(() => void tick(), 5_000);
  // Telefona yüklü uygulamada (destekleyen tarayıcılarda) arka planda günlük kontrol.
  void navigator.serviceWorker?.ready.then(reg => {
    const p = (reg as ServiceWorkerRegistration & {periodicSync?: {register: (tag: string, o: {minInterval: number}) => Promise<void>}}).periodicSync;
    if (p && getSettings().notifications.browser) p.register('kalemlik-hatirlatma', {minInterval: 12 * 3600_000}).catch(() => {});
  }).catch(() => {});
  return () => clearInterval(timer);
}
