// 👤 Profil: seviye, XP, seri, rozetler, XP kazanma yolları ve kısa istatistikler. XP sunucuda hesaplanır.
import {useMemo} from 'react';
import {Award, Flame, HardDrive, Settings, Sparkles, Trophy, UserRound} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate} from '@/app/router';
import {useSession} from '@/app/session';
import {Button, ProgressBar} from '@/components/ui';
import {useList} from '@/lib/store';
import {usePlan} from '@/lib/plan';
import {formatDate, isoDate, timeAgo} from '@/lib/format';
import {levelPercent, useProgress} from './progress';

export function ProfilePage() {
  const {user} = useSession();
  const plan = usePlan();
  const p = useProgress();
  const notebooks = useList('notebook'), tasks = useList('task'), focus = useList('focus'), cards = useList('card'), quizzes = useList('quiz');
  const stats = useMemo(() => [
    {label: 'Defter', value: notebooks.filter(n => n.trashedAt === null).length},
    {label: 'Tamamlanan görev', value: tasks.filter(t => t.done).length},
    {label: 'Odak (saat)', value: Math.round(focus.reduce((n, f) => n + f.focusedSeconds, 0) / 360) / 10},
    {label: 'Çalışılan kart', value: cards.filter(c => c.lastReviewAt).length},
    {label: 'Çözülen quiz', value: quizzes.filter(q => q.completedAt).length},
  ], [notebooks, tasks, focus, cards, quizzes]);
  const earned = p ? p.badges.filter(b => b.earnedAt).length : 0;
  return (
    <div className="page page-narrow profile-page">
      <PageHeader title="Profil" actions={<>
        <Button size="sm" icon={<UserRound size={16} />} onClick={() => navigate('/hesap')}>Hesap</Button>
        <Button size="sm" variant="ghost" icon={<Settings size={16} />} onClick={() => navigate('/ayarlar')}>Ayarlar</Button>
      </>} />
      <section className="card card-pad profile-hero">
        <span className="avatar avatar-lg">{user?.name.slice(0, 1).toLocaleUpperCase('tr')}</span>
        <div className="profile-hero-main">
          <h2>{user?.name}</h2>
          <p className="muted small">{user?.email}{plan ? ` · ${plan.plan.name} planı` : ''}</p>
          {p ? <>
            <div className="row wrap level-line"><Trophy size={18} /><strong>Seviye {p.level}</strong><span className="muted small">{p.xp} XP · sonraki seviyeye {p.next - p.xp} XP</span></div>
            <ProgressBar value={levelPercent(p)} max={100} label={`Seviye ilerlemesi %${levelPercent(p)}`} />
            <div className="row wrap profile-chips">
              <span className="chip"><Sparkles size={15} /> Bugün +{p.today} XP</span>
              <span className="chip"><Flame size={15} /> {p.streak} gün seri</span>
              <span className="chip"><Award size={15} /> {earned} / {p.badges.length} rozet</span>
            </div>
          </> : <p className="muted small">{navigator.onLine ? 'Seviye bilgisi yükleniyor…' : 'Seviye bilgisi için internet bağlantısı gerekiyor.'}</p>}
        </div>
      </section>

      {p && <section className="stack-tight">
        <h2 className="group-title"><Award size={17} /> Rozetler</h2>
        <div className="badge-grid">
          {p.badges.map(b => (
            <div key={b.id} className={`badge-tile ${b.earnedAt ? 'is-earned' : ''}`} title={b.desc}>
              <span className="badge-icon" aria-hidden>{b.icon}</span>
              <strong>{b.name}</strong>
              <span className="muted small">{b.earnedAt ? formatDate(isoDate(new Date(b.earnedAt))) : b.desc}</span>
            </div>
          ))}
        </div>
      </section>}

      <section className="stack-tight">
        <h2 className="group-title">İstatistikler</h2>
        <div className="profile-stats">{stats.map(s => <div key={s.label} className="card profile-stat"><strong>{s.value}</strong><span className="muted small">{s.label}</span></div>)}</div>
      </section>

      {p && <div className="profile-cols">
        <section className="card card-pad stack-tight">
          <h2 className="group-title">XP nasıl kazanılır?</h2>
          <ul className="xp-rules">{p.rules.map(r => <li key={r.reason}><span>{r.label}</span><strong>+{r.amount} XP</strong></li>)}</ul>
          <p className="muted small">XP’yi sunucu hesaplar; her iş bir kez sayılır ve her türün günlük bir sınırı vardır.</p>
        </section>
        <section className="card card-pad stack-tight">
          <h2 className="group-title">Son kazanımlar</h2>
          {p.recent.length ? <ul className="xp-rules">{p.recent.map((r, i) => <li key={i}><span>{r.label}<span className="muted small"> · {timeAgo(r.at)}</span></span><strong>+{r.amount}</strong></li>)}</ul>
            : <p className="muted small">Henüz XP yok. Bir not oluştur ya da bir görevi tamamla: ilk rozetin seni bekliyor!</p>}
        </section>
      </div>}
      <Button variant="ghost" icon={<HardDrive size={16} />} onClick={() => navigate('/plan')}>Plan & Depolama</Button>
    </div>
  );
}
