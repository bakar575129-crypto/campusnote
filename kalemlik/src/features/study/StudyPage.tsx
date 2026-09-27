// 🧠 Çalışma: flashcard desteleri, quizler ve sınav çalışma planları tek yerde.
import {useState} from 'react';
import {Brain, CalendarRange, Layers, Plus, Target, Timer, WandSparkles, Trophy} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {linkProps, navigate, useLocation} from '@/app/router';
import {Badge, Button, EmptyState, ProgressBar, Segmented} from '@/components/ui';
import {useList} from '@/lib/store';
import {formatDate, relativeDay, todayIso} from '@/lib/format';
import {deckProgress} from './srs';
import {openGenerate} from './GenerateDialog';
import {PlanDialog} from './PlanPage';
import {createDeck} from './actions';

type Tab = 'cards' | 'quiz' | 'plans';

export function StudyPage() {
  const {query} = useLocation();
  const [tab, setTab] = useState<Tab>((['cards', 'quiz', 'plans'] as Tab[]).includes(query.get('bolum') as Tab) ? query.get('bolum') as Tab : 'cards');
  const decks = useList('deck');
  const cards = useList('card');
  const quizzes = useList('quiz');
  const plans = useList('studyPlan');
  const [planOpen, setPlanOpen] = useState(!!query.get('sinav'));
  const dueTotal = cards.filter(c => c.due <= Date.now()).length;
  const done = quizzes.filter(q => q.result);
  const avg = done.length ? Math.round(done.reduce((n, q) => n + q.result!.percent, 0) / done.length) : 0;
  const today = todayIso();
  const activePlans = plans.filter(p => !p.completedAt && p.examDate >= today);
  const todayItems = activePlans.flatMap(p => p.items.filter(i => i.date === today && !i.done).map(i => ({p, i})));

  return (
    <div className="page">
      <PageHeader title="Çalışma" subtitle="Flashcard, quiz ve sınav çalışma planları" actions={<>
        <Button icon={<Timer size={18} />} onClick={() => navigate('/odak')}>Odaklan</Button>
        {tab === 'cards' && <Button variant="primary" icon={<WandSparkles size={18} />} onClick={() => openGenerate({kind: 'flashcards'})}>Flashcard oluştur</Button>}
        {tab === 'quiz' && <Button variant="primary" icon={<Target size={18} />} onClick={() => openGenerate({kind: 'quiz'})}>Quiz oluştur</Button>}
        {tab === 'plans' && <Button variant="primary" icon={<CalendarRange size={18} />} onClick={() => setPlanOpen(true)}>Çalışma planı oluştur</Button>}
      </>} />

      <div className="stat-tiles">
        <div className="card stat-tile"><span className="stat-icon"><Layers size={20} /></span><div><strong className="stat-num">{dueTotal}</strong><span className="muted small">tekrar zamanı gelen kart</span></div></div>
        <div className="card stat-tile"><span className="stat-icon"><Trophy size={20} /></span><div><strong className="stat-num">{done.length ? `%${avg}` : '—'}</strong><span className="muted small">quiz ortalaması ({done.length})</span></div></div>
        <div className="card stat-tile"><span className="stat-icon"><CalendarRange size={20} /></span><div><strong className="stat-num">{todayItems.length}</strong><span className="muted small">bugünkü plan görevi</span></div></div>
      </div>

      <div className="toolbar-row">
        <Segmented label="Bölüm" value={tab} onChange={setTab} options={[{value: 'cards', label: <><Layers size={16} />Flashcard</>}, {value: 'quiz', label: <><Target size={16} />Quiz</>}, {value: 'plans', label: <><CalendarRange size={16} />Planlar</>}]} />
      </div>

      {tab === 'cards' && (decks.length ? (
        <div className="learn-grid">
          {decks.sort((a, b) => b.updatedAt - a.updatedAt).map(d => {
            const pr = deckProgress(cards.filter(c => c.deckId === d.id));
            return (
              <a key={d.id} {...linkProps(`/calisma/deste/${d.id}`)} className="card learn-card" style={{'--c': d.color} as React.CSSProperties}>
                <span className="learn-card-top"><Layers size={18} /><span className="learn-card-title">{d.title}</span>{pr.due > 0 && <Badge tone="accent">{pr.due} tekrar</Badge>}</span>
                <span className="muted small">{d.course || 'Ders yok'} · {pr.total} kart</span>
                <ProgressBar value={pr.percent} max={100} label={`İlerleme %${pr.percent}`} />
                <span className="muted small">İlerleme %{pr.percent} · {pr.mastered} kart kalıcı</span>
              </a>
            );
          })}
          <button type="button" className="card learn-card learn-card-new" onClick={() => { const d = createDeck({title: 'Yeni deste', course: ''}); navigate(`/calisma/deste/${d.id}?duzenle=1`); }}><Plus size={22} /> Boş deste</button>
        </div>
      ) : (
        <EmptyState icon={<Brain size={28} />} title="Henüz flashcard yok" action={<Button variant="primary" icon={<WandSparkles size={18} />} onClick={() => openGenerate({kind: 'flashcards'})}>Notlarından flashcard oluştur</Button>}>
          Defterinden, PDF’inden ya da ders kaydından kartlar oluştur; aralıklı tekrar sistemi hangi kartı ne zaman çalışman gerektiğini hatırlar.
        </EmptyState>
      ))}

      {tab === 'quiz' && (quizzes.length ? (
        <div className="list-stack">
          {quizzes.sort((a, b) => (b.completedAt || b.createdAt) - (a.completedAt || a.createdAt)).map(q => (
            <a key={q.id} {...linkProps(`/calisma/quiz/${q.id}`)} className="card list-row">
              <span className="stat-icon"><Target size={18} /></span>
              <span className="list-row-main"><strong>{q.title}</strong><span className="muted small">{q.course || 'Ders yok'} · {q.questions.length} soru · {q.completedAt ? formatDate(new Date(q.completedAt).toISOString().slice(0, 10)) : 'çözülmedi'}</span></span>
              {q.result ? <Badge tone={q.result.percent >= 70 ? 'success' : q.result.percent >= 50 ? 'warning' : 'danger'}>%{Math.round(q.result.percent)}</Badge> : <Badge tone="accent">Başla</Badge>}
            </a>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Target size={28} />} title="Quiz geçmişin boş" action={<Button variant="primary" icon={<Target size={18} />} onClick={() => openGenerate({kind: 'quiz'})}>Quiz oluştur</Button>}>
          Notlarından, PDF’lerinden ya da flashcardlarından kolay, orta, zor ya da karışık quizler hazırla; sonuçların ve yanlış yaptığın konular kaydedilir.
        </EmptyState>
      ))}

      {tab === 'plans' && (plans.length ? (
        <div className="list-stack">
          {plans.sort((a, b) => a.examDate.localeCompare(b.examDate)).map(p => {
            const doneN = p.items.filter(i => i.done).length;
            return (
              <a key={p.id} {...linkProps(`/calisma/plan/${p.id}`)} className="card list-row">
                <span className="stat-icon"><CalendarRange size={18} /></span>
                <span className="list-row-main"><strong>{p.title}</strong><span className="muted small">{p.course && `${p.course} · `}Sınav {formatDate(p.examDate)} · {doneN}/{p.items.length} görev</span>
                  <ProgressBar value={doneN} max={Math.max(1, p.items.length)} label="Plan ilerlemesi" /></span>
                {p.completedAt ? <Badge tone="success">Tamamlandı</Badge> : p.examDate < today ? <Badge>Geçti</Badge> : <Badge tone="accent">{relativeDay(p.examDate)}</Badge>}
              </a>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<CalendarRange size={28} />} title="Çalışma planın yok" action={<Button variant="primary" icon={<CalendarRange size={18} />} onClick={() => setPlanOpen(true)}>Sınavım için plan oluştur</Button>}>
          Sınavını seç; notların, flashcardların, quiz sonuçların ve çalışma geçmişine göre gün gün plan hazırlansın. Görevler takvimine eklenir.
        </EmptyState>
      ))}
      {planOpen && <PlanDialog examTaskId={query.get('sinav') || undefined} onClose={() => setPlanOpen(false)} />}
    </div>
  );
}
