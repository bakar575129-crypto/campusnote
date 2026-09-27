// Sınav çalışma planı: sınavı seç → konular, notlar, flashcardlar, quiz sonuçları ve çalışma geçmişine göre gün gün
// plan (Kalemlik AI ya da kural tabanlı). Plan düzenlenebilir; maddeler görev sistemine ve takvime eklenebilir.
import {useMemo, useState} from 'react';
import {ArrowLeft, CalendarPlus, CalendarRange, Check, Plus, Sparkles, Trash2, X} from 'lucide-react';
import {PageHeader} from '@/app/Shell';
import {navigate} from '@/app/router';
import {Badge, Button, Dialog, EmptyState, Field, ProgressBar} from '@/components/ui';
import {confirmDialog, toast} from '@/components/feedback';
import {list, update, useRecord} from '@/lib/store';
import {shortId} from '@/lib/ids';
import {addDays, daysBetween, formatDate, isoDate, relativeDay, todayIso} from '@/lib/format';
import type {PlanItem, StudyPlan} from '@/lib/types';
import {courseSource, allCourses} from './sources';
import {generatePlan, useAiStatus} from './generate';
import {addPlanToTasks, createPlan, deletePlan, togglePlanItem} from './actions';

const KIND = {study: 'Çalış', review: 'Tekrar', quiz: 'Quiz', rest: 'Dinlen'};

/** Plan için konu önerileri: dersin defter başlıkları, deste konuları ve zayıf quiz konuları. */
function suggestTopics(course: string) {
  const c = course.toLocaleLowerCase('tr');
  const same = (x: string) => !!c && x.toLocaleLowerCase('tr') === c;
  const weak = list('quiz').filter(q => q.result && (same(q.course) || !c)).flatMap(q => q.result!.weakTopics);
  const deckTopics = list('card').filter(card => { const d = list('deck').find(x => x.id === card.deckId); return d && same(d.course); }).map(x => x.topic);
  const notebooks = list('notebook').filter(n => n.trashedAt === null && same(n.course)).map(n => n.title);
  const topics = [...new Set([...weak, ...deckTopics, ...notebooks].map(t => t.trim()).filter(t => t && t !== 'Genel'))];
  // Konu azsa dersin kart terimleri de eklenir (ör. Mitoz, Mayoz…): plan her gün aynı başlığı tekrarlamasın.
  if (topics.length < 6) {
    const terms = list('card').filter(card => { const d = list('deck').find(x => x.id === card.deckId); return d && same(d.course); }).map(x => x.front.replace(/\?$/, '').trim()).filter(t => t.length <= 60);
    for (const t of terms) if (!topics.includes(t)) topics.push(t);
  }
  return topics.slice(0, 20);
}

export function PlanDialog({onClose, examTaskId}: {onClose: () => void; examTaskId?: string}) {
  const ai = useAiStatus();
  const today = todayIso();
  const exams = list('task').filter(t => t.category === 'exam' && !t.done && t.dueDate > today).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const [examId, setExamId] = useState(examTaskId || exams[0]?.id || '');
  const exam = exams.find(e => e.id === examId);
  const [title, setTitle] = useState(exam?.title || '');
  const [course, setCourse] = useState(exam?.course || '');
  const [examDate, setExamDate] = useState(exam?.dueDate || isoDate(addDays(new Date(), 14)));
  const [minutes, setMinutes] = useState(60);
  const [topicsText, setTopicsText] = useState(suggestTopics(exam?.course || '').join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickExam = (id: string) => {
    setExamId(id);
    const e = exams.find(x => x.id === id);
    if (e) { setTitle(e.title); setCourse(e.course); setExamDate(e.dueDate); setTopicsText(suggestTopics(e.course).join('\n')); }
  };
  const days = daysBetween(today, examDate);
  const run = async () => {
    setError('');
    if (!title.trim()) { setError('Sınavın adını yaz.'); return; }
    if (days < 1) { setError('Sınav tarihi bugünden sonra olmalı.'); return; }
    setBusy(true);
    try {
      const topics = topicsText.split('\n').map(t => t.trim()).filter(Boolean).slice(0, 80);
      const src = course ? await courseSource(course) : undefined;
      const res = await generatePlan({examTitle: title.trim(), course: course.trim(), examDate, startDate: today, minutesPerDay: minutes, topics}, src && src.text ? src : undefined);
      const plan = createPlan({title: `${title.trim()} çalışma planı`, course: course.trim(), examDate, examTaskId: examId && exam ? examId : '', items: res.data.items});
      toast(`${res.data.items.length} günlük plan hazır.${res.note ? ' ' + res.note : ''}`, res.via === 'ai' ? 'success' : 'info');
      onClose();
      navigate(`/calisma/plan/${plan.id}${res.data.advice ? `?oneri=${encodeURIComponent(res.data.advice)}` : ''}`);
    } catch (e) { setError(e instanceof Error ? e.message : 'Plan oluşturulamadı.'); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={() => !busy && onClose()} title={<span className="row"><CalendarRange size={20} /> Sınav çalışma planı</span>} footer={<>
      <span className="muted small">{ai?.configured ? <><Sparkles size={14} /> Kalemlik AI</> : 'Kural tabanlı'}</span>
      <span className="spacer" />
      <Button variant="ghost" onClick={onClose} disabled={busy}>Vazgeç</Button>
      <Button variant="primary" onClick={() => void run()} busy={busy} icon={<Sparkles size={17} />}>{busy ? 'Hazırlanıyor…' : 'Planı oluştur'}</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); void run(); }}>
        {exams.length > 0 && (
          <Field label="Sınav" htmlFor="pl-exam">
            <select id="pl-exam" className="select" value={examId} onChange={e => pickExam(e.target.value)}>
              {exams.map(e => <option key={e.id} value={e.id}>{e.title}{e.course ? ` · ${e.course}` : ''} · {formatDate(e.dueDate, false)}</option>)}
              <option value="">Başka bir sınav…</option>
            </select>
          </Field>
        )}
        <div className="grid-2">
          <Field label="Sınav adı" htmlFor="pl-title"><input id="pl-title" className="input" value={title} maxLength={140} onChange={e => setTitle(e.target.value)} placeholder="ör. Matematik Final" /></Field>
          <Field label="Ders" htmlFor="pl-course"><input id="pl-course" className="input" list="pl-courses" value={course} maxLength={120} onChange={e => { setCourse(e.target.value); if (!topicsText.trim()) setTopicsText(suggestTopics(e.target.value).join('\n')); }} /></Field>
          <datalist id="pl-courses">{allCourses().map(c => <option key={c} value={c} />)}</datalist>
          <Field label="Sınav tarihi" htmlFor="pl-date" hint={days > 0 ? `${days} gün kaldı` : undefined}><input id="pl-date" className="input" type="date" min={isoDate(addDays(new Date(), 1))} value={examDate} onChange={e => setExamDate(e.target.value)} /></Field>
          <Field label="Günlük çalışma (dk)" htmlFor="pl-min"><input id="pl-min" className="input" type="number" min={15} max={600} step={15} value={minutes} onChange={e => setMinutes(Math.max(15, Math.min(600, Number(e.target.value) || 60)))} /></Field>
        </div>
        <Field label="Konu başlıkları (her satıra bir konu)" htmlFor="pl-topics" hint="Defterlerinden, flashcard konularından ve zayıf quiz konularından önerildi; düzenleyebilirsin.">
          <textarea id="pl-topics" className="textarea" rows={5} value={topicsText} onChange={e => setTopicsText(e.target.value)} placeholder={'Türev\nİntegral\nLimit'} />
        </Field>
        {error && <p className="notice notice-danger" role="alert">{error}</p>}
      </form>
    </Dialog>
  );
}

export function PlanPage({id, advice}: {id: string; advice?: string}) {
  const plan = useRecord('studyPlan', id);
  const [edit, setEdit] = useState<PlanItem | null>(null);
  const byDay = useMemo(() => {
    const m = new Map<string, PlanItem[]>();
    for (const i of [...(plan?.items || [])].sort((a, b) => a.date.localeCompare(b.date))) m.set(i.date, [...(m.get(i.date) || []), i]);
    return [...m.entries()];
  }, [plan?.items]);
  if (!plan) return <div className="page"><EmptyState icon={<X size={28} />} title="Plan bulunamadı" action={<Button onClick={() => navigate('/calisma?bolum=plans')}>Planlara dön</Button>} /></div>;
  const today = todayIso();
  const doneN = plan.items.filter(i => i.done).length;
  const linked = plan.items.filter(i => i.taskId).length;
  const addItem = () => setEdit({id: shortId(), date: today < plan.examDate ? today : plan.examDate, topic: '', minutes: 45, kind: 'study', done: false, taskId: ''});
  return (
    <div className="page page-narrow">
      <button type="button" className="back-link" onClick={() => navigate('/calisma?bolum=plans')}><ArrowLeft size={18} /> Planlar</button>
      <PageHeader title={plan.title} subtitle={`${plan.course ? plan.course + ' · ' : ''}Sınav ${formatDate(plan.examDate)} (${relativeDay(plan.examDate)})`} actions={<>
        <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={async () => {
          if (!(await confirmDialog({title: 'Plan silinsin mi?', message: linked ? 'Plandan oluşturulan görevler de silinsin mi? "Sil" hem planı hem görevleri siler.' : 'Plan silinecek.', confirmLabel: 'Sil', danger: true}))) return;
          deletePlan(plan, true); navigate('/calisma?bolum=plans');
        }}>Sil</Button>
        <Button icon={<Plus size={17} />} onClick={addItem}>Madde ekle</Button>
        <Button variant="primary" icon={<CalendarPlus size={17} />} disabled={linked === plan.items.filter(i => i.kind !== 'rest').length} onClick={() => { const n = addPlanToTasks(plan); toast(`${n} çalışma görevi görevlere ve takvime eklendi.`, 'success'); }}>{linked ? 'Görevler eklendi' : 'Görevlere ekle'}</Button>
      </>} />
      {advice && <p className="notice"><Sparkles size={18} /> {advice}</p>}
      <div className="card card-pad stack">
        <div className="row"><strong>{doneN}/{plan.items.length} görev tamamlandı</strong><span className="spacer" />{plan.completedAt && <Badge tone="success">Plan tamamlandı 🎉</Badge>}</div>
        <ProgressBar value={doneN} max={Math.max(1, plan.items.length)} label="Plan ilerlemesi" />
      </div>
      <div className="plan-days">
        {byDay.map(([date, items]) => (
          <section key={date} className={`plan-day ${date === today ? 'is-today' : ''} ${date < today ? 'is-past' : ''}`}>
            <h3 className="group-title">{formatDate(date)} <span className="muted">{relativeDay(date)}</span></h3>
            {items.map(i => (
              <div key={i.id} className={`card plan-item ${i.done ? 'is-done' : ''}`}>
                <button type="button" className="task-check" aria-pressed={i.done} aria-label={i.done ? 'Yapılmadı olarak işaretle' : 'Yapıldı olarak işaretle'} onClick={() => togglePlanItem(plan, i.id)}>{i.done ? <Check size={20} /> : <span className="check-empty" />}</button>
                <button type="button" className="plan-item-main" onClick={() => setEdit(i)}>
                  <strong>{i.topic}</strong><span className="muted small">{KIND[i.kind]} · {i.minutes} dk{i.taskId ? ' · görevlerde' : ''}</span>
                </button>
              </div>
            ))}
          </section>
        ))}
      </div>
      {edit && <PlanItemDialog plan={plan} item={edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function PlanItemDialog({plan, item, onClose}: {plan: StudyPlan; item: PlanItem; onClose: () => void}) {
  const [v, setV] = useState(item);
  const exists = plan.items.some(i => i.id === item.id);
  const save = () => {
    if (!v.topic.trim()) return;
    const items = exists ? plan.items.map(i => (i.id === v.id ? {...v, topic: v.topic.trim()} : i)) : [...plan.items, {...v, topic: v.topic.trim()}];
    update('studyPlan', plan.id, {items});
    if (v.taskId && list('task').some(t => t.id === v.taskId)) update('task', v.taskId, {title: `${v.topic.trim()} (${v.minutes} dk)`, dueDate: v.date});
    onClose();
  };
  return (
    <Dialog open onClose={onClose} title={exists ? 'Maddeyi düzenle' : 'Yeni madde'} footer={<>
      {exists && <Button variant="ghost" className="danger-text" icon={<Trash2 size={17} />} onClick={() => { update('studyPlan', plan.id, {items: plan.items.filter(i => i.id !== item.id)}); onClose(); }}>Sil</Button>}
      <span className="spacer" />
      <Button variant="primary" onClick={save} disabled={!v.topic.trim()}>Kaydet</Button>
    </>}>
      <form className="stack" onSubmit={e => { e.preventDefault(); save(); }}>
        <Field label="Ne çalışılacak?" htmlFor="pi-topic"><input id="pi-topic" className="input" value={v.topic} maxLength={200} onChange={e => setV({...v, topic: e.target.value})} autoFocus /></Field>
        <div className="grid-2">
          <Field label="Gün" htmlFor="pi-date"><input id="pi-date" className="input" type="date" value={v.date} onChange={e => setV({...v, date: e.target.value || v.date})} /></Field>
          <Field label="Süre (dk)" htmlFor="pi-min"><input id="pi-min" className="input" type="number" min={5} max={600} step={5} value={v.minutes} onChange={e => setV({...v, minutes: Math.max(5, Math.min(600, Number(e.target.value) || 30))})} /></Field>
        </div>
        <Field label="Tür" htmlFor="pi-kind"><select id="pi-kind" className="select" value={v.kind} onChange={e => setV({...v, kind: e.target.value as PlanItem['kind']})}>{Object.entries(KIND).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </form>
    </Dialog>
  );
}
