// 📓 Günlük: her güne bir sayfa (başlık, metin, ruh hâli). Yazdıkça cihaza kaydedilir, arka planda eşitlenir.
import {useEffect, useRef, useState} from 'react';
import {ChevronLeft, ChevronRight, NotebookPen, Trash2} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate, useLocation} from '@/app/router';
import {Button, IconButton} from '@/components/ui';
import {confirmDialog} from '@/components/feedback';
import {put, remove, useList} from '@/lib/store';
import {uuid} from '@/lib/ids';
import {addDays, formatDate, isoDate, parseIso, relativeDay, todayIso} from '@/lib/format';

const MOODS = [{id: 'great', e: '🤩', l: 'Harika'}, {id: 'happy', e: '😊', l: 'İyi'}, {id: 'ok', e: '😐', l: 'Normal'}, {id: 'tired', e: '😴', l: 'Yorgun'}, {id: 'sad', e: '😔', l: 'Üzgün'}, {id: 'stressed', e: '😰', l: 'Stresli'}];

export function JournalPage() {
  const {query} = useLocation();
  const entries = useList('journal');
  const [day, setDay] = useState(/^\d{4}-\d{2}-\d{2}$/.test(query.get('gun') || '') ? query.get('gun')! : todayIso());
  const entry = entries.find(e => e.day === day);
  const [title, setTitle] = useState(entry?.title || '');
  const [body, setBody] = useState(entry?.body || '');
  const idRef = useRef(entry?.id || uuid());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const e = entries.find(x => x.day === day);
    idRef.current = e?.id || uuid();
    setTitle(e?.title || ''); setBody(e?.body || '');
    navigate(`/gunluk?gun=${day}`, {replace: true});
    if (query.get('yeni')) setTimeout(() => area.current?.focus(), 50);
  }, [day]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = (patch: {title?: string; body?: string; mood?: string}) => {
    const cur = entries.find(x => x.id === idRef.current);
    const next = {title: patch.title ?? title, body: patch.body ?? body, mood: patch.mood ?? cur?.mood ?? ''};
    if (!cur && !next.title.trim() && !next.body.trim() && !next.mood) return;
    put('journal', {id: idRef.current, day, ...next});
  };
  const later = (patch: {title?: string; body?: string}) => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => save(patch), 600); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const past = [...entries].filter(e => e.day !== day).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 30);
  const mood = entries.find(x => x.id === idRef.current)?.mood || '';
  return (
    <div className="page page-narrow">
      <PageHeader title="Günlük" subtitle="Bugün neler öğrendin, nasıl hissettin? Kısa bir not bile yeter." />
      <div className="row journal-nav">
        <IconButton label="Önceki gün" onClick={() => setDay(isoDate(addDays(parseIso(day), -1)))}><ChevronLeft size={20} /></IconButton>
        <strong>{formatDate(day)}</strong><span className="muted small">{relativeDay(day)}</span>
        <IconButton label="Sonraki gün" disabled={day >= todayIso()} onClick={() => setDay(isoDate(addDays(parseIso(day), 1)))}><ChevronRight size={20} /></IconButton>
        <span className="spacer" />
        {day !== todayIso() && <Button size="sm" variant="ghost" onClick={() => setDay(todayIso())}>Bugün</Button>}
      </div>
      <div className="card card-pad stack journal-card">
        <div className="chip-row" role="radiogroup" aria-label="Ruh hâli">
          {MOODS.map(m => <button key={m.id} type="button" role="radio" aria-checked={mood === m.id} className={`chip mood ${mood === m.id ? 'is-on' : ''}`} onClick={() => save({mood: mood === m.id ? '' : m.id})}><span aria-hidden="true">{m.e}</span>{m.l}</button>)}
        </div>
        <input className="input journal-title" value={title} maxLength={160} placeholder="Başlık (isteğe bağlı)" onChange={e => { setTitle(e.target.value); later({title: e.target.value}); }} onBlur={() => save({title})} aria-label="Başlık" />
        <textarea ref={area} className="textarea journal-body" rows={12} value={body} maxLength={100000} placeholder="Bugün derste…" onChange={e => { setBody(e.target.value); later({body: e.target.value}); }} onBlur={() => save({body})} aria-label="Günlük" />
        {entries.some(x => x.id === idRef.current) && <div className="row"><span className="muted small">Otomatik kaydedildi</span><span className="spacer" /><Button size="sm" variant="ghost" className="danger-text" icon={<Trash2 size={15} />} onClick={async () => { if (await confirmDialog({title: 'Bu günün yazısı silinsin mi?', message: formatDate(day), confirmLabel: 'Sil', danger: true})) { remove('journal', idRef.current); idRef.current = uuid(); setTitle(''); setBody(''); } }}>Sil</Button></div>}
      </div>
      {past.length > 0 && (
        <section className="stack-tight">
          <h3 className="group-title">Önceki günler</h3>
          {past.map(e => (
            <button key={e.id} type="button" className="card list-row" onClick={() => setDay(e.day)}>
              <span className="stat-icon"><NotebookPen size={18} /></span>
              <span className="list-row-main"><strong>{MOODS.find(m => m.id === e.mood)?.e || ''} {e.title || formatDate(e.day)}</strong><span className="muted small clamp-2">{e.body || '—'}</span></span>
              <span className="muted small">{formatDate(e.day, false)}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
