// 📚 Dersler: ders programı, defterler, görevler/sınavlar, flashcard desteleri, ders kayıtları ve notlar derse göre
// tek yerde. Ders adı hangi bölümde yazıldıysa (program, defter, görev, not hesaplama…) aynı ders sayılır.
import {useMemo} from 'react';
import {BookOpen, Brain, CalendarClock, GraduationCap, ListChecks, Mic, NotebookPen, Plus} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {linkProps, navigate} from '@/app/router';
import {Button, EmptyState} from '@/components/ui';
import {useList} from '@/lib/store';
import {useSettings} from '@/lib/settings';
import {DAYS_SHORT, daysBetween, isoDate} from '@/lib/format';
import {courseAverage, letterFor} from '@/features/grades/grades';

const key = (s: string) => s.trim().toLocaleLowerCase('tr');

export function CoursesPage() {
  const lessons = useList('lesson'), notebooks = useList('notebook'), tasks = useList('task'), decks = useList('deck'), cards = useList('card');
  const recordings = useList('recording'), grades = useList('gradeCourse');
  const settings = useSettings();
  const courses = useMemo(() => {
    const today = isoDate(new Date());
    const map = new Map<string, {name: string; color: string}>();
    const add = (name: string, color?: string) => { const k = key(name); if (!k) return; const cur = map.get(k); if (!cur) map.set(k, {name: name.trim(), color: color || '#3a6ff7'}); else if (color && cur.color === '#3a6ff7') cur.color = color; };
    for (const l of lessons) add(l.title, l.color);
    for (const n of notebooks) if (n.trashedAt === null) add(n.course, n.color);
    for (const t of tasks) add(t.course, t.color);
    for (const d of decks) add(d.course, d.color);
    for (const g of grades) add(g.name);
    for (const r of recordings) add(r.course);
    return [...map.entries()].map(([k, c]) => {
      const nbs = notebooks.filter(n => n.trashedAt === null && key(n.course) === k).sort((a, b) => b.updatedAt - a.updatedAt);
      const open = tasks.filter(t => key(t.course) === k && !t.done).sort((a, b) => (a.dueDate || '9').localeCompare(b.dueDate || '9'));
      const exam = open.find(t => t.category === 'exam' && t.dueDate >= today);
      const deckIds = new Set(decks.filter(d => key(d.course) === k).map(d => d.id));
      const due = cards.filter(x => deckIds.has(x.deckId) && x.due <= Date.now()).length;
      const grade = grades.find(g => key(g.name) === k);
      const avg = grade ? courseAverage(grade, settings.gradeRounding).avg : null;
      return {
        ...c, key: k, notebooks: nbs, open, exam, examDays: exam ? daysBetween(today, exam.dueDate) : null, decks: deckIds.size, due,
        lessons: lessons.filter(l => key(l.title) === k).sort((a, b) => a.day - b.day || a.start.localeCompare(b.start)),
        recordings: recordings.filter(r => key(r.course) === k).length,
        grade: avg !== null ? `${avg} · ${letterFor(avg, settings.gradeScale)}` : grade ? 'Not girilmedi' : '',
      };
    }).sort((a, b) => (a.examDays ?? 999) - (b.examDays ?? 999) || a.name.localeCompare(b.name, 'tr'));
  }, [lessons, notebooks, tasks, decks, cards, recordings, grades, settings]);

  return (
    <div className="page">
      <PageHeader title="Dersler" subtitle="Her dersin programı, defterleri, görevleri, kartları, kayıtları ve notları bir arada"
        actions={<Button icon={<CalendarClock size={17} />} onClick={() => navigate('/program')}>Ders programı</Button>} />
      {courses.length ? (
        <div className="course-grid">
          {courses.map(c => (
            <article key={c.key} className="card course-card" style={{'--c': c.color} as React.CSSProperties}>
              <header className="course-head"><span className="nb-swatch" style={{background: c.color}} /><h2>{c.name}</h2>
                {c.exam && <span className={`course-exam ${c.examDays! <= 7 ? 'is-soon' : ''}`}><GraduationCap size={14} /> {c.examDays === 0 ? 'Sınav bugün' : `Sınava ${c.examDays} gün`}</span>}
              </header>
              {c.lessons.length > 0 && <p className="muted small course-times"><CalendarClock size={14} /> {c.lessons.map(l => `${DAYS_SHORT[l.day]} ${l.start}${l.room ? ` (${l.room})` : ''}`).join(' · ')}</p>}
              <div className="course-stats">
                <span><BookOpen size={15} /> {c.notebooks.length} defter</span>
                <span><ListChecks size={15} /> {c.open.length} açık görev</span>
                <span><Brain size={15} /> {c.decks} deste{c.due ? ` · ${c.due} tekrar` : ''}</span>
                <span><Mic size={15} /> {c.recordings} kayıt</span>
                {c.grade && <span><GraduationCap size={15} /> {c.grade}</span>}
              </div>
              {c.notebooks.length > 0 && <div className="course-links">{c.notebooks.slice(0, 3).map(n => <a key={n.id} {...linkProps(`/defter/${n.id}`)} className="course-link"><NotebookPen size={14} /> {n.title}</a>)}</div>}
              {c.open[0] && <p className="small course-next"><strong>Sıradaki:</strong> {c.open[0].title}{c.open[0].dueDate ? ` · ${c.open[0].dueDate.split('-').reverse().join('.')}` : ''}</p>}
            </article>
          ))}
        </div>
      ) : (
        <EmptyState icon={<BookOpen size={28} />} title="Henüz ders yok" action={<Button variant="primary" icon={<Plus size={17} />} onClick={() => navigate('/program')}>Ders programına ders ekle</Button>}>
          Ders programına ders eklediğinde ya da defterlerine ders adı yazdığında dersler burada toplanır.
        </EmptyState>
      )}
    </div>
  );
}
