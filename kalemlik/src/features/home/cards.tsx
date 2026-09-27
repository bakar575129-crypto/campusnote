// Ana sayfa ve widget kartları: Bugün, Bugünkü plan, Çalışma hedefi, Yaklaşan sınav, Hızlı ekle, Kalemlik AI.
// Aynı kartlar hem öğrenci panosunda hem /widget sayfasında (telefonda ana ekrana eklenebilir) kullanılır.
import {useEffect, useMemo, useState} from 'react';
import {BookOpen, CalendarClock, CalendarRange, Flame, GraduationCap, ListChecks, NotebookPen, Play, Plus, Sparkles, Timer} from 'lucide-react';
import {navigate} from '@/app/router';
import {Button, ProgressBar} from '@/components/ui';
import {useList} from '@/lib/store';
import {useSettings} from '@/lib/settings';
import {formatDate} from '@/lib/format';
import {computeToday, type TodayInfo} from '@/features/study/today';

/** Bugün özeti; veri değişince ve dakikada bir yenilenir. */
export function useToday(): TodayInfo {
  const deps = [useList('lesson'), useList('task'), useList('focus'), useList('card'), useList('studyPlan'), useList('quiz'), useSettings()];
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60_000); return () => clearInterval(t); }, []);
  return useMemo(() => computeToday(), [...deps, tick]); // eslint-disable-line react-hooks/exhaustive-deps
}

export function TodayStats({t}: {t: TodayInfo}) {
  return (
    <div className="today-stats">
      <button type="button" className="today-stat" onClick={() => navigate('/program')}><BookOpen size={18} /><strong>{t.lessons.length}</strong><span>Ders</span></button>
      <button type="button" className="today-stat" onClick={() => navigate('/gorevler')}><ListChecks size={18} /><strong>{t.tasksToday.length + t.overdue.length}</strong><span>Görev</span></button>
      <button type="button" className="today-stat" onClick={() => navigate('/gorevler')}><GraduationCap size={18} /><strong>{t.upcomingExam ? `${t.upcomingExam.daysLeft} g` : '—'}</strong><span>Sınav</span></button>
      <button type="button" className="today-stat" onClick={() => navigate('/odak')}><Timer size={18} /><strong>{t.focusMinutes} dk</strong><span>Çalışma</span></button>
      <button type="button" className="today-stat" onClick={() => navigate('/calisma')}><Flame size={18} /><strong>{t.streak}</strong><span>Gün seri</span></button>
    </div>
  );
}

export function TodayPlanCard({t}: {t: TodayInfo}) {
  return (
    <section className="card card-pad home-card">
      <h2 className="home-card-title"><CalendarClock size={18} /> Bugünkü plan</h2>
      {t.agenda.length ? (
        <ul className="agenda">
          {t.agenda.slice(0, 7).map((a, i) => (
            <li key={i} className={a.done ? 'is-done' : ''} style={{'--c': a.color} as React.CSSProperties}>
              <span className="agenda-time">{a.time || (a.kind === 'plan' ? 'Plan' : 'Gün içi')}</span>
              <span className="agenda-title">{a.title}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted small">Bugün ders ya da teslim görünmüyor. Flashcard tekrarı için iyi bir gün!</p>}
      {t.nextLesson && <p className="muted small">Sıradaki ders: <strong>{t.nextLesson.title}</strong> · {t.nextLesson.start}{t.nextLesson.room ? ` · ${t.nextLesson.room}` : ''}</p>}
    </section>
  );
}

export function StudyGoalCard({t}: {t: TodayInfo}) {
  const pct = Math.min(100, Math.round((t.focusMinutes / Math.max(1, t.goalMinutes)) * 100));
  return (
    <section className="card card-pad home-card">
      <h2 className="home-card-title"><Timer size={18} /> Çalışma hedefi</h2>
      <p className="goal-num"><strong>{t.focusMinutes}</strong> / {t.goalMinutes} dakika</p>
      <ProgressBar value={t.focusMinutes} max={t.goalMinutes} label={`Çalışma hedefi %${pct}`} />
      <div className="row wrap">
        <Button variant="primary" icon={<Play size={17} />} onClick={() => navigate('/odak')}>Çalışmaya başla</Button>
        {t.dueCards > 0 && <Button variant="ghost" onClick={() => navigate('/calisma')}>{t.dueCards} kart tekrarı</Button>}
      </div>
    </section>
  );
}

export function ExamCard({t}: {t: TodayInfo}) {
  const plans = useList('studyPlan');
  const exam = t.upcomingExam;
  const plan = exam ? plans.find(p => p.examTaskId === exam.id) : undefined;
  return (
    <section className="card card-pad home-card exam-card">
      <h2 className="home-card-title"><GraduationCap size={18} /> Yaklaşan sınav</h2>
      {exam ? <>
        <p className="exam-title">{exam.title}</p>
        <p className="exam-days"><strong>{exam.daysLeft === 0 ? 'Bugün' : `${exam.daysLeft} gün`}</strong> <span className="muted small">{formatDate(exam.dueDate)}</span></p>
        <Button icon={<CalendarRange size={17} />} onClick={() => navigate(plan ? `/calisma/plan/${plan.id}` : `/calisma?bolum=plans&sinav=${exam.id}`)}>{plan ? 'Çalışma planını gör' : 'Çalışma planı oluştur'}</Button>
      </> : <p className="muted small">Yaklaşan sınav yok. Sınavlarını “Ödevler & Sınavlar”a ekle.</p>}
    </section>
  );
}

export function QuickAddCard() {
  return (
    <section className="card card-pad home-card">
      <h2 className="home-card-title"><Plus size={18} /> Hızlı ekle</h2>
      <div className="quick-grid">
        <button type="button" className="quick-btn" onClick={() => navigate('/defterler?yeni=1')}><BookOpen size={20} />Yeni not</button>
        <button type="button" className="quick-btn" onClick={() => navigate('/gorevler?yeni=1')}><ListChecks size={20} />Yeni görev</button>
        <button type="button" className="quick-btn" onClick={() => navigate('/gunluk?yeni=1')}><NotebookPen size={20} />Yeni günlük</button>
        <button type="button" className="quick-btn is-ai" onClick={() => navigate('/ai')}><Sparkles size={20} />AI</button>
      </div>
    </section>
  );
}

export function AiCard() {
  return (
    <section className="card card-pad home-card ai-home-card">
      <h2 className="home-card-title"><Sparkles size={18} /> Kalemlik AI</h2>
      <p className="ai-home-q">“Bugün ne çalışmalıyım?”</p>
      <Button variant="primary" icon={<Sparkles size={17} />} onClick={() => navigate(`/ai?soru=${encodeURIComponent('Bugün ne çalışmalıyım? Derslerime, sınavlarıma ve quiz sonuçlarıma göre öner.')}`)}>AI’ya sor</Button>
    </section>
  );
}
