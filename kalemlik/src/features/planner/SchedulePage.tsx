import {useEffect, useMemo, useState} from 'react';
import {AlertTriangle, BookOpen, CalendarClock, MapPin, Plus, Trash2, UserRound} from 'lucide-react';
import type {Lesson} from '@/lib/types';
import {PageHeader} from '@/app/Shell';
import {navigate} from '@/app/router';
import {Button, ColorPicker, Dialog, EmptyState, Field, Segmented, Switch} from '@/components/ui';
import {confirmDialog} from '@/components/feedback';
import {list, put, remove, useList} from '@/lib/store';
import {uuid} from '@/lib/ids';
import {DAYS, DAYS_SHORT, minutesOf, weekday} from '@/lib/format';
import {PALETTE} from '@/lib/constants';

type Draft = Omit<Lesson, 'rev' | 'createdAt' | 'updatedAt'>;
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

export function overlaps(a: Pick<Lesson, 'day' | 'start' | 'end' | 'id'>, all: Lesson[]) {
  return all.filter(l => l.id !== a.id && l.day === a.day && l.start < a.end && a.start < l.end);
}

export function LessonDialog({draft, onClose}: {draft: Draft | null; onClose: () => void}) {
  const [v, setV] = useState<Draft | null>(draft);
  const [error, setError] = useState('');
  useEffect(() => { setV(draft); setError(''); }, [draft]);
  if (!v) return null;
  const exists = !!list('lesson').find(l => l.id === v.id);
  const clash = overlaps(v, list('lesson'));
  const courses = [...new Set(list('notebook').map(n => n.course).filter(Boolean))];
  const save = () => {
    if (!v.title.trim()) { setError('Ders adını yaz.'); return; }
    if (v.end <= v.start) { setError('Bitiş saati başlangıçtan sonra olmalı.'); return; }
    put('lesson', {...v, title: v.title.trim()});
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={exists ? 'Dersi düzenle' : 'Ders ekle'} footer={<>
      {exists && <Button variant="ghost" icon={<Trash2 size={17} />} className="danger-text" onClick={async () => { if (await confirmDialog({title: 'Ders silinsin mi?', message: `"${v.title}" programdan kaldırılacak.`, confirmLabel: 'Sil', danger: true})) { remove('lesson', v.id); onClose(); } }}>Sil</Button>}
      <span className="spacer" />
      <Button variant="ghost" onClick={onClose}>Vazgeç</Button><Button variant="primary" onClick={save}>Kaydet</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label="Ders adı" htmlFor="ls-title" error={error && !v.title.trim() ? error : undefined}><input id="ls-title" className="input" list="ls-courses" value={v.title} maxLength={120} onChange={e => setV({...v, title: e.target.value})} placeholder="ör. Fizik II" /></Field>
        <datalist id="ls-courses">{courses.map(c => <option key={c} value={c} />)}</datalist>
        <Field label="Gün" htmlFor="ls-day"><select id="ls-day" className="select" value={v.day} onChange={e => setV({...v, day: Number(e.target.value)})}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></Field>
        <div className="grid-2">
          <Field label="Başlangıç" htmlFor="ls-start"><input id="ls-start" className="input" type="time" step={300} value={v.start} onChange={e => setV({...v, start: e.target.value})} /></Field>
          <Field label="Bitiş" htmlFor="ls-end" error={error && v.end <= v.start ? error : undefined}><input id="ls-end" className="input" type="time" step={300} value={v.end} onChange={e => setV({...v, end: e.target.value})} /></Field>
        </div>
        {clash.length > 0 && <p className="notice notice-warn"><AlertTriangle size={16} /> Bu saatte başka ders var: {clash.map(c => c.title).join(', ')}</p>}
        <div className="grid-2">
          <Field label="Derslik / sınıf" htmlFor="ls-room"><input id="ls-room" className="input" value={v.room} maxLength={80} onChange={e => setV({...v, room: e.target.value})} placeholder="ör. B-204" /></Field>
          <Field label="Öğretim görevlisi (isteğe bağlı)" htmlFor="ls-ins"><input id="ls-ins" className="input" value={v.instructor} maxLength={100} onChange={e => setV({...v, instructor: e.target.value})} /></Field>
        </div>
        <Field label="Renk"><ColorPicker value={v.color} onChange={color => setV({...v, color})} swatches={PALETTE} /></Field>
        <Field label="Not" htmlFor="ls-note"><textarea id="ls-note" className="textarea" value={v.note} maxLength={1000} onChange={e => setV({...v, note: e.target.value})} placeholder="ör. Haftada bir quiz, devam zorunlu" /></Field>
      </form>
    </Dialog>
  );
}

export function SchedulePage() {
  const lessons = useList('lesson');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [weekend, setWeekend] = useState(() => lessons.some(l => l.day >= 5));
  const [day, setDay] = useState(Math.min(weekday(new Date()), 6));
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(t); }, []);
  const days = weekend || lessons.some(l => l.day >= 5) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const {from, to} = useMemo(() => {
    const starts = lessons.map(l => minutesOf(l.start)), ends = lessons.map(l => minutesOf(l.end));
    return {from: Math.min(8 * 60, ...starts.map(m => Math.floor(m / 60) * 60)), to: Math.max(18 * 60, ...ends.map(m => Math.ceil(m / 60) * 60))};
  }, [lessons]);
  const hours = Array.from({length: (to - from) / 60}, (_, i) => from + i * 60);
  const PX = 64; // saat başına piksel
  const newLesson = (d = day, start = 9 * 60): Draft => ({id: uuid(), title: '', day: d, start: hhmm(start), end: hhmm(Math.min(start + 90, 23 * 60 + 55)), room: '', instructor: '', color: PALETTE[lessons.length % PALETTE.length], note: ''});
  const nowMin = now.getHours() * 60 + now.getMinutes(), today = weekday(now);
  const notebookFor = (l: Lesson) => list('notebook').find(n => n.trashedAt === null && (n.course === l.title || n.title === l.title));
  const totalHours = lessons.reduce((n, l) => n + (minutesOf(l.end) - minutesOf(l.start)), 0) / 60;

  const block = (l: Lesson) => {
    const top = ((minutesOf(l.start) - from) / 60) * PX, height = Math.max(28, ((minutesOf(l.end) - minutesOf(l.start)) / 60) * PX - 4);
    const live = l.day === today && nowMin >= minutesOf(l.start) && nowMin < minutesOf(l.end);
    const clash = overlaps(l, lessons).length > 0;
    return (
      <button key={l.id} type="button" className={`lesson-block ${live ? 'is-live' : ''} ${clash ? 'is-clash' : ''}`} style={{top, height, '--c': l.color} as React.CSSProperties} onClick={() => setDraft(l)} aria-label={`${l.title}, ${DAYS[l.day]} ${l.start}–${l.end}`}>
        <strong>{l.title}</strong>
        <span>{l.start}–{l.end}</span>
        {l.room && <span className="lesson-room">{l.room}</span>}
      </button>
    );
  };

  return (
    <div className="page page-wide">
      <PageHeader title="Ders Programı" subtitle={lessons.length ? `${lessons.length} ders · haftada ${totalHours.toLocaleString('tr', {maximumFractionDigits: 1})} saat` : 'Haftalık derslerini ekle'}
        actions={<><Switch label="Hafta sonu" checked={days.length === 7} onChange={setWeekend} /><Button variant="primary" icon={<Plus size={18} />} onClick={() => setDraft(newLesson())}>Ders ekle</Button></>} />
      {!lessons.length ? (
        <EmptyState icon={<CalendarClock size={28} />} title="Programın boş" action={<Button variant="primary" icon={<Plus size={18} />} onClick={() => setDraft(newLesson())}>İlk dersini ekle</Button>}>Derslerini gün ve saatiyle ekle; bugünkü dersler ana sayfada, hepsi takvimde görünür.</EmptyState>
      ) : (
        <>
          <div className="week card">
            <div className="week-head" style={{gridTemplateColumns: `56px repeat(${days.length}, 1fr)`}}>
              <span />
              {days.map(d => <span key={d} className={d === today ? 'is-today' : ''}>{DAYS[d]}</span>)}
            </div>
            <div className="week-body" style={{gridTemplateColumns: `56px repeat(${days.length}, 1fr)`, height: hours.length * PX}}>
              <div className="week-hours">{hours.map(h => <span key={h} style={{top: ((h - from) / 60) * PX}}>{hhmm(h)}</span>)}</div>
              {days.map(d => (
                <div key={d} className={`week-col ${d === today ? 'is-today' : ''}`} onDoubleClick={e => { const r = e.currentTarget.getBoundingClientRect(); const m = from + Math.floor(((e.clientY - r.top) / PX) * 2) * 30; setDraft(newLesson(d, m)); }}
                  style={{backgroundSize: `100% ${PX}px`}}>
                  {lessons.filter(l => l.day === d).map(block)}
                  {d === today && nowMin >= from && nowMin <= to && <div className="now-line" style={{top: ((nowMin - from) / 60) * PX}} />}
                </div>
              ))}
            </div>
            <p className="muted small week-hint">İpucu: boş bir saate çift tıklayarak o saate ders ekleyebilirsin.</p>
          </div>
          <div className="day-view">
            <Segmented label="Gün" size="sm" value={String(day)} onChange={v => setDay(Number(v))} options={[0, 1, 2, 3, 4, 5, 6].map(d => ({value: String(d), label: DAYS_SHORT[d]}))} />
            <div className="day-list">
              {lessons.filter(l => l.day === day).sort((a, b) => a.start.localeCompare(b.start)).map(l => {
                const nb = notebookFor(l);
                return (
                  <div key={l.id} className="day-item card" style={{'--c': l.color} as React.CSSProperties}>
                    <button type="button" className="day-item-main" onClick={() => setDraft(l)}>
                      <span className="day-time"><b>{l.start}</b><small>{l.end}</small></span>
                      <span className="day-text"><strong>{l.title}</strong>
                        <small>{l.room && <><MapPin size={13} /> {l.room} </>}{l.instructor && <><UserRound size={13} /> {l.instructor}</>}</small>
                        {l.note && <small className="muted">{l.note}</small>}
                      </span>
                    </button>
                    {nb && <Button size="sm" variant="soft" icon={<BookOpen size={16} />} onClick={() => navigate(`/defter/${nb.id}`)}>Defter</Button>}
                  </div>
                );
              })}
              {!lessons.some(l => l.day === day) && <p className="muted">{DAYS[day]} günü ders yok.</p>}
              <Button icon={<Plus size={17} />} onClick={() => setDraft(newLesson(day))}>{DAYS[day]} günü ders ekle</Button>
            </div>
          </div>
        </>
      )}
      <LessonDialog draft={draft} onClose={() => setDraft(null)} />
    </div>
  );
}
