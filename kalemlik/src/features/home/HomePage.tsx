// 🏠 Ana Sayfa: selamlama, Bugün özeti, bugünkü plan, çalışma hedefi, yaklaşan sınav, Kalemlik AI, hızlı ekle,
// seviye ve kaldığın defterler. Veriler cihazdaki kayıtlardan hesaplanır (çevrimdışı da çalışır).
import {useMemo} from 'react';
import {BookOpen, ChevronRight, Trophy} from 'lucide-react';
import {linkProps} from '@/app/router';
import {useSession} from '@/app/session';
import {useList} from '@/lib/store';
import {timeAgo} from '@/lib/format';
import {AiCard, ExamCard, QuickAddCard, StudyGoalCard, TodayPlanCard, TodayStats, useToday} from './cards';
import {levelPercent, useProgress} from '@/features/profile/progress';

export function greeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return 'Günaydın';
  if (hour >= 12 && hour < 18) return 'İyi günler';
  if (hour >= 18 && hour < 23) return 'İyi akşamlar';
  return 'İyi geceler';
}

export function HomePage() {
  const {user} = useSession();
  const t = useToday();
  const progress = useProgress();
  const notebooks = useList('notebook');
  const recent = useMemo(() => notebooks.filter(n => n.trashedAt === null).sort((a, b) => (b.lastOpenedAt || b.updatedAt) - (a.lastOpenedAt || a.updatedAt)).slice(0, 4), [notebooks]);
  const first = user?.name.split(' ')[0] || '';
  const summary = [t.lessons.length ? `${t.lessons.length} dersin` : '', t.tasksToday.length ? `${t.tasksToday.length} teslimin` : '', t.overdue.length ? `${t.overdue.length} geciken görevin` : ''].filter(Boolean);
  return (
    <div className="page home-page">
      <header className="home-head">
        <div>
          <h1>{greeting()}{first ? `, ${first}` : ''} 👋</h1>
          <p className="muted">{summary.length ? `Bugün ${summary.join(', ')} var.` : 'Bugün için planlanmış bir şey yok; güzel bir çalışma günü!'}</p>
        </div>
        {progress && (
          <a {...linkProps('/profil')} className="level-chip" aria-label={`Seviye ${progress.level}, ${progress.xp} XP. Profili aç`}>
            <Trophy size={18} />
            <span><strong>Seviye {progress.level}</strong><span className="muted small">{progress.xp} XP</span></span>
            <span className="level-ring" style={{'--p': `${levelPercent(progress)}%`} as React.CSSProperties} aria-hidden />
          </a>
        )}
      </header>
      <section aria-label="Bugün">
        <h2 className="section-kicker">Bugün</h2>
        <TodayStats t={t} />
      </section>
      <div className="home-grid">
        <TodayPlanCard t={t} />
        <StudyGoalCard t={t} />
        <ExamCard t={t} />
        <AiCard />
        <QuickAddCard />
        <section className="card card-pad home-card">
          <h2 className="home-card-title"><BookOpen size={18} /> Kaldığın yerden devam et</h2>
          {recent.length ? (
            <div className="recent-list">
              {recent.map(n => (
                <a key={n.id} {...linkProps(`/defter/${n.id}`)} className="recent-row">
                  <span className="nb-swatch" style={{background: n.color}} />
                  <span className="list-row-main"><strong>{n.title}</strong><span className="muted small">{n.course || 'Ders yok'} · {timeAgo(n.lastOpenedAt || n.updatedAt)}</span></span>
                  <ChevronRight size={16} />
                </a>
              ))}
            </div>
          ) : <p className="muted small">Henüz defterin yok. “Hızlı ekle”den ilk notunu oluştur ya da <a {...linkProps('/sablonlar')}>Şablonlar</a>’dan başla.</p>}
        </section>
      </div>
    </div>
  );
}
