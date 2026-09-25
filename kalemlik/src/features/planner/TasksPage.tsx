import {useEffect, useState} from 'react';
import {BookCheck, CheckCircle2, Circle, ClipboardList, GraduationCap, ListChecks, Plus, Trash2} from 'lucide-react';
import type {Task} from '@/lib/types';
import type {TaskCategory} from '@/lib/constants';
import {PALETTE} from '@/lib/constants';
import {PageHeader} from '@/app/Shell';
import {Badge, Button, ColorPicker, Dialog, EmptyState, Field, Segmented} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {list, put, remove, update, useList} from '@/lib/store';
import {uuid} from '@/lib/ids';
import {addDays, daysBetween, formatDate, isoDate, relativeDay, todayIso} from '@/lib/format';

export const CATEGORY: Record<TaskCategory, {label: string; icon: typeof BookCheck}> = {
  homework: {label: 'Ödev', icon: BookCheck},
  exam: {label: 'Sınav', icon: GraduationCap},
  todo: {label: 'Yapılacak', icon: ClipboardList},
};

type Draft = Omit<Task, 'rev' | 'createdAt' | 'updatedAt'>;
export const newTask = (date = isoDate(addDays(new Date(), 1)), category: TaskCategory = 'homework'): Draft => ({id: uuid(), title: '', course: '', description: '', dueDate: date, dueTime: '', category, color: category === 'exam' ? '#d9467a' : category === 'homework' ? '#2f6fed' : '#1f9d7a', done: false, completedAt: null});

export function TaskDialog({draft, onClose}: {draft: Draft | null; onClose: () => void}) {
  const [v, setV] = useState<Draft | null>(draft);
  const [error, setError] = useState('');
  useEffect(() => { setV(draft); setError(''); }, [draft]);
  if (!v) return null;
  const exists = !!list('task').find(t => t.id === v.id);
  const courses = [...new Set([...list('lesson').map(l => l.title), ...list('notebook').map(n => n.course)].filter(Boolean))];
  const save = () => {
    if (!v.title.trim()) { setError('Başlık yaz.'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.dueDate)) { setError('Tarih seç.'); return; }
    put('task', {...v, title: v.title.trim()});
    onClose();
  };
  const lessonColor = (course: string) => list('lesson').find(l => l.title === course)?.color;
  return (
    <Dialog open onClose={onClose} title={exists ? 'Kaydı düzenle' : 'Yeni kayıt'} footer={<>
      {exists && <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={async () => { if (await confirmDialog({title: 'Silinsin mi?', message: `"${v.title}" silinecek.`, confirmLabel: 'Sil', danger: true})) { remove('task', v.id); onClose(); } }}>Sil</Button>}
      <span className="spacer" />
      <Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" onClick={save}>Kaydet</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <div className="field"><label>Tür</label>
          <Segmented label="Tür" value={v.category} onChange={category => setV({...v, category})} options={(Object.keys(CATEGORY) as TaskCategory[]).map(c => {
            const Icon = CATEGORY[c].icon;
            return {value: c, label: <><Icon size={16} />{CATEGORY[c].label}</>};
          })} />
        </div>
        <Field label="Başlık" htmlFor="tk-title" error={error && !v.title.trim() ? error : undefined}><input id="tk-title" className="input" value={v.title} maxLength={160} placeholder={v.category === 'exam' ? 'ör. Fizik II vize' : 'ör. 3. hafta problem seti'} onChange={e => setV({...v, title: e.target.value})} /></Field>
        <Field label="Ders" htmlFor="tk-course"><input id="tk-course" className="input" list="tk-courses" value={v.course} maxLength={120} onChange={e => { const course = e.target.value; setV({...v, course, color: lessonColor(course) || v.color}); }} /></Field>
        <datalist id="tk-courses">{courses.map(c => <option key={c} value={c} />)}</datalist>
        <div className="grid-2">
          <Field label="Tarih" htmlFor="tk-date"><input id="tk-date" className="input" type="date" value={v.dueDate} onChange={e => setV({...v, dueDate: e.target.value})} /></Field>
          <Field label="Saat (isteğe bağlı)" htmlFor="tk-time"><input id="tk-time" className="input" type="time" value={v.dueTime} onChange={e => setV({...v, dueTime: e.target.value})} /></Field>
        </div>
        <Field label="Açıklama" htmlFor="tk-desc"><textarea id="tk-desc" className="textarea" value={v.description} maxLength={5000} onChange={e => setV({...v, description: e.target.value})} placeholder="Konular, teslim şekli, notlar…" /></Field>
        <Field label="Renk"><ColorPicker value={v.color} onChange={color => setV({...v, color})} swatches={PALETTE} /></Field>
      </form>
    </Dialog>
  );
}

export function toggleDone(t: Task) {
  update('task', t.id, {done: !t.done, completedAt: t.done ? null : Date.now()});
  if (!t.done) toast(`"${t.title}" tamamlandı.`, 'success', {label: 'Geri al', run: () => update('task', t.id, {done: false, completedAt: null})});
}

export function TaskRow({t, onOpen}: {t: Task; onOpen: () => void}) {
  const diff = daysBetween(todayIso(), t.dueDate);
  const Icon = CATEGORY[t.category].icon;
  return (
    <div className={`task-row card ${t.done ? 'is-done' : ''}`} style={{'--c': t.color} as React.CSSProperties}>
      <button type="button" className="task-check" aria-label={t.done ? 'Tamamlanmadı olarak işaretle' : 'Tamamlandı olarak işaretle'} aria-pressed={t.done} onClick={() => toggleDone(t)}>
        {t.done ? <CheckCircle2 size={24} /> : <Circle size={24} />}
      </button>
      <button type="button" className="task-main" onClick={onOpen}>
        <span className="task-title">{t.title}</span>
        <span className="task-meta">
          <Icon size={14} /> {CATEGORY[t.category].label}{t.course && ` · ${t.course}`} · {formatDate(t.dueDate, false)}{t.dueTime && ` ${t.dueTime}`}
        </span>
        {t.description && <span className="task-desc">{t.description}</span>}
      </button>
      {!t.done && <Badge tone={diff < 0 ? 'danger' : diff <= 1 ? 'warning' : t.category === 'exam' ? 'accent' : 'neutral'}>{relativeDay(t.dueDate)}</Badge>}
    </div>
  );
}

type Filter = 'all' | TaskCategory;

export function TasksPage() {
  const tasks = useList('task');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [showDone, setShowDone] = useState(false);
  const today = todayIso();
  const scoped = tasks.filter(t => filter === 'all' || t.category === filter);
  const open = scoped.filter(t => !t.done).sort((a, b) => (a.dueDate + (a.dueTime || '99')).localeCompare(b.dueDate + (b.dueTime || '99')));
  const done = scoped.filter(t => t.done).sort((a, b) => (b.completedAt || 0) - (a.completedAt || 0));
  const weekEnd = isoDate(addDays(new Date(), 7));
  const groups: [string, Task[]][] = [
    ['Gecikmiş', open.filter(t => t.dueDate < today)],
    ['Bugün', open.filter(t => t.dueDate === today)],
    ['Bu hafta', open.filter(t => t.dueDate > today && t.dueDate <= weekEnd)],
    ['Daha sonra', open.filter(t => t.dueDate > weekEnd)],
  ];
  const clearDone = async () => {
    if (!(await confirmDialog({title: 'Tamamlananlar silinsin mi?', message: `${done.length} tamamlanmış kayıt silinecek.`, confirmLabel: 'Sil', danger: true}))) return;
    for (const t of done) remove('task', t.id);
  };
  return (
    <div className="page">
      <PageHeader title="Ödevler & Sınavlar" subtitle={`${tasks.filter(t => !t.done).length} açık kayıt`} actions={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setDraft(newTask(undefined, filter === 'all' ? 'homework' : filter))}>Yeni kayıt</Button>} />
      <div className="toolbar-row">
        <Segmented label="Tür" value={filter} onChange={setFilter} options={[{value: 'all', label: 'Tümü'}, {value: 'homework', label: 'Ödevler'}, {value: 'exam', label: 'Sınavlar'}, {value: 'todo', label: 'Yapılacaklar'}]} />
      </div>
      {!scoped.length ? (
        <EmptyState icon={<ListChecks size={28} />} title="Kayıt yok" action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setDraft(newTask())}>Ödev, sınav veya yapılacak ekle</Button>}>Teslim tarihlerini ekle; gecikenler ve yaklaşanlar öne çıkar, takvimde görünür.</EmptyState>
      ) : (
        <div className="task-groups">
          {groups.filter(([, l]) => l.length).map(([name, items]) => (
            <section key={name}>
              <h3 className={`group-title ${name === 'Gecikmiş' ? 'is-danger' : ''}`}>{name} <span className="muted">{items.length}</span></h3>
              <div className="task-list">{items.map(t => <TaskRow key={t.id} t={t} onOpen={() => setDraft(t)} />)}</div>
            </section>
          ))}
          {!open.length && <p className="notice notice-success"><CheckCircle2 size={18} /> Açık kaydın kalmadı. Harika!</p>}
          {done.length > 0 && (
            <section>
              <div className="row">
                <button type="button" className="group-toggle" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>Tamamlananlar ({done.length})</button>
                <span className="spacer" />
                {showDone && <Button size="sm" variant="ghost" onClick={() => void clearDone()}>Tamamlananları sil</Button>}
              </div>
              {showDone && <div className="task-list">{done.map(t => <TaskRow key={t.id} t={t} onOpen={() => setDraft(t)} />)}</div>}
            </section>
          )}
        </div>
      )}
      <TaskDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
