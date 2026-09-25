import {useState} from 'react';
import {ChevronLeft, ChevronRight, Plus} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {Button, IconButton} from '@/components/ui';
import {useList} from '@/lib/store';
import {addDays, DAYS, DAYS_SHORT, formatDate, isoDate, MONTHS, parseIso, todayIso, weekday} from '@/lib/format';
import {newTask, TaskDialog, TaskRow} from './TasksPage';
import {LessonDialog} from './SchedulePage';
import type {Lesson, Task} from '@/lib/types';

/** Ay görünümü: ödev/sınav/yapılacaklar ve haftalık dersler; güne dokununca ayrıntılar. */
export function CalendarPage() {
  const tasks = useList('task');
  const lessons = useList('lesson');
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selected, setSelected] = useState(todayIso());
  const [taskDraft, setTaskDraft] = useState<Omit<Task, 'rev' | 'createdAt' | 'updatedAt'> | null>(null);
  const [lessonDraft, setLessonDraft] = useState<Lesson | null>(null);

  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = addDays(first, -weekday(first));
  const cells = Array.from({length: 42}, (_, i) => addDays(start, i));
  const weeks = cells[35].getMonth() !== cursor.getMonth() ? cells.slice(0, 35) : cells;
  const byDate = new Map<string, Task[]>();
  for (const t of tasks) { const l = byDate.get(t.dueDate) || []; l.push(t); byDate.set(t.dueDate, l); }
  const today = todayIso();
  const move = (n: number) => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1));
  const selDate = parseIso(selected);
  const dayTasks = (byDate.get(selected) || []).sort((a, b) => Number(a.done) - Number(b.done) || (a.dueTime || '99').localeCompare(b.dueTime || '99'));
  const dayLessons = lessons.filter(l => l.day === weekday(selDate)).sort((a, b) => a.start.localeCompare(b.start));
  const exams = tasks.filter(t => t.category === 'exam' && !t.done && t.dueDate.startsWith(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}`)).length;

  return (
    <div className="page page-wide">
      <PageHeader title="Takvim" subtitle={exams ? `${MONTHS[cursor.getMonth()]} ayında ${exams} sınav` : undefined} actions={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setTaskDraft(newTask(selected))}>Bu güne ekle</Button>} />
      <div className="calendar-layout">
        <div className="card calendar">
          <div className="calendar-head">
            <IconButton label="Önceki ay" onClick={() => move(-1)}><ChevronLeft size={20} /></IconButton>
            <h2>{MONTHS[cursor.getMonth()]} {cursor.getFullYear()}</h2>
            <IconButton label="Sonraki ay" onClick={() => move(1)}><ChevronRight size={20} /></IconButton>
            <span className="spacer" />
            <Button size="sm" variant="ghost" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); setSelected(todayIso()); }}>Bugün</Button>
          </div>
          <div className="calendar-grid" role="grid" aria-label={`${MONTHS[cursor.getMonth()]} ${cursor.getFullYear()}`}>
            {DAYS_SHORT.map(d => <div key={d} className="calendar-dow" role="columnheader">{d}</div>)}
            {weeks.map(d => {
              const iso = isoDate(d);
              const items = byDate.get(iso) || [];
              const lessonCount = lessons.filter(l => l.day === weekday(d)).length;
              return (
                <button key={iso} type="button" role="gridcell" aria-selected={iso === selected} className={`calendar-cell ${d.getMonth() !== cursor.getMonth() ? 'is-out' : ''} ${iso === today ? 'is-today' : ''} ${iso === selected ? 'is-selected' : ''}`}
                  onClick={() => setSelected(iso)} onDoubleClick={() => setTaskDraft(newTask(iso))} aria-label={`${formatDate(iso)}${items.length ? `, ${items.length} kayıt` : ''}`}>
                  <span className="calendar-num">{d.getDate()}</span>
                  <span className="calendar-items">
                    {items.slice(0, 3).map(t => <span key={t.id} className={`calendar-chip ${t.done ? 'is-done' : ''} chip-${t.category}`} style={{'--c': t.color} as React.CSSProperties}>{t.title}</span>)}
                    {items.length > 3 && <span className="calendar-more">+{items.length - 3}</span>}
                  </span>
                  {lessonCount > 0 && <span className="calendar-dots" aria-hidden>{Array.from({length: Math.min(lessonCount, 4)}).map((_, i) => <i key={i} />)}</span>}
                </button>
              );
            })}
          </div>
          <p className="muted small calendar-legend"><i className="dot" /> ders günü · çift tıklayarak o güne kayıt ekle</p>
        </div>
        <aside className="card card-pad calendar-day">
          <h2>{selDate.getDate()} {MONTHS[selDate.getMonth()]}</h2>
          <p className="muted">{DAYS[weekday(selDate)]}</p>
          <h3 className="section-title">Dersler</h3>
          {dayLessons.length ? dayLessons.map(l => (
            <button key={l.id} type="button" className="mini-lesson" style={{'--c': l.color} as React.CSSProperties} onClick={() => setLessonDraft(l)}>
              <b>{l.start}–{l.end}</b><span>{l.title}</span>{l.room && <small>{l.room}</small>}
            </button>
          )) : <p className="muted small">Ders yok.</p>}
          <h3 className="section-title">Ödevler, sınavlar, yapılacaklar</h3>
          <div className="task-list">{dayTasks.map(t => <TaskRow key={t.id} t={t} onOpen={() => setTaskDraft(t)} />)}</div>
          {!dayTasks.length && <p className="muted small">Kayıt yok.</p>}
          <Button icon={<Plus size={17} />} onClick={() => setTaskDraft(newTask(selected))}>Kayıt ekle</Button>
        </aside>
      </div>
      <TaskDialog draft={taskDraft} onClose={() => setTaskDraft(null)} />
      <LessonDialog draft={lessonDraft} onClose={() => setLessonDraft(null)} />
    </div>
  );
}
